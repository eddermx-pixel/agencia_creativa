# Imagen para Railway: Node 22 + Chromium + ffmpeg (render de videos en el servidor)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ffmpeg ca-certificates fonts-liberation fonts-noto-color-emoji fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# Navegador de HyperFrames (se descarga una vez al construir la imagen)
RUN node node_modules/hyperframes/bin/hyperframes.mjs browser ensure || true
# Navegador de Remotion
RUN node -e "import('@remotion/renderer').then((m) => m.ensureBrowser()).then(() => console.log('remotion browser ok'))" || true

CMD ["npm", "start"]
