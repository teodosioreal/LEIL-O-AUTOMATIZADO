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
    quantidade: document.getElementById('sim-quantidade').value,
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
    aviso.innerHTML = '<div class="aviso aviso-ok">Simulação disparada — acompanhe na vitrine em tempo real.</div>';
  }
});

// ---------- participantes ----------
async function carregarParticipantes() {
  const resp = await fetch('/api/admin/participantes');
  const participantes = await resp.json();
  document.getElementById('tabelaParticipantes').innerHTML = participantes
    .map((p) => `<tr><td>${p.id}</td><td>${p.nome}</td><td><button class="btn btn-perigo btn-pequeno" data-remover="${p.id}">Remover</button></td></tr>`)
    .join('');
}

document.getElementById('btnAddParticipante').addEventListener('click', async () => {
  const input = document.getElementById('f-participanteNome');
  if (!input.value.trim()) return;
  await fetch('/api/admin/participantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: input.value.trim() })
  });
  input.value = '';
  carregarParticipantes();
});

document.getElementById('tabelaParticipantes').addEventListener('click', async (ev) => {
  if (ev.target.dataset.remover) {
    await fetch(`/api/admin/participantes/${ev.target.dataset.remover}`, { method: 'DELETE' });
    carregarParticipantes();
  }
});

// ---------- webhooks ----------
async function carregarWebhookConfig() {
  const resp = await fetch('/api/admin/webhook-config');
  const cfg = await resp.json();
  document.getElementById('wh-url').value = cfg.url || '';
  document.getElementById('wh-secret').value = cfg.secret || '';
  document.getElementById('wh-ev-start').checked = !!cfg.eventos?.start;
  document.getElementById('wh-ev-bid').checked = !!cfg.eventos?.bid;
  document.getElementById('wh-ev-won').checked = !!cfg.eventos?.won;
  document.getElementById('wh-autoconfirmar').checked = !!cfg.autoConfirmarPagamento;
  document.getElementById('wh-autoconfirmar-seg').value = cfg.autoConfirmarPagamentoSegundos ?? 10;
}

document.getElementById('btnSalvarWebhook').addEventListener('click', async () => {
  const corpo = {
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
setInterval(carregarLeiloes, 5000);
setInterval(carregarEventos, 4000);
