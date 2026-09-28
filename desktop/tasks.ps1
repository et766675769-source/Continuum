param([Parameter(Mandatory=$true)][string]$Node,[Parameter(Mandatory=$true)][string]$Cli)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
function Call([string[]]$argv) {
  $result = & $Node $Cli @argv 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $result.Trim() }
  return ($result | ConvertFrom-Json)
}
$form = New-Object System.Windows.Forms.Form
$form.Text = '承·上 · 任务续接'
$form.Size = New-Object System.Drawing.Size(850, 590)
$form.MinimumSize = New-Object System.Drawing.Size(740, 500)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$tasks = New-Object System.Windows.Forms.ListBox
$tasks.Location = New-Object System.Drawing.Point(12, 12)
$tasks.Size = New-Object System.Drawing.Size(245, 430)
$tasks.Anchor = 'Top,Bottom,Left'
$form.Controls.Add($tasks)
$source = New-Object System.Windows.Forms.ComboBox
$source.DropDownStyle = 'DropDownList'
$source.Location = New-Object System.Drawing.Point(12, 450)
$source.Size = New-Object System.Drawing.Size(245, 28)
$source.Anchor = 'Bottom,Left'
$form.Controls.Add($source)
$create = New-Object System.Windows.Forms.Button
$create.Text = '新建任务'
$create.Location = New-Object System.Drawing.Point(12, 490)
$create.Size = New-Object System.Drawing.Size(80, 30)
$create.Anchor = 'Bottom,Left'
$form.Controls.Add($create)
$link = New-Object System.Windows.Forms.Button
$link.Text = '关联对话'
$link.Location = New-Object System.Drawing.Point(98, 490)
$link.Size = New-Object System.Drawing.Size(80, 30)
$link.Anchor = 'Bottom,Left'
$form.Controls.Add($link)
$refresh = New-Object System.Windows.Forms.Button
$refresh.Text = '刷新'
$refresh.Location = New-Object System.Drawing.Point(184, 490)
$refresh.Size = New-Object System.Drawing.Size(73, 30)
$refresh.Anchor = 'Bottom,Left'
$form.Controls.Add($refresh)
$summary = New-Object System.Windows.Forms.Label
$summary.Location = New-Object System.Drawing.Point(270, 12)
$summary.Size = New-Object System.Drawing.Size(550, 48)
$summary.Anchor = 'Top,Left,Right'
$summary.Text = '选择任务后查看交接状态和来源。'
$form.Controls.Add($summary)
$items = New-Object System.Windows.Forms.ListBox
$items.Location = New-Object System.Drawing.Point(270, 65)
$items.Size = New-Object System.Drawing.Size(550, 280)
$items.Anchor = 'Top,Bottom,Left,Right'
$items.HorizontalScrollbar = $true
$form.Controls.Add($items)
$edit = New-Object System.Windows.Forms.TextBox
$edit.Location = New-Object System.Drawing.Point(270, 355)
$edit.Size = New-Object System.Drawing.Size(550, 82)
$edit.Anchor = 'Bottom,Left,Right'
$edit.Multiline = $true
$form.Controls.Add($edit)
$save = New-Object System.Windows.Forms.Button
$save.Text = '修正所选条目'
$save.Location = New-Object System.Drawing.Point(270, 450)
$save.Size = New-Object System.Drawing.Size(110, 30)
$save.Anchor = 'Bottom,Left'
$form.Controls.Add($save)
$review = New-Object System.Windows.Forms.Button
$review.Text = '确认当前卡片'
$review.Location = New-Object System.Drawing.Point(387, 450)
$review.Size = New-Object System.Drawing.Size(110, 30)
$review.Anchor = 'Bottom,Left'
$form.Controls.Add($review)
$copy = New-Object System.Windows.Forms.Button
$copy.Text = '复制续接提示'
$copy.Location = New-Object System.Drawing.Point(504, 450)
$copy.Size = New-Object System.Drawing.Size(110, 30)
$copy.Anchor = 'Bottom,Left'
$form.Controls.Add($copy)
$rename = New-Object System.Windows.Forms.Button
$rename.Text = '重命名任务'
$rename.Location = New-Object System.Drawing.Point(621, 450)
$rename.Size = New-Object System.Drawing.Size(100, 30)
$rename.Anchor = 'Bottom,Left'
$form.Controls.Add($rename)
$feedback = New-Object System.Windows.Forms.Button
$feedback.Text = '续接反馈'
$feedback.Location = New-Object System.Drawing.Point(728, 450)
$feedback.Size = New-Object System.Drawing.Size(90, 30)
$feedback.Anchor = 'Bottom,Right'
$form.Controls.Add($feedback)
$help = New-Object System.Windows.Forms.Label
$help.Location = New-Object System.Drawing.Point(270, 490)
$help.Size = New-Object System.Drawing.Size(550, 50)
$help.Anchor = 'Bottom,Left,Right'
$help.Text = '卡片由 Codex 根据归档证据建立。修正会保存新版本；过期卡片须重新核对来源。'
$form.Controls.Add($help)
function Refresh-Tasks {
  $script:taskRows = @(Call @('tasks'))
  $script:archives = @(Call @('archives'))
  $tasks.Items.Clear(); $source.Items.Clear()
  foreach ($row in $script:taskRows) { [void]$tasks.Items.Add("#$($row.id) $($row.title) · $($row.project)") }
  foreach ($row in $script:archives) { [void]$source.Items.Add("$($row.id) · $($row.cwd)") }
  if ($source.Items.Count) { $source.SelectedIndex = 0 }
  $script:current = $null
  $items.Items.Clear(); $edit.Clear()
  $summary.Text = '选择任务后查看交接状态和来源。'
}
function Show-Task {
  if ($tasks.SelectedIndex -lt 0) { return }
  $script:current = Call @('resume',[string]$script:taskRows[$tasks.SelectedIndex].id)
  $script:current = $null
  $items.Items.Clear(); $edit.Clear()
  $card = $script:current.checkpoint
  $status = switch ($script:current.status) {
    'reviewed' { '已人工确认' }; 'source-backed' { '有来源，待人工确认' }
    'stale' { '可能过期，需重新核对' }; default { '尚无续接卡，仅显示最近摘录' }
  }
  $summary.Text = "任务 #$($script:current.task.id) $($script:current.task.title)
状态：$status"
  if ($card) {
    foreach ($item in $card.items) {
      $ids = ($item.evidence | ForEach-Object { '#'+$_.id }) -join ', '
      [void]$items.Items.Add("[$($item.kind)] $($item.text)  来源 $ids")
    }
  } else {
    foreach ($item in $script:current.recent) {
      [void]$items.Items.Add("[$($item.role)] $($item.excerpt)  来源 #$($item.id)")
    }
  }
}
$refresh.Add_Click({ try { Refresh-Tasks } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message) } })
$tasks.Add_SelectedIndexChanged({ try { Show-Task } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message) } })
$items.Add_SelectedIndexChanged({
  if ($items.SelectedIndex -ge 0 -and $script:current.checkpoint) {
    $edit.Text = $script:current.checkpoint.items[$items.SelectedIndex].text
  }
})
$create.Add_Click({
  try {
    if ($source.SelectedIndex -lt 0) { throw '请先选择一条已归档对话。' }
    $title = [Microsoft.VisualBasic.Interaction]::InputBox('输入任务名称', '承·上 · 新建任务', '')
    if (-not $title.Trim()) { return }
    [void](Call @('task-create',[string]$script:archives[$source.SelectedIndex].id,$title))
    Refresh-Tasks
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：新建失败') }
})
$rename.Add_Click({
  try {
    if ($tasks.SelectedIndex -lt 0) { throw '请先选择任务。' }
    $id = [string]$script:taskRows[$tasks.SelectedIndex].id
    $title = [Microsoft.VisualBasic.Interaction]::InputBox('修改任务名称', '承·上 · 重命名', $script:taskRows[$tasks.SelectedIndex].title)
    if (-not $title.Trim()) { return }
    [void](Call @('task-rename',$id,$title))
    Refresh-Tasks
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：重命名失败') }
})
$link.Add_Click({
  try {
    if ($tasks.SelectedIndex -lt 0 -or $source.SelectedIndex -lt 0) { throw '请选择任务和已归档对话。' }
    [void](Call @('task-link',[string]$script:taskRows[$tasks.SelectedIndex].id,[string]$script:archives[$source.SelectedIndex].id))
    Refresh-Tasks
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：关联失败') }
})
$items.Add_DoubleClick({
  try {
    if (-not $script:current.checkpoint -or $items.SelectedIndex -lt 0) { return }
    $item = $script:current.checkpoint.items[$items.SelectedIndex]
    $lines = foreach ($evidence in $item.evidence) {
      $actual = Call @('read',[string]$evidence.id)
      if (-not $actual -or $actual.sessionId -ne $evidence.sessionId -or $actual.line -ne $evidence.line) {
        "来源 #$($evidence.id) 已变化，请重新检索和建立卡片。"
      } else { "来源 #$($evidence.id) · $($evidence.sessionId):$($evidence.line)`n$($actual.text.Substring(0,[Math]::Min(800,$actual.text.Length)))" }
    }
    [void][System.Windows.Forms.MessageBox]::Show(($lines -join "`n`n"), '承·上 · 原文依据')
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：读取来源失败') }
})
$save.Add_Click({
  try {
    if (-not $script:current.checkpoint -or $items.SelectedIndex -lt 0) { throw '请选择卡片中的一条内容。' }
    $value = $edit.Text.Trim()
    if (-not $value -or $value.Length -gt 250) { throw '内容须为 1–250 个字符。' }
    $rows = @($script:current.checkpoint.items | ForEach-Object {
      @{ kind=$_.kind; text=$_.text; sourceIds=@($_.evidence | ForEach-Object { [int]$_.id }) }
    })
    $rows[$items.SelectedIndex].text = $value
    $temp = Join-Path $env:TEMP ('chengshang-checkpoint-' + [guid]::NewGuid().ToString() + '.json')
    try {
      [IO.File]::WriteAllText($temp,(ConvertTo-Json -InputObject $rows -Depth 6),[Text.UTF8Encoding]::new($false))
      [void](Call @('checkpoint',[string]$script:current.task.id,$temp))
    } finally { Remove-Item -LiteralPath $temp -ErrorAction SilentlyContinue }
    Show-Task
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：修正失败') }
})
$review.Add_Click({
  try {
    if (-not $script:current.checkpoint) { throw '当前任务没有续接卡。' }
    if ($script:current.status -eq 'stale') { throw '卡片可能过期，请先核对来源并更新。' }
    [void](Call @('review-checkpoint',[string]$script:current.checkpoint.id))
    Show-Task
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：确认失败') }
})
$feedback.Add_Click({
  try {
    if (-not $script:current) { throw '请先选择任务。' }
    $answer = [System.Windows.Forms.MessageBox]::Show('这次使用续接卡继续任务有帮助吗？“是”记录有帮助，“否”记录未帮助。', '承·上 · 续接反馈', 'YesNoCancel')
    if ($answer -eq [System.Windows.Forms.DialogResult]::Cancel) { return }
    $outcome = if ($answer -eq [System.Windows.Forms.DialogResult]::Yes) { 'good' } else { 'bad' }
    [void](Call @('feedback',[string]$script:current.task.id,$outcome))
    $report = Call @('feedback-report')
    [void][System.Windows.Forms.MessageBox]::Show("已记录。累计 $($report.attempts) 次续接反馈。", '承·上')
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：记录失败') }
})
$copy.Add_Click({
  try {
    if (-not $script:current) { throw '请先选择任务。' }
    [System.Windows.Forms.Clipboard]::SetText("继续承·上任务 #$($script:current.task.id)（$($script:current.task.title)）。请先调用 memory_resume 查看续接卡及来源，核对当前文件状态；卡片过期或缺失时检索原文，不要凭摘要推断已完成事项。")
    [void][System.Windows.Forms.MessageBox]::Show('续接提示已复制。', '承·上')
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：复制失败') }
})
try { Refresh-Tasks; [void]$form.ShowDialog() } finally { $form.Dispose() }