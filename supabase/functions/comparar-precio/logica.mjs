// AlumniCar · Comparador de precio contra Mercado Libre
// Lógica pura (sin red): validar entrada, extraer precios, mediana y veredicto.
// La usa index.ts (Supabase Edge Function) y la prueban los tests con Node.

export const ACTOR_APIFY = "sourabhbgp~mercadolibre-scraper";
export const CATEGORIA_AUTOS_MX = "MLM1744"; // Mercado Libre México › Autos y Camionetas
export const MIN_ANUNCIOS = 3;
export const PRECIO_MINIMO_ANUNCIO = 10000; // descarta refacciones/accesorios que se cuelan en la búsqueda
export const RANGO_ANIOS = 1;      // compara contra el mismo año, uno antes y uno después
export const MAX_ANUNCIOS_APIFY = 80;
export const MAX_COMPARACIONES_CORREO = 3; // por correo cada 24 h (cada consulta gasta créditos de Apify)
export const MAX_COMPARACIONES_IP = 10;    // por conexión cada 24 h

export const MENSAJES = {
  precio_invalido: "Revisa el precio del vendedor: escribe solo números mayores a cero, por ejemplo 350000.",
  datos_invalidos: "Revisa marca, modelo, año y kilometraje.",
  contacto_invalido: "Escribe tu nombre y un correo válido para comparar tu precio.",
  limite: "Ya hiciste 3 comparaciones hoy con este correo. Intenta mañana o escríbenos y te ayudamos con el precio.",
  pocos_datos: "Pocos datos para comparar",
  sin_respuesta: "No se pudo consultar el precio, intenta más tarde",
  arriba: "Por encima del mercado",
  en_linea: "En línea con el mercado",
  abajo: "Por debajo del mercado",
};

// Precio del vendedor en MXN. Acepta "350000", "350,000", "$350,000" o "350000.50".
// Vacío, cero, negativo o con letras → null (hay que pedir que se corrija).
// Las comas (o espacios) solo se aceptan separando miles de 3 en 3: "420,000" sí; "420,00" o "4,20000" no,
// porque no se sabe qué quiso decir el vendedor (¿$420,000 o $420.00?) y es mejor pedir que lo corrija.
export const FORMATO_PRECIO = /^(\d+|\d{1,3}(,\d{3})+|\d{1,3}( \d{3})+)(\.\d{1,2})?$/;
export function validarPrecio(entrada) {
  if (entrada === null || entrada === undefined) return null;
  if (typeof entrada === "number") return Number.isFinite(entrada) && entrada > 0 ? entrada : null;
  const texto = String(entrada).trim().replace(/^\$\s*/, "");
  if (!FORMATO_PRECIO.test(texto)) return null;
  const n = Number(texto.replace(/[\s,]/g, ""));
  return n > 0 ? n : null;
}

export function validarDatos({ marca, modelo, anio, kilometraje }) {
  const m = String(marca ?? "").trim(), mo = String(modelo ?? "").trim();
  const a = Number(String(anio ?? "").trim());
  const kmTxt = String(kilometraje ?? "").trim().replace(/[\s,]/g, "");
  const ok = m.length > 0 && m.length <= 60 && mo.length > 0 && mo.length <= 60
    && Number.isInteger(a) && a >= 1950 && a <= new Date().getFullYear() + 1
    && /^\d+$/.test(kmTxt);
  return ok ? { marca: m, modelo: mo, anio: a, kilometraje: Number(kmTxt) } : null;
}

// Nombre y correo de quien compara desde la página pública (Vende tu coche).
export function validarContacto({ nombre, correo }) {
  const n = String(nombre ?? "").trim(), c = String(correo ?? "").trim().toLowerCase();
  const ok = n.length > 0 && n.length <= 120 && c.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
  return ok ? { nombre: n, correo: c } : null;
}

// Entrada del actor de Apify para buscar autos usados en Mercado Libre México.
// Busca solo marca + modelo (sin año) para poder traer el año pedido, uno antes y uno después.
export function entradaApify({ marca, modelo }) {
  return {
    mode: "search",
    country: "MX",
    searchQuery: `${marca} ${modelo}`,
    categoryId: CATEGORIA_AUTOS_MX,
    condition: "any",
    maxItems: MAX_ANUNCIOS_APIFY,
    // Con detalles: trae el año real (atributo "Año") y la descripción de cada anuncio.
    // Cuesta ~2 veces más que sin detalles, pero sin el año casi ningún anuncio se puede usar.
    scrapeProductDetails: true,
    includeSponsored: false,
  };
}

// Año del anuncio: primero los datos estructurados que traiga Apify; si no, el año en el título.
// Si el título trae varios años (p. ej. "2019 2020") o ninguno, no se puede saber → null.
export function anioDeAnuncio(a) {
  const directo = Number(a.year ?? a.vehicleYear ?? a.anio);
  if (Number.isInteger(directo) && directo >= 1950) return directo;
  if (Array.isArray(a.attributes)) {
    const at = a.attributes.find(x => x && (x.id === "VEHICLE_YEAR" || /^a(ñ|n)o$/i.test(String(x.name ?? ""))));
    const v = Number(at?.value_name ?? at?.value);
    if (Number.isInteger(v) && v >= 1950) return v;
  }
  const anios = [...new Set(String(a.title ?? "").match(/\b(19[5-9]\d|20\d\d)\b/g) || [])];
  return anios.length === 1 ? Number(anios[0]) : null;
}

// Palabras sin acentos ni signos: "Gran Coupé M235i" → ["gran", "coupe", "m235i"]
const palabras = t => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

// ¿El anuncio menciona el modelo que escribió el vendedor, en el título o en la descripción?
// Cada palabra del modelo tiene que aparecer. Las de 3 o más caracteres pueden venir dentro de otra
// ("235" dentro de "M235i"); las cortas tienen que ser palabra completa, para que el "3" de "Mazda 3"
// no se confunda con el "3" de "2023".
export function mencionaModelo(a, modelo) {
  const buscadas = palabras(modelo);
  if (!buscadas.length) return true;
  const texto = palabras(`${a.title ?? ""} ${a.description ?? ""}`);
  return buscadas.every(b => texto.some(w => w === b || (b.length >= 3 && w.includes(b))));
}

// De los anuncios que regresa Apify, se queda con los que sirven para comparar:
// del modelo pedido, en MXN, del año pedido ±1, sin repetidos y con precio de coche (no de refacción).
// Revisa cada anuncio y dice si entra o por qué se descarta (para revisar la lista a mano).
export function clasificarAnuncios(anuncios, anio, modelo = "") {
  const lista = [], descartados = [];
  if (!Array.isArray(anuncios)) return { lista, descartados };
  const vistos = new Set();
  for (const a of anuncios) {
    if (!a || typeof a !== "object") continue;
    const titulo = String(a.title ?? "").slice(0, 140);
    const url = /^https:\/\/[^\s]+$/.test(a.url ?? "") ? a.url : null;
    const precio = typeof a.price === "number" ? a.price : validarPrecio(a.price);
    const fuera = motivo => descartados.push({ titulo, precio: precio ?? a.price ?? null, anio: anioDeAnuncio(a), motivo, url });
    if (!precio) { fuera("sin precio"); continue; }
    if (precio < PRECIO_MINIMO_ANUNCIO) { fuera("precio menor a $10,000 (refacción o enganche)"); continue; }
    if (a.currency && a.currency !== "MXN") { fuera(`moneda ${a.currency}`); continue; }
    if (!mencionaModelo(a, modelo)) { fuera(`no menciona "${modelo}" en el título ni en la descripción`); continue; }
    const anioA = anioDeAnuncio(a);
    if (anioA === null) { fuera("sin año identificable"); continue; }
    if (Math.abs(anioA - anio) > RANGO_ANIOS) { fuera(`año ${anioA}, fuera de ${anio - RANGO_ANIOS} a ${anio + RANGO_ANIOS}`); continue; }
    const id = a.itemId || a.url || null; // evita contar dos veces el mismo anuncio
    if (id) { if (vistos.has(id)) { fuera("repetido"); continue; } vistos.add(id); }
    lista.push({ titulo, anio: anioA, precio, url });
  }
  lista.sort((x, y) => x.precio - y.precio);
  return { lista, descartados };
}
export const extraerAnuncios = (anuncios, anio, modelo) => clasificarAnuncios(anuncios, anio, modelo).lista;
export const extraerPrecios = (anuncios, anio, modelo) => extraerAnuncios(anuncios, anio, modelo).map(a => a.precio);

export function mediana(valores) {
  const v = [...valores].sort((x, y) => x - y);
  const n = v.length;
  if (!n) return null;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

// Texto del porcentaje para mostrar (página y mensaje al equipo). Nunca contradice la etiqueta:
// - el redondeo no puede hacer que algo "Por encima" diga "10.0 %": dice "poco más del 10 %";
// - una diferencia mínima no puede verse como "0.0 %" ni como "igual": dice "menos del 0.1 %";
// - "igual a la mediana" solo si el precio es idéntico al centavo.
// p y r en milésimas de peso (enteros).
export function textoPorcentaje(p, r, estado) {
  if (p === r) return "igual a la mediana";
  const lado = p > r ? "arriba" : "abajo";
  const decimas = Math.round((Math.abs(p - r) / r) * 1000); // porcentaje × 10, redondeado
  if (estado !== "en_linea" && decimas <= 100) return `poco más del 10 % ${lado}`;
  if (decimas === 0) return `menos del 0.1 % ${lado}`;
  return `${(decimas / 10).toFixed(1)} % ${lado}`;
}

// Compara con enteros (milésimas de peso) para que "exactamente 10%" no falle por redondeo.
// Milésimas y no centavos: la mediana de dos anuncios con centavos puede traer medio centavo
// (p. ej. 250,000.015), y así no se redondea. La etiqueta se decide solo con enteros;
// el porcentaje es aparte y solo sirve para mostrarlo.
export function veredicto(precioVendedor, referencia) {
  const p = Math.round(precioVendedor * 1000);
  const r = Math.round(referencia * 1000);
  const diferencia = Math.round(Math.abs(p - r) / 10) / 100; // en pesos, a centavos
  const porcentaje = Math.round(((p - r) / r) * 1000) / 10 || 0; // con signo, 1 decimal; "|| 0" evita un -0
  const estado = (p - r) * 10 > r ? "arriba" : (r - p) * 10 > r ? "abajo" : "en_linea";
  return { estado, mensaje: MENSAJES[estado], diferencia, porcentaje, texto_porcentaje: textoPorcentaje(p, r, estado) };
}

// --- Caché de búsquedas (Assignment 3: cuello de botella = Apify, ~US$0.20 y 30-60 s por consulta) ---
// La búsqueda en Apify es solo "marca modelo" (sin año), así que un Mazda 3 2019 y un Mazda 3 2021
// reusan los mismos anuncios. Se guardan 30 días (decisión del 25 nov: la IA propuso 7; primero decidí 60,
// pero en mi prueba la mediana del Mazda 3 2021 pasó de $319,000 a $299,000 en 8 días porque Apify trae
// un grupo distinto de anuncios cada vez: una búsqueda "mala" guardada 60 días afectaría a todos 2 meses).
// Lo que sale de la caché SÍ cuenta para el límite de 3 por correo: no se regalan comparaciones extra.
export const CACHE_DIAS = 30;
export const claveCache = input =>
  String(input?.searchQuery ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Solo los campos que usa clasificarAnuncios (para no guardar ~1 MB por búsqueda).
export const recortarAnuncio = a => ({
  title: a?.title, price: a?.price, currency: a?.currency, url: a?.url, itemId: a?.itemId,
  year: a?.year, vehicleYear: a?.vehicleYear, anio: a?.anio,
  attributes: Array.isArray(a?.attributes)
    ? a.attributes.filter(x => x && (x.id === "VEHICLE_YEAR" || /^a(ñ|n)o$/i.test(String(x.name ?? "")))) : undefined,
  description: typeof a?.description === "string" ? a.description.slice(0, 3000) : undefined,
});
// Envuelve la consulta a Apify: si la misma búsqueda se hizo hace menos de CACHE_DIAS, usa esos anuncios.
// Si la caché falla (tabla no existe, error de red), se consulta Apify normal: la caché nunca rompe la comparación.
// estado.deCache queda en true cuando la respuesta salió de la caché.
export function conCache(consultar, cache, estado = {}) {
  if (!cache) return consultar;
  return async (input) => {
    const clave = claveCache(input);
    try {
      const guardados = await cache.leer(clave, CACHE_DIAS);
      if (Array.isArray(guardados) && guardados.length) { estado.deCache = true; return guardados; }
    } catch { /* sin caché: sigue con Apify */ }
    const anuncios = await consultar(input);
    if (Array.isArray(anuncios) && anuncios.length) {
      await Promise.resolve(cache.guardar(clave, anuncios.map(recortarAnuncio))).catch(() => {});
    }
    return anuncios;
  };
}

// Orquesta todo. `consultarApify(input)` regresa el arreglo de anuncios o lanza un error.
export async function compararPrecio(body, consultarApify) {
  const precio = validarPrecio(body?.precio_vendedor);
  if (precio === null) return { estado: "precio_invalido", mensaje: MENSAJES.precio_invalido };
  const datos = validarDatos(body ?? {});
  if (!datos) return { estado: "datos_invalidos", mensaje: MENSAJES.datos_invalidos };

  let anuncios;
  try {
    anuncios = await consultarApify(entradaApify(datos));
  } catch {
    return { estado: "sin_respuesta", mensaje: MENSAJES.sin_respuesta };
  }
  if (!Array.isArray(anuncios)) return { estado: "sin_respuesta", mensaje: MENSAJES.sin_respuesta };

  const { lista, descartados } = clasificarAnuncios(anuncios, datos.anio, datos.modelo);
  // Modo revisión ({ diagnostico: true }): también regresa los descartados y su motivo. No cambia el resultado.
  const extra = body?.diagnostico === true ? { recibidos: anuncios.length, descartados } : {};
  if (lista.length < MIN_ANUNCIOS) {
    return { estado: "pocos_datos", mensaje: MENSAJES.pocos_datos, anuncios: lista.length, listados: lista, ...extra };
  }
  const referencia = mediana(lista.map(a => a.precio));
  return {
    ...extra,
    ...veredicto(precio, referencia), precio_vendedor: precio, referencia,
    precio_sugerido: Math.round(referencia / 1000) * 1000, // la mediana, redondeada a miles
    anios: [datos.anio - RANGO_ANIOS, datos.anio + RANGO_ANIOS],
    anuncios: lista.length, listados: lista,
  };
}
