# Agencia IA (Pixel): avance del proyecto

*Última actualización: 6 de noviembre de 2026.* Este documento resume todo lo construido, cómo se configura, qué está probado y qué sigue. Se actualiza con cada entrega.

## 1. Qué es

Una agencia de marketing operada por agentes de Claude. Cada agente es un personaje con su rol, su personalidad y su currículum, y trabaja en una estación espacial en 2D. Tú diriges desde la oficina web, el feed tipo Tinder y Telegram.

**Flujo de una campaña:**
1. 📝 **Preguntas:** Dani te hace un cuestionario sobre el brief.
2. 🗣️ **Junta creativa:** todo el equipo propone ideas según su personalidad.
3. 💡 **Concepto:** Dani te lo presenta. Lo apruebas o pides cambios, y entonces hay una nueva junta y un concepto distinto.
4. 🛠️ **Producción:** copy → arte y video → calidad.
5. 📱 **Feed:** apruebas o rechazas deslizando. Si rechazas, el agente hace una nueva versión.
6. 🗂️ **Archivo:** todo queda guardado, con descargas y ZIP.

## 2. El equipo

| | Personaje | Rol | Entrega |
|---|---|---|---|
| 🚀 | Dani (astronauta) | Directora de cuentas | Cuestionario, juntas, concepto, coordinación |
| 🔭 | Iris (alienígena) | Investigadora | Hallazgos de público, competencia y tendencias |
| ✍️ | Teo (astronauta) | Copywriter | Textos (feed) |
| 🎨 | Luna (astronauta) | Diseñadora | Artes 1080×1350 (SVG / PNG) |
| 🎬 | Max (perro astronauta) | Video / motion | Guion de video v2 con B-roll real (feed y exportación) |
| ✅ | Rita (robot) | Control de calidad | Revisión final |

## 3. Funciones (estado)

| Función | Dónde | Estado |
|---|---|---|
| Oficina 2D con personajes, cafetería, sala de juntas, lounge con TV, acuario | Oficina | ✅ Probado |
| Cuestionario → junta creativa → concepto → producción | Oficina / Telegram | ✅ Probado (demo y API simulada) |
| Feed tipo Tinder con versiones al rechazar | `feed.html` | ✅ Probado |
| Clientes con kit de marca (colores, logo, tono, reglas, redes, objetivo) | `clientes.html` | ✅ Probado |
| **Archivos por cliente en carpetas ordenadas** (5 carpetas fijas + subcarpetas; subir, mover, borrar) | Clientes → 📁 Archivos | ✅ Probado |
| **Las referencias visuales del cliente las "ven" Luna y Max** (imágenes en su tarea) | Automático | ⚠️ Probado sin la API real |
| **Alta de clientes por QR** (cuestionario tipo quiz en el celular, crea la ficha y sube materiales) | Clientes → 📱 QR | ✅ Probado |
| **Motor de video v2**: B-roll real (Pexels), 7 transiciones, textos animados, subtítulos palabra por palabra, logo, CTA | Feed / Archivo / `player.html` | ✅ Probado sin B-roll · ⚠️ B-roll real sin probar (falta clave de Pexels) |
| **Exportar video** (MP4 o WebM, según el navegador) | `player.html` → Exportar | ✅ Probado (MP4 en Chrome) |
| **Estilos virales** (10 formatos), elección por marca y sugerencia de Max | `estilos.html` | ✅ Probado |
| **Cursos de actualización** (piden permiso, investigan en internet, nuevas skills en el CV) | Te necesitan / Equipo | ✅ Probado en demo y con API simulada · ⚠️ sin probar con la API real |
| Memoria por cliente y de la agencia | `memoria.html` | ✅ Probado |
| Archivo con versiones, descargas PNG/SVG/JSON/TXT y ZIP | `archivo.html` | ✅ Probado |
| Trabajos que sobreviven reinicios; campañas atoradas se reanudan solas | Automático | ✅ Probado con API simulada |
| Errores visibles con "Reintentar" y aviso por Telegram | Te necesitan | ✅ Probado |
| Uso de IA y costos (mes, hoy, proyección, por agente y campaña, presupuesto) | `uso.html` | ✅ Probado |
| Currículums con historial real y cursos | `equipo.html` | ✅ Probado |
| Telegram (preguntas, conceptos, autorizaciones, cursos, piezas, clientes nuevos) | Bot propio | ⚠️ Probado con API simulada; falta conectar el bot real |

## 4. Configuración (variables en Railway)

| Variable | Para qué | Obligatoria |
|---|---|---|
| `ACCESS_KEY` | Clave para entrar a la oficina | Sí (en internet) |
| `DATA_FILE=/data/db.json` | Base de datos en el disco persistente. Los archivos de clientes viven en `/data/clientes/` | Sí |
| `ANTHROPIC_API_KEY` | Agentes reales con Claude (sin ella: modo demo) | Para trabajo real |
| `PEXELS_API_KEY` | **Tomas reales (B-roll) en los videos.** Gratis en pexels.com/api | Recomendada |
| `PUBLIC_URL` | Enlaces en Telegram y en el QR de alta | Recomendada |
| `MONTHLY_BUDGET` | Presupuesto mensual de IA en US$ (indicador de gasto) | Opcional |
| `CURSO_CADA_DIAS` | Cada cuántos días proponen un curso (por defecto: 7) | Opcional |
| `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` | Avisos y aprobaciones por Telegram | Opcional |
| `CLAUDE_MODEL` y `CLAUDE_EFFORT` | Modelo y esfuerzo (por defecto `claude-opus-5-5`, `medium`) | Opcional |

⚠️ **Disco de Railway:** el volumen se creó de 500 MB. Si los clientes van a subir videos, auméntalo en *Volume → Settings → Size*.

## 5. Historial de entregas

| Fecha | Entrega |
|---|---|
| 05/11/2026 | Oficina de agentes, feed tipo swipe, Telegram, kit de marca, medidor de costo, acceso con clave, Railway |
| 05/11/2026 | Fase de preguntas y concepto, panel de uso de IA, tema oscuro y logo de la agencia |
| 05/11/2026 | Oficina 2D espacial con astronautas (se descartó el 3D por fluidez) |
| 05/11/2026 | Trabajos persistentes, memoria, archivo con ZIP, panel de pendientes |
| 05/11/2026 | Junta creativa, personalidades, currículums, personajes estilo Pixel |
| 06/11/2026 | Amenidades de la oficina real, perro astronauta en 4 patas, reanudación de campañas atoradas |
| 06/11/2026 | Correcciones: Dani ya no se detiene en silencio; error 400 de "thinking" (instrucciones fijas por tarea) |
| 06/11/2026 | **Motor de video v2**, estilos virales, archivos por cliente, **alta por QR**, **cursos de actualización** |

## 6. Siguientes pasos sugeridos

1. **Conectar `PEXELS_API_KEY`** y revisar los videos con tomas reales.
2. **Tomas generadas con IA (Google Veo 3.1 Lite/Fast)** para 1 o 2 escenas por video. Ver `docs/investigacion-video.md`.
3. **Voz en off y música** libre de derechos en los videos.
4. **Render MP4 en el servidor** (Remotion o HyperFrames + FFmpeg), para no depender del navegador.
5. **Publicación automática** en Meta/TikTok, siempre con tu autorización.
6. **Respaldo** de piezas aprobadas en Google Drive.

## 7. Estructura del código

```
server/
  index.js           API, rutas públicas (QR) y en tiempo real (WebSocket)
  runtime-claude.js  Agentes reales (trabajos persistentes, junta, cursos)
  runtime-demo.js    Modo demo (guiones de ejemplo)
  roster.js          Personajes: personalidad, CV e instrucciones
  hub.js             Estado de la oficina, solicitudes, piezas, memoria, juntas, costos
  video.js           Motor de video v2: estilos virales, guion, B-roll (Pexels)
  files.js           Archivos por cliente en carpetas
  cursos.js          Cursos de actualización
  telegram.js        Bot de Telegram
public/
  index.html + office.js + office2d.js   Oficina
  feed.html, archivo.html, clientes.html, estilos.html, equipo.html, memoria.html, uso.html
  player.html + video-player.js          Reproductor y exportador de video
  alta.html                              Cuestionario público para clientes nuevos (QR)
docs/
  PROGRESO.md, investigacion-video.md
```

## Actualización: carpetas, skills, computadoras de agentes y avisos

- **Tres carpetas por cliente**: `Referencias del cliente` (el cliente sube fotos con un enlace/QR sencillo: `/subir.html`), `Material en crudo` y `Resultado final` (solo lo aprobado, ordenado por campaña). Las carpetas antiguas se migran solas.
- **Entregables automáticos**: al aprobar una pieza se guarda en `Resultado final/<fecha brief>/`. ZIP por cliente desde Clientes → Archivos.
- **Computadora de cada agente**: clic en su escritorio (o botón "🖥️ Su computadora") → resumen de lo que hace, sus archivos y la carpeta compartida con visor de texto.
- **Bandeja de decisiones** (`/decisiones.html`): preguntas, autorizaciones, piezas por aprobar y campañas detenidas (con Reintentar). Campana 🔔 con contador en todas las páginas, número en la pestaña, sonido, vibración y avisos del navegador.
- **Telegram**: botones Aprobar/Rechazar, botón con enlace al visor (video con sonido) y recordatorios (`RECORDATORIO_MIN`, 45 por defecto, 0 = apagado, máx. 3 por asunto).
- **Video**: niveles 1-3, looks, grano, partículas, 11 transiciones, música/efectos sintetizados y exportación MP4 con audio (verificado: pista Opus). Visor a pantalla completa en el celular con toque para activar sonido.
- **Preferencias de video por cliente** (nivel, look, música, subtítulos, estilo de texto, sensación, emojis, efectos) en el kit de marca.
- **Skills** de Remotion, HyperFrames y edición en 3 niveles instaladas con `scripts/instalar-skills.sh`.

### Notas de licencia y límites
- HyperFrames: Apache-2.0. Lemo Opuscar: MIT. **Remotion requiere licencia de pago para empresas**; por eso solo se usan sus skills como referencia, no se incluye su software.
- Las películas completas de Lemo Opuscar y el render del lado del servidor necesitan Chromium + ffmpeg (Railway necesitaría un Dockerfile); hoy el render ocurre en el navegador. Catálogo de estilos de Lemo: pendiente.
- Sin probar con servicios reales: Claude API, Pexels, cursos con búsqueda web y el bot de Telegram (solo con simulaciones).

## Planeación mensual, búsqueda, métricas y GoHighLevel

- **Objetivos de marca**: el kit del cliente ahora tiene objetivo, metas/KPIs del mes y estrategia de ads; los agentes los reciben en su prompt para alinear el contenido con los anuncios. Cada campaña puede tener objetivo (reconocimiento, tráfico, leads, ventas, fidelización, lanzamiento, comunidad), mes y etiquetas.
- **Plan del mes** (`/plan.html`): calendario por cliente, ideas por objetivo/plataforma/formato; "Generar plan con IA" (usa kit, metas, ads, memoria y métricas previas; en demo usa una plantilla); "Producir ahora" convierte la idea en campaña.
- **Buscar campañas** (`/campanas.html`): texto, cliente, objetivo, mes, estado; editar objetivo y etiquetas.
- **Métricas** (`/metricas.html`): captura manual por pieza (alcance, interacciones, clics, leads, ventas, gasto); compara por estilo de video, tipo, objetivo, plataforma y agente; lo que mejor funciona se le da al generador del plan.
- **GoHighLevel** (`server/planeacion.js`): variables `GHL_TOKEN` (Private Integration), `GHL_LOCATION_ID` (o por cliente), opcional `GHL_USER_ID`. Lista redes conectadas, programa en Social Planner manualmente o solo al aprobar (fecha del plan). Videos MP4 guardados en el archivo del cliente se entregan a GHL con un enlace firmado de solo lectura (`/pub/...`). Probado únicamente contra un servidor simulado: el formato exacto de GHL debe confirmarse con tu cuenta. Limitación: el arte (HTML) aún no se convierte a PNG, así que hoy se programan textos y videos.

## Costo y margen por cliente (`/costos.html`)
- Cada llamada a la IA guarda sus tokens reales (y búsquedas web) con su campaña y cliente. El costo = tokens × precio por token (corregible con `PRECIOS_JSON` y `PRECIO_BUSQUEDA_USD`); es una **estimación**, no la factura.
- Reporte mensual por cliente: IA, cargos fijos repartidos (Railway, GoHighLevel… igual o según uso), piezas aprobadas, costo por pieza, cobro mensual y margen.
- "Factor de ajuste": compara con platform.claude.com → Billing y corrige todo el reporte. La conexión automática con la factura (Admin API) requiere una cuenta de organización; no disponible en cuentas personales.

## Voz en off (ElevenLabs) y B-roll multi-fuente
- Variables: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (o `vozId` por cliente), opcional `ELEVENLABS_MODEL`, `ELEVENLABS_USD_POR_1000` (costo, suma al reporte por cliente). Max escribe `narracion` por escena; el servidor genera un MP3 por escena (cache en disco) y el reproductor lo mezcla (música baja sola) y entra al MP4 exportado.
- B-roll: Pexels (cerró temporalmente nuevas llaves) y Pixabay (`PIXABAY_API_KEY`, gratis); se intercalan las fuentes disponibles.
- Probado solo con servidores simulados; formatos reales de ElevenLabs/Pixabay por confirmar.
- Coverr: variable `COVERR_API_KEY`; comprueba tu llave abriendo `/api/broll/estado`.
- Video de prueba (chatbots): abre `/player.html?prueba=1`; muestra cuántas tomas reales y escenas con voz se generaron (`&nuevo=1` regenera).

## Render en el servidor (Dockerfile + Chromium + ffmpeg)
- `Dockerfile` (Node 22, Chromium, ffmpeg) y `railway.json` con builder Dockerfile. Al aprobar un video v2 se renderiza solo a MP4 1080×1920 (H.264 + AAC, con voz, música y efectos) en `Resultado final/<campaña>/`; botón manual `POST /api/pieces/:id/render`; `RENDER_AUTO=0` lo apaga. `/api/render/estado` dice si el servidor puede renderizar.
- El MP4 queda disponible para GoHighLevel. Probado localmente (Chromium + ffmpeg); la imagen Docker no se pudo construir en la sesión de desarrollo.

## Motion graphics y música con IA
- Nuevos **gráficos animados** por escena (`grafico`): conversación de chat (con "escribiendo…"), checklist que se marca, contador numérico y barras. Max los pide en su guion; el prompt le prohíbe inventar cifras.
- **Música con ElevenLabs Music** (`server/musica.js`): Max escribe `musicaPrompt`; se genera una pista instrumental del largo del video (modelo `ELEVENLABS_MUSIC_MODEL`, por defecto `music_v2`, por confirmar; costo `ELEVENLABS_MUSIC_USD_POR_MIN`; `MUSICA_IA=0` la apaga). Si falla, queda la música sintética. Comprobar: `/api/musica/estado?probar=1`.
- Chat con agentes: ahora conocen las capacidades reales del sistema (según llaves) y pueden crear una campaña desde el chat (`crear_campana`); antes respondían "no puedo" porque en el chat no tenían herramientas ni contexto.

## Campañas en paralelo y tablero de progreso
- Causa del problema: cada agente tenía una sola fila de trabajo para todo el sistema, así que la directora de la campaña 2 esperaba a que terminara la 1. Ahora la fila es por agente **y campaña**: varias campañas avanzan a la vez. `MAX_CAMPANAS` (por defecto 3) limita cuántas trabajan al mismo tiempo; las demás quedan "en fila" y arrancan solas. Cada campaña activa gasta API en paralelo.
- **Progreso** (`/progreso.html`, y clic en la TV de la sala de la oficina): barra por campaña (preguntas, junta, concepto, producción, tus aprobaciones, entrega), qué espera de ti y quién trabaja en ella.

## Micho (gato editor explicativo) y gráficos nuevos
- Nuevo agente **Micho** (`editor2`): gato astronauta, editor de videos explicativos con voz en off, gráficos animados y música con IA. Dani (directora) conoce a los dos editores: Max = reels virales de ritmo rápido; Micho = explicativos, comparativas y narración.
- Gráficos nuevos: `antes_despues`, `comparativa`, `cuenta` (cuenta regresiva).
- Selección de tomas: ya no al azar; se elige la más relevante que dure lo suficiente, sin repetir, con búsquedas `alternativas` y una versión simplificada si no hay resultados.
- Pendiente (lo agregará el dueño): generación de clips con la API de video de Google.

## HyperFrames y estilos de película para Micho
- **HyperFrames** (Apache-2.0, `node_modules/hyperframes`) renderiza en el servidor composiciones HTML+GSAP a MP4 1080×1920/30 fps. Micho tiene la herramienta `entregar_hyperframes`: escribe la composición; el servidor la valida con `hyperframes check` (si hay errores se los devuelve con el arreglo), la renderiza, descarga tomas de stock, genera voz/música con ElevenLabs, mezcla con ffmpeg (−14 LUFS) y la manda a aprobación. Al aprobar se copia el MP4 a `Resultado final`. Las piezas `motor: 'hf'` se ven en feed, archivo y `/video-hf.html`.
- **Lemo Opuscar** (MIT, `server/lemo/`, ver `LICENSE`): los 66 estilos de película como guías de dirección de arte (`ver_estilo_pelicula`). No se usa su pipeline de Python/Three.js (muy pesado para Railway), solo sus guías `STYLE.md`.
- Un solo trabajo pesado (Chromium/ffmpeg) a la vez. El Dockerfile descarga el navegador de HyperFrames al construir la imagen.
- **Remotion** sigue fuera como software: su licencia exige pago para empresas de más de 3 personas; si tu agencia entra en el uso gratuito o compras la licencia, se puede agregar después.
- Probado localmente: validación con errores, render, voz+música mezcladas, aprobación y copia a Resultado final. No probado: el agente real escribiendo composiciones; la imagen Docker.

## Remotion para Micho
- `remotion@4.0.541` (+ `@remotion/renderer`, `@remotion/bundler`, React 18) instalado. Micho tiene la herramienta `entregar_remotion`: escribe un componente React (TSX); el servidor valida los imports (lista permitida), lo compila con el bundler, lo renderiza (1080×1920, 30 fps), mezcla voz y música y lo manda a aprobación; al aprobar se guarda el MP4 igual que los videos HyperFrames. Si no compila o falla el render, el error vuelve a Micho para que lo corrija.
- **Licencia**: el archivo `node_modules/remotion/LICENSE.md` dice que es gratis, incluso para uso comercial, para individuos y organizaciones con hasta 3 empleados, y que una empresa mayor necesita Company License (remotion.pro). Cambiará en la versión 5.0. Revisa tu caso si el equipo crece.
- Variable `REMOTION_BROWSER` (opcional) fuerza un navegador concreto; por defecto Remotion usa el suyo, que el Dockerfile descarga al construir.

## Motores: diagnóstico y bloques de HyperFrames
- `/motores.html` (y `/api/motores/estado`) muestra si ffmpeg, el render en el servidor, HyperFrames, Remotion, los estilos de película, la voz y la música están disponibles, y tiene botones para una **prueba real** de 2 segundos con cada motor (`?probar=hf|remotion|todo`).
- Micho ahora puede usar el **registro de ~450 bloques listos de HyperFrames** (partículas, zoom, cámara, 75 transiciones, glitch, títulos): `buscar_bloques`, `ver_bloque` y el campo `bloques` al entregar. Los bloques usan GSAP local para no depender de internet al renderizar.
