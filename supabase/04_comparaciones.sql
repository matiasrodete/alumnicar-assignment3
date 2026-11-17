-- AlumniCar · Comparaciones de precio hechas desde la página pública (Vende tu coche)
-- Sirve para limitar a 3 comparaciones por correo (y 10 por conexión) cada 24 h,
-- porque cada consulta gasta créditos de Apify. Solo la función "comparar-precio" escribe aquí.
create table if not exists public.comparaciones (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  correo      text not null check (char_length(correo) between 5 and 200),
  ip          text,
  marca       text not null,
  modelo      text not null,
  anio        int  not null,
  kilometraje int  not null,
  precio      numeric(12,2) not null,
  estado      text not null,
  referencia  numeric(12,2)
);
create index if not exists comparaciones_correo_fecha on public.comparaciones (correo, created_at desc);
create index if not exists comparaciones_ip_fecha on public.comparaciones (ip, created_at desc);

alter table public.comparaciones enable row level security;
-- Nadie del público puede leer ni escribir; la función usa la llave de servicio del lado del servidor.
drop policy if exists "admins leen comparaciones" on public.comparaciones;
create policy "admins leen comparaciones" on public.comparaciones
  for select to authenticated using (public.is_admin());
