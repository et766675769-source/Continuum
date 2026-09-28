param([Parameter(Mandatory=$true)][string]$Node,[Parameter(Mandatory=$true)][string]$Cli)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
function Call([string[]]$argv) {
  $result = & $Node $Cli @argv 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw $result.Trim() }
  return ($result | ConvertFrom-Json)
}
$form = New-Object System.Windows.Forms.Form
$form.Text = '承·上 · 重点记忆'
$form.Size = New-Object System.Drawing.Size(740, 480)
$form.MinimumSize = New-Object System.Drawing.Size(600, 400)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$mode = New-Object System.Windows.Forms.ComboBox
$mode.DropDownStyle = 'DropDownList'
$mode.Items.AddRange(@('待审阅候选','已保存记忆'))
$mode.Location = New-Object System.Drawing.Point(12, 12)
$mode.Size = New-Object System.Drawing.Size(140, 28)
$form.Controls.Add($mode)
$help = New-Object System.Windows.Forms.Label
$help.Text = '候选只是提示。核对来源、修改表述后保存，AI 才能读取。'
$help.Location = New-Object System.Drawing.Point(164, 16)
$help.AutoSize = $true
$form.Controls.Add($help)
$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(12, 48)
$list.Size = New-Object System.Drawing.Size(690, 240)
$list.Anchor = 'Top,Left,Right,Bottom'
$list.HorizontalScrollbar = $true
$form.Controls.Add($list)
$kind = New-Object System.Windows.Forms.ComboBox
$kind.DropDownStyle = 'DropDownList'
$kind.Items.AddRange(@('decision','constraint','todo'))
$kind.Location = New-Object System.Drawing.Point(12, 302)
$kind.Size = New-Object System.Drawing.Size(120, 28)
$kind.Anchor = 'Left,Bottom'
$form.Controls.Add($kind)
$note = New-Object System.Windows.Forms.TextBox
$note.Multiline = $true
$note.Location = New-Object System.Drawing.Point(140, 302)
$note.Size = New-Object System.Drawing.Size(560, 68)
$note.Anchor = 'Left,Right,Bottom'
$form.Controls.Add($note)
$save = New-Object System.Windows.Forms.Button
$save.Text = '确认保存 / 修改'
$save.Location = New-Object System.Drawing.Point(12, 382)
$save.Size = New-Object System.Drawing.Size(128, 30)
$save.Anchor = 'Left,Bottom'
$form.Controls.Add($save)
$retire = New-Object System.Windows.Forms.Button
$retire.Text = '作废'
$retire.Location = New-Object System.Drawing.Point(148, 382)
$retire.Size = New-Object System.Drawing.Size(70, 30)
$retire.Anchor = 'Left,Bottom'
$form.Controls.Add($retire)
function Refresh-List {
  $script:rows = if ($mode.SelectedIndex -eq 0) { @(Call @('candidates','50')) } else { @(Call @('pins','all')) }
  $list.Items.Clear()
  foreach ($item in $script:rows) {
    $label = if ($mode.SelectedIndex -eq 0) { "[$($item.kind)] $($item.project) · $($item.excerpt)" }
      else { "[$($item.status) / $($item.kind)] $($item.note) · 来源 $($item.session_id):$($item.line_no)" }
    [void]$list.Items.Add($label)
  }
  $retire.Enabled = $mode.SelectedIndex -eq 1
}
$mode.Add_SelectedIndexChanged({ try { Refresh-List } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message) } })
$list.Add_SelectedIndexChanged({
  if ($list.SelectedIndex -lt 0) { return }
  $item = $script:rows[$list.SelectedIndex]
  $kind.SelectedItem = $item.kind
  $note.Text = if ($mode.SelectedIndex -eq 0) { $item.excerpt } else { $item.note }
})
$save.Add_Click({
  try {
    if ($list.SelectedIndex -lt 0) { throw '请先选择一条。' }
    $item = $script:rows[$list.SelectedIndex]
    if ($mode.SelectedIndex -eq 0) { [void](Call @('pin',[string]$item.id,[string]$kind.SelectedItem,$note.Text)) }
    else { [void](Call @('update-pin',[string]$item.id,$note.Text)) }
    Refresh-List
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：保存失败') }
})
$retire.Add_Click({
  try {
    if ($list.SelectedIndex -lt 0) { throw '请先选择一条记忆。' }
    if ([System.Windows.Forms.MessageBox]::Show('标记为作废？原对话仍保留。','承·上','YesNo') -ne 'Yes') { return }
    [void](Call @('retire-pin',[string]$script:rows[$list.SelectedIndex].id))
    Refresh-List
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'承·上：作废失败') }
})
$mode.SelectedIndex = 0
try { [void]$form.ShowDialog() } finally { $form.Dispose() }