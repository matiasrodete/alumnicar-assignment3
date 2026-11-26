// AlumniCar · Supabase Edge Function "comparar-precio"
// Compara el precio de un vendedor contra anuncios de Mercado Libre México (vía Apify).
// La usan el panel de administración (sin límite) y la página pública "Vende tu coche" (3 por correo al día).
//
// El token de Apify se lee de la variable de entorno APIFY_TOKEN (secreto de Supabase):
//   supabase secrets set APIFY_TOKEN=...      (o en el panel: Edge Functions → Secrets)
// Nunca se escribe en el código.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { crearManejador } from "./manejador.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
// Supabase pone la llave de servicio como variable de entorno dentro de la función: no está en el código
// ni llega al navegador. Solo se usa aquí para contar y guardar comparaciones (límite por correo).
const servicio = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// ¿La sesión que llama pertenece a un administrador? Usa la función is_admin() del esquema.
async function esAdmin(authHeader: string): Promise<boolean> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await sb.rpc("is_admin");
  return !error && data === true;
}

const registro = {
  async contar({ correo, ip }: { correo: string; ip: string | null }) {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const contarPor = async (col: string, val: string) => {
      const { count, error } = await servicio.from("comparaciones")
        .select("id", { count: "exact", head: true }).eq(col, val).gte("created_at", desde);
      if (error) throw error;
      return count ?? 0;
    };
    const [porCorreo, porIp] = await Promise.all([contarPor("correo", correo), ip ? contarPor("ip", ip) : 0]);
    return { correo: porCorreo, ip: porIp };
  },
  async guardar(fila: Record<string, unknown>) {
    const { error } = await servicio.from("comparaciones").insert(fila);
    if (error) throw error;
  },
  async crearLead(lead: Record<string, unknown>) {
    const { error } = await servicio.from("leads").insert(lead);
    if (error) throw error;
  },
};

// Caché de búsquedas de Apify (tabla busquedas_apify, ver supabase/05_cache_busquedas.sql).
const cache = {
  async leer(clave: string, dias: number) {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await servicio.from("busquedas_apify")
      .select("anuncios").eq("clave", clave).gte("created_at", desde).maybeSingle();
    if (error) throw error;
    return data?.anuncios ?? null;
  },
  async guardar(clave: string, anuncios: unknown[]) {
    const { error } = await servicio.from("busquedas_apify")
      .upsert({ clave, anuncios, created_at: new Date().toISOString() }, { onConflict: "clave" });
    if (error) throw error;
  },
};

Deno.serve(crearManejador({ token: Deno.env.get("APIFY_TOKEN"), esAdmin, registro, cache }));
