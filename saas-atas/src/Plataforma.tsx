/* ============================================================================
 * Telas do SaaS: administração da plataforma (órgãos clientes), dados do
 * órgão (identidade usada nas telas e documentos) e histórico de alterações.
 * ========================================================================== */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Building2, History, Loader2, Plus, ShieldCheck, Upload } from 'lucide-react';
import { Botao, Card, CardHeader, Campo, fmtDataHora, inputCls } from './GestorAtas';
import { COR_PADRAO, definirMarca, marca } from './marca';
import type { Orgao } from './marca';

const LIMITE_LOGO = 400_000;

/** Reduz a imagem do logo para no máximo 320 px e devolve em data URL (PNG) */
export async function lerLogo(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha uma imagem (PNG, JPG ou SVG).');
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não foi possível ler a imagem.'));
      i.src = url;
    });
    const escala = Math.min(1, 320 / Math.max(img.naturalWidth || 320, img.naturalHeight || 320));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 320) * escala));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 320) * escala));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dados = canvas.toDataURL('image/png');
    if (dados.length > LIMITE_LOGO) throw new Error('A imagem ficou grande demais. Use um logo mais simples.');
    return dados;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// ---------------------------------------------------------------- Dados do órgão

export function DadosOrgao({ cliente, orgao, aoSalvar }: { cliente: SupabaseClient; orgao: Orgao; aoSalvar?: (o: Orgao) => void }) {
  const [f, setF] = useState<Orgao>({ ...orgao });
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof Orgao, rotulo: string, extra = '') => (
    <Campo rotulo={rotulo} className={extra}>
      <input className={inputCls} value={String(f[k] ?? '')} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Campo>
  );
  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    const { data, error } = await cliente.rpc('orgao_atualizar', {
      p_orgao: orgao.id,
      p_dados: { nome: f.nome, sigla: f.sigla, cnpj: f.cnpj, endereco: f.endereco, cidade: f.cidade, uasg: f.uasg, cor: f.cor, logo: f.logo },
    });
    setSalvando(false);
    if (error) {
      setMsg({ tipo: 'erro', texto: `Não foi possível salvar. ${error.message}` });
      return;
    }
    const novo = { ...orgao, ...(data as Orgao) };
    // O próprio objeto do acesso é atualizado para que as telas usem os novos dados
    Object.assign(orgao, novo);
    if (marca.id === orgao.id) definirMarca(orgao);
    aoSalvar?.(novo);
    setMsg({ tipo: 'ok', texto: 'Dados salvos. Atas novas já usam estes dados; nas atas existentes, confira a Configuração da Ata.' });
  };
  return (
    <Card>
      <CardHeader titulo="Dados do órgão" subtitulo="Aparecem no topo das telas, nos documentos (ordem de serviço, relatórios) e no portal do fornecedor." icone={<Building2 className="h-4 w-4" />} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {campo('nome', 'Nome completo', 'sm:col-span-2')}
        {campo('sigla', 'Sigla (aparece nos textos, ex.: "Protocolo CRM-SP")')}
        {campo('cnpj', 'CNPJ')}
        {campo('endereco', 'Endereço', 'sm:col-span-2')}
        {campo('cidade', 'Cidade (usada na data dos documentos)')}
        {campo('uasg', 'UASG / código no Compras.gov.br')}
        <Campo rotulo="Cor principal">
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-14 cursor-pointer rounded border border-slate-300" value={f.cor || COR_PADRAO} onChange={(e) => setF({ ...f, cor: e.target.value })} />
            <span className="text-xs text-slate-500">{f.cor}</span>
          </div>
        </Campo>
        <Campo rotulo="Logo">
          <div className="flex items-center gap-3">
            {f.logo ? <img src={f.logo} alt="Logo atual" className="h-12 w-auto max-w-[160px] rounded border border-slate-200 bg-white object-contain p-1" /> : <span className="text-xs text-slate-500">Sem logo</span>}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Enviar imagem
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const arq = e.target.files?.[0];
                  e.target.value = '';
                  if (arq)
                    lerLogo(arq)
                      .then((logo) => setF((x) => ({ ...x, logo })))
                      .catch((err: Error) => setMsg({ tipo: 'erro', texto: err.message }));
                }}
              />
            </label>
            {f.logo && (
              <button className="text-xs text-slate-500 hover:text-rose-600" onClick={() => setF({ ...f, logo: null })}>
                Remover
              </button>
            )}
          </div>
        </Campo>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
        {msg && <p className={`mr-auto text-sm ${msg.tipo === 'erro' ? 'text-rose-700' : 'text-marca-800'}`}>{msg.texto}</p>}
        <Botao variante="primario" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Histórico

interface LinhaAuditoria {
  id: number;
  ata_id: string | null;
  tabela: string;
  colecao: string | null;
  registro_id: string | null;
  acao: 'insert' | 'update' | 'delete';
  por: string | null;
  em: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

const VERBO = { insert: 'criou', update: 'alterou', delete: 'excluiu' } as const;

function descrever(l: LinhaAuditoria): string {
  const d = (l.depois ?? l.antes ?? {}) as Record<string, unknown>;
  const nome = (k: string) => (typeof d[k] === 'string' && d[k] ? ` “${d[k] as string}”` : '');
  const verbo = VERBO[l.acao] ?? l.acao;
  if (l.tabela === 'painel_atas') return `${verbo} a ata${nome('servico')}`;
  if (l.tabela === 'orgaos') return 'alterou os dados do órgão';
  if (l.tabela === 'painel_membros') {
    const papel = d.papel === 'fornecedor' ? 'fornecedor' : 'membro da equipe';
    return l.acao === 'delete' ? `removeu o acesso de ${l.registro_id} (${papel})` : `deu acesso a ${l.registro_id} (${papel})`;
  }
  if (l.colecao === 'eventos') {
    const etapaAntes = (l.antes?.etapa as string) ?? '';
    const etapaDepois = (l.depois?.etapa as string) ?? '';
    if (l.acao === 'update' && etapaAntes !== etapaDepois) return `mudou o evento${nome('nome')} de etapa (${etapaAntes || '—'} → ${etapaDepois})`;
    return `${verbo} o evento${nome('nome')}`;
  }
  if (l.colecao === 'itens') return `${verbo} o item ${(d.codigo as string) ?? ''}${nome('descricao')}`.replace(/\s+/g, ' ');
  if (l.colecao === 'modulos') return `${verbo} o grupo${nome('nome')}`;
  if (l.colecao === 'ata') return 'alterou os dados da ata';
  return `${verbo} ${l.tabela}`;
}

export function Historico({ cliente, orgao, atas }: { cliente: SupabaseClient; orgao: Orgao; atas: { id: string; nome: string }[] }) {
  const [linhas, setLinhas] = useState<LinhaAuditoria[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtroAta, setFiltroAta] = useState('');
  const [limite, setLimite] = useState(200);
  useEffect(() => {
    let q = cliente.from('auditoria').select('id, ata_id, tabela, colecao, registro_id, acao, por, em, antes, depois').eq('orgao_id', orgao.id);
    if (filtroAta) q = q.eq('ata_id', filtroAta);
    void q
      .order('em', { ascending: false })
      .limit(limite)
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        else setLinhas((data ?? []) as LinhaAuditoria[]);
      });
  }, [cliente, orgao.id, filtroAta, limite]);
  const nomeAta = new Map(atas.map((a) => [a.id, a.nome]));
  return (
    <Card>
      <CardHeader
        titulo="Histórico de alterações"
        subtitulo="Tudo o que foi criado, alterado ou excluído, com data e autor. Este registro não pode ser editado."
        icone={<History className="h-4 w-4" />}
        acoes={
          <select className={`${inputCls} w-56`} value={filtroAta} onChange={(e) => setFiltroAta(e.target.value)}>
            <option value="">Todas as atas</option>
            {atas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        }
      />
      {erro && <p className="p-5 text-sm text-rose-700">Não foi possível carregar o histórico. {erro}</p>}
      {!linhas && !erro && (
        <p className="flex items-center gap-2 p-5 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {linhas && linhas.length === 0 && <p className="p-5 text-sm text-slate-500">Nenhuma alteração registrada ainda.</p>}
      {linhas && linhas.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm">
              <span className="min-w-0 text-slate-800">
                <strong className="font-medium">{l.por ?? 'sistema'}</strong> {descrever(l)}
                {l.ata_id && l.tabela !== 'painel_atas' && <span className="text-slate-500"> · {nomeAta.get(l.ata_id) ?? 'ata excluída'}</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtDataHora(l.em)}</span>
            </li>
          ))}
        </ul>
      )}
      {linhas && linhas.length >= limite && (
        <div className="border-t border-slate-100 px-5 py-3 text-center">
          <Botao tamanho="sm" onClick={() => setLimite(limite + 200)}>
            Ver mais
          </Botao>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Plataforma

interface ResumoOrgao {
  id: string;
  nome: string;
  sigla: string;
  cnpj: string;
  cor: string;
  ativo: boolean;
  observacoes: string;
  criado_em: string;
  atas: number;
  equipe: number;
  fornecedores: number;
  responsaveis: string[];
  ultimo_uso: string | null;
}

export function Plataforma({ cliente, meuEmail, aoMudar }: { cliente: SupabaseClient; meuEmail: string; aoMudar: () => void }) {
  const [lista, setLista] = useState<ResumoOrgao[] | null>(null);
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState({ nome: '', sigla: '', id: '', cnpj: '', email: '', cor: COR_PADRAO });
  const [idManual, setIdManual] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await cliente.rpc('plataforma_resumo');
    if (error) setErro(error.message);
    else setLista((data ?? []) as ResumoOrgao[]);
  }, [cliente]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criar = async () => {
    const id = novo.id || slug(novo.sigla || novo.nome);
    if (!novo.nome.trim() || !id || !novo.email.includes('@')) {
      setMsg({ tipo: 'erro', texto: 'Informe o nome do órgão e o e-mail do responsável.' });
      return;
    }
    setSalvando(true);
    const { error } = await cliente.rpc('plataforma_criar_orgao', { p_id: id, p_nome: novo.nome, p_sigla: novo.sigla, p_email: novo.email.trim().toLowerCase(), p_cnpj: novo.cnpj, p_cor: novo.cor });
    setSalvando(false);
    if (error) {
      setMsg({ tipo: 'erro', texto: error.code === '23505' ? `Já existe um órgão com o código “${id}”.` : `Não foi possível cadastrar. ${error.message}` });
      return;
    }
    setMsg({ tipo: 'ok', texto: `${novo.nome} cadastrado. Envie o link do sistema para ${novo.email}: no primeiro acesso a pessoa cria a senha e já entra no órgão.` });
    setNovo({ nome: '', sigla: '', id: '', cnpj: '', email: '', cor: COR_PADRAO });
    setIdManual(false);
    void carregar();
    aoMudar();
  };

  const alternar = async (o: ResumoOrgao) => {
    const acao = o.ativo ? 'Bloquear' : 'Reativar';
    if (o.ativo && !window.confirm(`Bloquear o acesso de ${o.nome}? Ninguém do órgão nem os fornecedores conseguirão entrar até você reativar. Os dados são mantidos.`)) return;
    const { error } = await cliente.from('orgaos').update({ ativo: !o.ativo }).eq('id', o.id);
    if (error) window.alert(`${acao}: ${error.message}`);
    void carregar();
    aoMudar();
  };

  const entrarComo = async (o: ResumoOrgao) => {
    const { error } = await cliente.from('painel_membros').insert({ email: meuEmail.toLowerCase(), orgao_id: o.id, papel: 'equipe', ata_id: 'todas', adicionado_por: meuEmail });
    if (error && error.code !== '23505') window.alert(`Não foi possível entrar na equipe. ${error.message}`);
    else window.alert(`Você agora faz parte da equipe de ${o.nome} (fica registrado no histórico do órgão). Use "Trocar órgão" para entrar.`);
    void carregar();
    aoMudar();
  };

  const ativos = lista?.filter((o) => o.ativo).length ?? 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="h-5 w-5 text-slate-500" /> Administração da plataforma
        </h1>
        <p className="text-sm text-slate-500">{lista ? `${lista.length} órgãos cadastrados · ${ativos} ativos` : 'Carregando…'}. Você vê só o resumo de cada órgão, não os dados das atas.</p>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Não foi possível carregar. {erro}</p>}

      <Card>
        <CardHeader titulo="Novo órgão cliente" subtitulo="Cria o órgão e libera o primeiro acesso da equipe dele. Depois, a própria equipe cadastra colegas, fornecedores, logo e dados." icone={<Plus className="h-4 w-4" />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Nome do órgão" className="lg:col-span-2">
            <input className={inputCls} value={novo.nome} placeholder="Conselho Regional de …" onChange={(e) => setNovo({ ...novo, nome: e.target.value, id: idManual ? novo.id : slug(novo.sigla || e.target.value) })} />
          </Campo>
          <Campo rotulo="Sigla">
            <input className={inputCls} value={novo.sigla} placeholder="CRX-SP" onChange={(e) => setNovo({ ...novo, sigla: e.target.value, id: idManual ? novo.id : slug(e.target.value || novo.nome) })} />
          </Campo>
          <Campo rotulo="Código interno (letras minúsculas e hífen)">
            <input
              className={inputCls}
              value={novo.id}
              onChange={(e) => {
                setIdManual(true);
                setNovo({ ...novo, id: slug(e.target.value) });
              }}
            />
          </Campo>
          <Campo rotulo="CNPJ">
            <input className={inputCls} value={novo.cnpj} onChange={(e) => setNovo({ ...novo, cnpj: e.target.value })} />
          </Campo>
          <Campo rotulo="Cor principal">
            <input type="color" className="h-9 w-14 cursor-pointer rounded border border-slate-300" value={novo.cor} onChange={(e) => setNovo({ ...novo, cor: e.target.value })} />
          </Campo>
          <Campo rotulo="E-mail do responsável no órgão" className="sm:col-span-2">
            <input type="email" className={inputCls} value={novo.email} placeholder="nome@orgao.gov.br" onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-3">
          {msg && <p className={`mr-auto text-sm ${msg.tipo === 'erro' ? 'text-rose-700' : 'text-marca-800'}`}>{msg.texto}</p>}
          <Botao variante="primario" disabled={salvando} onClick={() => void criar()}>
            {salvando ? 'Cadastrando…' : 'Cadastrar órgão'}
          </Botao>
        </div>
      </Card>

      <Card>
        <CardHeader titulo="Órgãos clientes" icone={<Building2 className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Órgão</th>
                <th className="px-3 py-2.5 text-right">Atas</th>
                <th className="px-3 py-2.5 text-right">Equipe</th>
                <th className="px-3 py-2.5 text-right">Fornecedores</th>
                <th className="px-3 py-2.5">Último uso</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(lista ?? []).map((o) => (
                <tr key={o.id} className={o.ativo ? '' : 'text-slate-400'}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: o.cor }} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{o.nome}</p>
                        <p className="truncate text-xs text-slate-500">
                          {o.sigla || o.id}
                          {o.responsaveis[0] ? ` · ${o.responsaveis[0]}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.atas}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.equipe}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.fornecedores}</td>
                  <td className="px-3 py-2.5 text-xs">{o.ultimo_uso ? fmtDataHora(o.ultimo_uso) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.ativo ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>{o.ativo ? 'Ativo' : 'Bloqueado'}</span>
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-2.5 text-right">
                    {o.ativo && !o.responsaveis.includes(meuEmail.toLowerCase()) && (
                      <Botao tamanho="sm" onClick={() => void entrarComo(o)}>
                        Entrar na equipe
                      </Botao>
                    )}
                    <Botao tamanho="sm" variante={o.ativo ? 'perigo' : 'sucesso'} onClick={() => void alternar(o)}>
                      {o.ativo ? 'Bloquear' : 'Reativar'}
                    </Botao>
                  </td>
                </tr>
              ))}
              {lista && lista.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    Nenhum órgão cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
