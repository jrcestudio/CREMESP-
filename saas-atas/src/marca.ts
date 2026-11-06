/* ============================================================================
 * Identidade do órgão cliente (nome, sigla, logo, cor e dados do contratante).
 * O sistema é o mesmo para todos os órgãos: ao entrar, o órgão escolhido é
 * aplicado aqui e todas as telas e documentos passam a usar os dados dele.
 * ========================================================================== */
import logoPadrao from './assets/logo-padrao.svg';

/** Nome do produto (aparece no login, no título da aba e na tela da plataforma) */
export const PRODUTO = 'Painel de Atas';
export const COR_PADRAO = '#2563eb';

export interface Orgao {
  id: string;
  nome: string;
  sigla: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  uasg: string;
  cor: string;
  /** Imagem do logo em data URL (png, jpg ou svg) */
  logo: string | null;
  ativo?: boolean;
}

export const marca = {
  id: '',
  nome: '',
  sigla: 'Órgão',
  cnpj: '',
  endereco: '',
  cidade: '',
  uasg: '',
  cor: COR_PADRAO,
  logo: logoPadrao as string,
  icone: logoPadrao as string,
};

/** Troca o token {orgao} dos textos fixos pela sigla do órgão atual */
export const comOrgao = (texto: string) => texto.split('{orgao}').join(marca.sigla);

function hexParaRgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? COR_PADRAO.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

const misturar = (c: [number, number, number], com: number, peso: number) => c.map((v) => Math.round(v + (com - v) * peso)) as [number, number, number];

/** Tons da cor do órgão usados pelas classes marca-50 … marca-900 */
export function paleta(hex: string): Record<number, [number, number, number]> {
  const base = hexParaRgb(hex);
  const claro: [number, number][] = [
    [50, 0.93],
    [100, 0.85],
    [200, 0.7],
    [300, 0.5],
    [400, 0.28],
    [500, 0.12],
  ];
  const escuro: [number, number][] = [
    [700, 0.2],
    [800, 0.36],
    [900, 0.5],
  ];
  const r: Record<number, [number, number, number]> = { 600: base };
  for (const [k, p] of claro) r[k] = misturar(base, 255, p);
  for (const [k, p] of escuro) r[k] = misturar(base, 0, p);
  return r;
}

export function aplicarCor(hex: string) {
  const raiz = document.documentElement;
  for (const [k, [r, g, b]] of Object.entries(paleta(hex))) raiz.style.setProperty(`--marca-${k}`, `${r} ${g} ${b}`);
}

export function definirMarca(o: Orgao | null) {
  marca.id = o?.id ?? '';
  marca.nome = o?.nome ?? '';
  marca.sigla = o?.sigla?.trim() || o?.nome?.trim() || 'Órgão';
  marca.cnpj = o?.cnpj ?? '';
  marca.endereco = o?.endereco ?? '';
  marca.cidade = o?.cidade ?? '';
  marca.uasg = o?.uasg ?? '';
  marca.cor = o?.cor || COR_PADRAO;
  marca.logo = o?.logo || logoPadrao;
  marca.icone = o?.logo || logoPadrao;
  aplicarCor(marca.cor);
  document.title = o ? `${PRODUTO} · ${marca.sigla}` : PRODUTO;
}

aplicarCor(COR_PADRAO);
