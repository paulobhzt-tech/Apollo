export interface QueueContext { establishment_id: string; server_id: string; operator_id: string }
export function validContext(value: unknown): value is QueueContext {
  if (!value || typeof value !== "object") return false;
  const c = value as QueueContext;
  return [c.establishment_id, c.server_id, c.operator_id].every(v => typeof v === "string" && v.length > 0 && v.length <= 128);
}
export const contextToken = (context: QueueContext) => JSON.stringify([context.establishment_id, context.server_id, context.operator_id]);
export const sameContext = (a: QueueContext | null | undefined, b: QueueContext | null | undefined) => !!a && !!b && contextToken(a) === contextToken(b);
export function queueKeys(context: QueueContext | null) {
  const suffix = context ? `:v3:${encodeURIComponent(contextToken(context))}` : ":unbound-v3";
  return { KEY: `pdv_offline_queue${suffix}`, REJ_KEY: `pdv_offline_rejected${suffix}`,
    ARCHIVE_KEY: `pdv_offline_reviewed${suffix}`, LOG_KEY: `pdv_offline_last_sync${suffix}`, MENU_KEY: `pdv_offline_menu${suffix}` };
}
