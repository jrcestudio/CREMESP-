-- Painel de Atas (SaaS) – banco para vários órgãos
-- Use um projeto NOVO do Supabase, separado do Gestor de Atas e do Painel do Cremesp.
-- Cole este script inteiro em Supabase › SQL Editor › New query e clique em "Run".
-- ANTES de rodar, troque o e-mail da última parte (item 13) pelo seu: ele vira o
-- administrador da plataforma, que cadastra os órgãos clientes.
-- Pode rodar de novo sem problema (não apaga dados).
--
-- Como os dados ficam separados:
--   orgaos            cada órgão cliente (nome, sigla, CNPJ, cor, logo, ativo)
--   painel_atas       as atas, cada uma de um órgão (orgao_id)
--   painel_registros  dados de cada ata (Ata, módulos, itens e eventos)
--   painel_membros    quem acessa: equipe do órgão (todas as atas dele) ou fornecedor (uma ata)
--   auditoria         histórico de alterações (quem, quando, antes e depois); ninguém edita
-- Cada pessoa só enxerga o que é do(s) órgão(s) em que foi cadastrada. Órgão com
-- "ativo = false" fica bloqueado (por exemplo, contrato encerrado).

create extension if not exists pgcrypto;

-- 1. Órgãos clientes
create table if not exists public.orgaos (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nome text not null,
  sigla text not null default '',
  cnpj text not null default '',
  endereco text not null default '',
  cidade text not null default '',
  uasg text not null default '',
  cor text not null default '#2563eb' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  logo text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000)),
  ativo boolean not null default true,
  observacoes text not null default '',
  criado_em timestamptz not null default now()
);

-- 2. Administradores da plataforma (você). Cadastram órgãos e o primeiro membro de cada um.
--    Não enxergam as atas dos órgãos.
create table if not exists public.plataforma_admins (
  email text primary key,
  adicionado_em timestamptz not null default now()
);

-- 3. Atas
create table if not exists public.painel_atas (
  id text primary key,
  orgao_id text not null references public.orgaos (id) on delete cascade,
  setor text not null default '',
  servico text not null default '',
  arquivo jsonb,
  criado_em timestamptz not null default now(),
  criado_por text
);
create index if not exists painel_atas_orgao on public.painel_atas (orgao_id);

-- 4. Dados de cada ata
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

-- 5. Quem tem acesso
create table if not exists public.painel_membros (
  email text not null,
  orgao_id text not null references public.orgaos (id) on delete cascade,
  papel text not null default 'equipe' check (papel in ('equipe', 'fornecedor')),
  ata_id text not null default 'todas',
  adicionado_por text,
  adicionado_em timestamptz not null default now(),
  primary key (email, orgao_id, ata_id)
);
create index if not exists painel_membros_email on public.painel_membros (lower(email));

-- 6. Histórico de alterações
create table if not exists public.auditoria (
  id bigserial primary key,
  orgao_id text not null,
  ata_id text,
  tabela text not null,
  colecao text,
  registro_id text,
  acao text not null,
  por text,
  em timestamptz not null default now(),
  antes jsonb,
  depois jsonb
);
create index if not exists auditoria_orgao_em on public.auditoria (orgao_id, em desc);

-- 7. Funções de acesso
create or replace function public.meu_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.eh_plataforma()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plataforma_admins where lower(email) = public.meu_email());
$$;

create or replace function public.orgao_ativo(p_orgao text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orgaos where id = p_orgao and ativo);
$$;

create or replace function public.orgao_da_ata(p_ata text)
returns text language sql stable security definer set search_path = public as $$
  select orgao_id from public.painel_atas where id = p_ata;
$$;

create or replace function public.eh_equipe(p_orgao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.orgao_ativo(p_orgao) and exists (
    select 1 from public.painel_membros
    where lower(email) = public.meu_email() and orgao_id = p_orgao and papel = 'equipe'
  );
$$;

create or replace function public.eh_equipe_da_ata(p_ata text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_equipe(public.orgao_da_ata(p_ata));
$$;

create or replace function public.painel_fornecedor_da_ata(p_ata text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.painel_membros m
    join public.painel_atas a on a.id = m.ata_id and a.orgao_id = m.orgao_id
    join public.orgaos o on o.id = a.orgao_id and o.ativo
    where lower(m.email) = public.meu_email() and m.papel = 'fornecedor' and m.ata_id = p_ata
  );
$$;

-- Evento já enviado ao fornecedor (rascunhos internos ficam invisíveis para ele)
create or replace function public.painel_evento_visivel(p_dados jsonb)
returns boolean language sql immutable as $$
  select coalesce(p_dados ->> 'etapa', case when p_dados ->> 'status' = 'aprovado' then 'aprovado' else 'rascunho' end) <> 'rascunho';
$$;

create or replace function public.painel_evento_do_fornecedor(p_ata text, p_evento text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.painel_fornecedor_da_ata(p_ata) and exists (
    select 1 from public.painel_registros
    where ata_id = p_ata and colecao = 'eventos' and id = p_evento and public.painel_evento_visivel(dados)
  );
$$;

-- O que a pessoa que entrou pode acessar: órgãos (com a identidade de cada um) e papel em cada um
create or replace function public.painel_meu_acesso()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plataforma', public.eh_plataforma(),
    'orgaos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'nome', o.nome, 'sigla', o.sigla, 'cnpj', o.cnpj, 'endereco', o.endereco,
        'cidade', o.cidade, 'uasg', o.uasg, 'cor', o.cor, 'logo', o.logo,
        'equipe', exists (select 1 from public.painel_membros m where lower(m.email) = public.meu_email() and m.orgao_id = o.id and m.papel = 'equipe'),
        'atas', coalesce((select jsonb_agg(m.ata_id) from public.painel_membros m where lower(m.email) = public.meu_email() and m.orgao_id = o.id and m.papel = 'fornecedor'), '[]'::jsonb)
      ) order by o.nome)
      from public.orgaos o
      where o.ativo and exists (select 1 from public.painel_membros m where lower(m.email) = public.meu_email() and m.orgao_id = o.id)
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.meu_email(), public.eh_plataforma(), public.orgao_ativo(text), public.orgao_da_ata(text),
  public.eh_equipe(text), public.eh_equipe_da_ata(text), public.painel_fornecedor_da_ata(text),
  public.painel_evento_do_fornecedor(text, text), public.painel_meu_acesso() to authenticated;

-- 8. Registro de quem alterou e histórico
create or replace function public.painel_marcar_alteracao()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.jwt() ->> 'email';
  return new;
end;
$$;
drop trigger if exists painel_registros_marcar on public.painel_registros;
create trigger painel_registros_marcar before insert or update on public.painel_registros
  for each row execute function public.painel_marcar_alteracao();

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antigo jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  novo jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  linha jsonb := coalesce(novo, antigo);
  v_orgao text;
  v_ata text;
begin
  if tg_op = 'UPDATE' and antigo - 'atualizado_em' - 'atualizado_por' = novo - 'atualizado_em' - 'atualizado_por' then
    return null;
  end if;
  if tg_table_name = 'painel_registros' then
    v_ata := linha ->> 'ata_id';
    v_orgao := coalesce(public.orgao_da_ata(v_ata), (select a.orgao_id from public.auditoria a where a.ata_id = v_ata limit 1));
    antigo := antigo -> 'dados';
    novo := novo -> 'dados';
  elsif tg_table_name = 'painel_atas' then
    v_ata := linha ->> 'id';
    v_orgao := linha ->> 'orgao_id';
  else
    v_ata := nullif(linha ->> 'ata_id', 'todas');
    v_orgao := linha ->> 'orgao_id';
  end if;
  if v_orgao is null then
    return null;
  end if;
  insert into public.auditoria (orgao_id, ata_id, tabela, colecao, registro_id, acao, por, antes, depois)
  values (v_orgao, v_ata, tg_table_name, linha ->> 'colecao', coalesce(linha ->> 'id', linha ->> 'email'),
          lower(tg_op), auth.jwt() ->> 'email', antigo, novo);
  return null;
end;
$$;
drop trigger if exists auditoria_registros on public.painel_registros;
create trigger auditoria_registros after insert or update or delete on public.painel_registros
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_atas on public.painel_atas;
create trigger auditoria_atas after insert or update or delete on public.painel_atas
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_membros on public.painel_membros;
create trigger auditoria_membros after insert or update or delete on public.painel_membros
  for each row execute function public.registrar_auditoria();

-- 9. Segurança (cada linha só para quem é do órgão)
alter table public.orgaos enable row level security;
alter table public.plataforma_admins enable row level security;
alter table public.painel_atas enable row level security;
alter table public.painel_registros enable row level security;
alter table public.painel_membros enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists "plataforma usa orgaos" on public.orgaos;
create policy "plataforma usa orgaos" on public.orgaos for all to authenticated
  using (public.eh_plataforma()) with check (public.eh_plataforma());

drop policy if exists "plataforma le admins" on public.plataforma_admins;
create policy "plataforma le admins" on public.plataforma_admins for select to authenticated
  using (public.eh_plataforma());

drop policy if exists "equipe usa painel_atas" on public.painel_atas;
create policy "equipe usa painel_atas" on public.painel_atas for all to authenticated
  using (public.eh_equipe(orgao_id)) with check (public.eh_equipe(orgao_id));
drop policy if exists "fornecedor le painel_atas" on public.painel_atas;
create policy "fornecedor le painel_atas" on public.painel_atas for select to authenticated
  using (public.painel_fornecedor_da_ata(id));

drop policy if exists "equipe usa painel_registros" on public.painel_registros;
create policy "equipe usa painel_registros" on public.painel_registros for all to authenticated
  using (public.eh_equipe_da_ata(ata_id)) with check (public.eh_equipe_da_ata(ata_id));
drop policy if exists "fornecedor le painel_registros" on public.painel_registros;
create policy "fornecedor le painel_registros" on public.painel_registros for select to authenticated
  using (public.painel_fornecedor_da_ata(ata_id) and (colecao <> 'eventos' or public.painel_evento_visivel(dados)));

-- Equipe cadastra colegas e fornecedores do próprio órgão; a plataforma cadastra o primeiro membro.
drop policy if exists "equipe usa painel_membros" on public.painel_membros;
create policy "equipe usa painel_membros" on public.painel_membros for all to authenticated
  using (public.eh_equipe(orgao_id) or public.eh_plataforma())
  with check (
    (public.eh_equipe(orgao_id) or public.eh_plataforma())
    and ((papel = 'equipe' and ata_id = 'todas') or (papel = 'fornecedor' and public.orgao_da_ata(ata_id) = orgao_id))
  );

drop policy if exists "equipe le auditoria" on public.auditoria;
create policy "equipe le auditoria" on public.auditoria for select to authenticated
  using (public.eh_equipe(orgao_id));

-- 10. Arquivos (PDF da ata e anexos dos eventos), limite de 32 MB
--     Caminhos: <id da ata>/ata/...  e  <id da ata>/eventos/<id do evento>/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('painel-anexos', 'painel-anexos', false, 33554432)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "equipe usa painel-anexos" on storage.objects;
create policy "equipe usa painel-anexos" on storage.objects for all to authenticated
  using (bucket_id = 'painel-anexos' and public.eh_equipe_da_ata((storage.foldername(name))[1]))
  with check (bucket_id = 'painel-anexos' and public.eh_equipe_da_ata((storage.foldername(name))[1]));

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

-- 11. Ações
-- 11a. Equipe atualiza a identidade do próprio órgão (nome, logo, cor, dados do contratante)
create or replace function public.orgao_atualizar(p_orgao text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orgaos;
begin
  if not (public.eh_equipe(p_orgao) or public.eh_plataforma()) then
    raise exception 'Somente a equipe do órgão pode alterar estes dados.';
  end if;
  update public.orgaos set
    nome = coalesce(nullif(trim(p_dados ->> 'nome'), ''), nome),
    sigla = coalesce(trim(p_dados ->> 'sigla'), sigla),
    cnpj = coalesce(trim(p_dados ->> 'cnpj'), cnpj),
    endereco = coalesce(trim(p_dados ->> 'endereco'), endereco),
    cidade = coalesce(trim(p_dados ->> 'cidade'), cidade),
    uasg = coalesce(trim(p_dados ->> 'uasg'), uasg),
    cor = coalesce(p_dados ->> 'cor', cor),
    logo = case when p_dados ? 'logo' then p_dados ->> 'logo' else logo end
  where id = p_orgao
  returning * into o;
  insert into public.auditoria (orgao_id, tabela, registro_id, acao, por, depois)
  values (p_orgao, 'orgaos', p_orgao, 'update', auth.jwt() ->> 'email', to_jsonb(o) - 'logo');
  return to_jsonb(o);
end;
$$;
revoke all on function public.orgao_atualizar(text, jsonb) from public;
grant execute on function public.orgao_atualizar(text, jsonb) to authenticated;

-- 11b. Fornecedor: confirmar orçamento, pedir ajuste, mensagem e nota fiscal
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

-- 11c. Plataforma: cria um órgão cliente e o primeiro membro da equipe dele
create or replace function public.plataforma_criar_orgao(p_id text, p_nome text, p_sigla text, p_email text, p_cnpj text default '', p_cor text default '#2563eb')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orgaos;
begin
  if not public.eh_plataforma() then
    raise exception 'Somente o administrador da plataforma pode cadastrar órgãos.';
  end if;
  if coalesce(trim(p_email), '') not like '%@%' then
    raise exception 'Informe o e-mail do responsável do órgão.';
  end if;
  insert into public.orgaos (id, nome, sigla, cnpj, cor)
  values (lower(trim(p_id)), trim(p_nome), trim(coalesce(p_sigla, '')), trim(coalesce(p_cnpj, '')), coalesce(nullif(p_cor, ''), '#2563eb'))
  returning * into o;
  insert into public.painel_membros (email, orgao_id, papel, ata_id, adicionado_por)
  values (lower(trim(p_email)), o.id, 'equipe', 'todas', auth.jwt() ->> 'email');
  return to_jsonb(o);
end;
$$;
revoke all on function public.plataforma_criar_orgao(text, text, text, text, text, text) from public;
grant execute on function public.plataforma_criar_orgao(text, text, text, text, text, text) to authenticated;

-- 11d. Plataforma: resumo de cada órgão (sem abrir os dados das atas)
create or replace function public.plataforma_resumo()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.eh_plataforma() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'nome', o.nome, 'sigla', o.sigla, 'cnpj', o.cnpj, 'cor', o.cor, 'ativo', o.ativo,
      'observacoes', o.observacoes, 'criado_em', o.criado_em,
      'atas', (select count(*) from public.painel_atas a where a.orgao_id = o.id),
      'equipe', (select count(*) from public.painel_membros m where m.orgao_id = o.id and m.papel = 'equipe'),
      'fornecedores', (select count(distinct m.email) from public.painel_membros m where m.orgao_id = o.id and m.papel = 'fornecedor'),
      'responsaveis', coalesce((select jsonb_agg(m.email order by m.adicionado_em) from public.painel_membros m where m.orgao_id = o.id and m.papel = 'equipe'), '[]'::jsonb),
      'ultimo_uso', (select max(em) from public.auditoria x where x.orgao_id = o.id)
    ) order by o.nome) from public.orgaos o
  ), '[]'::jsonb) end;
$$;
grant execute on function public.plataforma_resumo() to authenticated;

-- 12. Atualização em tempo real entre os computadores
alter table public.painel_registros replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.painel_registros;
exception when duplicate_object then null;
end $$;

-- 13. Administrador da plataforma: TROQUE pelo seu e-mail
insert into public.plataforma_admins (email)
values (lower('seu.email@exemplo.com'))
on conflict (email) do nothing;
