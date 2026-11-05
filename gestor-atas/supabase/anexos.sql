-- Gestor de Atas – Cremesp · Anexos (arquivos em cada etapa e nota fiscal)
-- Rode UMA vez, depois do portal-fornecedor.sql:
-- Supabase › SQL Editor › New query › cole este script inteiro › "Run".
-- Pode rodar de novo sem problema (não apaga arquivos nem dados).

-- 1. Pasta privada para os arquivos (limite de 20 MB por arquivo)
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- 2. O fornecedor só mexe em arquivos de eventos que já foram enviados a ele
create or replace function public.evento_do_fornecedor(p_evento text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_fornecedor() and exists (
    select 1 from public.registros
    where colecao = 'eventos' and id = p_evento
      and coalesce(dados ->> 'etapa', case when dados ->> 'status' = 'aprovado' then 'aprovado' else 'rascunho' end) <> 'rascunho'
  );
$$;
grant execute on function public.evento_do_fornecedor(text) to authenticated;

-- 3. Regras de acesso aos arquivos
--    Equipe: lê, envia e apaga qualquer anexo.
--    Fornecedor: lê e envia anexos dos eventos dele (pasta eventos/<id do evento>/), sem apagar.
drop policy if exists "equipe usa anexos" on storage.objects;
create policy "equipe usa anexos" on storage.objects for all to authenticated
  using (bucket_id = 'anexos' and public.eh_membro())
  with check (bucket_id = 'anexos' and public.eh_membro());

drop policy if exists "fornecedor le anexos" on storage.objects;
create policy "fornecedor le anexos" on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = 'eventos'
    and public.evento_do_fornecedor((storage.foldername(name))[2])
  );

drop policy if exists "fornecedor envia anexos" on storage.objects;
create policy "fornecedor envia anexos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = 'eventos'
    and public.evento_do_fornecedor((storage.foldername(name))[2])
  );

-- 4. Ações do fornecedor, agora com anexos e envio da nota fiscal
drop function if exists public.fornecedor_acao(text, text, text);
create or replace function public.fornecedor_acao(p_evento text, p_acao text, p_mensagem text default '', p_anexos jsonb default '[]'::jsonb)
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
  if not public.eh_fornecedor() then
    raise exception 'Acesso permitido só a fornecedores cadastrados.';
  end if;

  -- Anexos: no máximo 10, todos dentro da pasta deste evento
  if p_anexos is not null and jsonb_typeof(p_anexos) = 'array' then
    if jsonb_array_length(p_anexos) > 10 then
      raise exception 'Envie no máximo 10 arquivos por vez.';
    end if;
    for a in select * from jsonb_array_elements(p_anexos) loop
      if coalesce(a ->> 'caminho', '') not like 'eventos/' || p_evento || '/%' then
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

  update public.registros set dados = d where colecao = 'eventos' and id = p_evento;
  return d;
end;
$$;
revoke all on function public.fornecedor_acao(text, text, text, jsonb) from public;
grant execute on function public.fornecedor_acao(text, text, text, jsonb) to authenticated;
