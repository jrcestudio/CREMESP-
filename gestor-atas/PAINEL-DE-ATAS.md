# Painel de Atas: como colocar no ar

O Painel de Atas é um sistema **separado** do Gestor de Atas da REDXCORP. Ele tem uma página inicial onde o setor
cadastra uma Ata de Registro de Preços: anexa o PDF e importa o arquivo de dados da ata (.json), você confere tudo
numa tela de revisão e a ata vira um sistema completo, igual ao do Gestor: saldos, simulador, ordem de
orçamento, eventos e andamento, relatórios e portal do fornecedor. Dá para cadastrar quantas atas quiser, de
qualquer setor.

Os dados ficam em tabelas próprias (`painel_...`) e arquivos próprios (`painel-anexos`). O Gestor de Atas que já
está no ar não muda nada.

São 3 passos, todos pelo navegador. Leva uns 10 minutos. Não há custo extra.

## 1. Criar as tabelas no Supabase

Use o mesmo projeto do Supabase do Gestor de Atas (assim o login de todo mundo continua o mesmo).

1. Abra o arquivo `supabase/painel-configurar.sql` aqui do repositório e copie tudo.
2. No Supabase, entre no projeto › **SQL Editor** › **New query** e cole.
3. Na última parte do script (item 10), troque `seu.email@exemplo.com` pelo seu e-mail.
4. Clique em **Run**. Deve aparecer "Success".

Esse e-mail vira o primeiro membro da equipe do painel. Os outros você adiciona depois, pelo próprio sistema.

## 2. Publicar o painel na Vercel (um projeto novo)

1. Na Vercel, clique em **Add New… › Project** e importe de novo o repositório `jrcestudio/cremesp-`.
2. **Project Name**: `painel-atas-cremesp` (ou outro nome que preferir; ele vira o endereço do site).
3. **Root Directory**: clique em Edit e escolha a pasta `gestor-atas` (a mesma do Gestor).
4. Abra **Environment Variables** e adicione estas 3:

   | Nome | Valor |
   | --- | --- |
   | `VITE_MODO` | `painel` |
   | `VITE_SUPABASE_URL` | o mesmo do projeto do Gestor de Atas |
   | `VITE_SUPABASE_ANON_KEY` | a mesma do projeto do Gestor de Atas (chave publishable) |

   Os valores do Supabase você copia do projeto do Gestor na Vercel (**Settings › Environment Variables**).
   É o `VITE_MODO=painel` que faz esse site abrir o Painel em vez do Gestor.
5. Clique em **Deploy**. Em 1 ou 2 minutos o endereço fica pronto, algo como `painel-atas-cremesp.vercel.app`.

## 3. Primeiro uso

1. Abra o endereço novo e entre com o mesmo e-mail e senha do Gestor de Atas.
2. Na página inicial, em **Cadastrar nova ata**: escreva o nome do setor e a que serviço ou produto a ata se refere,
   anexe o PDF da ata e escolha o arquivo de dados (.json). Clique em **Importar dados da ata**.
3. Confira a tela de revisão: dados gerais, vigência e cada item (quantidade, unidade e valor). O que precisar de
   conferência aparece no quadro amarelo "Pontos para conferir".
4. Clique em **Criar sistema desta ata**. Pronto: o sistema da ata abre, com todas as abas do Gestor.
5. Para voltar à lista, use **Todas as atas** no canto esquerdo.

Para dar acesso: dentro de qualquer ata, vá em **Configuração da Ata › Quem tem acesso**.

- **Equipe Cremesp**: vê e edita todas as atas do painel.
- **Fornecedor**: vê só a ata em que foi cadastrado (e só os eventos enviados a ele). Se o mesmo fornecedor tiver
  duas atas, cadastre o e-mail dentro de cada uma.

## De onde vem o arquivo de dados

Mande o PDF da ata para o Claude, na conversa do projeto, e peça "gera o arquivo de dados desta ata para o Painel".
Ele devolve um arquivo `.json` com os dados gerais e todos os itens. Salve no computador e importe no painel.
O formato está em `exemplos/dados-ata-exemplo.json` (ata fictícia, para testar).

Também funciona com um backup exportado do próprio sistema (**Configuração da Ata › Exportar backup**): os itens
vêm junto, os eventos não. Se preferir, use **Cadastrar os itens à mão** e preencha tudo na tela de revisão.

## Dúvidas comuns

**"Painel ainda não configurado"**: rode o `supabase/painel-configurar.sql` (passo 1).

**"Acesso não liberado"**: o e-mail não está na equipe do painel. Alguém da equipe precisa adicioná-lo, ou rode de
novo a última parte do script com o e-mail certo.

**Algum valor veio errado ou faltou um item**: corrija na tela de revisão. Depois de criada, a ata também pode ser
editada em **Configuração da Ata**, como no Gestor.

**"Esse arquivo não é um arquivo de dados válido"**: confira se escolheu o `.json` (e não o PDF) no campo 2.
