$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$project = Split-Path -Parent $PSScriptRoot
try {
  $git = (Get-Command git -ErrorAction Stop).Source
  if (-not (Test-Path -LiteralPath (Join-Path $project '.git'))) { throw '此目录不是 Git 克隆。请从 GitHub 获取新版并保留当前 data 目录。' }
  $changes = & $git -C $project status --porcelain --untracked-files=no 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $changes.Trim() }
  if ($changes.Trim()) { throw '项目代码有未提交修改；请先保存这些修改，再运行更新。' }
  $before = (& $git -C $project rev-parse HEAD | Out-String).Trim()
  $message = & $git -C $project fetch origin main 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
  $message = & $git -C $project merge --ff-only FETCH_HEAD 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
  $after = (& $git -C $project rev-parse HEAD | Out-String).Trim()
  if ($after -eq $before) {
    [void][System.Windows.Forms.MessageBox]::Show('已经是最新版本。', '承·上')
    exit 0
  }
  $cli = Join-Path $project 'src\cli.mjs'
  $widget = Join-Path $PSScriptRoot 'widget.ps1'
  foreach ($process in Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'node.exe' -and $_.CommandLine.Contains($cli) -and $_.CommandLine.Contains(' watch')) -or
    ($_.Name -eq 'powershell.exe' -and $_.CommandLine.Contains($widget))
  }) { Stop-Process -Id $process.ProcessId -ErrorAction Stop }
  & (Join-Path $PSScriptRoot 'Install.ps1')
} catch {
  [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：更新失败')
  exit 1
}