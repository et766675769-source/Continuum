$project = Split-Path -Parent $PSScriptRoot
$data = Join-Path $project 'data'
New-Item -ItemType Directory -Path $data -Force | Out-Null
(Get-Command node -ErrorAction Stop).Source | Set-Content -LiteralPath (Join-Path $data 'node-path.txt') -Encoding UTF8
$launcher = Join-Path $PSScriptRoot 'Start.ps1'
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'ChengShang' -Value $command -PropertyType String -Force | Out-Null
Write-Output '承·上已设置为用户登录后启动。'
