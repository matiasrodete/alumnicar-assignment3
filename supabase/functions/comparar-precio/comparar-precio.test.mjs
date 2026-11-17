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
  assert.deepEqual(veredicto(460000, 400000), { estado: "arriba", mensaje: "Por encima del mercado", diferencia: 60000, porcentaje: 15 });
});
test("exactamente +10% → En línea con el mercado", () => {
  assert.equal(veredicto(440000, 400000).estado, "en_linea");
});
test("exactamente -10% → En línea con el mercado", () => {
  assert.equal(veredicto(360000, 400000).estado, "en_linea");
});
test("más de 10% abajo → Por debajo del mercado + diferencia y porcentaje", () => {
  assert.deepEqual(veredicto(340000, 400000), { estado: "abajo", mensaje: "Por debajo del mercado", diferencia: 60000, porcentaje: -15 });
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
