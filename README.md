# Leilão Automatizado — plataforma para testes de funcionamento

App de leilão ao vivo (lances, anti-sniping e webhooks configuráveis) feito
pra **testar o fluxo de ponta a ponta** antes de plugar num sistema de
verdade: você cadastra leilões e uma lista de nomes de participantes, e pode
disparar um **simulador** que rotaciona esses nomes dando lances
automaticamente — tudo isso aparece na vitrine em poucos segundos (a página
atualiza sozinha, sem precisar recarregar) e dispara os webhooks
configurados no dashboard.

Este projeto é **independente** — não compartilha código, banco de dados
nem deploy com nenhum outro projeto.

Propositalmente **sem WebSocket/Socket.IO** — só Express puro, com a
vitrine e a página do leilão atualizando via polling (a cada 2-3s). Isso
mantém a árvore de dependências mínima e 100% JavaScript puro (nada de
módulo nativo pra compilar), o que importa em hospedagem compartilhada como
a Hostinger, que normalmente não tem toolchain de build (gcc/python/make)
disponível.

## Como rodar

```bash
npm install
cp .env.example .env   # edite ADMIN_USER/ADMIN_PASSWORD
npm start
```

- Vitrine pública: `http://localhost:3000/`
- Dashboard (usuário/senha do `.env`): `http://localhost:3000/dashboard.html`

## Como subir na Hostinger

A Hostinger tem um recurso de **"Node.js hosting"** (ou um plano VPS) no
hPanel. Os passos são os mesmos nos dois casos:

1. Suba a pasta inteira deste projeto (via Git, FTP, ou pelo File Manager do
   hPanel). Não precisa subir a pasta `node_modules` — ela é gerada no passo 4.
2. No hPanel, na seção Node.js, escolha a **versão do Node 18 ou mais
   recente** (o app declara isso em `package.json` → `engines`) e aponte o
   **arquivo de inicialização** para `server.js`. Se a versão selecionada
   for menor que 18, a instalação das dependências ou a inicialização
   costuma falhar.
3. Copie `.env.example` para `.env` e preencha:
   ```
   PORT=3000
   ADMIN_USER=admin
   ADMIN_PASSWORD=uma-senha-forte
   ```
   (a porta normalmente é definida pela própria Hostinger — confira o valor
   que ela indicar no hPanel e ajuste o `.env` se for diferente de 3000).
4. Rode a instalação de dependências (o painel da Hostinger normalmente tem
   um botão "Run NPM Install"; se for VPS, rode `npm install` via terminal).
5. Inicie a aplicação (botão "Start" no hPanel, ou `npm start` no VPS).
6. Acesse o domínio/subdomínio que a Hostinger apontou pro app. A vitrine
   (`/`) fica aberta pra qualquer um; o dashboard (`/dashboard.html`) pede o
   usuário/senha do `.env`.

Se for VPS puro (sem o recurso "Node.js hosting"), rode com um gerenciador
de processos pra ele não cair quando você fechar o terminal:
```bash
npm install
npm install -g pm2
pm2 start server.js --name leilao-automatizado
pm2 save
pm2 startup
```

**Importante:** troque a senha padrão do dashboard antes de deixar o app
público, e configure a URL do webhook (aba Webhooks do dashboard) apontando
pro seu endpoint de teste já rodando em produção.

## Fluxo básico de teste

1. **Dashboard → Compradores**: cadastre o "elenco" de teste — nome,
   cidade/local e foto (URL ou upload; se deixar sem foto, gera um avatar
   automático com as iniciais). Só dado público, sem e-mail/telefone — o
   app nem tem esses campos.
2. **Dashboard → Leilões**: crie um leilão com preço inicial, incremento
   mínimo, início/término e a janela/prorrogação do anti-sniping.
3. **Dashboard → Webhooks**: cole a URL do seu endpoint de teste (ex: um
   `webhook.site`, RequestBin, ou seu próprio servidor), e marque quais dos
   3 eventos quer receber.
4. Quando o leilão estiver "Ao vivo", clique em **Simular lances** na
   tabela de leilões — escolha quantos lances CADA comprador vai dar e a
   faixa de valor do incremento (ex: de 10 a 50 — sem teto de preço). O
   sistema roda em background, rotacionando entre os compradores
   cadastrados (ordem embaralhada), registrando lances de verdade (mesmo
   caminho de um lance humano, com foto/nome/cidade aparecendo no feed) —
   a vitrine e a página do leilão pegam cada lance novo no próprio polling
   (poucos segundos de atraso, sem precisar recarregar a página).
5. Quando o leilão termina, se houve lance, o pagamento é confirmado
   automaticamente (configurável em Webhooks — ou clique manualmente em
   **Confirmar pagamento** na tabela) e o webhook de vencedor é disparado.

## Rotação automática de leilões

Na aba **Leilões → Rotação automática**, dá pra deixar a plataforma
criando leilões sozinha, de tempos em tempos — ex: um a cada 3 minutos, ou
a cada 6, o valor é livre (mínimo 30s, só pra não entrar em loop se
alguém digitar 0 por engano). Cada leilão automático usa o preço
inicial/incremento/anti-sniping que você configurar ali, e opcionalmente
já sai simulando lances sozinho (mesma lógica do simulador manual: cada
comprador cadastrado dá X lances, com valor aleatório numa faixa que você
define). É a forma mais "deixa rodando" de testar o fluxo inteiro —
leilão nascendo, recebendo lance, encerrando, pagando, disparando
webhook — em loop, sem precisar ficar clicando.

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
- **`bid.placed`** — disparado a cada lance válido. `data` inclui
  `bidderName`, `bidderCity` e `bidderPhotoUrl` (a foto do comprador, ou o
  avatar de iniciais gerado automaticamente) — sempre dado público.
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
server.js         → Express + Basic Auth no /dashboard e /api/admin
src/config.js      → variáveis de ambiente
src/db.js           → "banco" em JSON (data.json, criado sozinho)
src/auctions.js       → ciclo de vida do leilão, lances, anti-sniping, simulador
src/webhooks.js         → fila de entrega dos webhooks (retry/backoff/idempotência)
src/routes.js             → API REST (pública + admin)
public/
  index.html                 → vitrine (cards com contagem regressiva, atualiza por polling)
  leilao.html                 → página do leilão (lances + feed, atualiza por polling)
  dashboard.html                → admin: leilões, participantes, webhooks, simulador
```

## Dependências

Só 4, todas puro JavaScript (nenhuma precisa compilar nada):
`express`, `express-basic-auth`, `multer` (upload de imagem) e `dotenv`.
Não tem WebSocket, banco com driver nativo, nem qualquer coisa que exija
compilador C/C++ — pensado pra rodar sem drama em hospedagem compartilhada.
