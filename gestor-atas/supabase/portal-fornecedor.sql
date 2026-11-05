-- Gestor de Atas – Cremesp · Portal do Fornecedor
-- Rode UMA vez, depois do configurar.sql:
-- Supabase › SQL Editor › New query › cole este script inteiro › "Run".
-- Pode rodar de novo sem problema (não apaga dados).

-- 1. Tipo de acesso de cada e-mail: equipe do Cremesp ou fornecedor
alter table public.membros add column if not exists papel text not null default 'equipe';
alter table public.membros drop constraint if exists membros_papel_check;
alter table public.membros add constraint membros_papel_check check (papel in ('equipe', 'fornecedor'));

-- 2. "Membro" passa a significar equipe do Cremesp (quem edita tudo)
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
      and papel = 'equipe'
  );
$$;

create or replace function public.eh_fornecedor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and papel = 'fornecedor'
  );
$$;
grant execute on function public.eh_fornecedor() to authenticated;

create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.membros
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;
grant execute on function public.meu_papel() to authenticated;

-- 3. O fornecedor só LÊ: Ata, módulos, itens e os eventos já enviados a ele
--    (rascunhos internos ficam invisíveis). Não pode gravar direto na tabela.
drop policy if exists "fornecedor le registros" on public.registros;
create policy "fornecedor le registros" on public.registros for select to authenticated
  using (
    public.eh_fornecedor()
    and (
      colecao <> 'eventos'
      or coalesce(dados ->> 'etapa', case when dados ->> 'status' = 'aprovado' then 'aprovado' else 'rascunho' end) <> 'rascunho'
    )
  );

-- 4. Únicas ações do fornecedor: confirmar o orçamento, pedir ajuste ou mandar mensagem.
--    Tudo fica registrado no histórico do evento, com data e e-mail.
create or replace function public.fornecedor_acao(p_evento text, p_acao text, p_mensagem text default '')
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
  entrada jsonb;
begin
  if not public.eh_fornecedor() then
    raise exception 'Acesso permitido só a fornecedores cadastrados.';
  end if;

  select dados into d from public.registros
  where colecao = 'eventos' and id = p_evento
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
  elsif p_acao = 'mensagem' then
    if msg = '' then
      raise exception 'Escreva a mensagem.';
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

  d := d
    || jsonb_build_object('etapa', nova, 'atualizadoEm', to_jsonb(now()))
    || jsonb_build_object('historico', coalesce(d -> 'historico', '[]'::jsonb) || jsonb_build_array(entrada));

  update public.registros set dados = d where colecao = 'eventos' and id = p_evento;
  return d;
end;
$$;
revoke all on function public.fornecedor_acao(text, text, text) from public;
grant execute on function public.fornecedor_acao(text, text, text) to authenticated;
