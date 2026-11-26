// AlumniCar · manejo de la petición HTTP del comparador (sin dependencias de Deno,
// para poder probarlo con Node). index.ts solo conecta esto con Deno y Supabase.
import {
  ACTOR_APIFY, MENSAJES, MAX_COMPARACIONES_CORREO, MAX_COMPARACIONES_IP,
  compararPrecio, conCache, validarContacto, validarDatos, validarPrecio,
} from "./logica.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Llama al actor de Apify y regresa los anuncios. Lanza error si Apify no responde bien.
export function consultarApifyCon(token, fetchFn = fetch, timeoutMs = 110000) {
  return async (input) => {
    const url = `https://api.apify.com/v2/acts/${ACTOR_APIFY}/run-sync-get-dataset-items?timeout=100&format=json`;
    const r = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) throw new Error(`Apify respondió ${r.status}`);
    return await r.json();
  };
}

const pesos = n => "$" + Math.round(n).toLocaleString("es-MX");

// deps: {
//   token: string|undefined,
//   esAdmin(authHeader) => Promise<boolean>,
//   registro: { contar({correo, ip}) => Promise<{correo, ip}>, guardar(fila), crearLead(lead) },
//   cache?: { leer(clave, dias) => Promise<anuncios|null>, guardar(clave, anuncios) },
//   fetchFn?
// }
// Administradores (panel): sin límite y sin datos de contacto.
// Público (Vende tu coche): pide nombre y correo; máximo 3 comparaciones por correo y 10 por conexión
// cada 24 h. La primera comparación del día de cada correo llega al equipo como contacto "vender".
export function crearManejador({ token, esAdmin, registro, cache, fetchFn = fetch }) {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ estado: "error", mensaje: "Método no permitido" }, 405);

    let body;
    try { body = await req.json(); } catch { body = {}; }
    if (!body || typeof body !== "object") body = {};

    // Sin token configurado no se puede consultar: mismo mensaje que si Apify no respondiera
    const apify = token ? consultarApifyCon(token, fetchFn) : async () => { throw new Error("Falta APIFY_TOKEN"); };
    // Caché de 60 días por búsqueda: la misma marca + modelo no vuelve a pagar Apify ni esperar 30-60 s
    const uso = { deCache: false };
    const consultar = conCache(apify, cache, uso);
    const responder = (r, status) => json(r.estado && r.anuncios !== undefined ? { ...r, de_cache: uso.deCache } : r, status);

    const auth = req.headers.get("Authorization") || "";
    const admin = auth ? await esAdmin(auth).catch(() => false) : false;
    if (admin) return responder(await compararPrecio(body, consultar));

    // --- Público ---
    // Precio o datos del coche mal escritos: se responde sin gastar Apify ni contar para el límite
    const precio = validarPrecio(body.precio_vendedor);
    const datos = validarDatos(body);
    if (precio === null || !datos) return json(await compararPrecio(body, consultar));
    const contacto = validarContacto(body);
    if (!contacto) return json({ estado: "contacto_invalido", mensaje: MENSAJES.contacto_invalido });
    if (!registro) return json({ estado: "sin_respuesta", mensaje: MENSAJES.sin_respuesta });

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    let usados;
    try { usados = await registro.contar({ correo: contacto.correo, ip }); }
    catch { return json({ estado: "sin_respuesta", mensaje: MENSAJES.sin_respuesta }); }
    if (usados.correo >= MAX_COMPARACIONES_CORREO || (ip && usados.ip >= MAX_COMPARACIONES_IP)) {
      return json({ estado: "limite", mensaje: MENSAJES.limite }, 429);
    }

    const r = await compararPrecio(body, consultar);
    await Promise.resolve(registro.guardar({
      correo: contacto.correo, ip, marca: datos.marca, modelo: datos.modelo, anio: datos.anio,
      kilometraje: datos.kilometraje, precio, estado: r.estado, referencia: r.referencia ?? null,
    })).catch(() => {});

    if (usados.correo === 0) {
      const coche = `${datos.marca} ${datos.modelo} ${datos.anio}, ${datos.kilometraje.toLocaleString("es-MX")} km`;
      const resumen = r.referencia
        ? `${r.mensaje} (${r.texto_porcentaje} de la mediana de ${pesos(r.referencia)}, ${r.anuncios} anuncios)`
        : r.mensaje;
      await Promise.resolve(registro.crearLead({
        intent: "vender", name: contacto.nombre, email: contacto.correo, is_uni: null,
        message: `Comparó su precio en la web. ${coche}. Precio que quiere: ${pesos(precio)}. Resultado: ${resumen}.`.slice(0, 2000),
      })).catch(() => {});
    }
    return responder(r);
  };
}

export { MENSAJES };
