// db.js — armazenamento simples em arquivo JSON (sem dependências nativas,
// funciona em qualquer hospedagem, incluindo compartilhada tipo Hostinger).
//
// Todo o estado fica em memória e é regravado em data.json a cada mudança,
// então nada se perde se o processo reiniciar.

const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.json');

function estadoInicial() {
  return {
    leiloes: [],
    lances: [],
    participantes: [],
    webhookConfig: {
      url: '',
      secret: '',
      eventos: { start: true, bid: true, won: true },
      autoConfirmarPagamento: true,
      autoConfirmarPagamentoSegundos: 10
    },
    webhookEventos: [],
    _seq: { leiloes: 0, lances: 0, participantes: 0, webhookEventos: 0 }
  };
}

function carregar() {
  if (!fs.existsSync(dbPath)) {
    const estado = estadoInicial();
    fs.writeFileSync(dbPath, JSON.stringify(estado, null, 2));
    return estado;
  }
  try {
    const bruto = fs.readFileSync(dbPath, 'utf8');
    const dados = JSON.parse(bruto);
    const base = estadoInicial();
    return {
      ...base,
      ...dados,
      webhookConfig: { ...base.webhookConfig, ...(dados.webhookConfig || {}) },
      _seq: { ...base._seq, ...(dados._seq || {}) }
    };
  } catch (err) {
    console.error('Aviso: data.json corrompido ou ilegível, recriando do zero.', err.message);
    const estado = estadoInicial();
    fs.writeFileSync(dbPath, JSON.stringify(estado, null, 2));
    return estado;
  }
}

const estado = carregar();

function salvar() {
  fs.writeFileSync(dbPath, JSON.stringify(estado, null, 2));
}

function proximoId(tabela) {
  estado._seq[tabela] = (estado._seq[tabela] || 0) + 1;
  return estado._seq[tabela];
}

module.exports = { estado, salvar, proximoId };
