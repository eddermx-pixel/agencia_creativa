# 🏢 Agencia IA

Una agencia de marketing operada por agentes de Claude, cada uno con su propio rol. Los ves trabajar como personajes de videojuego en una oficina.

- **La oficina:** cada agente trabaja en su escritorio con una burbuja que dice qué está haciendo. Cuando está libre se va por un café. Si necesita algo, **camina hasta tu escritorio** y te pregunta o te pide autorización. Cuando entrega una pieza, va al **mural del feed**.
- **El feed:** todo lo que produce el equipo (artes, reels y textos) llega a un feed estilo Tinder. Deslizas **→ para aprobar** o **← para rechazar**. Si rechazas con un comentario, el agente hace una nueva versión.
- **Clientes con kit de marca:** colores, logo, tono, público y reglas de cada cliente. Los agentes los usan en cada campaña y el logo real se coloca solo en los artes y videos.
- **Costo a la vista:** cada campaña muestra cuánto gastó de la API de Claude (aprox.), y el total del mes.
- **Telegram:** te llegan las preguntas, autorizaciones y piezas con botones ✅ / ❌. Para escribir una respuesta, contesta (reply) al mensaje.

## El equipo

| Personaje | Rol | Entrega |
|---|---|---|
| Dani | Director de cuentas | Reparte el trabajo y coordina |
| Iris | Investigadora | Información sobre el público, la competencia y las tendencias |
| Teo | Copywriter | Textos (al feed) |
| Luna | Diseñadora | Artes 1080×1350 en SVG (al feed) |
| Max | Video / motion | Reels 1080×1920 animados en HTML (al feed) |
| Rita | Control de calidad | Revisión final |

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
- **Con API key** (`ANTHROPIC_API_KEY` en `.env`) los agentes son Claude de verdad. Por defecto usan el modelo `claude-opus-5-5` con esfuerzo `medium`. Puedes cambiarlos con `CLAUDE_MODEL` y `CLAUDE_EFFORT`.

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
