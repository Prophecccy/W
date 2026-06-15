Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Show {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
"@

$proc = Get-Process -Name "w-app" -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Host "w-app process not found"
    exit
}

Write-Host "Found w-app PID: $($proc.Id)"
Write-Host "MainWindowHandle: $($proc.MainWindowHandle)"

# Enumerate all windows for this PID
$targetPid = $proc.Id
$windows = @()

$callback = [Win32Show+EnumWindowsProc]{
    param($hWnd, $lParam)
    $pid = 0
    [Win32Show]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
    if ($pid -eq $targetPid) {
        $sb = New-Object System.Text.StringBuilder 256
        [Win32Show]::GetWindowText($hWnd, $sb, 256) | Out-Null
        $visible = [Win32Show]::IsWindowVisible($hWnd)
        Write-Host "  HWND=$hWnd Title='$($sb.ToString())' Visible=$visible"
        # Show and bring to front
        [Win32Show]::ShowWindow($hWnd, 9) | Out-Null  # SW_RESTORE
        [Win32Show]::SetForegroundWindow($hWnd) | Out-Null
    }
    return $true
}

[Win32Show]::EnumWindows($callback, [IntPtr]::Zero)
Write-Host "Done - attempted to show all w-app windows"
