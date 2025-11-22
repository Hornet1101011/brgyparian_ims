// Compatibility shim so source route files can require('../utils/sse')
// and get the implementation from compiled `dist/utils/sse.js` when present.
try {
  module.exports = require('../dist/utils/sse');
} catch (e) {
  // Fallback: if dist copy not present, export a minimal no-op SSE helper
  const clients = new Map();
  function addClient(userId, res) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(res);
  }
  function removeClient(userId, res) {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
  }
  function sendToUser(userId, event, data) {
    const set = clients.get(userId);
    if (!set) return;
    for (const res of Array.from(set)) {
      try { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) { }
    }
  }
  function sendToAll(event, data) {
    for (const [uid, set] of clients.entries()) {
      for (const res of Array.from(set)) {
        try { res.write(`event: ${event}\n`); res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (e) { }
      }
    }
  }
  module.exports = { addClient, removeClient, sendToUser, sendToAll };
}
