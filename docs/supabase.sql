-- Reto de transcripción · tabla de resultados en Supabase.
-- Ejecutar completo en el SQL Editor del proyecto. Es idempotente en lo posible.
--
-- Modelo de seguridad: la clave anónima es pública (viaja en config.js), así que TODA la
-- protección vive aquí: restricciones de la tabla + políticas de fila (RLS).
--   * Cualquiera puede LEER (la tabla de posiciones es pública para el equipo).
--   * Cualquiera puede INSERTAR, pero solo filas que cumplan las restricciones.
--   * Nadie con la clave anónima puede ACTUALIZAR ni BORRAR.
-- Correcciones y borrados los hace el organizador desde el panel de Supabase.

create table if not exists public.resultados (
  id         bigint generated always as identity primary key,
  edicion    text        not null check (edicion ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  slug       text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  nombre     text        not null check (length(btrim(nombre)) between 1 and 80),
  total      integer     not null check (total between 0 and 500),
  segundos   integer     not null check (segundos between 0 and 7200),
  rondas     jsonb       not null,
  fecha      timestamptz not null,
  creado     timestamptz not null default now(),

  -- Un intento por persona por edición. PostgREST responde 409 al violarla.
  constraint resultados_un_intento unique (edicion, slug),

  -- Cada ronda es un entero entre 0 y 100.
  constraint resultados_rondas_validas check (
    jsonb_typeof(rondas) = 'object'
    and (rondas ? 'r1') and (rondas ? 'r2') and (rondas ? 'r3') and (rondas ? 'r4') and (rondas ? 'r5')
    and jsonb_typeof(rondas->'r1') = 'number' and (rondas->>'r1')::numeric between 0 and 100
    and jsonb_typeof(rondas->'r2') = 'number' and (rondas->>'r2')::numeric between 0 and 100
    and jsonb_typeof(rondas->'r3') = 'number' and (rondas->>'r3')::numeric between 0 and 100
    and jsonb_typeof(rondas->'r4') = 'number' and (rondas->>'r4')::numeric between 0 and 100
    and jsonb_typeof(rondas->'r5') = 'number' and (rondas->>'r5')::numeric between 0 and 100
  ),

  -- El total debe ser la suma de las rondas.
  constraint resultados_total_cuadra check (
    total = (rondas->>'r1')::int + (rondas->>'r2')::int + (rondas->>'r3')::int
          + (rondas->>'r4')::int + (rondas->>'r5')::int
  )
);

alter table public.resultados enable row level security;

drop policy if exists "leer resultados" on public.resultados;
create policy "leer resultados" on public.resultados
  for select to anon, authenticated
  using (true);

drop policy if exists "insertar resultados" on public.resultados;
create policy "insertar resultados" on public.resultados
  for insert to anon, authenticated
  with check (true);  -- las restricciones de la tabla hacen la validación

-- Sin políticas de UPDATE ni DELETE: quedan prohibidas para la clave anónima.
-- Además se retiran los privilegios por si alguien agrega una política por error.
revoke update, delete, truncate on public.resultados from anon, authenticated;

-- Evita que la clave anónima escriba las columnas internas.
revoke insert on public.resultados from anon, authenticated;
grant insert (edicion, slug, nombre, total, segundos, rondas, fecha) on public.resultados to anon, authenticated;
grant select on public.resultados to anon, authenticated;
