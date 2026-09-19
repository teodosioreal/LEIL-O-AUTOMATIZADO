const params = new URLSearchParams(location.search);
const leilaoId = params.get('id');

const el = {
  conteudo: document.getElementById('conteudo'),
  vazio: document.getElementById('vazio'),
  foto: document.getElementById('foto'),
  titulo: document.getElementById('titulo'),
  descricao: document.getElementById('descricao'),
  statusPill: document.getElementById('statusPill'),
  precoAtual: document.getElementById('precoAtual'),
  countdown: document.getElementById('countdown'),
  participante: document.getElementById('participante'),
  valorLance: document.getElementById('valorLance'),
  btnLance: document.getElementById('btnLance'),
  aviso: document.getElementById('aviso'),
  feed: document.getElementById('feed')
};

let leilao = null;
let lances = [];

function renderLeilao() {
  el.foto.src = leilao.imagemUrl || 'https://placehold.co/640x480/16161d/d4af37?text=Leil%C3%A3o';
  el.titulo.textContent = leilao.titulo;
  el.descricao.textContent = leilao.descricao || '';
  el.statusPill.textContent = STATUS_LABEL[leilao.status] || leilao.status;
  el.statusPill.className = `status-pill status-${leilao.status}`;
  el.precoAtual.textContent = formatarMoeda(leilao.precoAtual, leilao.moeda);

  const minimo = leilao.precoAtual + leilao.incrementoMinimo;
  el.valorLance.min = minimo;
  el.valorLance.placeholder = minimo.toFixed(2);
  if (!el.valorLance.value || Number(el.valorLance.value) < minimo) el.valorLance.value = minimo.toFixed(2);

  const podeDarLance = leilao.status === 'ao_vivo';
  el.btnLance.disabled = !podeDarLance;
  el.btnLance.textContent = podeDarLance ? 'Dar lance' : 'Leilão não está ao vivo';

  atualizarContagem();
}

function atualizarContagem() {
  const restante = new Date(leilao.terminaEm).getTime() - Date.now();
  el.countdown.innerHTML = montarContagemHTML(restante);
  el.countdown.classList.toggle('urgente', leilao.status === 'ao_vivo' && restante < 5 * 60 * 1000);
}

function renderFeed() {
  if (!lances.length) {
    el.feed.innerHTML = '<div style="color:var(--text-faint);font-size:13px">Nenhum lance ainda. Seja o primeiro!</div>';
    return;
  }
  el.feed.innerHTML = lances
    .map(
      (b) => `<div class="item"><div><span class="nome">${b.participanteNome}</span> <span class="quando">${new Date(b.criadoEm).toLocaleTimeString('pt-BR')}</span></div><div class="valor">${formatarMoeda(b.valor, leilao.moeda)}</div></div>`
    )
    .join('');
}

async function carregarParticipantes() {
  const resp = await fetch('/api/participantes');
  const participantes = await resp.json();
  el.participante.innerHTML = participantes.length
    ? participantes.map((p) => `<option value="${p.id}">${p.nome}</option>`).join('')
    : '<option value="">Cadastre participantes no dashboard</option>';
}

function animarNovoLance() {
  el.precoAtual.classList.add('bump');
  el.conteudo.classList.add('flash-lance');
  setTimeout(() => {
    el.precoAtual.classList.remove('bump');
    el.conteudo.classList.remove('flash-lance');
  }, 900);
}

async function carregar() {
  const resp = await fetch(`/api/leiloes/${leilaoId}`);
  if (!resp.ok) {
    el.vazio.style.display = 'block';
    return;
  }
  const dados = await resp.json();
  const totalAntes = leilao?.totalLances ?? -1;

  leilao = dados.leilao;
  lances = dados.lances;
  el.conteudo.style.display = 'grid';
  renderLeilao();
  renderFeed();

  if (totalAntes >= 0 && leilao.totalLances > totalAntes) animarNovoLance();
}

el.btnLance.addEventListener('click', async () => {
  el.aviso.innerHTML = '';
  const participanteId = el.participante.value;
  if (!participanteId) {
    el.aviso.innerHTML = '<div class="aviso aviso-erro">Escolha um participante.</div>';
    return;
  }
  el.btnLance.disabled = true;
  try {
    const resp = await fetch(`/api/leiloes/${leilaoId}/lances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participanteId, valor: el.valorLance.value })
    });
    const dados = await resp.json();
    if (!resp.ok) {
      el.aviso.innerHTML = `<div class="aviso aviso-erro">${dados.erro}</div>`;
    } else {
      el.aviso.innerHTML = '<div class="aviso aviso-ok">Lance registrado!</div>';
      if (dados.prorrogado) {
        el.aviso.innerHTML += '<div class="aviso aviso-prorrogado">Leilão prorrogado — anti-sniping ativado!</div>';
      }
      await carregar();
    }
  } finally {
    el.btnLance.disabled = leilao?.status !== 'ao_vivo';
  }
});

setInterval(() => { if (leilao) atualizarContagem(); }, 1000);
setInterval(carregar, 2000);
carregarParticipantes();
carregar();
