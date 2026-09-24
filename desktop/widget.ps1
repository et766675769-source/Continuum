$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\ChengShangWidget', [ref]$created)
if (-not $created) { $mutex.Dispose(); exit }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$statusFile = Join-Path $PSScriptRoot '..\data\status.json'
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form = New-Object System.Windows.Forms.Form
$form.Text = '承·上'
$form.Size = New-Object System.Drawing.Size(264, 88)
$form.FormBorderStyle = 'None'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(($area.Right - 264), ($area.Top + 30))
$form.BackColor = [System.Drawing.Color]::FromArgb(29, 34, 42)
$form.ForeColor = [System.Drawing.Color]::White
$normalColor = $form.BackColor
$highlightColor = [System.Drawing.Color]::FromArgb(65, 220, 183)
$round = [System.Drawing.Drawing2D.GraphicsPath]::new()
$diameter = 18
$round.AddArc(0, 0, $diameter, $diameter, 180, 90)
$round.AddArc(($form.Width - $diameter - 1), 0, $diameter, $diameter, 270, 90)
$round.AddArc(($form.Width - $diameter - 1), ($form.Height - $diameter - 1), $diameter, $diameter, 0, 90)
$round.AddArc(0, ($form.Height - $diameter - 1), $diameter, $diameter, 90, 90)
$round.CloseFigure()
$form.Region = [System.Drawing.Region]::new($round)
$form.Add_Paint({
  param($sender, $e)
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(78, 92, 106), 1)
  try {
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $e.Graphics.DrawPath($pen, $round)
  } finally { $pen.Dispose() }
})

$label = New-Object System.Windows.Forms.Label
$label.Dock = 'Fill'
$label.Padding = New-Object System.Windows.Forms.Padding(12, 10, 4, 4)
$label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 8.5)
$label.BackColor = [System.Drawing.Color]::Transparent
$label.Text = "承·上  等待同步..."
$form.Controls.Add($label)

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$exit = $menu.Items.Add('退出')
$exit.Add_Click({ $form.Close() })
$form.ContextMenuStrip = $menu
$label.ContextMenuStrip = $menu

$script:edge = 'right'
$script:hidden = $false
$script:dragging = $false
$script:expandedLocation = $form.Location
$script:hideAt = [DateTime]::UtcNow.AddMilliseconds(800)
$script:ticks = 0

$mouseDown = {
  param($sender, $e)
  if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  $script:dragging = $true
  $script:dragStart = [System.Windows.Forms.Cursor]::Position
  $script:formStart = $form.Location
}
$mouseMove = {
  if (-not $script:dragging) { return }
  $cursor = [System.Windows.Forms.Cursor]::Position
  $screen = [System.Windows.Forms.Screen]::FromPoint($cursor).WorkingArea
  $x = [Math]::Max($screen.Left, [Math]::Min($screen.Right - $form.Width, $script:formStart.X + $cursor.X - $script:dragStart.X))
  $y = [Math]::Max($screen.Top, [Math]::Min($screen.Bottom - $form.Height, $script:formStart.Y + $cursor.Y - $script:dragStart.Y))
  $form.Location = New-Object System.Drawing.Point($x, $y)
}
$mouseUp = {
  if (-not $script:dragging) { return }
  $script:dragging = $false
  $script:expandedLocation = $form.Location
  $screen = [System.Windows.Forms.Screen]::FromRectangle($form.Bounds).WorkingArea
  $distances = @{
    left = $form.Left - $screen.Left
    right = $screen.Right - $form.Right
    top = $form.Top - $screen.Top
    bottom = $screen.Bottom - $form.Bottom
  }
  $nearest = $distances.GetEnumerator() | Sort-Object Value | Select-Object -First 1
  $script:edge = if ($nearest.Value -le 20) { $nearest.Key } else { '' }
  $script:hideAt = [DateTime]::UtcNow.AddMilliseconds(600)
}
foreach ($control in @($form, $label)) {
  $control.Add_MouseDown($mouseDown)
  $control.Add_MouseMove($mouseMove)
  $control.Add_MouseUp($mouseUp)
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 150
$timer.Add_Tick({
  $script:ticks++
  if ($script:ticks -ge 20) {
    $script:ticks = 0
    try {
      $status = Get-Content -LiteralPath $statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $age = ([DateTime]::UtcNow - [DateTime]::Parse($status.at).ToUniversalTime()).TotalSeconds
      $health = if ($age -gt 30) { '监控未运行' } elseif ($status.connected) { '已接入 Codex' } elseif ($status.configured) { '已配置 Codex' } else { '未接入 Codex' }
      if ($status.errors.Count -gt 0 -or $status.error) { $health = '同步异常' }
      $current = $status.selected | Sort-Object ratio -Descending | Select-Object -First 1
      $window = if ($null -ne $current) { "窗口 $($current.ratio)%  ($($current.inputTokens) / $($current.contextWindow) tokens)" } else { '窗口 --' }
      $label.Text = "承·上  $health`n$window`n归档 $($status.chars) 字 / $($status.chunks) 段"
    } catch { $label.Text = "承·上  等待监控启动..." }
  }

  if (-not $script:edge -or $script:dragging) { return }
  $cursor = [System.Windows.Forms.Cursor]::Position
  if ($script:hidden) {
    $hot = New-Object System.Drawing.Rectangle(($form.Left - 24), ($form.Top - 24), ($form.Width + 48), ($form.Height + 48))
    if ($hot.Contains($cursor)) {
      $form.Location = $script:expandedLocation
      $form.BackColor = $normalColor
      $script:hidden = $false
      $script:hideAt = [DateTime]::UtcNow.AddMilliseconds(700)
    }
  } elseif ($form.Bounds.Contains($cursor)) {
    $script:hideAt = [DateTime]::UtcNow.AddMilliseconds(600)
  } elseif ([DateTime]::UtcNow -ge $script:hideAt) {
    $screen = [System.Windows.Forms.Screen]::FromRectangle($form.Bounds).WorkingArea
    $x = $form.Left; $y = $form.Top
    if ($script:edge -eq 'right') { $x = $screen.Right - 5 }
    elseif ($script:edge -eq 'left') { $x = $screen.Left - $form.Width + 5 }
    elseif ($script:edge -eq 'top') { $y = $screen.Top - $form.Height + 5 }
    elseif ($script:edge -eq 'bottom') { $y = $screen.Bottom - 5 }
    $form.Location = New-Object System.Drawing.Point($x, $y)
    $form.BackColor = $highlightColor
    $script:hidden = $true
  }
})
$timer.Start()
try { [void]$form.ShowDialog() }
finally { $timer.Stop(); $round.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
