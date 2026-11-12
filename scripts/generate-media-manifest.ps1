# Regenerates supabase/functions/dfabulous-api/lib/media-manifest.ts
# from the committed static assets in public/images/gallery and public/videos.
# Run from the repository root: powershell -File scripts/generate-media-manifest.ps1
$ErrorActionPreference = 'Stop'
$gallery = Get-ChildItem public\images\gallery -File |
  Where-Object { $_.Name -match '\.(avif|gif|jpe?g|png|webp)$' -and $_.Name -notmatch '-(400|800|1200|1600)w\.' } |
  Sort-Object { [regex]::Replace($_.Name, '\d+', { $args[0].Value.PadLeft(10, '0') }) } |
  Select-Object -ExpandProperty Name
$videos = Get-ChildItem public\videos -File |
  Where-Object { $_.Name -match '\.(mp4|webm|ogg|mov|m4v)$' } |
  Sort-Object { [regex]::Replace($_.Name, '\d+', { $args[0].Value.PadLeft(10, '0') }) } |
  Select-Object -ExpandProperty Name
$thumbs = Get-ChildItem public\images\video-thumbnails -File | Select-Object -ExpandProperty Name
$lines = @()
$lines += '// GENERATED FILE - media manifest for Vercel-hosted static assets.'
$lines += '// Regenerate with: scripts/generate-media-manifest.ps1 (lists public/images/gallery and public/videos).'
$lines += ''
$lines += 'export const GALLERY_FILENAMES: string[] = ['
$gallery | ForEach-Object { $lines += "  '$_'," }
$lines += '];'
$lines += ''
$lines += 'export const VIDEO_FILES: { filename: string; hasThumbnail: boolean }[] = ['
$videos | ForEach-Object {
  $base = [IO.Path]::GetFileNameWithoutExtension($_)
  $has = if ($thumbs -contains "$base.jpg") { 'true' } else { 'false' }
  $lines += "  { filename: '$_', hasThumbnail: $has },"
}
$lines += '];'
Set-Content -Path "supabase\functions\dfabulous-api\lib\media-manifest.ts" -Value ($lines -join "`n") -Encoding ascii
Write-Host "Manifest written: $($gallery.Count) gallery images, $($videos.Count) videos."
