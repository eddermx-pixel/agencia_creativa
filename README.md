# 🏢 Agencia IA

Una agencia de marketing operada por agentes de Claude, cada uno con su propio rol. Los ves trabajar como personajes de videojuego en una oficina.

- **Estación espacial 2D (inspirada en la oficina real):** estaciones de trabajo, cafetería con barra y bancos (cafetera, refri, microondas, galletas y un pequeño Cthulhu), sala de juntas con mesa larga, proyector y bocina, lounge con TV "PIXEL NEWS", acuario y plantas. Los agentes trabajan en su consola; en sus descansos van por café, ven la TV o miran el acuario. Si te necesitan, **flotan hasta tu escritorio**; cuando entregan, van al **muro del feed**. En el celular arrastras la vista con el dedo.
- **Primero preguntan, luego producen:** el director te hace un **cuestionario** con las dudas clave del brief y te presenta un **concepto creativo**. Nadie diseña nada hasta que tú apruebas el concepto. Si pides cambios, lo ajusta y te lo vuelve a presentar.
- **Feed tipo Tinder:** todo lo que produce el equipo (artes, reels y textos) llega aquí. Deslizas **→ para aprobar** o **← para rechazar**. Si rechazas con un comentario, el agente hace una nueva versión.
- **Clientes con kit de marca:** colores, logo, tono, público y reglas de cada cliente. Los agentes los usan en cada campaña y el logo real se coloca solo en los artes y videos.
- **Uso de IA y costos:** página con el gasto del mes, de hoy, la proyección, el presupuesto y el gasto por agente y por campaña. El indicador ⚡ de arriba lo muestra siempre.
- **Tu marca:** en *Clientes → Mi agencia* subes el nombre y el logo de tu agencia (en blanco se ve mejor, porque la interfaz es oscura). Aparece arriba, en la pantalla de acceso y en la pared de la oficina.
- **No pierde el trabajo:** cada agente guarda su avance paso a paso. Si el servidor se reinicia (por ejemplo, cuando Railway instala una mejora), retoman donde se quedaron, sin repetir preguntas. El panel **📋 Pendientes** muestra qué espera tu respuesta, qué espera tu swipe y quién está trabajando. Si algo falla, el botón **↻ Reintentar** retoma desde el último paso guardado.
- **Memoria:** los agentes recuerdan las preferencias de cada cliente, las reglas generales de la agencia y las campañas anteriores. Se llena sola con tus comentarios (feed y conceptos) y con lo que aprenden los agentes; en **☰ → 🧠 Memoria** puedes ver, editar, borrar o escribir reglas.
- **Archivo:** en **☰ → 🗂️ Archivo** están todas las piezas de todas las campañas, con sus versiones y tus comentarios. Puedes descargar cada pieza (PNG, SVG, HTML o TXT) o la campaña completa en ZIP, con un resumen del brief, tus respuestas y el concepto aprobado.
- **Videos v2:** Max entrega un guion de video con **tomas reales (B-roll de Pexels)**, transiciones, textos animados y **subtítulos palabra por palabra**. Se ven en el feed y se **exportan a video** desde el navegador. Necesita `PEXELS_API_KEY` (gratis) para las tomas reales.
- **Estilos virales:** 10 formatos probados (gancho con pregunta, antes y después, POV, top 3, tutorial, testimonio, detrás de cámaras, cuenta regresiva, storytelling, texto que rebota). Eliges cuáles van con cada marca (☰ → 🎞️ Estilos) y Max te sugiere.
- **Archivos por cliente:** carpetas fijas (Logos, Referencias visuales, Estilo de video, Fotos y videos de producto, Documentos) más subcarpetas. Luna y Max ven las referencias visuales al trabajar.
- **Alta por QR:** genera un QR para un cliente nuevo; en su celular llena un cuestionario tipo quiz, se crea su ficha y sube sus materiales a sus carpetas.
- **Cursos:** cada cierto tiempo un agente te pide permiso para tomar un curso; si apruebas, investiga en internet y regresa con apuntes y skills nuevas en su currículum.
- **Telegram:** te llegan las preguntas, los conceptos, las autorizaciones y las piezas con botones. Para escribir una respuesta, contesta (reply) al mensaje.

📄 **Avance completo, configuración y siguientes pasos:** [`docs/PROGRESO.md`](docs/PROGRESO.md) · Investigación de video: [`docs/investigacion-video.md`](docs/investigacion-video.md)

## El equipo

| Personaje | Tipo | Rol | Personalidad |
|---|---|---|---|
| 🚀 Dani | Astronauta | Directora de cuentas | Líder serena; convierte ideas en un plan y nunca se rinde ante un "no" |
| 🔭 Iris | Alienígena | Investigadora | Curiosa, pregunta "¿y por qué?" y trae datos |
| ✍️ Teo | Astronauta | Copywriter | Ingenioso y juguetón, ama los juegos de palabras |
| 🎨 Luna | Astronauta | Diseñadora | Perfeccionista, audaz con el color, odia lo saturado |
| 🎬 Max | Perro astronauta (4 patas, traje para perro) | Video / motion | Energético, vive en TikTok, gancho en 2 segundos |
| ✅ Rita | Robot | Control de calidad | Meticulosa y directa, no perdona una falta |

Cada uno tiene su **currículum** (☰ → 👩‍🚀 El equipo) con habilidades, personalidad e historial real (campañas, ideas en juntas, piezas aprobadas).

**Junta creativa:** después de tus respuestas, Dani reúne a todo el equipo en la mesa de juntas de la estación. Cada uno propone ideas desde su personalidad, las ves en vivo en el panel 🗣️ y Dani arma el concepto con lo mejor. Si rechazas el concepto, hay una junta nueva con tus comentarios y un concepto distinto, hasta que lo apruebes.

Para cambiar personajes, sus instrucciones o agregar más, edita `server/roster.js`.

## Cómo arrancarla

Necesitas [Node.js 20 o superior](https://nodejs.org).

```bash
npm install
cp .env.example .env
npm start
```

Abre http://localhost:3000

- **Sin API key** corre en **MODO DEMO**: el equipo sigue un guion de ejemplo. Sirve para probar la oficina, el feed y Telegram sin gastar.
- **Con API key** (`ANTHROPIC_API_KEY`) los agentes son Claude de verdad. Con `MONTHLY_BUDGET=50` defines un presupuesto mensual en dólares para el indicador de gasto. Por defecto usan el modelo `claude-opus-5-5` con esfuerzo `medium`. Puedes cambiarlos con `CLAUDE_MODEL` y `CLAUDE_EFFORT`.

## Conectar Telegram (5 minutos)

1. En Telegram, abre **@BotFather**, envía `/newbot` y copia el token.
2. Pon el token en `.env` como `TELEGRAM_BOT_TOKEN=...` y reinicia.
3. Escríbele `/start` a tu bot. Te responde con tu **CHAT_ID**.
4. Ponlo en `.env` como `TELEGRAM_CHAT_ID=...` y reinicia.
5. Pon en `PUBLIC_URL` la dirección donde está publicada tu agencia, para que los enlaces del mensaje abran el feed.

El bot solo obedece a tu chat. Los mensajes de cualquier otra persona se ignoran.

## Publicarla en internet (Railway)

Así funciona 24/7 sin depender de tu computadora.

1. Entra a https://railway.com con tu cuenta de GitHub.
2. Pulsa **New Project** → **Deploy from GitHub repo** y elige este repositorio.
3. En **Variables** agrega:
   - `ACCESS_KEY`: la clave de tu oficina.
   - `DATA_FILE`: `/data/db.json`
4. Clic derecho en el servicio → **Attach Volume** → *Mount path*: `/data`. Ahí se guardan clientes, campañas y piezas.
5. **Settings → Networking → Generate Domain** te da tu dirección pública. Ponla también en la variable `PUBLIC_URL`.
6. Abre la dirección y escribe tu clave.

El archivo `railway.json` ya configura cómo arranca la app y su chequeo de salud (`/healthz`). Cada vez que se sube un cambio a GitHub, Railway se actualiza solo.

## Cómo funciona por dentro

```
Tú (oficina web / Telegram)
   │  brief
   ▼
Dani (director) ── asignar_tarea ──► Iris · Teo · Luna · Max · Rita
                                         │
          herramientas de cada agente:   ├─ estado              → burbuja en la oficina
                                         ├─ preguntar_al_jefe   → camina a tu escritorio + Telegram
                                         ├─ pedir_autorizacion  → camina a tu escritorio + Telegram
                                         └─ entregar_pieza      → feed (swipe) + Telegram
```

- `server/runtime-claude.js`: los agentes reales. Usan el SDK de Anthropic y el *tool runner*.
- `server/runtime-demo.js`: el modo demo.
- `server/hub.js`: el estado de la oficina, las solicitudes y las piezas.
- `server/telegram.js`: el bot.
- `public/`: la oficina (`index.html`) y el feed (`feed.html`).

Las piezas que generan los agentes se muestran aisladas, en una "caja de arena" (sandbox), para que su código no pueda afectar la app.

## Próximos pasos sugeridos

- **Video realista:** conectar Canva (`create-video`) o Veo/Kling para escenas de producto. Hoy Max hace motion graphics.
- **Remotion:** que Max exporte MP4 de verdad para subir directo a redes.
- **Kit de marca por cliente:** colores, logos y tono guardados para que cada agente los use.
- **Publicación automática:** Meta/TikTok, siempre con tu autorización.
