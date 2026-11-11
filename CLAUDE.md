# CLAUDE.md — contexto vivo de la Agencia IA

> **Instrucciones para cualquier Claude (Claude Code) que abra este repo — se trabaja desde DOS computadoras.**
> 1. Antes de tocar nada: `git pull` y lee este archivo completo (2 minutos). Detalle de producto en `docs/PROGRESO.md`.
> 2. Al terminar cada tarea o antes de cada `git push`: actualiza las secciones **Estado actual**, **Pendientes** y **Bitácora** de ESTE archivo (fecha, qué hiciste, en qué máquina, qué quedó a medias). Es el canal de comunicación entre las dos máquinas.
> 3. Si encuentras algo aquí que ya no es cierto, corrígelo. No dejes decisiones solo en la conversación.
> 4. El dueño habla español; responde en español. Nunca guardes llaves ni secretos en el repo.

## Qué es
Agencia de marketing operada por agentes de Claude (personajes en una estación espacial 2D). Node.js 22 + Express + WebSocket, base JSON en `/data/db.json`, desplegada en Railway (se despliega sola al hacer push a `main`). Modo DEMO si no hay `ANTHROPIC_API_KEY`. Mapa del código: `docs/PROGRESO.md` §7.

## Reglas del dueño (Edder)
- **Costo primero.** Ya hubo un gasto inesperado de >3,000 MXN por pruebas (ver Bitácora). Nada que llame a la API en bucle o sin límite. No subir el modelo por defecto sin avisar.
- Su plan de Claude (Pro/Max) NO cubre la API: la agencia se factura aparte en platform.claude.com.
- Quiere entregables **finales** (PNG/JPG/MP4/GIF), no HTML/SVG/JSON.
- Quiere videos con motion graphics 3D de buena calidad, pero barato; poder cambiar de modelo para los videos.

## Estado actual
- **Control de gasto** (`server/presupuesto.js`, página `/ajustes-ia.html`): límites por día (US$10), mes (US$100) y campaña (US$8), editables; se revisan ANTES de cada llamada a la API y detienen el trabajo con error + "Reintentar". Modelo general y modelo de videos (Max/Micho) configurables en caliente; por defecto Sonnet 5.5 (antes Opus 5.5 para todo). Tabla de precios en `MODELOS` (ahí y en `server/hub.js` `PRECIOS`: mantener iguales).
- **Caché de prompts** en el bucle de agentes (`conCache` en `server/runtime-claude.js`): antes cada vuelta reenviaba TODO el historial (HTML, SVG, imágenes base64) a precio completo, hasta 60 vueltas.
- **Ya no se reanudan campañas solas al arrancar** (`boot()`; `AUTO_RESUME=1` lo restaura). Antes cada deploy de Railway relanzaba campañas en curso y gastaba IA.
- `MAX_CAMPANAS` por defecto 1 (era 3), `MAX_TURNS` 40 (era 60), `max_tokens` 32000 (era 48000).
- `server/planeacion.js` (plan del mes) NO registraba su gasto: ya lo registra.
- **Archivo**: las miniaturas de video ya no se reproducen (antes todas sonaban a la vez); solo se reproduce al abrir una pieza y se corta al cerrar. Arte: PNG 1080×1350 hecho en el servidor (`server/png.js`, `/api/pieces/:id/png`, y se guarda junto al SVG en "Resultado final").
- Probado: arranque en demo, endpoints de ajustes. **NO probado con la API real** (caché, límites, modelo por tarea) ni el PNG del servidor sin Chromium local.

## Pendientes (en orden)
1. Probar con API real y poco presupuesto (límite diario bajo) UNA campaña corta; revisar en `/uso.html` el costo por llamada y que `cr` (caché leída) sea > 0.
2. Prueba comparativa de modelos para video: Haiku 5.5 vs Sonnet 5.5 con el mismo brief (Micho/HyperFrames); guardar resultados y costo aquí.
3. Entregable final de video: hoy los `v2` se graban a MP4 solo al aprobar (`RENDER_AUTO`); los `hf` ya son MP4. Falta mostrar/descargar el MP4 de `v2` en Archivo y evitar guardar JSON como "final".
4. Motion graphics 3D (Three.js/WebGL dentro de HyperFrames) — aún no hay calidad aceptable; investigar con modelo barato.
5. Exportar GIF y JPG además de PNG.
6. Subir el volumen de Railway (500 MB) si se guardan videos.

## Bitácora (más reciente arriba; formato: fecha · máquina · quién · qué)
- 2026-11-11 · Linux (Omarchy) · Claude Code · Auditoría de costos: causas = bucle sin caché con historial completo, auto-reanudación en cada deploy, Opus para todo, `MAX_CAMPANAS=3`, sin topes de gasto, plan del mes sin contabilizar. Aplicados los arreglos de "Estado actual". Archivo de videos y PNG de arte corregidos. Creado este archivo.
- 2026-11-07 · otra computadora · Claude Code · Subida de archivos a la compu de cada agente; Remotion/HyperFrames con poca memoria (ver `git log`).
