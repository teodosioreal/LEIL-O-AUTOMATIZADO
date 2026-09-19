// webhooks.js — fila de entrega de webhooks: assíncrona (nunca trava o
// leilão), com retry e backoff crescente, e event_id estável entre
// tentativas (nunca é trocado numa retentativa do MESMO evento).
//
// Regras seguidas aqui (ver dashboard > Webhooks):
// - Disparo em background: enqueueEvento() só grava o evento e agenda o
//   envio; quem chamou (lance, encerramento do leilão) segue na hora.
// - Retry com backoff: até MAX_TENTATIVAS tentativas, com espera crescente
//   entre elas, só em falha de rede/timeout/5xx.
// - event_id nunca muda numa retentativa — é gerado uma vez, na criação do
//   evento, e reaproveitado em toda tentativa (inclusive no reenvio manual).
// - Nenhum dado sensível (e-mail, telefone, pagamento) entra no payload —
//   isso é responsabilidade de quem monta o "data" (ver src/auctions.js).

const crypto = require('crypto');
const { estado, salvar, proximoId } = require('./db');

const MAX_TENTATIVAS = 4; // 1ª tentativa + 3 retentativas
const BACKOFF_MS = [5000, 30000, 120000]; // espera antes da 2ª, 3ª e 4ª tentativa
const TIMEOUT_MS = 8000;
const INTERVALO_FILA_MS = 2000;

function getConfig() {
  return estado.webhookConfig;
}

function setConfig(parcial) {
  Object.assign(estado.webhookConfig, parcial);
  salvar();
  return estado.webhookConfig;
}

function listarEventos(limit = 200) {
  return [...estado.webhookEventos].sort((a, b) => b.id - a.id).slice(0, limit);
}

// Cria um evento novo (event_id novo) e agenda o primeiro envio.
// type: 'auction.start' | 'bid.placed' | 'auction.won'
// externalId: identificador estável do leilão (mesmo em reenvios de "start")
function enqueueEvento(type, externalId, data) {
  const config = getConfig();
  const evento = {
    id: proximoId('webhookEventos'),
    eventId: crypto.randomUUID(),
    type,
    externalId: String(externalId),
    data,
    status: config.url ? 'pending' : 'sem_destino',
    attempts: 0,
    maxAttempts: MAX_TENTATIVAS,
    nextAttemptAt: new Date().toISOString(),
    lastError: null,
    lastStatusCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  estado.webhookEventos.push(evento);
  salvar();
  // Dispara em background — quem chamou não espera.
  setImmediate(() => processarFila());
  return evento;
}

function assinar(secret, corpo) {
  return crypto.createHmac('sha256', secret).update(corpo).digest('hex');
}

async function tentarEnviar(evento) {
  const config = getConfig();
  if (!config.url) {
    evento.status = 'sem_destino';
    evento.updatedAt = new Date().toISOString();
    salvar();
    return;
  }

  evento.status = 'sending';
  evento.attempts += 1;
  evento.updatedAt = new Date().toISOString();
  salvar();

  const payload = {
    event_id: evento.eventId,
    type: evento.type,
    external_id: evento.externalId,
    occurred_at: evento.createdAt,
    attempt: evento.attempts,
    data: evento.data
  };
  const corpo = JSON.stringify(payload);

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Event-Id': evento.eventId,
    'X-Webhook-Event-Type': evento.type,
    'X-Webhook-Attempt': String(evento.attempts)
  };
  if (config.secret) headers['X-Webhook-Signature'] = `sha256=${assinar(config.secret, corpo)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(config.url, {
      method: 'POST',
      headers,
      body: corpo,
      signal: controller.signal
    });
    clearTimeout(timer);
    evento.lastStatusCode = resposta.status;

    if (resposta.ok) {
      evento.status = 'delivered';
      evento.lastError = null;
    } else if (resposta.status >= 500) {
      agendarRetry(evento, `HTTP ${resposta.status}`);
    } else {
      // 4xx: o destino recusou o formato/autenticação — não adianta insistir.
      evento.status = 'failed';
      evento.lastError = `HTTP ${resposta.status} (resposta 4xx, sem retry)`;
    }
  } catch (err) {
    clearTimeout(timer);
    agendarRetry(evento, err.name === 'AbortError' ? 'timeout' : err.message);
  }

  evento.updatedAt = new Date().toISOString();
  salvar();
}

function agendarRetry(evento, motivo) {
  evento.lastError = motivo;
  if (evento.attempts >= evento.maxAttempts) {
    evento.status = 'failed';
    return;
  }
  evento.status = 'pending';
  const espera = BACKOFF_MS[evento.attempts - 1] || BACKOFF_MS[BACKOFF_MS.length - 1];
  evento.nextAttemptAt = new Date(Date.now() + espera).toISOString();
}

let processando = false;
async function processarFila() {
  if (processando) return;
  processando = true;
  try {
    const agora = Date.now();
    const pendentes = estado.webhookEventos.filter(
      (e) => e.status === 'pending' && new Date(e.nextAttemptAt).getTime() <= agora
    );
    for (const evento of pendentes) {
      await tentarEnviar(evento);
    }
  } finally {
    processando = false;
  }
}

// Reenvio manual (dashboard): mesma event_id, zera as tentativas pra dar
// mais 4 chances de entrega.
function reenviarManual(id) {
  const evento = estado.webhookEventos.find((e) => e.id === Number(id));
  if (!evento) return null;
  evento.attempts = 0;
  evento.status = 'pending';
  evento.nextAttemptAt = new Date().toISOString();
  evento.lastError = null;
  salvar();
  setImmediate(() => processarFila());
  return evento;
}

function iniciar() {
  setInterval(processarFila, INTERVALO_FILA_MS);
}

module.exports = { getConfig, setConfig, listarEventos, enqueueEvento, reenviarManual, iniciar };
