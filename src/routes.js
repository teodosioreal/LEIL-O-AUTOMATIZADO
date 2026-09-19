const express = require('express');
const multer = require('multer');
const path = require('path');
const auctions = require('./auctions');
const webhooks = require('./webhooks');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'public', 'uploads'),
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

admin.post('/leiloes', (req, res) => {
  try {
    res.status(201).json(auctions.criarLeilao(req.body));
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

admin.put('/leiloes/:id', (req, res) => {
  const leilao = auctions.atualizarLeilao(req.params.id, req.body);
  if (!leilao) return res.status(404).json({ erro: 'Leilão não encontrado' });
  res.json(leilao);
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

admin.post('/leiloes/:id/simular', (req, res) => {
  try {
    const quantidade = Math.max(1, Math.min(200, Number(req.body.quantidade) || 10));
    const intervaloMinMs = Number(req.body.intervaloMinMs) || 2000;
    const intervaloMaxMs = Math.max(intervaloMinMs, Number(req.body.intervaloMaxMs) || 6000);
    res.json(auctions.dispararSimulacao(req.params.id, quantidade, intervaloMinMs, intervaloMaxMs));
  } catch (err) {
    res.status(400).json({ erro: err.message });
  }
});

admin.post('/leiloes/:id/simular/parar', (req, res) => {
  auctions.pararSimulacao(req.params.id);
  res.status(204).end();
});

admin.get('/participantes', (req, res) => {
  res.json(auctions.listarParticipantes());
});

admin.post('/participantes', (req, res) => {
  try {
    res.status(201).json(auctions.criarParticipante(req.body.nome));
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

module.exports = { publicas, admin };
