$project = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $project 'storage.json'
$storage = if (Test-Path -LiteralPath $configFile) { (Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json).activeDir } else { $null }
if (-not $storage) { $storage = Join-Path $project 'data' }
$nodePathFile = Join-Path $storage 'node-path.txt'
$node = if (Test-Path -LiteralPath $nodePathFile) { Get-Content -LiteralPath $nodePathFile -Raw -Encoding UTF8 } else { (Get-Command node -ErrorAction Stop).Source }
$node = $node.Trim()
$watcher = Join-Path $project 'src\cli.mjs'
Start-Process -FilePath $node -ArgumentList @('"' + $watcher + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'widget.ps1') + '"')) -WorkingDirectory $project -WindowStyle Hidden