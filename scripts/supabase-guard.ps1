# Dot-sourced from the PowerShell profile. Wraps the `supabase` command so that commands which wipe the
# local DB (`stop --no-backup`, `db reset`) take a backup first and require typing WIPE. Everything else
# passes straight through to the project CLI (node_modules\.bin\supabase.cmd) or a global install.
function supabase {
  $cli = Join-Path (Get-Location) 'node_modules\.bin\supabase.cmd'
  if (-not (Test-Path $cli)) { $cli = 'D:\dcos-system\node_modules\.bin\supabase.cmd' }
  if (-not (Test-Path $cli)) { $cli = (Get-Command supabase.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
  if (-not $cli) { Write-Error 'Supabase CLI not found.'; return }

  $line = ($args -join ' ')
  $wipe = ($line -match '\bstop\b' -and $line -match '--no-backup') -or ($line -match '\bdb\s+reset\b')
  if ($wipe) {
    Write-Host "WARNING: 'supabase $line' ERASES the local database (projects, users, everything)." -ForegroundColor Red
    Write-Host 'A normal `supabase stop` keeps your data. Restore any time with: scripts\db-restore.ps1' -ForegroundColor Yellow
    if ((Read-Host 'Type WIPE to back up and continue') -ne 'WIPE') { Write-Host 'Cancelled - nothing was changed.'; return }
    & powershell -NoProfile -ExecutionPolicy Bypass -File 'D:\dcos-system\scripts\db-backup.ps1' -KeepDays 30
    if ($LASTEXITCODE -ne 0) { Write-Host 'Backup failed - wipe cancelled.' -ForegroundColor Red; return }
  }
  & $cli @args
}
