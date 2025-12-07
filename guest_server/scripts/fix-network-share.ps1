# PowerShell script to fix Windows network share access to host.lan
# This script should be run inside Windows VM via PowerShell

Write-Host "=== WinBoat Network Share Diagnostic & Fix ===" -ForegroundColor Cyan
Write-Host ""

# Check if we can resolve host.lan
Write-Host "1. Testing host.lan resolution..." -ForegroundColor Yellow
$needsHostsEntry = $true
try {
    $ping = Test-Connection -ComputerName "host.lan" -Count 1 -ErrorAction Stop
    Write-Host "   ✓ host.lan is reachable: $($ping.IPv4Address)" -ForegroundColor Green
    $needsHostsEntry = $false
} catch {
    Write-Host "   ✗ Cannot reach host.lan: $_" -ForegroundColor Red
}

if ($needsHostsEntry) {
    Write-Host "   Attempting to add host.lan to hosts file..." -ForegroundColor Yellow
    
    # Get Default Gateway IP
    $gateway = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -ExpandProperty IPv4DefaultGateway | Select-Object -ExpandProperty NextHop | Select-Object -First 1
    
    if ($gateway) {
        Write-Host "   ✓ Detected Default Gateway: $gateway" -ForegroundColor Cyan
        
        $hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
        $hostsContent = Get-Content $hostsFile -ErrorAction SilentlyContinue
        
        if ($hostsContent -notmatch "host\.lan") {
            Write-Host "   Adding host.lan entry to hosts file..." -ForegroundColor Yellow
            Add-Content -Path $hostsFile -Value "`n# WinBoat network share`n$gateway    host.lan" -ErrorAction SilentlyContinue
            Write-Host "   ✓ Added host.lan to hosts file" -ForegroundColor Green
            
            # Flush DNS
            Invoke-Command -ScriptBlock { ipconfig /flushdns } | Out-Null
        } else {
            Write-Host "   ℹ host.lan already in hosts file" -ForegroundColor Cyan
        }
    } else {
        Write-Host "   ✗ Could not detect Default Gateway" -ForegroundColor Red
    }
}

# Check SMB client service
Write-Host "`n2. Checking SMB Client service..." -ForegroundColor Yellow
$smbClient = Get-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue
if ($smbClient) {
    if ($smbClient.Status -eq "Running") {
        Write-Host "   ✓ SMB Client service is running" -ForegroundColor Green
    } else {
        Write-Host "   ✗ SMB Client service is not running. Starting..." -ForegroundColor Red
        Start-Service -Name "LanmanWorkstation" -ErrorAction SilentlyContinue
        Write-Host "   ✓ SMB Client service started" -ForegroundColor Green
    }
} else {
    Write-Host "   ✗ SMB Client service not found" -ForegroundColor Red
}

# Check Network Discovery
Write-Host "`n3. Checking Network Discovery settings..." -ForegroundColor Yellow
$netDiscovery = Get-NetFirewallRule -DisplayGroup "Network Discovery" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq $false }
if ($netDiscovery) {
    Write-Host "   ⚠ Some Network Discovery rules are disabled" -ForegroundColor Yellow
    Write-Host "   Enabling Network Discovery..." -ForegroundColor Yellow
    Enable-NetFirewallRule -DisplayGroup "Network Discovery" -ErrorAction SilentlyContinue
    Write-Host "   ✓ Network Discovery enabled" -ForegroundColor Green
} else {
    Write-Host "   ✓ Network Discovery is enabled" -ForegroundColor Green
}

# Check SMB firewall rules
Write-Host "`n4. Checking SMB firewall rules..." -ForegroundColor Yellow
$smbRules = Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq $false }
if ($smbRules) {
    Write-Host "   ⚠ Some File and Printer Sharing rules are disabled" -ForegroundColor Yellow
    Write-Host "   Enabling File and Printer Sharing..." -ForegroundColor Yellow
    Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue
    Write-Host "   ✓ File and Printer Sharing enabled" -ForegroundColor Green
} else {
    Write-Host "   ✓ File and Printer Sharing is enabled" -ForegroundColor Green
}

# Try to access the share
Write-Host "`n5. Testing network share access..." -ForegroundColor Yellow
try {
    $share = Get-SmbConnection -ServerName "host.lan" -ErrorAction Stop
    Write-Host "   ✓ Successfully connected to host.lan" -ForegroundColor Green
    Write-Host "   Connected shares: $($share.ShareName -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "   ✗ Cannot access host.lan share: $_" -ForegroundColor Red
    Write-Host "`n   Attempting manual connection..." -ForegroundColor Yellow
    
    # Try to map the network drive
    try {
        # Remove existing mapping if any
        Remove-SmbMapping -RemotePath "\\host.lan\shared" -Force -ErrorAction SilentlyContinue
        
        # Try to connect with guest access
        $credential = New-Object System.Management.Automation.PSCredential("guest", (New-Object System.Security.SecureString))
        New-SmbMapping -RemotePath "\\host.lan\shared" -LocalPath "Z:" -Persistent $false -UserName "guest" -Password "" -ErrorAction SilentlyContinue
        
        # Alternative: try without credentials (guest access)
        net use Z: \\host.lan\shared /user:guest "" 2>&1 | Out-Null
        
        Write-Host "   ✓ Attempted to map network drive" -ForegroundColor Green
    } catch {
        Write-Host "   ✗ Failed to map network drive: $_" -ForegroundColor Red
    }
}

# Check network adapter
Write-Host "`n6. Checking network adapter configuration..." -ForegroundColor Yellow
$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
foreach ($adapter in $adapters) {
    Write-Host "   Adapter: $($adapter.Name) - Status: $($adapter.Status)" -ForegroundColor Cyan
    $ipConfig = Get-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
    if ($ipConfig) {
        Write-Host "     IP: $($ipConfig.IPAddress) / $($ipConfig.PrefixLength)" -ForegroundColor Cyan
        Write-Host "     Gateway: $($ipConfig.NextHop)" -ForegroundColor Cyan
    }
}

# Summary
Write-Host "`n=== Diagnostic Complete ===" -ForegroundColor Cyan
Write-Host "If the share still doesn't work, try:" -ForegroundColor Yellow
Write-Host "  1. Restart Windows VM" -ForegroundColor White
Write-Host "  2. Check if 'host.lan' appears in Network folder" -ForegroundColor White
Write-Host "  3. Try accessing: \\host.lan\shared directly" -ForegroundColor White
Write-Host "  4. Check Windows Event Viewer for SMB errors" -ForegroundColor White

