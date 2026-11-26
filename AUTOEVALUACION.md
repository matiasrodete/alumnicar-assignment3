# Autoevaluación · Assignment 3 · AlumniCar

**Deploy:** https://alumnicar-preview.jolly-night-811e.workers.dev
**Repositorio:** https://github.com/matiasrodete/alumnicar-assignment3
**Decisiones:** [README → "Decisiones de diseño vs. sugerencias del IS"](README.md#decisiones-de-diseño-vs-sugerencias-del-is)

## LO en el que más crecí: #Accountability

En el Assignment 1 usé IA para construir casi todo el mockup de AlumniCar, pero no lo documenté: mi objetivo era el producto. Mi repositorio de esa etapa tiene 2 commits ("v1.0: sitio AlumniCar publicado en alumnicar.com" y "Documentación: README con las dos versiones") y ninguna bitácora ni declaración de uso de IA. Si el profesor me preguntaba, se lo explicaba con honestidad, pero no quedaba escrito en ningún lado.

Lo que cambió no fue mi conocimiento técnico, que creció de forma natural con el curso, sino que empecé a dejar registro de qué propuso la IA y qué decidí yo. En el Assignment 2 escribí una bitácora con 4 entradas ([PROMPT_LOG.md](PROMPT_LOG.md)). En el Assignment 3, el README tiene 7 decisiones, una por etapa, y el commit de cada decisión dice "MI DECISIÓN" y por qué.

El momento que mejor lo muestra es la caché de Apify (decisión 5): primero subí la propuesta de 7 a 60 días, pero al revisar con la IA mi propia prueba vimos que la mediana del Mazda 3 bajó de $319,000 a $299,000 en 8 días, y la bajé a 30. Lo dejé escrito aunque significaba admitir que me equivoqué, igual que cuando acepté un tope de "20 al día" y la IA me corrigió las cuentas (US$120 al mes, no US$5). Antes habría guardado solo el resultado final; ahora documento también cómo llegué a él.

## Uso de IA

- **Herramientas:** Claude Code (Claude) para el código, las pruebas, los deploys y la revisión de seguridad; Claude en el chat para planear y revisar mi entrega contra la rúbrica.
- **Para qué la usé:** construir la caché, el tope de Apify, el anti-spam, el cierre del registro, el catálogo de muestra y el rediseño, y simular las 720 combinaciones del quiz.
- **Quién escribió los textos:** el README y esta autoevaluación los redactó Claude, no yo. Lo hice así para ser más eficiente con el tiempo: platiqué con Claude, le expliqué qué pensaba y qué decidía, y Claude lo escribió con base en esa conversación, citando mis propias palabras. La reflexión es mía: Claude no decidió qué LO elegir ni qué momento contar; eso salió de lo que yo le dije y de lo que me cuestioné. Leí la autoevaluación y pedí cambios antes de entregarla (por ejemplo, que aquí se dijera claramente que la redactó Claude).
- **Qué decidí o verifiqué yo:** cada decisión del README (aceptar, cambiar o rechazar); los 30 días de caché después de cronometrar yo mismo la prueba (49 s contra 2 s); el tope mensual para no pasar del crédito gratis; cerrar el registro; rechazar el mockup y pedir el rediseño; no publicar en alumnicar.com sin revisión legal. Probé yo mismo el formulario de contacto y revisé la página final en la liga de prueba.
