# Gestor de Atas e Simulador de Eventos

Aplicação React + TypeScript + Tailwind + Lucide para gerir a **ARP nº 0099/2025 (REDXCORP Produção e Locação Ltda)**
e simular eventos com controle de saldo.

Todo o sistema está em um único componente: [`src/GestorAtas.tsx`](src/GestorAtas.tsx).
Os demais arquivos (`main.tsx`, `index.css`, configs) só montam o projeto.

## Dados iniciais

- 77 itens em 9 módulos, com os **preços do 1º Termo Aditivo** (prorrogação de 14/11/2026 a 13/11/2027,
  reajuste IPCA de 4,223450%). Valor global: **R$ 7.747.469,50**, igual ao do termo.
- Quantidades registradas conforme a Ata original.
- Gestora (Carolina Gomes Marcelino) e Fiscal (Tatiana dos Santos) conforme o termo aditivo.
- Nenhum evento cadastrado: o sistema começa zerado, pronto para uso. *Restaurar Ata original* (na Configuração)
  volta a esse estado.
- Visual com o verde institucional e os logos do Cremesp (`src/assets/`).

## Como funciona o saldo

- Cada item consome da Ata `quantidade × diárias` (as unidades da Ata são diárias).
- **Aprovado / Consumir Saldo** abate do saldo; **Em Simulação** apenas reserva.
- Não é possível aprovar um evento com item acima do saldo disponível.
- Cada evento tem um campo de **protocolo interno do Cremesp** (e data de recebimento do orçamento), preenchido na aba Ordem
  depois que o fornecedor responde. Ele aparece no cabeçalho do documento e no resumo para WhatsApp/e-mail.
- Sem Supabase configurado, os dados ficam salvos no navegador (`localStorage`). Use *Exportar backup* na Configuração
  para guardar uma cópia ou levar para outro computador.

## Relatórios

- A aba **Relatórios** agrupa os eventos por **mês, trimestre ou semestre** (pela data de início do evento).
- Por padrão conta só eventos **aprovados**; marque *Incluir eventos em simulação* para ver também o que está reservado.
- Mostra a evolução período a período (executado, acumulado e saldo da Ata), o total por módulo, os itens mais usados
  e a lista de eventos com protocolo. Clique num período para detalhar.
- *Imprimir / Salvar PDF* gera o relatório com o logo do Cremesp; *Exportar planilha (CSV)* abre no Excel, uma linha por item de evento.

## Uso compartilhado pelo setor

Com as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` definidas, o sistema pede login (e-mail e senha),
guarda os dados no Supabase e sincroniza em tempo real entre todos os membros. O passo a passo está em
[COMPARTILHAR-COM-O-SETOR.md](COMPARTILHAR-COM-O-SETOR.md) e o script do banco em [`supabase/configurar.sql`](supabase/configurar.sql).

Sem essas variáveis (por exemplo, o arquivo único `dist-single/index.html`), funciona sozinho no navegador.

## Rodar e publicar

```bash
npm install
npm run dev            # desenvolvimento em http://localhost:5173
npm run build          # site em dist/ (para a Vercel)
npm run build:single   # um único HTML autocontido em dist-single/index.html
```

Na Vercel: *Add New > Project*, escolha este repositório e, em **Root Directory**, selecione `gestor-atas`.
O preset **Vite** é detectado sozinho.

O arquivo `dist-single/index.html` também pode ser aberto direto no navegador, sem instalar nada.
