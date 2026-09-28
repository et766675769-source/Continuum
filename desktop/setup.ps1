param(
  [string]$Node,
  [string]$Cli
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$project = Split-Path -Parent $PSScriptRoot
if (-not $Cli) { $Cli = Join-Path $project 'src\cli.mjs' }
if (-not $Node) { $Node = (Get-Command node -ErrorAction Stop).Source }

$dialog = New-Object System.Windows.Forms.Form
$dialog.Text = '承·上 · 接入检查'
$dialog.Size = New-Object System.Drawing.Size(640, 440)
$dialog.MinimumSize = New-Object System.Drawing.Size(560, 380)
$dialog.StartPosition = 'CenterScreen'
$dialog.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$dialog.BackColor = [System.Drawing.Color]::White
$details = New-Object System.Windows.Forms.TextBox
$details.Multiline = $true
$details.ReadOnly = $true
$details.ScrollBars = 'Vertical'
$details.Dock = 'Fill'
$details.BackColor = [System.Drawing.Color]::White
$details.BorderStyle = 'None'
$dialog.Controls.Add($details)
$buttons = New-Object System.Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Bottom'
$buttons.Height = 50
$buttons.Padding = New-Object System.Windows.Forms.Padding(8, 8, 0, 0)
$dialog.Controls.Add($buttons)

function Refresh-Checks {
  $result = & $Node $Cli doctor 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $result.Trim() }
  $script:doctor = $result | ConvertFrom-Json
  $lines = @(
    $(if ($script:doctor.ready) { '归档、检索和后台监控均可用。' } else { '按以下提示完成接入或修复。' }),
    "Codex 当前连接：$(if ($script:doctor.connected) { '已连接' } else { '待连接（打开新的 Codex 任务后再检查）' })",
    "存放路径：$($script:doctor.storage)",
    "已选对话：$($script:doctor.selected) 个；待归档：$([Math]::Round($script:doctor.pendingBytes / 1MB, 1)) MB",
    ''
  )
  foreach ($check in $script:doctor.checks) {
    $lines += "$(if ($check.ok) { '✓' } else { '○' }) $($check.name)"
    if (-not $check.ok) { $lines += "    $($check.action)" }
  }
  $lines += @('', '钩子安装后须在 Codex 输入 /hooks 审阅并信任；程序不能代替你完成。', '更改存放路径：在小窗或托盘菜单选择“设置存放路径”。')
  $details.Lines = $lines
}
function Run-Action([scriptblock]$action) {
  $dialog.UseWaitCursor = $true
  try { & $action; Refresh-Checks }
  catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：操作失败') }
  finally { $dialog.UseWaitCursor = $false }
}
function Add-Button([string]$name, [scriptblock]$action) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $name
  $button.AutoSize = $true
  $button.Add_Click($action)
  [void]$buttons.Controls.Add($button)
}
Add-Button '接入 Codex' {
  Run-Action {
    $codex = (Get-Command codex -ErrorAction Stop).Source
    if (-not $script:doctor.checks[0].ok) {
      $message = & $codex mcp add cheng_shang -- $Node (Join-Path $project 'src\mcp.mjs') 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
    }
    $message = & $Node $Cli install-hooks 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
    [void][System.Windows.Forms.MessageBox]::Show('接入配置已安装。请在 Codex 输入 /hooks 审阅并信任承·上的钩子，再打开新的 Codex 任务。', '承·上')
  }
}
Add-Button '指定对话' {
  Run-Action { & (Join-Path $PSScriptRoot 'select-sessions.ps1') -Node $Node -Cli $Cli }
}
Add-Button '启动监控' {
  Run-Action {
    $pidFile = Join-Path $script:doctor.storage 'watch.pid'
    if (Test-Path -LiteralPath $pidFile) {
      $watchPid = [int](Get-Content -LiteralPath $pidFile -Raw)
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$watchPid"
      if ($process) {
        if (-not $process.CommandLine.Contains($Cli) -or -not $process.CommandLine.Contains(' watch')) { throw '后台进程身份不匹配，未执行重启。' }
        Stop-Process -Id $watchPid -ErrorAction Stop
        try { Wait-Process -Id $watchPid -Timeout 5 -ErrorAction Stop } catch {}
      }
    }
    Start-Process -FilePath $Node -ArgumentList @('"' + $Cli + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden
    Start-Sleep -Seconds 1
  }
}
Add-Button '重新检查' { Run-Action {} }
Add-Button '关闭' { $dialog.Close() }
try { Refresh-Checks; [void]$dialog.ShowDialog() }
finally { $dialog.Dispose() }