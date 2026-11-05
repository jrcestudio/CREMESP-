-- Gestor de Atas – Cremesp
-- Cole este script inteiro em Supabase › SQL Editor › New query e clique em "Run".
-- ANTES de rodar, troque o e-mail da última linha pelo seu.

-- 1. Quem tem acesso (lista de e-mails autorizados)
create table if not exists public.membros (
  email text primary key,
  adicionado_por text,
  adicionado_em timestamptz not null default now()
);

-- 2. Todos os dados do sistema (Ata, módulos, itens e eventos)
create table if not exists public.registros (
  colecao text not null check (colecao in ('ata', 'modulos', 'itens', 'eventos')),
  id text not null,
  ordem integer not null default 0,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  primary key (colecao, id)
);

-- 3. Função que diz se quem está logado é membro
create or replace function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.eh_membro() to authenticated;

-- 4. Registra quem alterou e quando
create or replace function public.marcar_alteracao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.jwt() ->> 'email';
  return new;
end;
$$;
drop trigger if exists registros_marcar_alteracao on public.registros;
create trigger registros_marcar_alteracao
  before insert or update on public.registros
  for each row execute function public.marcar_alteracao();

-- 5. Segurança: só membros leem e escrevem
alter table public.membros enable row level security;
alter table public.registros enable row level security;

drop policy if exists "membros leem membros" on public.membros;
drop policy if exists "membros incluem membros" on public.membros;
drop policy if exists "membros removem membros" on public.membros;
create policy "membros leem membros" on public.membros for select to authenticated using (public.eh_membro());
create policy "membros incluem membros" on public.membros for insert to authenticated with check (public.eh_membro());
create policy "membros removem membros" on public.membros for delete to authenticated using (public.eh_membro());

drop policy if exists "membros usam registros" on public.registros;
create policy "membros usam registros" on public.registros for all to authenticated
  using (public.eh_membro()) with check (public.eh_membro());

-- 6. Atualização em tempo real entre os computadores
alter table public.registros replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null;
end $$;

-- 7. Primeiro membro: TROQUE pelo seu e-mail
insert into public.membros (email, adicionado_por)
values (lower('seu.email@exemplo.com'), 'configuração inicial')
on conflict (email) do nothing;
