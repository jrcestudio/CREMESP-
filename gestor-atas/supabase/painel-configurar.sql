-- Painel de Atas – Cremesp (sistema separado do Gestor de Atas da REDXCORP)
-- Cole este script inteiro em Supabase › SQL Editor › New query e clique em "Run".
-- ANTES de rodar, troque o e-mail da última parte (item 10) pelo seu.
-- Pode rodar no mesmo projeto do Supabase do Gestor de Atas: as tabelas têm
-- nomes próprios (painel_...) e nada do Gestor atual é lido ou alterado.
-- Pode rodar de novo sem problema (não apaga dados).

-- 1. Atas do painel (cada uma vira um sistema completo)
create table if not exists public.painel_atas (
  id text primary key,
  setor text not null default '',
  servico text not null default '',
  arquivo jsonb,
  criado_em timestamptz not null default now(),
  criado_por text
);

-- 2. Dados de cada ata (Ata, módulos, itens e eventos), separados por ata
create table if not exists public.painel_registros (
  ata_id text not null references public.painel_atas (id) on delete cascade,
  colecao text not null check (colecao in ('ata', 'modulos', 'itens', 'eventos')),
  id text not null,
  ordem integer not null default 0,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  primary key (ata_id, colecao, id)
);

-- 3. Quem tem acesso. Equipe vê todas as atas (ata_id = 'todas').
--    Fornecedor vê só a ata em que foi cadastrado.
create table if not exists public.painel_membros (
  email text not null,
  papel text not null default 'equipe' check (papel in ('equipe', 'fornecedor')),
  ata_id text not null default 'todas',
  adicionado_por text,
  adicionado_em timestamptz not null default now(),
  primary key (email, ata_id)
);

-- 4. Funções de acesso
create or replace function public.painel_eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.painel_membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and papel = 'equipe'
  );
$$;
grant execute on function public.painel_eh_equipe() to authenticated;

create or replace function public.painel_fornecedor_da_ata(p_ata text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.painel_membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and papel = 'fornecedor' and ata_id = p_ata
  );
$$;
grant execute on function public.painel_fornecedor_da_ata(text) to authenticated;

create or replace function public.painel_meu_acesso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'equipe', public.painel_eh_equipe(),
    'atas', coalesce((
      select jsonb_agg(ata_id) from public.painel_membros
      where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and papel = 'fornecedor'
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.painel_meu_acesso() to authenticated;

-- Evento já enviado ao fornecedor (rascunhos internos ficam invisíveis para ele)
create or replace function public.painel_evento_visivel(p_dados jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(p_dados ->> 'etapa', case when p_dados ->> 'status' = 'aprovado' then 'aprovado' else 'rascunho' end) <> 'rascunho';
$$;

create or replace function public.painel_evento_do_fornecedor(p_ata text, p_evento text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.painel_fornecedor_da_ata(p_ata) and exists (
    select 1 from public.painel_registros
    where ata_id = p_ata and colecao = 'eventos' and id = p_evento
      and public.painel_evento_visivel(dados)
  );
$$;
grant execute on function public.painel_evento_do_fornecedor(text, text) to authenticated;

-- 5. Registra quem alterou e quando
create or replace function public.painel_marcar_alteracao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.jwt() ->> 'email';
  return new;
end;
$$;
drop trigger if exists painel_registros_marcar on public.painel_registros;
create trigger painel_registros_marcar
  before insert or update on public.painel_registros
  for each row execute function public.painel_marcar_alteracao();

-- 6. Segurança
alter table public.painel_atas enable row level security;
alter table public.painel_registros enable row level security;
alter table public.painel_membros enable row level security;

drop policy if exists "equipe usa painel_atas" on public.painel_atas;
create policy "equipe usa painel_atas" on public.painel_atas for all to authenticated
  using (public.painel_eh_equipe()) with check (public.painel_eh_equipe());
drop policy if exists "fornecedor le painel_atas" on public.painel_atas;
create policy "fornecedor le painel_atas" on public.painel_atas for select to authenticated
  using (public.painel_fornecedor_da_ata(id));

drop policy if exists "equipe usa painel_registros" on public.painel_registros;
create policy "equipe usa painel_registros" on public.painel_registros for all to authenticated
  using (public.painel_eh_equipe()) with check (public.painel_eh_equipe());
drop policy if exists "fornecedor le painel_registros" on public.painel_registros;
create policy "fornecedor le painel_registros" on public.painel_registros for select to authenticated
  using (public.painel_fornecedor_da_ata(ata_id) and (colecao <> 'eventos' or public.painel_evento_visivel(dados)));

drop policy if exists "equipe usa painel_membros" on public.painel_membros;
create policy "equipe usa painel_membros" on public.painel_membros for all to authenticated
  using (public.painel_eh_equipe()) with check (public.painel_eh_equipe());

-- 7. Arquivos (a própria ata em PDF e os anexos dos eventos), limite de 32 MB
--    Caminhos: <id da ata>/ata/...  e  <id da ata>/eventos/<id do evento>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('painel-anexos', 'painel-anexos', false, 33554432)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "equipe usa painel-anexos" on storage.objects;
create policy "equipe usa painel-anexos" on storage.objects for all to authenticated
  using (bucket_id = 'painel-anexos' and public.painel_eh_equipe())
  with check (bucket_id = 'painel-anexos' and public.painel_eh_equipe());

drop policy if exists "fornecedor le painel-anexos" on storage.objects;
create policy "fornecedor le painel-anexos" on storage.objects for select to authenticated
  using (
    bucket_id = 'painel-anexos'
    and (storage.foldername(name))[2] = 'eventos'
    and public.painel_evento_do_fornecedor((storage.foldername(name))[1], (storage.foldername(name))[3])
  );

drop policy if exists "fornecedor envia painel-anexos" on storage.objects;
create policy "fornecedor envia painel-anexos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'painel-anexos'
    and (storage.foldername(name))[2] = 'eventos'
    and public.painel_evento_do_fornecedor((storage.foldername(name))[1], (storage.foldername(name))[3])
  );

-- 8. Ações do fornecedor: confirmar orçamento, pedir ajuste, mensagem e nota fiscal
create or replace function public.painel_fornecedor_acao(p_ata text, p_evento text, p_acao text, p_mensagem text default '', p_anexos jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
  etapa_atual text;
  nova text;
  msg text := left(coalesce(trim(p_mensagem), ''), 2000);
  anexos jsonb := '[]'::jsonb;
  a jsonb;
  entrada jsonb;
begin
  if not public.painel_fornecedor_da_ata(p_ata) then
    raise exception 'Acesso permitido só ao fornecedor desta ata.';
  end if;

  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 10 then
      raise exception 'Envie no máximo 10 arquivos por vez.';
    end if;
    for a in select * from jsonb_array_elements(p_anexos) loop
      if coalesce(a ->> 'caminho', '') not like p_ata || '/eventos/' || p_evento || '/%' then
        raise exception 'Anexo inválido.';
      end if;
      anexos := anexos || jsonb_build_array(jsonb_build_object(
        'nome', left(coalesce(a ->> 'nome', 'arquivo'), 200),
        'caminho', a ->> 'caminho',
        'tamanho', coalesce((a ->> 'tamanho')::bigint, 0),
        'tipo', left(coalesce(a ->> 'tipo', ''), 100)
      ));
    end loop;
  end if;

  select dados into d from public.painel_registros
  where ata_id = p_ata and colecao = 'eventos' and id = p_evento
  for update;
  if not found then
    raise exception 'Evento não encontrado.';
  end if;

  etapa_atual := coalesce(d ->> 'etapa', case when d ->> 'status' = 'aprovado' then 'aprovado' else 'rascunho' end);
  if etapa_atual = 'rascunho' then
    raise exception 'Este evento ainda não foi enviado ao fornecedor.';
  end if;

  if p_acao = 'confirmar' then
    if etapa_atual <> 'revisao_fornecedor' then
      raise exception 'Este orçamento não está aguardando revisão.';
    end if;
    nova := 'revisado_fornecedor';
  elsif p_acao = 'ajuste' then
    if etapa_atual <> 'revisao_fornecedor' then
      raise exception 'Este orçamento não está aguardando revisão.';
    end if;
    if msg = '' then
      raise exception 'Descreva o ajuste.';
    end if;
    nova := 'ajuste_solicitado';
  elsif p_acao = 'nota_fiscal' then
    if etapa_atual not in ('aprovado', 'protocolado', 'os_enviada', 'realizado', 'nota_recebida') then
      raise exception 'A nota fiscal só pode ser enviada depois da aprovação do evento.';
    end if;
    if jsonb_array_length(anexos) = 0 then
      raise exception 'Anexe o arquivo da nota fiscal.';
    end if;
    nova := 'nota_recebida';
  elsif p_acao = 'mensagem' then
    if msg = '' and jsonb_array_length(anexos) = 0 then
      raise exception 'Escreva a mensagem ou anexe um arquivo.';
    end if;
    nova := etapa_atual;
  else
    raise exception 'Ação inválida.';
  end if;

  entrada := jsonb_build_object(
    'id', 'forn-' || gen_random_uuid()::text,
    'em', to_jsonb(now()),
    'por', coalesce(auth.jwt() ->> 'email', ''),
    'lado', 'fornecedor',
    'etapa', nova,
    'acao', p_acao
  );
  if msg <> '' then
    entrada := entrada || jsonb_build_object('mensagem', msg);
  end if;
  if jsonb_array_length(anexos) > 0 then
    entrada := entrada || jsonb_build_object('anexos', anexos);
  end if;

  d := d
    || jsonb_build_object('etapa', nova, 'atualizadoEm', to_jsonb(now()))
    || jsonb_build_object('historico', coalesce(d -> 'historico', '[]'::jsonb) || jsonb_build_array(entrada));

  update public.painel_registros set dados = d where ata_id = p_ata and colecao = 'eventos' and id = p_evento;
  return d;
end;
$$;
revoke all on function public.painel_fornecedor_acao(text, text, text, text, jsonb) from public;
grant execute on function public.painel_fornecedor_acao(text, text, text, text, jsonb) to authenticated;

-- 9. Atualização em tempo real entre os computadores
alter table public.painel_registros replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.painel_registros;
exception when duplicate_object then null;
end $$;

-- 10. Primeiro membro da equipe: TROQUE pelo seu e-mail
insert into public.painel_membros (email, papel, ata_id, adicionado_por)
values (lower('seu.email@exemplo.com'), 'equipe', 'todas', 'configuração inicial')
on conflict (email, ata_id) do nothing;
