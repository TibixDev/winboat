# WinBoat Guest Server
# Returns JSON array of active RAIL (RemoteApp) windows with metadata

Add-Type @"
    using System;
    using System.Runtime.InteropServices;
    using System.Text;

    public class Win32Window {
        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    }
"@

$windows = @()

$callback = {
    param($hwnd, $lParam)

    # Check if window is visible
    if (-not [Win32Window]::IsWindowVisible($hwnd)) {
        return $true
    }

    $length = [Win32Window]::GetWindowTextLength($hwnd)
    if ($length -eq 0) {
        return $true
    }

    $title = New-Object System.Text.StringBuilder($length + 1)
    [Win32Window]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
    $titleStr = $title.ToString()

    $processId = 0
    [Win32Window]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null

    $className = New-Object System.Text.StringBuilder(256)
    [Win32Window]::GetClassName($hwnd, $className, 256) | Out-Null
    $classNameStr = $className.ToString()

    # Filter for winboat RemoteApp windows (those with wm-class starting with "winboat-" or like that)
    if ($classNameStr -notlike "winboat-*") {
        return $true
    }

    # Get window position and size
    $rect = New-Object Win32Window+RECT
    [Win32Window]::GetWindowRect($hwnd, [ref]$rect) | Out-Null

    # Get process information
    try {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $processName = if ($process) { $process.Name } else { "Unknown" }
        $processPath = if ($process) { $process.Path } else { "" }
    } catch {
        $processName = "Unknown"
        $processPath = ""
    }

    # Create window object
    $windowObj = [PSCustomObject]@{
        hwnd = [int]$hwnd
        title = $titleStr
        className = $classNameStr
        processId = $processId
        processName = $processName
        processPath = $processPath
        rect = @{
            x = $rect.Left
            y = $rect.Top
            width = $rect.Right - $rect.Left
            height = $rect.Bottom - $rect.Top
        }
        timestamp = (Get-Date).ToString("o")
    }

    $script:windows += $windowObj
    return $true
}

[Win32Window]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null

$windows | ConvertTo-Json -Depth 10 -Compress
