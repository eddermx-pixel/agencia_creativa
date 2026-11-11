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

## Datos del dueño — NO perder
- Los **clientes, kits de marca, campañas, memoria y archivos aprobados NO están en git**: viven en el volumen de Railway (`DATA_FILE=/data/db.json` y `/data/clientes/…`). `.gitignore` excluye `data/`, `db*.json` y `.env`: no cambiar eso ni hacer commit de datos.
- Un push a `main` redespliega el contenedor pero el volumen se conserva. Aun así: nunca borrar/recrear el volumen, no cambiar `DATA_FILE`, y todo cambio al esquema de la base debe ser **aditivo** (campos nuevos opcionales, nunca renombrar ni quitar).
- Como no hay respaldo en git, se recomienda respaldo periódico (ZIP por cliente desde Clientes → Archivos, y copias del volumen desde Railway). Pendiente: respaldo automático (ver Pendientes).
- Las pruebas locales (`data/` en la compu) son otra base: sus clientes y campañas de prueba no existen en Railway.

## Cuenta de la API — reglas (sin cifras: el repo es PÚBLICO, no escribir saldos, montos ni nombres de claves)
- La **recarga automática de créditos está APAGADA** a propósito. Antes recargó decenas de veces sin aviso. No pedirle al dueño que la active.
- Los límites de gasto de `/ajustes-ia.html` y el límite mensual de la Consola son un freno deliberado: no quitarlos ni subirlos sin avisar.
- El tope real de gasto es el saldo de créditos. Al probar, usa pocas campañas cortas y revisa el costo en `/uso.html` y en la Consola (API usage / Caching analytics).
- Causa confirmada del gasto de noviembre: casi todo fue esta app corriendo en Opus sin caché. Los arreglos están en "Estado actual". Verificar tras cada cambio que la caché leída sea mayor a 0.
- Los créditos también los consume Claude Code; separa por clave de API en la Consola.

## Estado actual
- **Control de gasto** (`server/presupuesto.js`, página `/ajustes-ia.html`): límites por día (US$10), mes (US$100) y campaña (US$8), editables; se revisan ANTES de cada llamada a la API y detienen el trabajo con error + "Reintentar". Modelo general y modelo de videos (Max/Micho) configurables en caliente; por defecto Sonnet 5.5 (antes Opus 5.5 para todo). Tabla de precios en `MODELOS` (ahí y en `server/hub.js` `PRECIOS`: mantener iguales).
- **Caché de prompts** en el bucle de agentes (`conCache` en `server/runtime-claude.js`): antes cada vuelta reenviaba TODO el historial (HTML, SVG, imágenes base64) a precio completo, hasta 60 vueltas.
- **Ya no se reanudan campañas solas al arrancar** (`boot()`; `AUTO_RESUME=1` lo restaura). Antes cada deploy de Railway relanzaba campañas en curso y gastaba IA.
- `MAX_CAMPANAS` por defecto 1 (era 3), `MAX_TURNS` 40 (era 60), `max_tokens` 32000 (era 48000).
- `server/planeacion.js` (plan del mes) NO registraba su gasto: ya lo registra.
- **Archivo**: las miniaturas de video ya no se reproducen (antes todas sonaban a la vez); solo se reproduce al abrir una pieza y se corta al cerrar. Arte: PNG 1080×1350 hecho en el servidor (`server/png.js`, `/api/pieces/:id/png`, y se guarda junto al SVG en "Resultado final").
- **Voces (ElevenLabs)** (`server/voz.js`, página `/voces.html`): `ELEVENLABS_VOICE_ID` = voces que rotan solas entre videos; `ELEVENLABS_VOICES_EXTRA` = voces que SOLO se usan si la ficha del cliente tiene el campo `voz` (nombre). Así una voz clonada nunca sale en el video de otro cliente por azar. `/voces.html` permite oír una muestra y asignarla a un cliente. No poner IDs ni nombres de voces clonadas en el repo (es público).
- **Efectos de sonido en HyperFrames** (`server/efectos.js`): 9 tipos sintetizados con ffmpeg (gratis); Micho los pide con `efectos:[{tipo,inicio}]` y se mezclan con voz y música. Probado el audio y la mezcla; **falta verlos en una corrida real de Micho** (la primera corrida real se hizo con el servidor sin reiniciar y no los tuvo).
- **Logo del cliente en HyperFrames**: el servidor copia el logo del kit como `assets/logo.png` (antes Micho no lo tenía y `{{LOGO}}` solo sirve en el motor antiguo). **Sin probar en corrida real.**
- **Three.js real en HyperFrames**: probado localmente (con GPU) y funciona (teléfono 3D con luz, escena en función del tiempo, sin internet). `three@0.184.0` (exacto) en `package.json`; `producir()` copia `three.module.js` y `three.core.js` a `assets/three/` si el HTML lo usa; la guía 9c en `hfGuide()` explica cómo. **Todavía ningún video de Micho lo ha usado** (las dos corridas reales se hicieron con el servidor sin reiniciar). Riesgo abierto: en Railway no hay GPU; falta probar WebGL por software.
- Instrucciones de Micho: 3D con perspectiva en GSAP (9b) funciona: la 2ª corrida salió con un personaje 3D estilizado (dueño de taquería) hecho solo con CSS 3D.
- Probado con la API real (11-nov, local): caché funciona (lecturas de caché grandes en director y video), límites y modelo por tarea funcionan. Una campaña corta de 1 reel `v2` cuesta centavos (~US$0.10–0.15), casi todo el director. **Falta probar** el PNG del servidor (sin Chromium local) y HyperFrames/Micho con API real.
- **Decisión de modelo para video (prueba comparativa, mismo brief, reel `v2` de 15 s por Max): Sonnet 5.5 se vio MEJOR que Haiku 5.5** según el dueño. Haiku cuesta ~9× menos en el agente de video, pero en esta campaña corta la diferencia total fue de centavos. Se queda Sonnet 5.5 para video; Haiku solo si se necesita abaratar más. Opus 5.5 NO se probó para video: no usarlo sin avisar.

## Pendientes (en orden)
1. **Three.js real**: la prueba gratis ya pasó; falta UNA corrida real de Micho que lo use (reiniciar el servidor antes de lanzarla) y probar WebGL en Railway. Referencia de costo: un video de ~36 s con Micho (Sonnet 5.5) costó ≈ US$1 en total (Micho ≈ 0.43, director ≈ 0.17, música IA ≈ 0.32 estimado, voz ≈ 0.04). Pixel (cliente propio) es el cliente de pruebas.
2. ~~Logo y efectos~~ verificados en la 2ª corrida real (logo oficial en el cierre; efectos sincronizados). Defecto visible: en las escenas de chat el contenido ocupa solo la mitad superior del cuadro; pedir mejor composición vertical a Micho.
2b. **Regla de trabajo:** tras cambiar código del servidor, REINICIARLO antes de una corrida real; las dos primeras corridas de Micho se perdieron parcialmente por no hacerlo.
2. Decidir si vale la pena probar Opus 5.5 solo para motion graphics 3D (mayor calidad, ~2× el costo).
3. Entregable final de video: hoy los `v2` se graban a MP4 solo al aprobar (`RENDER_AUTO`); los `hf` ya son MP4. Falta mostrar/descargar el MP4 de `v2` en Archivo y evitar guardar JSON como "final".
4. Motion graphics 3D (Three.js/WebGL dentro de HyperFrames) — aún no hay calidad aceptable; investigar con modelo barato.
5. Exportar GIF y JPG además de PNG.
6. Subir el volumen de Railway (500 MB) si se guardan videos.
7. **Respaldo automático** de clientes y piezas aprobadas (hoy solo existe en el volumen de Railway). Ideas: ZIP periódico a Google Drive.

## Bitácora (más reciente arriba; formato: fecha · máquina · quién · qué)
- 2026-11-11 · Linux (Omarchy) · Claude Code · 2ª corrida real con Micho (Pixel, caso taquería con el dueño en 3D estilizado, 40.8 s): ≈ US$1.74 en total (Micho ≈ 1.12 con 66 mil tokens de salida; director ≈ 0.17; música IA ≈ 0.36 y voz ≈ 0.05, estimados). Logo y efectos OK. No usó Three.js porque el servidor corría sin la guía 9c (error de proceso: no reinicié). Subido Three.js local + guía.
- 2026-11-11 · Linux (Omarchy) · Claude Code · Primera corrida real de Micho/HyperFrames para el cliente Pixel (video explicativo de chatbot, 36 s, voz + música IA + motion graphics con perspectiva): costó ≈ US$1 en total, caché funcionando. Fallos encontrados y corregidos en código: Micho no tenía el logo (ahora `assets/logo.png` automático) y no había efectos de sonido (nuevos, `server/efectos.js`). Voces: separadas en "rotan" y "solo por cliente", página `/voces.html`. Pendiente verificar ambos en la próxima corrida y probar Three.js.
- 2026-11-11 · Linux (Omarchy) · Claude Code · Prueba con API real: 2 campañas cortas idénticas (Haiku vs Sonnet en video). Ambas terminaron solas con topes de gasto bajos. Sonnet 5.5 elegido para video. `.env.example` corregido (antes traía Opus como modelo por defecto). Las campañas de prueba (cliente ficticio) están solo en la base local.
- 2026-11-11 · Linux (Omarchy) · Claude Code · Revisadas capturas de la Consola con el dueño: confirmada la causa del gasto y apagada la recarga automática. Reglas anotadas arriba, sin cifras.
- 2026-11-11 · Linux (Omarchy) · Claude Code · Auditoría de costos: causas = bucle sin caché con historial completo, auto-reanudación en cada deploy, Opus para todo, `MAX_CAMPANAS=3`, sin topes de gasto, plan del mes sin contabilizar. Aplicados los arreglos de "Estado actual". Archivo de videos y PNG de arte corregidos. Creado este archivo.
- 2026-11-07 · otra computadora · Claude Code · Subida de archivos a la compu de cada agente; Remotion/HyperFrames con poca memoria (ver `git log`).
