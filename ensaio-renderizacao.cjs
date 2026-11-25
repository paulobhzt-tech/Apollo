const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const { resolve, join } = require("node:path");
const repo = resolve(process.argv[2] || "../apollo");
const outputDirectory = resolve(process.argv[3] || "./pdf-gerado");
const { chromium } = require(join(repo, "tests/node_modules/playwright"));
const { thermalLayout, thermalPageHeight } = require(join(repo, "desktop/thermal-print.js"));

(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    for (const width of [58, 80]) {
      for (const items of [1, 3, 10, 20, 50, 100]) {
        const page = await browser.newPage({ viewport: { width: Math.round(width * 96 / 25.4), height: 160 } });
        const rows = Array.from({ length: items }, (_, i) =>
          `<div class="it">ITEM-${String(i + 1).padStart(3, "0")} Porção · observação: sem cebola</div>`).join("");
        await page.setContent(`<!doctype html><meta charset=utf-8><style>
          body { font: 13px monospace; width: ${width - 4}mm; margin: 0 }
          .it { padding: 5px 0; border-bottom: 1px dashed }
        </style><body><h1>Comprovante</h1>${rows}<p>TOTAL R$ 123,45</p></body>`);
        await page.addStyleTag({ content: thermalLayout });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
        const { root } = await cdp.send("DOM.getDocument");
        const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "body" });
        const { model } = await cdp.send("DOM.getBoxModel", { nodeId });
        const y = model.border.filter((_, i) => i % 2 === 1);
        const height = thermalPageHeight(Math.max(...y) - Math.min(...y));
        const path = join(outputDirectory, `${width}mm-${items}.pdf`);
        await page.pdf({ width: `${width}mm`, height: `${height / 1000}mm`, path, preferCSSPageSize: true });
        const output = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
        assert.deepEqual(output.match(/ITEM-\d+/g), Array.from({ length: items }, (_, i) => `ITEM-${String(i + 1).padStart(3, "0")}`));
        assert.match(output, /TOTAL R\$ 123,45/);
        assert.match(output, /observação/);
        const pages = output.split("\f").filter((p) => p.trim()).length;
        console.log(JSON.stringify({ width, items, height_um: height, pages }));
        await page.close();
      }
    }
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exitCode = 1; });
