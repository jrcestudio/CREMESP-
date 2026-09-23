/*
  DADOS DO CREMESP+ (versão de teste)

  Para trocar um vídeo: mude o "id" do YouTube (os 11 caracteres depois de v= ou youtu.be/).
  Para adicionar um conteúdo: copie um bloco de "conteudos", cole ao final e edite.

  Campos:
    id         identificador único, sem espaços (vira o endereço da página)
    titulo     título exibido
    tipo       congresso | palestra | institucional
    rotulo     (opcional) nome do tipo exibido na página, ex.: "Sessão solene"
    tema       um dos ids de "temas" abaixo
    realizacao identificação institucional
    data       (opcional) texto livre, ex.: "21/08/2026"
    intro      texto introdutório
    video.id   ID do vídeo no YouTube
    video.start / video.end   (opcional) início e fim em segundos, para cortes
    video.aoVivo              true quando for uma transmissão em andamento
    video.capa                quadro do vídeo usado como capa: 1, 2 ou 3 (≈25%, 50%, 75% do vídeo; padrão 2),
                              ou o caminho de uma imagem sua, ex.: 'assets/capas/congresso.jpg'
    hero       true no conteúdo que aparece grande na página inicial
    parent     (opcional) id do congresso ao qual este conteúdo pertence
    transmissao true se o conteúdo veio de uma transmissão ao vivo
*/
window.CREMESP = {
  temas: [
    { id: 'etica', nome: 'Ética Médica' },
    { id: 'saude-mental', nome: 'Saúde Mental' },
    { id: 'seguranca', nome: 'Segurança do Médico' },
    { id: 'normas', nome: 'Normas e Resoluções' },
    { id: 'tecnologia', nome: 'Tecnologia e IA' },
    { id: 'institucional', nome: 'Conteúdos Institucionais' }
  ],
  tipos: [
    { id: 'congresso', nome: 'Congressos', singular: 'Congresso' },
    { id: 'palestra', nome: 'Palestras', singular: 'Palestra' },
    { id: 'institucional', nome: 'Eventos institucionais', singular: 'Evento institucional' }
  ],
  conteudos: [
    {
      id: '4-congresso-de-medicina-do-cremesp',
      titulo: '4º Congresso de Medicina do Cremesp',
      tipo: 'congresso',
      tema: 'institucional',
      realizacao: 'CREMESP',
      data: '',
      intro: 'Vídeo na íntegra da sala do dia 21 do 4º Congresso de Medicina do Cremesp.',
      video: { id: 'vDOqbeoSKco', aoVivo: false },
      hero: true,
      transmissao: true
    },
    {
      id: 'palestra-ia-4-congresso',
      titulo: 'Palestra IA: 4º Congresso de Medicina do Cremesp',
      tipo: 'palestra',
      tema: 'tecnologia',
      realizacao: 'CREMESP',
      data: '',
      intro: 'Palestra sobre inteligência artificial apresentada no 4º Congresso de Medicina do Cremesp.',
      video: { id: 'FYkh0A845M8', aoVivo: false },
      parent: '4-congresso-de-medicina-do-cremesp'
    },
    {
      id: 'sessao-solene-do-congresso',
      titulo: 'Sessão Solene do Congresso',
      tipo: 'institucional',
      rotulo: 'Sessão solene',
      tema: 'institucional',
      realizacao: 'CREMESP',
      data: '',
      intro: 'Registro da sessão solene do congresso.',
      video: { id: 'Ai2EwlH2yC0', aoVivo: false },
      parent: '4-congresso-de-medicina-do-cremesp'
    },
    {
      id: 'publicidade-medica-cfm-cremesp',
      titulo: 'Publicidade Médica: tire suas dúvidas com CFM e CREMESP',
      tipo: 'palestra',
      tema: 'normas',
      realizacao: 'CREMESP e CFM',
      data: '',
      intro: 'Esclarecimento de dúvidas sobre publicidade médica com o CFM e o CREMESP.',
      video: { id: 'D4Ukfz5GH3c', aoVivo: false },
      transmissao: true
    },
    {
      id: 'sipat-cremesp-2026-dia-3',
      titulo: 'SIPAT CREMESP 2026: fortalecimento de relações e a importância da convivência saudável (dia 3)',
      tipo: 'institucional',
      tema: 'saude-mental',
      realizacao: 'CREMESP',
      data: '',
      intro: 'Transmissão do dia 3 da SIPAT CREMESP 2026.',
      video: { id: 'fYxaa-L_zyo', aoVivo: false },
      transmissao: true
    }
  ]
};
