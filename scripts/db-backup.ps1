# Full backup of the local Supabase DB (all schemas: public, auth, storage, ...) in pg_dump custom format.
# Restore everything:   docker cp <file> supabase_db_dcos-system:/tmp/r.dump
#                       docker exec supabase_db_dcos-system pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/r.dump
# Run by the "DCOS local DB backup" scheduled task; safe to run by hand any time.
param([int]$KeepDays = 7, [int]$KeepMin = 10)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_dcos-system'
$dir = Join-Path $PSScriptRoot '..\.backups\auto'
New-Item -ItemType Directory -Force $dir | Out-Null

$running = docker ps --filter "name=^$container$" --format '{{.Names}}'
if ($running -ne $container) { Write-Output "Skip: $container is not running."; exit 0 }

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$file = Join-Path $dir "dcos_local_$ts.dump"
docker exec $container pg_dump -U postgres -d postgres -Fc -f /tmp/auto_backup.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed ($LASTEXITCODE)" }
docker cp "${container}:/tmp/auto_backup.dump" $file | Out-Null
docker exec $container rm -f /tmp/auto_backup.dump | Out-Null

$projects = docker exec $container psql -U postgres -d postgres -At -c "select count(*) from public.projects"
Write-Output ("Backup {0} ({1:N1} MB, projects={2})" -f $file, ((Get-Item $file).Length / 1MB), $projects)

# Retention: drop files older than $KeepDays, but always keep the newest $KeepMin.
Get-ChildItem $dir -Filter 'dcos_local_*.dump' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepMin | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Force
