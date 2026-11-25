import type { DesktopPrinter } from "./desktop";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function readPrinterInventory(file: File): Promise<DesktopPrinter[]> {
  if (file.size > 2 * 1024 * 1024) throw new Error("O inventário deve ter até 2 MB.");
  const report: unknown = JSON.parse(await file.text());
  if (!isRecord(report) || report.schema !== "apollo-printer-inventory-v1" || !Array.isArray(report.filas) || !Array.isArray(report.dispositivos)) {
    throw new Error("Selecione um inventário gerado pelo diagnóstico Apollo.");
  }

  const defaults = new Set(report.dispositivos.filter(isRecord).filter((row) => row.Default === true).map((row) => row.Name));
  const queues = new Map<string, DesktopPrinter>();
  for (const row of report.filas) {
    if (!isRecord(row) || typeof row.Name !== "string" || !row.Name.trim() || row.Name.length > 1024 || /[\x00-\x1f\x7f]/.test(row.Name)) {
      throw new Error("O inventário contém um nome de fila inválido.");
    }
    queues.set(row.Name, { name: row.Name, displayName: row.Name, isDefault: defaults.has(row.Name) });
  }
  return Array.from(queues.values());
}
