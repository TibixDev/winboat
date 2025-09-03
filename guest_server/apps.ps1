#Requires -Version 5.1
#Requires -RunAsAdministrator

#------------------------------------------------------------------------------
# WinBoat Application Discovery Script
#
# Purpose: Detects installed applications (System, Registry, Start Menu,
#          UWP, Chocolatey, Scoop) within a Windows KVM guest and outputs
#          them as a JSON list for the WinBoat host.
#------------------------------------------------------------------------------

# --- Setup ---
# Load System.Drawing for icon extraction, suppress errors if already loaded
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

# Default fallback icon (32x32 transparent PNG) if extraction fails
$defaultIconBase64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAASZQTFRFAAAA+vr65ubm4uLkhYmLvL7A7u7w+/r729vb4eHjFYPbFoTa5eXnGIbcG4jc+fn7Gofc7+/x7OzuF4Xb+fn54uLiC37Z5OTmEIHaIIjcEYHbDoDZFIPcJ43fHYjd9fX28PDy3d3fI4rd3d3dHojc19fXttTsJIve2dnZDX/YCn3Y09PTjL/p5+fnh7zo2traJYzfIYjdE4Pb6urrW6Tf9PT1Ioneir7otNPsCX3Zhbvn+Pj5YKfhJYfWMo7a39/gKIzeKo7eMI3ZNJDcXqbg4eHhuNTsB3zYIoncBXvZLIrXIYjbLJDgt7m6ubu+YqjiKYvYvr6+tba3rs/sz8/P1+byJonXv7/DiImLxsbGjo6Ra6reurq6io6QkJKVw8PD0tLSycnJq1DGywAAAGJ0Uk5TAP////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+BVJDaAAABY0lEQVR4nM2RaVOCUBSGr1CBgFZimppgoGnKopZSaYGmRpravq///0904IqOM9j00WeGT+9ztgtCS8Dzyh98fL6i2+HqQoaj0RPSzQNgzZc4F4wgvUuoqkr1er094MjlIeBCwRdFua9CqURQ51cty7Lykj0YCIIibnlEkS4TgCuky3nbTmSFsCKSHuso96N/Ox1aacjrlYQQ3gjNCYV7UlUJ6szCeRZyXmlkNjEZEPSuLIMAuYTreVYROQ8Y8SLTNAhlCdfzLMsaIhfHgEAT7pLtvFTH9QxTNWrmLsaEDu8558y2ZOP5LLNTNUQyiCFnHaRZnjTmzryhnR36FSdnIU9up7RGxAOuKJjOFX2vHvKU5jPiepbvxzR3BIffwROc++AAJy9qjQxQwz9rIjyGeN6tj8VACEyZCqfQn3H7F48vTvwEdlIP+aWvMNkPcl8h8DYeN5vNTqdzCNz5CIv4h7AE/AKcwUFbShJywQAAAABJRU5ErkJggg=="

# Define common system paths
$systemRoot = $env:SystemRoot
$system32Path = Join-Path -Path $systemRoot -ChildPath "System32"


# --- Helper Functions ---

# Adds spaces to CamelCase or PascalCase strings (e.g., "VisualStudio" -> "Visual Studio")
function Add-SpacesToCamelCase {
    param([string]$InputString)

    # Skip if null, already contains whitespace, is only numbers, or too short to need spacing
    if ($null -eq $InputString -or $InputString -match '\s' -or $InputString -match '^\d+$' -or $InputString.Length -lt 3) {
        return $InputString
    }

    try {
        # Regex patterns:
        # 1. (?<=[a-z])(?=[A-Z])   : Lowercase followed by Uppercase
        # 2. (?<=[A-Z])(?=[A-Z][a-z]) : Uppercase followed by Uppercase+Lowercase (handles acronyms like "MSPaint")
        # 3. (?<=[a-zA-Z])(?=[0-9])  : Letter followed by Digit
        $pattern = '((?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-zA-Z])(?=[0-9]))'
        $spaced = $InputString -replace $pattern, ' '
        return $spaced.Trim()
    } catch {
        # Return original string if regex fails for any reason
        return $InputString
    }
}

# Extracts an application's associated icon as a 32x32 PNG Base64 string.
function Get-ApplicationIcon {
    param ([string]$targetPath)

    # Pre-check: Ensure System.Drawing is loaded and path is a valid file
    if (-not [System.Drawing.Icon] -or -not (Test-Path -LiteralPath $targetPath -PathType Leaf -ErrorAction SilentlyContinue)) {
        return $defaultIconBase64
    }

    try {
        $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($targetPath)
        if ($null -eq $icon) { throw "ExtractAssociatedIcon returned null for $targetPath" }

        # Get best available bitmap from icon
        $bmp = $icon.ToBitmap()

        # Resize to a standard 32x32 using high quality interpolation
        $resizedBmp = New-Object System.Drawing.Bitmap(32, 32)
        $graphics = [System.Drawing.Graphics]::FromImage($resizedBmp)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($bmp, 0, 0, 32, 32)

        # Save as PNG to memory stream
        $stream = New-Object System.IO.MemoryStream
        $resizedBmp.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $base64 = [Convert]::ToBase64String($stream.ToArray())

        # Clean up GDI+ resources
        $stream.Dispose()
        $graphics.Dispose()
        $resizedBmp.Dispose()
        $bmp.Dispose()
        $icon.Dispose()

        return $base64
    } catch {
        # Fallback on any error during extraction/conversion
        return $defaultIconBase64
    }
}

# Gets the application name using a priority order:
# 1. Target EXE FileDescription
# 2. LNK file name (often the user-facing name)
# 3. Target file name
function Get-ApplicationName {
    param (
        [string]$targetPath,
        [string]$lnkPath = $null
    )

    $appName = $null

    # Priority 1: Target Executable's FileDescription
    if ($targetPath -and $targetPath.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $targetPath -PathType Leaf)) {
        try {
            $desc = (Get-Item $targetPath).VersionInfo.FileDescription
            # Only use description if it's not empty/whitespace
            if ($desc -and $desc.Trim()) {
                $appName = $desc.Trim() -replace '\s+', ' ' # Normalize whitespace
            }
        } catch { } # Ignore errors reading version info
    }

    # Priority 2: LNK Filename (BaseName without extension), attempt spacing
    if (-not $appName -and $lnkPath -and (Test-Path $lnkPath -PathType Leaf)) {
        $appName = Add-SpacesToCamelCase -InputString ([System.IO.Path]::GetFileNameWithoutExtension($lnkPath))
    }

    # Priority 3: Target Filename (BaseName without extension), attempt spacing
    if (-not $appName -and $targetPath -and (Test-Path $targetPath -PathType Leaf)) {
        $appName = Add-SpacesToCamelCase -InputString ([System.IO.Path]::GetFileNameWithoutExtension($targetPath))
    }

    # Final Cleanup: Remove common registered/trademark symbols and trim whitespace
    if ($appName) {
        # TODO: This breaks on CJK systems because of UTF-8, check out https://github.com/TibixDev/winboat/issues/40
        # Original line in Base64:
        # JGFwcE5hbWUgPSAkYXBwTmFtZSAtcmVwbGFjZSAnKD9pKVxzKlwoclwpfFwodG1cKXzCqXzCrnzihKInLCAnJw==
        $appName = $appName.Trim()
    }

    return $appName
}

# Gets the display name for a UWP app.
function Get-UWPApplicationName {
    param (
        [string]$exePath, # The resolved executable path
        $app # The AppxPackage object
    )

    # UWP properties are usually the best source
    if ($app.DisplayName) { return $app.DisplayName.Trim() }
    if ($app.Name) { return $app.Name.Trim() } # Often the package name, less ideal but a fallback

    # If UWP properties fail, try standard name extraction on the EXE
    if (Test-Path $exePath -PathType Leaf) {
        return Get-ApplicationName -targetPath $exePath
    }

    return $null # Failed to get a name
}

# Parses the AppxManifest.xml to find the primary executable path for a UWP app.
function Get-UWPExecutablePath {
    param ([string]$instLoc) # InstallLocation from Get-AppxPackage

    $manifestPath = Join-Path -Path $instLoc -ChildPath "AppxManifest.xml"
    if (-not (Test-Path $manifestPath -PathType Leaf)) {
        return $null # Manifest doesn't exist or isn't a file
    }

    try {
        # Read manifest content, default encoding often works
        $xmlContent = Get-Content $manifestPath -Raw -Encoding Default -ErrorAction Stop

        # Remove known namespace prefixes and xmlns attributes to simplify XML parsing
        $prefixesToRemove = 'uap10', 'uap', 'desktop', 'rescap', 'com' # Common prefixes
        $cleanedXml = $xmlContent
        foreach ($prefix in $prefixesToRemove) {
            # Regex to remove 'prefix:' from start/end tags and self-closing tags
            $cleanedXml = $cleanedXml -replace "(</?)$prefix`:", '$1' `
                                     -replace "<$prefix`:([^>\s]+?)\s*/>", "<$1 />"
        }
        # Remove the xmlns declarations themselves
        $cleanedXml = $cleanedXml -replace 'xmlns(:\w+)?="[^"]+"', ''

        # Attempt to parse the cleaned XML
        [xml]$manifest = $cleanedXml

        # Find the first <Application> node
        $appNode = $manifest.Package.Applications.Application | Select-Object -First 1
        if (-not $appNode) { return $null } # No application defined

        # Get the 'Executable' attribute value
        $exeRelPath = $appNode.Executable
        if (-not $exeRelPath) { return $null } # No executable attribute

        # Handle special $targetnametoken$.exe case by finding the first EXE in the root
        if ($exeRelPath -like '*$targetnametoken$.exe*') {
            $candidateExe = Get-ChildItem -Path $instLoc -Filter *.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($candidateExe -and (Test-Path $candidateExe.FullName -PathType Leaf)) {
                return $candidateExe.FullName
            }
        } else {
            # Handle regular relative path
            $fullPath = Join-Path -Path $instLoc -ChildPath $exeRelPath
            if (Test-Path $fullPath -PathType Leaf) {
                return $fullPath
            }
        }
    } catch {
        # Ignore any parsing errors and return null
        return $null
    }

    # Default return if no valid path found
    return $null
}


# --- Main Application Logic ---

# Use efficient List and HashSet for collection and deduplication
$apps = [System.Collections.Generic.List[PSCustomObject]]::new()
# Store normalized (lowercase) full paths for case-insensitive duplicate checking
$addedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

# Helper function to validate and add an app to the list if it's unique
function Add-AppToListIfValid {
    param(
        [string]$Name,
        [string]$InputPath, # The path discovered (can be relative or contain variables)
        [string]$Source     # Source type (e.g., 'system', 'winreg', 'startmenu')
    )

    $resolved = $null
    $fullPath = $null
    $normalizedPathKey = $null

    # 1. Resolve and Validate Path
    try {
        $resolved = Resolve-Path -Path $InputPath -ErrorAction SilentlyContinue
    } catch { return } # Ignore if path resolution throws error

    # Ensure resolved path exists and is a file (Leaf)
    if ($resolved -and (Test-Path -LiteralPath $resolved.ProviderPath -PathType Leaf)) {
        $fullPath = $resolved.ProviderPath
        # Create a consistent key for the HashSet (lowercase)
        $normalizedPathKey = $fullPath.ToLowerInvariant()
    } else {
        return # Skip if path doesn't resolve to a valid file
    }

    # 2. Validate Name (Basic Check)
    if (-not $Name -or $Name.Trim().Length -eq 0 -or $Name -like 'Microsoft? Windows? Operating System*') {
        return # Skip if name is empty, invalid, or generic OS name
    }

    # 3. Check for Duplicates using normalized path
    if ($addedPaths.Contains($normalizedPathKey)) {
        return # Skip if this exact executable path has already been added
    }

    # 4. Get Icon
    $icon = Get-ApplicationIcon -targetPath $fullPath

    # 5. Add the Application Object (matching WinApp type)
    $apps.Add([PSCustomObject]@{
        Name   = $Name
        Path   = $fullPath # Use the resolved, non-normalized path for output
        Icon   = $icon
        Source = $Source
    })

    # 6. Mark Path as Added
    $addedPaths.Add($normalizedPathKey) | Out-Null
}


# --- Application Discovery Sections ---

# 1. Hardcoded Common System Tools
$systemTools = @(
    @{N = "Task Manager"; P = Join-Path $system32Path "Taskmgr.exe"},
    @{N = "Control Panel"; P = Join-Path $system32Path "control.exe"},
    @{N = "File Explorer"; P = Join-Path $env:WINDIR "explorer.exe"},
    @{N = "Command Prompt"; P = Join-Path $system32Path "cmd.exe"},
    @{N = "PowerShell"; P = Join-Path $system32Path "WindowsPowerShell\v1.0\powershell.exe"},
    @{N = "Notepad"; P = Join-Path $system32Path "notepad.exe"},
    @{N = "Paint"; P = Join-Path $system32Path "mspaint.exe"},
    @{N = "Registry Editor"; P = Join-Path $env:WINDIR "regedit.exe"},
    @{N = "Services"; P = Join-Path $system32Path "services.msc"},
    @{N = "Device Manager"; P = Join-Path $system32Path "devmgmt.msc"},
    @{N = "Computer Management"; P = Join-Path $system32Path "compmgmt.msc"},
    @{N = "Disk Management"; P = Join-Path $system32Path "diskmgmt.msc"},
    @{N = "Snipping Tool"; P = Join-Path $system32Path "SnippingTool.exe"}, # Legacy version
    @{N = "Calculator"; P = Join-Path $system32Path "win32calc.exe"},    # Legacy version
    @{N = "Remote Desktop Connection"; P = Join-Path $system32Path "mstsc.exe"}
)
foreach ($tool in $systemTools) {
    # Use the predefined name 'N' for system tools
    Add-AppToListIfValid -Name $tool.N -InputPath $tool.P -Source "system"
}


# 2. Windows Registry (App Paths - HKLM & HKCU)
try {
    $regRoots = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths",
                "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"

    # Get properties from all matching keys under both roots
    $regEntries = foreach ($regRoot in $regRoots) {
        if (Test-Path $regRoot) {
            Get-ItemProperty "$regRoot\*" -ErrorAction SilentlyContinue
        }
    }

    # Process each found registry entry
    foreach ($entry in $regEntries) {
        $keyName = $entry.PSChildName # e.g., msedge.exe, devenv.exe
        $pathValue = $null

        # Check if the (default) value exists and is not empty
        if ($entry.PSObject.Properties['(default)'] -and $entry.'(default)') {
            try {
                # Expand environment variables and remove surrounding quotes
                $pathValue = $ExecutionContext.InvokeCommand.ExpandString($entry.'(default)'.Trim('"'))
            } catch { } # Ignore errors expanding variables
        }

        if ($pathValue) {
            # Get name using standard function (tries FileDescription first)
            $appName = Get-ApplicationName -targetPath $pathValue
            # Fallback: If Get-ApplicationName fails, use the spaced registry key name
            if (-not $appName) {
                $appName = Add-SpacesToCamelCase -InputString ([System.IO.Path]::GetFileNameWithoutExtension($keyName))
            }
            # Add if name is valid
            if ($appName) {
                Add-AppToListIfValid -Name $appName -InputPath $pathValue -Source "winreg"
            }
        }
    }
} catch { } # Ignore errors during registry scan


# 3. Start Menu Shortcuts (All Users)
$startMenuPath = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs"
if (Test-Path $startMenuPath -PathType Container) {
    try {
        $lnkFiles = Get-ChildItem -Path $startMenuPath -Recurse -Filter *.lnk -File -ErrorAction SilentlyContinue
        if ($lnkFiles) {
            # Use strict mode for COM object for better error catching
            $shell = New-Object -ComObject WScript.Shell -Strict
            try {
                foreach ($lnk in $lnkFiles) {
                    $target = $null
                    $appName = $null

                    # Parse the shortcut file
                    try {
                        $link = $shell.CreateShortcut($lnk.FullName)
                        $rawTarget = $link.TargetPath
                        # Resolve path if contains environment variables
                        if ($rawTarget) {
                            $target = try { $ExecutionContext.InvokeCommand.ExpandString($rawTarget) } catch { $rawTarget }
                        }
                    } catch { continue } # Skip malformed or unreadable shortcuts

                    # Skip if no target or looks like an uninstaller
                    if (-not $target -or $target -like '*uninstall*' -or $target -like '*unins000*') {
                        continue
                    }

                    # Get name using standard function (FileDesc > LNK Name > Target Name)
                    $appName = Get-ApplicationName -targetPath $target -lnkPath $lnk.FullName

                    # Refinement: If target is NOT an exe and name defaulted to target filename, prefer LNK filename
                    if ($target -notlike '*.exe' -and $appName -eq (Add-SpacesToCamelCase ([System.IO.Path]::GetFileNameWithoutExtension($target))) ) {
                        $lnkNameOnly = Add-SpacesToCamelCase -InputString ([System.IO.Path]::GetFileNameWithoutExtension($lnk.FullName))
                        if ($lnkNameOnly -ne $appName) { $appName = $lnkNameOnly }
                    }

                    # Add if name is valid
                    if ($appName) {
                        Add-AppToListIfValid -Name $appName -InputPath $target -Source "startmenu"
                    }
                }
            } finally {
                # Ensure COM object is released
                if ($shell) {
                    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
                    Remove-Variable shell -ErrorAction SilentlyContinue # Clean up variable
                    [System.GC]::Collect()
                    [System.GC]::WaitForPendingFinalizers()
                }
            }
        }
    } catch { } # Ignore errors during Start Menu scan
}


# 4. UWP Apps
if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    try {
        Get-AppxPackage -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IsFramework -eq $false -and
                $_.IsResourcePackage -eq $false -and
                $_.SignatureKind -ne 'System' -and       # Exclude core system packages
                $_.InstallLocation                       # Must have an install location
            } |
            ForEach-Object {
                $app = $_
                # Attempt to find the executable path using the manifest
                $exePath = Get-UWPExecutablePath -instLoc $app.InstallLocation

                if ($exePath) { # Function already validates path is a file
                    # Get the best display name (UWP properties preferred)
                    $name = Get-UWPApplicationName -exePath $exePath -app $app
                    if ($name) {
                        Add-AppToListIfValid -Name $name -InputPath $exePath -Source "uwp"
                    }
                }
            }
    } catch { } # Ignore errors during UWP scan
}


# 5. Chocolatey Installed Apps (via Shims)
$chocoDir = "C:\ProgramData\chocolatey\bin"
if (Test-Path $chocoDir -PathType Container) {
    try {
        Get-ChildItem -Path $chocoDir -Filter *.exe -File -ErrorAction SilentlyContinue |
            ForEach-Object {
                $shim = $_
                $exePath = $null
                $name = $null

                # Resolve shim target using Get-Command
                try {
                    $cmdInfo = Get-Command $shim.FullName -ErrorAction SilentlyContinue
                    # Ensure it resolved to a different path (not the shim itself)
                    if ($cmdInfo -and $cmdInfo.Source -ne $shim.FullName) {
                        $exePath = $cmdInfo.Source
                    }
                } catch { } # Ignore resolution errors

                if ($exePath) { # Path must resolve
                    # Get name (FileDesc preferred)
                    $name = Get-ApplicationName -targetPath $exePath
                    # Fallback to spaced shim name if needed
                    if (-not $name) { $name = Add-SpacesToCamelCase -InputString $shim.BaseName }

                    if ($name) {
                        Add-AppToListIfValid -Name $name -InputPath $exePath -Source "choco"
                    }
                }
            }
    } catch { } # Ignore errors during Choco scan
}


# 6. Scoop Installed Apps (via Shims)
# Check both common user and global scoop shim paths
$scoopDir = @(
    Join-Path $env:USERPROFILE "scoop\shims"
    "C:\ProgramData\scoop\shims"
) | Where-Object { Test-Path $_ -PathType Container } | Select-Object -First 1

if ($scoopDir) {
    try {
        Get-ChildItem -Path $scoopDir -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ne 'scoop.ps1' } | # Exclude scoop runner itself
            ForEach-Object {
                $shim = $_
                $exePath = $null
                $name = $null

                # Attempt to resolve target using Get-Command first
                try {
                    $cmdInfo = Get-Command $shim.FullName -ErrorAction SilentlyContinue
                    if ($cmdInfo -and $cmdInfo.Source -ne $shim.FullName) {
                        $exePath = $cmdInfo.Source
                    }
                } catch { } # Ignore resolution errors

                # Fallback: Very basic content scan for text-based shims if Get-Command fails
                if (-not $exePath -and $shim.Extension -in '.cmd', '.ps1', '') {
                    try {
                        # Read first 5 lines, look for "path/to/something.exe" pattern
                        $content = Get-Content $shim.FullName -Raw -TotalCount 5 -ErrorAction SilentlyContinue
                        if ($content -match '(?<=")([^"]+?\.exe)(?=")') {
                            $relativePath = $Matches[1] -replace '%~dp0', $shim.DirectoryName
                            $exePath = try { (Resolve-Path $relativePath -ErrorAction SilentlyContinue).Path } catch {}
                        }
                    } catch {}
                }

                if ($exePath) { # Path must resolve
                    # Get name (FileDesc preferred)
                    $name = Get-ApplicationName -targetPath $exePath
                    # Fallback to spaced shim name
                    if (-not $name) { $name = Add-SpacesToCamelCase -InputString $shim.BaseName }

                    if ($name) {
                        Add-AppToListIfValid -Name $name -InputPath $exePath -Source "scoop"
                    }
                }
            }
    } catch { } # Ignore errors during Scoop scan
}


# --- Final Output ---

# Convert the final list of application objects to a compressed JSON string.
# This is the only output sent to the standard output stream.
$apps | ConvertTo-Json -Depth 5 -Compress