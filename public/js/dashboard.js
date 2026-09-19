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
          ${l.status === 'aguardando_pagamento' ? `<button class="btn btn-secundario btn-pequeno" data-confirmar="${l.id}">Confirmar pagamento</button>` : ''}
          <button class="btn btn-perigo btn-pequeno" data-excluir="${l.id}">Excluir</button>
        </td>
      </tr>`)
    .join('');
}

document.getElementById('tabelaLeiloes').addEventListener('click', async (ev) => {
  const alvo = ev.target;
  if (alvo.dataset.excluir) {
    if (!confirm('Excluir este leilão e todos os lances dele?')) return;
    await fetch(`/api/admin/leiloes/${alvo.dataset.excluir}`, { method: 'DELETE' });
    carregarLeiloes();
  } else if (alvo.dataset.confirmar) {
    await fetch(`/api/admin/leiloes/${alvo.dataset.confirmar}/confirmar-pagamento`, { method: 'POST' });
    carregarLeiloes();
  }
});

document.getElementById('btnSimularAgora').addEventListener('click', async () => {
  const aviso = document.getElementById('avisoSimularAgora');
  aviso.innerHTML = '';
  const resp = await fetch('/api/admin/leiloes/simular-agora', { method: 'POST' });
  const dados = await resp.json();
  if (!resp.ok) {
    aviso.innerHTML = `<div class="aviso aviso-erro">${dados.erro}</div>`;
    return;
  }
  aviso.innerHTML = `<div class="aviso aviso-ok">Leilão "${dados.titulo}" criado — acompanhe na vitrine.</div>`;
  carregarLeiloes();
});

// ---------- configurações (leilão automático + rotação) ----------

function atualizarStatusRotacaoTexto(cfg) {
  const status = document.getElementById('statusRotacao');
  if (!cfg.ativo) {
    status.textContent = '';
  } else if (!cfg.ultimoCriadoEm) {
    status.textContent = 'Rotação ativa — o primeiro leilão automático é criado no próximo minuto.';
  } else {
    const proximo = new Date(cfg.ultimoCriadoEm).getTime() + Number(cfg.intervaloMinutos) * 60000;
    const faltamMin = Math.max(0, Math.round((proximo - Date.now()) / 60000));
    status.textContent = `Rotação ativa — já criou ${cfg.contador} leilão(ões). Próximo em ~${faltamMin} min.`;
  }
}

// Preenche o formulário inteiro — só no boot e depois de salvar, pra não
// sobrescrever o que a pessoa está digitando a cada poll.
async function carregarConfig() {
  const resp = await fetch('/api/admin/rotacao-config');
  const cfg = await resp.json();
  document.getElementById('cfg-titulo').value = cfg.tituloBase;
  document.getElementById('cfg-precoInicial').value = cfg.precoInicial;
  document.getElementById('cfg-incrementoMinimo').value = cfg.incrementoMinimo;
  document.getElementById('cfg-duracao').value = cfg.duracaoMinutos;
  document.getElementById('cfg-antiSnipeAtivo').checked = !!cfg.antiSnipeAtivo;
  document.getElementById('cfg-maxCompradores').value = cfg.maxCompradores;
  document.getElementById('cfg-valorMin').value = cfg.valorMin;
  document.getElementById('cfg-valorMax').value = cfg.valorMax;
  document.getElementById('cfg-intervaloMin').value = cfg.intervaloLancesMinSeg;
  document.getElementById('cfg-intervaloMax').value = cfg.intervaloLancesMaxSeg;
  document.getElementById('cfg-rotacaoAtiva').checked = !!cfg.ativo;
  document.getElementById('cfg-intervaloRotacao').value = cfg.intervaloMinutos;
  atualizarStatusRotacaoTexto(cfg);
}

// Só atualiza a linha de status ("próximo em X min") — chamado a cada
// poll, sem tocar nos campos do formulário.
async function atualizarStatusRotacao() {
  const resp = await fetch('/api/admin/rotacao-config');
  atualizarStatusRotacaoTexto(await resp.json());
}

document.getElementById('btnSalvarConfig').addEventListener('click', async () => {
  const corpo = {
    tituloBase: document.getElementById('cfg-titulo').value.trim() || 'Leilão automático',
    precoInicial: Number(document.getElementById('cfg-precoInicial').value) || 100,
    incrementoMinimo: Number(document.getElementById('cfg-incrementoMinimo').value) || 10,
    duracaoMinutos: Number(document.getElementById('cfg-duracao').value) || 5,
    antiSnipeAtivo: document.getElementById('cfg-antiSnipeAtivo').checked,
    maxCompradores: Number(document.getElementById('cfg-maxCompradores').value) || 5,
    valorMin: Number(document.getElementById('cfg-valorMin').value) || 10,
    valorMax: Number(document.getElementById('cfg-valorMax').value) || 50,
    intervaloLancesMinSeg: Number(document.getElementById('cfg-intervaloMin').value) || 3,
    intervaloLancesMaxSeg: Number(document.getElementById('cfg-intervaloMax').value) || 8,
    ativo: document.getElementById('cfg-rotacaoAtiva').checked,
    intervaloMinutos: Number(document.getElementById('cfg-intervaloRotacao').value) || 5
  };
  await fetch('/api/admin/rotacao-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  document.getElementById('avisoConfig').innerHTML = '<div class="aviso aviso-ok">Configurações salvas.</div>';
  carregarConfig();
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
carregarConfig();
setInterval(carregarLeiloes, 5000);
setInterval(carregarEventos, 4000);
setInterval(atualizarStatusRotacao, 15000);
