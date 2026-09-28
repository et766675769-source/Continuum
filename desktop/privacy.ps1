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
$form.Text = '承·上 · 归档与隐私'
$form.Size = New-Object System.Drawing.Size(760, 420)
$form.MinimumSize = New-Object System.Drawing.Size(620, 340)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$hint = New-Object System.Windows.Forms.Label
$hint.Text = '可导出或删除承·上的归档。Codex 原始对话不会被修改；同步盘中的云端副本需在同步服务中处理。'
$hint.Dock = 'Top'
$hint.Height = 44
$form.Controls.Add($hint)
$list = New-Object System.Windows.Forms.ListBox
$list.Dock = 'Fill'
$list.HorizontalScrollbar = $true
$form.Controls.Add($list)
$bottom = New-Object System.Windows.Forms.FlowLayoutPanel
$bottom.Dock = 'Bottom'
$bottom.Height = 52
$bottom.Padding = New-Object System.Windows.Forms.Padding(8, 8, 0, 0)
$form.Controls.Add($bottom)
$export = New-Object System.Windows.Forms.Button
$export.Text = '导出所选'
$export.AutoSize = $true
$bottom.Controls.Add($export)
$delete = New-Object System.Windows.Forms.Button
$delete.Text = '删除所选归档'
$delete.AutoSize = $true
$bottom.Controls.Add($delete)
$refresh = New-Object System.Windows.Forms.Button
$refresh.Text = '刷新'
$refresh.AutoSize = $true
$bottom.Controls.Add($refresh)
function Refresh-Archives {
  $script:rows = @(Call @('archives'))
  $list.Items.Clear()
  foreach ($row in $script:rows) {
    [void]$list.Items.Add("$($row.created) · $($row.cwd) · $($row.chunks) 段 · [$($row.id)]")
  }
}
$refresh.Add_Click({ try { Refresh-Archives } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message) } })
$export.Add_Click({
  try {
    if ($list.SelectedIndex -lt 0) { throw '请先选择一条对话。' }
    $id = $script:rows[$list.SelectedIndex].id
    $picker = New-Object System.Windows.Forms.SaveFileDialog
    $picker.Filter = 'JSON Lines (*.jsonl)|*.jsonl'
    $picker.FileName = "$id.jsonl"
    try {
      if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
      [void](Call @('export',$id,$picker.FileName))
      [void][System.Windows.Forms.MessageBox]::Show("已导出到 $($picker.FileName)。", '承·上')
    } finally { $picker.Dispose() }
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：导出失败') }
})
$delete.Add_Click({
  try {
    if ($list.SelectedIndex -lt 0) { throw '请先选择一条对话。' }
    $id = $script:rows[$list.SelectedIndex].id
    $message = "将永久删除承·上对话归档 $id 及其重点记忆？Codex 原始对话不会删除。"
    if ([System.Windows.Forms.MessageBox]::Show($message, '承·上：确认删除', 'YesNo') -ne 'Yes') { return }
    [void](Call @('forget',$id))
    Refresh-Archives
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：删除失败') }
})
try { Refresh-Archives; [void]$form.ShowDialog() }
finally { $form.Dispose() }