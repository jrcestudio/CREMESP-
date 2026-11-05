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
- 3 eventos aprovados e 1 em simulação, **fictícios**, só para a tela abrir com dados. Apague ou edite à vontade.

## Como funciona o saldo

- Cada item consome da Ata `quantidade × diárias` (as unidades da Ata são diárias).
- **Aprovado / Consumir Saldo** abate do saldo; **Em Simulação** apenas reserva.
- Não é possível aprovar um evento com item acima do saldo disponível.
- Os dados ficam salvos no navegador (`localStorage`). Use *Exportar backup* na Configuração para guardar uma cópia
  ou levar para outro computador.

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
