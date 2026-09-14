const { WebSocketServer } = require('ws');

const clients = new Set();
let wss;

function initWS(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', ws => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  console.log('[ws] WebSocket server ready on /ws');
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === 1) client.send(data);
  }
}

module.exports = { initWS, broadcast };
