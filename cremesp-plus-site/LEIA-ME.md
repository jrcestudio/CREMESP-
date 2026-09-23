# Cremesp+ (versão de teste)

Site estático: não precisa instalar nada nem rodar build. Arquivos:

- `index.html`, `evento.html`, `lista.html`, `admin.html`: as páginas
- `data.js`: **os conteúdos e links do YouTube** (é o arquivo que você edita)
- `style.css`, `app.js`: visual e comportamento
- `vercel.json`: configuração da Vercel (também pede aos buscadores que não indexem o teste)
- `assets/`: coloque aqui o logotipo oficial como `logo-cremesp.png`

## Publicar na Vercel

### Opção A: pelo GitHub (sem terminal, recomendada)

1. Crie uma conta em github.com e um repositório novo chamado `cremesp-plus`.
2. Na página do repositório, clique em **uploading an existing file** e arraste TODOS os arquivos desta pasta (não o .zip). Clique em **Commit changes**.
3. Entre em vercel.com com "Continue with GitHub", clique em **Add New > Project**, escolha o repositório `cremesp-plus`.
4. Em **Framework Preset** deixe **Other** e clique em **Deploy**. Em cerca de um minuto sai o endereço (algo como `cremesp-plus.vercel.app`).

Para alterar depois: abra `data.js` no GitHub, clique no lápis, edite e salve. A Vercel publica sozinha.

### Opção B: pelo terminal

1. Instale o Node.js e rode `npm i -g vercel`.
2. Dentro desta pasta, rode `vercel` e responda às perguntas (aceite os padrões).
3. Para a versão final do teste, rode `vercel --prod`.

## Trocar ou adicionar vídeos

Abra `data.js`. Cada conteúdo tem `video.id`: são os 11 caracteres do link do YouTube.
Em `https://youtu.be/FYkh0A845M8` o id é `FYkh0A845M8`.

Para adicionar, copie um bloco de `conteudos`, cole no fim e edite `id`, `titulo`, `tipo`, `tema` e `video.id`.

- Corte com início e fim: `video: { id: 'XXXXXXXXXXX', start: 725, end: 977 }` (em segundos).
- Transmissão em andamento: `aoVivo: true`. Aparece o selo AO VIVO e o item entra em "Transmissões ao Vivo".
- Conteúdo dentro de um congresso: `parent: 'id-do-congresso'`. Ele aparece em "Cortes e destaques deste congresso".

## Capa (miniatura) dos vídeos

A capa é um quadro do próprio vídeo. O YouTube gera 3 quadros por vídeo (por volta de 25%, 50% e 75%) e o site usa o do meio. Para escolher outro, use `video: { id: '...', capa: 1 }` (ou 3). Para uma imagem sua, use `capa: 'assets/capas/nome.jpg'`. Clicar em qualquer ponto do vídeo dá play.

## Logotipo

Coloque o arquivo oficial (do Manual de Identidade Visual) em `assets/logo-cremesp.png`, com fundo transparente. Enquanto ele não existir, o site mostra uma caixa tracejada no lugar.

## O que é demonstração

- `admin.html` não tem login e guarda os cadastros só no navegador de quem usa. Serve para mostrar o fluxo do painel. Para deixar um cadastro permanente, copie o texto da seção "Para deixar permanente" para o `data.js`.
- O site pede aos buscadores para não indexar (`noindex`), porque é um teste.
- Todo conteúdo aqui é público: qualquer pessoa com o endereço assiste.
