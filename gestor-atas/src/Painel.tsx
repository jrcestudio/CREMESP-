/* ============================================================================
 * Painel de Atas – Cremesp
 * Sistema separado do Gestor de Atas da REDXCORP: o setor anexa uma Ata de
 * Registro de Preços, a IA (função /api/ler-ata na Vercel) extrai os dados, a
 * equipe confere e cada ata vira um sistema completo (saldos, simulador, ordem,
 * eventos, relatórios e portal do fornecedor), com dados nas tabelas painel_*.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, ArrowRight, CalendarDays, FileText, Loader2, LogOut, Plus, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import iconeCremesp from './assets/icone-cremesp.png';
import {
  AppCompartilhado,
  Botao,
  Card,
  CardHeader,
  Campo,
  LISTA_CORES,
  PortalFornecedor,
  TelaCentral,
  TelaLogin,
  UNIDADES,
  abrirAnexoNoNavegador,
  assinatura,
  baseParaRegistros,
  brl,
  calcularUsoPorEvento,
  calcularUsoTotal,
  chaveRegistro,
  conexaoPainel,
  criarBaseVazia,
  enviarArquivo,
  fmtData,
  fmtNum,
  grupoEvento,
  hojeISO,
  inputCls,
  linhaBanco,
  registrosParaBase,
  supabase,
} from './GestorAtas';
import type { Anexo, AtaInfo, Base, ItemAta, Modulo, Registro, Unidade } from './GestorAtas';

const TITULO = 'Painel de Atas · Cremesp';
const LIMITE_ATA = 30 * 1024 * 1024;

interface LinhaAta {
  id: string;
  setor: string;
  servico: string;
  arquivo: Anexo | null;
  criado_em: string;
  criado_por: string | null;
}

interface Acesso {
  equipe: boolean;
  atas: string[];
}

/** O que a IA devolve (formato definido em api/ler-ata.ts) */
interface Extracao {
  ata: Partial<Record<keyof AtaInfo, string>>;
  modulos: string[];
  itens: { codigo: string; descricao: string; modulo: string; unidade: string; unidadeOriginal: string; qtdContratada: number; valorUnitario: number }[];
  avisos: string[];
}

interface Rascunho {
  ataId: string;
  setor: string;
  servico: string;
  arquivo: Anexo | null;
  base: Base;
  avisos: string[];
  lidoPorIA: boolean;
}

// ---------------------------------------------------------------- Dados

async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  let lista: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    lista = lista.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  return lista;
}

const dataValida = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0);
const textoLimpo = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Transforma o que a IA leu na estrutura do sistema (módulos com cor, itens com id) */
export function montarBase(ext: Extracao): Base {
  const vazia = criarBaseVazia();
  const ata: AtaInfo = { ...vazia.ata, coordenador: '', cargoCoordenador: '', responsavelTecnico: '' };
  for (const k of Object.keys(ata) as (keyof AtaInfo)[]) {
    const v = textoLimpo(ext.ata?.[k]);
    if (v) ata[k] = v;
  }
  ata.vigenciaInicio = dataValida(ext.ata?.vigenciaInicio);
  ata.vigenciaFim = dataValida(ext.ata?.vigenciaFim);

  const nomes: string[] = [];
  const addNome = (n: string) => {
    const t = n.trim() || 'Itens da Ata';
    if (!nomes.some((x) => x.toLowerCase() === t.toLowerCase())) nomes.push(t);
    return nomes.find((x) => x.toLowerCase() === t.toLowerCase())!;
  };
  (ext.modulos ?? []).forEach((n) => addNome(textoLimpo(n)));
  const itensBrutos = (ext.itens ?? []).map((i) => ({ ...i, modulo: addNome(textoLimpo(i.modulo)) }));
  const modulos: Modulo[] = nomes.map((nome, i) => ({ id: `m${i + 1}`, nome, cor: LISTA_CORES[i % LISTA_CORES.length] }));
  const idModulo = new Map(modulos.map((m) => [m.nome, m.id]));

  const usados = new Set<string>();
  const itens: ItemAta[] = itensBrutos.map((i, n) => {
    const codigo = textoLimpo(i.codigo) || String(n + 1);
    let id = `i${codigo.replace(/[^\w.-]/g, '')}`;
    while (usados.has(id)) id += '-b';
    usados.add(id);
    return {
      id,
      codigo,
      descricao: textoLimpo(i.descricao),
      moduloId: idModulo.get(i.modulo) ?? modulos[0]?.id ?? 'm1',
      unidade: (UNIDADES as string[]).includes(i.unidade) ? (i.unidade as Unidade) : 'Unidade',
      valorUnitario: numero(i.valorUnitario),
      qtdContratada: numero(i.qtdContratada),
    };
  });
  return { ...vazia, ata, modulos, itens };
}

function resumoAta(base: Base) {
  const total = base.itens.reduce((s, i) => s + i.valorUnitario * i.qtdContratada, 0);
  const uso = calcularUsoTotal(base.eventos, calcularUsoPorEvento(base.eventos));
  let utilizado = 0;
  let simulacao = 0;
  for (const i of base.itens) {
    const u = uso.get(i.id);
    if (u) {
      utilizado += u.consumido * i.valorUnitario;
      simulacao += u.simulacao * i.valorUnitario;
    }
  }
  const ativos = base.eventos.filter((e) => grupoEvento(e) === 'solicitado').length;
  const realizados = base.eventos.filter((e) => grupoEvento(e) === 'realizado').length;
  return { total, utilizado, simulacao, ativos, realizados };
}

// ---------------------------------------------------------------- Interface

function Topo({ email, sair, children }: { email: string; sair: () => void; children?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={iconeCremesp} alt="Cremesp" className="h-9 w-9" />
          <div>
            <p className="text-sm font-semibold leading-tight">Painel de Atas</p>
            <p className="text-xs text-slate-500">Cremesp · controle de Atas de Registro de Preços</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {children}
          <span className="hidden sm:inline">{email}</span>
          <Botao tamanho="sm" icone={<LogOut className="h-3.5 w-3.5" />} onClick={sair}>
            Sair
          </Botao>
        </div>
      </div>
    </header>
  );
}

function CartaoAta({ linha, base, abrir, verArquivo, excluir }: { linha: LinhaAta; base: Base | undefined; abrir: () => void; verArquivo?: () => void; excluir?: () => void }) {
  const ata = base?.ata;
  const r = base ? resumoAta(base) : null;
  const usado = r && r.total ? (r.utilizado / r.total) * 100 : 0;
  const vencida = ata?.vigenciaFim ? ata.vigenciaFim < hojeISO() : false;
  return (
    <Card className="flex flex-col">
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-cremesp-50 px-2 py-0.5 text-[11px] font-medium text-cremesp-800 ring-1 ring-inset ring-cremesp-200">{linha.setor || 'Setor não informado'}</span>
          {excluir && (
            <button onClick={excluir} className="rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600" aria-label={`Excluir ${linha.servico}`} title="Excluir ata do painel">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <h3 className="mt-2 text-base font-semibold text-slate-900">{linha.servico || ata?.objeto || 'Serviço não informado'}</h3>
        <p className="mt-0.5 text-sm text-slate-600">{ata?.numero || 'Ata sem número'}</p>
        <p className="line-clamp-1 text-sm text-slate-500">{ata?.fornecedor || 'Fornecedor não informado'}</p>
        {ata?.vigenciaFim && (
          <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${vencida ? 'text-rose-700' : 'text-slate-600'}`}>
            <CalendarDays className="h-3.5 w-3.5" />
            {vencida ? `Vigência encerrada em ${fmtData(ata.vigenciaFim)}` : `Vigente até ${fmtData(ata.vigenciaFim)}`}
          </p>
        )}
        {r && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Utilizado</span>
              <span className="font-medium text-slate-700">
                {brl(r.utilizado)} de {brl(r.total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-cremesp-600" style={{ width: `${Math.min(100, usado)}%` }} />
            </div>
            <p className="text-xs text-slate-500">
              {base!.itens.length} itens · {r.ativos} {r.ativos === 1 ? 'evento em andamento' : 'eventos em andamento'} · {r.realizados} realizados
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        {verArquivo ? (
          <button onClick={verArquivo} className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-cremesp-700">
            <FileText className="h-3.5 w-3.5" /> Ver ata original
          </button>
        ) : (
          <span />
        )}
        <Botao variante="primario" tamanho="sm" onClick={abrir}>
          Abrir <ArrowRight className="h-3.5 w-3.5" />
        </Botao>
      </div>
    </Card>
  );
}

function NovaAta({ cliente, aoLer, aoCadastrarManual }: { cliente: SupabaseClient; aoLer: (r: Rascunho) => void; aoCadastrarManual: (r: Rascunho) => void }) {
  const [setor, setSetor] = useState('');
  const [servico, setServico] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [etapa, setEtapa] = useState<'' | 'enviando' | 'lendo'>('');
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const falhou = useRef<{ ataId: string; anexo: Anexo | null } | null>(null);

  useEffect(() => {
    if (!etapa) return;
    setSegundos(0);
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [etapa]);

  const escolher = (f: File | undefined) => {
    setErro('');
    if (!f) return;
    if (f.size > LIMITE_ATA) {
      setErro('O arquivo passa de 30 MB. Envie um PDF menor (ex.: só as páginas da ata e da tabela de preços).');
      return;
    }
    if (!/pdf|image\//i.test(f.type) && !/\.pdf$/i.test(f.name)) {
      setErro('Envie a ata em PDF (ou uma foto JPG/PNG).');
      return;
    }
    setArquivo(f);
  };

  const novoRascunho = (ataId: string, anexo: Anexo | null, base: Base, avisos: string[], lidoPorIA: boolean): Rascunho => ({
    ataId,
    setor: setor.trim(),
    servico: servico.trim(),
    arquivo: anexo,
    base,
    avisos,
    lidoPorIA,
  });

  const ler = async () => {
    if (!arquivo || !setor.trim() || !servico.trim()) return;
    setErro('');
    const ataId = `ata-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let anexo: Anexo | null = null;
    try {
      setEtapa('enviando');
      anexo = await enviarArquivo(conexaoPainel(cliente, ataId), 'ata', arquivo);
      setEtapa('lendo');
      const { data } = await cliente.auth.getSession();
      const resp = await fetch('/api/ler-ata', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ caminho: anexo.caminho }),
      });
      const corpo = (await resp.json().catch(() => null)) as { dados?: Extracao; erro?: string } | null;
      if (!resp.ok || !corpo?.dados) {
        throw new Error(corpo?.erro ?? (resp.status === 404 ? 'A leitura com IA não está disponível neste endereço.' : `Falha na leitura (erro ${resp.status}).`));
      }
      const base = montarBase(corpo.dados);
      const avisos = (corpo.dados.avisos ?? []).map(textoLimpo).filter(Boolean);
      if (base.itens.length === 0) avisos.unshift('A IA não encontrou a tabela de itens. Confira o arquivo ou adicione os itens abaixo.');
      setEtapa('');
      aoLer(novoRascunho(ataId, anexo, base, avisos, true));
    } catch (err) {
      setEtapa('');
      falhou.current = { ataId, anexo };
      setErro(err instanceof Error ? err.message : String(err));
    }
  };

  const manual = () => {
    const f = falhou.current;
    const ataId = f?.ataId ?? `ata-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const b = criarBaseVazia();
    const base: Base = { ...b, ata: { ...b.ata, coordenador: '', cargoCoordenador: '', responsavelTecnico: '' }, modulos: [{ id: 'm1', nome: 'Itens da Ata', cor: LISTA_CORES[0] }] };
    aoCadastrarManual(novoRascunho(ataId, f?.anexo ?? null, base, [], false));
  };

  const ocupado = !!etapa;
  const pronto = !!arquivo && !!setor.trim() && !!servico.trim();
  return (
    <Card>
      <CardHeader
        titulo="Anexar nova ata"
        subtitulo="Informe o setor e o serviço, anexe o PDF da ata e a IA monta o sistema. Você confere tudo antes de criar."
        icone={<Sparkles className="h-4 w-4" />}
      />
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Campo rotulo="Nome do setor">
          <input id="nova-setor" className={inputCls} value={setor} disabled={ocupado} onChange={(e) => setSetor(e.target.value)} placeholder="Ex.: Departamento de Comunicação" />
        </Campo>
        <Campo rotulo="A ata se refere a qual serviço ou produto?">
          <input id="nova-servico" className={inputCls} value={servico} disabled={ocupado} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: Locação de equipamentos de audiovisual" />
        </Campo>
        <div className="md:col-span-2">
          <input
            ref={entrada}
            id="nova-arquivo"
            type="file"
            accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              escolher(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => entrada.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              escolher(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              arrastando ? 'border-cremesp-500 bg-cremesp-50' : 'border-slate-300 bg-slate-50 hover:border-cremesp-400 hover:bg-cremesp-50/50'
            } disabled:opacity-60`}
          >
            <Upload className="h-6 w-6 text-cremesp-700" />
            {arquivo ? (
              <span className="text-sm font-medium text-slate-800">
                {arquivo.name} <span className="font-normal text-slate-500">({fmtNum.format(arquivo.size / 1024 / 1024)} MB) · clique para trocar</span>
              </span>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-800">Clique para anexar a ata ou arraste o arquivo aqui</span>
                <span className="text-xs text-slate-500">PDF (até 30 MB). Também funciona com ata escaneada.</span>
              </>
            )}
          </button>
        </div>
        {erro && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 md:col-span-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{erro}</p>
              <button onClick={manual} className="mt-1 font-medium underline">
                Cadastrar os itens à mão
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Botao variante="primario" icone={ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} disabled={!pronto || ocupado} onClick={() => void ler()}>
            {etapa === 'enviando' ? 'Enviando o arquivo…' : etapa === 'lendo' ? `Lendo a ata… ${segundos}s` : 'Ler ata com IA'}
          </Botao>
          {etapa === 'lendo' && <span className="text-xs text-slate-500">A leitura costuma levar de 1 a 3 minutos. Não feche esta página.</span>}
          {!etapa && !pronto && <span className="text-xs text-slate-500">Preencha o setor, o serviço e anexe o arquivo.</span>}
        </div>
      </div>
    </Card>
  );
}

function Revisao({ rascunho, criar, cancelar }: { rascunho: Rascunho; criar: (r: Rascunho) => Promise<void>; cancelar: () => void }) {
  const [r, setR] = useState<Rascunho>(rascunho);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const { ata, itens, modulos } = r.base;
  const setAta = (k: keyof AtaInfo, v: string) => setR((x) => ({ ...x, base: { ...x.base, ata: { ...x.base.ata, [k]: v } } }));
  const setItem = (id: string, patch: Partial<ItemAta>) => setR((x) => ({ ...x, base: { ...x.base, itens: x.base.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) } }));
  const removerItem = (id: string) => setR((x) => ({ ...x, base: { ...x.base, itens: x.base.itens.filter((i) => i.id !== id) } }));
  const addItem = () =>
    setR((x) => {
      const usados = new Set(x.base.itens.map((i) => i.id));
      let n = x.base.itens.length + 1;
      while (usados.has(`i${n}`)) n++;
      const item: ItemAta = { id: `i${n}`, codigo: String(n), descricao: '', moduloId: x.base.modulos[0]?.id ?? 'm1', unidade: 'Unidade', valorUnitario: 0, qtdContratada: 0 };
      const mods = x.base.modulos.length ? x.base.modulos : [{ id: 'm1', nome: 'Itens da Ata', cor: LISTA_CORES[0] }];
      return { ...x, base: { ...x.base, modulos: mods, itens: [...x.base.itens, item] } };
    });
  const total = itens.reduce((s, i) => s + i.valorUnitario * i.qtdContratada, 0);
  const filtrados = busca.trim() ? itens.filter((i) => `${i.codigo} ${i.descricao}`.toLowerCase().includes(busca.trim().toLowerCase())) : itens;
  const semValor = itens.filter((i) => !i.valorUnitario || !i.qtdContratada).length;

  const campos: [keyof AtaInfo, string][] = [
    ['numero', 'Número da ata'],
    ['pregao', 'Pregão'],
    ['processo', 'Processo'],
    ['fornecedor', 'Fornecedor'],
    ['cnpj', 'CNPJ do fornecedor'],
    ['contato', 'Contato / preposto'],
    ['telefone', 'Telefone'],
    ['email', 'E-mail do fornecedor'],
    ['enderecoFornecedor', 'Endereço do fornecedor'],
    ['gestor', 'Gestor da ata'],
    ['fiscal', 'Fiscal da ata'],
    ['coordenador', 'Quem assina a ordem pelo Cremesp'],
    ['cargoCoordenador', 'Cargo de quem assina'],
    ['responsavelTecnico', 'Responsável técnico padrão dos eventos'],
  ];

  const confirmar = async () => {
    if (!r.setor.trim() || !r.servico.trim()) {
      setErro('Informe o setor e o serviço.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await criar({ ...r, setor: r.setor.trim(), servico: r.servico.trim() });
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Confira os dados da ata</h1>
          <p className="text-sm text-slate-500">
            {r.lidoPorIA ? 'A IA leu o arquivo e preencheu o que encontrou. Corrija o que precisar antes de criar o sistema.' : 'Preencha os dados e os itens da ata.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Botao onClick={cancelar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao variante="primario" icone={salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} disabled={salvando} onClick={() => void confirmar()}>
            {salvando ? 'Criando…' : 'Criar sistema desta ata'}
          </Botao>
        </div>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{erro}</p>}
      {(r.avisos.length > 0 || semValor > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Pontos para conferir
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            {semValor > 0 && <li>{semValor === 1 ? '1 item está' : `${semValor} itens estão`} sem quantidade ou sem valor.</li>}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader titulo="Dados gerais" subtitulo="Aparecem no painel, na ordem de serviço e nos relatórios" icone={<FileText className="h-4 w-4" />} />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Nome do setor">
            <input id="rev-setor" className={inputCls} value={r.setor} onChange={(e) => setR((x) => ({ ...x, setor: e.target.value }))} />
          </Campo>
          <Campo rotulo="Serviço / produto" className="lg:col-span-2">
            <input id="rev-servico" className={inputCls} value={r.servico} onChange={(e) => setR((x) => ({ ...x, servico: e.target.value }))} />
          </Campo>
          <Campo rotulo="Objeto da ata" className="sm:col-span-2 lg:col-span-3">
            <textarea className={`${inputCls} min-h-[64px]`} value={ata.objeto} onChange={(e) => setAta('objeto', e.target.value)} />
          </Campo>
          <Campo rotulo="Início da vigência">
            <input type="date" className={inputCls} value={ata.vigenciaInicio} onChange={(e) => setAta('vigenciaInicio', e.target.value)} />
          </Campo>
          <Campo rotulo="Fim da vigência">
            <input type="date" className={inputCls} value={ata.vigenciaFim} onChange={(e) => setAta('vigenciaFim', e.target.value)} />
          </Campo>
          {campos.map(([k, rotulo]) => (
            <Campo key={k} rotulo={rotulo}>
              <input id={`rev-${k}`} className={inputCls} value={ata[k]} onChange={(e) => setAta(k, e.target.value)} />
            </Campo>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          titulo={`Itens da ata (${itens.length})`}
          subtitulo={`Valor total registrado: ${brl(total)}`}
          icone={<FileText className="h-4 w-4" />}
          acoes={
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input className={`${inputCls} w-56 pl-8`} placeholder="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <Botao icone={<Plus className="h-4 w-4" />} onClick={addItem}>
                Adicionar item
              </Botao>
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-16 px-3 py-2">Item</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="w-44 px-3 py-2">Grupo</th>
                <th className="w-36 px-3 py-2">Unidade</th>
                <th className="w-28 px-3 py-2 text-right">Qtd.</th>
                <th className="w-32 px-3 py-2 text-right">Valor unit.</th>
                <th className="w-32 px-3 py-2 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-3 py-2">
                    <input className={`${inputCls} px-2`} value={i.codigo} onChange={(e) => setItem(i.id, { codigo: e.target.value })} aria-label="Número do item" />
                  </td>
                  <td className="px-3 py-2">
                    <textarea className={`${inputCls} min-h-[38px] px-2`} rows={2} value={i.descricao} onChange={(e) => setItem(i.id, { descricao: e.target.value })} aria-label="Descrição" />
                  </td>
                  <td className="px-3 py-2">
                    <select className={`${inputCls} px-2`} value={i.moduloId} onChange={(e) => setItem(i.id, { moduloId: e.target.value })} aria-label="Grupo">
                      {modulos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select className={`${inputCls} px-2`} value={i.unidade} onChange={(e) => setItem(i.id, { unidade: e.target.value as Unidade })} aria-label="Unidade">
                      {UNIDADES.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      className={`${inputCls} px-2 text-right ${!i.qtdContratada ? 'border-amber-400' : ''}`}
                      value={i.qtdContratada}
                      onChange={(e) => setItem(i.id, { qtdContratada: Math.max(0, Number(e.target.value) || 0) })}
                      aria-label="Quantidade"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={`${inputCls} px-2 text-right ${!i.valorUnitario ? 'border-amber-400' : ''}`}
                      value={i.valorUnitario}
                      onChange={(e) => setItem(i.id, { valorUnitario: Math.max(0, Number(e.target.value) || 0) })}
                      aria-label="Valor unitário"
                    />
                  </td>
                  <td className="px-3 py-2 pt-4 text-right font-medium tabular-nums text-slate-700">{brl(i.valorUnitario * i.qtdContratada)}</td>
                  <td className="py-2 pr-2 pt-3">
                    <button onClick={() => removerItem(i.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remover item ${i.codigo}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500">
                    {itens.length ? 'Nenhum item encontrado na busca.' : 'Nenhum item ainda. Use “Adicionar item”.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Os grupos ({modulos.map((m) => m.nome).join(', ') || 'nenhum'}) podem ser renomeados depois em Configuração da Ata. Lá também dá para mudar cores, itens e quantidades.
        </p>
      </Card>
      <div className="flex justify-end gap-2 pb-8">
        <Botao onClick={cancelar} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao variante="primario" disabled={salvando} onClick={() => void confirmar()}>
          {salvando ? 'Criando…' : 'Criar sistema desta ata'}
        </Botao>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Uma ata aberta

function AtaAberta({ cliente, sessao, linha, papel, aoVoltar }: { cliente: SupabaseClient; sessao: Session; linha: LinhaAta; papel: 'equipe' | 'fornecedor'; aoVoltar?: () => void }) {
  const conexao = useMemo(() => conexaoPainel(cliente, linha.id), [cliente, linha.id]);
  const [carga, setCarga] = useState<{ tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'pronto'; base: Base; sinc: Map<string, string> }>({ tipo: 'carregando' });
  useEffect(() => {
    let ativo = true;
    lerTudo<Registro>((de, ate) => cliente.from('painel_registros').select('colecao, id, ordem, dados').eq('ata_id', linha.id).order('colecao').order('id').range(de, ate))
      .then((lista) => {
        const sinc = new Map<string, string>();
        for (const r of lista) sinc.set(chaveRegistro(r.colecao, r.id), assinatura(r));
        if (ativo) setCarga({ tipo: 'pronto', base: registrosParaBase(lista), sinc });
      })
      .catch((err: Error) => ativo && setCarga({ tipo: 'erro', msg: err.message }));
    return () => {
      ativo = false;
    };
  }, [cliente, linha.id]);

  if (carga.tipo !== 'pronto') {
    return (
      <TelaCentral>
        {carga.tipo === 'carregando' ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a ata…
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">Não foi possível abrir a ata. {carga.msg}</p>
            <div className="mt-4">{aoVoltar && <Botao onClick={aoVoltar}>Voltar</Botao>}</div>
          </>
        )}
      </TelaCentral>
    );
  }
  if (papel === 'fornecedor') return <PortalFornecedor conexao={conexao} email={sessao.user.email ?? ''} inicial={carga.base} aoVoltar={aoVoltar} />;
  return (
    <AppCompartilhado
      conexao={conexao}
      sessao={sessao}
      inicial={carga.base}
      sincronizadoInicial={carga.sinc}
      marca={{ titulo: 'Painel de Atas', subtitulo: [linha.setor, linha.servico].filter(Boolean).join(' · ') }}
      aoVoltar={aoVoltar}
    />
  );
}

// ---------------------------------------------------------------- Página inicial

const ataDaUrl = () => new URLSearchParams(window.location.hash.slice(1)).get('ata') ?? '';
const irParaAta = (id: string) => {
  window.location.hash = id ? `ata=${encodeURIComponent(id)}` : '';
};

function Inicio({ cliente, sessao, acesso }: { cliente: SupabaseClient; sessao: Session; acesso: Acesso }) {
  const [atas, setAtas] = useState<LinhaAta[] | null>(null);
  const [bases, setBases] = useState<Map<string, Base>>(new Map());
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(ataDaUrl);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [busca, setBusca] = useState('');
  const email = sessao.user.email ?? '';
  const sair = () => void cliente.auth.signOut();

  const carregar = useCallback(async () => {
    try {
      const linhas = await lerTudo<LinhaAta>((de, ate) => cliente.from('painel_atas').select('id, setor, servico, arquivo, criado_em, criado_por').order('criado_em', { ascending: false }).range(de, ate));
      const regs = await lerTudo<Registro & { ata_id: string }>((de, ate) =>
        cliente.from('painel_registros').select('ata_id, colecao, id, ordem, dados').in('colecao', ['ata', 'itens', 'eventos']).order('ata_id').order('colecao').order('id').range(de, ate),
      );
      const porAta = new Map<string, Registro[]>();
      for (const r of regs) porAta.set(r.ata_id, [...(porAta.get(r.ata_id) ?? []), r]);
      setBases(new Map([...porAta].map(([id, lista]) => [id, registrosParaBase(lista)])));
      setAtas(linhas);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }, [cliente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    const h = () => setAberta(ataDaUrl());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  // Fornecedor com uma única ata entra direto nela
  useEffect(() => {
    if (!acesso.equipe && atas && atas.length === 1 && !aberta) irParaAta(atas[0].id);
  }, [acesso.equipe, atas, aberta]);

  const voltar = () => {
    irParaAta('');
    void carregar();
  };

  const criar = async (r: Rascunho) => {
    const { error: e1 } = await cliente.from('painel_atas').insert({ id: r.ataId, setor: r.setor, servico: r.servico, arquivo: r.arquivo, criado_por: email });
    if (e1) throw new Error(`Não foi possível criar a ata. ${e1.message}`);
    const cx = conexaoPainel(cliente, r.ataId);
    const linhas = [...baseParaRegistros(r.base).values()].map((reg) => linhaBanco(cx, reg));
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await cliente.from('painel_registros').upsert(linhas.slice(i, i + 500));
      if (error) {
        await cliente.from('painel_atas').delete().eq('id', r.ataId);
        throw new Error(`Não foi possível gravar os itens. ${error.message}`);
      }
    }
    setRascunho(null);
    await carregar();
    irParaAta(r.ataId);
  };

  const excluir = async (l: LinhaAta) => {
    const nome = l.servico || bases.get(l.id)?.ata.numero || 'esta ata';
    if (!window.confirm(`Excluir “${nome}” do painel? Todos os itens e eventos dela serão apagados para todo o setor. Isso não pode ser desfeito.`)) return;
    const { error } = await cliente.from('painel_atas').delete().eq('id', l.id);
    if (error) window.alert(`Não foi possível excluir. ${error.message}`);
    void carregar();
  };

  const linhaAberta = aberta ? atas?.find((a) => a.id === aberta) : undefined;
  if (aberta && linhaAberta) {
    const podeVoltar = acesso.equipe || (atas?.length ?? 0) > 1;
    return <AtaAberta key={linhaAberta.id} cliente={cliente} sessao={sessao} linha={linhaAberta} papel={acesso.equipe ? 'equipe' : 'fornecedor'} aoVoltar={podeVoltar ? voltar : undefined} />;
  }

  const q = busca.trim().toLowerCase();
  const lista = (atas ?? []).filter((l) => {
    if (!q) return true;
    const a = bases.get(l.id)?.ata;
    return `${l.setor} ${l.servico} ${a?.numero ?? ''} ${a?.fornecedor ?? ''} ${a?.objeto ?? ''}`.toLowerCase().includes(q);
  });
  const setores = new Set((atas ?? []).map((l) => l.setor).filter(Boolean));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <Topo email={email} sair={sair} />
      <main className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
        {rascunho ? (
          <Revisao rascunho={rascunho} criar={criar} cancelar={() => setRascunho(null)} />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">{acesso.equipe ? 'Atas do painel' : 'Suas atas'}</h1>
                <p className="text-sm text-slate-500">
                  {atas === null
                    ? 'Carregando…'
                    : `${atas.length} ${atas.length === 1 ? 'ata' : 'atas'}${setores.size ? ` · ${setores.size} ${setores.size === 1 ? 'setor' : 'setores'}` : ''}. Cada ata tem o próprio sistema de saldos, eventos e portal do fornecedor.`}
                </p>
              </div>
              {(atas?.length ?? 0) > 3 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input className={`${inputCls} w-64 pl-8`} placeholder="Buscar setor, serviço ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              )}
            </div>
            {erro && (
              <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                Não foi possível carregar as atas. {erro}
              </p>
            )}
            {atas && atas.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((l) => (
                  <CartaoAta
                    key={l.id}
                    linha={l}
                    base={bases.get(l.id)}
                    abrir={() => irParaAta(l.id)}
                    verArquivo={l.arquivo && acesso.equipe ? () => void abrirAnexoNoNavegador(conexaoPainel(cliente, l.id), l.arquivo!) : undefined}
                    excluir={acesso.equipe ? () => void excluir(l) : undefined}
                  />
                ))}
              </div>
            )}
            {atas && atas.length === 0 && !acesso.equipe && <p className="text-sm text-slate-500">Nenhuma ata liberada para você ainda.</p>}
            {acesso.equipe && <NovaAta cliente={cliente} aoLer={setRascunho} aoCadastrarManual={setRascunho} />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------- Login e acesso

function ModoPainel({ cliente }: { cliente: SupabaseClient }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [acesso, setAcesso] = useState<Acesso | null | { erro: string }>(null);

  useEffect(() => {
    void cliente.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = cliente.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [cliente]);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId) return;
    setAcesso(null);
    void cliente.rpc('painel_meu_acesso').then(({ data, error }) => {
      if (error) setAcesso({ erro: error.message });
      else {
        const d = (data ?? {}) as Partial<Acesso>;
        setAcesso({ equipe: d.equipe === true, atas: Array.isArray(d.atas) ? d.atas : [] });
      }
    });
  }, [cliente, userId]);

  if (sessao === undefined) {
    return (
      <TelaCentral>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      </TelaCentral>
    );
  }
  if (!sessao) return <TelaLogin cliente={cliente} titulo={TITULO} />;
  if (acesso && 'equipe' in acesso && (acesso.equipe || acesso.atas.length > 0)) return <Inicio cliente={cliente} sessao={sessao} acesso={acesso} />;
  return (
    <TelaCentral>
      {!acesso && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o acesso…
        </p>
      )}
      {acesso && 'erro' in acesso && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Painel ainda não configurado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Rode o script <strong>supabase/painel-configurar.sql</strong> no Supabase (veja o guia). Detalhe: {acesso.erro}
          </p>
        </>
      )}
      {acesso && 'equipe' in acesso && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Acesso não liberado</h1>
          <p className="mt-2 text-sm text-slate-600">
            O e-mail <strong>{sessao.user.email}</strong> ainda não foi autorizado no Painel de Atas. Peça a alguém da equipe para cadastrá-lo em Configuração da Ata › Quem tem acesso.
          </p>
        </>
      )}
      <div className="mt-5">
        <Botao icone={<LogOut className="h-4 w-4" />} onClick={() => void cliente.auth.signOut()}>
          Sair
        </Botao>
      </div>
    </TelaCentral>
  );
}

export default function PainelAtas() {
  if (!supabase) {
    return (
      <TelaCentral>
        <h1 className="text-base font-semibold text-slate-900">{TITULO}</h1>
        <p className="mt-2 text-sm text-slate-600">
          O Painel de Atas precisa do Supabase. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente da Vercel e publique de novo.
        </p>
      </TelaCentral>
    );
  }
  return <ModoPainel cliente={supabase} />;
}
