const STATUS_LABEL = {
  agendado: 'Agendado',
  ao_vivo: 'Ao vivo',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  sem_lances: 'Sem lances'
};

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('ativo'));
    document.querySelectorAll('.tab-conteudo').forEach((c) => c.classList.remove('ativo'));
    btn.classList.add('ativo');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('ativo');
  });
});

function fmtData(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}
function fmtMoeda(v, moeda) {
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v); }
  catch { return `${moeda} ${v}`; }
}

// ---------- leilões ----------
async function carregarLeiloes() {
  const resp = await fetch('/api/admin/leiloes');
  const leiloes = await resp.json();
  document.getElementById('tabelaLeiloes').innerHTML = leiloes
    .map((l) => `
      <tr>
        <td>${l.id}</td>
        <td>${l.titulo}</td>
        <td>${STATUS_LABEL[l.status] || l.status}</td>
        <td>${fmtMoeda(l.precoAtual, l.moeda)}</td>
        <td>${fmtData(l.terminaEm)}</td>
        <td class="linha-acoes">
          <a class="btn btn-secundario btn-pequeno" href="/leilao.html?id=${l.id}" target="_blank">Ver</a>
          ${l.status === 'ao_vivo' ? `<button class="btn btn-secundario btn-pequeno" data-simular="${l.id}">Simular lances</button>` : ''}
          ${l.status === 'aguardando_pagamento' ? `<button class="btn btn-secundario btn-pequeno" data-confirmar="${l.id}">Confirmar pagamento</button>` : ''}
          <button class="btn btn-perigo btn-pequeno" data-excluir="${l.id}">Excluir</button>
        </td>
      </tr>`)
    .join('');
}

document.getElementById('btnCriarLeilao').addEventListener('click', async () => {
  const aviso = document.getElementById('avisoLeilao');
  aviso.innerHTML = '';

  let imagemUrl = document.getElementById('f-imagemUrl').value.trim();
  const arquivo = document.getElementById('f-imagemArquivo').files[0];
  if (arquivo) {
    const fd = new FormData();
    fd.append('imagem', arquivo);
    const up = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const dadosUp = await up.json();
    if (up.ok) imagemUrl = dadosUp.url;
  }

  const corpo = {
    titulo: document.getElementById('f-titulo').value.trim(),
    descricao: document.getElementById('f-descricao').value.trim(),
    imagemUrl,
    precoInicial: document.getElementById('f-precoInicial').value,
    incrementoMinimo: document.getElementById('f-incrementoMinimo').value,
    moeda: document.getElementById('f-moeda').value.trim() || 'BRL',
    iniciaEm: document.getElementById('f-iniciaEm').value ? new Date(document.getElementById('f-iniciaEm').value).toISOString() : new Date().toISOString(),
    terminaEm: document.getElementById('f-terminaEm').value ? new Date(document.getElementById('f-terminaEm').value).toISOString() : null,
    antiSnipeJanelaSegundos: document.getElementById('f-antiSnipeJanela').value,
    antiSnipeExtensaoSegundos: document.getElementById('f-antiSnipeExtensao').value
  };

  if (!corpo.titulo || !corpo.terminaEm) {
    aviso.innerHTML = '<div class="aviso aviso-erro">Preencha ao menos título e término.</div>';
    return;
  }

  const resp = await fetch('/api/admin/leiloes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await resp.json();
  if (!resp.ok) {
    aviso.innerHTML = `<div class="aviso aviso-erro">${dados.erro}</div>`;
    return;
  }
  aviso.innerHTML = '<div class="aviso aviso-ok">Leilão criado!</div>';
  ['f-titulo', 'f-descricao', 'f-imagemUrl'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('f-imagemArquivo').value = '';
  carregarLeiloes();
});

let leilaoSimulandoId = null;
document.getElementById('tabelaLeiloes').addEventListener('click', async (ev) => {
  const alvo = ev.target;
  if (alvo.dataset.excluir) {
    if (!confirm('Excluir este leilão e todos os lances dele?')) return;
    await fetch(`/api/admin/leiloes/${alvo.dataset.excluir}`, { method: 'DELETE' });
    carregarLeiloes();
  } else if (alvo.dataset.confirmar) {
    await fetch(`/api/admin/leiloes/${alvo.dataset.confirmar}/confirmar-pagamento`, { method: 'POST' });
    carregarLeiloes();
  } else if (alvo.dataset.simular) {
    leilaoSimulandoId = alvo.dataset.simular;
    document.getElementById('avisoSim').innerHTML = '';
    document.getElementById('modalSimulador').style.display = 'flex';
  }
});

document.getElementById('btnFecharSim').addEventListener('click', () => {
  document.getElementById('modalSimulador').style.display = 'none';
});

document.getElementById('btnDispararSim').addEventListener('click', async () => {
  const corpo = {
    lancesPorComprador: document.getElementById('sim-lancesPorComprador').value,
    valorMin: document.getElementById('sim-valorMin').value,
    valorMax: document.getElementById('sim-valorMax').value,
    intervaloMinMs: document.getElementById('sim-intervaloMin').value,
    intervaloMaxMs: document.getElementById('sim-intervaloMax').value
  };
  const resp = await fetch(`/api/admin/leiloes/${leilaoSimulandoId}/simular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await resp.json();
  const aviso = document.getElementById('avisoSim');
  if (!resp.ok) {
    aviso.innerHTML = `<div class="aviso aviso-erro">${dados.erro}</div>`;
  } else {
    aviso.innerHTML = `<div class="aviso aviso-ok">Simulação disparada — ${dados.totalLances} lances no total. Acompanhe na vitrine.</div>`;
  }
});

// ---------- rotação automática ----------

function atualizarStatusRotacaoTexto(cfg) {
  const status = document.getElementById('statusRotacao');
  if (!cfg.ativo) {
    status.textContent = '';
  } else if (!cfg.ultimoCriadoEm) {
    status.textContent = 'Ativa — o primeiro leilão automático é criado no próximo minuto.';
  } else {
    const proximo = new Date(cfg.ultimoCriadoEm).getTime() + Number(cfg.intervaloMinutos) * 60000;
    const faltamMin = Math.max(0, Math.round((proximo - Date.now()) / 60000));
    status.textContent = `Ativa — já criou ${cfg.contador} leilão(ões). Próximo em ~${faltamMin} min.`;
  }
}

// Preenche o formulário inteiro — só no boot e depois de salvar, pra não
// sobrescrever o que a pessoa está digitando a cada poll.
async function carregarRotacaoConfig() {
  const resp = await fetch('/api/admin/rotacao-config');
  const cfg = await resp.json();
  document.getElementById('rot-ativo').checked = !!cfg.ativo;
  document.getElementById('rot-intervalo').value = cfg.intervaloMinutos;
  document.getElementById('rot-duracao').value = cfg.duracaoMinutos;
  document.getElementById('rot-titulo').value = cfg.tituloBase;
  document.getElementById('rot-precoInicial').value = cfg.precoInicial;
  document.getElementById('rot-incrementoMinimo').value = cfg.incrementoMinimo;
  document.getElementById('rot-moeda').value = cfg.moeda;
  document.getElementById('rot-antiSnipeJanela').value = cfg.antiSnipeJanelaSegundos;
  document.getElementById('rot-antiSnipeExtensao').value = cfg.antiSnipeExtensaoSegundos;
  document.getElementById('rot-autoSimular').checked = !!cfg.autoSimular;
  document.getElementById('rot-lancesPorComprador').value = cfg.lancesPorComprador;
  document.getElementById('rot-valorMin').value = cfg.valorMin;
  document.getElementById('rot-valorMax').value = cfg.valorMax;
  document.getElementById('rot-intervaloMinMs').value = cfg.intervaloMinMs;
  document.getElementById('rot-intervaloMaxMs').value = cfg.intervaloMaxMs;
  atualizarStatusRotacaoTexto(cfg);
}

// Só atualiza a linha de status ("próximo em X min") — chamado a cada
// poll, sem tocar nos campos do formulário.
async function atualizarStatusRotacao() {
  const resp = await fetch('/api/admin/rotacao-config');
  atualizarStatusRotacaoTexto(await resp.json());
}

document.getElementById('btnSalvarRotacao').addEventListener('click', async () => {
  const corpo = {
    ativo: document.getElementById('rot-ativo').checked,
    intervaloMinutos: Number(document.getElementById('rot-intervalo').value) || 5,
    duracaoMinutos: Number(document.getElementById('rot-duracao').value) || 5,
    tituloBase: document.getElementById('rot-titulo').value.trim() || 'Leilão automático',
    precoInicial: Number(document.getElementById('rot-precoInicial').value) || 100,
    incrementoMinimo: Number(document.getElementById('rot-incrementoMinimo').value) || 10,
    moeda: document.getElementById('rot-moeda').value.trim() || 'BRL',
    antiSnipeJanelaSegundos: Number(document.getElementById('rot-antiSnipeJanela').value) || 30,
    antiSnipeExtensaoSegundos: Number(document.getElementById('rot-antiSnipeExtensao').value) || 60,
    autoSimular: document.getElementById('rot-autoSimular').checked,
    lancesPorComprador: Number(document.getElementById('rot-lancesPorComprador').value) || 2,
    valorMin: Number(document.getElementById('rot-valorMin').value) || 10,
    valorMax: Number(document.getElementById('rot-valorMax').value) || 50,
    intervaloMinMs: Number(document.getElementById('rot-intervaloMinMs').value) || 3000,
    intervaloMaxMs: Number(document.getElementById('rot-intervaloMaxMs').value) || 8000
  };
  await fetch('/api/admin/rotacao-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  document.getElementById('avisoRotacao').innerHTML = '<div class="aviso aviso-ok">Rotação automática salva.</div>';
  carregarRotacaoConfig();
});

// ---------- participantes / compradores ----------
async function carregarParticipantes() {
  const resp = await fetch('/api/admin/participantes');
  const participantes = await resp.json();
  document.getElementById('tabelaParticipantes').innerHTML = participantes
    .map(
      (p) => `<tr>
        <td><img src="${p.fotoUrl}" alt="${p.nome}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid var(--border)" /></td>
        <td>${p.id}</td>
        <td>${p.nome}</td>
        <td>${p.cidade || '—'}</td>
        <td style="font-size:18px">${p.bandeira || ''}</td>
        <td><button class="btn btn-perigo btn-pequeno" data-remover="${p.id}">Remover</button></td>
      </tr>`
    )
    .join('');
}

document.getElementById('btnAddParticipante').addEventListener('click', async () => {
  const nomeInput = document.getElementById('f-participanteNome');
  const cidadeInput = document.getElementById('f-participanteCidade');
  const bandeiraInput = document.getElementById('f-participanteBandeira');
  const fotoUrlInput = document.getElementById('f-participanteFotoUrl');
  const fotoArquivoInput = document.getElementById('f-participanteFotoArquivo');
  if (!nomeInput.value.trim()) return;

  let fotoUrl = fotoUrlInput.value.trim();
  const arquivo = fotoArquivoInput.files[0];
  if (arquivo) {
    const fd = new FormData();
    fd.append('imagem', arquivo);
    const up = await fetch('/api/admin/upload', { method: 'POST', body: fd });
    const dadosUp = await up.json();
    if (up.ok) fotoUrl = dadosUp.url;
  }

  await fetch('/api/admin/participantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: nomeInput.value.trim(),
      cidade: cidadeInput.value.trim(),
      bandeira: bandeiraInput.value.trim(),
      fotoUrl
    })
  });
  nomeInput.value = '';
  cidadeInput.value = '';
  bandeiraInput.value = '';
  fotoUrlInput.value = '';
  fotoArquivoInput.value = '';
  carregarParticipantes();
});

document.getElementById('tabelaParticipantes').addEventListener('click', async (ev) => {
  if (ev.target.dataset.remover) {
    await fetch(`/api/admin/participantes/${ev.target.dataset.remover}`, { method: 'DELETE' });
    carregarParticipantes();
  }
});

// ---------- webhooks ----------
function atualizarHintFormato() {
  const privefeet = document.getElementById('wh-formato').value === 'privefeet';
  document.getElementById('hintPadrao').style.display = privefeet ? 'none' : 'block';
  document.getElementById('hintPrivefeet').style.display = privefeet ? 'block' : 'none';
  document.querySelector('#linhaSecret label').textContent = privefeet
    ? 'Secret (AUCTION_WEBHOOK_SECRET, valor cru — vai no header X-Webhook-Secret)'
    : 'Secret (opcional — assina o payload em X-Webhook-Signature)';
}
document.getElementById('wh-formato').addEventListener('change', atualizarHintFormato);

async function carregarWebhookConfig() {
  const resp = await fetch('/api/admin/webhook-config');
  const cfg = await resp.json();
  document.getElementById('wh-formato').value = cfg.formato || 'padrao';
  document.getElementById('wh-url').value = cfg.url || '';
  document.getElementById('wh-secret').value = cfg.secret || '';
  document.getElementById('wh-ev-start').checked = !!cfg.eventos?.start;
  document.getElementById('wh-ev-bid').checked = !!cfg.eventos?.bid;
  document.getElementById('wh-ev-won').checked = !!cfg.eventos?.won;
  document.getElementById('wh-autoconfirmar').checked = !!cfg.autoConfirmarPagamento;
  document.getElementById('wh-autoconfirmar-seg').value = cfg.autoConfirmarPagamentoSegundos ?? 10;
  atualizarHintFormato();
}

document.getElementById('btnSalvarWebhook').addEventListener('click', async () => {
  const corpo = {
    formato: document.getElementById('wh-formato').value,
    url: document.getElementById('wh-url').value.trim(),
    secret: document.getElementById('wh-secret').value.trim(),
    eventos: {
      start: document.getElementById('wh-ev-start').checked,
      bid: document.getElementById('wh-ev-bid').checked,
      won: document.getElementById('wh-ev-won').checked
    },
    autoConfirmarPagamento: document.getElementById('wh-autoconfirmar').checked,
    autoConfirmarPagamentoSegundos: Number(document.getElementById('wh-autoconfirmar-seg').value) || 10
  };
  await fetch('/api/admin/webhook-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  document.getElementById('avisoWebhook').innerHTML = '<div class="aviso aviso-ok">Configuração salva.</div>';
});

async function carregarEventos() {
  const resp = await fetch('/api/admin/webhook-eventos');
  const eventos = await resp.json();
  document.getElementById('tabelaEventos').innerHTML = eventos
    .map(
      (e) => `<tr>
        <td>${e.id}</td>
        <td>${e.type}</td>
        <td>${e.externalId}</td>
        <td class="status-evento-${e.status}">${e.status}</td>
        <td>${e.attempts}/${e.maxAttempts}</td>
        <td>${e.lastError || ''}</td>
        <td>${fmtData(e.createdAt)}</td>
        <td>${e.status === 'failed' || e.status === 'sem_destino' ? `<button class="btn btn-secundario btn-pequeno" data-reenviar="${e.id}">Reenviar</button>` : ''}</td>
      </tr>`
    )
    .join('');
}

document.getElementById('tabelaEventos').addEventListener('click', async (ev) => {
  if (ev.target.dataset.reenviar) {
    await fetch(`/api/admin/webhook-eventos/${ev.target.dataset.reenviar}/reenviar`, { method: 'POST' });
    carregarEventos();
  }
});

// ---------- boot ----------
carregarLeiloes();
carregarParticipantes();
carregarWebhookConfig();
carregarEventos();
carregarRotacaoConfig();
setInterval(carregarLeiloes, 5000);
setInterval(carregarEventos, 4000);
setInterval(atualizarStatusRotacao, 15000);
