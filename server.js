const express = require('express');
const http = require('http');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { Server } = require('socket.io');

const config = require('./src/config');
const routes = require('./src/routes');
const auctions = require('./src/auctions');
const webhooks = require('./src/webhooks');
const realtime = require('./src/realtime');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
realtime.setIo(io);

io.on('connection', (socket) => {
  socket.on('entrar-leilao', (leilaoId) => socket.join(`leilao:${leilaoId}`));
});

app.use(express.json());

const protegerDashboard = basicAuth({
  users: { [config.adminUser]: config.adminPassword },
  challenge: true,
  realm: 'Leilao Automatizado'
});

// API pública (leilões, lances, roster de participantes)
app.use('/api', routes.publicas);

// API + página do dashboard, atrás de usuário/senha
app.use('/api/admin', protegerDashboard, routes.admin);
app.get('/dashboard.html', protegerDashboard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(config.port, () => {
  console.log(`Leilão Automatizado rodando em http://localhost:${config.port}`);
  auctions.iniciar();
  webhooks.iniciar();
});
