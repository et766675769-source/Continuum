$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\ChengShangWidget', [ref]$created)
if (-not $created) { $mutex.Dispose(); exit }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$project = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $project 'src\cli.mjs'

function Get-StorageDir {
  $configFile = Join-Path $project 'storage.json'
  if (Test-Path -LiteralPath $configFile) {
    $active = (Get-Content -LiteralPath $configFile -Raw -Encoding UTF8 | ConvertFrom-Json).activeDir
    if ($active) { return $active }
  }
  return (Join-Path $project 'data')
}
$nodeFile = Join-Path (Get-StorageDir) 'node-path.txt'
$node = if (Test-Path -LiteralPath $nodeFile) { (Get-Content -LiteralPath $nodeFile -Raw -Encoding UTF8).Trim() } else { (Get-Command node -ErrorAction Stop).Source }
$script:statusFile = Join-Path (Get-StorageDir) 'status.json'
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
$show = $menu.Items.Add('显示窗口')
$show.Add_Click({
  $form.Show()
  if ($script:hidden) {
    $form.Location = $script:expandedLocation
    $form.BackColor = $normalColor
    $script:hidden = $false
  }
  $script:hideAt = [DateTime]::UtcNow.AddMilliseconds(1500)
  $form.Activate()
})
$hide = $menu.Items.Add('隐藏到系统托盘')
$hide.Add_Click({ $form.Hide() })
[void]$menu.Items.Add('-')
$choose = $menu.Items.Add('设置存放路径...')
$choose.Add_Click({
  $picker = New-Object System.Windows.Forms.FolderBrowserDialog
  $picker.Description = '选择承·上归档数据的新存放目录（不会移动 Codex 原始对话）'
  $picker.SelectedPath = Get-StorageDir
  try {
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $message = & $node $cli storage target $picker.SelectedPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
    [void][System.Windows.Forms.MessageBox]::Show("目标路径已设置：$($picker.SelectedPath)`n请再选择迁移归档数据完成切换。", '承·上')
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：设置失败') }
  finally { $picker.Dispose() }
})
$migrate = $menu.Items.Add('迁移归档数据')
$migrate.Add_Click({
  $restartWatcher = $false
  try {
    $settings = (& $node $cli storage | Out-String | ConvertFrom-Json)
    if (-not $settings.targetDir) { throw '请先选择新的存放路径。' }
    if ($settings.targetDir -eq $settings.activeDir) { throw '新路径与当前路径相同，无需迁移。' }
    $pidFile = Join-Path $settings.activeDir 'watch.pid'
    if (Test-Path -LiteralPath $pidFile) {
      $watchPid = [int](Get-Content -LiteralPath $pidFile -Raw)
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$watchPid"
      if ($process) {
        if (-not $process.CommandLine.Contains($cli) -or -not $process.CommandLine.Contains(' watch')) { throw '后台进程身份不匹配，迁移已取消。' }
        Stop-Process -Id $watchPid -ErrorAction Stop
        try { Wait-Process -Id $watchPid -Timeout 5 -ErrorAction Stop } catch {}
      }
    }
    $restartWatcher = $true
    $message = & $node $cli storage migrate 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw $message.Trim() }
    $script:statusFile = Join-Path (Get-StorageDir) 'status.json'
    Start-Process -FilePath $node -ArgumentList @('"' + $cli + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden
    $restartWatcher = $false
    [void][System.Windows.Forms.MessageBox]::Show("归档已迁移到 $((Get-StorageDir))。旧目录保留作备份，Codex 原始对话未移动。请重新打开当前 Codex 任务以连接新归档。", '承·上')
  } catch { [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '承·上：迁移失败') }
  finally {
    if ($restartWatcher) { Start-Process -FilePath $node -ArgumentList @('"' + $cli + '"', 'watch') -WorkingDirectory $project -WindowStyle Hidden }
  }
})
[void]$menu.Items.Add('-')
$exit = $menu.Items.Add('退出')
$script:reallyExit = $false
$exit.Add_Click({ $script:reallyExit = $true; $form.Close() })
$form.Add_FormClosing({ param($sender, $e)
  if (-not $script:reallyExit) { $e.Cancel = $true; $form.Hide() }
})
$form.ContextMenuStrip = $menu
$label.ContextMenuStrip = $menu
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Information
$tray.Text = '承·上'
$tray.ContextMenuStrip = $menu
$tray.Visible = $true
$tray.Add_DoubleClick({ $show.PerformClick() })

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
      $script:statusFile = Join-Path (Get-StorageDir) 'status.json'
      $status = Get-Content -LiteralPath $script:statusFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $age = ([DateTime]::UtcNow - [DateTime]::Parse($status.at).ToUniversalTime()).TotalSeconds
      $health = if ($age -gt 30) { '监控未运行' } elseif ($status.connected) { '已接入 Codex' } elseif ($status.configured) { '已配置 Codex' } else { '未接入 Codex' }
      if ($status.errors.Count -gt 0 -or $status.error) { $health = '同步异常' }
      $current = $status.selected | Sort-Object ratio -Descending | Select-Object -First 1
      $window = if ($null -ne $current) { "窗口 $($current.ratio)%  ($($current.inputTokens) / $($current.contextWindow) tokens)" } else { '窗口 --' }
      $label.Text = "承·上  $health`n$window`n归档 $($status.chars) 字 / $($status.chunks) 段"
    } catch { $label.Text = "承·上  等待监控启动..." }
  }

  if (-not $form.Visible -or -not $script:edge -or $script:dragging) { return }
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
try { [System.Windows.Forms.Application]::Run($form) }
finally { $timer.Stop(); $tray.Visible = $false; $tray.Dispose(); $menu.Dispose(); $round.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose() }
