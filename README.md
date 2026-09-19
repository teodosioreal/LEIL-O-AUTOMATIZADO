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

A aba **Leilões** do dashboard tem só 3 coisas — o resto é automático:

1. **Configurações**: um painel único (preço inicial, incremento, duração
   de cada leilão, proteção contra lance de última hora, e os **lances
   automáticos** — até quantos compradores participam de cada leilão
   [sorteados do cadastro] e a faixa de valor de cada lance, ex: de 10 a
   50, sem teto de preço). É salvo uma vez e usado tanto pelo botão quanto
   pela rotação automática — não tem campo repetido.
2. **Simular leilão agora**: um botão. Cria um leilão na hora com as
   Configurações salvas, sorteia até N compradores do cadastro (**30
   compradores de exemplo** já vêm pré-cadastrados — maioria nomes árabes,
   com alguns em inglês e espanhol, cada um com cidade/bandeira/avatar) e
   cada um dá um lance de valor aleatório dentro da faixa — tudo aparece
   na vitrine em poucos segundos, com foto/nome/cidade no feed de lances.
3. **Rotação automática**: um interruptor + "a cada quantos minutos" —
   quando ligado, repete o passo 2 sozinho, sem precisar clicar. É a forma
   mais "deixa rodando" de testar o fluxo inteiro (leilão nascendo,
   recebendo lance, encerrando, pagando, disparando webhook) em loop.

Fora isso, a aba **Webhooks** configura pra onde os eventos vão (URL +
formato), e a aba **Compradores** deixa editar o elenco (nome, cidade,
bandeira, foto). Quando um leilão termina, se houve lance, o pagamento é
confirmado automaticamente (configurável em Webhooks — ou manualmente na
tabela de leilões) e o webhook de vencedor é disparado.

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
`event_id`. Além disso, `bid.placed`/`auction.won` de um leilão nunca são
enviados antes do `auction.start` correspondente ter sido confirmado (200)
— se o `start` ainda está tentando entregar, os outros esperam a vez.

## Integração com o privefeet.pro

Na aba **Webhooks**, o campo **Formato do payload** tem uma opção
`privefeet.pro` — muda o payload e o header de autenticação pro formato
exato que o endpoint deles espera (`POST
https://privefeet.pro/api/webhooks/auction`):

- Header: `X-Webhook-Secret: <AUCTION_WEBHOOK_SECRET>` (valor cru, sem
  `Bearer`, sem hash — diferente do modo "Genérico", que assina com HMAC).
- `start`: `{"type":"start","external_id":"leilao_<id>","event_id":"...","ends_at":"<ISO>"}`
- `bid`: `{"type":"bid","external_id":"leilao_<id>","event_id":"...","bidder_name":"...","bidder_flag":"🇧🇷","amount":133.71}`
  (`bidder_flag` só entra se o comprador tiver uma bandeira cadastrada;
  `amount` sempre em reais, nunca centavos)
- `end`: `{"type":"end","external_id":"leilao_<id>","event_id":"...","winner_name":"...","winner_amount":133.71}`

Testado de ponta a ponta contra um servidor que reproduz as mesmas regras
deles (401 sem header certo, 404 em `bid`/`end` sem `start` prévio pro
mesmo `external_id`, 200 com `{"ok":true,"auction":{...}}`) — inclusive o
caso de corrida em que o `start` falha e precisa de retry: o `bid` fica
esperando e só é enviado depois que o `start` é confirmado.

Pra conferir se chegou: `GET https://privefeet.pro/api/auction/current`
(link direto aparece no dashboard quando esse formato está selecionado).

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
