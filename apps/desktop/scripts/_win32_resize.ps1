param([string]$State = 'normal')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class VerWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
}
"@
$p = Get-Process | Where-Object { $_.MainWindowTitle -eq 'DataAI' } | Select-Object -First 1
if (-not $p) { Write-Output 'NO_HWND'; exit 1 }
$h = $p.MainWindowHandle
switch ($State) {
  'maximized' { [VerWin]::ShowWindow($h, 3) | Out-Null }
  'narrow' {
    [VerWin]::ShowWindow($h, 9) | Out-Null
    Start-Sleep -Milliseconds 250
    [VerWin]::SetWindowPos($h, [IntPtr]::Zero, 40, 40, 900, 700, 0x0040) | Out-Null
  }
  'wide' {
    [VerWin]::ShowWindow($h, 9) | Out-Null
    Start-Sleep -Milliseconds 250
    [VerWin]::SetWindowPos($h, [IntPtr]::Zero, 20, 20, 1400, 860, 0x0040) | Out-Null
  }
  default {
    [VerWin]::ShowWindow($h, 9) | Out-Null
    Start-Sleep -Milliseconds 250
    [VerWin]::SetWindowPos($h, [IntPtr]::Zero, 80, 60, 1100, 760, 0x0040) | Out-Null
  }
}
Write-Output "OK $State $($p.Id)"
