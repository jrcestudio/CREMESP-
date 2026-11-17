-- Painel de Atas (SaaS) – Portal do fornecedor com assinatura eletrônica
-- Rode DEPOIS do saas-configurar.sql, no mesmo projeto do Supabase:
-- Supabase › SQL Editor › New query › cole este arquivo › Run.
-- Pode rodar de novo sem problema (não apaga dados).
--
-- O que faz:
--   * Cria a função do portal do fornecedor (confirmar orçamento, pedir ajuste, mensagem, nota fiscal).
--   * Ao CONFIRMAR o orçamento, o fornecedor assina eletronicamente (assinatura eletrônica simples,
--     Lei 14.063/2020, art. 4º, I): informa nome e CPF, envia a imagem da assinatura (PNG), marca a
--     declaração "li e concordo" e confirma com a própria senha. A imagem vai para o campo do
--     fornecedor na Ordem de Orçamento. O banco grava data e hora, IP, navegador, e-mail e usuário logado, a cópia
--     exata do orçamento assinado (itens, quantidades, diárias, valores e arquivos anexados) e o
--     hash SHA-256 desse conteúdo. O registro não pode ser alterado nem apagado.
--   * Pedir ajuste, mensagens e nota fiscal continuam como antes, sem assinatura.
--   * A coluna "metodo" e as colunas provedor_* deixam pronto para, no futuro, usar ZapSign ou
--     Clicksign (assinatura avançada) sem mudar a tabela.

-- 1. Assinaturas (uma linha por orçamento confirmado)
--    Sem chave estrangeira de propósito: o comprovante continua existindo mesmo que a ata seja apagada.
create table if not exists public.painel_assinaturas (
  id uuid primary key default gen_random_uuid(),
  orgao_id text not null,
  ata_id text not null,
  evento_id text not null,
  historico_id text,
  acao text not null default 'confirmar_orcamento',
  metodo text not null default 'eletronica_simples'
    check (metodo in ('eletronica_simples', 'zapsign', 'clicksign')),
  nome text not null,
  cpf text not null,
  cargo text,
  email text not null,
  usuario_id uuid,
  autenticado_em timestamptz,
  assinado_em timestamptz not null default now(),
  ip text,
  navegador text,
  declaracao text not null,
  conteudo jsonb not null,
  hash text not null,
  -- Reservado para assinatura por provedor externo (ZapSign, Clicksign…)
  provedor_ref text,
  provedor_status text,
  provedor_dados jsonb
);
-- Imagem da assinatura (PNG em data URL), mostrada no campo do fornecedor na Ordem de Orçamento
alter table public.painel_assinaturas add column if not exists imagem text;

create index if not exists painel_assinaturas_evento on public.painel_assinaturas (ata_id, evento_id, assinado_em desc);

-- Ninguém apaga nem altera a assinatura; só as colunas do provedor externo podem ser atualizadas
create or replace function public.painel_assinaturas_proteger()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Assinaturas não podem ser apagadas.';
  end if;
  if (to_jsonb(new) - array['provedor_ref', 'provedor_status', 'provedor_dados'])
     is distinct from (to_jsonb(old) - array['provedor_ref', 'provedor_status', 'provedor_dados']) then
    raise exception 'Assinaturas não podem ser alteradas.';
  end if;
  return new;
end;
$$;
drop trigger if exists painel_assinaturas_proteger on public.painel_assinaturas;
create trigger painel_assinaturas_proteger before update or delete on public.painel_assinaturas
  for each row execute function public.painel_assinaturas_proteger();

-- Quem lê: a equipe do órgão e o próprio fornecedor que assinou. Ninguém grava direto (só pela função).
alter table public.painel_assinaturas enable row level security;
drop policy if exists "equipe e fornecedor leem assinaturas" on public.painel_assinaturas;
create policy "equipe e fornecedor leem assinaturas" on public.painel_assinaturas for select to authenticated
  using (
    public.eh_da_equipe(orgao_id)
    or (public.painel_fornecedor_da_ata(ata_id) and lower(email) = public.meu_email())
  );

-- 2. Auxiliares
create or replace function public.cpf_valido(p_cpf text)
returns boolean language plpgsql immutable as $$
declare
  c text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  s int;
  d1 int;
  d2 int;
begin
  if length(c) <> 11 or c ~ '^(\d)\1{10}$' then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop s := s + substr(c, i, 1)::int * (11 - i); end loop;
  d1 := (s * 10) % 11;
  if d1 = 10 then d1 := 0; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(c, i, 1)::int * (12 - i); end loop;
  d2 := (s * 10) % 11;
  if d2 = 10 then d2 := 0; end if;
  return d1 = substr(c, 10, 1)::int and d2 = substr(c, 11, 1)::int;
end;
$$;

create or replace function public.cpf_mascarado(p_cpf text)
returns text language sql immutable as $$
  select '***.' || substr(c, 4, 3) || '.' || substr(c, 7, 3) || '-**'
  from (select regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') as c) x;
$$;

-- Cabeçalho da requisição (IP e navegador), quando a chamada vem pela API do Supabase
create or replace function public.cabecalho_requisicao(p_nome text)
returns text language plpgsql stable as $$
begin
  return nullif(current_setting('request.headers', true), '')::json ->> p_nome;
exception when others then
  return null;
end;
$$;

-- Hash SHA-256 (hexadecimal) de um conteúdo jsonb; o texto do jsonb é sempre o mesmo para o mesmo conteúdo
create or replace function public.hash_conteudo(p jsonb)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p::text, 'UTF8')), 'hex');
$$;

-- O orçamento como está agora: dados da ata, do evento e cada item com quantidade, diárias e valores
create or replace function public.painel_conteudo_orcamento(p_ata text, p_evento text)
returns jsonb language sql stable security definer set search_path = public as $$
  with ata as (
    select dados from public.painel_registros where ata_id = p_ata and colecao = 'ata' order by id limit 1
  ),
  ev as (
    select dados from public.painel_registros where ata_id = p_ata and colecao = 'eventos' and id = p_evento
  ),
  linhas as (
    select
      coalesce(i.dados ->> 'codigo', l.key) as codigo,
      coalesce(i.dados ->> 'descricao', '') as descricao,
      coalesce(i.dados ->> 'unidade', '') as unidade,
      greatest(0, coalesce((l.value ->> 'qtd')::numeric, 0)) as qtd,
      greatest(0, coalesce((l.value ->> 'diarias')::numeric, 0)) as diarias,
      coalesce((i.dados ->> 'valorUnitario')::numeric, 0) as unitario
    from ev, jsonb_each(coalesce(ev.dados -> 'linhas', '{}'::jsonb)) l
    left join public.painel_registros i on i.ata_id = p_ata and i.colecao = 'itens' and i.id = l.key
  ),
  validas as (
    select *, round(qtd * diarias * unitario, 2) as subtotal from linhas where qtd * diarias > 0
  )
  select jsonb_build_object(
    'ata', jsonb_build_object(
      'id', p_ata,
      'numero', coalesce((select dados ->> 'numero' from ata), ''),
      'fornecedor', coalesce((select dados ->> 'fornecedor' from ata), ''),
      'cnpj', coalesce((select dados ->> 'cnpj' from ata), '')
    ),
    'evento', jsonb_build_object(
      'id', p_evento,
      'os', coalesce(ev.dados ->> 'numero', ''),
      'nome', coalesce(ev.dados ->> 'nome', ''),
      'dataInicio', coalesce(ev.dados ->> 'dataInicio', ''),
      'dataFim', coalesce(ev.dados ->> 'dataFim', ''),
      'local', coalesce(ev.dados ->> 'local', '')
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', codigo, 'descricao', descricao, 'unidade', unidade,
        'qtd', qtd, 'diarias', diarias, 'valorUnitario', unitario, 'subtotal', subtotal
      ) order by (case when codigo ~ '^\d+$' then codigo::numeric end) nulls last, codigo)
      from validas
    ), '[]'::jsonb),
    'total', coalesce((select sum(subtotal) from validas), 0)
  )
  from ev;
$$;

-- 3. Fornecedor: confirmar orçamento (com assinatura), pedir ajuste, mensagem e nota fiscal
--    A versão antiga (sem assinatura) é substituída.
drop function if exists public.painel_fornecedor_acao(text, text, text, text, jsonb);

create or replace function public.painel_fornecedor_acao(
  p_ata text,
  p_evento text,
  p_acao text,
  p_mensagem text default '',
  p_anexos jsonb default '[]'::jsonb,
  p_assinatura jsonb default null
)
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
  entrada_id text := 'forn-' || gen_random_uuid()::text;
  -- assinatura
  ass_id uuid;
  ass_nome text;
  ass_cpf text;
  ass_cargo text;
  ass_decl text;
  ass_img text;
  ass_conteudo jsonb;
  ass_hash text;
  ass_ip text;
  ass_auth timestamptz;
  ass_em timestamptz := now();
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
      anexos := anexos || jsonb_build_array(
        jsonb_build_object(
          'nome', left(coalesce(a ->> 'nome', 'arquivo'), 200),
          'caminho', a ->> 'caminho',
          'tamanho', coalesce((a ->> 'tamanho')::bigint, 0),
          'tipo', left(coalesce(a ->> 'tipo', ''), 100)
        )
        || case when coalesce(a ->> 'sha256', '') ~ '^[0-9a-f]{64}$' then jsonb_build_object('sha256', a ->> 'sha256') else '{}'::jsonb end
      );
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

  -- Assinatura eletrônica ao confirmar o orçamento
  if p_acao = 'confirmar' then
    if p_assinatura is null or jsonb_typeof(p_assinatura) <> 'object' then
      raise exception 'Assine o orçamento para confirmar (nome, CPF e senha).';
    end if;
    ass_nome := left(trim(regexp_replace(coalesce(p_assinatura ->> 'nome', ''), '\s+', ' ', 'g')), 200);
    ass_cpf := regexp_replace(coalesce(p_assinatura ->> 'cpf', ''), '\D', '', 'g');
    ass_cargo := nullif(left(trim(coalesce(p_assinatura ->> 'cargo', '')), 120), '');
    ass_decl := left(trim(coalesce(p_assinatura ->> 'declaracao', '')), 1000);
    if length(ass_nome) < 5 or position(' ' in ass_nome) = 0 then
      raise exception 'Informe o nome completo de quem assina.';
    end if;
    if not public.cpf_valido(ass_cpf) then
      raise exception 'CPF inválido.';
    end if;
    ass_img := coalesce(p_assinatura ->> 'imagem', '');
    if ass_img !~ '^data:image/png;base64,[A-Za-z0-9+/]+=*$' then
      raise exception 'Envie a imagem da sua assinatura em PNG.';
    end if;
    if length(ass_img) > 700000 then
      raise exception 'A imagem da assinatura é grande demais (máximo 500 KB).';
    end if;
    if coalesce((p_assinatura ->> 'concordo')::boolean, false) is not true or ass_decl = '' then
      raise exception 'Marque a declaração "Li e concordo" para assinar.';
    end if;

    -- A senha precisa ter sido confirmada há pouco (login com senha nos últimos 15 minutos)
    select to_timestamp(max((m ->> 'timestamp')::bigint)) into ass_auth
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) m;
    if ass_auth is not null and ass_auth < now() - interval '15 minutes' then
      raise exception 'Confirme sua senha para assinar.';
    end if;

    ass_conteudo := public.painel_conteudo_orcamento(p_ata, p_evento)
      || jsonb_build_object(
        'anexos', anexos,
        'observacoes', msg,
        'signatario', jsonb_build_object('nome', ass_nome, 'cpf', ass_cpf, 'cargo', ass_cargo, 'email', public.meu_email()),
        'imagemAssinaturaSha256', encode(sha256(decode(substr(ass_img, 23), 'base64')), 'hex'),
        'declaracao', ass_decl,
        'assinadoEm', to_jsonb(ass_em)
      );
    if jsonb_array_length(ass_conteudo -> 'itens') = 0 then
      raise exception 'Este orçamento não tem itens para assinar.';
    end if;
    ass_hash := public.hash_conteudo(ass_conteudo);
    ass_ip := coalesce(
      public.cabecalho_requisicao('cf-connecting-ip'),
      nullif(trim(split_part(coalesce(public.cabecalho_requisicao('x-forwarded-for'), ''), ',', 1)), ''),
      public.cabecalho_requisicao('x-real-ip')
    );

    insert into public.painel_assinaturas (
      orgao_id, ata_id, evento_id, historico_id, nome, cpf, cargo, email, usuario_id, autenticado_em,
      assinado_em, ip, navegador, declaracao, conteudo, hash, imagem
    ) values (
      public.orgao_da_ata(p_ata), p_ata, p_evento, entrada_id, ass_nome, ass_cpf, ass_cargo, public.meu_email(), auth.uid(), ass_auth,
      ass_em, ass_ip, left(public.cabecalho_requisicao('user-agent'), 400), ass_decl, ass_conteudo, ass_hash, ass_img
    )
    returning id into ass_id;
  end if;

  entrada := jsonb_build_object(
    'id', entrada_id,
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
  if ass_id is not null then
    entrada := entrada || jsonb_build_object('assinatura', jsonb_build_object(
      'id', ass_id, 'nome', ass_nome, 'cpf', public.cpf_mascarado(ass_cpf), 'hash', ass_hash, 'em', to_jsonb(ass_em)
    ));
  end if;

  d := d
    || jsonb_build_object('etapa', nova, 'atualizadoEm', to_jsonb(now()))
    || jsonb_build_object('historico', coalesce(d -> 'historico', '[]'::jsonb) || jsonb_build_array(entrada));

  update public.painel_registros set dados = d where ata_id = p_ata and colecao = 'eventos' and id = p_evento;
  return d;
end;
$$;
revoke all on function public.painel_fornecedor_acao(text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.painel_fornecedor_acao(text, text, text, text, jsonb, jsonb) to authenticated;

-- 4. Conferência do comprovante: o registro está íntegro? O orçamento mudou depois da assinatura?
create or replace function public.painel_assinatura_verificar(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.painel_assinaturas;
  atual jsonb;
begin
  select * into s from public.painel_assinaturas where id = p_id;
  if not found then
    raise exception 'Assinatura não encontrada.';
  end if;
  if not (public.eh_da_equipe(s.orgao_id) or (public.painel_fornecedor_da_ata(s.ata_id) and lower(s.email) = public.meu_email())) then
    raise exception 'Sem acesso a esta assinatura.';
  end if;
  atual := public.painel_conteudo_orcamento(s.ata_id, s.evento_id);
  return jsonb_build_object(
    'registroIntegro', public.hash_conteudo(s.conteudo) = s.hash,
    'orcamentoIgual', atual is not null
      and (atual -> 'itens') = (s.conteudo -> 'itens')
      and (atual -> 'total') = (s.conteudo -> 'total'),
    'verificadoEm', to_jsonb(now())
  );
end;
$$;
revoke all on function public.painel_assinatura_verificar(uuid) from public;
grant execute on function public.painel_assinatura_verificar(uuid) to authenticated;

grant execute on function public.cpf_valido(text), public.cpf_mascarado(text), public.hash_conteudo(jsonb) to authenticated;
revoke all on function public.painel_conteudo_orcamento(text, text) from public, anon, authenticated;
