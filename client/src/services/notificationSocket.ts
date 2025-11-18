
import io from 'socket.io-client';
type SocketType = ReturnType<typeof io>;

let socket: SocketType | null = null;

/**
 * Initialize the notification socket.
 * Priority for endpoint resolution:
 * 1. runtime config `__APP_CONFIG__.SOCKET_URL`
 * 2. runtime config `__APP_CONFIG__.API_BASE`
 * 3. build-time `REACT_APP_API_URL`
 * 4. fallback to relative '/' (dev proxy will route to backend)
 */
export function initNotificationSocket(token?: string) {
  if (socket) return socket;
  const cfg = (globalThis as any).__APP_CONFIG__ || {};
  const envApi = process.env.REACT_APP_API_URL;
  let base = cfg.SOCKET_URL || cfg.API_BASE || envApi || '/api';
  let root = String(base).replace(/\/$/, '');
  // If base is an API path that contains '/api', strip it to get the host root
  if (root.endsWith('/api')) root = root.replace(/\/api$/, '');

  // If root is just '/api' (dev), use empty string so socket.io connects to current origin
  if (root === '/api') root = '';

  socket = io(root || '/', {
    path: '/socket.io',
    transports: ['websocket'],
    auth: token ? { token } : undefined,
    withCredentials: true,
    autoConnect: true,
  });
  return socket;
}

export function onNotificationEvent(event: string, handler: (...args: any[]) => void) {
  if (!socket) return;
  socket.on(event, handler);
}

export function offNotificationEvent(event: string, handler: (...args: any[]) => void) {
  if (!socket) return;
  socket.off(event, handler);
}

export function getSocket() {
  return socket;
}
