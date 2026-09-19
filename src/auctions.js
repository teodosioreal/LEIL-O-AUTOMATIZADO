// auctions.js — motor do leilão: ciclo de vida (agendado → ao vivo →
// aguardando pagamento → pago), validação de lances, anti-sniping e o
// simulador de lances usado pra testar o fluxo de ponta a ponta (incluindo
// os webhooks) sem precisar de gente de verdade dando lance.

const { estado, salvar, proximoId } = require('./db');
const webhooks = require('./webhooks');

const TICK_MS = 1000;

function agora() {
  return new Date().toISOString();
}

function externalId(leilao) {
  return `leilao_${leilao.id}`;
}

// ---------- campos públicos (nunca inclui e-mail/telefone/pagamento — o
// roster de participantes deste app só tem nome, então isso é garantido
// pela própria modelagem, não só por filtragem aqui) ----------

function leilaoPublico(l) {
  return {
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    imagemUrl: l.imagemUrl,
    precoInicial: l.precoInicial,
    precoAtual: l.precoAtual,
    incrementoMinimo: l.incrementoMinimo,
    moeda: l.moeda,
    iniciaEm: l.iniciaEm,
    terminaEm: l.terminaEm,
    status: l.status,
    totalLances: l.totalLances,
    vencedorNome: l.vencedorNome || null
  };
}

function lancePublico(b) {
  return {
    id: b.id,
    leilaoId: b.leilaoId,
    participanteNome: b.participanteNome,
    participanteCidade: b.participanteCidade || '',
    participanteFoto: b.participanteFoto,
    valor: b.valor,
    criadoEm: b.criadoEm
  };
}

// Avatar automático (iniciais, tema dourado/escuro) quando o comprador não
// tem foto cadastrada — sem depender de upload pra já parecer realista.
function fotoParticipante(p) {
  if (p.fotoUrl) return p.fotoUrl;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(p.nome)}&background=16161d&color=d4af37&bold=true`;
}

// ---------- leilões ----------

function listarLeiloes() {
  return [...estado.leiloes].sort((a, b) => b.id - a.id).map(leilaoPublico);
}

function listarLeiloesAdmin() {
  return [...estado.leiloes].sort((a, b) => b.id - a.id);
}

function obterLeilao(id) {
  return estado.leiloes.find((l) => l.id === Number(id));
}

function listarLances(leilaoId, limit = 100) {
  return estado.lances
    .filter((b) => b.leilaoId === Number(leilaoId))
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map(lancePublico);
}

function criarLeilao(dados) {
  const id = proximoId('leiloes');
  const iniciaEm = dados.iniciaEm || agora();
  const jaComecou = new Date(iniciaEm).getTime() <= Date.now();
  const leilao = {
    id,
    titulo: dados.titulo,
    descricao: dados.descricao || '',
    imagemUrl: dados.imagemUrl || '',
    precoInicial: Number(dados.precoInicial) || 0,
    precoAtual: Number(dados.precoInicial) || 0,
    incrementoMinimo: Number(dados.incrementoMinimo) > 0 ? Number(dados.incrementoMinimo) : 1,
    moeda: dados.moeda || 'BRL',
    iniciaEm,
    terminaEm: dados.terminaEm,
    antiSnipeJanelaSegundos: Number(dados.antiSnipeJanelaSegundos) >= 0 ? Number(dados.antiSnipeJanelaSegundos) : 30,
    antiSnipeExtensaoSegundos: Number(dados.antiSnipeExtensaoSegundos) > 0 ? Number(dados.antiSnipeExtensaoSegundos) : 60,
    status: jaComecou ? 'ao_vivo' : 'agendado',
    totalLances: 0,
    vencedorNome: null,
    vencedorLanceId: null,
    criadoEm: agora(),
    atualizadoEm: agora()
  };
  estado.leiloes.push(leilao);
  salvar();

  if (jaComecou) dispararWebhookStart(leilao);
  return leilao;
}

function atualizarLeilao(id, dados) {
  const leilao = obterLeilao(id);
  if (!leilao) return null;
  const campos = ['titulo', 'descricao', 'imagemUrl', 'terminaEm', 'antiSnipeJanelaSegundos', 'antiSnipeExtensaoSegundos'];
  for (const campo of campos) {
    if (dados[campo] !== undefined && dados[campo] !== '') leilao[campo] = dados[campo];
  }
  if (dados.incrementoMinimo) leilao.incrementoMinimo = Number(dados.incrementoMinimo);
  leilao.atualizadoEm = agora();
  salvar();
  return leilao;
}

function removerLeilao(id) {
  const antes = estado.leiloes.length;
  estado.leiloes = estado.leiloes.filter((l) => l.id !== Number(id));
  estado.lances = estado.lances.filter((b) => b.leilaoId !== Number(id));
  salvar();
  return antes !== estado.leiloes.length;
}

function dispararWebhookStart(leilao) {
  webhooks.enqueueEvento('auction.start', externalId(leilao), {
    titulo: leilao.titulo,
    imagemUrl: leilao.imagemUrl,
    precoInicial: leilao.precoInicial,
    precoAtual: leilao.precoAtual,
    incrementoMinimo: leilao.incrementoMinimo,
    moeda: leilao.moeda,
    iniciaEm: leilao.iniciaEm,
    terminaEm: leilao.terminaEm,
    status: leilao.status
  });
}

// ---------- compradores/participantes (nome, cidade e foto — tudo público;
// nunca e-mail/telefone/pagamento, esses campos nem existem aqui) ----------

function participantePublico(p) {
  return { id: p.id, nome: p.nome, cidade: p.cidade || '', fotoUrl: fotoParticipante(p) };
}

function listarParticipantes() {
  return [...estado.participantes].sort((a, b) => a.nome.localeCompare(b.nome)).map(participantePublico);
}

function criarParticipante(dados) {
  const entrada = typeof dados === 'string' ? { nome: dados } : dados || {};
  const nome = String(entrada.nome || '').trim();
  if (!nome) throw new Error('Nome obrigatório');
  const p = {
    id: proximoId('participantes'),
    nome,
    cidade: String(entrada.cidade || '').trim(),
    fotoUrl: String(entrada.fotoUrl || '').trim(),
    criadoEm: agora()
  };
  estado.participantes.push(p);
  salvar();
  return participantePublico(p);
}

function removerParticipante(id) {
  const antes = estado.participantes.length;
  estado.participantes = estado.participantes.filter((p) => p.id !== Number(id));
  salvar();
  return antes !== estado.participantes.length;
}

// ---------- lances ----------

class ErroLance extends Error {}

function registrarLance(leilaoId, participanteId, valorPersonalizado) {
  const leilao = obterLeilao(leilaoId);
  if (!leilao) throw new ErroLance('Leilão não encontrado');
  if (leilao.status !== 'ao_vivo') throw new ErroLance('Este leilão não está aceitando lances no momento');

  const participante = estado.participantes.find((p) => p.id === Number(participanteId));
  if (!participante) throw new ErroLance('Participante inválido');

  const minimo = leilao.precoAtual + leilao.incrementoMinimo;
  const valor = valorPersonalizado ? Number(valorPersonalizado) : minimo;
  if (!Number.isFinite(valor) || valor < minimo) {
    throw new ErroLance(`Lance deve ser de pelo menos ${minimo.toFixed(2)}`);
  }

  const lance = {
    id: proximoId('lances'),
    leilaoId: leilao.id,
    participanteId: participante.id,
    participanteNome: participante.nome,
    participanteCidade: participante.cidade || '',
    participanteFoto: fotoParticipante(participante),
    valor,
    criadoEm: agora()
  };
  estado.lances.push(lance);

  leilao.precoAtual = valor;
  leilao.totalLances += 1;
  leilao.atualizadoEm = agora();

  // Anti-sniping: lance chegou perto do fim, estica o prazo.
  let prorrogado = false;
  const restanteMs = new Date(leilao.terminaEm).getTime() - Date.now();
  if (restanteMs <= leilao.antiSnipeJanelaSegundos * 1000) {
    leilao.terminaEm = new Date(Date.now() + leilao.antiSnipeExtensaoSegundos * 1000).toISOString();
    prorrogado = true;
  }

  salvar();

  webhooks.enqueueEvento('bid.placed', externalId(leilao), {
    titulo: leilao.titulo,
    bidderName: participante.nome,
    bidderCity: participante.cidade || '',
    bidderPhotoUrl: fotoParticipante(participante),
    valor,
    moeda: leilao.moeda,
    totalLances: leilao.totalLances,
    precoAtual: leilao.precoAtual,
    terminaEm: leilao.terminaEm
  });

  if (prorrogado) {
    dispararWebhookStart(leilao); // mesmo external_id, novo prazo — reenvio de "start"
  }

  return { leilao, lance, prorrogado };
}

// ---------- encerramento e pagamento ----------

function encerrarLeilao(leilao) {
  if (leilao.totalLances > 0) {
    leilao.status = 'aguardando_pagamento';
    const ultimoLance = [...estado.lances]
      .filter((b) => b.leilaoId === leilao.id)
      .sort((a, b) => b.id - a.id)[0];
    leilao.vencedorNome = ultimoLance.participanteNome;
    leilao.vencedorLanceId = ultimoLance.id;
  } else {
    leilao.status = 'sem_lances';
  }
  leilao.atualizadoEm = agora();
  salvar();

  const config = webhooks.getConfig();
  if (leilao.status === 'aguardando_pagamento' && config.autoConfirmarPagamento) {
    const segundos = Number(config.autoConfirmarPagamentoSegundos) || 10;
    setTimeout(() => {
      // pode já ter sido confirmado manualmente entretanto
      if (obterLeilao(leilao.id)?.status === 'aguardando_pagamento') confirmarPagamento(leilao.id);
    }, segundos * 1000);
  }
}

function confirmarPagamento(id) {
  const leilao = obterLeilao(id);
  if (!leilao) throw new ErroLance('Leilão não encontrado');
  if (leilao.status !== 'aguardando_pagamento') throw new ErroLance('Este leilão não está aguardando pagamento');

  leilao.status = 'pago';
  leilao.atualizadoEm = agora();
  salvar();

  webhooks.enqueueEvento('auction.won', externalId(leilao), {
    titulo: leilao.titulo,
    winnerName: leilao.vencedorNome,
    valor: leilao.precoAtual,
    moeda: leilao.moeda,
    encerradoEm: leilao.atualizadoEm
  });

  return leilao;
}

// ---------- ciclo automático (agendado → ao vivo → encerrado) ----------

function tick() {
  const agoraMs = Date.now();
  for (const leilao of estado.leiloes) {
    if (leilao.status === 'agendado' && new Date(leilao.iniciaEm).getTime() <= agoraMs) {
      leilao.status = 'ao_vivo';
      leilao.atualizadoEm = agora();
      salvar();
      dispararWebhookStart(leilao);
    } else if (leilao.status === 'ao_vivo' && new Date(leilao.terminaEm).getTime() <= agoraMs) {
      encerrarLeilao(leilao);
    }
  }
  processarRotacaoAutomatica(agoraMs);
}

function iniciar() {
  setInterval(tick, TICK_MS);
}

// ---------- rotação automática de leilões ----------
// Cria (e, se configurado, já simula) um leilão novo sozinho, de X em X
// minutos — pra deixar a plataforma rodando testes em loop sem precisar
// clicar em "criar leilão" toda vez.

function getConfigRotacao() {
  return estado.rotacao;
}

function setConfigRotacao(parcial) {
  Object.assign(estado.rotacao, parcial);
  salvar();
  return estado.rotacao;
}

function processarRotacaoAutomatica(agoraMs) {
  const cfg = estado.rotacao;
  if (!cfg.ativo) return;

  // Piso de 0.5 min (30s) só pra não criar leilão em loop se alguém digitar
  // 0 por engano — a UI já permite qualquer valor a partir de 0.5.
  const intervaloMs = Math.max(0.5, Number(cfg.intervaloMinutos) || 5) * 60000;
  const ultimo = cfg.ultimoCriadoEm ? new Date(cfg.ultimoCriadoEm).getTime() : 0;
  if (agoraMs - ultimo < intervaloMs) return;

  cfg.contador += 1;
  cfg.ultimoCriadoEm = agora();
  salvar();

  const duracaoMs = Math.max(0.5, Number(cfg.duracaoMinutos) || 5) * 60000;
  const novo = criarLeilao({
    titulo: `${cfg.tituloBase} #${cfg.contador}`,
    precoInicial: cfg.precoInicial,
    incrementoMinimo: cfg.incrementoMinimo,
    moeda: cfg.moeda,
    iniciaEm: agora(),
    terminaEm: new Date(agoraMs + duracaoMs).toISOString(),
    antiSnipeJanelaSegundos: cfg.antiSnipeJanelaSegundos,
    antiSnipeExtensaoSegundos: cfg.antiSnipeExtensaoSegundos
  });

  if (cfg.autoSimular && estado.participantes.length) {
    try {
      dispararSimulacao(novo.id, {
        lancesPorComprador: cfg.lancesPorComprador,
        valorMin: cfg.valorMin,
        valorMax: cfg.valorMax,
        intervaloMinMs: cfg.intervaloMinMs,
        intervaloMaxMs: cfg.intervaloMaxMs
      });
    } catch {
      // sem comprador cadastrado ou outro erro — o leilão fica criado mesmo assim
    }
  }
}

// ---------- simulador de lances (testes de ponta a ponta) ----------

const simulacoesAtivas = new Map(); // leilaoId -> { cancelado }

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Cada comprador cadastrado dá exatamente `lancesPorComprador` lances (a
// ordem entre eles é embaralhada). Cada lance aumenta o preço atual em um
// valor aleatório dentro de [valorMin, valorMax] — sem teto: o preço sobe
// livremente enquanto o leilão estiver ao vivo.
function dispararSimulacao(leilaoId, { lancesPorComprador, valorMin, valorMax, intervaloMinMs, intervaloMaxMs }) {
  const leilao = obterLeilao(leilaoId);
  if (!leilao) throw new ErroLance('Leilão não encontrado');
  if (!estado.participantes.length) throw new ErroLance('Cadastre compradores antes de simular lances');
  if (simulacoesAtivas.has(Number(leilaoId))) throw new ErroLance('Já existe uma simulação rodando pra este leilão');

  let fila = [];
  for (const p of estado.participantes) {
    for (let i = 0; i < lancesPorComprador; i++) fila.push(p.id);
  }
  fila = embaralhar(fila);

  const controle = { cancelado: false };
  simulacoesAtivas.set(Number(leilaoId), controle);

  (async () => {
    for (const participanteId of fila) {
      if (controle.cancelado) break;
      const espera = intervaloMinMs + Math.random() * Math.max(0, intervaloMaxMs - intervaloMinMs);
      await new Promise((resolve) => setTimeout(resolve, espera));
      if (controle.cancelado) break;

      const atual = obterLeilao(leilaoId);
      if (!atual || atual.status !== 'ao_vivo') break;

      const incremento = valorMin + Math.random() * Math.max(0, valorMax - valorMin);
      const valor = atual.precoAtual + Math.max(atual.incrementoMinimo, incremento);
      try {
        registrarLance(leilaoId, participanteId, valor);
      } catch {
        // lance rejeitado (ex: leilão encerrou no meio) — segue pro próximo, não trava a fila
      }
    }
    simulacoesAtivas.delete(Number(leilaoId));
  })();

  return { leilaoId: Number(leilaoId), totalLances: fila.length };
}

function pararSimulacao(leilaoId) {
  const controle = simulacoesAtivas.get(Number(leilaoId));
  if (!controle) return false;
  controle.cancelado = true;
  simulacoesAtivas.delete(Number(leilaoId));
  return true;
}

function simulacaoAtiva(leilaoId) {
  return simulacoesAtivas.has(Number(leilaoId));
}

module.exports = {
  ErroLance,
  leilaoPublico,
  lancePublico,
  listarLeiloes,
  listarLeiloesAdmin,
  obterLeilao,
  listarLances,
  criarLeilao,
  atualizarLeilao,
  removerLeilao,
  listarParticipantes,
  criarParticipante,
  removerParticipante,
  registrarLance,
  confirmarPagamento,
  iniciar,
  dispararSimulacao,
  pararSimulacao,
  simulacaoAtiva,
  getConfigRotacao,
  setConfigRotacao
};
