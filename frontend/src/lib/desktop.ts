// Bridge to the Windows desktop app (Electron preload). In a normal browser `window.pdvDesktop` is undefined
// and everything falls back to localStorage / browser printing, so the web version keeps working unchanged.
export interface DesktopPrinter { name: string; displayName: string; isDefault: boolean }
export interface DesktopBridge {
  isDesktop: true;
  version: string;
  deviceId: string;
  /** Encrypted on-disk key/value store (Windows DPAPI via Electron safeStorage). Sync for small payloads. */
  kvGet: (key: string) => string | null;
  kvSet: (key: string, value: string) => void;
  printers: () => Promise<DesktopPrinter[]>;
  print: (opts: { html: string; deviceName?: string; copies?: number; paper?: string }) => Promise<{ ok: boolean; error?: string }>;
  config: () => Promise<{ serverUrl: string; servers: { name: string; url: string }[]; startWithWindows: boolean; mode: "online" | "offline" }>;
  testServer: (url: string) => Promise<{ ok: boolean; error?: string }>;
  addServer: (s: { name: string; url: string }) => Promise<boolean>;
  removeServer: (url: string) => Promise<boolean>;
  /** Switches the app to this server and reloads it. */
  useServer: (url: string) => Promise<boolean>;
}

declare global {
  interface Window { pdvDesktop?: DesktopBridge }
}

export const desktop = (): DesktopBridge | undefined => (typeof window !== "undefined" ? window.pdvDesktop : undefined);
export const isDesktop = () => !!desktop();

/** Storage used by the offline queue: encrypted file in the desktop app (shared by online and offline windows), localStorage in browsers. */
export const kv = {
  get(key: string): string | null {
    const d = desktop();
    return d ? d.kvGet(key) : localStorage.getItem(key);
  },
  set(key: string, value: string): void {
    const d = desktop();
    if (d) d.kvSet(key, value);
    else localStorage.setItem(key, value);
  },
};

/** Prefix for offline sale references so every synced sale shows which computer recorded it. */
export const deviceTag = () => desktop()?.deviceId ?? "web";
