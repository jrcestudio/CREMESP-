# Como colocar o Gestor de Atas no ar para o setor

São 4 etapas, todas pelo navegador, sem instalar nada. Leva uns 15 minutos.
No fim você terá um endereço (ex.: `gestor-atas-cremesp.vercel.app`) que todos do setor abrem, com login e os
mesmos dados em tempo real.

## 1. Criar o banco de dados (Supabase, gratuito)

1. Entre em **supabase.com** e clique em **Start your project**. Entre com sua conta do GitHub.
2. Clique em **New project**:
   - **Name:** `gestor-atas`
   - **Database Password:** clique em *Generate a password* e guarde num lugar seguro.
   - **Region:** *South America (São Paulo)*.
   - Clique em **Create new project** e espere uns 2 minutos.
3. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
4. Abra o arquivo [`supabase/configurar.sql`](supabase/configurar.sql), copie tudo e cole no editor.
5. Na **última linha**, troque `seu.email@exemplo.com` pelo **seu e-mail**. Clique em **Run**.
   Deve aparecer *Success. No rows returned*.

## 2. Desligar a confirmação por e-mail

O envio de e-mails gratuito do Supabase só chega a poucos endereços, então o login usa e-mail e senha.
Quem não estiver na lista de membros não vê nada, mesmo criando senha.

1. No menu da esquerda: **Authentication › Sign In / Providers** (ou **Providers › Email**).
2. Desligue **Confirm email** e clique em **Save**.

## 3. Copiar as duas chaves

1. Abra **Project Settings › Data API** (em algumas versões, **Settings › API**).
2. Copie o **Project URL** (algo como `https://abcdxyz.supabase.co`).
3. Em **Project Settings › API Keys**, copie a chave **anon public** (um texto longo que começa com `eyJ`).
   Essa chave pode ficar no site: a proteção dos dados é feita pelo banco.

## 4. Publicar na Vercel

> Antes, faça o merge do pull request do Gestor de Atas no GitHub.

1. Em **vercel.com**, clique em **Add New › Project** e escolha o repositório **CREMESP-**.
2. **Project Name:** `gestor-atas-cremesp`.
3. **Root Directory:** clique em *Edit* e escolha a pasta **`gestor-atas`**. O preset **Vite** aparece sozinho.
4. Abra **Environment Variables** e adicione as duas:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | o Project URL da etapa 3 |
   | `VITE_SUPABASE_ANON_KEY` | a chave anon public da etapa 3 |

5. Clique em **Deploy**. Em cerca de um minuto sai o endereço do site.

## Primeiro uso

1. Abra o endereço, clique em **Primeiro acesso**, informe o seu e-mail (o mesmo do script) e crie uma senha.
2. Na primeira entrada, o sistema grava a Ata original (77 itens) no banco.
3. Em **Configuração da Ata › Equipe com acesso**, adicione o e-mail de cada colega e mande o endereço do site.
   Cada um faz o **Primeiro acesso** com o próprio e-mail.

## Dúvidas comuns

- **“Acesso não liberado”:** o e-mail ainda não está na equipe. Alguém que já usa o sistema precisa adicioná-lo.
- **Esqueceram a senha:** no Supabase, **Authentication › Users**, apague o usuário. A pessoa faz o *Primeiro acesso* de novo
  (os dados do setor não são afetados).
- **Duas pessoas editando ao mesmo tempo:** as alterações aparecem para todos em segundos. Se duas pessoas mudarem o mesmo
  evento no mesmo instante, fica a última gravação.
- **Backup:** em **Configuração da Ata › Exportar backup** você baixa uma cópia de tudo. O Supabase também guarda backups diários.
