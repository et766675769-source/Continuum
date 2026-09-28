$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$project = Split-Path -Parent $PSScriptRoot
try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $version = (& $node --version 2>&1 | Out-String).Trim()
  if ($version -notmatch '^v(\d+)' -or [int]$Matches[1] -lt 24) { throw '需要先安装 Node.js 24 或更新版本。' }
  $codex = (Get-Command codex -ErrorAction Stop).Source
  $cli = Join-Path $project 'src\cli.mjs'
  $mcp = Join-Path $project 'src\mcp.mjs'
  $doctor = & $node $cli doctor 2>&1 | Out-String | ConvertFrom-Json
  if (-not $doctor.checks[0].ok) {
    $message = & $codex mcp add cheng_shang -- $node $mcp 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
  }
  $message = & $node $cli install-hooks 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
  & (Join-Path $PSScriptRoot 'install-autostart.ps1') | Out-Null
  & (Join-Path $PSScriptRoot 'Start.ps1')
  [void][System.Windows.Forms.MessageBox]::Show('承·上已安装并启动。请在 Codex 输入 /hooks 审阅并信任钩子；在小窗“接入检查”中指定对话。', '承·上')
} catch {
  [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：安装失败')
  exit 1
}