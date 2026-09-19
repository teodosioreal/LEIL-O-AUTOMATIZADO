const lista = document.getElementById('lista');
const vazio = document.getElementById('vazio');
let leiloes = [];

function cardHTML(l) {
  const restante = new Date(l.terminaEm).getTime() - Date.now();
  const urgente = l.status === 'ao_vivo' && restante < 5 * 60 * 1000;
  const podeDarLance = l.status === 'ao_vivo';
  return `
    <div class="card" data-id="${l.id}">
      <img class="foto" src="${l.imagemUrl || 'https://placehold.co/480x360/16161d/d4af37?text=Leil%C3%A3o'}" alt="${l.titulo}" />
      <div class="corpo">
        <span class="status-pill status-${l.status}">${STATUS_LABEL[l.status] || l.status}</span>
        <h3>${l.titulo}</h3>
        <div>
          <div class="preco-label">Lance atual</div>
          <div class="preco-atual" data-preco>${formatarMoeda(l.precoAtual, l.moeda)}</div>
        </div>
        ${l.status === 'ao_vivo' || l.status === 'agendado' ? `<div class="countdown ${urgente ? 'urgente' : ''}" data-countdown>${montarContagemHTML(restante)}</div>` : ''}
        <a class="btn btn-lance" href="/leilao.html?id=${l.id}" style="text-align:center;text-decoration:none;${podeDarLance ? '' : 'opacity:.6'}">
          ${podeDarLance ? 'Dar lance' : 'Ver leilão'}
        </a>
      </div>
    </div>`;
}

function render() {
  if (!leiloes.length) {
    lista.innerHTML = '';
    vazio.style.display = 'block';
    return;
  }
  vazio.style.display = 'none';
  lista.innerHTML = leiloes.map(cardHTML).join('');
}

async function carregar() {
  const resp = await fetch('/api/leiloes');
  const novos = await resp.json();

  // Compara com o que já estava na tela pra saber em qual card animar
  // (lance novo, sem precisar de WebSocket — só polling mesmo).
  const mudaram = new Set();
  for (const novo of novos) {
    const antigo = leiloes.find((x) => x.id === novo.id);
    if (antigo && (antigo.totalLances !== novo.totalLances || antigo.status !== novo.status)) {
      mudaram.add(novo.id);
    }
  }

  leiloes = novos;
  render();

  mudaram.forEach((id) => {
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if (!card) return;
    card.classList.add('flash-lance');
    const preco = card.querySelector('[data-preco]');
    if (preco) preco.classList.add('bump');
    setTimeout(() => card.classList.remove('flash-lance'), 900);
  });
}

function atualizarContagens() {
  document.querySelectorAll('.card').forEach((card) => {
    const id = Number(card.dataset.id);
    const l = leiloes.find((x) => x.id === id);
    if (!l) return;
    const el = card.querySelector('[data-countdown]');
    if (!el) return;
    const restante = new Date(l.terminaEm).getTime() - Date.now();
    el.innerHTML = montarContagemHTML(restante);
    el.classList.toggle('urgente', restante < 5 * 60 * 1000);
  });
}

setInterval(atualizarContagens, 1000);
setInterval(carregar, 3000);
carregar();
