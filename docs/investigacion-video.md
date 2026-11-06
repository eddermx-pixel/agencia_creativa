# Investigación: cómo mejorar los videos de la agencia

*Noviembre 2026. Fuentes al final. La mayoría son blogs y comparativas de terceros: tómalo como orientación y verifica precios en las páginas oficiales antes de contratar.*

## Qué necesitamos

1. **Tomas reales (B-roll):** gente, producto, ciudad, comida…, no solo texto animado.
2. **Transiciones** con ritmo: cortes, fundidos, barridos, zoom, flash.
3. **Subtítulos** animados palabra por palabra, como en TikTok o Reels.
4. **Estilos virales** que se puedan elegir por marca.
5. **Exportar** un archivo de video para subirlo a redes.

## Opciones evaluadas

| Herramienta | Qué hace | Ventajas | Contras | Decisión |
|---|---|---|---|---|
| **Pexels API** (video) | Banco gratuito de videos reales | Gratis, búsqueda por palabra, verticales en HD; 200 solicitudes/hora y 20,000/mes con la clave gratuita | Hay que buscar bien la toma; se recomienda dar crédito a Pexels | ✅ **Implementado** para el B-roll real |
| **Google Veo 3.1** (Gemini API) | Genera video realista con IA | Tomas a la medida: el producto, la escena exacta | Cuesta por segundo: aprox. US$0.05 (Lite 720p), US$0.12 (Fast 1080p) y US$0.40 (Standard). Un clip de 8 s en Lite 1080p sale en unos US$0.64 | 🔜 **Siguiente paso**: proveedor opcional con `GEMINI_API_KEY` |
| **Remotion** | Video programado con React y render en Chrome | Mucha librería de transiciones y subtítulos; la mejor conocida por los modelos de IA | Licencia propia (de pago para empresas a partir de cierto tamaño); el render necesita Chrome en el servidor | 🔜 Opción para render MP4 en servidor |
| **HyperFrames** (HeyGen) | Video desde HTML y GSAP, hecho para agentes | Licencia Apache 2.0, bloques de transiciones y subtítulos, render rápido | Nuevo; resultados menos probados | 🔜 Alternativa a Remotion |
| **FFmpeg** | Edición y codificación en servidor | Estándar de la industria, gratis | Hay que instalarlo en Railway | 🔜 Para unir clips y audio |
| **Motor propio en el navegador** (canvas + MediaRecorder) | Reproduce el guion de video y lo graba | Sin servidores extra ni costo; funciona hoy en Railway | Exporta en el navegador (WebM o MP4, según el navegador) | ✅ **Implementado** |

## Qué construimos (fase 1)

- **Guion de video (JSON):** Max ya no escribe HTML suelto. Entrega un guion con escenas: toma de fondo (búsqueda de B-roll real, imagen del cliente o color), texto, subtítulo, animación, transición y duración.
- **B-roll real:** el servidor busca cada toma en Pexels (formato vertical) y la guarda en la pieza con el crédito del autor.
- **Reproductor propio:** tomas reales con movimiento lento de cámara (efecto Ken Burns), 7 transiciones, textos animados, **subtítulos palabra por palabra**, logo del cliente y barra de progreso.
- **Exportar video** desde el feed y el archivo, grabado en el navegador.
- **Estilos virales:** catálogo de formatos (gancho con pregunta, antes y después, POV, top 3, tutorial rápido, testimonio UGC, detrás de cámaras, cuenta regresiva, storytelling, texto rebotando). Cada marca elige los suyos y Max puede sugerir cuáles le quedan.

## Lo que dicen las fuentes sobre lo viral (2026)

- **El gancho decide:** los primeros 1 a 3 segundos. Conviene probar 3 o 4 aperturas distintas para la misma idea.
- **Formatos recurrentes:** reacción, microaprendizaje, "edutainment", retos y tendencias. En Reels funciona la narrativa visual cuidada y las transformaciones; en TikTok, lo nativo y las tendencias.
- **Publicar en todas las plataformas:** un video que no funciona en una puede despegar en otra.

## Siguientes pasos recomendados

1. **Veo 3.1 Lite/Fast** para 1 o 2 tomas "héroe" por video, generadas a la medida (con presupuesto por campaña).
2. **Voz en off** (TTS) y **música** libre de derechos.
3. **Render MP4 en servidor** con Remotion o HyperFrames + FFmpeg, para no depender del navegador.

## Fuentes

- [Pexels API: documentación](https://www.pexels.com/api/documentation/?language=javascript)
- [Pexels API: límites (resumen de terceros)](https://freeapihub.com/apis/pexels-api)
- [Veo 3.1: precios de la API (benchlm)](https://benchlm.ai/media-pricing/veo)
- [Veo 3 pricing 2026 (CloudZero)](https://www.cloudzero.com/blog/veo-3-pricing/)
- [Veo 3.1 Lite (Skila)](https://news.skila.ai/article/veo-3-1-lite-ai-video-pricing-comparison-2026)
- [HyperFrames vs Remotion (HeyGen)](https://hyperframes.heygen.com/guides/hyperframes-vs-remotion)
- [Hyperframes vs Remotion vs Selects (Cutback)](https://cutback.video/blog/hyperframes-vs-remotion-vs-selects)
- [Comparativa en chino (Woshipm)](https://www.woshipm.com/ai/6408883.html)
- [Anatomía de un TikTok viral en 2026 (OpusClip)](https://www.opus.pro/blog/anatomy-of-a-viral-tiktok-2026)
- [Cómo hacer videos virales en 2026 (ShortSync)](https://shortsync.app/resources/how-to-make-viral-videos-2026)
- [Ganchos de TikTok vs Instagram (viral.app)](https://viral.app/blog/insights/tiktok-hooks-vs-instagram-hooks)
- [Formatos de shorts que se vuelven virales (Miraflow)](https://miraflow.ai/blog/ai-shorts-formats-that-go-viral-2026)
