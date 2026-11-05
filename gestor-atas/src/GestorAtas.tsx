import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
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
  Lock,
  MapPin,
  Package,
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

type CorModulo = 'indigo' | 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'teal' | 'orange' | 'slate' | 'fuchsia';

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
}

interface Base {
  versao: 1;
  ata: AtaInfo;
  modulos: Modulo[];
  itens: ItemAta[];
  eventos: Evento[];
}

type Aba = 'dashboard' | 'simulador' | 'ordem' | 'config';

// ---------------------------------------------------------------- Cores

const CORES: Record<CorModulo, { dot: string; chip: string; bar: string }> = {
  indigo: { dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200', bar: 'bg-indigo-500' },
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
  { id: 'video', nome: 'Vídeo, Projeção e LED', cor: 'indigo' },
  { id: 'ilum', nome: 'Iluminação', cor: 'fuchsia' },
  { id: 'plat', nome: 'Plataforma, Internet e Energia', cor: 'teal' },
  { id: 'outros', nome: 'Outros Serviços', cor: 'violet' },
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

function linhas(lista: [string, number, number][]): Record<string, LinhaEvento> {
  const out: Record<string, LinhaEvento> = {};
  for (const [codigo, qtd, diarias] of lista) out[idItem(codigo)] = { qtd, diarias };
  return out;
}

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
  const agora = new Date().toISOString();
  const eventos: Evento[] = [
    {
      id: 'ev-1',
      numero: '001/2026',
      nome: 'Cerimônia de Entrega de Carteiras – Novos Médicos',
      dataInicio: '2026-11-28',
      dataFim: '2026-11-28',
      local: 'Auditório Cremesp – Rua Frei Caneca, 1282, Consolação',
      responsavel: 'Equipe de Eventos Cremesp',
      status: 'aprovado',
      observacoes: 'Montagem no dia anterior a partir das 14h. Passagem de som às 8h. Contato no local: recepção do auditório.',
      linhas: linhas([
        ['3', 24, 1], ['8', 60, 1], ['12', 6, 1], ['15', 8, 1], ['16', 1, 1], ['30', 1, 1], ['24', 2, 1],
        ['32', 1, 1], ['35', 12, 1], ['36', 1, 1], ['53', 1, 1], ['57', 2, 1], ['60', 1, 1], ['63', 1, 1],
        ['65', 1, 1], ['67', 1, 1],
      ]),
      atualizadoEm: agora,
      confirmadoEm: '2026-11-16T12:00:00.000Z',
      protocolo: 'EXEMPLO-0001/2026',
      orcamentoRecebidoEm: '2026-11-12',
    },
    {
      id: 'ev-2',
      numero: '002/2026',
      nome: 'Congresso de Bioética e Ética Médica 2027',
      dataInicio: '2027-03-17',
      dataFim: '2027-03-19',
      local: 'Centro de Convenções – São Paulo/SP',
      responsavel: 'Coordenação de Eventos',
      status: 'aprovado',
      observacoes: 'Transmissão ao vivo nos três dias. Montagem do LED na véspera até 22h. Desmontagem após 18h do último dia.',
      linhas: linhas([
        ['1', 10, 3], ['13', 13, 3], ['28', 60, 3], ['41', 1, 3], ['42', 1, 3], ['43', 1, 3], ['44', 2, 3],
        ['45', 1, 3], ['48', 1, 2], ['51', 2, 3], ['54', 1, 3], ['55', 1, 3], ['56', 1, 3], ['62', 2, 3],
        ['66', 1, 3],
      ]),
      atualizadoEm: agora,
      confirmadoEm: '2026-11-20T12:00:00.000Z',
      protocolo: 'EXEMPLO-0002/2026',
      orcamentoRecebidoEm: '2026-11-18',
    },
    {
      id: 'ev-3',
      numero: '003/2026',
      nome: 'Fórum Regional – Delegacia de Campinas',
      dataInicio: '2027-04-15',
      dataFim: '2027-04-16',
      local: 'Delegacia Regional de Campinas',
      responsavel: 'Delegacia Regional',
      status: 'aprovado',
      observacoes: 'Duas salas simultâneas com projeção. Acesso para descarga pela lateral do prédio.',
      linhas: linhas([
        ['12', 8, 2], ['13', 4, 2], ['15', 6, 2], ['19', 4, 2], ['20', 4, 2], ['44', 1, 2], ['63', 1, 2],
        ['64', 1, 2],
      ]),
      atualizadoEm: agora,
      confirmadoEm: '2026-11-25T12:00:00.000Z',
      protocolo: 'EXEMPLO-0003/2026',
      orcamentoRecebidoEm: '2026-11-23',
    },
    {
      id: 'ev-4',
      numero: '004/2026',
      nome: 'Sessão Solene de Encerramento do Ano – Homenagens',
      dataInicio: '2026-12-10',
      dataFim: '2026-12-10',
      local: 'Auditório Cremesp – Rua Frei Caneca, 1282, Consolação',
      responsavel: 'Equipe de Eventos Cremesp',
      status: 'simulacao',
      observacoes: 'Montagem a partir das 7h. Ensaio geral às 15h. Início da cerimônia às 19h. Contato no local: coordenação de eventos.',
      linhas: linhas([
        ['13', 3, 1], ['18', 1, 1], ['29', 1, 1], ['31', 2, 1], ['34', 4, 1], ['35', 16, 1], ['37', 2, 1],
        ['39', 20, 1], ['42', 1, 1], ['49', 2, 1], ['68', 1, 1], ['75', 1, 1],
      ]),
      atualizadoEm: agora,
    },
  ];
  return { versao: 1, ata: { ...ATA_EXEMPLO }, modulos: MODULOS_EXEMPLO.map((m) => ({ ...m })), itens, eventos };
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

const CHAVE_STORAGE = 'gestor-atas-cremesp:v2';

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
    if (!porItem) continue;
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

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function CardHeader({ titulo, subtitulo, icone, acoes }: { titulo: string; subtitulo?: string; icone?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {icone && <div className="mt-0.5 rounded-lg bg-indigo-50 p-2 text-indigo-700">{icone}</div>}
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
    primario: 'bg-indigo-700 text-white hover:bg-indigo-800 shadow-sm',
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
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500';
const inputSmCls =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-500';

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
        <div className="h-full bg-indigo-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.5)_3px,rgba(255,255,255,.5)_6px)]" style={{ width: `${ps}%` }} />
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

function StatusBadge({ status }: { status: StatusEvento }) {
  return status === 'aprovado' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckCircle2 className="h-3 w-3" /> Aprovado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
      <Pencil className="h-3 w-3" /> Em simulação
    </span>
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

export default function GestorAtas() {
  const [base, setBase] = useState<Base>(carregarBase);
  const [aba, setAba] = useState<Aba>('dashboard');
  const [eventoSelId, setEventoSelId] = useState<string>(() => {
    const b = base;
    return (b.eventos.find((e) => e.status === 'simulacao') ?? b.eventos[0])?.id ?? '';
  });
  const [toast, setToast] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
  const [dialogo, setDialogo] = useState<DialogoConfig | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(base));
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  }, [base]);

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
          responsavel: '',
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
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-700 text-white">
            <ClipboardCopy className="h-5 w-5" />
          </div>
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
                aba === a.id ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={aba === a.id ? 'text-indigo-700' : 'text-slate-400'}>{a.icone}</span>
              {a.rotulo}
            </button>
          ))}
        </nav>
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-700 text-white">
            <ClipboardCopy className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Gestor de Atas</p>
            <p className="truncate text-xs text-slate-500">{ata.numero} · {ata.fornecedor}</p>
          </div>
        </div>
        <nav className="grid grid-cols-4 border-t border-slate-100">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${aba === a.id ? 'text-indigo-700' : 'text-slate-500'}`}
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
              avisar={avisar}
              abrirDialogo={setDialogo}
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
          {aba === 'config' && (
            <ConfigAba
              base={base}
              setBase={setBase}
              usoTotal={usoTotal}
              avisar={avisar}
              abrirDialogo={setDialogo}
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
  const qtdSim = eventos.filter((e) => e.status === 'simulacao').length;
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
        <Kpi titulo="Valor total da Ata" valor={brl(financeiro.total)} detalhe={`${itens.length} itens em ${modulos.length} módulos`} icone={<Wallet className="h-4 w-4" />} destaque="bg-indigo-50 text-indigo-700" />
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
          destaque="bg-indigo-50 text-indigo-700"
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
                    <StatusBadge status={ev.status} />
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
              soUsados ? 'bg-indigo-700 text-white ring-indigo-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
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
                  <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">{l.simulacao ? num(l.simulacao) : '—'}</td>
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
        atualizar(evento.id, { status: 'aprovado', confirmadoEm: new Date().toISOString() });
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
        atualizar(evento.id, { status: 'simulacao', confirmadoEm: undefined });
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
      <div key={it.id} className={`px-4 py-3 sm:px-5 ${qtd > 0 ? 'bg-indigo-50/40' : ''}`}>
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
                {s.reservadoOutros > 0 && <span className="text-indigo-600">{num(s.reservadoOutros)} reservado em outras simulações</span>}
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
                    className={`rounded-md px-3 py-1.5 ${!travado ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
                  <input className={`${inputCls} pl-9`} value={evento.responsavel} placeholder="Nome e contato" onChange={(e) => atualizar(evento.id, { responsavel: e.target.value })} />
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
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={soSelecionados} onChange={(e) => setSoSelecionados(e.target.checked)} />
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
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">{pm.itens} no evento</span>
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
            <div className="bg-indigo-700 px-5 py-4 text-white">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-200">Valor total do evento</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{brl(resumo.total)}</p>
              <p className="mt-1 text-xs text-indigo-200">
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
                    <div className="h-full bg-indigo-600" style={{ width: `${Math.min(100, impactoAta)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Impacto no saldo restante</span>
                    <span className={`font-semibold ${impactoSaldo > 100 ? 'text-rose-700' : 'text-slate-800'}`}>{pct(impactoSaldo, 2)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full ${impactoSaldo > 100 ? 'bg-rose-500' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, impactoSaldo)}%` }} />
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
    if (evento.responsavel) linhasTxt.push(`*Responsável técnico:* ${evento.responsavel}`);
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
    if (evento.observacoes.trim()) {
      linhasTxt.push('');
      linhasTxt.push(`*Observações:* ${evento.observacoes.trim()}`);
    }
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
          <Campo rotulo="Observações técnicas / logísticas (aparecem no documento)">
            <textarea
              className={`${inputCls} min-h-[72px]`}
              value={evento.observacoes}
              placeholder="Ex.: horário de montagem, passagem de som, contato no local, acesso para carga e descarga…"
              onChange={(e) => atualizar(evento.id, { observacoes: e.target.value })}
            />
          </Campo>
        </Card>
      </div>

      {/* Folha A4 */}
      <div className="overflow-x-auto pb-6 print:overflow-visible print:pb-0">
        <article id="folha-ordem" className="folha-a4 mx-auto bg-white text-[12px] leading-relaxed text-slate-900 shadow-lg ring-1 ring-slate-200">
          <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[13px] font-bold uppercase leading-tight">{ata.contratante}</p>
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
              <p>Responsável técnico: {evento.responsavel || '—'}</p>
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
            </tfoot>
          </table>
          <p className="mt-1.5 text-[11px] italic text-slate-600">({valorPorExtenso(total)})</p>

          <section className="evitar-quebra mt-5 rounded border border-slate-300 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Observações técnicas / logísticas</p>
            <p className="whitespace-pre-wrap">{evento.observacoes.trim() || '—'}</p>
            <p className="mt-2 text-[10.5px] text-slate-600">
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
                ['Responsável técnico do evento', evento.responsavel || 'Contratante'],
                ['Gestor(a) da Ata', ata.gestor || 'Contratante'],
                ['Fiscal da Ata', ata.fiscal || 'Contratante'],
                [ehOS ? 'Ciente – Fornecedor' : 'De acordo – Fornecedor', ata.fornecedor],
              ].map(([cargo, nome]) => (
                <div key={cargo}>
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

// ---------------------------------------------------------------- Aba: Configuração

function ConfigAba({
  base,
  setBase,
  usoTotal,
  avisar,
  abrirDialogo,
  aoRestaurar,
}: {
  base: Base;
  setBase: Dispatch<SetStateAction<Base>>;
  usoTotal: Map<string, Uso>;
  avisar: (t: string, tipo?: 'ok' | 'erro') => void;
  abrirDialogo: (d: DialogoConfig) => void;
  aoRestaurar: (b: Base) => void;
}) {
  const { ata, modulos, itens, eventos } = base;
  const [filtroModulo, setFiltroModulo] = useState('todos');
  const [busca, setBusca] = useState('');
  const [novoModulo, setNovoModulo] = useState('');
  const [corNovo, setCorNovo] = useState<CorModulo>('indigo');
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
      titulo: 'Restaurar dados da ARP nº 0099/2025?',
      variante: 'perigo',
      confirmar: 'Restaurar dados de exemplo',
      mensagem: (
        <p>
          Todos os dados atuais (Ata, módulos, itens e eventos) serão substituídos pelos 77 itens da ARP nº 0099/2025 (REDXCORP), com os preços do 1º Termo Aditivo (2026–2027), e pelos eventos de exemplo. Exporte
          um backup antes se quiser guardar o que está aqui.
        </p>
      ),
      aoConfirmar: () => {
        const b = criarBaseExemplo();
        setBase(b);
        aoRestaurar(b);
        avisar('Dados de exemplo restaurados.');
      },
    });

  const comecarDoZero = () =>
    abrirDialogo({
      titulo: 'Começar uma Ata em branco?',
      variante: 'perigo',
      confirmar: 'Apagar e começar do zero',
      mensagem: <p>Todos os módulos, itens e eventos serão apagados. Os dados do contratante são mantidos.</p>,
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
            Restaurar dados de exemplo
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
                    {itens.length === 0 ? 'Nenhum item cadastrado. Use “Adicionar item” ou restaure os dados de exemplo.' : 'Nenhum item encontrado com esse filtro.'}
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
