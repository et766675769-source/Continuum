$project = Split-Path -Parent $PSScriptRoot
$nodePathFile = Join-Path $project 'data\node-path.txt'
$node = if (Test-Path -LiteralPath $nodePathFile) { Get-Content -LiteralPath $nodePathFile -Raw -Encoding UTF8 } else { (Get-Command node -ErrorAction Stop).Source }
$node = $node.Trim()
$watcher = Join-Path $project 'src\cli.mjs'
Start-Process -FilePath $node -ArgumentList @('"' + $watcher + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'widget.ps1') + '"')) -WorkingDirectory $project -WindowStyle Hidden
