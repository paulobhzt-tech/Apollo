import { isDesktop } from './desktop';
export const WEB_SESSION_BOUNDARY = 'apollo_web_session_boundary_v1';
export function notifyWebSessionBoundary() {
  if (isDesktop()) return;
  try { localStorage.setItem(WEB_SESSION_BOUNDARY, crypto.randomUUID()); } catch { /* Auth remains server-owned. */ }
}
