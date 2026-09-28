$project = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $project 'storage.json'
$storage = if (Test-Path -LiteralPath $configFile) { (Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json).activeDir } else { $null }
if (-not $storage) { $storage = Join-Path $project 'data' }
$nodePathFile = Join-Path $storage 'node-path.txt'
$node = if (Test-Path -LiteralPath $nodePathFile) { Get-Content -LiteralPath $nodePathFile -Raw -Encoding UTF8 } else { (Get-Command node -ErrorAction Stop).Source }
$node = $node.Trim()
$version = (& $node --version 2>&1 | Out-String).Trim()
if ($version -notmatch '^v(\d+)' -or [int]$Matches[1] -lt 24) {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show('承·上需要 Node.js 24 或更新版本。', '承·上：无法启动')
  exit 1
}
$watcher = Join-Path $project 'src\cli.mjs'
Start-Process -FilePath $node -ArgumentList @('"' + $watcher + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + (Join-Path $PSScriptRoot 'widget.ps1') + '"')) -WorkingDirectory $project -WindowStyle Hidden