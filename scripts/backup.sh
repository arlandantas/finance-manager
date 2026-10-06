#!/usr/bin/env bash
# Backup manual/agendado (ADR-026 §7). Requer: DATABASE_PUBLIC_URL, BACKUP_PASSPHRASE; pg_dump e gpg instalados.
# Uso: scripts/backup.sh [arquivo-de-saida]   (padrão: finance-AAAAMMDD.dump.gpg)
set -euo pipefail
: "${DATABASE_PUBLIC_URL:?defina DATABASE_PUBLIC_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
OUT="${1:-finance-$(date +%Y%m%d).dump.gpg}"
pg_dump -Fc --no-owner "$DATABASE_PUBLIC_URL" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT"
echo "Backup criptografado: $OUT"
