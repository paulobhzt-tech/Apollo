const MICRONS_PER_CSS_PIXEL = 25400 / 96;
const MAX_THERMAL_HEIGHT = 297000;
const MIN_THERMAL_HEIGHT = 100000;
const FEED_MARGIN = 3000;

function thermalPageHeight(renderedPixels) {
  if (!Number.isFinite(renderedPixels) || renderedPixels <= 0) {
    throw new Error("Não foi possível medir o comprovante.");
  }
  const height = Math.ceil((renderedPixels * MICRONS_PER_CSS_PIXEL + FEED_MARGIN) / 1000) * 1000;
  return Math.min(MAX_THERMAL_HEIGHT, Math.max(MIN_THERMAL_HEIGHT, height));
}

const thermalLayout = `
  @page { size: auto !important; margin: 0 !important; }
  html { overflow-wrap: anywhere; }
  body { margin-inline: auto !important; display: flow-root !important; }
  tr, .it { break-inside: avoid; }
`;

async function submitPrintCopies(submit, options, useSeparateCopies) {
  if (!useSeparateCopies || options.copies === 1) return submit(options);
  for (let index = 0; index < options.copies; index++) {
    let result;
    try {
      result = await submit({ ...options, copies: 1 });
    } catch (error) {
      result = { ok: false, error: String(error) };
    }
    if (!result.ok) {
      return { ok: false, error: `Via ${index + 1}/${options.copies}: resultado indeterminado; ${index} via(s) aceita(s) pelo spooler. Confira o papel e a fila antes de reenviar. ${result.error || ""}` };
    }
  }
  return { ok: true };
}

module.exports = { thermalLayout, thermalPageHeight, submitPrintCopies };
