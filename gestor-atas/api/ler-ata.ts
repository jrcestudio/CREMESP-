/**
 * Painel de Atas · leitura da ata com IA (função da Vercel)
 *
 * Recebe { caminho } de um arquivo (PDF ou imagem) que a equipe já enviou para
 * o Supabase Storage (pasta painel-anexos/<ata>/ata/...), confere que quem pediu
 * é da equipe do painel, baixa o arquivo e pede ao Claude para extrair os dados
 * da Ata de Registro de Preços. Devolve JSON para a tela de revisão.
 *
 * Variáveis de ambiente (Vercel › Settings › Environment Variables):
 *   ANTHROPIC_API_KEY      chave da API da Anthropic (só no servidor, nunca VITE_)
 *   VITE_SUPABASE_URL      mesmas do site
 *   VITE_SUPABASE_ANON_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MODELO = 'claude-opus-5-5';
const BUCKET = 'painel-anexos';
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type TipoImagem = (typeof TIPOS_IMAGEM)[number];
const LIMITE_BYTES = 30 * 1024 * 1024;

const UNIDADES = ['Diária 24h', 'Diária 8h', 'Unidade', 'Metro²', 'Metro linear', 'Hora'];

const texto = { type: 'string' } as const;
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ata', 'modulos', 'itens', 'avisos'],
  properties: {
    ata: {
      type: 'object',
      additionalProperties: false,
      required: [
        'numero', 'pregao', 'processo', 'objeto', 'fornecedor', 'cnpj', 'enderecoFornecedor', 'contato', 'telefone', 'email',
        'vigenciaInicio', 'vigenciaFim', 'gestor', 'fiscal', 'contratante', 'cnpjContratante', 'enderecoContratante', 'uasg', 'cidade',
      ],
      properties: {
        numero: texto,
        pregao: texto,
        processo: texto,
        objeto: texto,
        fornecedor: texto,
        cnpj: texto,
        enderecoFornecedor: texto,
        contato: texto,
        telefone: texto,
        email: texto,
        vigenciaInicio: texto,
        vigenciaFim: texto,
        gestor: texto,
        fiscal: texto,
        contratante: texto,
        cnpjContratante: texto,
        enderecoContratante: texto,
        uasg: texto,
        cidade: texto,
      },
    },
    modulos: { type: 'array', items: texto },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['codigo', 'descricao', 'modulo', 'unidade', 'unidadeOriginal', 'qtdContratada', 'valorUnitario'],
        properties: {
          codigo: texto,
          descricao: texto,
          modulo: texto,
          unidade: { type: 'string', enum: UNIDADES },
          unidadeOriginal: texto,
          qtdContratada: { type: 'number' },
          valorUnitario: { type: 'number' },
        },
      },
    },
    avisos: { type: 'array', items: texto },
  },
};

const INSTRUCOES = `Você vai ler uma Ata de Registro de Preços (ARP) de um órgão público brasileiro e extrair os dados para um sistema de controle de saldo.

Preencha o JSON pedido seguindo estas regras:
- ata: dados gerais. Use exatamente o que está escrito no documento. Campo sem informação no documento fica "" (texto vazio); não invente.
  - numero: número da ata (ex.: "ARP nº 0099/2025"). Se for termo aditivo, inclua isso (ex.: "ARP nº 0099/2025 (1º Termo Aditivo)").
  - pregao, processo: com o prefixo usado no documento (ex.: "Pregão Eletrônico nº 90033/2025").
  - objeto: o objeto da ata, resumido em até 3 frases.
  - fornecedor, cnpj, enderecoFornecedor, contato (preposto/representante e cargo), telefone, email: da empresa registrada.
  - vigenciaInicio e vigenciaFim: datas no formato AAAA-MM-DD. Se a ata diz só a duração (ex.: 12 meses a partir da assinatura), calcule a partir da data informada; se não houver data, deixe "".
  - gestor e fiscal: nomes indicados como gestor e fiscal da ata, se houver.
  - contratante, cnpjContratante, enderecoContratante, uasg, cidade: do órgão contratante.
- itens: TODOS os itens da tabela de preços registrados, na ordem do documento, sem pular nenhum.
  - codigo: número do item como aparece (ex.: "1", "12", "3.1").
  - descricao: descrição completa do item, sem abreviar a especificação.
  - modulo: o grupo/lote/categoria a que o item pertence. Se o documento não agrupar os itens, crie poucos grupos curtos pelo tipo de serviço (ex.: "Áudio", "Vídeo", "Equipe técnica").
  - unidade: escolha a mais próxima entre ${UNIDADES.join(', ')}. Diária sem horas indicadas conta como "Diária 24h"; serviço por pessoa/turno de 8h é "Diária 8h"; m² é "Metro²"; metro/ml é "Metro linear"; o resto é "Unidade".
  - unidadeOriginal: a unidade exatamente como escrita no documento.
  - qtdContratada: quantidade registrada/estimada (número). valorUnitario: valor unitário em reais (número, ex.: 1234.56). Use os valores atualizados se o documento trouxer reajuste.
- modulos: lista dos nomes de grupo usados em itens, sem repetir, na ordem em que aparecem.
- avisos: frases curtas sobre o que não ficou claro ou precisa de conferência (ex.: página ilegível, valor total que não bate, item sem quantidade). Lista vazia se estiver tudo claro.`;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const chave = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!process.env.ANTHROPIC_API_KEY) return json(500, { erro: 'A leitura com IA ainda não foi ativada: falta a variável ANTHROPIC_API_KEY na Vercel.' });
  if (!url || !chave) return json(500, { erro: 'Faltam as variáveis do Supabase na Vercel.' });

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s*/i, '').trim();
  if (!token) return json(401, { erro: 'Entre no sistema para usar a leitura com IA.' });

  let caminho = '';
  try {
    const corpo = (await request.json()) as { caminho?: unknown };
    caminho = typeof corpo.caminho === 'string' ? corpo.caminho : '';
  } catch {
    /* corpo inválido */
  }
  if (!/^[\w-]+\/ata\/[^/]+$/.test(caminho)) return json(400, { erro: 'Arquivo inválido.' });

  // Só a equipe do painel pode usar (a chamada usa o login de quem pediu)
  const supa = createClient(url, chave, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: usuario, error: erroUsuario } = await supa.auth.getUser(token);
  if (erroUsuario || !usuario.user) return json(401, { erro: 'Sessão expirada. Entre de novo.' });
  const { data: ehEquipe, error: erroEquipe } = await supa.rpc('painel_eh_equipe');
  if (erroEquipe) return json(500, { erro: `Banco do painel não configurado (rode supabase/painel-configurar.sql). ${erroEquipe.message}` });
  if (ehEquipe !== true) return json(403, { erro: 'Só a equipe do painel pode ler atas.' });

  const { data: arquivo, error: erroArquivo } = await supa.storage.from(BUCKET).download(caminho);
  if (erroArquivo || !arquivo) return json(404, { erro: `Não foi possível abrir o arquivo enviado. ${erroArquivo?.message ?? ''}` });
  if (arquivo.size > LIMITE_BYTES) return json(413, { erro: 'O arquivo passa de 30 MB. Envie um PDF menor (ex.: só as páginas da ata e da tabela de preços).' });

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const base64 = bytes.toString('base64');
  const ehPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  const tipo = (arquivo.type || '').toLowerCase();
  let bloco: Anthropic.Beta.Messages.BetaContentBlockParam;
  if (ehPdf) {
    bloco = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
  } else if ((TIPOS_IMAGEM as readonly string[]).includes(tipo)) {
    bloco = { type: 'image', source: { type: 'base64', media_type: tipo as TipoImagem, data: base64 } };
  } else {
    return json(415, { erro: 'Envie a ata em PDF (ou uma foto JPG/PNG).' });
  }

  const cliente = new Anthropic();
  try {
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: [bloco, { type: 'text', text: INSTRUCOES }] }],
    });
    const resposta = await stream.finalMessage();
    if (resposta.stop_reason === 'refusal') return json(422, { erro: 'A IA não conseguiu ler este documento. Confira se é a ata certa ou cadastre os itens à mão.' });
    if (resposta.stop_reason === 'max_tokens') return json(422, { erro: 'A ata é longa demais para ler de uma vez. Envie um PDF só com as páginas da tabela de itens.' });
    const textoResposta = resposta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let dados: unknown;
    try {
      dados = JSON.parse(textoResposta);
    } catch {
      return json(502, { erro: 'A resposta da IA veio incompleta. Tente de novo.' });
    }
    return json(200, { dados, modelo: resposta.model, uso: { entrada: resposta.usage.input_tokens, saida: resposta.usage.output_tokens } });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(500, { erro: 'A chave ANTHROPIC_API_KEY na Vercel é inválida.' });
    if (err instanceof Anthropic.RateLimitError) return json(429, { erro: 'Muitas leituras ao mesmo tempo. Espere um minuto e tente de novo.' });
    if (err instanceof Anthropic.BadRequestError) return json(400, { erro: `A IA recusou o arquivo: ${err.message}` });
    if (err instanceof Anthropic.APIError) return json(502, { erro: `Erro na IA (${err.status ?? 'sem status'}). Tente de novo em instantes.` });
    return json(500, { erro: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` });
  }
}
