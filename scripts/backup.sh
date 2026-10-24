#!/usr/bin/env bash
# Backup manual/agendado (ADR-031 §8). Requer: DATABASE_DIRECT_URL (URL DIRETA do Prisma Postgres, nunca a pooled),
# BACKUP_PASSPHRASE; pg_dump (cliente 17) e gpg instalados.
# Uso: scripts/backup.sh [arquivo-de-saida]   (padrão: finance-AAAAMMDD.dump.gpg)
set -euo pipefail
: "${DATABASE_DIRECT_URL:?defina DATABASE_DIRECT_URL}"
: "${BACKUP_PASSPHRASE:?defina BACKUP_PASSPHRASE}"
OUT="${1:-finance-$(date +%Y%m%d).dump.gpg}"
pg_dump -Fc --no-owner "$DATABASE_DIRECT_URL" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" --symmetric --cipher-algo AES256 -o "$OUT"
echo "Backup criptografado: $OUT"
