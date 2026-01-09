if (-not (Get-WmiObject Win32_OperatingSystem).Caption -Match "Windows 11") {
    exit
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);
}
"@

$hwnd_progman = [Win32]::FindWindow("Progman", "Program Manager")
$hwnd_shell = [Win32]::FindWindowEx($hwnd_progman, [IntPtr]::Zero, "SHELLDLL_DefView", $null)

if ($hwnd_shell -ne [IntPtr]::Zero) {
    exit
}

$className = "Windows.UI.Core.CoreWindow"
$caption = "New notification"

$prev = 0;

while ($true) {
    $hwnd = [Win32]::FindWindow($className, $caption)

    if ($hwnd -eq [IntPtr]::Zero) {
        Start-Sleep -Milliseconds 100
        continue
    }

    $rect = New-Object Win32+RECT
    
    if ([Win32]::GetWindowRect($hwnd, [ref]$rect)) {
        $width = $rect.Right - $rect.Left
        $height = $rect.Bottom - $rect.Top

        if ($height -eq 0 -and $prev -ne 0) {
            Stop-Process -Name "ShellExperienceHost" -Force
        }

        $prev = $height;
    }
    
    Start-Sleep -Milliseconds 100
}