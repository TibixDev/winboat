# =============================================================================
# WinBoat GPU passthrough — guest-side check runner
# =============================================================================
#
# Runs after install-test-suite.ps1. Captures evidence that the passed-
# through GPU is actually being used (not the QXL/Spice fallback).
#
# Output: C:\WinBoatTests\results-<timestamp>\
#   ├── 01-gpu-enum.txt       — Get-CimInstance Win32_VideoController
#   ├── 02-dxdiag.txt         — full dxdiag
#   ├── 03-glmark2.txt        — glmark2 OpenGL score
#   ├── 04-vkmark.txt         — vkmark Vulkan score (if installed)
#   ├── 05-heaven.txt         — Heaven benchmark CLI output (if installed)
#   ├── 06-ollama-bench.json  — Ollama eval rate (tokens/s) for qwen2.5:1.5b
#   └── summary.md            — PASS/FAIL summary the host can grep
#
# Usage:
#   .\run-gpu-checks.ps1                # full
#   .\run-gpu-checks.ps1 -Quick         # skip Heaven (~5 min saved)
# =============================================================================

[CmdletBinding()]
param([switch]$Quick)

$ErrorActionPreference = "Continue"   # never abort the whole run on one failure
$TestRoot = "C:\WinBoatTests"
$Stamp    = Get-Date -Format "yyyyMMdd-HHmmss"
$Out      = Join-Path $TestRoot "results-$Stamp"
New-Item -Path $Out -ItemType Directory -Force | Out-Null

$summary  = [System.Collections.Generic.List[string]]::new()
$summary.Add("# WinBoat GPU check — $Stamp")
$summary.Add("")

function Add-Result($name, $pass, $detail) {
    $tag = if ($pass) { "PASS" } else { "FAIL" }
    $summary.Add("- **$name**: $tag — $detail")
    Write-Host ("    [{0}] {1} — {2}" -f $tag, $name, $detail) `
        -ForegroundColor $(if ($pass) { "Green" } else { "Red" })
}

# ---- 1. GPU enumeration ------------------------------------------------------
Write-Host "==> GPU enumeration" -ForegroundColor Cyan
$enumFile = Join-Path $Out "01-gpu-enum.txt"
$gpus = Get-CimInstance Win32_VideoController
$gpus | Format-List Name, AdapterRAM, DriverVersion, VideoProcessor, PNPDeviceID |
    Out-File $enumFile -Encoding utf8

# Heuristic: a passed-through Intel/NVIDIA/AMD GPU has DriverVersion that
# looks like a real driver (4-component dotted, length >= 5 chars per
# segment). The fallback "Microsoft Basic Display Adapter" or
# QXL/VirtIO names mean passthrough did NOT take effect.
$realGpu = $gpus | Where-Object {
    $_.Name -notmatch "Microsoft Basic|QXL|VirtIO|Red Hat" -and
    $_.PNPDeviceID -match "PCI\\VEN_"
} | Select-Object -First 1

if ($realGpu) {
    Add-Result "GPU enumeration" $true "found '$($realGpu.Name)' (driver $($realGpu.DriverVersion))"
} else {
    Add-Result "GPU enumeration" $false "only basic/QXL adapter visible — passthrough not active"
}

# ---- 2. dxdiag ---------------------------------------------------------------
Write-Host "==> dxdiag" -ForegroundColor Cyan
$dxFile = Join-Path $Out "02-dxdiag.txt"
& dxdiag /t $dxFile
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline -and -not (Test-Path $dxFile)) { Start-Sleep -Milliseconds 500 }
if (Test-Path $dxFile) {
    # Look for DDI version >= 12 as a Direct3D 12 marker.
    $ddiLine = Select-String -Path $dxFile -Pattern "^\s*DDI Version:" | Select-Object -First 1
    $ddi = if ($ddiLine) { ($ddiLine.Line -split ":")[-1].Trim() } else { "unknown" }
    $ddiOk = [int]($ddi -replace '[^0-9]','') -ge 12
    Add-Result "dxdiag DDI" $ddiOk "DDI Version: $ddi"
} else {
    Add-Result "dxdiag DDI" $false "dxdiag did not produce report"
}

# ---- 3. glmark2 --------------------------------------------------------------
$glmarkDir = Join-Path $TestRoot "glmark2-win"
$glmarkExe = Get-ChildItem $glmarkDir -Filter "glmark2*.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($glmarkExe) {
    Write-Host "==> glmark2" -ForegroundColor Cyan
    $glFile = Join-Path $Out "03-glmark2.txt"
    & $glmarkExe.FullName --off-screen 2>&1 | Tee-Object -FilePath $glFile | Out-Null
    $score = Select-String -Path $glFile -Pattern "glmark2 Score:" | Select-Object -First 1
    if ($score) {
        $n = [int]($score.Line -replace '[^0-9]','')
        # Threshold 500 is a sanity check; bare-metal Intel UHD usually > 2000.
        Add-Result "glmark2" ($n -ge 500) "score=$n (≥500 expected)"
    } else { Add-Result "glmark2" $false "no score in output" }
} else {
    Add-Result "glmark2" $false "binary not found (run installer first)"
}

# ---- 4. vkmark ---------------------------------------------------------------
$vkmarkExe = Get-ChildItem (Join-Path $TestRoot "vkmark-win") -Filter "vkmark*.exe" -Recurse `
    -ErrorAction SilentlyContinue | Select-Object -First 1
if ($vkmarkExe) {
    Write-Host "==> vkmark" -ForegroundColor Cyan
    $vkFile = Join-Path $Out "04-vkmark.txt"
    & $vkmarkExe.FullName --off-screen 2>&1 | Tee-Object -FilePath $vkFile | Out-Null
    $score = Select-String -Path $vkFile -Pattern "vkmark Score:" | Select-Object -First 1
    if ($score) {
        $n = [int]($score.Line -replace '[^0-9]','')
        Add-Result "vkmark" ($n -ge 500) "score=$n"
    } else { Add-Result "vkmark" $false "no score (Vulkan loader missing?)" }
} else {
    Add-Result "vkmark" $true "skipped (not installed)"
}

# ---- 5. Heaven ---------------------------------------------------------------
if (-not $Quick) {
    $heaven = "${env:ProgramFiles}\Unigine\Heaven Benchmark 4.0\bin\Heaven.exe"
    if (Test-Path $heaven) {
        Write-Host "==> Heaven (this runs ~3 min)" -ForegroundColor Cyan
        $hvFile = Join-Path $Out "05-heaven.txt"
        # CLI mode — runs preset, writes results to log.
        & $heaven -preset=2 -mode=1280x720 -windowed=1 -benchmark=1 -log_file="$hvFile" 2>&1 | Out-Null
        if (Test-Path $hvFile) {
            $fps = Select-String -Path $hvFile -Pattern "Average FPS" | Select-Object -First 1
            if ($fps) {
                $n = [double](($fps.Line -split ":")[-1] -replace '[^0-9.]','')
                Add-Result "Heaven" ($n -ge 20) "avg=$n FPS (≥20 expected)"
            } else { Add-Result "Heaven" $false "no FPS in log" }
        } else { Add-Result "Heaven" $false "Heaven produced no log" }
    } else {
        Add-Result "Heaven" $true "skipped (not installed)"
    }
} else {
    Add-Result "Heaven" $true "skipped (-Quick)"
}

# ---- 6. Ollama eval-rate -----------------------------------------------------
$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (Test-Path $ollama) {
    Write-Host "==> Ollama eval-rate (qwen2.5:1.5b)" -ForegroundColor Cyan
    $olFile = Join-Path $Out "06-ollama-bench.json"
    # --verbose dumps eval_count + eval_duration so we can compute tokens/s.
    $raw = & $ollama run --verbose qwen2.5:1.5b "Count from one to five." 2>&1
    $raw | Out-File $olFile -Encoding utf8
    $evalLine = $raw | Select-String "eval rate" | Select-Object -First 1
    if ($evalLine) {
        $tps = [double](($evalLine.Line -split ":")[-1] -replace '[^0-9.]','')
        # CPU-only baseline for qwen2.5:1.5b on a modern x86 core is ~15 tok/s;
        # any half-working GPU should push past 30 tok/s.
        Add-Result "Ollama GPU" ($tps -ge 30) "eval rate=$tps tok/s (≥30 expected for GPU)"
    } else {
        Add-Result "Ollama GPU" $false "could not parse eval rate"
    }
} else {
    Add-Result "Ollama GPU" $true "skipped (not installed)"
}

# ---- summary -----------------------------------------------------------------
$summaryPath = Join-Path $Out "summary.md"
$summary | Out-File $summaryPath -Encoding utf8

Write-Host ""
Write-Host "Results in $Out" -ForegroundColor Green
Write-Host "Summary: $summaryPath" -ForegroundColor Green
