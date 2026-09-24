param(
  [Parameter(Mandatory=$true)][string]$Node,
  [Parameter(Mandatory=$true)][string]$Cli
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$recentText = & $Node $Cli list 200 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw $recentText.Trim() }
$statusText = & $Node $Cli status 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw $statusText.Trim() }
$recent = @($recentText | ConvertFrom-Json)
$status = $statusText | ConvertFrom-Json
$selected = @{}
foreach ($item in $status.selected) { $selected[$item.id] = $true }
$items = New-Object System.Collections.ArrayList
foreach ($item in $recent) { if ($item -and $item.id) { [void]$items.Add($item) } }
foreach ($item in $status.selected) {
  if (-not (@($items | Where-Object id -eq $item.id).Count)) { [void]$items.Add($item) }
}

$dialog = New-Object System.Windows.Forms.Form
$dialog.Text = '承·上 · 指定对话'
$dialog.Size = New-Object System.Drawing.Size(680, 460)
$dialog.MinimumSize = New-Object System.Drawing.Size(540, 360)
$dialog.StartPosition = 'CenterScreen'
$dialog.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$dialog.BackColor = [System.Drawing.Color]::White
$intro = New-Object System.Windows.Forms.Label
$intro.Dock = 'Top'
$intro.Height = 48
$intro.Padding = New-Object System.Windows.Forms.Padding(12, 12, 0, 0)
$intro.Text = '勾选需要归档的 Codex 对话。每个对话会自动存入独立文件夹。'
$dialog.Controls.Add($intro)
$list = New-Object System.Windows.Forms.CheckedListBox
$list.Dock = 'Fill'
$list.CheckOnClick = $true
$list.HorizontalScrollbar = $true
foreach ($item in $items) {
  $label = "$($item.created)  $($item.cwd)  [$($item.id)]"
  [void]$list.Items.Add($label, [bool]$selected[$item.id])
}
$dialog.Controls.Add($list)
$bottom = New-Object System.Windows.Forms.Panel
$bottom.Dock = 'Bottom'
$bottom.Height = 54
$dialog.Controls.Add($bottom)
$save = New-Object System.Windows.Forms.Button
$save.Text = '保存选择'
$save.Size = New-Object System.Drawing.Size(96, 30)
$save.Location = New-Object System.Drawing.Point(12, 11)
$bottom.Controls.Add($save)
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = '取消'
$cancel.Size = New-Object System.Drawing.Size(72, 30)
$cancel.Location = New-Object System.Drawing.Point(118, 11)
$cancel.Add_Click({ $dialog.Close() })
$bottom.Controls.Add($cancel)
$save.Add_Click({
  $dialog.UseWaitCursor = $true
  try {
    for ($i = 0; $i -lt $items.Count; $i++) {
      $id = $items[$i].id
      $want = $list.GetItemChecked($i)
      if ($want -eq [bool]$selected[$id]) { continue }
      $action = if ($want) { 'add' } else { 'remove' }
      $message = & $Node $Cli $action $id 2>&1 | Out-String
      if ($LASTEXITCODE -ne 0) { throw "$id : $($message.Trim())" }
      $selected[$id] = $want
    }
    $dialog.Close()
  } catch {
    [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：保存失败')
  } finally { $dialog.UseWaitCursor = $false }
})
[void]$dialog.ShowDialog()
$dialog.Dispose()