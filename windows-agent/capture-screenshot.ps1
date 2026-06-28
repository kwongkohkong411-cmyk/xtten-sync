param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [Parameter(Mandatory = $false)]
  [ValidateRange(1, 100)]
  [int]$JpegQuality = 70
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

$dir = [System.IO.Path]::GetDirectoryName($OutputPath)
if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path $dir)) {
  New-Item -Path $dir -ItemType Directory -Force | Out-Null
}

$extension = [System.IO.Path]::GetExtension($OutputPath).ToLowerInvariant()
if ($extension -eq '.jpg' -or $extension -eq '.jpeg') {
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } |
    Select-Object -First 1

  if ($null -ne $jpegCodec) {
    $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($qualityEncoder, [int64]$JpegQuality)
    $bitmap.Save($OutputPath, $jpegCodec, $encoderParams)
    $encoderParams.Dispose()
  } else {
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  }
} else {
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $OutputPath
