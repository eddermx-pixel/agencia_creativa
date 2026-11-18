#!/usr/bin/env bash
# Respaldo de los datos de la agencia que NO están en git (base + archivos de clientes del volumen de Railway).
# Baja el ZIP desde /api/respaldo/zip, lo verifica, lo guarda en ~/Respaldos-agencia y lo sube a Google Drive con rclone.
# Config (no va al repo): ~/.config/agencia-respaldo.env con
#   AGENCIA_URL=https://tu-app.up.railway.app
#   AGENCIA_KEY=la ACCESS_KEY de la agencia
#   DRIVE_REMOTE=gdrive:Respaldos-agencia   (opcional; remoto de rclone, carpeta incluida)
#   KEEP=8                                  (opcional; cuántos respaldos guardar, en local y en Drive)
set -euo pipefail

CONF="${AGENCIA_RESPALDO_ENV:-$HOME/.config/agencia-respaldo.env}"
[ -f "$CONF" ] && . "$CONF"
: "${AGENCIA_URL:?Falta AGENCIA_URL en $CONF}"
DRIVE_REMOTE="${DRIVE_REMOTE:-gdrive:Respaldos-agencia}"
KEEP="${KEEP:-8}"
DIR="$HOME/Respaldos-agencia"
mkdir -p "$DIR"

ARCHIVO="$DIR/respaldo-agencia-$(date +%F_%H%M).zip"
TMP="$ARCHIVO.part"
trap 'rm -f "$TMP"' EXIT

# La clave va en un encabezado (no en la URL) para que no quede en logs.
curl -fsS --retry 3 --max-time 1800 ${AGENCIA_KEY:+-H "x-access-key: $AGENCIA_KEY"} "${AGENCIA_URL%/}/api/respaldo/zip" -o "$TMP"
unzip -tq "$TMP" >/dev/null                      # si el ZIP está truncado o dañado, aborta aquí
unzip -l "$TMP" | grep ' db.json$' >/dev/null          # y debe traer la base
mv "$TMP" "$ARCHIVO"
echo "Respaldo local: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

if command -v rclone >/dev/null && rclone listremotes | grep "^${DRIVE_REMOTE%%:*}:" >/dev/null; then
  rclone copy "$ARCHIVO" "$DRIVE_REMOTE"
  echo "Subido a $DRIVE_REMOTE"
  # Conserva solo los últimos KEEP en Drive
  rclone lsf "$DRIVE_REMOTE" --files-only | grep '^respaldo-agencia-.*\.zip$' | sort | head -n -"$KEEP" | while read -r viejo; do rclone deletefile "$DRIVE_REMOTE/$viejo"; done
else
  echo "AVISO: rclone o el remoto '${DRIVE_REMOTE%%:*}' no está configurado; el respaldo quedó solo en $DIR" >&2
fi

ls -1 "$DIR"/respaldo-agencia-*.zip | sort | head -n -"$KEEP" | xargs -r rm -f
