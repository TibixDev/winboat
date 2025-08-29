param(
    [Parameter(Mandatory=$true)]
    [string]$AppPath,
    
    [Parameter(Mandatory=$true)]
    [string]$UpdateFilePath,
    
    [string]$ServiceName = "WinBoatGuestServer",
    
    [int]$InitialDelay = 2,
    [int]$StopTimeout = 30
)

# Set up logging to temp folder
$TempDir = Split-Path $UpdateFilePath -Parent
$LogFile = Join-Path $TempDir "logs.txt"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    
    # Log to temp folder
    try {
        Add-Content -Path $LogFile -Value $logMessage -Encoding UTF8
    } catch {
        # If we can't write to log file, at least show it in console
        Write-Host "Failed to write to log file: $($_.Exception.Message)"
    }
}

try {
    Write-Log "Update script started"
    Write-Log "App Path: $AppPath"
    Write-Log "Update File: $UpdateFilePath"
    Write-Log "Service Name: $ServiceName"
    Write-Log "Log File: $LogFile"
    Write-Log "Temp Directory: $TempDir"
    
    # Initial delay to let Go app finish its response and exit gracefully
    Write-Log "Waiting $InitialDelay seconds for app to finish..."
    Start-Sleep -Seconds $InitialDelay
    
    # Validate inputs
    if (-not (Test-Path $AppPath)) {
        throw "Application path does not exist: $AppPath"
    }
    
    if (-not (Test-Path $UpdateFilePath)) {
        throw "Update file does not exist: $UpdateFilePath"
    }
    
    # Check if running as administrator
    if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Script must be run as Administrator to manage services"
    }
    
    # Get service
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        throw "Service '$ServiceName' not found"
    }
    
    Write-Log "Current service status: $($service.Status)"
    
    # Force stop the service (the Go app should have already exited, but make sure)
    if ($service.Status -ne "Stopped") {
        Write-Log "Force stopping service '$ServiceName'..."
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        
        # Wait for it to actually stop
        $elapsed = 0
        do {
            Start-Sleep -Seconds 1
            $elapsed++
            $service = Get-Service -Name $ServiceName
            if ($elapsed % 5 -eq 0) {
                Write-Log "Waiting for service to stop... ($elapsed seconds)"
            }
        } while ($service.Status -ne "Stopped" -and $elapsed -lt $StopTimeout)
        
        if ($service.Status -ne "Stopped") {
            Write-Log "Service didn't stop gracefully, continuing anyway..." -Level "WARN"
        } else {
            Write-Log "Service stopped"
        }
    }
    
    # Extra delay to ensure all file handles are released
    Write-Log "Waiting for file handles to release..."
    Start-Sleep -Seconds 3
    
    # Create backup in a more appropriate location
    $backupDir = "$env:PROGRAMDATA\WinBoat\Backups"
    if (-not (Test-Path $backupDir)) {
        Write-Log "Creating backup directory: $backupDir"
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    }
    
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $backupDir "backup-$timestamp"
    Write-Log "Creating backup: $backupPath"
    Copy-Item -Path $AppPath -Destination $backupPath -Recurse -Force
    
    # Clean up old backups (keep only last 5)
    try {
        $oldBackups = Get-ChildItem -Path $backupDir -Directory | 
                     Where-Object { $_.Name -like "backup-*" } | 
                     Sort-Object CreationTime -Descending | 
                     Select-Object -Skip 5
        
        if ($oldBackups) {
            Write-Log "Cleaning up $($oldBackups.Count) old backup(s)"
            $oldBackups | ForEach-Object {
                Write-Log "Removing old backup: $($_.Name)"
                Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Log "Failed to clean up old backups: $($_.Exception.Message)" -Level "WARN"
    }
    
    # Clean the application directory (but keep the directory itself)
    Write-Log "Cleaning application directory..."
    try {
        Get-ChildItem -Path $AppPath -Force | ForEach-Object {
            Write-Log "Removing: $($_.Name)"
            if ($_.PSIsContainer) {
                Remove-Item $_.FullName -Recurse -Force
            } else {
                Remove-Item $_.FullName -Force
            }
        }
        Write-Log "Application directory cleaned"
    } catch {
        Write-Log "Warning: Some files could not be removed: $($_.Exception.Message)" -Level "WARN"
        # Continue anyway - the -Force flag on Expand-Archive should overwrite
    }
    
    # Extract update
    Write-Log "Extracting update files to clean directory..."
    Expand-Archive -Path $UpdateFilePath -DestinationPath $AppPath -Force
    Write-Log "Files extracted successfully"
    
    # Start service
    Write-Log "Starting service '$ServiceName'..."
    Start-Service -Name $ServiceName
    
    # Brief check
    Start-Sleep -Seconds 3
    $service = Get-Service -Name $ServiceName
    Write-Log "Service status after start: $($service.Status)"
    
    # Cleanup update file but keep temp directory and logs
    Write-Log "Cleaning up update file..."
    Remove-Item $UpdateFilePath -Force -ErrorAction SilentlyContinue
    
    Write-Log "Update completed successfully!" -Level "SUCCESS"
    Write-Log "Backup created at: $backupPath"
    Write-Log "Temp directory preserved for debugging: $TempDir"
    Write-Log "Log file location: $LogFile"
    
} catch {
    Write-Log "Update failed: $($_.Exception.Message)" -Level "ERROR"
    Write-Log "Stack trace: $($_.Exception.StackTrace)" -Level "ERROR"
    
    # Try to start the service anyway
    try {
        Write-Log "Attempting to start service after failure..." -Level "WARN"
        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
        $service = Get-Service -Name $ServiceName
        Write-Log "Service status after recovery attempt: $($service.Status)" -Level "WARN"
    } catch {
        Write-Log "Failed to start service: $($_.Exception.Message)" -Level "ERROR"
    }
    
    Write-Log "Update process completed with errors. Check log file: $LogFile" -Level "ERROR"
    exit 1
}