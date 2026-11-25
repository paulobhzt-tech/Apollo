import { describe, expect, it } from "vitest";
import { readPrinterInventory } from "./printerInventory";

describe("inventário de impressoras Windows", () => {
  function inventory(filas: unknown, dispositivos: unknown = []) {
    return new File([JSON.stringify({ schema: "apollo-printer-inventory-v1", filas, dispositivos })], "inventario.json");
  }

  it("preserva o nome exato de compartilhamento e reconhece a fila padrão", async () => {
    const name = "\\\\caixa\\Produção 80";
    const report = inventory([{ Name: name }, { Name: name }], [{ Name: name, Default: true }]);
    await expect(readPrinterInventory(report)).resolves.toEqual([{ name, displayName: name, isDefault: true }]);
  });

  it("rejeita nomes de fila vazios e caracteres de controle", async () => {
    await expect(readPrinterInventory(inventory([{ Name: "" }]))).rejects.toThrow("fila inválido");
    await expect(readPrinterInventory(inventory([{ Name: "Fila\nLocal" }]))).rejects.toThrow("fila inválido");
  });

  it("rejeita arquivo grande antes de ler", async () => {
    await expect(readPrinterInventory(new File([" ".repeat(2 * 1024 * 1024 + 1)], "inventario.json")))
      .rejects.toThrow("até 2 MB");
  });
});
