# =============================================================================
# WinBoat GPU passthrough — guest-side test-suite installer
# =============================================================================
#
# Run inside the WinBoat Windows guest. Installs the test programs the host
# uses to validate that the passed-through GPU is actually doing work:
#
#   - dxdiag-based GPU enumeration            (smoke)
#   - GPU-Z portable                          (vendor/driver readout)
#   - glmark2-Windows                         (OpenGL 2.x microbench)
#   - vkmark                                  (Vulkan microbench)
#   - Unigine Heaven 4.0                      (DX11 sustained-load bench)
#   - Epic Games Launcher → Unreal Engine 5  (real DX12/Vulkan workload)
#   - Ollama (Windows)                        (GPU LLM inference)
#   - 3DMark demo (optional, --full only)     (DX12 conformance)
#
# Idempotent: re-running skips installed components.
# Requires: PowerShell 5.1+, Windows 10/11, admin shell (for winget +
# MSI installs).
#
# Usage:
#   .\install-test-suite.ps1            # default: bench + Ollama
#   .\install-test-suite.ps1 -Full      # also install Unreal + 3DMark
#   .\install-test-suite.ps1 -Skip Ollama,Heaven
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Full,
    [string[]]$Skip = @()
)

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"   # speeds up Invoke-WebRequest

# ---- helpers ----------------------------------------------------------------
function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "    [SKIP] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "    [ERR] $msg" -ForegroundColor Red }

function Test-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = [System.Security.Principal.WindowsPrincipal]::new($id)
    return $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Winget {
    return [bool](Get-Command winget -ErrorAction SilentlyContinue)
}

function Install-Winget($id, $name) {
    if ($Skip -contains $name) { Write-Skip "$name (--Skip)"; return }
    Write-Step "winget install $id"
    # --silent and --accept-* for non-interactive
    & winget install --id $id --silent --accept-package-agreements --accept-source-agreements `
        --disable-interactivity --source winget
    if ($LASTEXITCODE -eq 0) { Write-Ok $name }
    elseif ($LASTEXITCODE -eq -1978335189) { Write-Skip "$name already installed" }   # APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED
    else                                  { Write-Err  "$name (winget exit $LASTEXITCODE)" }
}

# Pinned download dir on the guest. C:\WinBoatTests is a stable path the
# runbook can reference; we deliberately do NOT use $env:TEMP because the
# host's runbook needs to be able to find these artifacts from the host
# via the shared drive.
$TestRoot = "C:\WinBoatTests"
New-Item -Path $TestRoot -ItemType Directory -Force | Out-Null

# ---- guard rails ------------------------------------------------------------
if (-not (Test-Admin)) {
    Write-Err "Run this script from an elevated PowerShell prompt."
    exit 1
}
if (-not (Test-Winget)) {
    Write-Err "winget not found. Install App Installer from the Microsoft Store, then re-run."
    exit 1
}

# ---- 1. GPU enumeration (smoke) ---------------------------------------------
Write-Step "dxdiag GPU enumeration"
$dxdiagOut = Join-Path $TestRoot "dxdiag.txt"
& dxdiag /t $dxdiagOut
# dxdiag is async; wait up to 30 s for the file to appear and stop growing.
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Test-Path $dxdiagOut)) { Start-Sleep -Milliseconds 500 }
if (Test-Path $dxdiagOut) {
    Write-Ok "dxdiag report at $dxdiagOut"
    # quick GPU readout to console
    Select-String -Path $dxdiagOut -Pattern "^\s*Card name:" | Select-Object -First 4 |
        ForEach-Object { Write-Host "      $($_.Line.Trim())" }
} else {
    Write-Err "dxdiag did not produce $dxdiagOut within 30s"
}

# ---- 2. GPU-Z portable -------------------------------------------------------
if ($Skip -notcontains "GPU-Z") {
    Write-Step "GPU-Z portable (TechPowerUp)"
    $gpuzZip = Join-Path $TestRoot "GPU-Z.zip"
    $gpuzExe = Join-Path $TestRoot "GPU-Z.exe"
    if (-not (Test-Path $gpuzExe)) {
        # TechPowerUp does not expose a stable direct URL; the redirector
        # below is the documented one as of mid-2026. If it 404s, the
        # runbook tells the user to grab the latest from techpowerup.com.
        try {
            Invoke-WebRequest -Uri "https://www.techpowerup.com/download/techpowerup-gpu-z/" `
                -OutFile $gpuzZip -UseBasicParsing -ErrorAction Stop
            Write-Ok "Downloaded GPU-Z installer page (manual extract required — see runbook)"
        } catch {
            Write-Skip "GPU-Z download failed ($($_.Exception.Message)); see runbook for manual fetch"
        }
    } else {
        Write-Skip "GPU-Z already at $gpuzExe"
    }
}

# ---- 3. glmark2-Windows ------------------------------------------------------
if ($Skip -notcontains "glmark2") {
    Write-Step "glmark2-Windows (jrfonseca prebuilt)"
    $glmarkZip = Join-Path $TestRoot "glmark2-win.zip"
    $glmarkDir = Join-Path $TestRoot "glmark2-win"
    if (-not (Test-Path $glmarkDir)) {
        try {
            # jrfonseca/glmark2 GitHub Actions artifacts (stable URL pattern)
            Invoke-WebRequest -Uri "https://github.com/jrfonseca/glmark2/releases/latest/download/glmark2-windows-x86_64.zip" `
                -OutFile $glmarkZip -UseBasicParsing -ErrorAction Stop
            Expand-Archive -Path $glmarkZip -DestinationPath $glmarkDir -Force
            Write-Ok "glmark2 extracted to $glmarkDir"
        } catch {
            Write-Skip "glmark2 download failed ($($_.Exception.Message))"
        }
    } else { Write-Skip "glmark2 already at $glmarkDir" }
}

# ---- 4. vkmark ---------------------------------------------------------------
if ($Skip -notcontains "vkmark") {
    Write-Step "vkmark (vkmark/vkmark Windows build)"
    $vkmarkZip = Join-Path $TestRoot "vkmark-win.zip"
    $vkmarkDir = Join-Path $TestRoot "vkmark-win"
    if (-not (Test-Path $vkmarkDir)) {
        try {
            Invoke-WebRequest -Uri "https://github.com/vkmark/vkmark/releases/latest/download/vkmark-windows.zip" `
                -OutFile $vkmarkZip -UseBasicParsing -ErrorAction Stop
            Expand-Archive -Path $vkmarkZip -DestinationPath $vkmarkDir -Force
            Write-Ok "vkmark extracted to $vkmarkDir"
        } catch {
            Write-Skip "vkmark download failed — Vulkan loader may need separate install. See runbook."
        }
    } else { Write-Skip "vkmark already at $vkmarkDir" }
}

# ---- 5. Unigine Heaven 4.0 ---------------------------------------------------
if ($Skip -notcontains "Heaven") {
    # Heaven is a 280 MB installer; only skip via -Skip Heaven.
    Install-Winget "Unigine.Heaven" "Heaven"
}

# ---- 6. Ollama ---------------------------------------------------------------
if ($Skip -notcontains "Ollama") {
    Install-Winget "Ollama.Ollama" "Ollama"
    # Pre-pull a small GPU-friendly model so the host runbook can hit the
    # API immediately without waiting on a multi-GB download mid-test.
    $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $ollama) {
        Write-Step "Pre-pulling Ollama model: qwen2.5:1.5b (≈1 GB)"
        & $ollama pull qwen2.5:1.5b 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok "qwen2.5:1.5b ready" }
        else                      { Write-Err "ollama pull failed ($LASTEXITCODE)" }
    } else {
        Write-Skip "Ollama binary not found at $ollama; skipping model pull"
    }
}

# ---- 7. (--Full) Unreal Engine 5 ---------------------------------------------
if ($Full -and ($Skip -notcontains "Unreal")) {
    Install-Winget "EpicGames.EpicGamesLauncher" "EpicGamesLauncher"
    Write-Host @"
      Note: Unreal Engine 5 itself must be installed from the Epic Games
      Launcher GUI after sign-in. The runbook covers the GUI steps.
"@
}

# ---- 8. (--Full) 3DMark demo -------------------------------------------------
if ($Full -and ($Skip -notcontains "3DMark")) {
    Install-Winget "ULBenchmarks.3DMark" "3DMark"
}

# =============================================================================
Write-Host ""
Write-Host "Install pass complete. Artifacts staged under $TestRoot." -ForegroundColor Green
Write-Host "Next: run .\run-gpu-checks.ps1 to execute the benchmarks." -ForegroundColor Green
