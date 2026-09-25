# Restore the local Supabase DB data from a backup made by scripts/db-backup.ps1.
# Replaces the rows of every public table in the backup, plus auth users/identities, inside ONE transaction
# (any error -> nothing changes). Table structure is kept as-is: run `supabase start` first after a wipe so the
# migrations have recreated the tables.
#   powershell -File scripts/db-restore.ps1                 # newest .backups/auto/*.dump
#   powershell -File scripts/db-restore.ps1 -File <x.dump>  # a specific backup
# A backup of the current state is taken first, so a restore can itself be undone.
param([string]$File, [string]$Database = 'postgres', [switch]$Yes)

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_dcos-system'
if (-not $File) {
  $File = (Get-ChildItem (Join-Path $PSScriptRoot '..\.backups\auto\dcos_local_*.dump') |
    Sort-Object LastWriteTime | Select-Object -Last 1).FullName
}
if (-not $File -or -not (Test-Path $File)) { throw "No backup file found." }

Write-Output "Restore from: $File  ->  database '$Database'"
if (-not $Yes) {
  $answer = Read-Host "This replaces the current public data and auth users. Type RESTORE to continue"
  if ($answer -ne 'RESTORE') { Write-Output 'Cancelled.'; exit 1 }
}

if ($Database -eq 'postgres') { & (Join-Path $PSScriptRoot 'db-backup.ps1') -KeepDays 30 }

docker cp $File "${container}:/tmp/restore.dump" | Out-Null
# Build one script: FK checks/triggers off, empty the tables present in the backup, load backup rows (COPY with
# column lists, so column order differences don't matter), reset sequences (included in the data section).
$sh = @'
set -e
D=/tmp/restore.dump
{
  echo "set session_replication_role = replica;"
  pg_restore -l $D | awk '$4=="TABLE" && $5=="DATA" && $6=="public" {printf "delete from public.\"%s\";\n", $7}'
  echo "delete from auth.identities; delete from auth.users;"
  pg_restore --data-only -n public -f - $D
  pg_restore --data-only -n auth -t users -t identities -f - $D
} > /tmp/restore.sql
psql -U postgres -d "$1" -q -1 -v ON_ERROR_STOP=1 -f /tmp/restore.sql
'@
# Windows PowerShell mangles quotes in long native arguments, so ship the script as a file.
$tmp = Join-Path $env:TEMP 'dcos_restore.sh'
[IO.File]::WriteAllText($tmp, $sh.Replace("`r`n", "`n"))
docker cp $tmp "${container}:/tmp/restore.sh" | Out-Null
docker exec -e PGOPTIONS='-c client_min_messages=warning' $container sh /tmp/restore.sh $Database
if ($LASTEXITCODE -ne 0) { throw "Restore failed and was rolled back; the database is unchanged." }

$check = docker exec $container psql -U postgres -d $Database -At -c "select 'projects='||(select count(*) from public.projects)||' users='||(select count(*) from auth.users)"
Write-Output "Restored: $check"
