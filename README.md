# AlumniCar

Sitio web de AlumniCar: coches seminuevos verificados para universitarios en el poniente de la CDMX.
Es una página estática (`index.html` + `config.js`). Supabase guarda la base de datos, el inicio de sesión y las fotos, y una función de Supabase compara precios contra Mercado Libre (vía Apify).

| | Liga | Qué tiene |
|---|---|---|
| **Versión final (Assignment 3)** | **https://alumnicar-preview.jolly-night-811e.workers.dev** | Todo: catálogo, quiz, comparador de precio, contacto y panel de administración. |
| Sitio oficial | https://alumnicar.com | v1.0 (rama `main`), sin el comparador. |

> **Este repositorio** es la entrega del Assignment 3. Tiene el historial completo de commits desde el sitio v1.0 (Assignment 1), pasando por el comparador (Assignment 2), hasta el producto final. Viene de la rama `comparacion-precio` de [alumnicar-web](https://github.com/matiasrodete/alumnicar-web), donde `main` sigue siendo la v1.0 publicada en alumnicar.com.
>
> **Por qué una liga de prueba y no alumnicar.com:** el comparador pide nombre y correo, y el aviso de privacidad todavía no lo revisa un abogado. Además, todo corre en planes gratuitos (Cloudflare, Supabase, Apify) hasta que AlumniCar sea un negocio rentable. La liga de prueba no aparece en buscadores y avisa que es una versión de prueba. Ver la decisión 4.
>
> **Catálogo de muestra:** los 53 coches son ejemplos (cada uno dice "Coche de muestra"). Sirven para que la app se pueda usar de principio a fin.

## Cómo probar la app (de principio a fin)

1. **Encontrar coche por presupuesto:** en Inicio, mueve la aguja del presupuesto → "Ver mis coches". Filtra por carrocería y transmisión, y abre un coche.
2. **Quiz de recomendación:** "Hacer el quiz" → 5 preguntas → recomendaciones distintas según tus respuestas (por ejemplo: más de $600,000, carretera, 5 personas, premium → Mercedes GLE).
3. **Comparar tu precio con el mercado:** "Vender" → "Compara tu precio con el mercado". Por ejemplo: Mazda / 3 / 2021 / 52000 km / $350,000 con tu nombre y correo. Busca anuncios reales en Mercado Libre y responde si tu precio está arriba, en línea o abajo del mercado, con un precio sugerido y la lista de anuncios.
4. **Contacto:** "Contacto" → formulario → "Gracias… te respondemos en menos de 24 horas".

---

## Decisiones de diseño vs. sugerencias del IS

IS = sistema inteligente (Claude, en Claude Code y en el chat). Cada entrada dice qué propuso el IS, qué decidí y por qué, cómo lo verifiqué y en qué commit quedó. Están en el orden del proyecto: mockup → funcionalidad → deployment → escalabilidad → seguridad.

### 1. Mockup → rediseño (25 nov) · **Rechazo**
- **Qué propuso el IS:** dejar el mockup de los Assignments 1 y 2 como estaba (hero con medidor de presupuesto, quiz, secciones de compra y venta) y documentar solo la auditoría de la especificación de la Sesión 19.
- **Qué decidí:** lo rechacé como versión final: "está bien la página y está funcional, pero le falta que sea más dinámica". Pedí que se pareciera a páginas como Apple o Revolut, que "aparte de ser funcionales, visualmente son muy atractivas, invitan al cliente a que se queden en la página".
- **Cómo quedó:** el IS propuso tomar el *estilo* de esas páginas (tipografía grande, movimiento y profundidad), no su marca, y conservar los colores y tipografías de AlumniCar. El resultado tiene:
  - una entrada animada del hero (el título sube y la aguja barre hasta el precio, en menos de 1 s);
  - una banda oscura nueva, "Del primero al de tus sueños", donde un coche cruza la pantalla con el scroll, con el rango real del catálogo y un carrusel de coches;
  - una barra de navegación de vidrio.
- **Por qué:** a un cliente que entra por primera vez hay que darle una razón para quedarse a explorar el catálogo. El movimiento respeta "reducir movimiento" del sistema operativo y nunca esconde contenido.
- **Verificación:** se revisó en el navegador a 1440 px y a 390 px (celular). La revisión encontró títulos blancos sobre tarjetas blancas y se corrigieron. El catálogo, el quiz, el formulario y el comparador siguen funcionando.
- **Commit:** `93b106a` Rediseño más dinámico (estilo Apple/Revolut)…

### 2. Funcionalidad: quién usa el comparador (17 nov) · **Rechazo y elijo otra opción**
- **Qué propuso el IS:** un botón del comparador solo dentro del panel de administración, porque cada consulta gasta créditos de Apify.
- **Qué decidí:** quería que lo usara el **vendedor** en "Vende tu coche", con los anuncios encontrados, el porcentaje arriba o abajo y un precio sugerido. Cuando el IS me avisó que eso chocaba con "solo administradores", elegí **público con datos**: nombre y correo, máximo 3 comparaciones al día por correo y 10 por conexión, y cada vendedor nos llega como contacto.
- **Por qué:** el vendedor es quien necesita la referencia al decidir su precio. Pedir el correo cuida el gasto de Apify y deja un contacto para AlumniCar.
- **Commit:** `Comparador público en "Vende tu coche", año ±1 y precio sugerido`

### 3. Funcionalidad: qué anuncios entran en la mediana (17 nov) · **Reviso: acepto 2, modifico 1 y rechazo 1**
- **Qué propuso el IS:** al revisar la lista real de mi coche (BMW 235, 2015), encontró que se colaba un "Bmw Serie 5 2015" a $248,000 y que el precio "420,00" se leía como $42,000. Propuso:
  - A) exigir el modelo en el título;
  - B) pedir los detalles del anuncio para leer el año real;
  - C) pedir corregir un precio con la coma mal puesta;
  - D) probar con un coche más común.
- **Qué decidí:**
  - **A modificada:** el modelo puede venir en el título **o** en la descripción, porque muchos anuncios lo dicen solo en la descripción.
  - **B y C:** las acepto tal cual.
  - **D:** la rechazo, porque yo mismo ya había probado el Mazda 3 en la liga de prueba y funcionaba.
- **Verificación:** se comparó la mediana antes y después con datos reales ([bitácora del Assignment 2](PROMPT_LOG.md)). Hoy hay 53 pruebas automáticas y todas pasan.
- **Commit:** `b76dc0a` Prompt 3: modelo en título o descripción, año real del anuncio y coma mal puesta

### 4. Deployment: dónde vive la app (17 y 25 nov) · **Reviso**
- **Punto de partida:** la tarea pide un link de Vercel, y el siguiente paso natural era publicar la función en el sitio oficial.
- **Qué decidí:**
  - **Cloudflare en vez de Vercel**, porque el plan gratis de Vercel no permite uso comercial.
  - **No publicar el comparador en alumnicar.com** hasta que un abogado revise el aviso de privacidad ("no quiero entrar en conflictos legales").
  - Mantener todo en **planes gratuitos** hasta que sea un negocio rentable. Es un proyecto que muestra "hacia dónde queremos estar y de lo que es posible", así que no necesita estar publicado en el sitio oficial todavía.
- **Cómo quedó:** el IS armó una liga de prueba aparte, que no aparece en buscadores (`noindex`, `robots.txt`) y avisa que es versión de prueba. alumnicar.com sigue en la v1.0.
- **Commit:** `638ac8c` Bitácora: liga de prueba en Cloudflare y por qué no va a alumnicar.com todavía

### 5. Escalabilidad: caché de búsquedas (25 nov) · **Reviso dos veces: 7 → 60 → 30 días**
- **Diagnóstico de la Sesión 22:** el cuello de botella es **Apify**. Cada comparación cuesta unos US$0.20 y tarda 30–60 s, y el crédito gratis (US$5 al mes) alcanza para unas 25 comparaciones. Se acaba mucho antes de que Cloudflare o Supabase lleguen a su límite.
- **Qué propuso el IS:** guardar **7 días** los anuncios de cada búsqueda "marca modelo", para que la misma búsqueda no se vuelva a pagar ni a esperar.
- **Qué decidí (1.ª vez):** subirlo a **60 días**, porque los precios "no es información que se llega a convertir obsoleta tan rápidamente" (bajan alrededor de 1 % al mes, muy dentro del ±10 %). También decidí que lo que sale de la caché **sí cuenta** para el límite de 3 al día: "el chiste es ahorrar tokens", no regalar más comparaciones.
- **Verificación propia:** en la liga de prueba, el mismo Mazda 3 tardó **49 s la primera vez y 2 s la segunda**. La caché guardó 24 anuncios en 11 kB. Pero la mediana pasó de **$319,000 (17 nov) a $299,000 (25 nov)**: −6 % en 8 días. No es el mercado: Apify trae un grupo distinto de anuncios en cada búsqueda.
- **Qué decidí (2.ª vez):** bajarlo a **30 días**, el periodo que había pensado al principio. Si una búsqueda "mala" se guarda, con 60 días ese error lo verían todos los vendedores durante 2 meses.
- **Commits:** `4b3df4d` Caché de 60 días… y `9cbf723` Caché a 30 días (antes 60), porque mi prueba mostró que la mediana brinca…

### 6. Escalabilidad + seguridad: que nadie pueda gastarme el crédito de Apify (25 nov) · **Reviso**
- **Qué propuso el IS:** al revisar la app como si alguien quisiera usarla mal, encontró que el correo no se verifica. Con correos inventados y una VPN, alguien podría hacer muchas comparaciones y gastar el crédito (un ataque de *denial of wallet*). Propuso un **tope global de 20 búsquedas nuevas al día**.
- **Qué decidí:** acepté el número, porque "no estamos buscando ahorita una clientela tan grande" y, si hace falta más, "significa que tenemos una mayor base de clientes" que justifica pagar. El IS corrigió las cuentas: 20 al día × US$0.20 ≈ **US$120 al mes**, no US$5. Mi objetivo era **no pasar del crédito gratis**, así que quedó en **20 búsquedas nuevas al MES** (≈ US$4). Lo que sale de la caché sigue funcionando y, si no se puede contar, no se llama a Apify.
- **También en esta revisión:**
  - **Anti-spam de contactos:** cualquiera podía insertar contactos con un script sin pasar por la página. Quedó una regla dentro de la base de datos: máximo 3 por correo al día y 30 en total por hora. La acepté "ahorita que apenas queremos que sea una página funcional, pero principalmente informativa"; se revisa cuando haya más clientela.
  - **Anti-clickjacking:** un archivo `_headers` impide meter el sitio dentro de otra página para engañar al administrador.
- **Verificación:**
  - Probado en vivo: una IP falsa no engaña al límite (Supabase guarda la IP real).
  - El 4.º contacto del mismo correo se rechaza (probado en una transacción que se deshizo).
  - Las cabeceras de seguridad están activas en la liga.
  - Sin sesión, las tablas privadas responden vacío.
- **Riesgos aceptados:** agotar las llamadas gratis de Supabase (no cobra, solo se detiene) y que alguien adivine la contraseña de administrador (Supabase limita los intentos).
- **Commit:** `bc6fe29` Seguridad: tope de 20 búsquedas al mes en Apify, anti-spam de contactos y anti-clickjacking

### 7. Seguridad: registro de cuentas cerrado (25 nov) · **Acepto y pido blindarlo**
- **Qué encontró el IS:** en la página de ingresar cualquiera podía crear una cuenta, y había **una cuenta real con un correo desechable (`@mail.tm`)**, creada el 12 de noviembre, sin confirmar. No podía hacer nada porque no era administradora, pero el riesgo no era teórico.
- **Qué decidí:** cerrar el registro y borrar esa cuenta: "blíndalo de la mejor manera posible". Si algún día una regla de seguridad se escribe mal, una cuenta cualquiera podría entrar al panel, donde "se pueden hacer todas las modificaciones".
- **Verificación:** un intento de registro ahora responde `signup_disabled`. Solo queda la cuenta de administrador.
- **Commit:** `856708d` Registro de cuentas cerrado, porque ya había una cuenta sospechosa con correo desechable

### Commits con mensaje genérico
Los commits de `main` (`v1.0: sitio AlumniCar publicado en alumnicar.com` y `Documentación: README con las dos versiones`) dicen qué cambió pero no por qué. El porqué es la decisión 4: se publicó la v1.0 sin el comparador para tener el sitio en línea mientras el comparador se construía y probaba aparte. Desde el Assignment 2, cada commit de la rama `comparacion-precio` explica su decisión en el título o en la descripción.

---

## Estructura

```
index.html                              Página completa (sitio + panel de administración)
config.js                               URL y llave pública (anon) de Supabase, WhatsApp, modo muestra
_headers                                Cabeceras de seguridad para Cloudflare (anti-clickjacking)
supabase/01_esquema.sql                 Tablas, reglas de seguridad (RLS) y carpeta de fotos
supabase/02_coches_de_muestra.sql       24 coches de ejemplo
supabase/03_agregar_admin.sql           Dar permiso de administrador a una cuenta
supabase/04_comparaciones.sql           Registro de comparaciones (límite por correo e IP)
supabase/05_cache_busquedas.sql         Caché de 30 días de las búsquedas de Apify
supabase/06_seguridad.sql               Tope mensual de Apify y anti-spam de contactos
supabase/07_mas_coches_de_muestra.sql   29 coches de ejemplo más (53 en total)
supabase/functions/comparar-precio/     Función que consulta Apify (logica.mjs, manejador.mjs, index.ts)
PROMPT_LOG.md                           Bitácora del Assignment 2 (comparador)
LEEME.md                                Guía de instalación paso a paso
```

## Comparador de precio

1. La página llama a la función de Supabase `comparar-precio`. El público deja nombre y correo: máximo 3 comparaciones al día por correo y 10 por conexión. Los administradores no tienen límite.
2. La función busca la misma marca y modelo en la **caché** (30 días). Si no está y no se llegó al **tope de 20 búsquedas nuevas al mes**, ejecuta el actor de Apify [`sourabhbgp/mercadolibre-scraper`](https://apify.com/sourabhbgp/mercadolibre-scraper) en Mercado Libre México, categoría Autos y Camionetas (`MLM1744`).
3. Se quedan los anuncios del mismo año, uno antes o uno después, que mencionan el modelo en el título o en la descripción, en MXN y de más de $10,000. Los repetidos se descartan.
4. El precio de referencia es la **mediana**:
   - **Menos de 3 anuncios:** "Pocos datos para comparar".
   - **Más de 10 % arriba:** "Por encima del mercado".
   - **Dentro de ±10 %** (el 10 % exacto cuenta como dentro): "En línea con el mercado".
   - **Más de 10 % abajo:** "Por debajo del mercado".
   - **Precio vacío, en cero, con letras o con la coma mal puesta** ("420,00"): se pide corregirlo.
   - **Si Apify no responde:** "No se pudo consultar el precio, intenta más tarde".

### Token de Apify

El token **nunca** está en el código. La función lo lee de la variable de entorno `APIFY_TOKEN`, que se guarda como secreto en Supabase (Edge Functions → Secrets).

### Pruebas

```bash
node --test supabase/functions/comparar-precio/comparar-precio.test.mjs
```

Son 53 pruebas. Cubren:
- los casos de la especificación y el borde exacto del 10 %;
- el formato del precio y la coincidencia del modelo;
- el límite por correo e IP;
- la caché (incluido que, si falla, se compara igual);
- el tope mensual de Apify (incluido que, si no se puede contar, no se gasta).
