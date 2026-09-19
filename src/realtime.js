// realtime.js — ponte fina para o Socket.IO. server.js chama setIo() uma
// vez, o resto do projeto só usa as funções de emissão abaixo (evita
// dependência circular com src/auctions.js).

let io = null;

function setIo(instancia) {
  io = instancia;
}

function emitirGlobal(evento, payload) {
  if (io) io.emit(evento, payload);
}

function emitirParaLeilao(leilaoId, evento, payload) {
  if (io) io.to(`leilao:${leilaoId}`).emit(evento, payload);
}

module.exports = { setIo, emitirGlobal, emitirParaLeilao };
