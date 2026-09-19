// db.js — armazenamento simples em arquivo JSON (sem dependências nativas,
// funciona em qualquer hospedagem, incluindo compartilhada tipo Hostinger).
//
// Todo o estado fica em memória e é regravado em data.json a cada mudança,
// então nada se perde se o processo reiniciar.

const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.json');

// Compradores de exemplo, pré-cadastrados de fábrica — pra já ter o
// "elenco" pronto pro simulador sem precisar digitar nada. Maioria de
// nomes árabes, com alguns em inglês e espanhol misturados. Sem foto: cai
// no avatar automático de iniciais (dá pra trocar por uma foto de verdade
// a qualquer momento, editando o comprador no dashboard).
const COMPRADORES_EXEMPLO = [
  { nome: 'Ahmed Al-Farsi', cidade: 'Dubai, EAU' },
  { nome: 'Fatima Al-Sayed', cidade: 'Riyadh, Arábia Saudita' },
  { nome: 'Youssef Haddad', cidade: 'Cairo, Egito' },
  { nome: 'Layla Mansour', cidade: 'Beirute, Líbano' },
  { nome: 'Omar Khalil', cidade: 'Amã, Jordânia' },
  { nome: 'Amina Benali', cidade: 'Casablanca, Marrocos' },
  { nome: 'Khalid Al-Rashid', cidade: 'Doha, Catar' },
  { nome: 'Nour Aziz', cidade: 'Tunes, Tunísia' },
  { nome: 'Tariq Nasser', cidade: 'Kuwait City, Kuwait' },
  { nome: 'Zainab Qureshi', cidade: 'Sharjah, EAU' },
  { nome: 'Hassan Bakr', cidade: 'Bagdá, Iraque' },
  { nome: 'Mariam El-Sherif', cidade: 'Alexandria, Egito' },
  { nome: 'Karim Zidane', cidade: 'Argel, Argélia' },
  { nome: 'Reem Al-Otaibi', cidade: 'Jidá, Arábia Saudita' },
  { nome: 'Sami Abdullah', cidade: 'Mascate, Omã' },
  { nome: 'Dalia Farouk', cidade: 'Manama, Bahrein' },
  { nome: 'Rami Saleh', cidade: 'Abu Dhabi, EAU' },
  { nome: 'Huda Karam', cidade: 'Rabat, Marrocos' },
  { nome: 'Bilal Hakimi', cidade: 'Trípoli, Líbia' },
  { nome: 'Salma Yousef', cidade: 'Damasco, Síria' },
  { nome: 'James Whitfield', cidade: 'Londres, Reino Unido' },
  { nome: 'Emily Carter', cidade: 'Nova York, EUA' },
  { nome: 'Michael Bennett', cidade: 'Toronto, Canadá' },
  { nome: 'Olivia Hughes', cidade: 'Sydney, Austrália' },
  { nome: 'Daniel Foster', cidade: 'Manchester, Reino Unido' },
  { nome: 'Carlos Fernández', cidade: 'Madri, Espanha' },
  { nome: 'Isabel Rodríguez', cidade: 'Buenos Aires, Argentina' },
  { nome: 'Diego Morales', cidade: 'Cidade do México, México' },
  { nome: 'Sofía Herrera', cidade: 'Bogotá, Colômbia' },
  { nome: 'Mateo Vargas', cidade: 'Barcelona, Espanha' }
];

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
    // rotação automática: cria (e opcionalmente já simula) um leilão novo
    // de tempos em tempos, sozinho — pra deixar rodando sem precisar ficar
    // clicando em "criar leilão" toda hora.
    rotacao: {
      ativo: false,
      intervaloMinutos: 5,
      duracaoMinutos: 5,
      tituloBase: 'Leilão automático',
      precoInicial: 100,
      incrementoMinimo: 10,
      moeda: 'BRL',
      antiSnipeJanelaSegundos: 30,
      antiSnipeExtensaoSegundos: 60,
      autoSimular: true,
      lancesPorComprador: 2,
      valorMin: 10,
      valorMax: 50,
      intervaloMinMs: 3000,
      intervaloMaxMs: 8000,
      ultimoCriadoEm: null,
      contador: 0
    },
    // true depois que os 30 compradores de exemplo forem semeados uma vez —
    // assim, se a pessoa apagar todos de propósito, eles não voltam sozinhos
    // no próximo restart.
    sementeCompradoresAplicada: false,
    _seq: { leiloes: 0, lances: 0, participantes: 0, webhookEventos: 0 }
  };
}

function semearCompradoresExemplo(estado) {
  if (estado.sementeCompradoresAplicada) return;
  const agora = () => new Date().toISOString();
  for (const c of COMPRADORES_EXEMPLO) {
    estado._seq.participantes += 1;
    estado.participantes.push({
      id: estado._seq.participantes,
      nome: c.nome,
      cidade: c.cidade,
      fotoUrl: '',
      criadoEm: agora()
    });
  }
  estado.sementeCompradoresAplicada = true;
}

function carregar() {
  if (!fs.existsSync(dbPath)) {
    return estadoInicial();
  }
  try {
    const bruto = fs.readFileSync(dbPath, 'utf8');
    const dados = JSON.parse(bruto);
    const base = estadoInicial();
    return {
      ...base,
      ...dados,
      webhookConfig: { ...base.webhookConfig, ...(dados.webhookConfig || {}) },
      rotacao: { ...base.rotacao, ...(dados.rotacao || {}) },
      _seq: { ...base._seq, ...(dados._seq || {}) }
    };
  } catch (err) {
    console.error('Aviso: data.json corrompido ou ilegível, recriando do zero.', err.message);
    return estadoInicial();
  }
}

const estado = carregar();

function salvar() {
  fs.writeFileSync(dbPath, JSON.stringify(estado, null, 2));
}

// No primeiro run (ou em qualquer banco que ainda não tenha rodado essa
// semente), já deixa os 30 compradores de exemplo prontos.
semearCompradoresExemplo(estado);
salvar();

function proximoId(tabela) {
  estado._seq[tabela] = (estado._seq[tabela] || 0) + 1;
  return estado._seq[tabela];
}

module.exports = { estado, salvar, proximoId };
