#!/usr/bin/env bash
# Instala las skills de edición de video para Claude Code, cada una con su método oficial.
# Uso:  bash scripts/instalar-skills.sh
# Requiere: git. (Para renderizar video hace falta además node 22+, python3 y ffmpeg.)
set -euo pipefail
DEST="${HOME:?}/.claude/skills"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP:?}"' EXIT
mkdir -p "$DEST"

copiar() { # origen destino
  if [ -e "$DEST/$2" ]; then echo "  = $2 (ya existe, se actualiza con git pull o bórralo para reinstalar)"; else cp -r "$1" "$DEST/$2"; echo "  + $2"; fi
}

echo "1/4 Edición con IA en 3 niveles (Horizontes IA · Santiago Muñoz)"
if [ -d "$DEST/edicion-3-niveles/.git" ]; then git -C "$DEST/edicion-3-niveles" pull --ff-only || true
else git clone --depth 1 https://github.com/santmun/edicion-3-niveles "$DEST/edicion-3-niveles"; fi

echo "2/4 Remotion (skills oficiales de remotion-dev)"
git clone --depth 1 https://github.com/remotion-dev/skills "$TMP/remotion" >/dev/null 2>&1
for s in "$TMP"/remotion/skills/*/; do copiar "$s" "$(basename "$s")"; done

echo "3/4 HyperFrames (HeyGen · Apache-2.0)"
git clone --depth 1 https://github.com/heygen-com/hyperframes "$TMP/hf" >/dev/null 2>&1
for s in hyperframes hyperframes-cli hyperframes-registry media-use remotion-to-hyperframes reverse-any-video slideshow style-sampling; do copiar "$TMP/hf/skills/$s" "$s"; done
for s in motion-doctrine captions-overlay seam-craft cut-the-curve; do [ -d "$TMP/hf/.claude/skills/$s" ] && copiar "$TMP/hf/.claude/skills/$s" "hf-$s"; done

echo "4/4 Lemo-Opuscar (66 estilos de película hechos en código · MIT)"
echo "  Se instala como plugin dentro de Claude Code:"
echo "    claude plugin marketplace add lemomo-ai/lemo-opuscar"
echo "    claude plugin install lemo-opuscar@lemolab"
echo "  (este proyecto ya lo declara en .claude/settings.json)"

echo
echo "Listo. Para renderizar video necesitas: node 22+, python3 y ffmpeg."
echo "Ojo con las licencias: Remotion pide licencia de pago para empresas (remotion.pro)."
