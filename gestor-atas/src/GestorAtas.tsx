import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Dispatch, HTMLAttributes, ReactNode, SetStateAction } from 'react';
import logoCremesp from './assets/logo-cremesp.png';
import iconeCremesp from './assets/icone-cremesp.png';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Download,
  FileText,
  Filter,
  Layers,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  Users,
  Cloud,
  CloudOff,
  Loader2,
  MapPin,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Unlock,
  Upload,
  User,
  Wallet,
  X,
} from 'lucide-react';

/* ============================================================================
 * Gestor de Atas e Simulador de Eventos
 * Arquivo único: tipos, dados iniciais (ARP nº 0099/2025 – REDXCORP), regras
 * de saldo, abas (Dashboard, Simulador, Ordem, Configuração) e impressão.
 * ========================================================================== */

// ---------------------------------------------------------------- Tipos

type Unidade = 'Diária 24h' | 'Diária 8h' | 'Unidade' | 'Metro²' | 'Metro linear' | 'Hora';
const UNIDADES: Unidade[] = ['Diária 24h', 'Diária 8h', 'Unidade', 'Metro²', 'Metro linear', 'Hora'];

type CorModulo = 'blue' | 'yellow' | 'cyan' | 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal' | 'orange' | 'slate' | 'fuchsia';

interface Modulo {
  id: string;
  nome: string;
  cor: CorModulo;
}

interface ItemAta {
  id: string;
  codigo: string;
  descricao: string;
  moduloId: string;
  unidade: Unidade;
  valorUnitario: number;
  qtdContratada: number;
}

interface AtaInfo {
  numero: string;
  pregao: string;
  processo: string;
  objeto: string;
  fornecedor: string;
  cnpj: string;
  enderecoFornecedor: string;
  contato: string;
  telefone: string;
  email: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  gestor: string;
  fiscal: string;
  /** Quem autoriza a ordem pelo Cremesp (assinatura) */
  coordenador: string;
  cargoCoordenador: string;
  /** Responsável técnico padrão dos eventos */
  responsavelTecnico: string;
  contratante: string;
  cnpjContratante: string;
  enderecoContratante: string;
  uasg: string;
  cidade: string;
}

type StatusEvento = 'simulacao' | 'aprovado';

interface LinhaEvento {
  qtd: number;
  diarias: number;
}

interface Evento {
  id: string;
  numero: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  local: string;
  responsavel: string;
  status: StatusEvento;
  observacoes: string;
  /** Protocolo interno do Cremesp, informado depois que o orçamento do fornecedor é recebido */
  protocolo?: string;
  orcamentoRecebidoEm?: string;
  linhas: Record<string, LinhaEvento>;
  atualizadoEm: string;
  confirmadoEm?: string;
  /** Etapa do andamento (fluxo com o fornecedor, diretoria, protocolo e pagamento) */
  etapa?: Etapa;
  /** Histórico de tudo o que aconteceu com o evento, do mais antigo para o mais novo */
  historico?: Andamento[];
}

type Etapa =
  | 'rascunho'
  | 'revisao_fornecedor'
  | 'ajuste_solicitado'
  | 'revisado_fornecedor'
  | 'aguardando_diretoria'
  | 'aprovado'
  | 'protocolado'
  | 'os_enviada'
  | 'realizado'
  | 'nota_recebida'
  | 'pagamento'
  | 'pago'
  | 'cancelado';

interface Andamento {
  id: string;
  em: string;
  por: string;
  lado: 'equipe' | 'fornecedor';
  etapa: Etapa;
  /** 'etapa' (mudança de etapa), 'mensagem', 'confirmar', 'ajuste' ou 'nota_fiscal' (respostas do fornecedor) */
  acao?: string;
  mensagem?: string;
  anexos?: Anexo[];
}

/** Arquivo guardado no Supabase Storage (bucket "anexos") */
interface Anexo {
  nome: string;
  caminho: string;
  tamanho: number;
  tipo: string;
}

type ComQuem = 'equipe' | 'fornecedor' | 'concluido';

interface InfoEtapa {
  id: Etapa;
  rotulo: string;
  /** Como a etapa aparece no portal do fornecedor */
  rotuloFornecedor: string;
  /** Texto do botão que leva a esta etapa */
  acao: string;
  com: ComQuem;
  cor: string;
}

const ETAPAS: InfoEtapa[] = [
  { id: 'rascunho', rotulo: 'Rascunho interno', rotuloFornecedor: 'Em preparação no Cremesp', acao: 'Voltar para rascunho', com: 'equipe', cor: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { id: 'revisao_fornecedor', rotulo: 'Com o fornecedor para revisar', rotuloFornecedor: 'Revisar orçamento', acao: 'Enviar ao fornecedor para revisar o orçamento', com: 'fornecedor', cor: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { id: 'ajuste_solicitado', rotulo: 'Fornecedor pediu ajuste', rotuloFornecedor: 'Ajuste solicitado, aguardando o Cremesp', acao: 'Registrar pedido de ajuste', com: 'equipe', cor: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { id: 'revisado_fornecedor', rotulo: 'Revisado pelo fornecedor', rotuloFornecedor: 'Orçamento confirmado, aguardando o Cremesp', acao: 'Marcar como revisado pelo fornecedor', com: 'equipe', cor: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { id: 'aguardando_diretoria', rotulo: 'Aguardando aprovação da diretoria', rotuloFornecedor: 'Em aprovação no Cremesp', acao: 'Enviar para aprovação da diretoria', com: 'equipe', cor: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { id: 'aprovado', rotulo: 'Aprovado', rotuloFornecedor: 'Aprovado pelo Cremesp', acao: 'Aprovar (abate do saldo da Ata)', com: 'equipe', cor: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { id: 'protocolado', rotulo: 'Protocolado', rotuloFornecedor: 'Aprovado e protocolado', acao: 'Registrar protocolo', com: 'equipe', cor: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { id: 'os_enviada', rotulo: 'Ordem de serviço enviada', rotuloFornecedor: 'Ordem de serviço emitida: executar o evento', acao: 'Enviar ordem de serviço ao fornecedor', com: 'fornecedor', cor: 'bg-teal-50 text-teal-800 ring-teal-200' },
  { id: 'realizado', rotulo: 'Evento realizado', rotuloFornecedor: 'Evento realizado: enviar a nota fiscal', acao: 'Marcar evento como realizado', com: 'fornecedor', cor: 'bg-cremesp-50 text-cremesp-800 ring-cremesp-200' },
  { id: 'nota_recebida', rotulo: 'Nota fiscal recebida', rotuloFornecedor: 'Nota fiscal recebida pelo Cremesp', acao: 'Registrar nota fiscal recebida', com: 'equipe', cor: 'bg-blue-50 text-blue-800 ring-blue-200' },
  { id: 'pagamento', rotulo: 'Nota enviada para pagamento', rotuloFornecedor: 'Nota enviada para pagamento', acao: 'Enviar nota para pagamento', com: 'equipe', cor: 'bg-indigo-50 text-indigo-800 ring-indigo-200' },
  { id: 'pago', rotulo: 'Pago', rotuloFornecedor: 'Pago', acao: 'Marcar como pago', com: 'concluido', cor: 'bg-emerald-600 text-white ring-emerald-600' },
  { id: 'cancelado', rotulo: 'Cancelado', rotuloFornecedor: 'Cancelado', acao: 'Cancelar evento', com: 'concluido', cor: 'bg-slate-100 text-slate-500 ring-slate-200' },
];

const INFO_ETAPA = new Map(ETAPAS.map((e) => [e.id, e]));
const infoEtapa = (id: Etapa): InfoEtapa => INFO_ETAPA.get(id) ?? ETAPAS[0];
const indiceEtapa = (id: Etapa) => ETAPAS.findIndex((e) => e.id === id);
/** Etapas em que o evento já está aprovado e abate o saldo da Ata */
const etapaAprovada = (id: Etapa) => id !== 'cancelado' && indiceEtapa(id) >= indiceEtapa('aprovado');

/** Etapa atual; eventos antigos (sem etapa) seguem o status */
function etapaDe(ev: Evento): Etapa {
  if (ev.etapa && INFO_ETAPA.has(ev.etapa)) return ev.etapa;
  return ev.status === 'aprovado' ? 'aprovado' : 'rascunho';
}

/** Separação em abas: solicitados (em curso), realizados e cancelados */
type GrupoEvento = 'solicitado' | 'realizado' | 'cancelado';
function grupoEvento(ev: Evento, hoje = new Date().toISOString().slice(0, 10)): GrupoEvento {
  const etapa = etapaDe(ev);
  if (etapa === 'cancelado') return 'cancelado';
  if (indiceEtapa(etapa) >= indiceEtapa('realizado')) return 'realizado';
  if (etapaAprovada(etapa) && (ev.dataFim || ev.dataInicio) && (ev.dataFim || ev.dataInicio) < hoje) return 'realizado';
  return 'solicitado';
}

/** Todos os anexos do evento, do mais novo para o mais antigo, com a etapa em que entraram */
function anexosDoEvento(ev: Evento): { a: Anexo; h: Andamento }[] {
  const out: { a: Anexo; h: Andamento }[] = [];
  for (const h of ev.historico ?? []) for (const a of h.anexos ?? []) out.push({ a, h });
  return out.reverse();
}

/** Próximo passo sugerido a partir de cada etapa */
const PROXIMA_ETAPA: Partial<Record<Etapa, Etapa>> = {
  rascunho: 'revisao_fornecedor',
  ajuste_solicitado: 'revisao_fornecedor',
  revisao_fornecedor: 'revisado_fornecedor',
  revisado_fornecedor: 'aguardando_diretoria',
  aguardando_diretoria: 'aprovado',
  aprovado: 'protocolado',
  protocolado: 'os_enviada',
  os_enviada: 'realizado',
  realizado: 'nota_recebida',
  nota_recebida: 'pagamento',
  pagamento: 'pago',
};

/** Muda a etapa, registra no histórico e mantém o status (saldo) coerente */
function patchEtapa(e: Evento, etapa: Etapa, por: string, mensagem = '', acao = 'etapa', anexos: Anexo[] = []): Partial<Evento> {
  const entrada: Andamento = { id: uid('and'), em: new Date().toISOString(), por, lado: 'equipe', etapa, acao };
  if (mensagem.trim()) entrada.mensagem = mensagem.trim();
  if (anexos.length) entrada.anexos = anexos;
  const aprovado = etapaAprovada(etapa);
  return {
    etapa,
    historico: [...(e.historico ?? []), entrada],
    status: aprovado ? 'aprovado' : 'simulacao',
    confirmadoEm: aprovado ? e.confirmadoEm ?? new Date().toISOString() : undefined,
  };
}

interface Base {
  versao: 1;
  ata: AtaInfo;
  modulos: Modulo[];
  itens: ItemAta[];
  eventos: Evento[];
}

type Aba = 'dashboard' | 'simulador' | 'ordem' | 'andamento' | 'relatorios' | 'config';

// ---------------------------------------------------------------- Cores

const CORES: Record<CorModulo, { dot: string; chip: string; bar: string }> = {
  indigo: { dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', bar: 'bg-indigo-500' },
  blue: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 ring-blue-200', bar: 'bg-blue-500' },
  yellow: { dot: 'bg-yellow-400', chip: 'bg-yellow-50 text-yellow-800 ring-yellow-200', bar: 'bg-yellow-400' },
  cyan: { dot: 'bg-cyan-500', chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200', bar: 'bg-cyan-500' },
  sky: { dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'bg-sky-500' },
  emerald: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-500' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-500' },
  rose: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-500' },
  violet: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 ring-violet-200', bar: 'bg-violet-500' },
  teal: { dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700 ring-teal-200', bar: 'bg-teal-500' },
  orange: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 ring-orange-200', bar: 'bg-orange-500' },
  slate: { dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700 ring-slate-300', bar: 'bg-slate-500' },
  fuchsia: { dot: 'bg-fuchsia-500', chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200', bar: 'bg-fuchsia-500' },
};
const LISTA_CORES = Object.keys(CORES) as CorModulo[];

// ---------------------------------------------------------------- Dados iniciais (ARP 0099/2025 – 1º Termo Aditivo)

const ATA_EXEMPLO: AtaInfo = {
  numero: 'ARP nº 0099/2025 (1º Termo Aditivo)',
  pregao: 'Pregão Eletrônico nº 90033/2025',
  processo: 'Processo Administrativo nº 0242/2025',
  objeto:
    'Registro de preços para eventual locação de equipamentos e serviços de audiovisual para estruturar os eventos realizados pelo Cremesp. Prorrogada pelo 1º Termo Aditivo por 12 meses, com preços reajustados pelo IPCA (4,223450%).',
  fornecedor: 'REDXCORP PRODUÇÃO E LOCAÇÃO LTDA',
  cnpj: '01.847.054/0001-50',
  enderecoFornecedor: 'Estrada Municipal Bela Vista, 2914, Tanquinho, Santana de Parnaíba/SP, CEP 06532-040',
  contato: 'Rodolfo de Moraes Rodrigues (Diretor / Preposto)',
  telefone: '(11) 97629-6109',
  email: 'comercial@eventox.com.br',
  vigenciaInicio: '2026-11-14',
  vigenciaFim: '2027-11-13',
  gestor: 'Carolina Gomes Marcelino',
  fiscal: 'Tatiana dos Santos',
  coordenador: 'Alexandre Kataoka',
  cargoCoordenador: 'Coordenador do Departamento de Comunicação',
  responsavelTecnico: 'John Wellington da Silva Santos',
  contratante: 'CONSELHO REGIONAL DE MEDICINA DO ESTADO DE SÃO PAULO – CREMESP',
  cnpjContratante: '63.106.843/0001-97',
  enderecoContratante: 'Rua Luís Coelho, 26, Consolação, São Paulo/SP, CEP 01309-900',
  uasg: '926310',
  cidade: 'São Paulo',
};

const MODULOS_EXEMPLO: Modulo[] = [
  { id: 'comp', nome: 'Equipamentos de Computação', cor: 'slate' },
  { id: 'estr', nome: 'Estrutura de Palco e Suporte', cor: 'amber' },
  { id: 'cabos', nome: 'Cabos', cor: 'orange' },
  { id: 'audio', nome: 'Sistema de Áudio', cor: 'sky' },
  { id: 'video', nome: 'Vídeo, Projeção e LED', cor: 'blue' },
  { id: 'ilum', nome: 'Iluminação', cor: 'yellow' },
  { id: 'plat', nome: 'Plataforma, Internet e Energia', cor: 'teal' },
  { id: 'outros', nome: 'Outros Serviços', cor: 'cyan' },
  { id: 'equipe', nome: 'Efetivo Profissional', cor: 'emerald' },
];

// [código, descrição, módulo, unidade, valor unitário, quantidade registrada]
// Valores do 1º Termo Aditivo (vigência 14/11/2026 a 13/11/2027), reajustados pelo IPCA de 4,223450%.
type ItemSeed = [string, string, string, Unidade, number, number];
const D24: Unidade = 'Diária 24h';
const D8: Unidade = 'Diária 8h';

const ITENS_SEED: ItemSeed[] = [
  ['1', 'Computador Intel Core i7 (8ª geração ou superior), 8 GB RAM dual channel, SSD/NVMe, monitor 15" ou 17", Office, leitor de PDF, antivírus, mouse e teclado ABNT', 'comp', D24, 218.87, 410],
  ['2', 'Treliça de alumínio P30, com conexões, de diversos tamanhos', 'estr', D24, 55.24, 2700],
  ['3', 'Módulo praticável / palco 2 m x 1 m x 10 a 40 cm de altura (com forração de carpete e saia)', 'estr', D24, 83.38, 950],
  ['4', 'Arquibancada em 3 níveis', 'estr', D24, 172.99, 750],
  ['5', 'Bancada para equipamentos "house mix" 130 x 180 x 80', 'estr', D24, 104.22, 200],
  ['6', 'Escada e rampa de acessibilidade', 'estr', D24, 52.11, 100],
  ['7', 'Grade guarda-corpo', 'estr', D24, 65.66, 300],
  ['8', 'Carpete vermelho ou verde', 'estr', D24, 31.27, 4500],
  ['9', 'Palco construído 2 m x 1 m x 10 a 40 cm de altura (com forração de carpete e saia)', 'estr', D24, 131.32, 110],
  ['10', 'Multicabo com medusa 16 vias, cabos e conectores XLR ou J10, seção 16 AWG', 'cabos', D24, 52.11, 180],
  ['11', 'Protetor de cabos – sistema em rampa 5 canais', 'cabos', D24, 52.11, 1100],
  ['12', 'Microfone sem fio (80 Hz–14 kHz; 8 bancos com até 12 canais; wideband FM)', 'audio', D24, 156.34, 450],
  ['13', 'Microfone gooseneck tipo conferência, unidirecional, phantom', 'audio', D24, 52.11, 50],
  ['14', 'Microfone boom', 'audio', D24, 208.45, 600],
  ['15', 'Caixa acústica ativa (low 15", high 1", 80 Hz–22 kHz), com pedestal e cabo', 'audio', D24, 104.22, 400],
  ['16', 'Mesa de som digital mínimo 32 canais, entrada mic/line, EQ 5 bandas, 2 subgrupos', 'audio', D24, 312.67, 50],
  ['17', 'Rádio intercomunicador sem fio, 6 pontos', 'audio', D24, 52.11, 130],
  ['18', 'Tribuna eletrônica com monitor de 40" na vertical para exibição de conteúdo', 'video', D24, 312.67, 100],
  ['19', 'Tela de projeção branca com estrutura de treliça para sustentação', 'video', D24, 104.22, 110],
  ['20', 'Projetor multimídia 5.000 ANSI lumens Full HD, com suporte, tela, instalação e cabos AC e HDMI', 'video', D24, 364.78, 30],
  ['21', 'TV LED 32" com controle remoto, suporte alto, instalação e cabos AC e HDMI', 'video', D24, 166.76, 100],
  ['22', 'TV LED 60" com controle remoto, suporte alto, instalação e cabos AC e HDMI', 'video', D24, 416.89, 120],
  ['23', 'Switch de vídeo mínimo 8 entradas HDMI/SDI, mix de áudio, PiP, preview e PGM', 'video', D24, 104.22, 160],
  ['24', 'Filmadora Full HD com lente, carregador, baterias, cartão 256 GB, cabeamento e A/C', 'video', D24, 312.67, 250],
  ['25', 'Filmadora com gimbal – gravação e emissão de sinal para painéis de LED, captação em movimento', 'video', D24, 521.12, 250],
  ['26', 'Equipamentos de movimento de câmera', 'video', D24, 208.45, 100],
  ['27', 'Sistema sem fio de transmissão sem delay', 'video', D24, 312.67, 220],
  ['28', 'Placas de painel de LED 0,50 x 1,00 m sem bordas, pitch 1,5 mm, contraste 5.000:1, 3.840 Hz (montagem/diária)', 'video', D24, 208.45, 2200],
  ['29', 'Painel de LED tamanho mínimo 2,5 m x 10 m, com computadores compatíveis para projeção', 'video', D24, 1042.23, 130],
  ['30', 'Painel de LED tamanho mínimo 2,5 m x 6 m, com computadores compatíveis para projeção', 'video', D24, 2084.47, 130],
  ['31', 'Painel de LED tamanho mínimo 2,5 m x 3 m, com computadores compatíveis para projeção', 'video', D24, 2084.47, 130],
  ['32', 'Sistema de corte de câmeras broadcast, mínimo 6 inputs e 4 outputs (HDMI, SDI)', 'video', D24, 312.67, 150],
  ['33', 'Impressora Argox com jogo de 200 etiquetas', 'video', D24, 262.64, 90],
  ['34', 'Refletor de iluminação para filmagem com tripé (sungun LED bi-color, set light 500 W)', 'ilum', D24, 131.32, 600],
  ['35', 'Moving de LED 100 W com prisma rotativo, DMX, master dimmer', 'ilum', D24, 260.56, 730],
  ['36', 'Mesa de luz computadorizada DMX 512 – 48/96 canais', 'ilum', D24, 156.34, 400],
  ['37', 'Canhão seguidor', 'ilum', D24, 260.56, 60],
  ['38', 'Spot de luz direcional mínimo 250 W', 'ilum', D24, 65.66, 180],
  ['39', 'Luminária HQI 150 W, cor branca e/ou preta, com instalação', 'ilum', D24, 104.22, 2000],
  ['40', 'Ponto de iluminação decorativa', 'ilum', D24, 52.11, 1100],
  ['41', 'Plataforma de streaming com logomarca personalizada, layout de reunião online e interações remotas em tempo real', 'plat', D24, 729.56, 50],
  ['42', 'Transmissão de vídeo streaming (YouTube, Vimeo, Zoom ou Facebook), com testes, layout e logomarca', 'plat', D24, 1042.23, 50],
  ['43', 'Ponto de internet – link dedicado mínimo 50 Mbps (up/down), instalação e cabeamento incluídos', 'plat', D24, 521.12, 50],
  ['44', 'Internet Wi-Fi – infraestrutura para até 100 acessos simultâneos (mínimo 10 Mbps)', 'plat', D24, 521.12, 30],
  ['45', 'Gerador silenciado 180 kVA a diesel, com 50 m de cabos antichamas e materiais de segurança', 'plat', D24, 3126.70, 30],
  ['46', 'Gerenciamento de armazenamento em nuvem para vídeos Full HD, até 5 TB (5 horas por evento)', 'plat', D24, 521.12, 130],
  ['47', 'Gerador em standby 180 kVA a diesel, inclui cabos', 'plat', D24, 2918.26, 50],
  ['48', 'Pesquisa interativa (locação de 50 aparelhos, software de pesquisa e operador)', 'plat', D24, 1969.82, 220],
  ['49', 'Passador de slide', 'outros', D24, 52.11, 100],
  ['50', 'Backup de gravação MP4 1080p 30 fps, cópias em HD externo ou USB', 'outros', D24, 262.64, 50],
  ['51', 'Manutenção técnica on-site – suporte de áudio, vídeo, iluminação e internet', 'outros', D24, 590.95, 560],
  ['52', 'Customizações de software (streaming, logomarca, integração de plataformas)', 'outros', D24, 521.12, 50],
  ['53', 'Diretor Técnico Geral – coordenação geral do evento, supervisão de sinais', 'equipe', D8, 521.12, 250],
  ['54', 'Coordenador de Transmissão/Streaming – fluxos de vídeo e áudio', 'equipe', D8, 521.12, 250],
  ['55', 'Operador de Câmera 1 (fixa – palestrante)', 'equipe', D8, 521.12, 250],
  ['56', 'Operador de Câmera 2 (fixa – plano aberto)', 'equipe', D8, 521.12, 250],
  ['57', 'Fotógrafo – captação de fotos still do evento', 'equipe', D8, 521.12, 250],
  ['58', 'Operador de Câmera 3 (móvel) – inserts, entrevistas e movimentações', 'equipe', D8, 521.12, 250],
  ['59', 'Assistente de Câmera – baterias, gimbal, sinal sem fio', 'equipe', D8, 521.12, 250],
  ['60', 'Iluminador Cênico – montagem e operação do sistema de iluminação', 'equipe', D8, 521.12, 250],
  ['61', 'Técnico de Rigging – avaliação e montagem suspensa (spots e grid)', 'equipe', D8, 521.12, 250],
  ['62', 'Intérprete de Libras – interpretação simultânea', 'equipe', D8, 521.12, 250],
  ['63', 'Operador de Som (Housemix) – microfones e caixas de som', 'equipe', D8, 521.12, 250],
  ['64', 'Técnico de Microfones – distribuição, baterias e frequências', 'equipe', D8, 521.12, 250],
  ['65', 'Operador de Mesa de Corte – corte ao vivo e gravação PGM', 'equipe', D8, 521.12, 250],
  ['66', 'Operador de Streaming (vMix) – transmissão e gravação', 'equipe', D8, 521.12, 250],
  ['67', 'Operador Resolume – conteúdo do LED e envio de sinal', 'equipe', D8, 521.12, 250],
  ['68', 'Técnico de QA / Timer – timer e alertas para TV e palco', 'equipe', D8, 521.12, 250],
  ['69', 'Operador de Conteúdo 1 – apresentações, vídeos e gráficos', 'equipe', D8, 521.12, 250],
  ['70', 'Operador de Conteúdo 2 / Chamadas remotas', 'equipe', D8, 521.12, 250],
  ['71', 'Técnico de Rede (TI) – internet dedicada, Wi-Fi público, rede gerenciada', 'equipe', D8, 521.12, 250],
  ['72', 'Técnico NDI / Backup de Rede – switch, NDI, redundâncias', 'equipe', D8, 521.12, 250],
  ['73', 'Técnico de Montagem Audiovisual – montagem física e passagem de cabos', 'equipe', D8, 521.12, 250],
  ['74', 'Técnico de Segurança Estrutural – aprovação de estruturas suspensas', 'equipe', D8, 521.12, 250],
  ['75', 'Operador de Sala VIP / Media Desk – suporte aos palestrantes', 'equipe', D8, 521.12, 250],
  ['76', 'Contrarregra / Produtor de Set – palco e bastidores', 'equipe', D8, 521.12, 250],
  ['77', 'Técnico de Intercomunicação – instalação e operação do intercom', 'equipe', D8, 521.12, 250],
];

const idItem = (codigo: string) => `i${codigo}`;

// Ata real pronta para uso: itens e preços do termo aditivo, sem eventos.
function criarBaseExemplo(): Base {
  const itens: ItemAta[] = ITENS_SEED.map(([codigo, descricao, moduloId, unidade, valorUnitario, qtdContratada]) => ({
    id: idItem(codigo),
    codigo,
    descricao,
    moduloId,
    unidade,
    valorUnitario,
    qtdContratada,
  }));
  return { versao: 1, ata: { ...ATA_EXEMPLO }, modulos: MODULOS_EXEMPLO.map((m) => ({ ...m })), itens, eventos: [] };
}

function criarBaseVazia(): Base {
  return {
    versao: 1,
    ata: {
      ...ATA_EXEMPLO,
      numero: '',
      pregao: '',
      processo: '',
      objeto: '',
      fornecedor: '',
      cnpj: '',
      enderecoFornecedor: '',
      contato: '',
      telefone: '',
      email: '',
      vigenciaInicio: '',
      vigenciaFim: '',
      gestor: '',
      fiscal: '',
    },
    modulos: [],
    itens: [],
    eventos: [],
  };
}

// ---------------------------------------------------------------- Utilitários

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const brl = (v: number) => fmtBRL.format(Number.isFinite(v) ? v : 0);
const num = (v: number) => fmtNum.format(Number.isFinite(v) ? v : 0);
const pct = (v: number, casas = 1) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

function fmtData(iso: string): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function periodo(ev: Pick<Evento, 'dataInicio' | 'dataFim'>): string {
  if (!ev.dataInicio) return 'Data a definir';
  if (!ev.dataFim || ev.dataFim === ev.dataInicio) return fmtData(ev.dataInicio);
  return `${fmtData(ev.dataInicio)} a ${fmtData(ev.dataFim)}`;
}

function diasEntre(inicio: string, fim: string): number {
  if (!inicio) return 1;
  const a = Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10));
  const fimReal = fim || inicio;
  const b = Date.UTC(+fimReal.slice(0, 4), +fimReal.slice(5, 7) - 1, +fimReal.slice(8, 10));
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataPorExtenso(iso: string): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const [a, m, d] = iso.split('-');
  return `${Number(d)} de ${meses[Number(m) - 1]} de ${a}`;
}

const UNID = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c) partes.push(CEN[c]);
  if (r > 0 && r < 20) partes.push(UNID[r]);
  else if (r >= 20) partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNID[r % 10]}` : ''));
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const bilhoes = Math.floor(n / 1e9);
  const milhoes = Math.floor((n % 1e9) / 1e6);
  const milhares = Math.floor((n % 1e6) / 1e3);
  const unidades = n % 1e3;
  const grupos: { v: number; txt: string }[] = [];
  if (bilhoes) grupos.push({ v: bilhoes, txt: `${ate999(bilhoes)} ${bilhoes === 1 ? 'bilhão' : 'bilhões'}` });
  if (milhoes) grupos.push({ v: milhoes, txt: `${ate999(milhoes)} ${milhoes === 1 ? 'milhão' : 'milhões'}` });
  if (milhares) grupos.push({ v: milhares, txt: milhares === 1 ? 'mil' : `${ate999(milhares)} mil` });
  if (unidades) grupos.push({ v: unidades, txt: ate999(unidades) });
  return grupos
    .map((g, i) => {
      if (i === 0) return g.txt;
      const ultimo = i === grupos.length - 1;
      const usaE = ultimo && (g.v < 100 || g.v % 100 === 0);
      return `${usaE ? ' e ' : ' '}${g.txt}`;
    })
    .join('');
}

function valorPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.max(0, valor) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const txt = inteiroPorExtenso(reais);
    const exatoMilhao = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${txt}${exatoMilhao ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${ate999(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (partes.length === 0) return 'zero real';
  return partes.join(' e ');
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function consumoLinha(l: LinhaEvento): number {
  return Math.max(0, l.qtd || 0) * Math.max(0, l.diarias || 0);
}

type Nivel = 'ok' | 'atencao' | 'critico' | 'esgotado';
function nivelSaldo(restante: number, contratada: number): Nivel {
  if (contratada <= 0) return 'esgotado';
  if (restante <= 0) return 'esgotado';
  const p = restante / contratada;
  if (p < 0.1) return 'critico';
  if (p < 0.25) return 'atencao';
  return 'ok';
}
const ESTILO_NIVEL: Record<Nivel, { barra: string; texto: string; chip: string; rotulo: string }> = {
  ok: { barra: 'bg-emerald-500', texto: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', rotulo: 'Folgado' },
  atencao: { barra: 'bg-amber-400', texto: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 ring-amber-200', rotulo: 'Atenção' },
  critico: { barra: 'bg-rose-500', texto: 'text-rose-700', chip: 'bg-rose-50 text-rose-700 ring-rose-200', rotulo: 'Crítico' },
  esgotado: { barra: 'bg-rose-600', texto: 'text-rose-700', chip: 'bg-rose-100 text-rose-800 ring-rose-300', rotulo: 'Esgotado' },
};

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* tenta o método alternativo abaixo */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Persistência

const CHAVE_STORAGE = 'gestor-atas-cremesp:v3';
const LIMITE_ANEXO = 20 * 1024 * 1024;

// Garante que backups antigos tenham todos os campos atuais da Ata
function normalizarBase(b: Base): Base {
  const vazia = criarBaseVazia().ata;
  return { ...b, ata: { ...vazia, ...b.ata } };
}

function carregarBase(): Base {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (bruto) {
      const b = JSON.parse(bruto) as Base;
      if (b && b.versao === 1 && Array.isArray(b.itens) && Array.isArray(b.eventos)) return normalizarBase(b);
    }
  } catch {
    /* sem armazenamento disponível: usa dados de exemplo */
  }
  return criarBaseExemplo();
}

function proximoNumeroOS(eventos: Evento[]): string {
  const ano = new Date().getFullYear();
  let max = 0;
  for (const e of eventos) {
    const [seq, a] = e.numero.split('/');
    if (Number(a) === ano) max = Math.max(max, Number(seq) || 0);
  }
  return `${String(max + 1).padStart(3, '0')}/${ano}`;
}

// ---------------------------------------------------------------- Cálculos de saldo

interface Uso {
  consumido: number;
  simulacao: number;
}

function calcularUsoPorEvento(eventos: Evento[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const ev of eventos) {
    const porItem = new Map<string, number>();
    for (const [itemId, l] of Object.entries(ev.linhas)) {
      const c = consumoLinha(l);
      if (c > 0) porItem.set(itemId, c);
    }
    m.set(ev.id, porItem);
  }
  return m;
}

function calcularUsoTotal(eventos: Evento[], usoPorEvento: Map<string, Map<string, number>>): Map<string, Uso> {
  const total = new Map<string, Uso>();
  for (const ev of eventos) {
    const porItem = usoPorEvento.get(ev.id);
    if (!porItem || etapaDe(ev) === 'cancelado') continue;
    for (const [itemId, c] of porItem) {
      const u = total.get(itemId) ?? { consumido: 0, simulacao: 0 };
      if (ev.status === 'aprovado') u.consumido += c;
      else u.simulacao += c;
      total.set(itemId, u);
    }
  }
  return total;
}

function totalEvento(ev: Evento, itensPorId: Map<string, ItemAta>): number {
  let t = 0;
  for (const [itemId, l] of Object.entries(ev.linhas)) {
    const it = itensPorId.get(itemId);
    if (it) t += consumoLinha(l) * it.valorUnitario;
  }
  return t;
}

// ---------------------------------------------------------------- Componentes de interface

function Card({ children, className = '', ...resto }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement> & { 'data-print-hide'?: boolean }) {
  return (
    <div {...resto} className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ titulo, subtitulo, icone, acoes }: { titulo: string; subtitulo?: string; icone?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {icone && <div className="mt-0.5 rounded-lg bg-cremesp-50 p-2 text-cremesp-700">{icone}</div>}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

type VarianteBotao = 'primario' | 'secundario' | 'perigo' | 'sucesso' | 'fantasma';
function Botao({
  children,
  onClick,
  variante = 'secundario',
  icone,
  disabled,
  title,
  className = '',
  tamanho = 'md',
}: {
  children?: ReactNode;
  onClick?: () => void;
  variante?: VarianteBotao;
  icone?: ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
  tamanho?: 'sm' | 'md';
}) {
  const estilos: Record<VarianteBotao, string> = {
    primario: 'bg-cremesp-700 text-white hover:bg-cremesp-800 shadow-sm',
    secundario: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    perigo: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
    sucesso: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    fantasma: 'text-slate-600 hover:bg-slate-100',
  };
  const tam = tamanho === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tam} ${estilos[variante]} ${className}`}
    >
      {icone}
      {children}
    </button>
  );
}

function Campo({ rotulo, children, className = '' }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{rotulo}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cremesp-500 focus:outline-none focus:ring-2 focus:ring-cremesp-500/20 disabled:bg-slate-50 disabled:text-slate-500';
const inputSmCls =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-cremesp-500 focus:outline-none focus:ring-2 focus:ring-cremesp-500/20 disabled:bg-slate-50 disabled:text-slate-500';

function NumeroInput({
  valor,
  onChange,
  min = 0,
  step = 1,
  disabled,
  className = '',
  erro,
  ariaLabel,
}: {
  valor: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  erro?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      value={Number.isFinite(valor) && valor !== 0 ? valor : valor === 0 ? '' : ''}
      placeholder="0"
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value === '' ? 0 : Number(e.target.value);
        onChange(Number.isFinite(v) ? Math.max(min, v) : 0);
      }}
      className={`${inputSmCls} text-right tabular-nums ${erro ? 'border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
    />
  );
}

function BarraProgresso({ consumido, simulacao, total, nivel }: { consumido: number; simulacao: number; total: number; nivel: Nivel }) {
  const pc = total > 0 ? Math.min(100, (consumido / total) * 100) : 0;
  const ps = total > 0 ? Math.min(100 - pc, (simulacao / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" title={`Consumido ${pct(pc)} · Em simulação ${pct(ps)}`}>
      <div className="flex h-full">
        <div className={`${ESTILO_NIVEL[nivel].barra} h-full`} style={{ width: `${pc}%` }} />
        <div className="h-full bg-cremesp-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.5)_3px,rgba(255,255,255,.5)_6px)]" style={{ width: `${ps}%` }} />
      </div>
    </div>
  );
}

function ChipModulo({ modulo }: { modulo?: Modulo }) {
  if (!modulo) return <span className="text-xs text-slate-400">Sem módulo</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CORES[modulo.cor].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${CORES[modulo.cor].dot}`} />
      {modulo.nome}
    </span>
  );
}

function EtapaBadge({ etapa, fornecedor = false }: { etapa: Etapa; fornecedor?: boolean }) {
  const e = infoEtapa(etapa);
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${e.cor}`}>
      {fornecedor ? e.rotuloFornecedor : e.rotulo}
    </span>
  );
}

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function tamanhoArquivo(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function ListaAnexos({ anexos, abrir }: { anexos: Anexo[]; abrir?: (a: Anexo) => void }) {
  if (anexos.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-2">
      {anexos.map((a) => (
        <li key={a.caminho}>
          <button
            type="button"
            onClick={() => abrir?.(a)}
            disabled={!abrir}
            className="inline-flex max-w-[280px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-cremesp-300 hover:bg-cremesp-50 disabled:cursor-default disabled:hover:bg-white"
            title={abrir ? `Abrir ${a.nome}` : a.nome}
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{a.nome}</span>
            <span className="shrink-0 text-slate-400">{tamanhoArquivo(a.tamanho)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Escolha de arquivos para anexar (envio acontece ao registrar) */
function SeletorAnexos({ arquivos, setArquivos, disabled, rotulo = 'Anexar arquivos' }: { arquivos: File[]; setArquivos: (f: File[]) => void; disabled?: boolean; rotulo?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const novos = Array.from(e.target.files ?? []);
          setArquivos([...arquivos, ...novos].slice(0, 10));
          e.target.value = '';
        }}
      />
      <Botao tamanho="sm" icone={<Paperclip className="h-3.5 w-3.5" />} onClick={() => ref.current?.click()} disabled={disabled}>
        {rotulo}
      </Botao>
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
              <span className="flex min-w-0 items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <span className={`shrink-0 ${f.size > LIMITE_ANEXO ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{tamanhoArquivo(f.size)}</span>
              </span>
              <button type="button" className="rounded p-0.5 text-slate-400 hover:text-rose-600" onClick={() => setArquivos(arquivos.filter((_, k) => k !== i))} aria-label={`Remover ${f.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaDoTempo({ historico, fornecedor = false, abrir }: { historico: Andamento[]; fornecedor?: boolean; abrir?: (a: Anexo) => void }) {
  if (historico.length === 0) return <p className="text-sm text-slate-500">Nenhum andamento registrado ainda.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {[...historico].reverse().map((h) => {
        const doFornecedor = h.lado === 'fornecedor';
        const titulo =
          h.acao === 'mensagem'
            ? doFornecedor
              ? 'Mensagem do fornecedor'
              : 'Mensagem do Cremesp'
            : h.acao === 'confirmar'
              ? 'Fornecedor confirmou o orçamento'
              : h.acao === 'ajuste'
                ? 'Fornecedor pediu ajuste'
                : h.acao === 'nota_fiscal'
                  ? 'Fornecedor enviou a nota fiscal'
                  : fornecedor
                    ? infoEtapa(h.etapa).rotuloFornecedor
                    : infoEtapa(h.etapa).rotulo;
        return (
          <li key={h.id} className="relative">
            <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${doFornecedor ? 'bg-amber-500' : 'bg-cremesp-600'}`} />
            <p className="text-sm font-medium text-slate-900">{titulo}</p>
            <p className="text-xs text-slate-500">
              {fmtDataHora(h.em)} · {doFornecedor ? 'Fornecedor' : 'Cremesp'}
              {h.por && !fornecedor ? ` (${h.por})` : ''}
            </p>
            {h.mensagem && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{h.mensagem}</p>}
            <ListaAnexos anexos={h.anexos ?? []} abrir={abrir} />
          </li>
        );
      })}
    </ol>
  );
}

interface DialogoConfig {
  titulo: string;
  mensagem: ReactNode;
  confirmar: string;
  variante?: 'primario' | 'perigo' | 'sucesso';
  aoConfirmar: () => void;
}

function Dialogo({ config, fechar }: { config: DialogoConfig | null; fechar: () => void }) {
  if (!config) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={fechar} data-print-hide>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{config.titulo}</h3>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={fechar} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-slate-600">{config.mensagem}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao
            variante={config.variante === 'perigo' ? 'perigo' : config.variante === 'sucesso' ? 'sucesso' : 'primario'}
            onClick={() => {
              config.aoConfirmar();
              fechar();
            }}
          >
            {config.confirmar}
          </Botao>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Aplicação

function AppGestor({
  base,
  setBase,
  compartilhado = false,
  painelConta,
  painelEquipe,
  usuario = 'Equipe',
  cliente = null,
}: {
  base: Base;
  setBase: Dispatch<SetStateAction<Base>>;
  compartilhado?: boolean;
  painelConta?: ReactNode;
  painelEquipe?: ReactNode;
  usuario?: string;
  cliente?: SupabaseClient | null;
}) {
  const [aba, setAba] = useState<Aba>('dashboard');
  const [eventoSelId, setEventoSelId] = useState<string>(() => {
    const b = base;
    return (b.eventos.find((e) => e.status === 'simulacao') ?? b.eventos[0])?.id ?? '';
  });
  const [toast, setToast] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
  const [dialogo, setDialogo] = useState<DialogoConfig | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const avisar = (texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ texto, tipo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const { ata, modulos, itens, eventos } = base;
  const itensPorId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const modulosPorId = useMemo(() => new Map(modulos.map((m) => [m.id, m])), [modulos]);
  const usoPorEvento = useMemo(() => calcularUsoPorEvento(eventos), [eventos]);
  const usoTotal = useMemo(() => calcularUsoTotal(eventos, usoPorEvento), [eventos, usoPorEvento]);

  const financeiro = useMemo(() => {
    let total = 0;
    let utilizado = 0;
    let simulacao = 0;
    for (const it of itens) {
      total += it.valorUnitario * it.qtdContratada;
      const u = usoTotal.get(it.id);
      if (u) {
        utilizado += u.consumido * it.valorUnitario;
        simulacao += u.simulacao * it.valorUnitario;
      }
    }
    return { total, utilizado, simulacao, restante: total - utilizado };
  }, [itens, usoTotal]);

  const eventoSel = eventos.find((e) => e.id === eventoSelId) ?? null;

  // ----- mutações
  const atualizarEvento = (id: string, patch: Partial<Evento> | ((e: Evento) => Partial<Evento>)) =>
    setBase((b) => ({
      ...b,
      eventos: b.eventos.map((e) =>
        e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch), atualizadoEm: new Date().toISOString() } : e,
      ),
    }));

  const novoEvento = (copiaDe?: Evento) => {
    const hoje = hojeISO();
    const ev: Evento = copiaDe
      ? {
          ...copiaDe,
          id: uid('ev'),
          numero: proximoNumeroOS(eventos),
          nome: `${copiaDe.nome} (cópia)`,
          status: 'simulacao',
          confirmadoEm: undefined,
          protocolo: '',
          orcamentoRecebidoEm: '',
          linhas: JSON.parse(JSON.stringify(copiaDe.linhas)) as Record<string, LinhaEvento>,
          atualizadoEm: new Date().toISOString(),
        }
      : {
          id: uid('ev'),
          numero: proximoNumeroOS(eventos),
          nome: 'Novo evento',
          dataInicio: hoje,
          dataFim: hoje,
          local: '',
          responsavel: ata.responsavelTecnico || '',
          status: 'simulacao',
          observacoes: '',
          linhas: {},
          atualizadoEm: new Date().toISOString(),
        };
    setBase((b) => ({ ...b, eventos: [...b.eventos, ev] }));
    setEventoSelId(ev.id);
    setAba('simulador');
    avisar(copiaDe ? 'Evento duplicado como nova simulação.' : 'Nova simulação criada.');
  };

  const excluirEvento = (ev: Evento) =>
    setDialogo({
      titulo: 'Excluir evento?',
      mensagem: (
        <>
          <p>
            O evento <strong>{ev.nome}</strong> será excluído.
            {ev.status === 'aprovado' && ' Como ele está aprovado, as quantidades voltam a ficar disponíveis no saldo da Ata.'}
          </p>
          <p className="mt-2">Essa ação não pode ser desfeita.</p>
        </>
      ),
      confirmar: 'Excluir evento',
      variante: 'perigo',
      aoConfirmar: () => {
        setBase((b) => {
          const restantes = b.eventos.filter((e) => e.id !== ev.id);
          setEventoSelId(restantes[restantes.length - 1]?.id ?? '');
          return { ...b, eventos: restantes };
        });
        avisar('Evento excluído.');
      },
    });

  const irParaEvento = (id: string, destino: Aba) => {
    setEventoSelId(id);
    setAba(destino);
  };

  const ABAS: { id: Aba; rotulo: string; curto: string; icone: ReactNode }[] = [
    { id: 'dashboard', rotulo: 'Dashboard & Saldos', curto: 'Saldos', icone: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'simulador', rotulo: 'Simulador de Evento', curto: 'Simulador', icone: <Layers className="h-4 w-4" /> },
    { id: 'ordem', rotulo: 'Ordem de Orçamento', curto: 'Ordem', icone: <FileText className="h-4 w-4" /> },
    { id: 'andamento', rotulo: 'Eventos e andamento', curto: 'Eventos', icone: <ListChecks className="h-4 w-4" /> },
    { id: 'relatorios', rotulo: 'Relatórios', curto: 'Relatórios', icone: <BarChart3 className="h-4 w-4" /> },
    { id: 'config', rotulo: 'Configuração da Ata', curto: 'Config.', icone: <Settings className="h-4 w-4" /> },
  ];

  const diasVigencia = ata.vigenciaFim ? diasEntre(hojeISO(), ata.vigenciaFim) - 1 : null;
  const vigenciaVencida = ata.vigenciaFim ? ata.vigenciaFim < hojeISO() : false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <style>{CSS_IMPRESSAO}</style>

      {/* Barra lateral (desktop) */}
      <aside data-print-hide className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <img src={iconeCremesp} alt="Cremesp" className="h-10 w-10" />
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-900">Gestor de Atas</p>
            <p className="text-xs text-slate-500">Simulador de Eventos</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                aba === a.id ? 'bg-cremesp-50 text-cremesp-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={aba === a.id ? 'text-cremesp-700' : 'text-slate-400'}>{a.icone}</span>
              {a.rotulo}
            </button>
          ))}
        </nav>
        {painelConta && <div className="mx-3">{painelConta}</div>}
        <div className="m-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          <p className="font-semibold text-slate-800">{ata.numero || 'Ata sem número'}</p>
          <p className="mt-0.5 line-clamp-2 text-slate-500">{ata.fornecedor || 'Fornecedor não informado'}</p>
          {ata.vigenciaFim && (
            <p className={`mt-2 flex items-center gap-1 font-medium ${vigenciaVencida ? 'text-rose-700' : diasVigencia !== null && diasVigencia <= 30 ? 'text-amber-700' : 'text-slate-600'}`}>
              <CalendarDays className="h-3.5 w-3.5" />
              {vigenciaVencida ? 'Vigência encerrada' : `Vigência até ${fmtData(ata.vigenciaFim)}`}
            </p>
          )}
          <div className="mt-2">
            <div className="mb-1 flex justify-between text-slate-500">
              <span>Saldo financeiro</span>
              <span className="font-medium text-slate-700">{pct(financeiro.total ? (financeiro.restante / financeiro.total) * 100 : 0, 0)}</span>
            </div>
            <BarraProgresso
              consumido={financeiro.utilizado}
              simulacao={financeiro.simulacao}
              total={financeiro.total}
              nivel={nivelSaldo(financeiro.restante, financeiro.total)}
            />
          </div>
        </div>
      </aside>

      {/* Barra superior (celular/tablet) */}
      <header data-print-hide className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <img src={iconeCremesp} alt="Cremesp" className="h-8 w-8" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Gestor de Atas</p>
            <p className="truncate text-xs text-slate-500">{ata.numero} · {ata.fornecedor}</p>
          </div>
        </div>
        {painelConta && <div className="px-4 pb-2">{painelConta}</div>}
        <nav className="grid grid-cols-6 border-t border-slate-100">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${aba === a.id ? 'text-cremesp-700' : 'text-slate-500'}`}
            >
              {a.icone}
              {a.curto}
            </button>
          ))}
        </nav>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          {aba === 'dashboard' && (
            <DashboardAba
              ata={ata}
              itens={itens}
              modulos={modulos}
              modulosPorId={modulosPorId}
              eventos={eventos}
              usoTotal={usoTotal}
              itensPorId={itensPorId}
              financeiro={financeiro}
              diasVigencia={diasVigencia}
              vigenciaVencida={vigenciaVencida}
              irParaEvento={irParaEvento}
              novoEvento={() => novoEvento()}
            />
          )}
          {aba === 'simulador' && (
            <SimuladorAba
              ata={ata}
              eventos={eventos}
              evento={eventoSel}
              itens={itens}
              modulos={modulos}
              modulosPorId={modulosPorId}
              itensPorId={itensPorId}
              usoTotal={usoTotal}
              usoPorEvento={usoPorEvento}
              financeiro={financeiro}
              selecionar={setEventoSelId}
              atualizar={atualizarEvento}
              novoEvento={novoEvento}
              excluirEvento={excluirEvento}
              irParaOrdem={(id) => irParaEvento(id, 'ordem')}
              irParaAndamento={(id) => irParaEvento(id, 'andamento')}
              usuario={usuario}
              avisar={avisar}
              abrirDialogo={setDialogo}
            />
          )}
          {aba === 'andamento' && (
            <AndamentoAba
              ata={ata}
              eventos={eventos}
              evento={eventoSel}
              itensPorId={itensPorId}
              usoTotal={usoTotal}
              usoPorEvento={usoPorEvento}
              selecionar={setEventoSelId}
              atualizar={atualizarEvento}
              usuario={usuario}
              compartilhado={compartilhado}
              avisar={avisar}
              abrirDialogo={setDialogo}
              irParaEvento={irParaEvento}
              cliente={cliente}
            />
          )}
          {aba === 'ordem' && (
            <OrdemAba
              ata={ata}
              eventos={eventos}
              evento={eventoSel}
              modulos={modulos}
              itensPorId={itensPorId}
              selecionar={setEventoSelId}
              atualizar={atualizarEvento}
              avisar={avisar}
              irParaSimulador={() => setAba('simulador')}
            />
          )}
          {aba === 'relatorios' && (
            <RelatoriosAba
              ata={ata}
              eventos={eventos}
              modulos={modulos}
              itensPorId={itensPorId}
              financeiro={financeiro}
              irParaEvento={irParaEvento}
            />
          )}
          {aba === 'config' && (
            <ConfigAba
              base={base}
              setBase={setBase}
              usoTotal={usoTotal}
              avisar={avisar}
              abrirDialogo={setDialogo}
              compartilhado={compartilhado}
              painelEquipe={painelEquipe}
              aoRestaurar={(b) => setEventoSelId((b.eventos.find((e) => e.status === 'simulacao') ?? b.eventos[0])?.id ?? '')}
            />
          )}
        </div>
      </main>

      {toast && (
        <div data-print-hide className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
              toast.tipo === 'ok' ? 'bg-slate-900 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.tipo === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {toast.texto}
          </div>
        </div>
      )}
      <Dialogo config={dialogo} fechar={() => setDialogo(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- Aba: Dashboard

interface Financeiro {
  total: number;
  utilizado: number;
  simulacao: number;
  restante: number;
}

function Kpi({ titulo, valor, detalhe, icone, destaque }: { titulo: string; valor: string; detalhe?: ReactNode; icone: ReactNode; destaque?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
        <div className={`rounded-lg p-2 ${destaque ?? 'bg-slate-100 text-slate-600'}`}>{icone}</div>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{valor}</p>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </Card>
  );
}

function DashboardAba({
  ata,
  itens,
  modulos,
  modulosPorId,
  eventos,
  usoTotal,
  itensPorId,
  financeiro,
  diasVigencia,
  vigenciaVencida,
  irParaEvento,
  novoEvento,
}: {
  ata: AtaInfo;
  itens: ItemAta[];
  modulos: Modulo[];
  modulosPorId: Map<string, Modulo>;
  eventos: Evento[];
  usoTotal: Map<string, Uso>;
  itensPorId: Map<string, ItemAta>;
  financeiro: Financeiro;
  diasVigencia: number | null;
  vigenciaVencida: boolean;
  irParaEvento: (id: string, destino: Aba) => void;
  novoEvento: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [soCriticos, setSoCriticos] = useState(false);
  const [soUsados, setSoUsados] = useState(false);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .map((it) => {
        const u = usoTotal.get(it.id) ?? { consumido: 0, simulacao: 0 };
        const restante = it.qtdContratada - u.consumido;
        const livre = restante - u.simulacao;
        const pctRestante = it.qtdContratada > 0 ? (restante / it.qtdContratada) * 100 : 0;
        const pctConsumo = it.qtdContratada > 0 ? (u.consumido / it.qtdContratada) * 100 : 0;
        return { it, ...u, restante, livre, pctRestante, pctConsumo, nivel: nivelSaldo(restante, it.qtdContratada) };
      })
      .filter((l) => filtroModulo === 'todos' || l.it.moduloId === filtroModulo)
      .filter((l) => !soCriticos || l.pctRestante < 20)
      .filter((l) => !soUsados || l.consumido > 0 || l.simulacao > 0)
      .filter((l) => !termo || `${l.it.codigo} ${l.it.descricao}`.toLowerCase().includes(termo));
  }, [itens, usoTotal, busca, filtroModulo, soCriticos, soUsados]);

  const qtdCriticos = useMemo(
    () => itens.filter((it) => it.qtdContratada > 0 && ((it.qtdContratada - (usoTotal.get(it.id)?.consumido ?? 0)) / it.qtdContratada) * 100 < 20).length,
    [itens, usoTotal],
  );

  const porModulo = useMemo(
    () =>
      modulos.map((m) => {
        let total = 0;
        let consumido = 0;
        let simulacao = 0;
        let n = 0;
        for (const it of itens) {
          if (it.moduloId !== m.id) continue;
          n++;
          total += it.valorUnitario * it.qtdContratada;
          const u = usoTotal.get(it.id);
          if (u) {
            consumido += u.consumido * it.valorUnitario;
            simulacao += u.simulacao * it.valorUnitario;
          }
        }
        return { m, total, consumido, simulacao, n };
      }),
    [modulos, itens, usoTotal],
  );

  const eventosOrdenados = useMemo(() => [...eventos].sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || '')), [eventos]);
  const qtdSim = eventos.filter((e) => e.status === 'simulacao' && etapaDe(e) !== 'cancelado').length;
  const qtdAprov = eventos.length - qtdSim;
  const pctUtil = financeiro.total ? (financeiro.utilizado / financeiro.total) * 100 : 0;
  const pctSim = financeiro.total ? (financeiro.simulacao / financeiro.total) * 100 : 0;
  const pctRest = financeiro.total ? (financeiro.restante / financeiro.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard & Saldos da Ata</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ata.numero} · {ata.fornecedor} · CNPJ {ata.cnpj}
          </p>
        </div>
        <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={novoEvento}>
          Nova simulação
        </Botao>
      </div>

      {(vigenciaVencida || (diasVigencia !== null && diasVigencia <= 30)) && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${vigenciaVencida ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {vigenciaVencida
              ? `A vigência desta Ata terminou em ${fmtData(ata.vigenciaFim)}. Confira se houve prorrogação e atualize a data na Configuração da Ata.`
              : `A vigência desta Ata termina em ${fmtData(ata.vigenciaFim)} (${diasVigencia === 0 ? 'hoje' : diasVigencia === 1 ? 'amanhã' : `em ${diasVigencia} dias`}). Avalie a prorrogação ou o uso do saldo restante.`}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Valor total da Ata" valor={brl(financeiro.total)} detalhe={`${itens.length} itens em ${modulos.length} módulos`} icone={<Wallet className="h-4 w-4" />} destaque="bg-cremesp-50 text-cremesp-700" />
        <Kpi
          titulo="Já utilizado"
          valor={brl(financeiro.utilizado)}
          detalhe={`${pct(pctUtil)} da Ata · ${qtdAprov} ${qtdAprov === 1 ? 'evento confirmado' : 'eventos confirmados'}`}
          icone={<CheckCircle2 className="h-4 w-4" />}
          destaque="bg-slate-100 text-slate-700"
        />
        <Kpi
          titulo="Em simulação"
          valor={brl(financeiro.simulacao)}
          detalhe={`${pct(pctSim)} da Ata · ${qtdSim} ${qtdSim === 1 ? 'simulação aberta' : 'simulações abertas'}`}
          icone={<Pencil className="h-4 w-4" />}
          destaque="bg-cremesp-50 text-cremesp-700"
        />
        <Kpi
          titulo="Saldo financeiro restante"
          valor={brl(financeiro.restante)}
          detalhe={
            <span className={ESTILO_NIVEL[nivelSaldo(financeiro.restante, financeiro.total)].texto}>
              {pct(pctRest)} disponível · {brl(financeiro.restante - financeiro.simulacao)} livre após simulações
            </span>
          }
          icone={<BarChart3 className="h-4 w-4" />}
          destaque="bg-emerald-50 text-emerald-700"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader titulo="Consumo por módulo" subtitulo="Valor consumido (sólido) e reservado em simulação (hachurado) sobre o valor registrado" icone={<Layers className="h-4 w-4" />} />
          <div className="divide-y divide-slate-100">
            {porModulo.map(({ m, total, consumido, simulacao, n }) => {
              const restante = total - consumido;
              return (
                <div key={m.id} className="px-5 py-3">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${CORES[m.cor].dot}`} />
                      <span className="font-medium text-slate-800">{m.nome}</span>
                      <span className="text-xs text-slate-400">{n} {n === 1 ? 'item' : 'itens'}</span>
                    </div>
                    <div className="text-xs tabular-nums text-slate-500">
                      <span className="font-medium text-slate-700">{brl(consumido)}</span> de {brl(total)}
                      <span className={`ml-2 font-semibold ${ESTILO_NIVEL[nivelSaldo(restante, total)].texto}`}>{pct(total ? (consumido / total) * 100 : 0)}</span>
                    </div>
                  </div>
                  <BarraProgresso consumido={consumido} simulacao={simulacao} total={total} nivel={nivelSaldo(restante, total)} />
                </div>
              );
            })}
            {porModulo.length === 0 && <p className="px-5 py-6 text-sm text-slate-500">Nenhum módulo cadastrado.</p>}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader titulo="Eventos" subtitulo="Confirmados abatem o saldo; simulações apenas reservam" icone={<CalendarDays className="h-4 w-4" />} />
          <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {eventosOrdenados.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <EtapaBadge etapa={etapaDe(ev)} />
                    <span className="text-xs text-slate-400">OS {ev.numero}</span>
                    {ev.protocolo ? (
                      <span className="text-xs text-slate-500">· Prot. {ev.protocolo}</span>
                    ) : (
                      <span className="text-xs text-amber-700">· sem protocolo</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-slate-800">{ev.nome}</p>
                  <p className="text-xs text-slate-500">{periodo(ev)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{brl(totalEvento(ev, itensPorId))}</p>
                  <div className="mt-1 flex justify-end gap-1">
                    <Botao tamanho="sm" variante="fantasma" onClick={() => irParaEvento(ev.id, 'simulador')}>
                      Abrir
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => irParaEvento(ev.id, 'ordem')}>
                      OS
                    </Botao>
                  </div>
                </div>
              </div>
            ))}
            {eventos.length === 0 && <p className="px-5 py-6 text-sm text-slate-500">Nenhum evento ainda. Crie uma simulação.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          titulo="Controle de saldo físico dos itens"
          subtitulo="Quantidades na unidade da Ata (quantidade × diárias)"
          icone={<Package className="h-4 w-4" />}
          acoes={
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ≥ 25%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> &lt; 25%</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> &lt; 10% / esgotado</span>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-9`} placeholder="Buscar item por código ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <select className={`${inputCls} w-auto`} value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}>
            <option value="todos">Todos os módulos</option>
            {modulos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSoCriticos((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition ${
              soCriticos ? 'bg-rose-600 text-white ring-rose-600' : 'bg-white text-rose-700 ring-rose-200 hover:bg-rose-50'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Saldo crítico (&lt; 20%)
            <span className={`rounded-full px-1.5 text-xs ${soCriticos ? 'bg-white/20' : 'bg-rose-100'}`}>{qtdCriticos}</span>
          </button>
          <button
            onClick={() => setSoUsados((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition ${
              soUsados ? 'bg-cremesp-700 text-white ring-cremesp-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Só itens movimentados
          </button>
        </div>
        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-5 py-2.5">Item</th>
                <th className="px-3 py-2.5">Módulo</th>
                <th className="px-3 py-2.5 text-right">Contratada</th>
                <th className="px-3 py-2.5 text-right">Consumida</th>
                <th className="px-3 py-2.5 text-right">Em simulação</th>
                <th className="px-3 py-2.5 text-right">Restante</th>
                <th className="w-44 px-5 py-2.5">Consumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => (
                <tr key={l.it.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">{l.it.codigo}</span>
                      <div className="min-w-0">
                        <p className="line-clamp-2 min-w-[340px] max-w-xl text-slate-800" title={l.it.descricao}>{l.it.descricao}</p>
                        <p className="text-xs text-slate-400">
                          {l.it.unidade} · {brl(l.it.valorUnitario)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ChipModulo modulo={modulosPorId.get(l.it.moduloId)} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{num(l.it.qtdContratada)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{num(l.consumido)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-cremesp-700">{l.simulacao ? num(l.simulacao) : '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-semibold tabular-nums ${ESTILO_NIVEL[l.nivel].texto}`}>{num(l.restante)}</span>
                    {l.simulacao > 0 && (
                      <p className={`text-[11px] tabular-nums ${l.livre < 0 ? 'text-rose-600' : 'text-slate-400'}`}>livre: {num(l.livre)}</p>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <BarraProgresso consumido={l.consumido} simulacao={l.simulacao} total={l.it.qtdContratada} nivel={l.nivel} />
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">{pct(l.pctConsumo, 0)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-500">
                    Nenhum item encontrado com os filtros atuais.
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

// ---------------------------------------------------------------- Aba: Simulador

function SimuladorAba({
  ata,
  eventos,
  evento,
  itens,
  modulos,
  modulosPorId,
  itensPorId,
  usoTotal,
  usoPorEvento,
  financeiro,
  selecionar,
  atualizar,
  novoEvento,
  excluirEvento,
  irParaOrdem,
  irParaAndamento,
  usuario,
  avisar,
  abrirDialogo,
}: {
  ata: AtaInfo;
  eventos: Evento[];
  evento: Evento | null;
  itens: ItemAta[];
  modulos: Modulo[];
  modulosPorId: Map<string, Modulo>;
  itensPorId: Map<string, ItemAta>;
  usoTotal: Map<string, Uso>;
  usoPorEvento: Map<string, Map<string, number>>;
  financeiro: Financeiro;
  selecionar: (id: string) => void;
  atualizar: (id: string, patch: Partial<Evento> | ((e: Evento) => Partial<Evento>)) => void;
  novoEvento: (copiaDe?: Evento) => void;
  excluirEvento: (ev: Evento) => void;
  irParaOrdem: (id: string) => void;
  irParaAndamento: (id: string) => void;
  usuario: string;
  avisar: (t: string, tipo?: 'ok' | 'erro') => void;
  abrirDialogo: (d: DialogoConfig) => void;
}) {
  const [busca, setBusca] = useState('');
  const [soSelecionados, setSoSelecionados] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  if (!evento) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <Layers className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 text-base font-semibold">Nenhum evento selecionado</h2>
        <p className="mt-1 text-sm text-slate-500">Crie uma simulação para montar o escopo do evento com os itens da Ata.</p>
        <Botao variante="primario" className="mt-5" icone={<Plus className="h-4 w-4" />} onClick={() => novoEvento()}>
          Nova simulação
        </Botao>
      </Card>
    );
  }

  const travado = evento.status === 'aprovado';
  const proprio = usoPorEvento.get(evento.id) ?? new Map<string, number>();
  const diasEvento = diasEntre(evento.dataInicio, evento.dataFim);
  const foraVigencia =
    !!ata.vigenciaInicio && !!ata.vigenciaFim && !!evento.dataInicio &&
    (evento.dataInicio < ata.vigenciaInicio || (evento.dataFim || evento.dataInicio) > ata.vigenciaFim);

  // Saldo de cada item visto por este evento (desconta o uso do próprio evento)
  const saldoItem = (it: ItemAta) => {
    const u = usoTotal.get(it.id) ?? { consumido: 0, simulacao: 0 };
    const meu = proprio.get(it.id) ?? 0;
    const consumidoOutros = u.consumido - (evento.status === 'aprovado' ? meu : 0);
    const reservadoOutros = u.simulacao - (evento.status === 'simulacao' ? meu : 0);
    const disponivel = it.qtdContratada - consumidoOutros;
    return { disponivel, livre: disponivel - reservadoOutros, reservadoOutros };
  };

  const setLinha = (itemId: string, patch: Partial<LinhaEvento>) =>
    atualizar(evento.id, (e) => {
      const atual = e.linhas[itemId] ?? { qtd: 0, diarias: diasEntre(e.dataInicio, e.dataFim) };
      const nova = { ...atual, ...patch };
      const novasLinhas = { ...e.linhas };
      if (nova.qtd <= 0 && (patch.qtd !== undefined)) delete novasLinhas[itemId];
      else novasLinhas[itemId] = nova;
      return { linhas: novasLinhas };
    });

  // Resumo
  const resumo = (() => {
    const porModulo = new Map<string, { valor: number; itens: number }>();
    let total = 0;
    const excedidos: { it: ItemAta; pedido: number; disponivel: number }[] = [];
    const reservados: { it: ItemAta; pedido: number; livre: number }[] = [];
    for (const [itemId, l] of Object.entries(evento.linhas)) {
      const it = itensPorId.get(itemId);
      if (!it) continue;
      const c = consumoLinha(l);
      if (c <= 0) continue;
      const v = c * it.valorUnitario;
      total += v;
      const pm = porModulo.get(it.moduloId) ?? { valor: 0, itens: 0 };
      pm.valor += v;
      pm.itens += 1;
      porModulo.set(it.moduloId, pm);
      const s = saldoItem(it);
      if (c > s.disponivel) excedidos.push({ it, pedido: c, disponivel: s.disponivel });
      else if (c > s.livre) reservados.push({ it, pedido: c, livre: s.livre });
    }
    return { porModulo, total, excedidos, reservados };
  })();

  const saldoAntes = financeiro.restante + (evento.status === 'aprovado' ? resumo.total : 0);
  const impactoAta = financeiro.total ? (resumo.total / financeiro.total) * 100 : 0;
  const impactoSaldo = saldoAntes > 0 ? (resumo.total / saldoAntes) * 100 : 0;

  const termo = busca.trim().toLowerCase();
  const grupos = modulos
    .map((m) => ({
      m,
      itens: itens.filter(
        (it) =>
          it.moduloId === m.id &&
          (!termo || `${it.codigo} ${it.descricao}`.toLowerCase().includes(termo)) &&
          (!soSelecionados || (evento.linhas[it.id]?.qtd ?? 0) > 0),
      ),
    }))
    .filter((g) => g.itens.length > 0);
  const semModulo = itens.filter((it) => !modulosPorId.has(it.moduloId));
  const filtrando = termo.length > 0 || soSelecionados;
  const estaAberto = (id: string) => (filtrando ? true : abertos[id] ?? (resumo.porModulo.has(id) || false));

  const confirmar = () => {
    if (Object.keys(evento.linhas).length === 0 || resumo.total <= 0) {
      avisar('Adicione itens ao evento antes de confirmar.', 'erro');
      return;
    }
    if (resumo.excedidos.length > 0) {
      avisar(`Não é possível confirmar: ${resumo.excedidos.length} item(ns) excedem o saldo da Ata.`, 'erro');
      return;
    }
    abrirDialogo({
      titulo: 'Confirmar evento e abater da Ata?',
      variante: 'sucesso',
      confirmar: 'Confirmar e abater saldo',
      mensagem: (
        <div className="space-y-2">
          <p>
            O evento <strong>{evento.nome}</strong> passará a <strong>Aprovado</strong> e {brl(resumo.total)} serão abatidos do saldo da Ata.
          </p>
          {resumo.reservados.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
              Atenção: {resumo.reservados.length} item(ns) usam quantidades que estão reservadas em outras simulações. Essas simulações ficarão sem saldo suficiente.
            </p>
          )}
          {foraVigencia && <p className="rounded-lg bg-rose-50 p-2 text-rose-800">A data do evento está fora da vigência da Ata.</p>}
          {!evento.protocolo?.trim() && (
            <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
              Este evento ainda não tem protocolo interno do Cremesp. Você pode confirmar assim e informar o protocolo depois, na aba Ordem de Orçamento.
            </p>
          )}
          <p className="text-xs text-slate-500">Para alterar depois, use “Reabrir para edição”: o saldo volta a ficar disponível.</p>
        </div>
      ),
      aoConfirmar: () => {
        atualizar(evento.id, (e) =>
          etapaAprovada(etapaDe(e))
            ? { status: 'aprovado', confirmadoEm: new Date().toISOString() }
            : patchEtapa(e, 'aprovado', usuario, 'Aprovado no Simulador.'),
        );
        avisar('Evento confirmado. Saldo da Ata atualizado.');
      },
    });
  };

  const reabrir = () =>
    abrirDialogo({
      titulo: 'Reabrir evento para edição?',
      confirmar: 'Reabrir como simulação',
      mensagem: <p>O evento volta para “Em simulação” e as quantidades deixam de ser abatidas do saldo da Ata até nova confirmação.</p>,
      aoConfirmar: () => {
        atualizar(evento.id, (e) => patchEtapa(e, 'rascunho', usuario, 'Reaberto para edição no Simulador.'));
        avisar('Evento reaberto como simulação.');
      },
    });

  const aplicarDiarias = () => {
    atualizar(evento.id, (e) => {
      const novas: Record<string, LinhaEvento> = {};
      for (const [k, l] of Object.entries(e.linhas)) novas[k] = { ...l, diarias: diasEvento };
      return { linhas: novas };
    });
    avisar(`Diárias de todos os itens ajustadas para ${diasEvento}.`);
  };

  const renderItem = (it: ItemAta) => {
    const l = evento.linhas[it.id];
    const qtd = l?.qtd ?? 0;
    const diarias = l?.diarias ?? diasEvento;
    const pedido = qtd * diarias;
    const s = saldoItem(it);
    const excede = !travado && pedido > s.disponivel;
    const excedeLivre = !travado && !excede && pedido > s.livre;
    const nivel = nivelSaldo(s.disponivel - (qtd > 0 ? pedido : 0), it.qtdContratada);
    return (
      <div key={it.id} className={`px-4 py-3 sm:px-5 ${qtd > 0 ? 'bg-cremesp-50/40' : ''}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className="mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">{it.codigo}</span>
            <div className="min-w-0">
              <p className="text-sm text-slate-800">{it.descricao}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{brl(it.valorUnitario)}</span>
                <span>/ {it.unidade}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTILO_NIVEL[nivelSaldo(s.disponivel, it.qtdContratada)].chip}`}>
                  Saldo disponível: {num(s.disponivel)} de {num(it.qtdContratada)}
                </span>
                {s.reservadoOutros > 0 && <span className="text-cremesp-600">{num(s.reservadoOutros)} reservado em outras simulações</span>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-end gap-2">
            <label className="w-20">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Qtd.</span>
              <NumeroInput valor={qtd} onChange={(v) => setLinha(it.id, { qtd: v })} disabled={travado} erro={excede} ariaLabel={`Quantidade do item ${it.codigo}`} />
            </label>
            <span className="pb-1.5 text-slate-400">×</span>
            <label className="w-20">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Diárias</span>
              <NumeroInput valor={qtd > 0 ? diarias : 0} onChange={(v) => setLinha(it.id, { diarias: v, qtd: qtd || 1 })} disabled={travado} min={0} erro={excede} ariaLabel={`Diárias do item ${it.codigo}`} />
            </label>
            <div className="w-28 pb-1 text-right">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">Subtotal</span>
              <span className={`text-sm font-semibold tabular-nums ${qtd > 0 ? 'text-slate-900' : 'text-slate-300'}`}>{brl(pedido * it.valorUnitario)}</span>
            </div>
          </div>
        </div>
        {qtd > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-0 md:pl-9">
            <span className="text-[11px] text-slate-500">
              Consumo na Ata: <strong className="text-slate-700">{num(pedido)}</strong> {it.unidade.toLowerCase().startsWith('diária') ? 'diárias' : 'un.'} · restará{' '}
              <strong className={ESTILO_NIVEL[nivel].texto}>{num(s.disponivel - pedido)}</strong>
            </span>
            {excede && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Quantidade excede o saldo disponível na Ata! (máx. {num(Math.max(0, s.disponivel))})
              </span>
            )}
            {excedeLivre && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> Usa saldo reservado por outras simulações (livre: {num(Math.max(0, s.livre))})
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Seletor de evento */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Simulador de Evento</h1>
          <p className="mt-1 text-sm text-slate-500">Monte o escopo com os itens da Ata e acompanhe custo e saldo em tempo real.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-auto max-w-xs`} value={evento.id} onChange={(e) => selecionar(e.target.value)}>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.status === 'aprovado' ? '✓ ' : '✎ '}OS {e.numero} · {e.nome}
              </option>
            ))}
          </select>
          <Botao icone={<Plus className="h-4 w-4" />} onClick={() => novoEvento()}>
            Novo
          </Botao>
          <Botao icone={<Copy className="h-4 w-4" />} onClick={() => novoEvento(evento)} title="Duplicar como nova simulação">
            Duplicar
          </Botao>
          <Botao variante="perigo" icone={<Trash2 className="h-4 w-4" />} onClick={() => excluirEvento(evento)} title="Excluir evento" />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* Cabeçalho do evento */}
          <Card>
            <CardHeader
              titulo={`Dados do evento · OS ${evento.numero}`}
              icone={<CalendarDays className="h-4 w-4" />}
              acoes={
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
                  <button
                    onClick={() => (travado ? reabrir() : undefined)}
                    className={`rounded-md px-3 py-1.5 ${!travado ? 'bg-white text-cremesp-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Em Simulação
                  </button>
                  <button
                    onClick={() => (!travado ? confirmar() : undefined)}
                    className={`rounded-md px-3 py-1.5 ${travado ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Aprovado / Consumir Saldo
                  </button>
                </div>
              }
            />
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              <span>Andamento:</span>
              <EtapaBadge etapa={etapaDe(evento)} />
              <button className="font-medium text-cremesp-700 hover:underline" onClick={() => irParaAndamento(evento.id)}>
                Ver histórico e avançar etapa
              </button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
              <Campo rotulo="Nome do evento" className="sm:col-span-2 lg:col-span-3">
                <input className={inputCls} value={evento.nome} onChange={(e) => atualizar(evento.id, { nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Início" className="lg:col-span-1">
                <input
                  type="date"
                  className={inputCls}
                  value={evento.dataInicio}
                  onChange={(e) =>
                    atualizar(evento.id, (ev) => ({
                      dataInicio: e.target.value,
                      dataFim: !ev.dataFim || ev.dataFim < e.target.value ? e.target.value : ev.dataFim,
                    }))
                  }
                />
              </Campo>
              <Campo rotulo="Término" className="lg:col-span-1">
                <input type="date" className={inputCls} value={evento.dataFim} min={evento.dataInicio} onChange={(e) => atualizar(evento.id, { dataFim: e.target.value })} />
              </Campo>
              <div className="flex items-end lg:col-span-1">
                <div className="w-full rounded-lg bg-slate-50 px-3 py-2 text-center text-sm">
                  <span className="font-semibold text-slate-800">{diasEvento}</span> <span className="text-slate-500">{diasEvento === 1 ? 'dia' : 'dias'}</span>
                </div>
              </div>
              <Campo rotulo="Local" className="sm:col-span-2 lg:col-span-3">
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className={`${inputCls} pl-9`} value={evento.local} placeholder="Endereço / espaço do evento" onChange={(e) => atualizar(evento.id, { local: e.target.value })} />
                </div>
              </Campo>
              <Campo rotulo="Responsável técnico" className="sm:col-span-2 lg:col-span-3">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className={`${inputCls} pl-9`} value={evento.responsavel} placeholder={ata.responsavelTecnico || 'Nome e contato'} onChange={(e) => atualizar(evento.id, { responsavel: e.target.value })} />
                </div>
              </Campo>
            </div>
            {(travado || foraVigencia) && (
              <div className="space-y-2 border-t border-slate-100 px-5 py-3">
                {travado && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-emerald-800">
                    <span className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> Evento aprovado: as quantidades estão abatidas da Ata e bloqueadas para edição.
                    </span>
                    <Botao tamanho="sm" icone={<Unlock className="h-3.5 w-3.5" />} onClick={reabrir}>
                      Reabrir para edição
                    </Botao>
                  </div>
                )}
                {foraVigencia && (
                  <p className="flex items-center gap-2 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" /> A data do evento está fora da vigência da Ata ({fmtData(ata.vigenciaInicio)} a {fmtData(ata.vigenciaFim)}).
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Itens por módulo */}
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className={`${inputCls} pl-9`} placeholder="Buscar item (ex.: LED, microfone, 28)…" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-cremesp-600" checked={soSelecionados} onChange={(e) => setSoSelecionados(e.target.checked)} />
                Só itens do evento
              </label>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setAbertos(Object.fromEntries(modulos.map((m) => [m.id, true])))}>
                Expandir tudo
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setAbertos(Object.fromEntries(modulos.map((m) => [m.id, false])))}>
                Recolher
              </Botao>
              {!travado && Object.keys(evento.linhas).length > 0 && (
                <Botao tamanho="sm" variante="fantasma" icone={<CalendarDays className="h-3.5 w-3.5" />} onClick={aplicarDiarias} title="Usa o número de dias do evento em todos os itens">
                  Diárias = {diasEvento} em todos
                </Botao>
              )}
            </div>
            <div className="divide-y divide-slate-200">
              {grupos.map(({ m, itens: lista }) => {
                const aberto = estaAberto(m.id);
                const pm = resumo.porModulo.get(m.id);
                return (
                  <div key={m.id}>
                    <button
                      onClick={() => setAbertos((a) => ({ ...a, [m.id]: !aberto }))}
                      className="flex w-full items-center justify-between gap-3 bg-slate-50/70 px-5 py-3 text-left hover:bg-slate-100/70"
                    >
                      <span className="flex items-center gap-2.5">
                        {aberto ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <span className={`h-2.5 w-2.5 rounded-full ${CORES[m.cor].dot}`} />
                        <span className="text-sm font-semibold text-slate-800">{m.nome}</span>
                        <span className="text-xs text-slate-400">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</span>
                      </span>
                      {pm && (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="rounded-full bg-cremesp-100 px-2 py-0.5 font-medium text-cremesp-700">{pm.itens} no evento</span>
                          <span className="font-semibold tabular-nums text-slate-800">{brl(pm.valor)}</span>
                        </span>
                      )}
                    </button>
                    {aberto && <div className="divide-y divide-slate-100">{lista.map(renderItem)}</div>}
                  </div>
                );
              })}
              {semModulo.length > 0 && !filtrando && (
                <div>
                  <div className="bg-slate-50/70 px-5 py-3 text-sm font-semibold text-slate-600">Itens sem módulo</div>
                  <div className="divide-y divide-slate-100">{semModulo.map(renderItem)}</div>
                </div>
              )}
              {grupos.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                  {itens.length === 0 ? 'Cadastre itens na Configuração da Ata para começar.' : 'Nenhum item encontrado.'}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Resumo flutuante */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden">
            <div className="bg-cremesp-700 px-5 py-4 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-cremesp-200">Valor total do evento</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{brl(resumo.total)}</p>
              <p className="mt-1 text-xs text-cremesp-200">
                {Object.keys(evento.linhas).length} itens · {periodo(evento)}
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Subtotal por módulo</p>
                {resumo.porModulo.size === 0 ? (
                  <p className="text-sm text-slate-400">Nenhum item adicionado.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {modulos
                      .filter((m) => resumo.porModulo.has(m.id))
                      .map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${CORES[m.cor].dot}`} />
                            <span className="truncate text-slate-600">{m.nome}</span>
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-slate-800">{brl(resumo.porModulo.get(m.id)!.valor)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Impacto no valor total da Ata</span>
                    <span className="font-semibold text-slate-800">{pct(impactoAta, 2)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full bg-cremesp-600" style={{ width: `${Math.min(100, impactoAta)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Impacto no saldo restante</span>
                    <span className={`font-semibold ${impactoSaldo > 100 ? 'text-rose-700' : 'text-slate-800'}`}>{pct(impactoSaldo, 2)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full ${impactoSaldo > 100 ? 'bg-rose-500' : 'bg-cremesp-400'}`} style={{ width: `${Math.min(100, impactoSaldo)}%` }} />
                  </div>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-xs text-slate-500">
                  <span>Saldo da Ata após o evento</span>
                  <span className="font-semibold tabular-nums text-slate-800">{brl(saldoAntes - resumo.total)}</span>
                </div>
              </div>

              {resumo.excedidos.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4" /> {resumo.excedidos.length} item(ns) acima do saldo
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {resumo.excedidos.map((x) => (
                      <li key={x.it.id}>
                        Item {x.it.codigo}: pedido {num(x.pedido)}, disponível {num(Math.max(0, x.disponivel))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resumo.excedidos.length === 0 && resumo.reservados.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {resumo.reservados.length} item(ns) disputam saldo com outras simulações.
                </div>
              )}

              <div className="space-y-2">
                <Botao
                  className="w-full"
                  icone={<Save className="h-4 w-4" />}
                  disabled={travado}
                  onClick={() => {
                    atualizar(evento.id, { status: 'simulacao' });
                    avisar('Simulação salva.');
                  }}
                >
                  Salvar Simulação
                </Botao>
                <Botao className="w-full" variante="sucesso" icone={<CheckCircle2 className="h-4 w-4" />} disabled={travado || resumo.excedidos.length > 0} onClick={confirmar}>
                  {travado ? 'Evento já confirmado' : 'Confirmar Evento (Abater da Ata)'}
                </Botao>
                <Botao className="w-full" variante="primario" icone={<FileText className="h-4 w-4" />} onClick={() => irParaOrdem(evento.id)}>
                  Gerar Ordem de Orçamento
                </Botao>
              </div>
              <p className="text-center text-[11px] text-slate-400">Alterações são salvas automaticamente neste navegador.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Aba: Ordem de Orçamento

function OrdemAba({
  ata,
  eventos,
  evento,
  modulos,
  itensPorId,
  selecionar,
  atualizar,
  avisar,
  irParaSimulador,
}: {
  ata: AtaInfo;
  eventos: Evento[];
  evento: Evento | null;
  modulos: Modulo[];
  itensPorId: Map<string, ItemAta>;
  selecionar: (id: string) => void;
  atualizar: (id: string, patch: Partial<Evento>) => void;
  avisar: (t: string, tipo?: 'ok' | 'erro') => void;
  irParaSimulador: () => void;
}) {
  if (!evento) {
    return (
      <Card className="mx-auto max-w-lg p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-3 text-base font-semibold">Nenhum evento para gerar a ordem</h2>
        <p className="mt-1 text-sm text-slate-500">Crie uma simulação no Simulador de Evento.</p>
        <Botao variante="primario" className="mt-5" onClick={irParaSimulador}>
          Ir para o Simulador
        </Botao>
      </Card>
    );
  }

  const ehOS = evento.status === 'aprovado';
  const tituloDoc = ehOS ? 'ORDEM DE SERVIÇO / FORNECIMENTO' : 'ORDEM DE ORÇAMENTO';

  const grupos = (() => {
    const porModulo = new Map<string, { it: ItemAta; l: LinhaEvento; subtotal: number }[]>();
    for (const [itemId, l] of Object.entries(evento.linhas)) {
      const it = itensPorId.get(itemId);
      if (!it || consumoLinha(l) <= 0) continue;
      const lista = porModulo.get(it.moduloId) ?? [];
      lista.push({ it, l, subtotal: consumoLinha(l) * it.valorUnitario });
      porModulo.set(it.moduloId, lista);
    }
    const ordem = [...modulos.map((m) => m.id), ...[...porModulo.keys()].filter((k) => !modulos.some((m) => m.id === k))];
    return ordem
      .filter((id) => porModulo.has(id))
      .map((id) => {
        const linhasMod = porModulo.get(id)!.sort((a, b) => Number(a.it.codigo) - Number(b.it.codigo) || a.it.codigo.localeCompare(b.it.codigo));
        return {
          nome: modulos.find((m) => m.id === id)?.nome ?? 'Outros',
          linhas: linhasMod,
          subtotal: linhasMod.reduce((s, x) => s + x.subtotal, 0),
        };
      });
  })();
  const total = grupos.reduce((s, g) => s + g.subtotal, 0);

  const textoResumo = () => {
    const linhasTxt: string[] = [];
    linhasTxt.push(`*${tituloDoc} Nº ${evento.numero}*`);
    if (evento.protocolo?.trim()) linhasTxt.push(`*Protocolo Cremesp:* ${evento.protocolo.trim()}`);
    linhasTxt.push(`Ref.: ${ata.numero}${ata.pregao ? ` · ${ata.pregao}` : ''}`);
    linhasTxt.push(`Fornecedor: ${ata.fornecedor}${ata.cnpj ? ` (CNPJ ${ata.cnpj})` : ''}`);
    linhasTxt.push('');
    linhasTxt.push(`*Evento:* ${evento.nome}`);
    linhasTxt.push(`*Data:* ${periodo(evento)}`);
    if (evento.local) linhasTxt.push(`*Local:* ${evento.local}`);
    const resp = evento.responsavel || ata.responsavelTecnico;
    if (resp) linhasTxt.push(`*Responsável técnico:* ${resp}`);
    for (const g of grupos) {
      linhasTxt.push('');
      linhasTxt.push(`*▸ ${g.nome.toUpperCase()}*`);
      for (const { it, l, subtotal } of g.linhas) {
        linhasTxt.push(`• Item ${it.codigo} – ${it.descricao}`);
        linhasTxt.push(`   ${num(l.qtd)} × ${num(l.diarias)} ${l.diarias === 1 ? 'diária' : 'diárias'} × ${brl(it.valorUnitario)} = ${brl(subtotal)}`);
      }
      linhasTxt.push(`   _Subtotal: ${brl(g.subtotal)}_`);
    }
    linhasTxt.push('');
    linhasTxt.push(`*VALOR TOTAL: ${brl(total)}*`);
    linhasTxt.push(`_(${valorPorExtenso(total)})_`);
    linhasTxt.push('');
    linhasTxt.push(ehOS ? 'Favor confirmar o recebimento desta Ordem de Serviço.' : 'Favor confirmar disponibilidade e retornar o orçamento conforme valores registrados na Ata.');
    return linhasTxt.join('\n');
  };

  const copiar = async () => {
    const ok = await copiarTexto(textoResumo());
    avisar(ok ? 'Resumo copiado. Cole no WhatsApp ou no e-mail.' : 'Não foi possível copiar automaticamente.', ok ? 'ok' : 'erro');
  };

  return (
    <div className="space-y-5">
      <div data-print-hide className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ordem de Orçamento / Fornecimento</h1>
          <p className="mt-1 text-sm text-slate-500">
            Documento pronto para enviar ao fornecedor. {ehOS ? 'Evento aprovado: sai como Ordem de Serviço.' : 'Evento em simulação: sai como Ordem de Orçamento.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${inputCls} w-auto max-w-xs`} value={evento.id} onChange={(e) => selecionar(e.target.value)}>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.status === 'aprovado' ? '✓ ' : '✎ '}OS {e.numero} · {e.nome}
              </option>
            ))}
          </select>
          <Botao icone={<ClipboardCopy className="h-4 w-4" />} onClick={copiar}>
            Copiar resumo para WhatsApp/E-mail
          </Botao>
          <Botao variante="primario" icone={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir / Salvar PDF
          </Botao>
        </div>
      </div>

      <div data-print-hide>
        <Card className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[minmax(0,1fr)_200px_minmax(0,1.4fr)]">
            <Campo rotulo="Protocolo interno Cremesp">
              <input
                className={`${inputCls} ${evento.protocolo?.trim() ? '' : 'border-amber-300 bg-amber-50/50'}`}
                value={evento.protocolo ?? ''}
                placeholder="Informe após receber o orçamento"
                onChange={(e) => atualizar(evento.id, { protocolo: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Orçamento recebido em">
              <input
                type="date"
                className={inputCls}
                value={evento.orcamentoRecebidoEm ?? ''}
                onChange={(e) => atualizar(evento.id, { orcamentoRecebidoEm: e.target.value })}
              />
            </Campo>
            <p className="flex items-end pb-2 text-xs text-slate-500 sm:col-span-2 lg:col-span-1">
              {evento.protocolo?.trim()
                ? 'O protocolo aparece no cabeçalho do documento e no resumo para WhatsApp/e-mail.'
                : 'Sem protocolo, o documento sai com um espaço em branco para preencher à mão.'}
            </p>
          </div>
        </Card>
      </div>

      {/* Folha A4 */}
      <div className="overflow-x-auto pb-6 print:overflow-visible print:pb-0">
        <article id="folha-ordem" className="folha-a4 mx-auto bg-white text-[12px] leading-relaxed text-slate-900 shadow-lg ring-1 ring-slate-200">
          <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
            <div>
              <img src={logoCremesp} alt={ata.contratante} className="h-12 w-auto" />
              <div className="mt-2">
                <p className="text-[11px] font-semibold text-slate-700">{ata.contratante}</p>
                <p className="text-[11px] text-slate-600">CNPJ {ata.cnpjContratante}{ata.uasg ? ` · UASG ${ata.uasg}` : ''}</p>
                <p className="text-[11px] text-slate-600">{ata.enderecoContratante}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Nº do documento</p>
              <p className="text-lg font-bold tabular-nums">{evento.numero}</p>
              <p className="text-[11px] text-slate-500">Emissão: {fmtData(hojeISO())}</p>
              <div className="mt-2 rounded border border-slate-300 px-2 py-1 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Protocolo Cremesp</p>
                {evento.protocolo?.trim() ? (
                  <p className="text-[12px] font-semibold tabular-nums">{evento.protocolo.trim()}</p>
                ) : (
                  <p className="mt-3 w-40 border-b border-slate-400" />
                )}
                {evento.orcamentoRecebidoEm && <p className="text-[10px] text-slate-500">Orçamento recebido em {fmtData(evento.orcamentoRecebidoEm)}</p>}
              </div>
            </div>
          </header>

          <h2 className="mt-5 text-center text-[15px] font-bold tracking-wide">{tituloDoc}</h2>
          <p className="text-center text-[11px] text-slate-600">
            Referente à {ata.numero}
            {ata.pregao ? ` · ${ata.pregao}` : ''}
            {ata.processo ? ` · ${ata.processo}` : ''}
          </p>

          <section className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded border border-slate-300 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Fornecedor</p>
              <p className="font-semibold">{ata.fornecedor}</p>
              <p>CNPJ: {ata.cnpj}</p>
              {ata.enderecoFornecedor && <p className="text-[11px] text-slate-600">{ata.enderecoFornecedor}</p>}
              {ata.contato && <p className="text-[11px]">Contato: {ata.contato}</p>}
              {(ata.telefone || ata.email) && (
                <p className="text-[11px]">
                  {ata.telefone}
                  {ata.telefone && ata.email ? ' · ' : ''}
                  {ata.email}
                </p>
              )}
            </div>
            <div className="rounded border border-slate-300 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Evento</p>
              <p className="font-semibold">{evento.nome}</p>
              <p>Data: {periodo(evento)} ({diasEntre(evento.dataInicio, evento.dataFim)} {diasEntre(evento.dataInicio, evento.dataFim) === 1 ? 'dia' : 'dias'})</p>
              <p>Local: {evento.local || '—'}</p>
              <p>Responsável técnico: {evento.responsavel || ata.responsavelTecnico || '—'}</p>
              <p className="text-[11px] text-slate-600">Vigência da Ata: {fmtData(ata.vigenciaInicio)} a {fmtData(ata.vigenciaFim)}</p>
            </div>
          </section>

          <table className="tabela-ordem mt-5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-2 py-1.5 text-center">Item</th>
                <th className="border border-slate-300 px-2 py-1.5">Descrição</th>
                <th className="border border-slate-300 px-2 py-1.5 text-center">Unidade</th>
                <th className="border border-slate-300 px-2 py-1.5 text-right">Qtd.</th>
                <th className="border border-slate-300 px-2 py-1.5 text-right">Diárias</th>
                <th className="border border-slate-300 px-2 py-1.5 text-right">Valor unit. (Ata)</th>
                <th className="border border-slate-300 px-2 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.nome}>
                <tr>
                  <td colSpan={7} className="border border-slate-300 bg-slate-50 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide">
                    {g.nome}
                  </td>
                </tr>
                {g.linhas.map(({ it, l, subtotal }) => (
                  <tr key={it.id}>
                    <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{it.codigo}</td>
                    <td className="border border-slate-300 px-2 py-1">{it.descricao}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-center">{it.unidade}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">{num(l.qtd)}</td>
                    <td className="border border-slate-300 px-2 py-1 text-right tabular-nums">{num(l.diarias)}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right tabular-nums">{brl(it.valorUnitario)}</td>
                    <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right font-medium tabular-nums">{brl(subtotal)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} className="border border-slate-300 px-2 py-1 text-right text-[10.5px] font-semibold text-slate-600">
                    Subtotal {g.nome}
                  </td>
                  <td className="whitespace-nowrap border border-slate-300 px-2 py-1 text-right font-semibold tabular-nums">{brl(g.subtotal)}</td>
                </tr>
              </tbody>
            ))}
            {grupos.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-2 py-6 text-center text-slate-500">
                    Nenhum item selecionado para este evento.
                  </td>
                </tr>
              </tbody>
            )}
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td colSpan={6} className="border border-slate-900 px-2 py-2 text-right text-[12px] font-bold uppercase">
                  Valor total {ehOS ? 'da Ordem de Serviço' : 'da Ordem de Orçamento'}
                </td>
                <td className="whitespace-nowrap border border-slate-900 px-2 py-2 text-right text-[13px] font-bold tabular-nums">{brl(total)}</td>
              </tr>
              <tr>
                <td colSpan={7} className="border border-slate-300 px-2 py-1.5 text-right text-[11px]">
                  <span className="font-semibold">Valor por extenso:</span> <span className="italic">{valorPorExtenso(total)}</span>
                </td>
              </tr>
            </tfoot>
          </table>

          <section className="evitar-quebra mt-4">
            <p className="text-[10.5px] text-slate-600">
              Valores unitários conforme registrados na {ata.numero}. As quantidades acima consideram quantidade × diárias, abatidas do saldo registrado da Ata.
              {!ehOS && ' Este documento é uma solicitação de orçamento e não autoriza a execução dos serviços.'}
            </p>
          </section>

          <section className="evitar-quebra mt-10">
            <p className="mb-10 text-right text-[11px]">
              {ata.cidade || 'São Paulo'}, {dataPorExtenso(hojeISO())}.
            </p>
            <div className="grid grid-cols-2 gap-x-10 gap-y-12 text-center text-[10.5px]">
              {[
                ['Responsável técnico do evento', evento.responsavel || ata.responsavelTecnico || 'Contratante'],
                ['Gestor(a) da Ata', ata.gestor || 'Contratante'],
                ['Fiscal da Ata', ata.fiscal || 'Contratante'],
                [ehOS ? 'Ciente – Fornecedor' : 'De acordo – Fornecedor', ata.fornecedor],
                [ata.cargoCoordenador || 'Coordenador do Departamento de Comunicação', ata.coordenador || 'Alexandre Kataoka'],
              ].map(([cargo, nome], i) => (
                <div key={cargo} className={i === 4 ? 'col-span-2 mx-auto w-1/2' : ''}>
                  <div className="border-t border-slate-800 pt-1.5">
                    <p className="font-semibold">{nome}</p>
                    <p className="text-slate-600">{cargo}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Aba: Relatórios

type Granularidade = 'mes' | 'trimestre' | 'semestre';
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEM_DATA = 'sem-data';

function chavePeriodo(iso: string, g: Granularidade): string {
  if (!iso) return SEM_DATA;
  const ano = iso.slice(0, 4);
  const mes = Number(iso.slice(5, 7));
  if (g === 'mes') return `${ano}-${String(mes).padStart(2, '0')}`;
  if (g === 'trimestre') return `${ano}-T${Math.ceil(mes / 3)}`;
  return `${ano}-S${mes <= 6 ? 1 : 2}`;
}

function rotuloPeriodo(chave: string, g: Granularidade): string {
  if (chave === SEM_DATA) return 'Sem data';
  const ano = chave.slice(0, 4);
  if (g === 'mes') return `${MESES_CURTOS[Number(chave.slice(5, 7)) - 1]}/${ano}`;
  if (g === 'trimestre') return `${chave.slice(6)}º trimestre ${ano}`;
  return `${chave.slice(6)}º semestre ${ano}`;
}

interface LinhaRelatorio {
  ev: Evento;
  total: number;
  diarias: number;
  porModulo: Map<string, number>;
  itens: { it: ItemAta; l: LinhaEvento; subtotal: number }[];
}

function RelatoriosAba({
  ata,
  eventos,
  modulos,
  itensPorId,
  financeiro,
  irParaEvento,
}: {
  ata: AtaInfo;
  eventos: Evento[];
  modulos: Modulo[];
  itensPorId: Map<string, ItemAta>;
  financeiro: Financeiro;
  irParaEvento: (id: string, destino: Aba) => void;
}) {
  const [gran, setGran] = useState<Granularidade>('mes');
  const [incluirSim, setIncluirSim] = useState(false);
  const [sel, setSel] = useState<string>('todos');

  const linhas: LinhaRelatorio[] = useMemo(
    () =>
      eventos
        .filter((ev) => etapaDe(ev) !== 'cancelado' && (ev.status === 'aprovado' || incluirSim))
        .map((ev) => {
          const itens: LinhaRelatorio['itens'] = [];
          const porModulo = new Map<string, number>();
          let total = 0;
          let diarias = 0;
          for (const [itemId, l] of Object.entries(ev.linhas)) {
            const it = itensPorId.get(itemId);
            const c = consumoLinha(l);
            if (!it || c <= 0) continue;
            const subtotal = c * it.valorUnitario;
            total += subtotal;
            diarias += c;
            porModulo.set(it.moduloId, (porModulo.get(it.moduloId) ?? 0) + subtotal);
            itens.push({ it, l, subtotal });
          }
          return { ev, total, diarias, porModulo, itens };
        })
        .sort((a, b) => (a.ev.dataInicio || '9999').localeCompare(b.ev.dataInicio || '9999')),
    [eventos, itensPorId, incluirSim],
  );

  // Lista de períodos: toda a vigência da Ata, mais qualquer período com eventos fora dela
  const periodos = useMemo(() => {
    const chaves = new Set<string>();
    const ini = ata.vigenciaInicio;
    const fim = ata.vigenciaFim;
    if (ini && fim && ini <= fim) {
      let a = Number(ini.slice(0, 4));
      let m = Number(ini.slice(5, 7));
      const aF = Number(fim.slice(0, 4));
      const mF = Number(fim.slice(5, 7));
      while (a < aF || (a === aF && m <= mF)) {
        chaves.add(chavePeriodo(`${a}-${String(m).padStart(2, '0')}-01`, gran));
        m++;
        if (m > 12) {
          m = 1;
          a++;
        }
      }
    }
    for (const l of linhas) chaves.add(chavePeriodo(l.ev.dataInicio, gran));
    return [...chaves].sort((x, y) => (x === SEM_DATA ? 1 : y === SEM_DATA ? -1 : x.localeCompare(y)));
  }, [ata.vigenciaInicio, ata.vigenciaFim, linhas, gran]);

  const serie = useMemo(() => {
    let acumulado = 0;
    return periodos.map((k) => {
      const doPeriodo = linhas.filter((l) => chavePeriodo(l.ev.dataInicio, gran) === k);
      const executado = doPeriodo.filter((l) => l.ev.status === 'aprovado').reduce((s, l) => s + l.total, 0);
      const simulado = doPeriodo.filter((l) => l.ev.status === 'simulacao').reduce((s, l) => s + l.total, 0);
      acumulado += executado;
      return { k, n: doPeriodo.length, executado, simulado, acumulado, diarias: doPeriodo.reduce((s, l) => s + l.diarias, 0) };
    });
  }, [periodos, linhas, gran]);

  const maxPeriodo = Math.max(1, ...serie.map((p) => p.executado + p.simulado));
  const selValida = sel === 'todos' || periodos.includes(sel) ? sel : 'todos';
  const doRecorte = selValida === 'todos' ? linhas : linhas.filter((l) => chavePeriodo(l.ev.dataInicio, gran) === selValida);
  const rotuloRecorte = selValida === 'todos' ? 'Toda a vigência' : rotuloPeriodo(selValida, gran);

  const totalRecorte = doRecorte.reduce((s, l) => s + l.total, 0);
  const executadoRecorte = doRecorte.filter((l) => l.ev.status === 'aprovado').reduce((s, l) => s + l.total, 0);
  const diariasRecorte = doRecorte.reduce((s, l) => s + l.diarias, 0);
  const semProtocolo = doRecorte.filter((l) => !l.ev.protocolo?.trim()).length;

  const porModulo = modulos
    .map((m) => ({ m, valor: doRecorte.reduce((s, l) => s + (l.porModulo.get(m.id) ?? 0), 0) }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const topItens = (() => {
    const mapa = new Map<string, { it: ItemAta; qtd: number; valor: number }>();
    for (const l of doRecorte)
      for (const { it, l: li, subtotal } of l.itens) {
        const x = mapa.get(it.id) ?? { it, qtd: 0, valor: 0 };
        x.qtd += consumoLinha(li);
        x.valor += subtotal;
        mapa.set(it.id, x);
      }
    return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);
  })();

  const exportarCSV = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const dec = (v: number) => v.toFixed(2).replace('.', ',');
    const nomesModulo = new Map(modulos.map((m) => [m.id, m.nome]));
    const cab = ['Período', 'OS', 'Protocolo Cremesp', 'Evento', 'Início', 'Término', 'Local', 'Etapa', 'Módulo', 'Item', 'Descrição', 'Unidade', 'Qtd.', 'Diárias', 'Valor unitário', 'Subtotal'];
    const rows = [cab.map(esc).join(';')];
    for (const l of doRecorte)
      for (const { it, l: li, subtotal } of l.itens)
        rows.push(
          [
            esc(rotuloPeriodo(chavePeriodo(l.ev.dataInicio, gran), gran)),
            esc(l.ev.numero),
            esc(l.ev.protocolo ?? ''),
            esc(l.ev.nome),
            esc(fmtData(l.ev.dataInicio)),
            esc(fmtData(l.ev.dataFim || l.ev.dataInicio)),
            esc(l.ev.local),
            esc(infoEtapa(etapaDe(l.ev)).rotulo),
            esc(nomesModulo.get(it.moduloId) ?? ''),
            esc(it.codigo),
            esc(it.descricao),
            esc(it.unidade),
            dec(li.qtd),
            dec(li.diarias),
            dec(it.valorUnitario),
            dec(subtotal),
          ].join(';'),
        );
    const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-ata-${rotuloRecorte.toLowerCase().replace(/[^\wà-ú]+/gi, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const GRANS: { id: Granularidade; rotulo: string }[] = [
    { id: 'mes', rotulo: 'Mês' },
    { id: 'trimestre', rotulo: 'Trimestre' },
    { id: 'semestre', rotulo: 'Semestre' },
  ];

  return (
    <div className="space-y-6">
      <div data-print-hide className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-1 text-sm text-slate-500">Execução da Ata por período. Cada evento conta no período da sua data de início.</p>
        </div>
        <div data-print-hide className="flex flex-wrap gap-2">
          <Botao icone={<Download className="h-4 w-4" />} onClick={exportarCSV} disabled={doRecorte.length === 0}>
            Exportar planilha (CSV)
          </Botao>
          <Botao variante="primario" icone={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir / Salvar PDF
          </Botao>
        </div>
      </div>

      {/* Cabeçalho que só aparece na impressão */}
      <div className="hidden border-b-2 border-slate-900 pb-3 print:block">
        <img src={logoCremesp} alt="Cremesp" className="h-10 w-auto" />
        <p className="mt-2 text-sm font-semibold">
          Relatório de execução · {ata.numero} · {rotuloRecorte}
        </p>
        <p className="text-xs text-slate-600">
          {ata.fornecedor} · {incluirSim ? 'Inclui eventos em simulação' : 'Somente eventos aprovados'} · Emitido em {fmtData(hojeISO())}
        </p>
      </div>

      <Card data-print-hide className="flex flex-wrap items-center gap-4 p-4">
        <div className="inline-flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {GRANS.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setGran(g.id);
                setSel('todos');
              }}
              className={`rounded-md px-3 py-1.5 ${gran === g.id ? 'bg-white text-cremesp-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {g.rotulo}
            </button>
          ))}
        </div>
        <select className={`${inputCls} w-auto`} value={selValida} onChange={(e) => setSel(e.target.value)} aria-label="Período">
          <option value="todos">Toda a vigência</option>
          {periodos.map((k) => (
            <option key={k} value={k}>
              {rotuloPeriodo(k, gran)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-cremesp-600" checked={incluirSim} onChange={(e) => setIncluirSim(e.target.checked)} />
          Incluir eventos em simulação
        </label>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          titulo={incluirSim ? 'Valor no recorte' : 'Valor executado'}
          valor={brl(incluirSim ? totalRecorte : executadoRecorte)}
          detalhe={`${rotuloRecorte}${incluirSim ? ` · aprovado ${brl(executadoRecorte)}` : ''}`}
          icone={<Wallet className="h-4 w-4" />}
          destaque="bg-cremesp-50 text-cremesp-700"
        />
        <Kpi
          titulo="Eventos"
          valor={String(doRecorte.length)}
          detalhe={
            semProtocolo > 0 ? <span className="text-amber-700">{semProtocolo} sem protocolo</span> : doRecorte.length ? 'todos com protocolo' : 'nenhum evento no período'
          }
          icone={<CalendarDays className="h-4 w-4" />}
        />
        <Kpi titulo="Diárias contratadas" valor={num(diariasRecorte)} detalhe="quantidade × diárias, somando todos os itens" icone={<Package className="h-4 w-4" />} />
        <Kpi
          titulo="Participação na Ata"
          valor={pct(financeiro.total ? ((incluirSim ? totalRecorte : executadoRecorte) / financeiro.total) * 100 : 0, 2)}
          detalhe={`do valor total de ${brl(financeiro.total)}`}
          icone={<BarChart3 className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader
          titulo={`Evolução por ${gran === 'mes' ? 'mês' : gran}`}
          subtitulo="O acumulado considera só eventos aprovados. Clique numa linha para ver o detalhe do período."
          icone={<BarChart3 className="h-4 w-4" />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Período</th>
                <th className="px-3 py-2.5 text-right">Eventos</th>
                <th className="px-3 py-2.5 text-right">Executado</th>
                {incluirSim && <th className="px-3 py-2.5 text-right">Em simulação</th>}
                <th className="w-56 px-3 py-2.5" />
                <th className="px-3 py-2.5 text-right">Acumulado</th>
                <th className="px-5 py-2.5 text-right">Saldo da Ata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serie.map((p) => {
                const ativo = selValida === p.k;
                return (
                  <tr
                    key={p.k}
                    onClick={() => setSel(ativo ? 'todos' : p.k)}
                    className={`cursor-pointer ${ativo ? 'bg-cremesp-50' : 'hover:bg-slate-50'} ${p.n === 0 ? 'text-slate-400' : ''}`}
                  >
                    <td className={`px-5 py-2.5 font-medium ${p.n ? 'text-slate-800' : ''}`}>{rotuloPeriodo(p.k, gran)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.n || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.executado ? brl(p.executado) : '—'}</td>
                    {incluirSim && <td className="px-3 py-2.5 text-right tabular-nums text-cremesp-700">{p.simulado ? brl(p.simulado) : '—'}</td>}
                    <td className="px-3 py-2.5">
                      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-cremesp-600" style={{ width: `${(p.executado / maxPeriodo) * 100}%` }} />
                        <div className="h-full bg-cremesp-300" style={{ width: `${(p.simulado / maxPeriodo) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{brl(p.acumulado)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{brl(financeiro.total - p.acumulado)}</td>
                  </tr>
                );
              })}
              {serie.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    Informe a vigência da Ata na Configuração para montar os períodos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader titulo={`Por módulo · ${rotuloRecorte}`} icone={<Layers className="h-4 w-4" />} />
          <div className="divide-y divide-slate-100">
            {porModulo.map(({ m, valor }) => (
              <div key={m.id} className="px-5 py-3">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${CORES[m.cor].dot}`} />
                    <span className="font-medium text-slate-800">{m.nome}</span>
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {brl(valor)} <span className="ml-1 text-xs text-slate-400">{pct(totalRecorte ? (valor / totalRecorte) * 100 : 0)}</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${CORES[m.cor].bar}`} style={{ width: `${totalRecorte ? (valor / totalRecorte) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {porModulo.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Nenhum valor neste recorte.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader titulo={`Itens mais usados · ${rotuloRecorte}`} subtitulo="Os 10 itens de maior valor" icone={<Package className="h-4 w-4" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qtd. (diárias)</th>
                  <th className="px-5 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topItens.map(({ it, qtd, valor }) => (
                  <tr key={it.id}>
                    <td className="px-5 py-2">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">{it.codigo}</span>
                      <span className="text-slate-800">{it.descricao.length > 70 ? `${it.descricao.slice(0, 70)}…` : it.descricao}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(qtd)}</td>
                    <td className="px-5 py-2 text-right font-medium tabular-nums">{brl(valor)}</td>
                  </tr>
                ))}
                {topItens.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                      Nenhum item neste recorte.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader titulo={`Eventos · ${rotuloRecorte}`} subtitulo={`${doRecorte.length} evento(s) · ${brl(totalRecorte)}`} icone={<CalendarDays className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">OS</th>
                <th className="px-3 py-2.5">Protocolo</th>
                <th className="px-3 py-2.5">Evento</th>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th data-print-hide className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doRecorte.map(({ ev, total }) => (
                <tr key={ev.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-2.5 tabular-nums text-slate-600">{ev.numero}</td>
                  <td className="px-3 py-2.5 tabular-nums">{ev.protocolo?.trim() || <span className="text-amber-700">pendente</span>}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{ev.nome}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{periodo(ev)}</td>
                  <td className="px-3 py-2.5">
                    <EtapaBadge etapa={etapaDe(ev)} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{brl(total)}</td>
                  <td data-print-hide className="whitespace-nowrap px-5 py-2.5 text-right">
                    <Botao tamanho="sm" variante="fantasma" onClick={() => irParaEvento(ev.id, 'simulador')}>
                      Abrir
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => irParaEvento(ev.id, 'ordem')}>
                      OS
                    </Botao>
                  </td>
                </tr>
              ))}
              {doRecorte.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                    Nenhum evento {incluirSim ? '' : 'aprovado '}neste período.
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

// ---------------------------------------------------------------- Aba: Andamento

function tempoDesde(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

/** Itens que passariam do saldo da Ata se o evento fosse aprovado agora */
function excessosAoAprovar(ev: Evento, usoTotal: Map<string, Uso>, usoPorEvento: Map<string, Map<string, number>>, itensPorId: Map<string, ItemAta>): number {
  const meu = usoPorEvento.get(ev.id) ?? new Map<string, number>();
  let n = 0;
  for (const [itemId, c] of meu) {
    const it = itensPorId.get(itemId);
    if (!it) continue;
    const u = usoTotal.get(itemId) ?? { consumido: 0, simulacao: 0 };
    const consumidoOutros = u.consumido - (ev.status === 'aprovado' && etapaDe(ev) !== 'cancelado' ? c : 0);
    if (c > it.qtdContratada - consumidoOutros) n += 1;
  }
  return n;
}

type FiltroAndamento = 'todos' | 'equipe' | 'fornecedor';

function AndamentoAba({
  ata,
  eventos,
  evento,
  itensPorId,
  usoTotal,
  usoPorEvento,
  selecionar,
  atualizar,
  usuario,
  compartilhado,
  avisar,
  abrirDialogo,
  irParaEvento,
  cliente,
}: {
  ata: AtaInfo;
  eventos: Evento[];
  evento: Evento | null;
  itensPorId: Map<string, ItemAta>;
  usoTotal: Map<string, Uso>;
  usoPorEvento: Map<string, Map<string, number>>;
  selecionar: (id: string) => void;
  atualizar: (id: string, patch: Partial<Evento> | ((e: Evento) => Partial<Evento>)) => void;
  usuario: string;
  compartilhado: boolean;
  avisar: (t: string, tipo?: 'ok' | 'erro') => void;
  abrirDialogo: (d: DialogoConfig) => void;
  irParaEvento: (id: string, destino: Aba) => void;
  cliente?: SupabaseClient | null;
}) {
  const [filtro, setFiltro] = useState<FiltroAndamento>('todos');
  const [grupo, setGrupo] = useState<GrupoEvento>(() => (evento ? grupoEvento(evento) : 'solicitado'));
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const abrir = cliente ? (a: Anexo) => void abrirAnexoNoNavegador(cliente, a) : undefined;
  const etapaAtual = evento ? etapaDe(evento) : 'rascunho';
  const [alvo, setAlvo] = useState<Etapa>(PROXIMA_ETAPA[etapaAtual] ?? etapaAtual);
  const [mensagem, setMensagem] = useState('');
  const [protocolo, setProtocolo] = useState(evento?.protocolo ?? '');

  useEffect(() => {
    setAlvo(PROXIMA_ETAPA[etapaAtual] ?? etapaAtual);
    setMensagem('');
    setArquivos([]);
    setProtocolo(evento?.protocolo ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id, etapaAtual]);

  const ultimaAtualizacao = (ev: Evento) => {
    const h = ev.historico ?? [];
    return h.length ? h[h.length - 1].em : ev.atualizadoEm;
  };

  const porGrupo = useMemo(() => {
    const c: Record<GrupoEvento, number> = { solicitado: 0, realizado: 0, cancelado: 0 };
    for (const ev of eventos) c[grupoEvento(ev)] += 1;
    return c;
  }, [eventos]);

  const doGrupo = useMemo(() => eventos.filter((ev) => grupoEvento(ev) === grupo), [eventos, grupo]);

  const contagem = useMemo(() => {
    const c: Record<FiltroAndamento, number> = { todos: doGrupo.length, equipe: 0, fornecedor: 0 };
    for (const ev of doGrupo) {
      const com = infoEtapa(etapaDe(ev)).com;
      if (com === 'equipe' || com === 'fornecedor') c[com] += 1;
    }
    return c;
  }, [doGrupo]);

  const lista = useMemo(
    () =>
      doGrupo
        .filter((ev) => filtro === 'todos' || infoEtapa(etapaDe(ev)).com === filtro)
        .sort((a, b) => (ultimaAtualizacao(b) ?? '').localeCompare(ultimaAtualizacao(a) ?? '')),
    [doGrupo, filtro],
  );

  const copiarConvite = async () => {
    const texto = [
      `Olá! Este é o Portal do Fornecedor do Cremesp para a ${ata.numero || 'Ata de Registro de Preços'}.`,
      `Nele vocês acompanham os eventos, revisam os orçamentos e veem cada etapa (aprovação, protocolo, nota e pagamento).`,
      ``,
      `Link: ${window.location.origin}`,
      ``,
      `No primeiro acesso, clique em "Primeiro acesso", use o e-mail cadastrado pelo Cremesp e crie uma senha.`,
    ].join('\n');
    avisar((await copiarTexto(texto)) ? 'Convite copiado. Cole no WhatsApp ou no e-mail do fornecedor.' : 'Não foi possível copiar.', 'ok');
  };

  const FILTROS: { id: FiltroAndamento; rotulo: string }[] = [
    { id: 'todos', rotulo: 'Todos' },
    { id: 'equipe', rotulo: 'Com a gente' },
    { id: 'fornecedor', rotulo: 'Com o fornecedor' },
  ];
  const GRUPOS: { id: GrupoEvento; rotulo: string }[] = [
    { id: 'solicitado', rotulo: 'Eventos solicitados' },
    { id: 'realizado', rotulo: 'Eventos realizados' },
    { id: 'cancelado', rotulo: 'Cancelados' },
  ];

  const cabecalho = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Eventos e andamento</h1>
        <p className="mt-1 text-sm text-slate-500">Eventos solicitados e realizados, com cada etapa, do orçamento com o fornecedor até o pagamento da nota.</p>
      </div>
      {compartilhado && (
        <Botao icone={<ClipboardCopy className="h-4 w-4" />} onClick={() => void copiarConvite()}>
          Copiar convite para o fornecedor
        </Botao>
      )}
    </div>
  );

  if (eventos.length === 0) {
    return (
      <div className="space-y-6">
        {cabecalho}
        <Card className="p-10 text-center text-sm text-slate-500">Nenhum evento ainda. Crie uma simulação no Simulador de Evento para começar.</Card>
      </div>
    );
  }

  /** Envia os arquivos escolhidos; devolve null se deu erro */
  const subirArquivos = async (): Promise<Anexo[] | null> => {
    if (!evento || arquivos.length === 0) return [];
    if (!cliente) {
      avisar('Anexos só funcionam no sistema compartilhado (com login).', 'erro');
      return null;
    }
    setEnviando(true);
    try {
      return await enviarAnexos(cliente, evento.id, arquivos);
    } catch (err) {
      avisar(err instanceof Error ? err.message : String(err), 'erro');
      return null;
    } finally {
      setEnviando(false);
    }
  };

  const registrar = async (soMensagem: boolean) => {
    if (!evento) return;
    if (soMensagem) {
      if (!mensagem.trim() && arquivos.length === 0) {
        avisar('Escreva a mensagem ou anexe um arquivo antes de enviar.', 'erro');
        return;
      }
      const anexos = await subirArquivos();
      if (!anexos) return;
      const entrada: Andamento = { id: uid('and'), em: new Date().toISOString(), por: usuario, lado: 'equipe', etapa: etapaAtual, acao: 'mensagem' };
      if (mensagem.trim()) entrada.mensagem = mensagem.trim();
      if (anexos.length) entrada.anexos = anexos;
      atualizar(evento.id, (e) => ({ historico: [...(e.historico ?? []), { ...entrada, etapa: etapaDe(e) }] }));
      setMensagem('');
      setArquivos([]);
      avisar('Registrado. O fornecedor vê no portal.');
      return;
    }
    if (alvo === etapaAtual) {
      avisar('Escolha uma etapa diferente da atual, ou use “Só registrar mensagem”.', 'erro');
      return;
    }
    const temItens = (usoPorEvento.get(evento.id)?.size ?? 0) > 0;
    if ((alvo === 'revisao_fornecedor' || etapaAprovada(alvo)) && !temItens) {
      avisar('Adicione itens ao evento no Simulador antes de seguir.', 'erro');
      return;
    }
    if (etapaAprovada(alvo) && evento.status !== 'aprovado') {
      const n = excessosAoAprovar(evento, usoTotal, usoPorEvento, itensPorId);
      if (n > 0) {
        avisar(`Não dá para aprovar: ${n} item(ns) passam do saldo da Ata. Ajuste no Simulador.`, 'erro');
        return;
      }
    }
    const aplicar = async () => {
      const anexos = await subirArquivos();
      if (!anexos) return;
      const prot = protocolo.trim();
      atualizar(evento.id, (e) => ({
        ...patchEtapa(e, alvo, usuario, mensagem, 'etapa', anexos),
        ...(alvo === 'protocolado' && prot ? { protocolo: prot } : {}),
      }));
      setMensagem('');
      setArquivos([]);
      avisar(`Etapa atualizada: ${infoEtapa(alvo).rotulo}.`);
    };
    const passaAprovar = etapaAprovada(alvo) && evento.status !== 'aprovado';
    const desfazAprovacao = !etapaAprovada(alvo) && evento.status === 'aprovado';
    if (alvo === 'cancelado' || passaAprovar || desfazAprovacao) {
      abrirDialogo({
        titulo: alvo === 'cancelado' ? 'Cancelar o evento?' : passaAprovar ? 'Aprovar o evento?' : 'Voltar o evento para antes da aprovação?',
        variante: alvo === 'cancelado' ? 'perigo' : 'primario',
        confirmar: alvo === 'cancelado' ? 'Cancelar evento' : 'Confirmar',
        mensagem: (
          <p>
            {alvo === 'cancelado'
              ? 'O evento deixa de abater ou reservar saldo da Ata. O histórico continua guardado.'
              : passaAprovar
                ? `O valor de ${brl(totalEvento(evento, itensPorId))} passa a ser abatido do saldo da Ata.`
                : 'O valor volta a ficar disponível no saldo da Ata até uma nova aprovação.'}
          </p>
        ),
        aoConfirmar: () => void aplicar(),
      });
      return;
    }
    await aplicar();
  };

  const caminho = ETAPAS.filter((e) => e.id !== 'ajuste_solicitado' && e.id !== 'cancelado');
  const posAtual = indiceEtapa(etapaAtual);

  return (
    <div className="space-y-6">
      {cabecalho}

      <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
        {GRUPOS.filter((g) => g.id !== 'cancelado' || porGrupo.cancelado > 0).map((g) => (
          <button
            key={g.id}
            onClick={() => {
              setGrupo(g.id);
              setFiltro('todos');
              const primeiro = eventos
                .filter((ev) => grupoEvento(ev) === g.id)
                .sort((a, b) => (ultimaAtualizacao(b) ?? '').localeCompare(ultimaAtualizacao(a) ?? ''))[0];
              if (primeiro) selecionar(primeiro.id);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${grupo === g.id ? 'bg-white text-cremesp-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {g.rotulo} <span className="ml-1 opacity-60">{porGrupo[g.id]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
              filtro === f.id ? 'bg-cremesp-700 text-white ring-cremesp-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.rotulo} <span className="ml-1 opacity-70">{contagem[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="self-start overflow-hidden">
          <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
            {lista.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => selecionar(ev.id)}
                  className={`block w-full px-4 py-3 text-left transition ${evento?.id === ev.id ? 'bg-cremesp-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">OS {ev.numero}</span>
                    <span className="text-[11px] text-slate-400">{tempoDesde(ultimaAtualizacao(ev))}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{ev.nome}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <EtapaBadge etapa={etapaDe(ev)} />
                    <span className="text-xs text-slate-500">{fmtData(ev.dataInicio)}</span>
                  </div>
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">Nenhum evento nesta aba.</li>}
          </ul>
        </Card>

        {evento ? (
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader
                titulo={`OS ${evento.numero} · ${evento.nome}`}
                subtitulo={`${periodo(evento)}${evento.local ? ` · ${evento.local}` : ''} · ${brl(totalEvento(evento, itensPorId))}${evento.protocolo ? ` · Protocolo ${evento.protocolo}` : ''}`}
                icone={<CalendarDays className="h-4 w-4" />}
                acoes={
                  <>
                    <Botao tamanho="sm" onClick={() => irParaEvento(evento.id, 'simulador')}>
                      Simulador
                    </Botao>
                    <Botao tamanho="sm" onClick={() => irParaEvento(evento.id, 'ordem')}>
                      Ordem
                    </Botao>
                  </>
                }
              />
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">Etapa atual:</span>
                  <EtapaBadge etapa={etapaAtual} />
                  <span className="text-xs text-slate-500">
                    {infoEtapa(etapaAtual).com === 'fornecedor'
                      ? 'Aguardando o fornecedor'
                      : infoEtapa(etapaAtual).com === 'equipe'
                        ? 'Próximo passo é nosso'
                        : 'Concluído'}
                  </span>
                </div>
                <ol className="flex gap-1 overflow-x-auto pb-1">
                  {caminho.map((e) => {
                    const i = indiceEtapa(e.id);
                    const feito = etapaAtual !== 'cancelado' && i < posAtual;
                    const atual = e.id === etapaAtual || (etapaAtual === 'ajuste_solicitado' && e.id === 'revisao_fornecedor');
                    return (
                      <li key={e.id} className="min-w-[84px] flex-1">
                        <div className={`h-1.5 rounded-full ${atual ? 'bg-cremesp-600' : feito ? 'bg-cremesp-300' : 'bg-slate-200'}`} />
                        <p className={`mt-1 text-[10px] leading-tight ${atual ? 'font-semibold text-cremesp-800' : feito ? 'text-slate-600' : 'text-slate-400'}`}>{e.rotulo}</p>
                      </li>
                    );
                  })}
                </ol>
                {etapaAtual === 'cancelado' && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Evento cancelado: não abate nem reserva saldo da Ata.</p>}
              </div>
            </Card>

            <Card>
              <CardHeader titulo="Registrar andamento" subtitulo="O fornecedor vê a etapa e as mensagens no portal dele." icone={<Pencil className="h-4 w-4" />} />
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <Campo rotulo="Nova etapa">
                  <select className={inputCls} value={alvo} onChange={(e) => setAlvo(e.target.value as Etapa)}>
                    {ETAPAS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.id === etapaAtual ? `${e.rotulo} (atual)` : e.rotulo}
                      </option>
                    ))}
                  </select>
                </Campo>
                {alvo === 'protocolado' ? (
                  <Campo rotulo="Nº do protocolo interno">
                    <input className={inputCls} value={protocolo} placeholder="Ex.: 12345/2026" onChange={(e) => setProtocolo(e.target.value)} />
                  </Campo>
                ) : (
                  <div className="hidden md:block" />
                )}
                <Campo rotulo="Mensagem (opcional para mudança de etapa)" className="md:col-span-2">
                  <textarea
                    className={`${inputCls} min-h-[80px]`}
                    value={mensagem}
                    placeholder="Ex.: Orçamento enviado para a diretoria, previsão de retorno na sexta."
                    onChange={(e) => setMensagem(e.target.value)}
                  />
                </Campo>
                <div className="md:col-span-2">
                  {cliente ? (
                    <SeletorAnexos arquivos={arquivos} setArquivos={setArquivos} disabled={enviando} rotulo="Anexar arquivos (orçamento, ordem, comprovantes…)" />
                  ) : (
                    <p className="text-xs text-slate-500">Anexos ficam disponíveis no sistema compartilhado, com login.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Botao variante="primario" icone={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} onClick={() => void registrar(false)} disabled={alvo === etapaAtual || enviando}>
                    {alvo === etapaAtual ? 'Escolha a nova etapa' : infoEtapa(alvo).acao}
                  </Botao>
                  <Botao onClick={() => void registrar(true)} disabled={(!mensagem.trim() && arquivos.length === 0) || enviando}>
                    Só registrar mensagem/anexo
                  </Botao>
                </div>
              </div>
            </Card>

            {(() => {
              const todos = anexosDoEvento(evento);
              if (todos.length === 0) return null;
              const notas = todos.filter((x) => x.h.acao === 'nota_fiscal');
              return (
                <Card>
                  <CardHeader titulo="Anexos do evento" subtitulo="Arquivos enviados pela equipe e pelo fornecedor. Clique para abrir." icone={<Paperclip className="h-4 w-4" />} />
                  <div className="space-y-4 p-5">
                    {notas.length > 0 && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="text-sm font-semibold text-blue-900">Nota fiscal enviada pelo fornecedor</p>
                        <ListaAnexos anexos={notas.map((x) => x.a)} abrir={abrir} />
                      </div>
                    )}
                    <ul className="divide-y divide-slate-100">
                      {todos.map(({ a, h }) => (
                        <li key={a.caminho} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <ListaAnexos anexos={[a]} abrir={abrir} />
                          <span className="text-xs text-slate-500">
                            {h.lado === 'fornecedor' ? 'Fornecedor' : 'Cremesp'} · {infoEtapa(h.etapa).rotulo} · {fmtDataHora(h.em)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              );
            })()}

            <Card>
              <CardHeader titulo="Histórico" subtitulo="Do mais recente para o mais antigo" icone={<FileText className="h-4 w-4" />} />
              <div className="p-5">
                <LinhaDoTempo historico={evento.historico ?? []} abrir={abrir} />
              </div>
            </Card>
          </div>
        ) : (
          <Card className="p-10 text-center text-sm text-slate-500">Escolha um evento na lista.</Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Aba: Configuração

function ConfigAba({
  base,
  setBase,
  usoTotal,
  avisar,
  abrirDialogo,
  aoRestaurar,
  compartilhado,
  painelEquipe,
}: {
  base: Base;
  setBase: Dispatch<SetStateAction<Base>>;
  usoTotal: Map<string, Uso>;
  avisar: (t: string, tipo?: 'ok' | 'erro') => void;
  abrirDialogo: (d: DialogoConfig) => void;
  aoRestaurar: (b: Base) => void;
  compartilhado?: boolean;
  painelEquipe?: ReactNode;
}) {
  const avisoSetor = compartilhado ? ' A mudança vale para todo o setor.' : '';
  const { ata, modulos, itens, eventos } = base;
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [novoModulo, setNovoModulo] = useState('');
  const [corNovo, setCorNovo] = useState<CorModulo>('blue');
  const [editandoModulo, setEditandoModulo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const setAta = (patch: Partial<AtaInfo>) => setBase((b) => ({ ...b, ata: { ...b.ata, ...patch } }));
  const setItem = (id: string, patch: Partial<ItemAta>) => setBase((b) => ({ ...b, itens: b.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const setModulo = (id: string, patch: Partial<Modulo>) => setBase((b) => ({ ...b, modulos: b.modulos.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  const usoEmEventos = (itemId: string) => eventos.filter((e) => (e.linhas[itemId]?.qtd ?? 0) > 0);

  const adicionarModulo = () => {
    const nome = novoModulo.trim();
    if (!nome) return;
    if (modulos.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      avisar('Já existe um módulo com esse nome.', 'erro');
      return;
    }
    setBase((b) => ({ ...b, modulos: [...b.modulos, { id: uid('mod'), nome, cor: corNovo }] }));
    setNovoModulo('');
    setCorNovo(LISTA_CORES[(LISTA_CORES.indexOf(corNovo) + 1) % LISTA_CORES.length]);
    avisar(`Módulo “${nome}” criado.`);
  };

  const excluirModulo = (m: Modulo) => {
    const n = itens.filter((i) => i.moduloId === m.id).length;
    if (n > 0) {
      avisar(`Mova ou exclua os ${n} itens do módulo antes de excluí-lo.`, 'erro');
      return;
    }
    setBase((b) => ({ ...b, modulos: b.modulos.filter((x) => x.id !== m.id) }));
    avisar('Módulo excluído.');
  };

  const adicionarItem = () => {
    const maior = itens.reduce((mx, i) => Math.max(mx, Number(i.codigo) || 0), 0);
    const moduloId = filtroModulo !== 'todos' ? filtroModulo : modulos[0]?.id ?? '';
    const novo: ItemAta = {
      id: uid('it'),
      codigo: String(maior + 1),
      descricao: 'Novo item',
      moduloId,
      unidade: 'Diária 24h',
      valorUnitario: 0,
      qtdContratada: 0,
    };
    setBase((b) => ({ ...b, itens: [...b.itens, novo] }));
    setBusca('');
    avisar(`Item ${novo.codigo} adicionado ao final da tabela.`);
  };

  const excluirItem = (it: ItemAta) => {
    const usados = usoEmEventos(it.id);
    abrirDialogo({
      titulo: `Excluir item ${it.codigo}?`,
      variante: 'perigo',
      confirmar: 'Excluir item',
      mensagem: (
        <div className="space-y-2">
          <p>{it.descricao}</p>
          {usados.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
              Ele está em {usados.length} evento(s) ({usados.map((e) => e.nome).join(', ')}) e será removido deles também.
            </p>
          )}
        </div>
      ),
      aoConfirmar: () => {
        setBase((b) => ({
          ...b,
          itens: b.itens.filter((i) => i.id !== it.id),
          eventos: b.eventos.map((e) => {
            if (!e.linhas[it.id]) return e;
            const l = { ...e.linhas };
            delete l[it.id];
            return { ...e, linhas: l };
          }),
        }));
        avisar('Item excluído.');
      },
    });
  };

  const restaurarExemplo = () =>
    abrirDialogo({
      titulo: 'Restaurar a Ata original?',
      variante: 'perigo',
      confirmar: 'Restaurar Ata original',
      mensagem: (
        <p>
          Todos os dados atuais (Ata, módulos, itens e eventos) serão substituídos pelos 77 itens da ARP nº 0099/2025 (REDXCORP), com os preços do 1º Termo Aditivo (2026–2027), sem nenhum evento. Exporte
          um backup antes se quiser guardar o que está aqui.{avisoSetor}
        </p>
      ),
      aoConfirmar: () => {
        const b = criarBaseExemplo();
        setBase(b);
        aoRestaurar(b);
        avisar('Ata original restaurada.');
      },
    });

  const comecarDoZero = () =>
    abrirDialogo({
      titulo: 'Começar uma Ata em branco?',
      variante: 'perigo',
      confirmar: 'Apagar e começar do zero',
      mensagem: <p>Todos os módulos, itens e eventos serão apagados. Os dados do contratante são mantidos.{avisoSetor}</p>,
      aoConfirmar: () => {
        const b = criarBaseVazia();
        setBase((atual) => ({ ...b, ata: { ...b.ata, contratante: atual.ata.contratante, gestor: atual.ata.gestor, fiscal: atual.ata.fiscal, cnpjContratante: atual.ata.cnpjContratante, enderecoContratante: atual.ata.enderecoContratante, uasg: atual.ata.uasg, cidade: atual.ata.cidade } }));
        aoRestaurar(b);
        avisar('Ata em branco criada.');
      },
    });

  const exportar = () => {
    const blob = new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gestor-atas-${(ata.numero || 'ata').replace(/[^\w]+/g, '-').toLowerCase()}-${hojeISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    avisar('Backup exportado.');
  };

  const importar = (arquivo: File) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const b = JSON.parse(String(leitor.result)) as Base;
        if (!b || b.versao !== 1 || !Array.isArray(b.itens) || !Array.isArray(b.modulos) || !Array.isArray(b.eventos) || !b.ata) throw new Error('formato');
        const normalizada = normalizarBase(b);
        setBase(normalizada);
        aoRestaurar(normalizada);
        avisar('Backup importado com sucesso.');
      } catch {
        avisar('Arquivo inválido. Use um backup exportado por este sistema.', 'erro');
      }
    };
    leitor.readAsText(arquivo);
  };

  const termo = busca.trim().toLowerCase();
  const itensFiltrados = itens.filter(
    (it) => (filtroModulo === 'todos' || it.moduloId === filtroModulo) && (!termo || `${it.codigo} ${it.descricao}`.toLowerCase().includes(termo)),
  );
  const totalAta = itens.reduce((s, i) => s + i.valorUnitario * i.qtdContratada, 0);

  const campoAta = (rotulo: string, chave: keyof AtaInfo, className = '', tipo = 'text') => (
    <Campo rotulo={rotulo} className={className}>
      <input type={tipo} className={inputCls} value={ata[chave]} onChange={(e) => setAta({ [chave]: e.target.value } as Partial<AtaInfo>)} />
    </Campo>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Configuração da Ata</h1>
          <p className="mt-1 text-sm text-slate-500">Dados do contrato, módulos e itens registrados. Tudo é salvo automaticamente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao icone={<Download className="h-4 w-4" />} onClick={exportar}>
            Exportar backup
          </Botao>
          <Botao icone={<Upload className="h-4 w-4" />} onClick={() => arquivoRef.current?.click()}>
            Importar backup
          </Botao>
          <input
            ref={arquivoRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f);
              e.target.value = '';
            }}
          />
          <Botao icone={<RotateCcw className="h-4 w-4" />} onClick={restaurarExemplo}>
            Restaurar Ata original
          </Botao>
          <Botao variante="perigo" icone={<Trash2 className="h-4 w-4" />} onClick={comecarDoZero}>
            Ata em branco
          </Botao>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader titulo="Dados do contrato" subtitulo="Aparecem no cabeçalho da Ordem de Orçamento" icone={<FileText className="h-4 w-4" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {campoAta('Nome / número da Ata', 'numero', 'lg:col-span-2')}
            {campoAta('Pregão', 'pregao')}
            {campoAta('Processo', 'processo')}
            <Campo rotulo="Objeto" className="sm:col-span-2 lg:col-span-4">
              <textarea className={`${inputCls} min-h-[60px]`} value={ata.objeto} onChange={(e) => setAta({ objeto: e.target.value })} />
            </Campo>
            {campoAta('Fornecedor vencedor', 'fornecedor', 'lg:col-span-2')}
            {campoAta('CNPJ do fornecedor', 'cnpj')}
            <div className="grid grid-cols-2 gap-2">
              {campoAta('Vigência: início', 'vigenciaInicio', '', 'date')}
              {campoAta('Vigência: fim', 'vigenciaFim', '', 'date')}
            </div>
            {campoAta('Contato / responsável', 'contato', 'lg:col-span-2')}
            {campoAta('Telefone', 'telefone')}
            {campoAta('E-mail', 'email')}
            {campoAta('Endereço do fornecedor', 'enderecoFornecedor', 'sm:col-span-2 lg:col-span-4')}
          </div>
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Contratante (órgão gerenciador)</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {campoAta('Instituição', 'contratante', 'lg:col-span-2')}
              {campoAta('CNPJ', 'cnpjContratante')}
              {campoAta('UASG', 'uasg')}
              {campoAta('Endereço', 'enderecoContratante', 'lg:col-span-3')}
              {campoAta('Cidade (assinatura)', 'cidade')}
              {campoAta('Gestor(a) da Ata', 'gestor', 'lg:col-span-2')}
              {campoAta('Fiscal da Ata', 'fiscal', 'lg:col-span-2')}
              {campoAta('Coordenador(a) que assina a ordem', 'coordenador', 'lg:col-span-2')}
              {campoAta('Cargo do(a) coordenador(a)', 'cargoCoordenador', 'lg:col-span-2')}
              {campoAta('Responsável técnico padrão dos eventos', 'responsavelTecnico', 'lg:col-span-2')}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Módulos" subtitulo="Categorias para agrupar os itens" icone={<Layers className="h-4 w-4" />} />
          <div className="divide-y divide-slate-100">
            {modulos.map((m) => {
              const n = itens.filter((i) => i.moduloId === m.id).length;
              const editando = editandoModulo === m.id;
              return (
                <div key={m.id} className="flex items-center gap-2 px-5 py-2.5">
                  <div className="relative">
                    <select
                      aria-label="Cor do módulo"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      value={m.cor}
                      onChange={(e) => setModulo(m.id, { cor: e.target.value as CorModulo })}
                    >
                      {LISTA_CORES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span className={`block h-4 w-4 rounded-full ring-2 ring-white ring-offset-1 ring-offset-slate-200 ${CORES[m.cor].dot}`} />
                  </div>
                  {editando ? (
                    <input
                      autoFocus
                      className={inputSmCls}
                      value={m.nome}
                      onChange={(e) => setModulo(m.id, { nome: e.target.value })}
                      onBlur={() => setEditandoModulo(null)}
                      onKeyDown={(e) => e.key === 'Enter' && setEditandoModulo(null)}
                    />
                  ) : (
                    <button className="min-w-0 flex-1 truncate text-left text-sm text-slate-800" onClick={() => setFiltroModulo(m.id)} title="Filtrar itens deste módulo">
                      {m.nome}
                    </button>
                  )}
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 text-xs text-slate-500">{n}</span>
                  <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setEditandoModulo(editando ? null : m.id)} aria-label="Renomear módulo">
                    {editando ? <Check className="h-4 w-4" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                  <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => excluirModulo(m)} aria-label="Excluir módulo">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {modulos.length === 0 && <p className="px-5 py-4 text-sm text-slate-500">Nenhum módulo. Crie o primeiro abaixo.</p>}
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Novo módulo (ex.: Cenografia)"
                value={novoModulo}
                onChange={(e) => setNovoModulo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adicionarModulo()}
              />
              <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={adicionarModulo} disabled={!novoModulo.trim()} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LISTA_CORES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCorNovo(c)}
                  aria-label={`Cor ${c}`}
                  className={`h-5 w-5 rounded-full ${CORES[c].dot} ${corNovo === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                />
              ))}
            </div>
          </div>
        </Card>
      </div>

      {painelEquipe}

      <Card>
        <CardHeader
          titulo="Itens da Ata"
          subtitulo={`${itens.length} itens · valor total registrado ${brl(totalAta)} · edite direto na tabela`}
          icone={<Package className="h-4 w-4" />}
          acoes={
            <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={adicionarItem} disabled={modulos.length === 0} title={modulos.length === 0 ? 'Crie um módulo primeiro' : undefined}>
              Adicionar item
            </Botao>
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-9`} placeholder="Buscar por código ou descrição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFiltroModulo('todos')}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filtroModulo === 'todos' ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}
            >
              Todos
            </button>
            {modulos.map((m) => (
              <button
                key={m.id}
                onClick={() => setFiltroModulo(m.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  filtroModulo === m.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${CORES[m.cor].dot}`} />
                {m.nome}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-20 px-3 py-2.5 pl-5">Item</th>
                <th className="px-3 py-2.5">Descrição técnica</th>
                <th className="w-52 px-3 py-2.5">Módulo</th>
                <th className="w-36 px-3 py-2.5">Unidade</th>
                <th className="w-32 px-3 py-2.5 text-right">Valor unit. (R$)</th>
                <th className="w-28 px-3 py-2.5 text-right">Qtd. contratada</th>
                <th className="w-36 px-3 py-2.5 text-right">Total registrado</th>
                <th className="w-12 px-3 py-2.5 pr-5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itensFiltrados.map((it) => {
                const consumido = usoTotal.get(it.id)?.consumido ?? 0;
                const abaixo = it.qtdContratada < consumido;
                return (
                  <tr key={it.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-3 py-2 pl-5">
                      <input className={`${inputSmCls} text-center`} value={it.codigo} onChange={(e) => setItem(it.id, { codigo: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <textarea rows={2} className={`${inputSmCls} resize-y leading-snug`} value={it.descricao} onChange={(e) => setItem(it.id, { descricao: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <select className={inputSmCls} value={it.moduloId} onChange={(e) => setItem(it.id, { moduloId: e.target.value })}>
                        {!modulos.some((m) => m.id === it.moduloId) && <option value={it.moduloId}>Sem módulo</option>}
                        {modulos.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select className={inputSmCls} value={it.unidade} onChange={(e) => setItem(it.id, { unidade: e.target.value as Unidade })}>
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <NumeroInput valor={it.valorUnitario} step={0.01} onChange={(v) => setItem(it.id, { valorUnitario: v })} ariaLabel={`Valor unitário do item ${it.codigo}`} />
                      <p className="mt-0.5 text-right text-[11px] text-slate-400">{brl(it.valorUnitario)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <NumeroInput valor={it.qtdContratada} onChange={(v) => setItem(it.id, { qtdContratada: v })} erro={abaixo} ariaLabel={`Quantidade contratada do item ${it.codigo}`} />
                      <p className={`mt-0.5 text-right text-[11px] ${abaixo ? 'font-medium text-rose-600' : 'text-slate-400'}`}>
                        {abaixo ? `Abaixo do consumido (${num(consumido)})` : consumido > 0 ? `${num(consumido)} consumidos` : ' '}
                      </p>
                    </td>
                    <td className="px-3 py-2 pt-3 text-right font-medium tabular-nums text-slate-700">{brl(it.valorUnitario * it.qtdContratada)}</td>
                    <td className="px-3 py-2 pr-5 pt-2.5">
                      <button className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => excluirItem(it)} aria-label={`Excluir item ${it.codigo}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {itensFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-500">
                    {itens.length === 0 ? 'Nenhum item cadastrado. Use “Adicionar item” ou restaure a Ata original.' : 'Nenhum item encontrado com esse filtro.'}
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

// ---------------------------------------------------------------- CSS de impressão

const CSS_IMPRESSAO = `
.folha-a4 { width: 210mm; min-height: 297mm; padding: 16mm 15mm; box-sizing: border-box; }
.tabela-ordem thead { display: table-header-group; }
.tabela-ordem tfoot { display: table-row-group; }
.tabela-ordem tr, .evitar-quebra { break-inside: avoid; page-break-inside: avoid; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; }
  [data-print-hide] { display: none !important; }
  main { padding-left: 0 !important; }
  main > div { max-width: none !important; padding: 0 !important; margin: 0 !important; }
  .folha-a4 { width: auto; min-height: 0; padding: 0; box-shadow: none !important; border: 0 !important; --tw-ring-shadow: 0 0 #0000 !important; }
  .print\\:hidden { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/* ============================================================================
 * Modo compartilhado (Supabase)
 * Com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas, o sistema exige
 * login (e-mail e senha), guarda tudo na tabela `registros` e sincroniza em tempo
 * real entre todos os membros. Sem elas, funciona sozinho no navegador.
 * ========================================================================== */

type Colecao = 'ata' | 'modulos' | 'itens' | 'eventos';
interface Registro {
  colecao: Colecao;
  id: string;
  ordem: number;
  dados: unknown;
}
type StatusSync = 'sincronizado' | 'salvando' | 'erro';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const chaveRegistro = (c: string, id: string) => `${c}:${id}`;

// ----- Anexos (Supabase Storage)
const BUCKET_ANEXOS = 'anexos';

function nomeSeguro(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-');
  return limpo.slice(-80) || 'arquivo';
}

async function enviarAnexos(cliente: SupabaseClient, eventoId: string, arquivos: File[]): Promise<Anexo[]> {
  const enviados: Anexo[] = [];
  for (const f of arquivos) {
    if (f.size > LIMITE_ANEXO) throw new Error(`"${f.name}" passa de 20 MB.`);
    const caminho = `eventos/${eventoId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${nomeSeguro(f.name)}`;
    const { error } = await cliente.storage.from(BUCKET_ANEXOS).upload(caminho, f, { contentType: f.type || 'application/octet-stream', upsert: false });
    if (error) {
      throw new Error(
        /bucket not found/i.test(error.message)
          ? 'O armazenamento de anexos ainda não foi ativado. Rode o script supabase/anexos.sql no Supabase.'
          : `Não foi possível enviar "${f.name}": ${error.message}`,
      );
    }
    enviados.push({ nome: f.name, caminho, tamanho: f.size, tipo: f.type });
  }
  return enviados;
}

async function abrirAnexoNoNavegador(cliente: SupabaseClient, a: Anexo): Promise<void> {
  // Abre a aba antes do await para o navegador não bloquear o pop-up
  const janela = window.open('', '_blank');
  const { data, error } = await cliente.storage.from(BUCKET_ANEXOS).createSignedUrl(a.caminho, 600);
  if (error || !data) {
    janela?.close();
    window.alert(`Não foi possível abrir o anexo. ${error?.message ?? ''}`);
    return;
  }
  if (janela) janela.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

function baseParaRegistros(b: Base): Map<string, Registro> {
  const m = new Map<string, Registro>();
  m.set(chaveRegistro('ata', 'principal'), { colecao: 'ata', id: 'principal', ordem: 0, dados: b.ata });
  b.modulos.forEach((x, i) => m.set(chaveRegistro('modulos', x.id), { colecao: 'modulos', id: x.id, ordem: i, dados: x }));
  b.itens.forEach((x, i) => m.set(chaveRegistro('itens', x.id), { colecao: 'itens', id: x.id, ordem: i, dados: x }));
  b.eventos.forEach((x, i) => m.set(chaveRegistro('eventos', x.id), { colecao: 'eventos', id: x.id, ordem: i, dados: x }));
  return m;
}

const assinatura = (r: Registro) => JSON.stringify([r.ordem, r.dados]);

function registrosParaBase(lista: Registro[]): Base {
  const ord = (c: Colecao) => lista.filter((r) => r.colecao === c).sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  const ata = ord('ata')[0]?.dados as AtaInfo | undefined;
  return normalizarBase({
    versao: 1,
    ata: ata ?? criarBaseVazia().ata,
    modulos: ord('modulos').map((r) => r.dados as Modulo),
    itens: ord('itens').map((r) => r.dados as ItemAta),
    eventos: ord('eventos').map((r) => r.dados as Evento),
  });
}

/** Aplica no estado local uma linha que mudou no servidor (ou foi apagada). */
function aplicarRegistro(b: Base, colecao: Colecao, id: string, reg: Registro | null): Base {
  if (colecao === 'ata') return reg ? { ...b, ata: { ...criarBaseVazia().ata, ...(reg.dados as AtaInfo) } } : b;
  const lista = b[colecao] as { id: string }[];
  const sem = lista.filter((x) => x.id !== id);
  if (!reg) return { ...b, [colecao]: sem };
  const pos = Math.min(Math.max(0, reg.ordem), sem.length);
  const nova = [...sem.slice(0, pos), reg.dados as { id: string }, ...sem.slice(pos)];
  return { ...b, [colecao]: nova };
}

function useSincronizacao(cliente: SupabaseClient, base: Base, setBase: Dispatch<SetStateAction<Base>>, sincronizadoInicial: Map<string, string>) {
  const sincronizado = useRef(sincronizadoInicial);
  const baseRef = useRef(base);
  baseRef.current = base;
  const [status, setStatus] = useState<StatusSync>('sincronizado');
  const enviando = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const enviar = useCallback(async () => {
    if (enviando.current) return;
    const atual = baseParaRegistros(baseRef.current);
    const alterados: Registro[] = [];
    for (const [k, r] of atual) if (sincronizado.current.get(k) !== assinatura(r)) alterados.push(r);
    const removidos: { colecao: string; id: string; k: string }[] = [];
    for (const k of sincronizado.current.keys()) {
      if (!atual.has(k)) {
        const i = k.indexOf(':');
        removidos.push({ colecao: k.slice(0, i), id: k.slice(i + 1), k });
      }
    }
    if (alterados.length === 0 && removidos.length === 0) {
      setStatus('sincronizado');
      return;
    }
    enviando.current = true;
    setStatus('salvando');
    try {
      if (alterados.length) {
        const { error } = await cliente.from('registros').upsert(alterados.map((r) => ({ colecao: r.colecao, id: r.id, ordem: r.ordem, dados: r.dados })));
        if (error) throw error;
        for (const r of alterados) sincronizado.current.set(chaveRegistro(r.colecao, r.id), assinatura(r));
      }
      for (const c of new Set(removidos.map((r) => r.colecao))) {
        const ids = removidos.filter((r) => r.colecao === c).map((r) => r.id);
        const { error } = await cliente.from('registros').delete().eq('colecao', c).in('id', ids);
        if (error) throw error;
      }
      for (const r of removidos) sincronizado.current.delete(r.k);
      enviando.current = false;
      // Pode ter havido novas edições durante o envio
      const pendente = [...baseParaRegistros(baseRef.current)].some(([k, r]) => sincronizado.current.get(k) !== assinatura(r));
      if (pendente) void enviar();
      else setStatus('sincronizado');
    } catch {
      enviando.current = false;
      setStatus('erro');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void enviar(), 5000);
    }
  }, [cliente]);

  // Envia as alterações locais pouco depois de cada edição
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void enviar(), 600);
    return () => window.clearTimeout(timer.current);
  }, [base, enviar]);

  // Recebe as alterações dos colegas em tempo real
  useEffect(() => {
    const canal = cliente
      .channel('registros-gestor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, (payload) => {
        const novo = payload.new as Partial<Registro> | null;
        const antigo = payload.old as Partial<Registro> | null;
        const colecao = (novo?.colecao ?? antigo?.colecao) as Colecao | undefined;
        const id = novo?.id ?? antigo?.id;
        if (!colecao || !id) return;
        const k = chaveRegistro(colecao, id);
        const local = baseParaRegistros(baseRef.current).get(k);
        const sujo = !!local && sincronizado.current.get(k) !== assinatura(local);
        if (payload.eventType === 'DELETE') {
          sincronizado.current.delete(k);
          if (!sujo) setBase((b) => aplicarRegistro(b, colecao, id, null));
          return;
        }
        const reg: Registro = { colecao, id, ordem: novo?.ordem ?? 0, dados: novo?.dados };
        sincronizado.current.set(k, assinatura(reg));
        if (sujo) return; // há edição local pendente nesta linha: a versão local será enviada
        if (local && assinatura(local) === assinatura(reg)) return;
        setBase((b) => aplicarRegistro(b, colecao, id, reg));
      })
      .subscribe();
    return () => {
      void cliente.removeChannel(canal);
    };
  }, [cliente, setBase]);

  // Avisa antes de fechar com alterações ainda não enviadas
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (status !== 'sincronizado') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [status]);

  return status;
}

function TelaCentral({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <img src={logoCremesp} alt="Cremesp" className="h-12 w-auto" />
        </div>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}

function TelaLogin({ cliente }: { cliente: SupabaseClient }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);

  const traduzir = (m: string) =>
    /invalid login credentials/i.test(m)
      ? 'E-mail ou senha incorretos.'
      : /already registered/i.test(m)
        ? 'Esse e-mail já tem senha. Use “Entrar”.'
        : /at least 6/i.test(m)
          ? 'A senha precisa ter pelo menos 6 caracteres.'
          : m;

  const enviar = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes('@') || senha.length < 6) {
      setMsg({ tipo: 'erro', texto: 'Informe o e-mail e uma senha com pelo menos 6 caracteres.' });
      return;
    }
    setEnviando(true);
    setMsg(null);
    if (modo === 'entrar') {
      const { error } = await cliente.auth.signInWithPassword({ email: e, password: senha });
      if (error) setMsg({ tipo: 'erro', texto: traduzir(error.message) });
    } else {
      const { data, error } = await cliente.auth.signUp({ email: e, password: senha, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
      if (error) setMsg({ tipo: 'erro', texto: traduzir(error.message) });
      else if (!data.session) setMsg({ tipo: 'ok', texto: 'Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.' });
    }
    setEnviando(false);
  };

  return (
    <TelaCentral>
      <h1 className="text-base font-semibold text-slate-900">Gestor de Atas · Cremesp</h1>
      <p className="mt-0.5 text-xs text-slate-500">Equipe do Cremesp e fornecedores entram por aqui.</p>
      <div className="mt-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(['entrar', 'criar'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setModo(m);
              setMsg(null);
            }}
            className={`rounded-md py-1.5 ${modo === m ? 'bg-white text-cremesp-800 shadow-sm' : 'text-slate-500'}`}
          >
            {m === 'entrar' ? 'Entrar' : 'Primeiro acesso'}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">
        {modo === 'entrar' ? 'Use o e-mail e a senha que você criou.' : 'Crie sua senha. Seu e-mail precisa ter sido autorizado pelo setor.'}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          void enviar();
        }}
      >
        <Campo rotulo="E-mail">
          <input id="email-login" type="email" required autoComplete="email" className={inputCls} value={email} placeholder="nome@cremesp.org.br" onChange={(ev) => setEmail(ev.target.value)} />
        </Campo>
        <Campo rotulo={modo === 'entrar' ? 'Senha' : 'Crie uma senha (mínimo 6 caracteres)'}>
          <input
            id="senha-login"
            type="password"
            required
            minLength={6}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            className={inputCls}
            value={senha}
            onChange={(ev) => setSenha(ev.target.value)}
          />
        </Campo>
        {msg && <p className={`text-sm ${msg.tipo === 'erro' ? 'text-rose-700' : 'text-cremesp-800'}`}>{msg.texto}</p>}
        <button type="submit" disabled={enviando} className="flex w-full items-center justify-center gap-2 rounded-lg bg-cremesp-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-cremesp-800 disabled:opacity-60">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {modo === 'entrar' ? 'Entrar' : 'Criar senha e entrar'}
        </button>
      </form>
      <p className="mt-5 text-xs text-slate-400">Só e-mails autorizados pelo setor conseguem ver os dados. Esqueceu a senha? Peça ao responsável pelo sistema para redefinir.</p>
    </TelaCentral>
  );
}

function PainelConta({ email, status, sair }: { email: string; status: StatusSync; sair: () => void }) {
  const estilo: Record<StatusSync, { txt: string; cls: string; icone: ReactNode }> = {
    sincronizado: { txt: 'Salvo para o setor', cls: 'text-cremesp-700', icone: <Cloud className="h-3.5 w-3.5" /> },
    salvando: { txt: 'Salvando…', cls: 'text-slate-500', icone: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    erro: { txt: 'Sem conexão, tentando de novo', cls: 'text-rose-700', icone: <CloudOff className="h-3.5 w-3.5" /> },
  };
  const e = estilo[status];
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 font-medium ${e.cls}`}>
          {e.icone}
          {e.txt}
        </p>
        <p className="truncate text-slate-500" title={email}>
          {email}
        </p>
      </div>
      <button onClick={sair} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Sair" aria-label="Sair">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function PainelEquipe({ cliente, meuEmail }: { cliente: SupabaseClient; meuEmail: string }) {
  const [membros, setMembros] = useState<{ email: string; adicionado_por: string | null; papel?: string | null }[]>([]);
  const [novo, setNovo] = useState('');
  const [papel, setPapel] = useState<'equipe' | 'fornecedor'>('equipe');
  const [temPapel, setTemPapel] = useState(true);
  const [msg, setMsg] = useState('');
  const carregar = useCallback(async () => {
    const r = await cliente.from('membros').select('email, adicionado_por, papel').order('email');
    if (!r.error) {
      setTemPapel(true);
      setMembros(r.data ?? []);
      return;
    }
    // Banco ainda sem a coluna "papel" (script do portal do fornecedor não rodado)
    setTemPapel(false);
    const { data } = await cliente.from('membros').select('email, adicionado_por').order('email');
    setMembros(data ?? []);
  }, [cliente]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const adicionar = async () => {
    const e = novo.trim().toLowerCase();
    if (!e.includes('@')) return;
    if (papel === 'fornecedor' && !temPapel) {
      setMsg('Para cadastrar fornecedor, rode antes o script supabase/portal-fornecedor.sql no Supabase (veja o guia).');
      return;
    }
    const linha: Record<string, string> = { email: e, adicionado_por: meuEmail };
    if (papel === 'fornecedor') linha.papel = papel;
    const { error } = await cliente.from('membros').insert(linha);
    setMsg(
      error
        ? error.code === '23505'
          ? 'Esse e-mail já tem acesso.'
          : `Erro: ${error.message}`
        : papel === 'fornecedor'
          ? `${e} agora acessa o Portal do Fornecedor. Use “Copiar convite” na aba Andamento para enviar o link.`
          : `${e} agora tem acesso. Envie o link do sistema: no primeiro acesso a pessoa cria a senha.`,
    );
    if (!error) setNovo('');
    void carregar();
  };
  const remover = async (e: string) => {
    if (e === meuEmail) {
      setMsg('Você não pode remover o seu próprio acesso.');
      return;
    }
    const { error } = await cliente.from('membros').delete().eq('email', e);
    setMsg(error ? `Erro: ${error.message}` : `Acesso de ${e} removido.`);
    void carregar();
  };
  return (
    <Card>
      <CardHeader
        titulo="Quem tem acesso"
        subtitulo="Equipe edita tudo. Fornecedor só vê os eventos enviados a ele e responde pelo portal."
        icone={<Users className="h-4 w-4" />}
      />
      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {membros.map((m) => (
            <li key={m.email} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-800">
                {m.email}
                {m.email === meuEmail && <span className="ml-2 text-xs text-slate-400">(você)</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                    m.papel === 'fornecedor' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-cremesp-50 text-cremesp-800 ring-cremesp-200'
                  }`}
                >
                  {m.papel === 'fornecedor' ? 'Fornecedor' : 'Equipe'}
                </span>
                {m.email !== meuEmail && (
                  <button className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => void remover(m.email)} aria-label={`Remover ${m.email}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
          {membros.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Carregando…</li>}
        </ul>
        <div>
          <div className="flex flex-wrap gap-2">
            <input
              id="novo-membro"
              type="email"
              className={`${inputCls} min-w-[200px] flex-1`}
              placeholder="email@exemplo.com.br"
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void adicionar()}
            />
            <select className={`${inputCls} w-auto`} value={papel} onChange={(e) => setPapel(e.target.value as 'equipe' | 'fornecedor')} aria-label="Tipo de acesso">
              <option value="equipe">Equipe Cremesp</option>
              <option value="fornecedor">Fornecedor</option>
            </select>
            <Botao variante="primario" icone={<Plus className="h-4 w-4" />} onClick={() => void adicionar()} disabled={!novo.includes('@')}>
              Dar acesso
            </Botao>
          </div>
          {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}
          <p className="mt-3 text-xs text-slate-500">
            Depois de dar acesso, envie o endereço do sistema para a pessoa. No primeiro acesso ela cria a própria senha. O fornecedor entra pelo mesmo link e vê
            só o Portal do Fornecedor.
          </p>
          {!temPapel && (
            <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              O portal do fornecedor ainda não foi ativado no banco. Rode o script <strong>supabase/portal-fornecedor.sql</strong> no Supabase.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Portal do fornecedor

type AcaoFornecedor = 'confirmar' | 'ajuste' | 'mensagem' | 'nota_fiscal';
const ETAPAS_NOTA_FISCAL: Etapa[] = ['aprovado', 'protocolado', 'os_enviada', 'realizado', 'nota_recebida'];

function PortalFornecedor({ cliente, email, inicial }: { cliente: SupabaseClient; email: string; inicial: Base }) {
  const [base, setBase] = useState<Base>(inicial);
  const [selId, setSelId] = useState<string>('');
  const [texto, setTexto] = useState('');
  const [textoMsg, setTextoMsg] = useState('');
  const [textoNota, setTextoNota] = useState('');
  const [arqRevisao, setArqRevisao] = useState<File[]>([]);
  const [arqMsg, setArqMsg] = useState<File[]>([]);
  const [arqNota, setArqNota] = useState<File[]>([]);
  const [abaPortal, setAbaPortal] = useState<'solicitado' | 'realizado'>('solicitado');
  const [enviando, setEnviando] = useState(false);
  const abrir = (a: Anexo) => void abrirAnexoNoNavegador(cliente, a);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Recebe em tempo real o que a equipe do Cremesp altera
  useEffect(() => {
    const canal = cliente
      .channel('registros-fornecedor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, (payload) => {
        const novo = payload.new as Partial<Registro> | null;
        const antigo = payload.old as Partial<Registro> | null;
        const colecao = (novo?.colecao ?? antigo?.colecao) as Colecao | undefined;
        const id = novo?.id ?? antigo?.id;
        if (!colecao || !id) return;
        if (payload.eventType === 'DELETE') setBase((b) => aplicarRegistro(b, colecao, id, null));
        else setBase((b) => aplicarRegistro(b, colecao, id, { colecao, id, ordem: novo?.ordem ?? 0, dados: novo?.dados }));
      })
      .subscribe();
    return () => {
      void cliente.removeChannel(canal);
    };
  }, [cliente]);

  const { ata, itens, modulos } = base;
  const eventos = useMemo(() => base.eventos.filter((e) => etapaDe(e) !== 'rascunho'), [base.eventos]);
  const itensPorId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const modulosPorId = useMemo(() => new Map(modulos.map((m) => [m.id, m])), [modulos]);
  const hoje = hojeISO();

  const grupos = useMemo(() => {
    const porData = (a: Evento, b: Evento) => a.dataInicio.localeCompare(b.dataInicio);
    const precisaSol: Evento[] = [];
    const solicitados: Evento[] = [];
    const precisaReal: Evento[] = [];
    const realizados: Evento[] = [];
    const cancelados: Evento[] = [];
    for (const ev of eventos) {
      const g = grupoEvento(ev, hoje);
      const precisa = infoEtapa(etapaDe(ev)).com === 'fornecedor';
      if (g === 'cancelado') cancelados.push(ev);
      else if (g === 'realizado') (precisa ? precisaReal : realizados).push(ev);
      else (precisa ? precisaSol : solicitados).push(ev);
    }
    return {
      precisaSol: precisaSol.sort(porData),
      solicitados: solicitados.sort(porData),
      precisaReal: precisaReal.sort(porData).reverse(),
      realizados: realizados.sort(porData).reverse(),
      cancelados: cancelados.sort(porData).reverse(),
    };
  }, [eventos, hoje]);
  const nSolicitados = grupos.precisaSol.length + grupos.solicitados.length;
  const nRealizados = grupos.precisaReal.length + grupos.realizados.length + grupos.cancelados.length;
  const nPrecisa = grupos.precisaSol.length + grupos.precisaReal.length;
  const daAba =
    abaPortal === 'solicitado'
      ? [...grupos.precisaSol, ...grupos.solicitados]
      : [...grupos.precisaReal, ...grupos.realizados, ...grupos.cancelados];

  const evento = eventos.find((e) => e.id === selId) ?? daAba[0] ?? null;
  const etapa = evento ? etapaDe(evento) : 'rascunho';

  useEffect(() => {
    setTexto('');
    setTextoMsg('');
    setTextoNota('');
    setArqRevisao([]);
    setArqMsg([]);
    setArqNota([]);
    setAviso(null);
  }, [evento?.id]);

  const linhas = useMemo(() => {
    if (!evento) return [];
    return Object.entries(evento.linhas)
      .map(([itemId, l]) => ({ it: itensPorId.get(itemId), l }))
      .filter((x): x is { it: ItemAta; l: LinhaEvento } => !!x.it && consumoLinha(x.l) > 0)
      .sort((a, b) => (Number(a.it.codigo) || 0) - (Number(b.it.codigo) || 0) || a.it.codigo.localeCompare(b.it.codigo));
  }, [evento, itensPorId]);
  const total = linhas.reduce((s, x) => s + consumoLinha(x.l) * x.it.valorUnitario, 0);

  const agir = async (acao: AcaoFornecedor) => {
    if (!evento) return;
    const conteudo = (acao === 'mensagem' ? textoMsg : acao === 'nota_fiscal' ? textoNota : texto).trim();
    const arquivos = acao === 'mensagem' ? arqMsg : acao === 'nota_fiscal' ? arqNota : arqRevisao;
    if (acao === 'ajuste' && !conteudo) {
      setAviso({ tipo: 'erro', texto: 'Descreva o ajuste que precisa ser feito.' });
      return;
    }
    if (acao === 'mensagem' && !conteudo && arquivos.length === 0) {
      setAviso({ tipo: 'erro', texto: 'Escreva a mensagem ou anexe um arquivo.' });
      return;
    }
    if (acao === 'nota_fiscal' && arquivos.length === 0) {
      setAviso({ tipo: 'erro', texto: 'Anexe o arquivo da nota fiscal (PDF ou XML).' });
      return;
    }
    setEnviando(true);
    setAviso(null);
    let anexos: Anexo[] = [];
    try {
      anexos = await enviarAnexos(cliente, evento.id, arquivos);
    } catch (err) {
      setEnviando(false);
      setAviso({ tipo: 'erro', texto: err instanceof Error ? err.message : String(err) });
      return;
    }
    const params: Record<string, unknown> = { p_evento: evento.id, p_acao: acao, p_mensagem: conteudo };
    if (anexos.length) params.p_anexos = anexos;
    const { data, error } = await cliente.rpc('fornecedor_acao', params);
    setEnviando(false);
    if (error) {
      setAviso({ tipo: 'erro', texto: `Não foi possível enviar. ${error.message}` });
      return;
    }
    if (data) setBase((b) => ({ ...b, eventos: b.eventos.map((e) => (e.id === evento.id ? (data as Evento) : e)) }));
    if (acao === 'mensagem') {
      setTextoMsg('');
      setArqMsg([]);
    } else if (acao === 'nota_fiscal') {
      setTextoNota('');
      setArqNota([]);
    } else {
      setTexto('');
      setArqRevisao([]);
    }
    setAviso({
      tipo: 'ok',
      texto:
        acao === 'confirmar'
          ? 'Orçamento confirmado. O Cremesp já foi avisado no painel.'
          : acao === 'ajuste'
            ? 'Pedido de ajuste enviado ao Cremesp.'
            : acao === 'nota_fiscal'
              ? 'Nota fiscal enviada ao Cremesp.'
              : 'Mensagem enviada ao Cremesp.',
    });
  };

  const Secao = ({ titulo, lista, vazio }: { titulo: string; lista: Evento[]; vazio: string }) => (
    <div>
      <p className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {titulo} <span className="text-slate-400">({lista.length})</span>
      </p>
      <ul className="divide-y divide-slate-100">
        {lista.map((ev) => (
          <li key={ev.id}>
            <button onClick={() => setSelId(ev.id)} className={`block w-full px-4 py-3 text-left transition ${evento?.id === ev.id ? 'bg-cremesp-50' : 'hover:bg-slate-50'}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>OS {ev.numero}</span>
                <span>{fmtData(ev.dataInicio)}</span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{ev.nome}</p>
              <div className="mt-1.5">
                <EtapaBadge etapa={etapaDe(ev)} fornecedor />
              </div>
            </button>
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-2 text-sm text-slate-400">{vazio}</li>}
      </ul>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <style>{CSS_IMPRESSAO}</style>
      <header data-print-hide className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={iconeCremesp} alt="Cremesp" className="h-9 w-9" />
            <div>
              <p className="text-sm font-semibold leading-tight">Portal do Fornecedor · Cremesp</p>
              <p className="text-xs text-slate-500">
                {ata.numero} · {ata.fornecedor}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">{email}</span>
            <Botao tamanho="sm" icone={<LogOut className="h-3.5 w-3.5" />} onClick={() => void cliente.auth.signOut()}>
              Sair
            </Botao>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1300px] space-y-5 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        <div data-print-hide className="grid gap-3 sm:grid-cols-3">
          <Kpi titulo="Precisam de vocês" valor={String(nPrecisa)} detalhe="orçamentos para revisar, ordens para executar e notas a enviar" icone={<AlertTriangle className="h-4 w-4" />} destaque="bg-amber-50 text-amber-700" />
          <Kpi titulo="Eventos solicitados" valor={String(nSolicitados)} detalhe="em orçamento, análise ou aprovados" icone={<CalendarDays className="h-4 w-4" />} />
          <Kpi titulo="Eventos realizados" valor={String(grupos.precisaReal.length + grupos.realizados.length)} detalhe="já feitos, com nota e pagamento" icone={<CheckCircle2 className="h-4 w-4" />} />
        </div>

        <div data-print-hide className="inline-flex rounded-xl bg-slate-200/60 p-1">
          {(
            [
              ['solicitado', 'Eventos solicitados', nSolicitados],
              ['realizado', 'Eventos realizados', nRealizados],
            ] as const
          ).map(([id, rotulo, n]) => (
            <button
              key={id}
              onClick={() => {
                setAbaPortal(id);
                setSelId('');
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${abaPortal === id ? 'bg-white text-cremesp-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {rotulo} <span className="ml-1 opacity-60">{n}</span>
            </button>
          ))}
        </div>

        {eventos.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">Nenhum evento foi enviado pelo Cremesp ainda. Quando houver, ele aparece aqui.</Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] print:block">
            <Card data-print-hide className="max-h-[75vh] self-start overflow-y-auto pb-2">
              {abaPortal === 'solicitado' ? (
                <>
                  <Secao titulo="Precisa de vocês" lista={grupos.precisaSol} vazio="Nada pendente." />
                  <Secao titulo="Em andamento" lista={grupos.solicitados} vazio="Nenhum evento." />
                </>
              ) : (
                <>
                  <Secao titulo="Enviar nota fiscal" lista={grupos.precisaReal} vazio="Nada pendente." />
                  <Secao titulo="Realizados" lista={grupos.realizados} vazio="Nenhum evento." />
                  {grupos.cancelados.length > 0 && <Secao titulo="Cancelados" lista={grupos.cancelados} vazio="" />}
                </>
              )}
            </Card>

            {evento && (
              <div className="min-w-0 space-y-5">
                <div className="hidden border-b-2 border-slate-900 pb-3 print:block">
                  <img src={logoCremesp} alt="Cremesp" className="h-10 w-auto" />
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">
                        {evento.status === 'aprovado' ? 'Ordem de Serviço' : 'Orçamento'} · OS {evento.numero}
                      </p>
                      <p className="text-xs text-slate-600">
                        {ata.numero} · {ata.fornecedor}
                      </p>
                    </div>
                    <div className="rounded border border-slate-900 px-3 py-1.5 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Protocolo interno Cremesp</p>
                      <p className="text-sm font-semibold tabular-nums">{evento.protocolo?.trim() || 'pendente'}</p>
                    </div>
                  </div>
                </div>
                <Card>
                  <CardHeader
                    titulo={`OS ${evento.numero} · ${evento.nome}`}
                    subtitulo={`${periodo(evento)}${evento.local ? ` · ${evento.local}` : ''}${evento.responsavel || ata.responsavelTecnico ? ` · Responsável técnico: ${evento.responsavel || ata.responsavelTecnico}` : ''} · Protocolo Cremesp: ${evento.protocolo?.trim() || 'pendente'}`}
                    icone={<CalendarDays className="h-4 w-4" />}
                    acoes={
                      <span data-print-hide className="flex items-center gap-2">
                        <EtapaBadge etapa={etapa} fornecedor />
                        <Botao tamanho="sm" icone={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                          Imprimir
                        </Botao>
                      </span>
                    }
                  />
                  {etapa === 'revisao_fornecedor' && (
                    <div data-print-hide className="space-y-3 border-b border-amber-100 bg-amber-50 px-5 py-4">
                      <p className="text-sm font-medium text-amber-900">O Cremesp pede que vocês revisem este orçamento.</p>
                      <p className="text-sm text-amber-800">Confira itens, quantidades e diárias. Se estiver tudo certo, confirme. Se precisar mudar algo, descreva o ajuste.</p>
                      <textarea
                        className={`${inputCls} min-h-[70px]`}
                        value={texto}
                        placeholder="Observações ou ajuste necessário (obrigatório para pedir ajuste)"
                        onChange={(e) => setTexto(e.target.value)}
                      />
                      <SeletorAnexos arquivos={arqRevisao} setArquivos={setArqRevisao} disabled={enviando} rotulo="Anexar orçamento ou arquivos" />
                      <div className="flex flex-wrap gap-2">
                        <Botao variante="sucesso" icone={<CheckCircle2 className="h-4 w-4" />} disabled={enviando} onClick={() => void agir('confirmar')}>
                          Confirmar orçamento
                        </Botao>
                        <Botao variante="perigo" icone={<Pencil className="h-4 w-4" />} disabled={enviando} onClick={() => void agir('ajuste')}>
                          Pedir ajuste
                        </Botao>
                      </div>
                    </div>
                  )}
                  {aviso && (
                    <p data-print-hide className={`border-b border-slate-100 px-5 py-2 text-sm ${aviso.tipo === 'erro' ? 'text-rose-700' : 'text-cremesp-800'}`}>
                      {aviso.texto}
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-2.5">Item</th>
                          <th className="px-3 py-2.5">Descrição</th>
                          <th className="px-3 py-2.5 text-right">Qtd.</th>
                          <th className="px-3 py-2.5 text-right">Diárias</th>
                          <th className="px-3 py-2.5 text-right">Unitário</th>
                          <th className="px-5 py-2.5 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {linhas.map(({ it, l }) => (
                          <tr key={it.id}>
                            <td className="px-5 py-2.5 tabular-nums text-slate-500">{it.codigo}</td>
                            <td className="px-3 py-2.5">
                              <p className="text-slate-800">{it.descricao}</p>
                              <p className="text-xs text-slate-400">
                                {modulosPorId.get(it.moduloId)?.nome ?? ''} · {it.unidade}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{num(l.qtd)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{num(l.diarias)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{brl(it.valorUnitario)}</td>
                            <td className="px-5 py-2.5 text-right font-medium tabular-nums">{brl(consumoLinha(l) * it.valorUnitario)}</td>
                          </tr>
                        ))}
                        {linhas.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                              Sem itens.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200">
                          <td colSpan={5} className="px-5 py-3 text-right font-semibold">
                            Total
                          </td>
                          <td className="px-5 py-3 text-right text-base font-semibold tabular-nums">{brl(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>

                {ETAPAS_NOTA_FISCAL.includes(etapa) && (
                  <Card data-print-hide className="border-blue-200">
                    <CardHeader
                      titulo="Nota fiscal"
                      subtitulo={etapa === 'nota_recebida' ? 'Nota já enviada. Se precisar, envie uma versão corrigida.' : 'Depois do evento, anexe aqui a nota fiscal para o Cremesp.'}
                      icone={<FileText className="h-4 w-4" />}
                    />
                    <div className="space-y-3 p-5">
                      {(() => {
                        const notas = anexosDoEvento(evento).filter((x) => x.h.acao === 'nota_fiscal');
                        return notas.length > 0 ? (
                          <div>
                            <p className="text-xs font-medium text-slate-500">Notas enviadas</p>
                            <ListaAnexos anexos={notas.map((x) => x.a)} abrir={abrir} />
                          </div>
                        ) : null;
                      })()}
                      <input className={inputCls} value={textoNota} onChange={(e) => setTextoNota(e.target.value)} placeholder="Número da nota e observações (opcional)" />
                      <SeletorAnexos arquivos={arqNota} setArquivos={setArqNota} disabled={enviando} rotulo="Anexar nota fiscal (PDF ou XML)" />
                      <Botao variante="primario" icone={enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} disabled={enviando || arqNota.length === 0} onClick={() => void agir('nota_fiscal')}>
                        Enviar nota fiscal
                      </Botao>
                    </div>
                  </Card>
                )}

                <div className="grid gap-5 xl:grid-cols-2 print:block">
                  <Card>
                    <CardHeader titulo="Andamento" subtitulo="Cada etapa registrada pelo Cremesp e por vocês" icone={<ListChecks className="h-4 w-4" />} />
                    <div className="p-5">
                      <LinhaDoTempo historico={evento.historico ?? []} fornecedor abrir={abrir} />
                    </div>
                  </Card>
                  <Card data-print-hide>
                    <CardHeader titulo="Mensagem para o Cremesp" subtitulo="Ex.: dúvida sobre montagem, contato da equipe, arquivos do evento" icone={<Pencil className="h-4 w-4" />} />
                    <div className="space-y-3 p-5">
                      <textarea className={`${inputCls} min-h-[90px]`} value={textoMsg} onChange={(e) => setTextoMsg(e.target.value)} placeholder="Escreva aqui" />
                      <SeletorAnexos arquivos={arqMsg} setArquivos={setArqMsg} disabled={enviando} />
                      <Botao variante="primario" disabled={enviando || (!textoMsg.trim() && arqMsg.length === 0)} onClick={() => void agir('mensagem')}>
                        {enviando ? 'Enviando…' : 'Enviar mensagem'}
                      </Botao>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function AppCompartilhado({ cliente, sessao, inicial, sincronizadoInicial }: { cliente: SupabaseClient; sessao: Session; inicial: Base; sincronizadoInicial: Map<string, string> }) {
  const [base, setBase] = useState<Base>(inicial);
  const status = useSincronizacao(cliente, base, setBase, sincronizadoInicial);
  const email = sessao.user.email ?? '';
  return (
    <AppGestor
      base={base}
      setBase={setBase}
      compartilhado
      painelConta={<PainelConta email={email} status={status} sair={() => void cliente.auth.signOut()} />}
      painelEquipe={<PainelEquipe cliente={cliente} meuEmail={email.toLowerCase()} />}
      usuario={email}
      cliente={cliente}
    />
  );
}

function ModoCompartilhado({ cliente }: { cliente: SupabaseClient }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [carga, setCarga] = useState<
    | { tipo: 'carregando' }
    | { tipo: 'sem-acesso' }
    | { tipo: 'erro'; msg: string }
    | { tipo: 'pronto'; base: Base; sinc: Map<string, string>; papel: 'equipe' | 'fornecedor' }
  >({ tipo: 'carregando' });

  useEffect(() => {
    void cliente.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = cliente.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, [cliente]);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    setCarga({ tipo: 'carregando' });
    (async () => {
      // Papel de quem entrou: equipe do Cremesp ou fornecedor
      let papel: 'equipe' | 'fornecedor' | null = null;
      const r = await cliente.rpc('meu_papel');
      if (!r.error) papel = r.data === 'fornecedor' ? 'fornecedor' : r.data === 'equipe' ? 'equipe' : null;
      else {
        // Banco ainda sem o script do portal do fornecedor: todo membro é equipe
        const { data: membro, error: e1 } = await cliente.rpc('eh_membro');
        if (e1) throw e1;
        papel = membro ? 'equipe' : null;
      }
      if (!papel) {
        if (ativo) setCarga({ tipo: 'sem-acesso' });
        return;
      }
      // Lê em páginas de 1.000 linhas (limite padrão do Supabase)
      let lista: Registro[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await cliente.from('registros').select('colecao, id, ordem, dados').order('colecao').order('id').range(de, de + 999);
        if (error) throw error;
        lista = lista.concat((data ?? []) as Registro[]);
        if (!data || data.length < 1000) break;
      }
      if (lista.length === 0 && papel === 'equipe') {
        // Primeiro acesso do setor: grava a Ata original no banco
        lista = [...baseParaRegistros(criarBaseExemplo()).values()];
        const { error: e2 } = await cliente.from('registros').upsert(lista.map((r) => ({ colecao: r.colecao, id: r.id, ordem: r.ordem, dados: r.dados })));
        if (e2) throw e2;
      }
      const base = registrosParaBase(lista);
      const sinc = new Map<string, string>();
      for (const r of lista) sinc.set(chaveRegistro(r.colecao, r.id), assinatura(r));
      if (ativo) setCarga({ tipo: 'pronto', base, sinc, papel });
    })().catch((err: { message?: string }) => ativo && setCarga({ tipo: 'erro', msg: err?.message ?? String(err) }));
    return () => {
      ativo = false;
    };
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
  if (!sessao) return <TelaLogin cliente={cliente} />;
  if (carga.tipo === 'pronto' && carga.papel === 'fornecedor') return <PortalFornecedor cliente={cliente} email={sessao.user.email ?? ''} inicial={carga.base} />;
  if (carga.tipo === 'pronto') return <AppCompartilhado cliente={cliente} sessao={sessao} inicial={carga.base} sincronizadoInicial={carga.sinc} />;
  return (
    <TelaCentral>
      {carga.tipo === 'carregando' && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando os dados do setor…
        </p>
      )}
      {carga.tipo === 'sem-acesso' && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Acesso não liberado</h1>
          <p className="mt-2 text-sm text-slate-600">
            O e-mail <strong>{sessao.user.email}</strong> ainda não foi autorizado. Peça ao Cremesp para cadastrá-lo em Configuração da Ata › Quem tem acesso.
          </p>
        </>
      )}
      {carga.tipo === 'erro' && (
        <>
          <h1 className="text-base font-semibold text-slate-900">Não foi possível carregar</h1>
          <p className="mt-2 text-sm text-slate-600">Verifique a conexão e tente de novo. Detalhe: {carga.msg}</p>
        </>
      )}
      <div className="mt-5 flex gap-2">
        {carga.tipo === 'erro' && (
          <Botao variante="primario" onClick={() => window.location.reload()}>
            Tentar de novo
          </Botao>
        )}
        <Botao icone={<LogOut className="h-4 w-4" />} onClick={() => void cliente.auth.signOut()}>
          Sair
        </Botao>
      </div>
    </TelaCentral>
  );
}

function ModoLocal() {
  const [base, setBase] = useState<Base>(carregarBase);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(base));
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  }, [base]);
  return <AppGestor base={base} setBase={setBase} />;
}

export default function GestorAtas() {
  return supabase ? <ModoCompartilhado cliente={supabase} /> : <ModoLocal />;
}
