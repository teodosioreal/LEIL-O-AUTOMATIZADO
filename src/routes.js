const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auctions = require('./auctions');
const webhooks = require('./webhooks');

// Garante que a pasta exista mesmo num deploy do zero (ex: zip extraído na
// Hostinger sem a pasta uploads/) — o multer não cria diretórios sozinho.
const pastaUploads = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(pastaUploads, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: pastaUploads,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

// ---------- rotas públicas (usadas pelas páginas do leilão) ----------

const publicas = express.Router();

publicas.get('/leiloes', (req, res) => {
  res.json(auctions.listarLeiloes());
});

publicas.get('/leiloes/:id', (req, res) => {
  const leilao = auctions.obterLeilao(req.params.id);
  if (!leilao) return res.status(404).json({ erro: 'Leilão não encontrado' });
  res.json({ leilao: auctions.leilaoPublico(leilao), lances: auctions.listarLances(req.params.id) });
});

publicas.post('/leiloes/:id/lances', (req, res) => {
  try {
    const { participanteId, valor } = req.body;
    const { leilao, lance, prorrogado } = auctions.registrarLance(req.params.id, participanteId, valor);
    res.status(201).json({ leilao: auctions.leilaoPublico(leilao), lance: auctions.lancePublico(lance), prorrogado });
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

publicas.get('/participantes', (req, res) => {
  res.json(auctions.listarParticipantes());
});

// ---------- rotas administrativas (dashboard, atrás de Basic Auth) ----------

const admin = express.Router();

admin.get('/leiloes', (req, res) => {
  res.json(auctions.listarLeiloesAdmin());
});

// Cria um leilão agora mesmo, usando a configuração salva (preço,
// duração, anti-sniping) e já dispara lances automáticos de até
// `maxCompradores` compradores sorteados do cadastro.
admin.post('/leiloes/simular-agora', (req, res) => {
  try {
    res.status(201).json(auctions.simularLeilaoAgora());
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

admin.delete('/leiloes/:id', (req, res) => {
  const ok = auctions.removerLeilao(req.params.id);
  if (!ok) return res.status(404).json({ erro: 'Leilão não encontrado' });
  res.status(204).end();
});

admin.post('/leiloes/:id/confirmar-pagamento', (req, res) => {
  try {
    res.json(auctions.confirmarPagamento(req.params.id));
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

admin.get('/participantes', (req, res) => {
  res.json(auctions.listarParticipantes());
});

admin.post('/participantes', (req, res) => {
  try {
    res.status(201).json(auctions.criarParticipante(req.body));
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

admin.delete('/participantes/:id', (req, res) => {
  const ok = auctions.removerParticipante(req.params.id);
  if (!ok) return res.status(404).json({ erro: 'Participante não encontrado' });
  res.status(204).end();
});

admin.get('/webhook-config', (req, res) => {
  res.json(webhooks.getConfig());
});

admin.put('/webhook-config', (req, res) => {
  res.json(webhooks.setConfig(req.body));
});

admin.get('/webhook-eventos', (req, res) => {
  res.json(webhooks.listarEventos());
});

admin.post('/webhook-eventos/:id/reenviar', (req, res) => {
  const evento = webhooks.reenviarManual(req.params.id);
  if (!evento) return res.status(404).json({ erro: 'Evento não encontrado' });
  res.json(evento);
});

admin.post('/upload', upload.single('imagem'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

admin.get('/rotacao-config', (req, res) => {
  res.json(auctions.getConfigRotacao());
});

admin.put('/rotacao-config', (req, res) => {
  res.json(auctions.setConfigRotacao(req.body));
});

module.exports = { publicas, admin };
