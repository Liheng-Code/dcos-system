# PreToolUse guard: refuse shell commands that would wipe the local Supabase DB.
# Reads the hook payload (JSON) from stdin; exit 2 blocks the tool call and shows stderr to Claude.
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$cmd = [string]$payload.tool_input.command
if (-not $cmd) { exit 0 }

$patterns = @(
  'supabase(\.cmd)?\b.*\bstop\b.*--no-backup',
  'supabase(\.cmd)?\b.*\bdb\s+reset\b',
  'docker\b.*\bvolume\s+(rm|remove|prune)\b',
  'docker\b.*\bsystem\s+prune\b.*--volumes',
  'docker\b.*\bcompose\b.*\bdown\b.*(-v\b|--volumes)',
  'docker\b.*\brm\b.*-\w*v\w*\b.*supabase_db',
  '\bdrop\s+database\s+(if\s+exists\s+)?"?postgres"?(\s|;|"|$)',
  '\bdrop\s+schema\s+(if\s+exists\s+)?(public|auth|storage)\b',
  '\btruncate\b.*\bpublic\.projects\b'
)
foreach ($p in $patterns) {
  if ($cmd -match $p) {
    [Console]::Error.WriteLine("BLOCKED by .claude/hooks/block-db-wipe.ps1: this command would wipe or destroy the local Supabase DB (matched /$p/). Local data must not be lost. Test migrations with a rolled-back transaction instead (see CLAUDE.md 'Wiping the local DB'). If the user explicitly wants a wipe, they must run it themselves after a verified backup.")
    exit 2
  }
}
exit 0
