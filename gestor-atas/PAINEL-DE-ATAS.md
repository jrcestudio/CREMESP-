# Painel de Atas: como colocar no ar

O Painel de Atas é um sistema **separado** do Gestor de Atas da REDXCORP. Ele tem uma página inicial onde o setor
anexa uma Ata de Registro de Preços (PDF). A IA lê o arquivo, puxa os dados gerais e a tabela de itens, você confere
tudo numa tela de revisão e a ata vira um sistema completo, igual ao do Gestor: saldos, simulador, ordem de
orçamento, eventos e andamento, relatórios e portal do fornecedor. Dá para cadastrar quantas atas quiser, de
qualquer setor.

Os dados ficam em tabelas próprias (`painel_...`) e arquivos próprios (`painel-anexos`). O Gestor de Atas que já
está no ar não muda nada.

São 4 passos, todos pelo navegador. Leva uns 15 minutos.

## 1. Criar as tabelas no Supabase

Use o mesmo projeto do Supabase do Gestor de Atas (assim o login de todo mundo continua o mesmo).

1. Abra o arquivo `supabase/painel-configurar.sql` aqui do repositório e copie tudo.
2. No Supabase, entre no projeto › **SQL Editor** › **New query** e cole.
3. Na última parte do script (item 10), troque `seu.email@exemplo.com` pelo seu e-mail.
4. Clique em **Run**. Deve aparecer "Success".

Esse e-mail vira o primeiro membro da equipe do painel. Os outros você adiciona depois, pelo próprio sistema.

## 2. Criar a chave da IA (Anthropic)

1. Entre em <https://console.anthropic.com> e crie uma conta (pode ser com o e-mail de trabalho).
2. Em **Settings › Billing**, coloque créditos (US$ 5 já dá para dezenas de atas).
3. Em **Settings › API Keys**, clique em **Create Key**, dê o nome `painel-atas` e copie a chave (começa com
   `sk-ant-`). Ela só aparece uma vez.

Guarde a chave só na Vercel (passo 3). Não mande por e-mail nem coloque em nenhum arquivo.

Custo: cada leitura custa em torno de US$ 0,30 a US$ 1 (R$ 2 a R$ 6), dependendo do tamanho da ata. Só é cobrado
quando alguém clica em "Ler ata com IA".

## 3. Publicar o painel na Vercel (um projeto novo)

1. Na Vercel, clique em **Add New… › Project** e importe de novo o repositório `jrcestudio/cremesp-`.
2. **Project Name**: `painel-atas-cremesp` (ou outro nome que preferir; ele vira o endereço do site).
3. **Root Directory**: clique em Edit e escolha a pasta `gestor-atas` (a mesma do Gestor).
4. Abra **Environment Variables** e adicione estas 4:

   | Nome | Valor |
   | --- | --- |
   | `VITE_MODO` | `painel` |
   | `VITE_SUPABASE_URL` | o mesmo do projeto do Gestor de Atas |
   | `VITE_SUPABASE_ANON_KEY` | a mesma do projeto do Gestor de Atas (chave publishable) |
   | `ANTHROPIC_API_KEY` | a chave `sk-ant-...` do passo 2 |

   Os valores do Supabase você copia do projeto do Gestor na Vercel (**Settings › Environment Variables**).
   É o `VITE_MODO=painel` que faz esse site abrir o Painel em vez do Gestor.
5. Clique em **Deploy**. Em 1 ou 2 minutos o endereço fica pronto, algo como `painel-atas-cremesp.vercel.app`.

## 4. Primeiro uso

1. Abra o endereço novo e entre com o mesmo e-mail e senha do Gestor de Atas.
2. Na página inicial, em **Anexar nova ata**: escreva o nome do setor, a que serviço ou produto a ata se refere,
   anexe o PDF e clique em **Ler ata com IA**. A leitura leva de 1 a 3 minutos.
3. Confira a tela de revisão: dados gerais, vigência e cada item (quantidade, unidade e valor). O que a IA não tiver
   certeza aparece no quadro amarelo "Pontos para conferir".
4. Clique em **Criar sistema desta ata**. Pronto: o sistema da ata abre, com todas as abas do Gestor.
5. Para voltar à lista, use **Todas as atas** no canto esquerdo.

Para dar acesso: dentro de qualquer ata, vá em **Configuração da Ata › Quem tem acesso**.

- **Equipe Cremesp**: vê e edita todas as atas do painel.
- **Fornecedor**: vê só a ata em que foi cadastrado (e só os eventos enviados a ele). Se o mesmo fornecedor tiver
  duas atas, cadastre o e-mail dentro de cada uma.

## Dúvidas comuns

**"A leitura com IA ainda não foi ativada"**: falta a variável `ANTHROPIC_API_KEY` na Vercel. Depois de adicionar,
vá em **Deployments › … › Redeploy**.

**"Painel ainda não configurado"**: rode o `supabase/painel-configurar.sql` (passo 1).

**"Acesso não liberado"**: o e-mail não está na equipe do painel. Alguém da equipe precisa adicioná-lo, ou rode de
novo a última parte do script com o e-mail certo.

**A IA errou um valor ou pulou um item**: corrija na tela de revisão. Depois de criada, a ata também pode ser
editada em **Configuração da Ata**, como no Gestor.

**A leitura demorou e deu erro de tempo**: atas muito longas podem passar do limite da Vercel. Envie um PDF só com
as páginas da ata e da tabela de preços, ou use **Cadastrar os itens à mão**, que aparece junto do erro.

**Ata escaneada (foto)**: funciona. Quanto mais nítido o arquivo, melhor a leitura.
