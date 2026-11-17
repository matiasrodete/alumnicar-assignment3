# Bitácora de prompts (PROMPT_LOG) — Assignment 2 · AlumniCar

**Deploy:** https://alumnicar.com — sitio publicado (v1.0, en Cloudflare, no en Vercel). La función de comparación **todavía no está publicada** en la web.
**Repositorio:** https://github.com/matiasrodete/alumnicar-web — rama de trabajo `comparacion-precio`.
**Función:** comparación del precio del vendedor contra el mercado (Mercado Libre vía Apify).

## Paso 1 — Especificación (auditada en la Sesión 19 por [nombre del auditor])

**Qué hace:** Cuando el equipo registra un coche en el panel, la app consulta en Mercado Libre, mediante Apify, los anuncios de la misma marca, modelo y año, calcula la mediana de sus precios y la compara con el precio que pide el vendedor. Muestra "Por encima del mercado" si está más de 10% arriba, "En línea con el mercado" si está dentro de ±10% y "Por debajo del mercado" si está más de 10% abajo, junto con la diferencia en pesos.

**Qué datos necesita:**
- Marca, modelo, año, kilometraje y precio del vendedor (MXN): campos que el equipo captura en el panel con lo que dice el vendedor.
- Precios de referencia: vienen de Apify; nadie los escribe.
- Token de Apify: se lee de una variable de entorno; no va en el código.

**Cómo se sabrá que funciona** (referencia supuesta: mediana de $250,000):
- $300,000 → "Por encima del mercado", $50,000 arriba.
- $260,000 → "En línea con el mercado".
- $275,000 (exactamente +10%) → "En línea con el mercado".
- $200,000 → "Por debajo del mercado", $50,000 abajo.
- Menos de 3 anuncios → "Pocos datos para comparar", sin comparación.
- Precio vacío, en cero o con letras → pide corregirlo y no compara.

**Cambios que decidí después de revisar el plan (17 de noviembre):**
- **Quién la usa:** además del equipo en el panel, el **vendedor** la usa en "Vende tu coche". Ve su precio, si está arriba o abajo y en qué porcentaje, un **precio sugerido** (la mediana) y la lista de anuncios con los que se comparó.
- **Qué anuncios entran:** el mismo año, **uno antes y uno después**, en lugar de solo el mismo año.
- Lo demás sigue igual: mediana, ±10% (el 10% exacto es "En línea"), mínimo 3 anuncios, precio inválido y token en variable de entorno.

## Paso 2 — Construcción: aceptar / rechazar / revisar

**Herramienta:** Claude Code

### Entrada 1: fuente de datos
- **Fecha:** 4 de noviembre de 2026
- **Prompt (resumen fiel):** "Quiero agregar a mi app AlumniCar una función de comparación de precio usando Apify para traer anuncios de Mercado Libre. […] Llama a un actor de Apify que busque en Mercado Libre México anuncios de esa marca, modelo y año, y toma el precio de cada uno. […] El token de Apify se lee de una variable de entorno; nunca lo escribas en el código. No cambies nada más de la app. Dime qué archivos tocaste y qué actor de Apify usaste."
- **Qué propuso la IA:** Usar el actor `sourabhbgp/mercadolibre-scraper` (el de Mercado Libre más usado en la tienda de Apify), en México (`MX`) y en la categoría Autos y Camionetas (`MLM1744`). La llamada a Apify va en una función de Supabase (`comparar-precio`) que lee el token de la variable de entorno `APIFY_TOKEN`.
- **Campo de la especificación en juego:** Qué datos necesita: "Precios de referencia: vienen de Apify".
- **Mi cuestionamiento:** [Prompt 1 pendiente: comparar fuentes de datos antes de elegir.]
- **Decisión:** [Acepto / Rechazo / Pido revisión]
- **Por qué:** [una frase ligada a ese campo]
- **Commit:** `v1.1: comparador de precio contra Mercado Libre (Apify)`

### Entrada 2: qué anuncios entran en la mediana
- **Fecha:** 17 de noviembre de 2026
- **Prompt (resumen fiel):** Le pegué mi especificación y le pedí primero su plan. Me presentó 5 puntos donde lo construido no coincidía con mi especificación, y le respondí punto por punto.
- **Qué propuso la IA:** Mantener los filtros que había agregado sin que yo los pidiera: descartar anuncios en otra moneda, de otro año, repetidos y de menos de $10,000 (refacciones). Revisar la lista real de anuncios en el Prompt 3.
- **Campo de la especificación en juego:** Qué hace: "anuncios de la misma marca, modelo y año".
- **Mi cuestionamiento:** Acepté descartar la otra moneda, pero solo el mismo año me pareció muy poco para comparar.
- **Decisión:** Pido revisión. Acepto el filtro de moneda y **cambio el año: el mismo, uno antes y uno después**.
- **Por qué:** Con un solo año hay pocos anuncios. Con ±1 año hay más puntos de comparación y el coche sigue siendo comparable.
- **Commit:** `Comparador público en "Vende tu coche", año ±1 y precio sugerido`
- **Mediana antes y después del filtro:** [pendiente del Prompt 3 con anuncios reales; hace falta el token de Apify]

### Entrada 3: dónde aparece la función y quién la usa
- **Fecha:** 17 de noviembre de 2026
- **Prompt (resumen fiel):** Mi respuesta al plan: "Para el punto 1 me gustaría que fuera algo que el cliente o el vendedor lo pueda revisar en la página web […] cuando le piques vende tu coche, puedas llenar este formulario, pongas tu precio […] y ahí se ponga el botón de comparar con el mercado […] encontramos estos listados con estas características, creemos que tu precio está un 10%, un 15% arriba o abajo. Este es tu precio sugerido".
- **Qué propuso la IA:** Al principio, un botón dentro del alta del coche en el panel, solo para el equipo. Cuando pedí que fuera público, me avisó que eso chocaba con mi otra respuesta ("solo administradores") porque cada consulta gasta créditos de Apify. Me dio 3 opciones: público con datos, público sin límite o solo administradores.
- **Campo de la especificación en juego:** Qué hace: "Cuando el equipo registra un coche en el panel".
- **Mi cuestionamiento:** Quería que lo usara el vendedor, sin que cualquiera gastara los créditos de Apify.
- **Decisión:** Rechazo la propuesta del panel. Elijo **público con datos**: el vendedor deja su nombre y correo, puede comparar hasta 3 veces al día y nos llega como contacto nuevo. El equipo sigue sin límite en el panel.
- **Por qué:** El vendedor es quien necesita la referencia al decidir su precio. Pedir el correo cuida el gasto de Apify y nos deja un contacto.
- **Commit:** `Comparador público en "Vende tu coche", año ±1 y precio sugerido`

### Entrada 4: el borde del ±10%
- **Fecha:** [fecha del Prompt 4]
- **Prompt (resumen fiel):** [Prompt 4 pendiente]
- **Qué propuso la IA:** La comparación se hace con números enteros (centavos) para que el +10% y el −10% exactos no fallen por redondeo. Al probar en el navegador apareció un detalle: con $438,901 contra una mediana de $399,000, la etiqueta decía "Por encima del mercado" pero el porcentaje redondeado decía "10.0 %". Lo cambió a "poco más del 10 %".
- **Campo de la especificación en juego:** Cómo se sabrá que funciona: "$275,000 (exactamente +10%) → En línea con el mercado".
- **Mi cuestionamiento:** [qué le pregunté o le pedí revisar antes de aceptar]
- **Decisión:** [Acepto / Rechazo / Pido revisión]
- **Por qué:** [una frase ligada a ese campo]
- **Commit:** `Comparador público en "Vende tu coche", año ±1 y precio sugerido`

## Paso 3 — Validación contra la especificación

**Deploy probado:** https://alumnicar.com — responde: sí — fecha: 17 de noviembre de 2026. La versión publicada todavía **no** tiene el comparador.

**Pendiente para probar con un coche real:** guardar el token de Apify como secreto `APIFY_TOKEN` en Supabase, crear la tabla `comparaciones` (`supabase/04_comparaciones.sql`), publicar la función y publicar la página. Mientras tanto, los Casos 1 y 2 no tienen output real.

### Caso 1: coche real
- **Input exacto:** marca: [ ] · modelo: [ ] · año: [ ] · km: [ ] · precio: $[ ]
- **Output real (copiado tal cual):**

```
[pendiente: falta el token de Apify y publicar]
```

- **Veredicto:** [Aceptar / Rechazar / Revisar]
- **Razón:** [1-2 líneas que citen algo específico del output]

### Caso 2: borde del 10% (precio = mediana × 1.10)
- **Input exacto:** [mismo coche] · precio: $[mediana × 1.10]
- **Output real (copiado tal cual):**

```
[pendiente: falta el token de Apify y publicar]
```

- **Veredicto:** [Aceptar / Rechazar / Revisar]
- **Razón:** Según la especificación debe decir "En línea con el mercado".

### Validación previa con datos simulados (no es el deploy)

Probé la página en mi computadora con la función real, pero con 10 anuncios inventados de Mazda 3 en lugar de llamar a Apify. Mazda 3 2021, 52,000 km. Entraron 7 anuncios de 2020 a 2022, y quedaron fuera uno de 2019, uno de 2023 y uno sin año. Mediana: $399,000. Lo que mostró la página:

```
$450,000 → Por encima del mercado | Tu precio está 12.8 % arriba de la mediana del mercado ($51,000 de diferencia). | Precio sugerido $399,000
$438,900 (exactamente +10%) → En línea con el mercado | Tu precio está 10.0 % arriba de la mediana del mercado ($39,900 de diferencia).
$438,901 → Por encima del mercado | Tu precio está poco más del 10 % arriba de la mediana del mercado ($39,901 de diferencia).
4.ª comparación con el mismo correo → Ya hiciste 3 comparaciones hoy con este correo. Intenta mañana o escríbenos y te ayudamos con el precio.
abc → Revisa el precio: escribe solo números mayores a cero, por ejemplo 350000.
```

Con la mediana de $250,000 de mi especificación, los casos dan: $300,000 → Por encima (+$50,000), $260,000 → En línea, $275,000 → En línea, $200,000 → Por debajo (−$50,000), 1 anuncio → Pocos datos para comparar, y "", "0" o "abc" → pide corregir el precio. Pasan las 29 pruebas automáticas (`node --test supabase/functions/comparar-precio/comparar-precio.test.mjs`).

## Por qué esta función resuelve el problema

Antes, AlumniCar fijaba el precio con el vendedor sin una referencia objetiva: dependía de lo que el vendedor creía que valía su coche. Ahora el propio vendedor, desde "Vende tu coche", ve la mediana de los anuncios de Mercado Libre de su marca y modelo (mismo año, uno antes y uno después), si su precio está arriba, en línea o abajo y en qué porcentaje, y un precio sugerido. Con datos simulados cumple los casos de la especificación, incluido el borde exacto de +10%. Falta probarla con un coche real en el deploy y tomar en cuenta el kilometraje.

## Uso de IA

**Herramientas:** Claude (chat) y Claude Code.

**Para qué las usé:**
- **Claude (chat):** para ayudarme a redactar la especificación de 3 campos a partir de mi idea, preparar el prompt para la herramienta de código y armar la estructura de esta bitácora.
- **Claude Code:** para escribir el código de la función, integrarla en mi repositorio, crear la rama `comparacion-precio`, correr las pruebas y probar la página en el navegador.

**Qué decidí o verifiqué yo:**
- Elegí la función y la fuente de datos (Apify con Mercado Libre) y definí las reglas: mediana, ±10% y mínimo de 3 anuncios.
- Pedí que el token nunca fuera en el código y que la versión publicada no se tocara: trabajo en la rama `comparacion-precio`, separada de lo que está en alumnicar.com.
- Al revisar el plan rechacé que fuera solo para el equipo en el panel: lo quiero en "Vende tu coche" para el vendedor, con porcentaje, precio sugerido y la lista de anuncios. Cuando la IA me avisó que eso chocaba con "solo administradores", elegí pedir nombre y correo con un máximo de 3 comparaciones al día.
- Cambié el filtro de año a ±1 año para tener más anuncios para comparar. Mantuve el filtro de moneda y dejé el kilometraje como mejora pendiente.
- La prueba con un coche real queda pendiente hasta guardar el token de Apify y publicar.
