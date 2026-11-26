-- AlumniCar · Caché de búsquedas de Apify (Assignment 3, escalabilidad)
-- Cada búsqueda en Apify cuesta ~US$0.20 y tarda 30-60 s; con el crédito gratis (US$5/mes) alcanza
-- para ~25 comparaciones. Aquí se guardan 30 días los anuncios de cada búsqueda "marca modelo",
-- para que la misma búsqueda no se vuelva a pagar ni a esperar.
-- Solo la función "comparar-precio" lee y escribe (con la llave de servicio, del lado del servidor).
create table if not exists public.busquedas_apify (
  clave       text primary key check (char_length(clave) between 1 and 200), -- "mazda 3"
  created_at  timestamptz not null default now(),
  anuncios    jsonb not null
);

alter table public.busquedas_apify enable row level security;
-- Sin políticas para el público: nadie puede leer ni escribir desde la página.
drop policy if exists "admins leen busquedas" on public.busquedas_apify;
create policy "admins leen busquedas" on public.busquedas_apify
  for select to authenticated using (public.is_admin());
