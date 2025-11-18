// Loads runtime configuration from /config.json and exposes it on globalThis.__APP_CONFIG__
// This allows changing API endpoints after the app is built (no rebuild required).
export async function loadRuntimeConfig(): Promise<Record<string, any> | undefined> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok) {
      console.warn('runtimeConfig: /config.json not found or not OK', res.status);
      return undefined;
    }
    const cfg = await res.json();
    try { (globalThis as any).__APP_CONFIG__ = cfg; } catch (e) { /* ignore */ }
    return cfg;
  } catch (err) {
    console.warn('runtimeConfig: failed to load /config.json', err);
    return undefined;
  }
}
