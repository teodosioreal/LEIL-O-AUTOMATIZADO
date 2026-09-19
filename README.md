# Leilão Automatizado — plataforma para testes de funcionamento

App de leilão ao vivo (lances em tempo real, anti-sniping e webhooks
configuráveis) feito pra **testar o fluxo de ponta a ponta** antes de plugar
num sistema de verdade: você cadastra leilões e uma lista de nomes de
participantes, e pode disparar um **simulador** que rotaciona esses nomes
dando lances automaticamente — tudo isso reflete em tempo real na vitrine e
dispara os webhooks configurados no dashboard.

Este projeto é **independente** — não compartilha código, banco de dados
nem deploy com nenhum outro projeto.

## Como rodar

```bash
npm install
cp .env.example .env   # edite ADMIN_USER/ADMIN_PASSWORD
npm start
```

- Vitrine pública: `http://localhost:3000/`
- Dashboard (usuário/senha do `.env`): `http://localhost:3000/dashboard.html`

## Fluxo básico de teste

1. **Dashboard → Participantes**: cadastre alguns nomes (só nome público,
   sem e-mail/telefone — o app nem tem esses campos).
2. **Dashboard → Leilões**: crie um leilão com preço inicial, incremento
   mínimo, início/término e a janela/prorrogação do anti-sniping.
3. **Dashboard → Webhooks**: cole a URL do seu endpoint de teste (ex: um
   `webhook.site`, RequestBin, ou seu próprio servidor), e marque quais dos
   3 eventos quer receber.
4. Quando o leilão estiver "Ao vivo", clique em **Simular lances** na
   tabela de leilões — escolha quantos lances e o intervalo entre eles. O
   sistema roda em background, sorteando participantes do seu roster,
   registrando lances de verdade (mesmo caminho de um lance humano) e
   atualizando a vitrine ao vivo.
5. Quando o leilão termina, se houve lance, o pagamento é confirmado
   automaticamente (configurável em Webhooks — ou clique manualmente em
   **Confirmar pagamento** na tabela) e o webhook de vencedor é disparado.

## Os 3 eventos de webhook

Todos são enviados como `POST` JSON, em background (nunca travam o leilão),
com `Content-Type: application/json` e os headers `X-Webhook-Event-Id`,
`X-Webhook-Event-Type`, `X-Webhook-Attempt` (e `X-Webhook-Signature` se você
configurar um secret — HMAC SHA-256 do corpo).

```json
{
  "event_id": "uuid — nunca muda numa retentativa do MESMO evento",
  "type": "auction.start | bid.placed | auction.won",
  "external_id": "leilao_<id> — estável durante toda a vida do leilão",
  "occurred_at": "2026-01-01T12:00:00.000Z",
  "attempt": 1,
  "data": { "...": "só nome público e valores — nunca e-mail/telefone/pagamento" }
}
```

- **`auction.start`** — disparado quando o leilão começa. Se um lance
  chegar dentro da janela de anti-sniping, o prazo é prorrogado e este
  mesmo evento é **reenviado com o mesmo `external_id`** (novo
  `event_id`, pois é uma nova ocorrência) — quem recebe trata como
  atualização do mesmo leilão, não como um leilão novo.
- **`bid.placed`** — disparado a cada lance válido.
- **`auction.won`** — disparado quando o leilão encerra e o pagamento é
  confirmado (capturado com sucesso — nesta versão de testes, a "captura"
  é simulada/manual no dashboard).

**Retry**: em falha de rede, timeout ou resposta 5xx, o evento é
reentregue automaticamente até 3 vezes (backoff de 5s → 30s → 120s),
sempre com o **mesmo `event_id`** da tentativa original — quem recebe pode
usar isso pra ignorar duplicata. Respostas 4xx não são reentregues
automaticamente (é tratado como erro do formato/autenticação), mas dá pra
reenviar manualmente pelo dashboard a qualquer momento, sem trocar o
`event_id`.

## Estrutura

```
server.js         → Express + Socket.IO + Basic Auth no /dashboard e /api/admin
src/config.js      → variáveis de ambiente
src/db.js           → "banco" em JSON (data.json, criado sozinho)
src/auctions.js       → ciclo de vida do leilão, lances, anti-sniping, simulador
src/webhooks.js         → fila de entrega dos webhooks (retry/backoff/idempotência)
src/realtime.js           → ponte com o Socket.IO
src/routes.js               → API REST (pública + admin)
public/
  index.html                 → vitrine (cards com contagem regressiva)
  leilao.html                 → página do leilão (lances + feed ao vivo)
  dashboard.html                → admin: leilões, participantes, webhooks, simulador
```
