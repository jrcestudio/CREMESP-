/* ============================================================================
 * Painel de Atas – Cremesp
 * Sistema separado do Gestor de Atas da REDXCORP: o setor anexa o PDF de uma
 * Ata de Registro de Preços e importa o arquivo de dados dela (.json), a
 * equipe confere e cada ata vira um sistema completo (saldos, simulador, ordem,
 * eventos, relatórios e portal do fornecedor), com dados nas tabelas painel_*.
 * ========================================================================== */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, ArrowLeftRight, ArrowRight, Bell, Building2, FilePlus2, FileText, History, LayoutDashboard, Loader2, LogOut, Plus, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { PRODUTO, definirMarca, marca } from './marca';
import type { Orgao } from './marca';
import { DadosOrgao, Historico, Plataforma } from './Plataforma';
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
  etapaDe,
  enviarArquivo,
  fmtNum,
  grupoEvento,
  hojeISO,
  inputCls,
  linhaBanco,
  normalizarBase,
  registrosParaBase,
  supabase,
} from './GestorAtas';
import type { Anexo, AtaInfo, Base, Evento, ItemAta, Modulo, Registro, Unidade } from './GestorAtas';

const LIMITE_ATA = 30 * 1024 * 1024;

interface LinhaAta {
  id: string;
  orgao_id: string;
  setor: string;
  servico: string;
  arquivo: Anexo | null;
  criado_em: string;
  criado_por: string | null;
}

/** Papel da pessoa em um órgão: equipe (todas as atas) ou fornecedor (as atas listadas) */
interface Acesso {
  equipe: boolean;
  atas: string[];
}

type OrgaoAcesso = Orgao & Acesso;

interface AcessoGeral {
  plataforma: boolean;
  orgaos: OrgaoAcesso[];
}

/** Formato do arquivo de dados da ata (.json) importado na página inicial */
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
  /** PDF original da ata, enviado ao criar */
  pdf: File | null;
  base: Base;
  avisos: string[];
  importado: boolean;
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

/** Transforma o arquivo de dados na estrutura do sistema (módulos com cor, itens com id) */
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
          <img src={marca.icone} alt={marca.sigla} className="object-contain h-9 w-9" />
          <div>
            <p className="text-sm font-semibold leading-tight">{marca.nome || PRODUTO}</p>
            <p className="text-xs text-slate-500">{PRODUTO} · controle de Atas de Registro de Preços</p>
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

/** Lê o arquivo de dados da ata (.json): o formato de importação ou um backup do sistema */
export function lerArquivoDeDados(texto: string): { base: Base; avisos: string[] } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new Error('Esse arquivo não é um arquivo de dados válido (.json).');
  }
  const o = (bruto ?? {}) as Record<string, unknown>;
  // Backup exportado pelo próprio sistema (Configuração da Ata › Exportar backup)
  if (o.versao === 1 && Array.isArray(o.itens) && Array.isArray(o.modulos) && o.ata) {
    const b = normalizarBase(o as unknown as Base);
    return { base: { ...b, eventos: [] }, avisos: ['Arquivo de backup: os itens foram importados, os eventos não.'] };
  }
  if (!o.ata || !Array.isArray(o.itens)) throw new Error('O arquivo não tem os dados da ata (campos "ata" e "itens").');
  const ext = { ata: o.ata, modulos: Array.isArray(o.modulos) ? o.modulos : [], itens: o.itens, avisos: Array.isArray(o.avisos) ? o.avisos : [] } as Extracao;
  const base = montarBase(ext);
  const avisos = ext.avisos.map(textoLimpo).filter(Boolean);
  if (base.itens.length === 0) avisos.unshift('O arquivo não trouxe nenhum item. Adicione os itens abaixo.');
  return { base, avisos };
}

function NovaAta({ aoContinuar }: { aoContinuar: (r: Rascunho) => void }) {
  const [setor, setSetor] = useState('');
  const [servico, setServico] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [dados, setDados] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const entradaPdf = useRef<HTMLInputElement>(null);
  const entradaDados = useRef<HTMLInputElement>(null);

  const escolherPdf = (f: File | undefined) => {
    setErro('');
    if (!f) return;
    if (f.size > LIMITE_ATA) return setErro('O PDF da ata passa de 30 MB.');
    setPdf(f);
  };

  const rascunho = (base: Base, avisos: string[], importado: boolean): Rascunho => ({
    ataId: `ata-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    setor: setor.trim(),
    servico: servico.trim(),
    pdf,
    base,
    avisos,
    importado,
  });

  const importar = async () => {
    if (!dados) return;
    setErro('');
    try {
      const { base, avisos } = lerArquivoDeDados(await dados.text());
      aoContinuar(rascunho(base, avisos, true));
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  };

  const manual = () => {
    const b = criarBaseVazia();
    aoContinuar(rascunho({ ...b, ata: { ...b.ata, coordenador: '', cargoCoordenador: '', responsavelTecnico: '' }, modulos: [{ id: 'm1', nome: 'Itens da Ata', cor: LISTA_CORES[0] }] }, [], false));
  };

  const temNomes = !!setor.trim() && !!servico.trim();
  const zona = 'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition border-slate-300 bg-slate-50 hover:border-marca-400 hover:bg-marca-50/50';
  return (
    <Card>
      <CardHeader
        titulo="Cadastrar nova ata"
        subtitulo="Informe o setor e o serviço, anexe o PDF da ata e importe o arquivo de dados. Você confere tudo antes de criar."
        icone={<Plus className="h-4 w-4" />}
      />
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <Campo rotulo="Nome do setor">
          <input id="nova-setor" className={inputCls} value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex.: Departamento de Comunicação" />
        </Campo>
        <Campo rotulo="A ata se refere a qual serviço ou produto?">
          <input id="nova-servico" className={inputCls} value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: Locação de equipamentos de audiovisual" />
        </Campo>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">1. PDF da ata (fica guardado para consulta)</p>
          <input ref={entradaPdf} id="nova-pdf" type="file" accept="application/pdf,.pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { escolherPdf(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className={zona} onClick={() => entradaPdf.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); escolherPdf(e.dataTransfer.files?.[0]); }}>
            <Upload className="h-5 w-5 text-marca-700" />
            <span className="text-sm font-medium text-slate-800">{pdf ? pdf.name : 'Anexar o PDF da ata'}</span>
            <span className="text-xs text-slate-500">{pdf ? `${fmtNum.format(pdf.size / 1024 / 1024)} MB · clique para trocar` : 'Opcional, até 30 MB'}</span>
          </button>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">2. Arquivo de dados da ata (.json)</p>
          <input ref={entradaDados} id="nova-dados" type="file" accept="application/json,.json" className="hidden" onChange={(e) => { setErro(''); setDados(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <button type="button" className={zona} onClick={() => entradaDados.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setErro(''); setDados(e.dataTransfer.files?.[0] ?? null); }}>
            <FileText className="h-5 w-5 text-marca-700" />
            <span className="text-sm font-medium text-slate-800">{dados ? dados.name : 'Escolher o arquivo de dados'}</span>
            <span className="text-xs text-slate-500">{dados ? 'clique para trocar' : 'Gerado a partir do PDF da ata'}</span>
          </button>
        </div>
        {erro && (
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 md:col-span-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {erro}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Botao variante="primario" icone={<Upload className="h-4 w-4" />} disabled={!temNomes || !dados} onClick={() => void importar()}>
            Importar dados da ata
          </Botao>
          <Botao disabled={!temNomes} onClick={manual}>
            Cadastrar os itens à mão
          </Botao>
          {!temNomes && <span className="text-xs text-slate-500">Preencha o setor e o serviço.</span>}
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
    ['coordenador', `Quem assina a ordem pelo ${marca.sigla}`],
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
            {r.importado ? 'Os dados foram importados do arquivo. Corrija o que precisar antes de criar o sistema.' : 'Preencha os dados e os itens da ata.'}
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
  const conexao = useMemo(() => conexaoPainel(cliente, linha.id, linha.orgao_id), [cliente, linha.id, linha.orgao_id]);
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

// ---------------------------------------------------------------- Peças da página inicial

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Etapas em que o evento espera uma ação da equipe do órgão */
const ETAPAS_COM_EQUIPE = new Set(['revisado_fornecedor', 'ajuste_solicitado', 'aguardando_diretoria', 'realizado', 'nota_recebida']);

const primeiroNome = (email: string) => {
  const p = email.split('@')[0].split(/[._-]/)[0] ?? '';
  return p ? p[0].toUpperCase() + p.slice(1) : '';
};
const iniciais = (texto: string) => {
  const partes = texto.split('@')[0].split(/[\s._-]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase() || '?';
};
const saudacaoDoDia = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};
const dataDeHoje = () => {
  const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const CORES_RESUMO = {
  azul: 'from-[#4a7bff] to-[#3b6cf6] shadow-[0_12px_28px_-10px_rgba(59,108,246,0.55)]',
  roxo: 'from-[#9064ff] to-[#7a4df2] shadow-[0_12px_28px_-10px_rgba(122,77,242,0.55)]',
  verde: 'from-[#26cbbf] to-[#12b3a8] shadow-[0_12px_28px_-10px_rgba(18,179,168,0.55)]',
};

function CardResumo({ cor, titulo, emoji, numero, detalhe }: { cor: keyof typeof CORES_RESUMO; titulo: string; emoji: string; numero: number; detalhe: string }) {
  return (
    <article className={`flex flex-col gap-3.5 rounded-[20px] bg-gradient-to-br p-5 text-white transition hover:-translate-y-1 ${CORES_RESUMO[cor]}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium opacity-90">{titulo}</h3>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-lg" aria-hidden="true">
          {emoji}
        </span>
      </div>
      <p className="text-[38px] font-bold leading-none tabular-nums">{numero}</p>
      <p className="text-xs opacity-85">{detalhe}</p>
    </article>
  );
}

const CORES_AVATAR = ['bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-coral', 'bg-amber-500'];

function LinhaDeAta({ linha, base, hoje, abrir, verArquivo, excluir }: { linha: LinhaAta; base: Base | undefined; hoje: string; abrir: () => void; verArquivo?: () => void; excluir?: () => void }) {
  const ata = base?.ata;
  const r = base ? resumoAta(base) : null;
  const usado = r && r.total ? Math.round((r.utilizado / r.total) * 100) : 0;
  const fim = ata?.vigenciaFim ?? '';
  const dias = fim ? Math.round((Date.parse(fim) - Date.parse(hoje)) / 86_400_000) : null;
  const badge =
    dias === null
      ? { txt: 'Sem vigência', cls: 'bg-blue-50 text-blue-700' }
      : dias < 0
        ? { txt: 'Encerrada', cls: 'bg-slate-100 text-slate-600' }
        : dias <= 60
          ? { txt: `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`, cls: 'bg-amber-50 text-amber-800' }
          : { txt: 'Vigente', cls: 'bg-emerald-50 text-emerald-700' };
  const pessoas = [ata?.fornecedor, ata?.gestor, ata?.fiscal].filter((x): x is string => !!x && x.trim() !== '');
  return (
    <article className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-[18px] bg-white px-5 py-4 shadow-suave sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
      <button onClick={abrir} className="grid h-12 w-12 place-items-center rounded-2xl bg-gelo text-xl" aria-label={`Abrir ${linha.servico}`}>
        📄
      </button>
      <button onClick={abrir} className="min-w-0 text-left">
        <strong className="block truncate font-semibold">{linha.servico || ata?.objeto || 'Serviço não informado'}</strong>
        <span className="block truncate text-xs text-slate-500">
          {[linha.setor, ata?.numero, r ? `${usado}% utilizado` : ''].filter(Boolean).join(' · ')}
        </span>
      </button>
      <div className="col-start-2 flex sm:col-start-auto" aria-label={pessoas.join(', ')}>
        {pessoas.slice(0, 3).map((p, i) => (
          <span key={i} title={p} className={`-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white text-[11px] font-semibold text-white first:ml-0 ${CORES_AVATAR[i % CORES_AVATAR.length]}`}>
            {iniciais(p)}
          </span>
        ))}
      </div>
      <span className={`col-start-2 justify-self-start whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold sm:col-start-auto ${badge.cls}`}>{badge.txt}</span>
      <div className="col-start-2 flex items-center gap-1 sm:col-start-auto">
        {verArquivo && (
          <button onClick={verArquivo} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Ver ata original" aria-label="Ver ata original">
            <FileText className="h-4 w-4" />
          </button>
        )}
        {excluir && (
          <button onClick={excluir} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Excluir ata" aria-label={`Excluir ${linha.servico}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <Botao variante="primario" tamanho="sm" onClick={abrir}>
          Abrir <ArrowRight className="h-3.5 w-3.5" />
        </Botao>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- Página inicial

const ataDaUrl = () => new URLSearchParams(window.location.hash.slice(1)).get('ata') ?? '';
const irParaAta = (id: string) => {
  window.location.hash = id ? `ata=${encodeURIComponent(id)}` : '';
};

function Inicio({ cliente, sessao, acesso, orgao, trocarOrgao }: { cliente: SupabaseClient; sessao: Session; acesso: Acesso; orgao: Orgao; trocarOrgao?: () => void }) {
  const [atas, setAtas] = useState<LinhaAta[] | null>(null);
  const [bases, setBases] = useState<Map<string, Base>>(new Map());
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(ataDaUrl);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [busca, setBusca] = useState('');
  const [tela, setTela] = useState<'atas' | 'orgao' | 'historico'>('atas');
  const [mostrarNova, setMostrarNova] = useState(false);
  const refNova = useRef<HTMLDivElement>(null);
  const email = sessao.user.email ?? '';
  const sair = () => void cliente.auth.signOut();

  const carregar = useCallback(async () => {
    try {
      const linhas = await lerTudo<LinhaAta>((de, ate) =>
        cliente.from('painel_atas').select('id, orgao_id, setor, servico, arquivo, criado_em, criado_por').eq('orgao_id', orgao.id).order('criado_em', { ascending: false }).range(de, ate),
      );
      let regs: (Registro & { ata_id: string })[] = [];
      const ids = linhas.map((l) => l.id);
      for (let i = 0; i < ids.length; i += 50) {
        const parte = ids.slice(i, i + 50);
        regs = regs.concat(
          await lerTudo<Registro & { ata_id: string }>((de, ate) =>
            cliente.from('painel_registros').select('ata_id, colecao, id, ordem, dados').in('ata_id', parte).in('colecao', ['ata', 'itens', 'eventos']).order('ata_id').order('colecao').order('id').range(de, ate),
          ),
        );
      }
      const porAta = new Map<string, Registro[]>();
      for (const r of regs) porAta.set(r.ata_id, [...(porAta.get(r.ata_id) ?? []), r]);
      setBases(new Map([...porAta].map(([id, lista]) => [id, registrosParaBase(lista)])));
      setAtas(linhas);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
    }
  }, [cliente, orgao.id]);

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
    const cx = conexaoPainel(cliente, r.ataId, orgao.id);
    // A ata é criada antes do PDF: o armazenamento só aceita arquivos de atas do órgão
    const { error: e1 } = await cliente.from('painel_atas').insert({ id: r.ataId, orgao_id: orgao.id, setor: r.setor, servico: r.servico, arquivo: null, criado_por: email });
    if (e1) throw new Error(`Não foi possível criar a ata. ${e1.message}`);
    if (r.pdf) {
      try {
        const arquivo = await enviarArquivo(cx, 'ata', r.pdf);
        await cliente.from('painel_atas').update({ arquivo }).eq('id', r.ataId);
      } catch (err) {
        await cliente.from('painel_atas').delete().eq('id', r.ataId);
        throw err;
      }
    }
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
  const hoje = hojeISO();

  // Números do topo e próximos eventos, de todas as atas do órgão
  let vigentes = 0;
  let emAndamento = 0;
  let pendentes = 0;
  const proximos: { ataId: string; servico: string; ev: Evento }[] = [];
  for (const l of atas ?? []) {
    const b = bases.get(l.id);
    if (!b) continue;
    if (!b.ata.vigenciaFim || b.ata.vigenciaFim >= hoje) vigentes += 1;
    for (const ev of b.eventos) {
      const etapa = etapaDe(ev);
      if (grupoEvento(ev) === 'solicitado') emAndamento += 1;
      if (ETAPAS_COM_EQUIPE.has(etapa)) pendentes += 1;
      if (etapa !== 'cancelado' && ev.dataInicio && ev.dataInicio >= hoje) proximos.push({ ataId: l.id, servico: l.servico || b.ata.numero, ev });
    }
  }
  proximos.sort((a, b) => a.ev.dataInicio.localeCompare(b.ev.dataInicio));

  const nomeUsuario = primeiroNome(email);
  const navegar = (t: typeof tela) => {
    setTela(t);
    setRascunho(null);
  };
  const itensMenu: { id: typeof tela; rotulo: string; icone: ReactNode }[] = [
    { id: 'atas', rotulo: acesso.equipe ? 'Painel' : 'Suas atas', icone: <LayoutDashboard className="h-5 w-5" /> },
    ...(acesso.equipe
      ? [
          { id: 'orgao' as const, rotulo: 'Dados do órgão', icone: <Building2 className="h-5 w-5" /> },
          { id: 'historico' as const, rotulo: 'Histórico', icone: <History className="h-5 w-5" /> },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gelo text-slate-900 antialiased lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* 1. Menu lateral */}
      <aside className="flex flex-col gap-4 bg-sidebar px-4 py-4 text-slate-300 lg:sticky lg:top-0 lg:h-screen lg:gap-8 lg:px-[18px] lg:py-7">
        <div className="flex items-center gap-3 px-1 lg:px-2.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white p-1">
            <img src={marca.icone} alt={marca.sigla} className="h-9 w-9 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-tight text-white">{marca.sigla}</p>
            <p className="truncate text-xs text-slate-400">{PRODUTO}</p>
          </div>
        </div>
        <nav className="flex gap-1.5 overflow-x-auto lg:flex-col">
          {itensMenu.map((m) => (
            <button
              key={m.id}
              onClick={() => navegar(m.id)}
              aria-current={tela === m.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl px-3.5 py-3 text-sm font-medium transition ${
                tela === m.id ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              {m.icone}
              {m.rotulo}
            </button>
          ))}
          {trocarOrgao && (
            <button onClick={trocarOrgao} className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-2xl px-3.5 py-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white">
              <ArrowLeftRight className="h-5 w-5" /> Trocar órgão
            </button>
          )}
        </nav>
        <div className="mt-auto hidden rounded-2xl bg-white/[0.06] p-3.5 text-xs lg:block">
          <p className="text-[13px] font-semibold text-white">{marca.nome || marca.sigla}</p>
          <p className="mt-0.5">
            {atas?.length ?? 0} {atas?.length === 1 ? 'ata' : 'atas'}
            {setores.size ? ` · ${setores.size} ${setores.size === 1 ? 'setor' : 'setores'}` : ''}
          </p>
          <button onClick={sair} className="mt-3 flex items-center gap-1.5 font-medium text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-7 px-4 pb-10 pt-6 sm:px-7">
        {/* 2. Cabeçalho */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-[22px]">
              Olá{nomeUsuario ? `, ${nomeUsuario}` : ''}! {saudacaoDoDia()} 👋
            </h1>
            <p className="text-[13px] text-slate-500">
              {dataDeHoje()}
              {acesso.equipe && pendentes > 0 ? ` · ${pendentes} ${pendentes === 1 ? 'evento aguarda' : 'eventos aguardam'} a equipe` : ''}
            </p>
          </div>
          <label className="relative col-span-2 row-start-2 w-full lg:col-span-1 lg:row-start-auto lg:max-w-[440px] lg:justify-self-center">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
            <input
              id="busca-atas"
              type="search"
              className="w-full rounded-full border border-slate-200 bg-white py-3 pl-11 pr-5 text-sm shadow-suave placeholder:text-slate-400 focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-500/20"
              placeholder="Buscar ata, setor ou fornecedor"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                if (tela !== 'atas') navegar('atas');
              }}
            />
          </label>
          <div className="flex items-center gap-3">
            <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-suave" title={pendentes ? `${pendentes} pendências da equipe` : 'Nenhuma pendência'}>
              <Bell className="h-5 w-5 text-slate-700" />
              {pendentes > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-coral" />}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-coral to-violet-600 text-sm font-semibold text-white shadow-suave" title={email}>
              {iniciais(email)}
            </span>
          </div>
        </header>

        {tela === 'orgao' && acesso.equipe ? (
          <DadosOrgao cliente={cliente} orgao={orgao} />
        ) : tela === 'historico' && acesso.equipe ? (
          <Historico cliente={cliente} orgao={orgao} atas={(atas ?? []).map((l) => ({ id: l.id, nome: l.servico || bases.get(l.id)?.ata.numero || l.id }))} />
        ) : rascunho ? (
          <Revisao rascunho={rascunho} criar={criar} cancelar={() => setRascunho(null)} />
        ) : (
          <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-7">
              {/* 3. Cards de resumo */}
              <section className="grid gap-5 sm:grid-cols-3" aria-label="Resumo">
                <CardResumo cor="azul" titulo="Atas vigentes" emoji="📄" numero={vigentes} detalhe={`${atas?.length ?? 0} no total`} />
                <CardResumo cor="roxo" titulo="Eventos em andamento" emoji="📅" numero={emAndamento} detalhe={`${proximos.length} com data marcada`} />
                <CardResumo cor="verde" titulo="Pendentes" emoji="⏳" numero={pendentes} detalhe="aguardam a equipe" />
              </section>

              {erro && <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">Não foi possível carregar as atas. {erro}</p>}

              {/* 4. Atas (cards horizontais) */}
              <section aria-labelledby="titulo-atas">
                <div className="mb-3.5 flex items-baseline justify-between gap-3">
                  <h2 id="titulo-atas" className="text-lg font-semibold">
                    {acesso.equipe ? 'Atas do órgão' : 'Suas atas'}
                  </h2>
                  <span className="text-[13px] text-slate-500">{atas === null ? 'Carregando…' : q ? `${lista.length} de ${atas.length}` : ''}</span>
                </div>
                <div className="space-y-3">
                  {lista.map((l) => (
                    <LinhaDeAta
                      key={l.id}
                      linha={l}
                      base={bases.get(l.id)}
                      hoje={hoje}
                      abrir={() => irParaAta(l.id)}
                      verArquivo={l.arquivo && acesso.equipe ? () => void abrirAnexoNoNavegador(conexaoPainel(cliente, l.id, orgao.id), l.arquivo!) : undefined}
                      excluir={acesso.equipe ? () => void excluir(l) : undefined}
                    />
                  ))}
                  {atas && atas.length === 0 && (
                    <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-suave">
                      {acesso.equipe ? 'Nenhuma ata cadastrada ainda. Use “+ Nova ata” para começar.' : 'Nenhuma ata liberada para você ainda.'}
                    </p>
                  )}
                  {atas && atas.length > 0 && lista.length === 0 && <p className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-suave">Nenhuma ata encontrada para “{busca}”.</p>}
                </div>
              </section>

              {acesso.equipe && (mostrarNova || (atas !== null && atas.length === 0)) && (
                <div ref={refNova}>
                  <NovaAta aoContinuar={setRascunho} />
                </div>
              )}
            </div>

            {/* 5. Painel lateral direito */}
            <aside className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
              {acesso.equipe && (
                <section className="rounded-[20px] bg-white p-5 shadow-suave">
                  <h2 className="mb-4 text-base font-semibold">Ações rápidas</h2>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        setMostrarNova(true);
                        window.setTimeout(() => refNova.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                      }}
                      className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 px-5 py-4 text-left text-[15px] font-semibold text-white shadow-[0_10px_22px_-8px_rgba(122,77,242,0.6)] transition hover:-translate-y-0.5"
                    >
                      + Nova ata <FilePlus2 className="h-5 w-5 opacity-90" />
                    </button>
                    <button
                      onClick={() => navegar('historico')}
                      className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-br from-[#ff8f7c] to-coral px-5 py-4 text-left text-[15px] font-semibold text-white shadow-[0_10px_22px_-8px_rgba(255,111,97,0.6)] transition hover:-translate-y-0.5"
                    >
                      Ver histórico <History className="h-5 w-5 opacity-90" />
                    </button>
                  </div>
                </section>
              )}
              <section className="rounded-[20px] bg-white p-5 shadow-suave">
                <h2 className="mb-4 text-base font-semibold">Próximos eventos</h2>
                {proximos.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum evento com data marcada.</p>
                ) : (
                  <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[21px] before:top-2 before:w-0.5 before:bg-slate-100">
                    {proximos.slice(0, 5).map(({ ataId, servico, ev }) => (
                      <li key={`${ataId}-${ev.id}`}>
                        <button onClick={() => irParaAta(ataId)} className="relative grid w-full grid-cols-[44px_minmax(0,1fr)] gap-3 text-left">
                          <span className="z-[1] flex h-12 w-11 flex-col items-center justify-center rounded-2xl bg-gelo leading-tight ring-4 ring-white">
                            <b className="text-base">{ev.dataInicio.slice(8, 10)}</b>
                            <small className="text-[10px] uppercase tracking-wide text-slate-500">{MESES[Number(ev.dataInicio.slice(5, 7)) - 1]}</small>
                          </span>
                          <span className="min-w-0 self-center">
                            <strong className="block truncate text-[13px] font-semibold">{ev.nome || ev.numero || 'Evento'}</strong>
                            <span className="block truncate text-xs text-slate-500">
                              {servico}
                              {ev.local ? ` · ${ev.local}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Login e acesso

const CHAVE_ORGAO = 'painel-atas-saas:orgao';
const lerOrgaoSalvo = () => {
  try {
    return localStorage.getItem(CHAVE_ORGAO) ?? '';
  } catch {
    return '';
  }
};
const salvarOrgao = (id: string) => {
  try {
    if (id) localStorage.setItem(CHAVE_ORGAO, id);
    else localStorage.removeItem(CHAVE_ORGAO);
  } catch {
    /* navegador sem armazenamento: só não lembra a escolha */
  }
};

function EscolherOrgao({ email, acesso, escolher, sair }: { email: string; acesso: AcessoGeral; escolher: (id: string) => void; sair: () => void }) {
  return (
    <div className="min-h-screen bg-gelo text-slate-900 antialiased">
      <Topo email={email} sair={sair} />
      <main className="mx-auto max-w-[900px] space-y-4 px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold">Escolha o órgão</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {acesso.orgaos.map((o) => (
            <button key={o.id} onClick={() => escolher(o.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-300 hover:shadow">
              {o.logo ? <img src={o.logo} alt="" className="h-10 w-10 rounded object-contain" /> : <span className="h-10 w-10 rounded" style={{ background: o.cor }} />}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{o.nome}</span>
                <span className="block text-xs text-slate-500">
                  {o.sigla || o.id} · {o.equipe ? 'Equipe' : 'Fornecedor'}
                </span>
              </span>
            </button>
          ))}
          {acesso.plataforma && (
            <button onClick={() => escolher('__plataforma')} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left hover:border-slate-400">
              <ShieldCheck className="h-10 w-10 text-slate-500" />
              <span>
                <span className="block text-sm font-semibold">Administração da plataforma</span>
                <span className="block text-xs text-slate-500">Cadastrar e gerenciar órgãos clientes</span>
              </span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function ModoPainel({ cliente }: { cliente: SupabaseClient }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [acesso, setAcesso] = useState<AcessoGeral | null | { erro: string }>(null);
  const [escolhido, setEscolhido] = useState(lerOrgaoSalvo);

  useEffect(() => {
    void cliente.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = cliente.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [cliente]);

  const userId = sessao?.user.id;
  const carregarAcesso = useCallback(() => {
    void cliente.rpc('painel_meu_acesso').then(({ data, error }) => {
      if (error) setAcesso({ erro: error.message });
      else {
        const d = (data ?? {}) as Partial<AcessoGeral>;
        const orgaos = (Array.isArray(d.orgaos) ? d.orgaos : []).map((o) => ({ ...o, equipe: o.equipe === true, atas: Array.isArray(o.atas) ? o.atas : [] }));
        setAcesso({ plataforma: d.plataforma === true, orgaos });
      }
    });
  }, [cliente]);
  useEffect(() => {
    if (!userId) return;
    setAcesso(null);
    carregarAcesso();
  }, [userId, carregarAcesso]);

  const escolher = (id: string) => {
    salvarOrgao(id);
    setEscolhido(id);
    if (!id) window.location.hash = '';
  };
  const sair = () => {
    escolher('');
    definirMarca(null);
    void cliente.auth.signOut();
  };

  const geral = acesso && 'orgaos' in acesso ? acesso : null;
  const orgao = geral?.orgaos.find((o) => o.id === escolhido) ?? (geral && !geral.plataforma && geral.orgaos.length === 1 ? geral.orgaos[0] : undefined);
  const variasOpcoes = geral ? geral.orgaos.length + (geral.plataforma ? 1 : 0) > 1 : false;
  useEffect(() => {
    definirMarca(orgao ?? null);
  }, [orgao]);

  if (sessao === undefined) {
    return (
      <TelaCentral>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      </TelaCentral>
    );
  }
  if (!sessao) return <TelaLogin cliente={cliente} titulo={PRODUTO} />;
  const email = sessao.user.email ?? '';
  if (geral) {
    if (orgao) {
      // Define a identidade antes de desenhar a tela (o useEffect acima mantém o título e as cores)
      if (marca.id !== orgao.id) definirMarca(orgao);
      return <Inicio key={orgao.id} cliente={cliente} sessao={sessao} acesso={orgao} orgao={orgao} trocarOrgao={variasOpcoes ? () => escolher('') : undefined} />;
    }
    if (geral.plataforma && (escolhido === '__plataforma' || geral.orgaos.length === 0)) {
      return (
        <div className="min-h-screen bg-gelo text-slate-900 antialiased">
          <Topo email={email} sair={sair}>
            {geral.orgaos.length > 0 && (
              <Botao tamanho="sm" icone={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => escolher('')}>
                Trocar órgão
              </Botao>
            )}
          </Topo>
          <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
            <Plataforma cliente={cliente} meuEmail={email} aoMudar={carregarAcesso} />
          </main>
        </div>
      );
    }
    if (geral.orgaos.length > 0) return <EscolherOrgao email={email} acesso={geral} escolher={escolher} sair={sair} />;
  }
  return (
    <TelaCentral>
      {!acesso && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo o acesso…
        </p>
      )}
      {acesso && 'erro' in acesso && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Sistema ainda não configurado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Rode o script <strong>supabase/saas-configurar.sql</strong> no Supabase (veja o guia). Detalhe: {acesso.erro}
          </p>
        </>
      )}
      {geral && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Acesso não liberado</h1>
          <p className="mt-2 text-sm text-slate-600">
            O e-mail <strong>{email}</strong> ainda não foi cadastrado em nenhum órgão. Peça à equipe do seu órgão para incluí-lo em Configuração da Ata › Quem tem acesso.
          </p>
        </>
      )}
      <div className="mt-5">
        <Botao icone={<LogOut className="h-4 w-4" />} onClick={sair}>
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
        <h1 className="text-base font-semibold text-slate-900">{PRODUTO}</h1>
        <p className="mt-2 text-sm text-slate-600">
          O sistema precisa do Supabase. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente da Vercel e publique de novo.
        </p>
      </TelaCentral>
    );
  }
  return <ModoPainel cliente={supabase} />;
}
