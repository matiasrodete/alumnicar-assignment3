-- AlumniCar · Seguridad (Assignment 3)
-- 1) Tope mensual de búsquedas nuevas en Apify: cada fila = una búsqueda que sí se pagó.
--    La función "comparar-precio" no llama a Apify si este mes ya hay 20 (~US$4 de los US$5 gratis).
create table if not exists public.consultas_apify (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  clave       text not null check (char_length(clave) between 1 and 200)
);
create index if not exists consultas_apify_fecha on public.consultas_apify (created_at desc);
alter table public.consultas_apify enable row level security;
drop policy if exists "admins leen consultas" on public.consultas_apify;
create policy "admins leen consultas" on public.consultas_apify
  for select to authenticated using (public.is_admin());

-- 2) Anti-spam de contactos. Cualquiera puede insertar en "leads" con la llave pública (así funciona el
--    formulario), incluso sin pasar por la página, con un script. Esta regla corre dentro de la base de datos,
--    así que aplica aunque se brinquen la página:
--    - máximo 3 contactos del mismo correo en 24 h
--    - máximo 30 contactos en total por hora (frena un script que invente correos)
create index if not exists leads_correo_fecha on public.leads (lower(email), created_at desc);
create or replace function public.leads_antispam() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.leads
        where lower(email) = lower(new.email) and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Demasiadas solicitudes con este correo hoy' using errcode = 'P0001';
  end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Demasiadas solicitudes en este momento' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.leads_antispam() from public, anon, authenticated;
drop trigger if exists leads_antispam on public.leads;
create trigger leads_antispam before insert on public.leads
  for each row execute function public.leads_antispam();
