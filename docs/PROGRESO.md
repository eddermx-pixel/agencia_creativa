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
