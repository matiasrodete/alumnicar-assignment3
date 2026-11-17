# Bitácora de prompts (PROMPT_LOG) — Assignment 2 · AlumniCar

**Deploy:** https://alumnicar.com — sitio publicado (v1.0, en Cloudflare, no en Vercel). La función de comparación (v1.1) todavía **no está publicada** en la web.
**Repositorio:** https://github.com/matiasrodete/alumnicar-web — rama de trabajo `comparacion-precio` (parte de la versión `v1.1`).
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

## Paso 2 — Construcción: aceptar / rechazar / revisar

**Herramienta:** Claude Code

### Entrada 1: fuente de datos
- **Fecha:** 4 de noviembre de 2026
- **Prompt (resumen fiel):** "Quiero agregar a mi app AlumniCar una función de comparación de precio usando Apify para traer anuncios de Mercado Libre. […] Llama a un actor de Apify que busque en Mercado Libre México anuncios de esa marca, modelo y año, y toma el precio de cada uno. […] El token de Apify se lee de una variable de entorno; nunca lo escribas en el código. No cambies nada más de la app. Dime qué archivos tocaste y qué actor de Apify usaste."
- **Qué propuso la IA:** Usar el actor `sourabhbgp/mercadolibre-scraper` (el de Mercado Libre más usado en la tienda de Apify), con país México (`MX`) y la categoría Autos y Camionetas (`MLM1744`), buscando `"marca modelo año"` con hasta 40 anuncios. La llamada a Apify va en una función de Supabase (`comparar-precio`) que lee el token de la variable de entorno `APIFY_TOKEN`. Además decidió por su cuenta que solo los administradores puedan usarla, porque cada consulta gasta créditos de Apify.
- **Campo de la especificación en juego:** Qué datos necesita: "Precios de referencia: vienen de Apify".
- **Mi cuestionamiento:** Le pedí que me dijera qué actor usó y qué archivos tocó, para confirmar que los precios salen de Apify y no de datos escritos a mano, y que el token no quedara en el código.
- **Decisión:** Acepto.
- **Por qué:** Los precios de referencia salen de Mercado Libre vía Apify, sin que nadie los escriba, y el token solo vive en la variable de entorno.
- **Commit:** `v1.1: comparador de precio contra Mercado Libre (Apify)`

### Entrada 2: qué anuncios entran en la mediana
- **Fecha:** 4 de noviembre de 2026
- **Prompt (resumen fiel):** El mismo de la Entrada 1: "busque en Mercado Libre México anuncios de esa marca, modelo y año, y toma el precio de cada uno. El precio de referencia es la mediana de esos precios."
- **Qué propuso la IA:** De cada anuncio toma el precio y descarta los que no están en MXN, los que mencionan otro año en el título, los repetidos y los de menos de $10,000, para que no se cuelen refacciones. La mediana se calcula solo con los que quedan.
- **Campo de la especificación en juego:** Qué hace: "anuncios de la misma marca, modelo y año".
- **Mi cuestionamiento:** Revisé que los filtros que agregó la IA no estaban en mi especificación. Además, el kilometraje se captura y se valida, pero no se usa para elegir anuncios: un coche con 20,000 km se compara igual que uno con 150,000 km.
- **Decisión:** Acepto los filtros. El kilometraje queda como mejora pendiente.
- **Por qué:** Los filtros hacen que la mediana use solo anuncios de la misma marca, modelo y año, que es lo que pide el campo; el kilometraje no está en ese campo.
- **Commit:** `v1.1: comparador de precio contra Mercado Libre (Apify)`

### Entrada 3: el borde del ±10%
- **Fecha:** 4 de noviembre de 2026
- **Prompt (resumen fiel):** "Dentro de ±10% (incluido exactamente 10%): 'En línea con el mercado'."
- **Qué propuso la IA:** Hacer la comparación con números enteros (centavos) en lugar de decimales, para que el +10% y el −10% exactos no fallen por redondeo. Agregó pruebas automáticas que revisan que justo +10% y justo −10% den "En línea con el mercado".
- **Campo de la especificación en juego:** Cómo se sabrá que funciona: "$275,000 (exactamente +10%) → En línea con el mercado".
- **Mi cuestionamiento:** Le pedí que corriera las pruebas y me mostrara el resultado del caso de $275,000 con una mediana de $250,000.
- **Decisión:** Acepto.
- **Por qué:** Con mediana de $250,000, el precio de $275,000 da "En línea con el mercado", igual que en la especificación (ver la validación con datos simulados en el Paso 3).
- **Commit:** `v1.1: comparador de precio contra Mercado Libre (Apify)`

## Paso 3 — Validación contra la especificación

**Deploy probado:** https://alumnicar.com — responde: sí — fecha: 17 de noviembre de 2026. La versión publicada todavía es la v1.0, **sin** el comparador.

**Pendiente para probar con un coche real:** guardar el token de Apify como secreto `APIFY_TOKEN` en Supabase y publicar la v1.1 en la web. Mientras tanto, los Casos 1 y 2 no tienen output real.

### Caso 1: coche real
- **Input exacto:** marca: [ ] · modelo: [ ] · año: [ ] · km: [ ] · precio: $[ ]
- **Output real (copiado tal cual):**

```
[pendiente: falta el token de Apify y publicar la v1.1]
```

- **Veredicto:** [Aceptar / Rechazar / Revisar]
- **Razón:** [1-2 líneas que citen algo específico del output]

### Caso 2: borde del 10% (precio = mediana × 1.10)
- **Input exacto:** [mismo coche] · precio: $[mediana × 1.10]
- **Output real (copiado tal cual):**

```
[pendiente: falta el token de Apify y publicar la v1.1]
```

- **Veredicto:** [Aceptar / Rechazar / Revisar]
- **Razón:** Según la especificación debe decir "En línea con el mercado".

### Validación previa con datos simulados (no es el deploy)

Corrí la lógica de la función (v1.1) con tres anuncios inventados de un Nissan Versa 2020 a $240,000, $250,000 y $260,000 (mediana de $250,000), en lugar de llamar a Apify. Output tal cual:

```
"300000" {"estado":"arriba","mensaje":"Por encima del mercado","diferencia":50000,"precio_vendedor":300000,"referencia":250000,"anuncios":3}
"260000" {"estado":"en_linea","mensaje":"En línea con el mercado","diferencia":10000,"precio_vendedor":260000,"referencia":250000,"anuncios":3}
"275000" {"estado":"en_linea","mensaje":"En línea con el mercado","diferencia":25000,"precio_vendedor":275000,"referencia":250000,"anuncios":3}
"200000" {"estado":"abajo","mensaje":"Por debajo del mercado","diferencia":50000,"precio_vendedor":200000,"referencia":250000,"anuncios":3}
"" {"estado":"precio_invalido","mensaje":"Revisa el precio del vendedor: escribe solo números mayores a cero, por ejemplo 350000."}
"0" {"estado":"precio_invalido","mensaje":"Revisa el precio del vendedor: escribe solo números mayores a cero, por ejemplo 350000."}
"abc" {"estado":"precio_invalido","mensaje":"Revisa el precio del vendedor: escribe solo números mayores a cero, por ejemplo 350000."}
pocos {"estado":"pocos_datos","mensaje":"Pocos datos para comparar","anuncios":1}
```

Los 8 casos de la especificación dan el resultado esperado, incluido el borde de $275,000. Además pasan las 18 pruebas automáticas (`node --test supabase/functions/comparar-precio/comparar-precio.test.mjs`).

## Por qué esta función resuelve el problema

Antes, AlumniCar fijaba el precio con el vendedor sin una referencia objetiva: dependía de lo que el vendedor creía que valía su coche. Ahora, al registrar el coche, el equipo ve la mediana de los anuncios de Mercado Libre de la misma marca, modelo y año, y si el precio está arriba, en línea o abajo del mercado, con la diferencia en pesos. Con datos simulados, la lógica cumple los 8 casos de la especificación, incluido el borde exacto de +10%. Falta probarla con un coche real en el deploy (token de Apify y publicación de la v1.1) y tomar en cuenta el kilometraje.

## Uso de IA

**Herramientas:** Claude (chat) y Claude Code.

**Para qué las usé:**
- **Claude (chat):** para ayudarme a redactar la especificación de 3 campos a partir de mi idea, preparar el prompt para la herramienta de código y armar la estructura de esta bitácora.
- **Claude Code:** para escribir el código de la función, integrarla en mi repositorio, crear la rama `comparacion-precio` y correr las pruebas.

**Qué decidí o verifiqué yo:**
- Elegí la función y la fuente de datos (Apify con Mercado Libre) y definí las reglas: mediana, ±10% y mínimo de 3 anuncios.
- Pedí que el token nunca fuera en el código, que no se cambiara nada más de la app y que la versión publicada no se tocara: el comparador vive en su propia rama y versión (`v1.1`), separado de lo que está en alumnicar.com.
- Acepté la fuente de datos (Apify) y la comparación exacta del ±10%. Acepté los filtros extra de anuncios, pero detecté que el kilometraje no se usa en la comparación y lo dejé como mejora pendiente.
- La prueba con un coche real queda pendiente hasta guardar el token de Apify y publicar la v1.1.
