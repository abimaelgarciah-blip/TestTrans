-- Kart Fiesta: tabla de carreras (una fila por carrera; 3 filas por Gran Premio).
-- Ejecútalo una vez en Supabase → SQL Editor. Solo permite leer e insertar.
create table if not exists public.kart_carreras (
  id bigint generated always as identity primary key,
  gp_id text not null check (char_length(gp_id) between 1 and 60),
  sala text check (char_length(sala) <= 10),
  numero smallint not null check (numero between 1 and 3),
  pista text not null check (char_length(pista) <= 30),
  resultados jsonb not null check (jsonb_typeof(resultados) = 'array' and jsonb_array_length(resultados) <= 10),
  totales jsonb not null check (jsonb_typeof(totales) = 'array' and jsonb_array_length(totales) <= 10),
  creado timestamptz not null default now(),
  unique (gp_id, numero)
);

alter table public.kart_carreras enable row level security;

drop policy if exists "kart leer" on public.kart_carreras;
create policy "kart leer" on public.kart_carreras for select to anon, authenticated using (true);

drop policy if exists "kart insertar" on public.kart_carreras;
create policy "kart insertar" on public.kart_carreras for insert to anon, authenticated with check (true);

grant select, insert on public.kart_carreras to anon, authenticated;
