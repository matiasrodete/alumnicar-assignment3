// Pruebas del comparador de precio. Correr con:
//   node --test supabase/functions/comparar-precio/comparar-precio.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPrecio, extraerPrecios, extraerAnuncios, anioDeAnuncio, mediana, veredicto, compararPrecio, MENSAJES, entradaApify } from "./logica.mjs";
import { crearManejador } from "./manejador.mjs";

const base = { marca: "Mazda", modelo: "3", anio: "2021", kilometraje: "52000" };
const contacto = { nombre: "Andrea López", correo: "andrea@correo.com" };
const anuncio = (price, extra = {}) => ({ title: "Mazda 3 2021 I Grand Touring", price, currency: "MXN", itemId: "MLM" + Math.random(), url: "https://auto.mercadolibre.com.mx/MLM-1", ...extra });
const apifyCon = (precios) => async () => precios.map(p => anuncio(p));

// --- validación del precio ---
test("precio vacío, cero, negativo o con letras → inválido", () => {
  for (const v of ["", "   ", null, undefined, "0", 0, "0.00", "-5", "abc", "350mil", "35O000", "1e5", "$", "350 000 pesos"]) {
    assert.equal(validarPrecio(v), null, `debería rechazar ${JSON.stringify(v)}`);
  }
});
test("coma mal puesta → pide corregir en vez de adivinar ($420,00 no se lee como $42,000)", () => {
  for (const v of ["420,00", "4,20000", "42,0000", "420,0000", "1,2", "420 00", "420.000", "420,000.5.0", "420, 000"]) {
    assert.equal(validarPrecio(v), null, `debería pedir corregir ${JSON.stringify(v)}`);
  }
  assert.equal(validarPrecio("420,000"), 420000);
  assert.equal(validarPrecio("1,250,000"), 1250000);
  assert.equal(validarPrecio("420 000"), 420000);
  assert.equal(validarPrecio("$420,000.50"), 420000.5);
});
test("precio con formatos válidos", () => {
  assert.equal(validarPrecio("350000"), 350000);
  assert.equal(validarPrecio("350,000"), 350000);
  assert.equal(validarPrecio("$350,000"), 350000);
  assert.equal(validarPrecio(" 350000.50 "), 350000.5);
  assert.equal(validarPrecio(350000), 350000);
});
test("precio inválido no consulta Apify", async () => {
  let llamado = false;
  for (const p of ["", "0", "abc"]) {
    const r = await compararPrecio({ ...base, precio_vendedor: p }, async () => { llamado = true; return []; });
    assert.equal(r.estado, "precio_invalido");
    assert.equal(r.mensaje, MENSAJES.precio_invalido);
  }
  assert.equal(llamado, false);
});

// --- mediana ---
test("mediana con número impar y par de precios", () => {
  assert.equal(mediana([300, 100, 200]), 200);
  assert.equal(mediana([400, 100, 300, 200]), 250);
});

// --- reglas de comparación (referencia = 400,000) ---
test("más de 10% arriba → Por encima del mercado + diferencia y porcentaje", () => {
  assert.deepEqual(veredicto(460000, 400000), { estado: "arriba", mensaje: "Por encima del mercado", diferencia: 60000, porcentaje: 15, texto_porcentaje: "15.0 % arriba" });
});
test("exactamente +10% → En línea con el mercado", () => {
  assert.equal(veredicto(440000, 400000).estado, "en_linea");
});
test("exactamente -10% → En línea con el mercado", () => {
  assert.equal(veredicto(360000, 400000).estado, "en_linea");
});
test("más de 10% abajo → Por debajo del mercado + diferencia y porcentaje", () => {
  assert.deepEqual(veredicto(340000, 400000), { estado: "abajo", mensaje: "Por debajo del mercado", diferencia: 60000, porcentaje: -15, texto_porcentaje: "15.0 % abajo" });
});

// --- la línea del ±10% (Prompt 4): mediana de $250,000 ---
test("borde del 10%: $274,999 / $275,000 / $275,001 / $225,000 / $224,999", () => {
  const casos = [
    [274999, "en_linea", "10.0 % arriba"],
    [275000, "en_linea", "10.0 % arriba"],             // +10% exacto
    [275001, "arriba",   "poco más del 10 % arriba"],  // el redondeo diría 10.0 %: no se contradice con la etiqueta
    [225000, "en_linea", "10.0 % abajo"],              // −10% exacto
    [224999, "abajo",    "poco más del 10 % abajo"],
  ];
  for (const [precio, estado, texto] of casos) {
    const v = veredicto(precio, 250000);
    assert.equal(v.estado, estado, `$${precio}`);
    assert.equal(v.texto_porcentaje, texto, `$${precio}`);
  }
});
test("borde del 10% con centavos: un centavo arriba o abajo ya cruza la línea", () => {
  assert.equal(veredicto(275000.01, 250000).estado, "arriba");
  assert.equal(veredicto(224999.99, 250000).estado, "abajo");
  assert.equal(veredicto(275000.00, 250000).estado, "en_linea");
});
test("borde del 10% con mediana impar o con decimales (promedio de dos anuncios)", () => {
  // mediana de un número par de anuncios puede traer .5: 10% de 250,000.5 = 25,000.05
  assert.equal(veredicto(275000.55, 250000.5).estado, "en_linea"); // exacto +10%
  assert.equal(veredicto(275000.56, 250000.5).estado, "arriba");
  assert.equal(veredicto(225000.45, 250000.5).estado, "en_linea"); // exacto −10%
  assert.equal(veredicto(225000.44, 250000.5).estado, "abajo");
});
test("borde del 10% cuando la mediana trae medio centavo (sin redondear la mediana)", () => {
  // anuncios de $250,000.01 y $250,000.02 → mediana 250,000.015; +10% exacto = 275,000.0165
  const m = mediana([250000.01, 250000.02]);
  assert.equal(veredicto(275000.01, m).estado, "en_linea");  // abajo del borde
  assert.equal(veredicto(275000.02, m).estado, "arriba");    // arriba del borde
  assert.equal(veredicto(225000.02, m).estado, "en_linea");  // −10% exacto = 225,000.0135
  assert.equal(veredicto(225000.01, m).estado, "abajo");
});
test("el texto del porcentaje nunca contradice la etiqueta, en todo el rango de ±12%", () => {
  const r = 250000;
  for (let precio = 220000; precio <= 280000; precio += 1) {
    const v = veredicto(precio, r);
    if (v.estado === "en_linea") assert.ok(!v.texto_porcentaje.startsWith("poco más"), `$${precio}`);
    else assert.ok(!/^(10\.0|[0-9]\.\d) %/.test(v.texto_porcentaje), `$${precio}: ${v.texto_porcentaje}`);
    if (v.estado === "arriba") assert.match(v.texto_porcentaje, /arriba$/);
    if (v.estado === "abajo") assert.match(v.texto_porcentaje, /abajo$/);
  }
});
test("diferencias mínimas no se ven como 0 % ni como igual; -0 no aparece", () => {
  const v = veredicto(250010, 250000);
  assert.equal(v.texto_porcentaje, "menos del 0.1 % arriba");
  const w = veredicto(249990, 250000);
  assert.equal(w.texto_porcentaje, "menos del 0.1 % abajo");
  assert.ok(Object.is(w.porcentaje, 0));                      // no -0
  assert.equal(veredicto(250000, 250000).texto_porcentaje, "igual a la mediana");
});
test("10% exacto con decimales no falla por redondeo", () => {
  assert.equal(veredicto(366666.3, 333333).estado, "en_linea");     // +10% exacto
  assert.equal(veredicto(366666.31, 333333).estado, "arriba");
});

// --- casos de la especificación (mediana de $250,000) ---
test("casos de la especificación con mediana de $250,000", async () => {
  const apify = apifyCon([240000, 250000, 260000]);
  const caso = async p => compararPrecio({ ...base, precio_vendedor: p }, apify);
  const a = await caso("300000"); assert.equal(a.mensaje, "Por encima del mercado"); assert.equal(a.diferencia, 50000); assert.equal(a.porcentaje, 20);
  assert.equal((await caso("260000")).mensaje, "En línea con el mercado");
  assert.equal((await caso("275000")).mensaje, "En línea con el mercado");
  const b = await caso("200000"); assert.equal(b.mensaje, "Por debajo del mercado"); assert.equal(b.diferencia, 50000); assert.equal(b.porcentaje, -20);
  assert.equal(a.precio_sugerido, 250000);
});

// --- flujo completo ---
test("menos de 3 anuncios → Pocos datos para comparar (no compara)", async () => {
  const r = await compararPrecio({ ...base, precio_vendedor: "400000" }, apifyCon([380000, 420000]));
  assert.equal(r.estado, "pocos_datos");
  assert.equal(r.mensaje, "Pocos datos para comparar");
  assert.equal(r.referencia, undefined);
  assert.equal(r.precio_sugerido, undefined);
});
test("3 anuncios ya alcanzan; la referencia es la mediana y se regresa la lista", async () => {
  const r = await compararPrecio({ ...base, precio_vendedor: "500000" }, apifyCon([900000, 380000, 400000]));
  assert.equal(r.referencia, 400000);
  assert.equal(r.precio_sugerido, 400000);
  assert.equal(r.estado, "arriba");
  assert.equal(r.diferencia, 100000);
  assert.equal(r.anuncios, 3);
  assert.deepEqual(r.listados.map(l => l.precio), [380000, 400000, 900000]); // ordenados de menor a mayor
  assert.deepEqual(r.anios, [2020, 2022]);
});
test("el precio sugerido es la mediana redondeada a miles", async () => {
  const r = await compararPrecio({ ...base, precio_vendedor: "400000" }, apifyCon([381400, 401600, 420000]));
  assert.equal(r.referencia, 401600);
  assert.equal(r.precio_sugerido, 402000);
});
test("Apify no responde (error o timeout) → mensaje de intentar más tarde", async () => {
  const r = await compararPrecio({ ...base, precio_vendedor: "400000" }, async () => { throw new Error("timeout"); });
  assert.equal(r.mensaje, "No se pudo consultar el precio, intenta más tarde");
});

// --- qué anuncios entran en la mediana ---
test("entran el año pedido, uno antes y uno después; se descartan otros años, otra moneda, repetidos y refacciones", () => {
  const precios = extraerPrecios([
    anuncio(400000),                                       // 2021 ✔
    anuncio(380000, { title: "Mazda 3 2020 Touring" }),    // un año antes ✔
    anuncio(430000, { title: "Mazda 3 2022 Signature" }),  // un año después ✔
    anuncio(350000, { title: "Mazda 3 2019 Touring" }),    // dos años antes ✘
    anuncio(470000, { title: "Mazda 3 2023" }),            // dos años después ✘
    anuncio(20000, { currency: "USD" }),                   // otra moneda ✘
    anuncio(1500, { title: "Tapete Mazda 3 2021" }),       // refacción ✘
    anuncio(410000, { itemId: "X" }), anuncio(410000, { itemId: "X" }), // repetido: cuenta una vez
  ], 2021);
  assert.deepEqual(precios, [380000, 400000, 410000, 430000]);
});
test("sin año identificable no entra (la búsqueda ya no lleva el año)", () => {
  const precios = extraerPrecios([
    anuncio(395000, { title: "Mazda 3 Sedán i Sport" }),          // sin año ✘
    anuncio(399000, { title: "Mazda 3 2020 o 2021 Touring" }),    // dos años en el título: ambiguo ✘
    anuncio(401000, { title: "Mazda 3 Sedán", year: 2021 }),      // año en datos de Apify ✔
    anuncio(402000, { title: "Mazda 3", attributes: [{ id: "VEHICLE_YEAR", value_name: "2022" }] }), // ✔
  ], 2021);
  assert.deepEqual(precios, [401000, 402000]);
});
test("solo entran anuncios que mencionan el modelo en el título o la descripción (caso real: se coló un Serie 5)", () => {
  const bmw = (title, extra = {}) => ({ title, price: 400000, currency: "MXN", itemId: "MLM" + Math.random(), year: 2015, ...extra });
  const precios = extraerPrecios([
    bmw("Bmw Serie 5 2015"),                                                     // otro modelo ✘
    bmw("Bmw Serie 2 3.0 M235ia M Sport At", { price: 335000 }),                 // "235" dentro de "M235ia" ✔
    bmw("Bmw Serie 2 Coupé", { price: 350000, description: "Versión M235i, 3.0 turbo" }), // en la descripción ✔
    bmw("Bmw M240i Coupé"),                                                      // otro modelo ✘
  ], 2015, "235");
  assert.deepEqual(precios, [335000, 350000]);
});
test("modelos cortos tienen que ser palabra completa: el 3 de Mazda 3 no es el 3 de 2023 ni de CX-30", () => {
  const mazda = (title) => ({ title, price: 400000, currency: "MXN", itemId: "MLM" + Math.random(), year: 2021 });
  const precios = extraerPrecios([mazda("Mazda 3 i Touring"), mazda("Mazda CX30 i Sport 2023"), mazda("Mazda 2 2021 Sedán")], 2021, "3");
  assert.deepEqual(precios, [400000]);
});
test("el año sale del atributo Año que trae Apify con detalles", () => {
  assert.equal(anioDeAnuncio({ title: "Bmw Serie 2 2.0 M235i Xdrive Grand Coupe", attributes: [{ name: "Año", value: "2021" }] }), 2021);
});
test("la búsqueda en Apify pide los detalles de cada anuncio (para leer el año)", () => {
  assert.equal(entradaApify({ marca: "BMW", modelo: "235", anio: 2015 }).scrapeProductDetails, true);
});
test("año del anuncio: datos estructurados primero, luego el título", () => {
  assert.equal(anioDeAnuncio({ title: "Mazda 3 2019", year: 2021 }), 2021);
  assert.equal(anioDeAnuncio({ title: "Mazda 3 2019" }), 2019);
  assert.equal(anioDeAnuncio({ title: "Mazda 3" }), null);
});
test("la lista de anuncios trae título, año, precio y liga (solo https)", () => {
  const [l] = extraerAnuncios([anuncio(400000, { url: "javascript:alert(1)" })], 2021);
  assert.deepEqual(l, { titulo: "Mazda 3 2021 I Grand Touring", anio: 2021, precio: 400000, url: null });
});
test("la búsqueda en Apify usa México, la categoría de autos y marca+modelo (sin año)", () => {
  const e = entradaApify({ marca: "Mazda", modelo: "3", anio: 2021 });
  assert.equal(e.country, "MX");
  assert.equal(e.categoryId, "MLM1744");
  assert.equal(e.searchQuery, "Mazda 3");
});

// --- manejador HTTP ---
const pedir = (body, { auth = "", ip = "1.2.3.4" } = {}) => {
  const headers = { "Content-Type": "application/json", "x-forwarded-for": ip };
  if (auth) headers.Authorization = auth;
  return new Request("http://x/comparar-precio", { method: "POST", headers, body: JSON.stringify(body) });
};
const apifyOk = (precios = [390000, 400000, 410000]) => async () => Response.json(precios.map(p => anuncio(p)));
// Registro en memoria (en producción es la tabla "comparaciones" de Supabase)
function registroFalso({ porCorreo = 0, porIp = 0 } = {}) {
  const r = { filas: [], leads: [] };
  r.contar = async () => ({ correo: porCorreo, ip: porIp });
  r.guardar = async f => { r.filas.push(f); };
  r.crearLead = async l => { r.leads.push(l); };
  return r;
}

test("público: compara con nombre y correo, guarda la comparación y crea el contacto", async () => {
  const registro = registroFalso();
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro, fetchFn: apifyOk() });
  const r = await (await h(pedir({ ...base, ...contacto, precio_vendedor: "460000" }))).json();
  assert.equal(r.estado, "arriba");
  assert.equal(r.porcentaje, 15);
  assert.equal(r.precio_sugerido, 400000);
  assert.equal(r.listados.length, 3);
  assert.equal(registro.filas.length, 1);
  assert.equal(registro.filas[0].correo, "andrea@correo.com");
  assert.equal(registro.leads.length, 1);
  assert.equal(registro.leads[0].intent, "vender");
  assert.match(registro.leads[0].message, /Mazda 3 2021/);
});
test("público: sin nombre o con correo inválido no consulta Apify", async () => {
  let llamado = false;
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro: registroFalso(), fetchFn: async () => { llamado = true; } });
  for (const c of [{ correo: "andrea@correo.com" }, { nombre: "Andrea", correo: "andrea" }]) {
    const r = await (await h(pedir({ ...base, ...c, precio_vendedor: "400000" }))).json();
    assert.equal(r.estado, "contacto_invalido");
  }
  assert.equal(llamado, false);
});
test("público: precio inválido avisa sin consultar Apify ni contar para el límite", async () => {
  let llamado = false;
  const registro = registroFalso();
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro, fetchFn: async () => { llamado = true; } });
  const r = await (await h(pedir({ ...base, ...contacto, precio_vendedor: "abc" }))).json();
  assert.equal(r.estado, "precio_invalido");
  assert.equal(llamado, false);
  assert.equal(registro.filas.length, 0);
});
test("público: a la 4.ª comparación del día con el mismo correo → límite, sin consultar Apify", async () => {
  let llamado = false;
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro: registroFalso({ porCorreo: 3 }), fetchFn: async () => { llamado = true; } });
  const res = await h(pedir({ ...base, ...contacto, precio_vendedor: "400000" }));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).mensaje, MENSAJES.limite);
  assert.equal(llamado, false);
});
test("público: 10 comparaciones desde la misma conexión → límite aunque cambie el correo", async () => {
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro: registroFalso({ porIp: 10 }), fetchFn: apifyOk() });
  const res = await h(pedir({ ...base, ...contacto, precio_vendedor: "400000" }));
  assert.equal(res.status, 429);
});
test("público: el mensaje al equipo usa el mismo texto que la página en el borde del 10%", async () => {
  const registro = registroFalso();
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro, fetchFn: apifyOk([240000, 250000, 260000]) });
  await h(pedir({ ...base, ...contacto, precio_vendedor: "275001" }));
  assert.match(registro.leads[0].message, /Por encima del mercado \(poco más del 10 % arriba de la mediana de \$250,000, 3 anuncios\)/);
  assert.doesNotMatch(registro.leads[0].message, /\+10%/);
});
test("público: solo la primera comparación del día crea contacto", async () => {
  const registro = registroFalso({ porCorreo: 1 });
  const h = crearManejador({ token: "t", esAdmin: async () => false, registro, fetchFn: apifyOk() });
  await h(pedir({ ...base, ...contacto, precio_vendedor: "400000" }));
  assert.equal(registro.filas.length, 1);
  assert.equal(registro.leads.length, 0);
});
test("administrador: sin límite y sin pedir nombre ni correo", async () => {
  const registro = registroFalso({ porCorreo: 99, porIp: 99 });
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro, fetchFn: apifyOk() });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer admin" }))).json();
  assert.equal(r.estado, "en_linea");
  assert.equal(registro.filas.length, 0);
});
test("sin APIFY_TOKEN → No se pudo consultar el precio", async () => {
  const h = crearManejador({ token: undefined, esAdmin: async () => true });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer admin" }))).json();
  assert.equal(r.mensaje, "No se pudo consultar el precio, intenta más tarde");
});
test("Apify responde error HTTP → No se pudo consultar el precio", async () => {
  const h = crearManejador({ token: "t", esAdmin: async () => true, fetchFn: async () => new Response("x", { status: 502 }) });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer admin" }))).json();
  assert.equal(r.estado, "sin_respuesta");
});
test("el token va en el encabezado Authorization, no en la URL", async () => {
  let visto;
  const h = crearManejador({ token: "SECRETO", esAdmin: async () => true, fetchFn: async (url, opt) => {
    visto = { url, auth: opt.headers.Authorization, body: JSON.parse(opt.body) };
    return Response.json([anuncio(390000), anuncio(400000), anuncio(410000)]);
  } });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer admin" }))).json();
  assert.equal(r.estado, "en_linea");
  assert.ok(!visto.url.includes("SECRETO"));
  assert.equal(visto.auth, "Bearer SECRETO");
  assert.ok(visto.url.includes("sourabhbgp~mercadolibre-scraper"));
  assert.equal(visto.body.searchQuery, "Mazda 3");
});

// --- caché de búsquedas (Assignment 3: cuello de botella = Apify) ---
import { conCache, claveCache, recortarAnuncio, CACHE_DIAS } from "./logica.mjs";
function cacheFalsa({ fallaLeer = false, fallaGuardar = false } = {}) {
  const m = new Map();
  return {
    m,
    async leer(clave, dias) { if (fallaLeer) throw new Error("sin tabla"); assert.equal(dias, CACHE_DIAS); return m.get(clave) ?? null; },
    async guardar(clave, anuncios) { if (fallaGuardar) throw new Error("sin tabla"); m.set(clave, anuncios); },
  };
}
const apifyContado = (precios = [390000, 400000, 410000]) => {
  const f = async () => { f.llamadas++; return Response.json(precios.map(p => anuncio(p))); };
  f.llamadas = 0; return f;
};

test("caché: la misma búsqueda no vuelve a llamar a Apify y da el mismo resultado", async () => {
  const cache = cacheFalsa(), fetchFn = apifyContado();
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache, fetchFn });
  const r1 = await (await h(pedir({ ...base, precio_vendedor: "460000" }, { auth: "Bearer a" }))).json();
  const r2 = await (await h(pedir({ ...base, precio_vendedor: "460000" }, { auth: "Bearer a" }))).json();
  assert.equal(fetchFn.llamadas, 1);
  assert.equal(r1.de_cache, false);
  assert.equal(r2.de_cache, true);
  assert.equal(r2.referencia, r1.referencia);
  assert.equal(r2.estado, r1.estado);
});
test("caché: otro año del mismo modelo reusa la búsqueda (Apify busca sin año)", async () => {
  const cache = cacheFalsa(), fetchFn = apifyContado();
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache, fetchFn });
  await h(pedir({ ...base, anio: "2021", precio_vendedor: "400000" }, { auth: "Bearer a" }));
  await h(pedir({ ...base, anio: "2020", precio_vendedor: "400000" }, { auth: "Bearer a" }));
  assert.equal(fetchFn.llamadas, 1);
});
test("caché: mayúsculas y acentos no cambian la clave; otro modelo sí", () => {
  assert.equal(claveCache({ searchQuery: "Mazda 3" }), claveCache({ searchQuery: "  MAZDA   3 " }));
  assert.equal(claveCache({ searchQuery: "Volkswagen Jetta" }), "volkswagen jetta");
  assert.equal(claveCache({ searchQuery: "Citroën C3" }), "citroen c3");
  assert.notEqual(claveCache({ searchQuery: "Mazda 3" }), claveCache({ searchQuery: "Mazda CX30" }));
});
test("caché: si la tabla falla, compara igual con Apify (la caché nunca rompe la comparación)", async () => {
  for (const opciones of [{ fallaLeer: true }, { fallaGuardar: true }]) {
    const fetchFn = apifyContado();
    const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache: cacheFalsa(opciones), fetchFn });
    const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer a" }))).json();
    assert.equal(r.estado, "en_linea");
    assert.equal(fetchFn.llamadas, 1);
  }
});
test("caché: no guarda búsquedas vacías ni errores de Apify (se reintentan la próxima vez)", async () => {
  const cache = cacheFalsa();
  await conCache(async () => [], cache)({ searchQuery: "Bmw 235" });
  await assert.rejects(conCache(async () => { throw new Error("caído"); }, cache)({ searchQuery: "Mazda 3" }));
  assert.equal(cache.m.size, 0);
});
test("caché: lo guardado es recortado pero da la misma mediana que el anuncio completo", async () => {
  const completos = [390000, 400000, 410000].map(p => anuncio(p, {
    title: "Mazda 3 Sedan", description: "x".repeat(10000) + " Mazda 3", pictures: ["a", "b"], seller: { id: 1 },
    attributes: [{ name: "Año", value: "2021" }, { name: "Color", value: "Rojo" }],
  }));
  const recortados = completos.map(recortarAnuncio);
  assert.ok(JSON.stringify(recortados).length < JSON.stringify(completos).length / 2);
  const a = await compararPrecio({ ...base, precio_vendedor: "400000" }, async () => completos);
  const b = await compararPrecio({ ...base, precio_vendedor: "400000" }, async () => recortados);
  assert.equal(b.referencia, a.referencia);
  assert.equal(b.anuncios, a.anuncios);
});
test("caché: el público también la usa, y el límite de 3 por correo sigue contando", async () => {
  const cache = cacheFalsa(), fetchFn = apifyContado();
  const h1 = crearManejador({ token: "t", esAdmin: async () => false, registro: registroFalso(), cache, fetchFn });
  await h1(pedir({ ...base, ...contacto, precio_vendedor: "400000" }));
  const r = await (await h1(pedir({ ...base, ...contacto, correo: "otro@correo.com", precio_vendedor: "400000" }))).json();
  assert.equal(r.de_cache, true);
  assert.equal(fetchFn.llamadas, 1);
  const h2 = crearManejador({ token: "t", esAdmin: async () => false, registro: registroFalso({ porCorreo: 3 }), cache, fetchFn });
  assert.equal((await h2(pedir({ ...base, ...contacto, precio_vendedor: "400000" }))).status, 429);
});

// --- tope mensual de búsquedas nuevas en Apify (crédito gratis de US$5) ---
import { MAX_CONSULTAS_APIFY_MES } from "./logica.mjs";
function topeFalso(usadas = 0, { falla = false } = {}) {
  const t = { usadas, registradas: [] };
  t.contarMes = async () => { if (falla) throw new Error("sin tabla"); return t.usadas; };
  t.registrar = async c => { t.registradas.push(c); t.usadas++; };
  return t;
}
test("tope: 20 búsquedas nuevas al mes = ~US$4, dentro de los US$5 gratis de Apify", () => {
  assert.equal(MAX_CONSULTAS_APIFY_MES, 20);
  assert.ok(MAX_CONSULTAS_APIFY_MES * 0.20 <= 5);
});
test("tope: con 20 ya usadas no llama a Apify y avisa (público y administradores)", async () => {
  for (const admin of [false, true]) {
    const fetchFn = apifyContado();
    const h = crearManejador({ token: "t", esAdmin: async () => admin, registro: registroFalso(), cache: cacheFalsa(), tope: topeFalso(20), fetchFn });
    const r = await (await h(pedir({ ...base, ...contacto, precio_vendedor: "400000" }, { auth: admin ? "Bearer a" : "" }))).json();
    assert.equal(r.estado, "tope");
    assert.equal(r.mensaje, MENSAJES.tope);
    assert.equal(fetchFn.llamadas, 0);
  }
});
test("tope: la búsqueda 20 sí pasa y se registra; la 21 ya no", async () => {
  const tope = topeFalso(19), fetchFn = apifyContado();
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache: cacheFalsa(), tope, fetchFn });
  const r1 = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer a" }))).json();
  assert.equal(r1.estado, "en_linea");
  assert.deepEqual(tope.registradas, ["mazda 3"]);
  const r2 = await (await h(pedir({ ...base, modelo: "CX30", precio_vendedor: "400000" }, { auth: "Bearer a" }))).json();
  assert.equal(r2.estado, "tope");
  assert.equal(fetchFn.llamadas, 1);
});
test("tope: lo que sale de la caché sigue funcionando aunque se haya llegado al tope", async () => {
  const cache = cacheFalsa(); cache.m.set("mazda 3", [390000, 400000, 410000].map(p => anuncio(p)));
  const fetchFn = apifyContado();
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache, tope: topeFalso(20), fetchFn });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer a" }))).json();
  assert.equal(r.estado, "en_linea");
  assert.equal(r.de_cache, true);
  assert.equal(fetchFn.llamadas, 0);
});
test("tope: si no se puede contar, NO se llama a Apify (ante la duda se protege el crédito)", async () => {
  const fetchFn = apifyContado();
  const h = crearManejador({ token: "t", esAdmin: async () => true, registro: registroFalso(), cache: cacheFalsa(), tope: topeFalso(0, { falla: true }), fetchFn });
  const r = await (await h(pedir({ ...base, precio_vendedor: "400000" }, { auth: "Bearer a" }))).json();
  assert.equal(r.estado, "sin_respuesta");
  assert.equal(fetchFn.llamadas, 0);
});
