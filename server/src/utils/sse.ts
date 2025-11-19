import { Response } from 'express';

// Map of userId -> Set of responses (one per open SSE connection)
const clients: Map<string, Set<Response>> = new Map();

export function addClient(userId: string, res: Response) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function removeClient(userId: string, res: Response) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function sendToRes(res: Response, event: string, data: any) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    // ignore
  }
}

export function sendToUser(userId: string, event: string, data: any) {
  const set = clients.get(userId);
  if (!set) return;
  for (const res of Array.from(set)) {
    sendToRes(res, event, data);
  }
}

export function sendToAll(event: string, data: any) {
  for (const [userId, set] of clients.entries()) {
    for (const res of Array.from(set)) {
      sendToRes(res, event, data);
    }
  }
}

export default {
  addClient,
  removeClient,
  sendToUser,
  sendToAll,
};
