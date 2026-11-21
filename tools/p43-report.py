"""Generate P43 results from retained logs and JSON; CI never grants store approval."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
out=Path("evidence")
commit=(out/"commit.txt").read_text().strip()
rows=[]
for p in sorted(out.glob("*.xml")):
    root=ET.parse(p).getroot()
    suites=[root] if root.tag=="testsuite" else list(root.findall("testsuite"))
    fields=[sum(int(s.get(k,0)) for s in suites) for k in ("tests","failures","errors","skipped")]
    rows.append("| "+p.name+" | "+" | ".join(map(str,fields))+" |")
parts=[
"# Apollo PDV 3.0.1 — P43 experimental",
"Commit executado: "+commit,
"**NÃO LIBERADO PARA A LOJA.** O resultado do job e cada evidência devem ser consultados. Artefatos também são produzidos quando há falhas.",
"## Backend\n\n| XML | Testes | Falhas | Erros | Ignorados |\n|---|---:|---:|---:|---:|\n"+"\n".join(rows),
"""## Escopo dos testes
- playwright.log: 32 cenários existentes, com API simulada.
- real-playwright.log: operações HTTP reais com login pelo Chromium, dois caixas e garçom.
- queue-playwright.log: recuperação de fila montada pelo ensaio P41.
- real-screens.log: 26 telas em desktop e mobile emulado; a P43 reprova overflow horizontal no documento.
- p43-ui.log: turno pelas telas, mesas compartilhadas, transferência, comanda, recebimento misto e fechamento; venda offline criada pelas telas e recuperada em novo contexto do navegador.
- p43-sustained-load.json: 50 sessões HTTP autenticadas, leituras sustentadas durante 30 segundos, p95 máximo pré-definido de 2 segundos e zero erros HTTP.
- p43-financial-load.json: 50 pedidos de recebimento concorrentes em 25 pares idempotentes; reconciliação de estoque, vendas e caixa.
- restart-integrity.json e rollback-integrity.json: reinício de backend/MongoDB e retorno por processos entre referência preservada e candidata, no mesmo banco fictício.
- traces e capturas em tests/test-results: evidência Chromium real. O perfil mobile é emulado.

A ausência de um arquivo não é aprovação. Uma falha no teste exige correção e reteste do código afetado.
""",
"""## Dependências e instalação
Os lockfiles frontend/package-lock.json e tests/package-lock.json estão versionados.
Use Node 22 e npm ci --legacy-peer-deps no frontend; npm ci em tests.
Os pacotes privados de edição visual são opcionais e foram retirados do manifesto da candidata.
O CSS original do shadcn 4.23.0 e sua licença estão preservados em frontend/src/styles/vendor/shadcn. O CLI foi retirado por trazer a cadeia minimatch → @ts-morph/common → ts-morph responsável pelos quatro alertas moderados.
O gate npm reprova alertas moderados, altos e críticos. Veja npm-audit.json.
Python usa backend/requirements.txt; as versões efetivamente instaladas estão em python-installed.txt. Isso ainda não é um lock Python com hashes.
""",
"""## Pendências que impedem recomendação de liberação
- Verificar SHA-256, integridade e ancestralidade dos bytes do bundle P32. O arquivo está identificado, mas o executor GitHub não recebeu esses bytes.
- Validar isolamento e atualização/rollback na infraestrutura de destino, sem alterar produção.
- Instalação e impressão em dispositivos físicos não estão comprovadas pelos testes emulados/lógicos.
- Revisar qualquer falha ou evidência ausente nesta execução.

Limitações de produto preservadas e explícitas:
- Emissão fiscal e integrações delivery simuladas não são integrações SEFAZ/iFood homologadas.
- Banco independente por estabelecimento é obrigatório; não há isolamento operacional multiestabelecimento completo.
- Dois operadores simultâneos compartilham um turno financeiro; não comprovam dois caixas independentes.
- O service worker mantém somente o manifesto público. Abertura fria da aplicação sem rede não é suportada; a fila de contingência requer aplicação carregada e operador autenticado. A fila é recuperável depois da volta da conexão e reautenticação.
- Esta execução não altera produção, dados reais ou a branch principal.
""",
"""## Entrega
frontend/dist é o build Web/PWA experimental do commit registrado.
Apollo-P43-source.zip e Apollo-P43-history.bundle preservam a candidata; esse bundle não é o bundle P32.
web-SHA256SUMS.txt e SHA256SUMS.txt registram a integridade.
O relatório não concede autorização de uso na loja.
"""
]
for name in ("npm-audit.json","python-audit.json","p43-sustained-load.json","p43-financial-load.json","restart-integrity.json","rollback-integrity.json"):
    p=out/name
    if not p.exists():
        parts.append("**Resultado ausente:** "+name)
        continue
    data=json.loads(p.read_text())
    if name=="npm-audit.json": data=data.get("metadata",data)
    if name=="python-audit.json":
        data=[{"name":d["name"],"version":d["version"],"vulns":d.get("vulns")} for d in data.get("dependencies",[]) if d.get("vulns")]
    if name=="restart-integrity.json": data={"same":data.get("same"),"collections":list(data.get("before",{}))}
    parts.append("### "+name+"\n\n\x60\x60\x60json\n"+json.dumps(data,indent=2,ensure_ascii=False)+"\n\x60\x60\x60")
(out/"Apollo-P43-Auditoria.md").write_text("\n\n".join(parts))
print("P43 evidence report generated for",commit)
