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
  { nome: 'Ahmed Al-Farsi', cidade: 'Dubai, EAU', bandeira: '🇦🇪' },
  { nome: 'Fatima Al-Sayed', cidade: 'Riyadh, Arábia Saudita', bandeira: '🇸🇦' },
  { nome: 'Youssef Haddad', cidade: 'Cairo, Egito', bandeira: '🇪🇬' },
  { nome: 'Layla Mansour', cidade: 'Beirute, Líbano', bandeira: '🇱🇧' },
  { nome: 'Omar Khalil', cidade: 'Amã, Jordânia', bandeira: '🇯🇴' },
  { nome: 'Amina Benali', cidade: 'Casablanca, Marrocos', bandeira: '🇲🇦' },
  { nome: 'Khalid Al-Rashid', cidade: 'Doha, Catar', bandeira: '🇶🇦' },
  { nome: 'Nour Aziz', cidade: 'Tunes, Tunísia', bandeira: '🇹🇳' },
  { nome: 'Tariq Nasser', cidade: 'Kuwait City, Kuwait', bandeira: '🇰🇼' },
  { nome: 'Zainab Qureshi', cidade: 'Sharjah, EAU', bandeira: '🇦🇪' },
  { nome: 'Hassan Bakr', cidade: 'Bagdá, Iraque', bandeira: '🇮🇶' },
  { nome: 'Mariam El-Sherif', cidade: 'Alexandria, Egito', bandeira: '🇪🇬' },
  { nome: 'Karim Zidane', cidade: 'Argel, Argélia', bandeira: '🇩🇿' },
  { nome: 'Reem Al-Otaibi', cidade: 'Jidá, Arábia Saudita', bandeira: '🇸🇦' },
  { nome: 'Sami Abdullah', cidade: 'Mascate, Omã', bandeira: '🇴🇲' },
  { nome: 'Dalia Farouk', cidade: 'Manama, Bahrein', bandeira: '🇧🇭' },
  { nome: 'Rami Saleh', cidade: 'Abu Dhabi, EAU', bandeira: '🇦🇪' },
  { nome: 'Huda Karam', cidade: 'Rabat, Marrocos', bandeira: '🇲🇦' },
  { nome: 'Bilal Hakimi', cidade: 'Trípoli, Líbia', bandeira: '🇱🇾' },
  { nome: 'Salma Yousef', cidade: 'Damasco, Síria', bandeira: '🇸🇾' },
  { nome: 'James Whitfield', cidade: 'Londres, Reino Unido', bandeira: '🇬🇧' },
  { nome: 'Emily Carter', cidade: 'Nova York, EUA', bandeira: '🇺🇸' },
  { nome: 'Michael Bennett', cidade: 'Toronto, Canadá', bandeira: '🇨🇦' },
  { nome: 'Olivia Hughes', cidade: 'Sydney, Austrália', bandeira: '🇦🇺' },
  { nome: 'Daniel Foster', cidade: 'Manchester, Reino Unido', bandeira: '🇬🇧' },
  { nome: 'Carlos Fernández', cidade: 'Madri, Espanha', bandeira: '🇪🇸' },
  { nome: 'Isabel Rodríguez', cidade: 'Buenos Aires, Argentina', bandeira: '🇦🇷' },
  { nome: 'Diego Morales', cidade: 'Cidade do México, México', bandeira: '🇲🇽' },
  { nome: 'Sofía Herrera', cidade: 'Bogotá, Colômbia', bandeira: '🇨🇴' },
  { nome: 'Mateo Vargas', cidade: 'Barcelona, Espanha', bandeira: '🇪🇸' }
];

function estadoInicial() {
  return {
    leiloes: [],
    lances: [],
    participantes: [],
    webhookConfig: {
      url: '',
      secret: '',
      // 'padrao' = payload genérico (event_id/type/external_id/data, com
      // assinatura HMAC em X-Webhook-Signature); 'privefeet' = formato
      // exato do privefeet.pro (type flat "start"/"bid"/"end", header
      // X-Webhook-Secret com o valor cru do secret).
      formato: 'padrao',
      eventos: { start: true, bid: true, won: true },
      autoConfirmarPagamento: true,
      autoConfirmarPagamentoSegundos: 10
    },
    webhookEventos: [],
    // Configuração única do "leilão automático": usada tanto pelo botão
    // "Simular leilão agora" quanto pela rotação automática (ativo=true
    // cria um leilão novo sozinho a cada intervaloMinutos). Todo leilão
    // criado por aqui já sai com lances automáticos de até
    // `maxCompradores` compradores sorteados do cadastro.
    rotacao: {
      ativo: false,
      intervaloMinutos: 5,
      tituloBase: 'Leilão automático',
      precoInicial: 100,
      incrementoMinimo: 10,
      duracaoMinutos: 5,
      antiSnipeAtivo: true,
      maxCompradores: 5,
      valorMin: 10,
      valorMax: 50,
      intervaloLancesMinSeg: 3,
      intervaloLancesMaxSeg: 8,
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
      bandeira: c.bandeira || '',
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
