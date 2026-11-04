#!/usr/bin/env bash
# Procurement P2: 50 parallel procurement_next_number calls must produce 50 distinct numbers.
# Needs 50 separate sessions, so it cannot live in the rolled-back SQL suite. It uses the test-only year 2099
# (the p_year argument) and always deletes its sequence row and temp files, also on Ctrl-C or failure (trap).
# Run from Git Bash:
#   bash docs/04-Business-Modules/04-11-Procurement/tests/13-p2-numbering-parallel.sh
set -u
C=supabase_db_dcos-system
PSQL="docker exec -i $C psql -U postgres -d postgres -X -At"
DIR=$(mktemp -d); OUT="$DIR/all"
cleanup() {
  $PSQL -c "delete from procurement_number_seq where year = 2099" < /dev/null >/dev/null 2>&1
  rm -rf "$DIR"
}
trap cleanup EXIT INT TERM
$PSQL -c "delete from procurement_number_seq where year = 2099" < /dev/null >/dev/null
for i in $(seq 1 50); do
  $PSQL -c "select procurement_next_number('PO', null, 2099)" < /dev/null > "$DIR/$i" 2>&1 &
done
wait
cat "$DIR"/[0-9]* > "$OUT"
TOTAL=$(grep -c "^GEN-PO-2099" "$OUT"); DISTINCT=$(grep "^GEN-PO-2099" "$OUT" | sort -u | grep -c .)
LAST=$($PSQL -c "select last_no from procurement_number_seq where kind='PO' and project_key='GEN' and year=2099" < /dev/null)
echo "calls=$TOTAL distinct=$DISTINCT last_no=$LAST sample=$(sort "$OUT" | head -1) .. $(sort "$OUT" | tail -1)"
if [ "$TOTAL" = 50 ] && [ "$DISTINCT" = 50 ] && [ "$LAST" = 50 ]; then echo PASS; else echo FAIL; exit 1; fi
