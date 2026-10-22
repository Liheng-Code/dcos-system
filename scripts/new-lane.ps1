<#
.SYNOPSIS
  Creates a parallel-work lane: a git worktree + branch for one DCOS module.
  See "Parallel lanes" in .claude/CLAUDE.md.

.EXAMPLE
  .\scripts\new-lane.ps1 -Module qs -Topic boq-alternates
  .\scripts\new-lane.ps1 -Module hr -Topic leave-carry-over -Base main
#>
param(
  [Parameter(Mandatory)]
  [ValidateSet("project", "reporting", "document_control", "planning", "procurement", "qs",
    "construction", "hr", "inventory", "account", "design", "administration")]
  [string]$Module,
  [Parameter(Mandatory)][ValidatePattern("^[a-z0-9-]+$")][string]$Topic,
  # Branch the lane starts from (defaults to the branch currently checked out in the main repo).
  [string]$Base = "",
  [string]$LanesRoot = "D:\dcos-lanes",
  [switch]$SkipInstall
)

# Not "Stop": Windows PowerShell 5.1 turns git's progress output on stderr into a
# terminating error. Native failures are checked with $LASTEXITCODE instead.
$ErrorActionPreference = "Continue"
$repo = (git rev-parse --show-toplevel).Trim()
if (-not $Base) { $Base = (git -C $repo rev-parse --abbrev-ref HEAD).Trim() }

$name = "$Module-$Topic"
$branch = "feat/$name"
$path = Join-Path $LanesRoot $name

if (Test-Path $path) { throw "Lane folder already exists: $path" }

# Uncommitted work in the main checkout is NOT carried into the lane.
$dirty = git -C $repo status --porcelain
if ($dirty) { Write-Warning "Main checkout has uncommitted changes; the lane starts from the last commit on '$Base'." }

# Pick the first free dev port 3001-3003 (3000 is the main checkout).
$used = @(git -C $repo worktree list --porcelain | Select-String '^worktree ' | ForEach-Object {
    $wt = $_.ToString().Substring(9)
    $f = Join-Path $wt ".lane-port"
    if (Test-Path $f) { (Get-Content $f -Raw).Trim() }
  })
$port = @(3001, 3002, 3003) | Where-Object { $used -notcontains "$_" } | Select-Object -First 1
if (-not $port) { throw "Already 3 lanes open (ports 3001-3003 taken). Merge or remove one first." }

New-Item -ItemType Directory -Force $LanesRoot | Out-Null
git -C $repo worktree add -b $branch $path $Base
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

Set-Content -Path (Join-Path $path ".lane-port") -Value $port -Encoding ascii
$envSrc = Join-Path $repo "apps\web\.env.local"
if (Test-Path $envSrc) { Copy-Item $envSrc (Join-Path $path "apps\web\.env.local") }
else { Write-Warning "apps\web\.env.local not found; copy it into the lane by hand." }
# Personal Claude permissions are gitignored, so carry them over too.
$settingsSrc = Join-Path $repo ".claude\settings.local.json"
if (Test-Path $settingsSrc) { Copy-Item $settingsSrc (Join-Path $path ".claude\settings.local.json") }

if (-not $SkipInstall) {
  Push-Location $path
  try {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm install --frozen-lockfile }
    else {
      # pnpm not on PATH: run the version that built the main checkout's node_modules.
      $pm = (Select-String -Path (Join-Path $repo "node_modules\.modules.yaml") -Pattern '"packageManager": "(pnpm@[^"]+)"').Matches.Groups[1].Value
      if (-not $pm) { $pm = "pnpm" }
      npx -y $pm install --frozen-lockfile
    }
    if ($LASTEXITCODE -ne 0) { Write-Warning "pnpm install failed; run it by hand in $path" }
  } finally { Pop-Location }
}

Write-Host ""
Write-Host "Lane ready: $name" -ForegroundColor Green
Write-Host "  folder : $path"
Write-Host "  branch : $branch (from $Base)"
Write-Host "  dev    : cd `"$path\apps\web`"; pnpm dev -p $port"
Write-Host "  open   : code `"$path`"   (then start Claude there, scope = module '$Module')"
Write-Host "  remove : git worktree remove `"$path`"   (after merge)"
