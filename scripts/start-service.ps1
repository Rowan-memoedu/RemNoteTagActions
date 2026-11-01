#Requires -Version 7.4
[CmdletBinding()]
param([switch]$InstallStartup)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$launcher=Join-Path $PSScriptRoot 'launch.pyw'
$pythonw=(Get-Command pythonw.exe -ErrorAction Stop).Source
if($InstallStartup){
    $action=New-ScheduledTaskAction -Execute $pythonw -Argument ('"'+$launcher+'"') -WorkingDirectory $project
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'RemNoteTagActions' -Action $action -Trigger $trigger -Settings $settings -Description 'Local RemNote tag processing and independent plugin service' -Force | Out-Null
}
try{$health=Invoke-RestMethod 'http://127.0.0.1:43171/health' -TimeoutSec 3;if($health.app -eq 'RemNoteTagActions'){Write-Output 'Already running';exit 0}}catch{}
Start-Process -FilePath $pythonw -ArgumentList ('"'+$launcher+'"') -WorkingDirectory $project -WindowStyle Hidden
Write-Output 'Background launch requested; verify /health for readiness.'
