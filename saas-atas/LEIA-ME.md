# Painel de Atas – versão SaaS (vários órgãos)

Cópia separada do Painel de Atas, preparada para ser vendida a vários órgãos públicos.
**Não mexe em nada do que já está no ar**: tem pasta própria (`saas-atas/`), banco próprio (um projeto novo no
Supabase) e site próprio (um projeto novo na Vercel). O Gestor de Atas da REDXCORP (`gestor-atas/`) continua igual.

## O que muda em relação ao Painel do Cremesp

- **Vários órgãos no mesmo sistema.** Cada pessoa só enxerga as atas do órgão em que foi cadastrada. A separação é
  feita pelo próprio banco (regras de segurança do Supabase), não só pela tela.
- **Identidade de cada órgão.** Nome, sigla, logo, cor, CNPJ, endereço, cidade e UASG ficam em *Dados do órgão* e
  aparecem no topo, na ordem de serviço, nos relatórios e no portal do fornecedor (ex.: "Protocolo Cremesp" vira
  "Protocolo CRM-RJ"). Nada do Cremesp ficou fixo no código.
- **Histórico de alterações.** Tudo o que é criado, alterado ou excluído fica registrado com data, autor, valor
  antes e depois. Ninguém consegue editar esse registro (exigência comum de controle interno e TCE).
- **Administração da plataforma** (só você): cadastrar um órgão cliente e o primeiro e-mail da equipe dele, ver
  quantas atas e usuários cada um tem e quando usou pela última vez, e **bloquear** um órgão (fim de contrato,
  inadimplência) sem apagar os dados. Você não vê o conteúdo das atas dos clientes.
- O resto é o mesmo Painel: importar a ata (.json), saldos, simulador, ordem de orçamento, eventos e andamento,
  relatórios, anexos e portal do fornecedor.

## Quem vê o quê dentro de cada órgão

| Papel | Quem é | O que acessa |
| :-- | :-- | :-- |
| Gestor | Departamento de Licitação | Todas as atas e departamentos; cadastra departamentos, representantes, logo e dados do órgão |
| Representante | Uma pessoa de cada departamento | Só as atas do seu departamento; cadastra colegas do departamento e os fiscais e fornecedores dessas atas |
| Fiscal | Fiscal de uma ata | Só as atas em que foi cadastrado (pode editar) |
| Fornecedor | Empresa da ata | Só o portal do fornecedor das atas dele |

O gestor cria os departamentos em **Departamentos**. Cada ata nova pertence a um departamento. Fiscais e fornecedores
são cadastrados dentro da ata, em *Configuração da Ata*. A cor do órgão (ex.: verde Cremesp) é aplicada no menu,
nos cards e nos botões.

## Como publicar (sem terminal)

1. **Supabase:** crie um projeto **novo** (região *South America (São Paulo)*). Em *Authentication › Sign In / Providers
   › Email*, desligue **Confirm email**. Em *SQL Editor › New query*, cole o arquivo
   [`supabase/saas-configurar.sql`](supabase/saas-configurar.sql), troque `seu.email@exemplo.com` (última parte) pelo
   seu e-mail e clique em **Run**. Depois, numa nova query, cole e rode também
   [`supabase/saas-assinatura.sql`](supabase/saas-assinatura.sql) (portal do fornecedor com assinatura eletrônica).
2. **Vercel:** *Add New › Project*, escolha este repositório e, em **Root Directory**, selecione `saas-atas`.
   Em *Environment Variables*, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (em Supabase › *Project
   Settings › API*; use a chave *publishable* / *anon*). Clique em **Deploy**.
3. Abra o site, clique em **Primeiro acesso** com o seu e-mail e crie a senha. Você cai na *Administração da
   plataforma*: cadastre o órgão, a cor dele e o e-mail do gestor (Departamento de Licitação).
4. Mande o link ao gestor do órgão. No primeiro acesso ele cria a senha e já entra no órgão; depois cria os
   departamentos e seus representantes em *Departamentos* e ajusta logo e dados em *Dados do órgão*.

Quem é de mais de um órgão (ou você, se entrar na equipe de um cliente para dar suporte) escolhe o órgão ao entrar.
"Entrar na equipe" de um cliente fica registrado no histórico dele.

## Assinatura eletrônica do fornecedor

Quando o fornecedor **confirma o orçamento** no portal, ele assina eletronicamente (assinatura eletrônica simples,
Lei 14.063/2020): informa nome completo, CPF e cargo, marca "Li e concordo" na declaração e digita a própria senha.
O banco grava, numa tabela que ninguém consegue alterar nem apagar (`painel_assinaturas`): data e hora, IP, navegador,
e-mail e usuário, a cópia exata do orçamento (itens, quantidades, diárias, valores, total e arquivos anexados, com o
SHA-256 de cada arquivo) e o hash SHA-256 de tudo isso. O resto do fluxo não muda: pedir ajuste, mensagens e nota
fiscal continuam sem assinatura.

A equipe vê o selo "Assinado eletronicamente por…" em *Eventos e andamento* e no histórico, abre o **comprovante**
(que confere se o registro está íntegro e se o orçamento mudou depois da assinatura) e pode **imprimir/salvar em PDF**
ou baixar os dados em .json. A Ordem de Orçamento impressa também traz a linha da assinatura.

Para trocar por assinatura avançada (ZapSign, Clicksign) no futuro, a tabela já tem as colunas `metodo` e
`provedor_ref`, `provedor_status`, `provedor_dados`.

## Para desenvolver

```bash
npm install
npm run dev     # http://localhost:5173 (precisa das variáveis VITE_SUPABASE_*)
npm run build   # site em dist/
```

- `src/marca.ts`: identidade do órgão atual (sigla, logo, cor; as classes `marca-50 … marca-900` seguem a cor).
- `src/Painel.tsx`: login, escolha do órgão, lista de atas e cadastro de nova ata.
- `src/Plataforma.tsx`: administração da plataforma, dados do órgão e histórico.
- `src/GestorAtas.tsx`: o sistema de cada ata (o mesmo do Gestor de Atas, sem dados fixos do Cremesp).
- `exemplos/dados-ata-exemplo.json`: formato do arquivo de dados da ata.

## Próximos passos sugeridos

- Leitura automática do PDF da ata (hoje o .json é gerado à parte).
- Endereço próprio por cliente (ex.: `crmrj.seudominio.com.br`) e domínio próprio do produto.
- Termos de uso, política de privacidade e termo de tratamento de dados (LGPD) para anexar às contratações.
