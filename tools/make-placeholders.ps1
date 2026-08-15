Add-Type -AssemblyName System.Drawing
$specs = @(
    @{ n = 'social-preview.png'; t = 'dsh-usage cover placeholder' },
    @{ n = 'screenshot.png';     t = 'usage panel overview (placeholder)' },
    @{ n = 'balance.png';        t = 'provider balance (placeholder)' },
    @{ n = 'usage-hitrate.png';  t = 'usage & hit rate (placeholder)' },
    @{ n = 'chart.png';          t = 'token / cost chart (placeholder)' },
    @{ n = 'heatmap.png';        t = 'time / session heatmap (placeholder)' },
    @{ n = 'history.png';        t = 'history + CSV (placeholder)' }
)
$dir = 'F:\Project\dsh-usage\assets'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($s in $specs) {
    $w = 960; $h = 540
    if ($s.n -eq 'social-preview.png') { $w = 1200; $h = 630 }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::FromArgb(238, 240, 244))
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 100, 120))
    $fontSize = [float]26
    if ($s.n -eq 'social-preview.png') { $fontSize = [float]34 }
    $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = 'Center'
    $sf.LineAlignment = 'Center'
    $rect = New-Object System.Drawing.RectangleF(0, 0, $w, $h)
    $g.DrawString($s.t, $font, $brush, $rect, $sf)
    $bmp.Save("$dir\$($s.n)", [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $font.Dispose()
    Write-Host ("wrote " + $s.n)
}
