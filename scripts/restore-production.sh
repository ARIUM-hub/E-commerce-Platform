#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "usage: $0 <backup-file>" >&2
  exit 2
fi

backup_file="$1"
if [[ ! "$backup_file" =~ ^socks-store-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{7,40}\.db\.gz$ ]]; then
  echo "backup file must use the expected filename format" >&2
  exit 2
fi

compose=(docker compose --env-file .env.production -f compose.production.yml)
if "${compose[@]}" ps --status running --services | grep -qx app; then
  echo "app must be stopped before restore" >&2
  exit 1
fi

"${compose[@]}" --profile ops run --rm backup \
  node scripts/restore-database.js \
  --file "$backup_file" \
  --confirm RESTORE

echo "restore completed; start app explicitly and verify /api/ready"
