"""Collect immutable P46 results and publish a corrected review package."""
import hashlib,io,json,os,statistics,urllib.request,zipfile
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        redirected=super().redirect_request(req,fp,code,msg,headers,url)
        if redirected is not None and urlsplit(req.full_url).netloc!=urlsplit(url).netloc:
            redirected.remove_header("Authorization")
        return redirected
opener=urllib.request.build_opener(SafeRedirect())
api="https://api.github.com/repos/"+os.environ["GITHUB_REPOSITORY"]
def get(path,binary=False):
    req=urllib.request.Request(api+path,headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"})
    with opener.open(req,timeout=60) as response:
        return response.read() if binary else json.load(response)
run=get("/actions/runs/44917919329")
assert run["conclusion"]=="success",run["conclusion"]
artifacts=get("/actions/runs/44917919329/artifacts")["artifacts"]
artifact=next(a for a in artifacts if a["name"]=="Apollo-P46-experimental-evidence" and not a["expired"])
data=get("/actions/artifacts/"+str(artifact["id"])+"/zip",True)
assert "sha256:"+hashlib.sha256(data).hexdigest()==artifact["digest"]
archive=zipfile.ZipFile(io.BytesIO(data))
assert archive.testzip() is None
root=Path("collected").resolve()
root.mkdir()
for name in archive.namelist():
    dest=(root/name).resolve()
    assert dest.is_relative_to(root)
archive.extractall(root)
out=next(root.rglob("commit.txt")).parent
commit=(out/"commit.txt").read_text().strip()
assert commit=="72b47cbe67ab78f3ff3b5c2ecc5f830cdd0a1e98"
paired=json.loads((out/"p46-financial-paired.json").read_text())
samples=paired["samples"]
assert len(samples)==6
lines=["# Apollo P46 — resultado consolidado","**BLOQUEADO para operação na loja. Candidata aprovada nos ensaios automatizados abaixo.**",
"Commit testado e empacotado: "+commit,"Execução: "+run["html_url"],
"Este consolidado substitui o texto comparativo herdado da P45, que continha referência e conclusões fixas. Os JSON/XML e logs originais permanecem nas evidências.",
"## Correções","- Controle local por operador nas vendas de balcão, preservando transações e revisão financeira no MongoDB. Evita repetição desnecessária de transações no mesmo turno; outros operadores não compartilham o bloqueio.",
"- CI legada configura explicitamente modo shared; testes operacionais continuam em operator.",
"- Documentada incompatibilidade do Compose VPS standalone com caixas independentes; publicação bloqueada até validar réplica dedicada e infraestrutura.",
"## Regressão","| XML | Testes | Falhas | Erros | Ignorados |","|---|---:|---:|---:|---:|"]
for path in sorted(out.glob("*.xml")):
    tree=ET.parse(path).getroot()
    suites=[tree] if tree.tag=="testsuite" else tree.findall("testsuite")
    counts=[sum(int(s.get(k,0)) for s in suites) for k in ("tests","failures","errors","skipped")]
    assert counts[1]==counts[2]==0
    lines.append("|"+path.name+"|"+"|".join(map(str,counts))+"|")
lines+=["## Desempenho financeiro","Três pares alternados, mesmo runner, um processo, bancos fictícios novos. Os contadores medem execuções do corpo transacional, incluindo repetições.",
"| Par | P45 p95 (s) | P46 p95 (s) | Tentativas P45 | Tentativas P46 |","|---|---:|---:|---:|---:|"]
for pair in range(3):
    a=next(s for s in samples if s["pair"]==pair and s["variant"]=="baseline")
    b=next(s for s in samples if s["pair"]==pair and s["variant"]=="candidate")
    for s in (a,b):
        assert s["unique_sales"]==25 and s["cash_difference"]==0 and s["financial_http_errors"]==0
    lines.append("|%s|%.4f|%.4f|%s|%s|"%(pair+1,a["financial_p95_seconds"],b["financial_p95_seconds"],a["transaction_body_attempts"],b["transaction_body_attempts"]))
for variant in ("baseline","candidate"):
    median=statistics.median(s["financial_p95_seconds"] for s in samples if s["variant"]==variant)
    lines.append("Mediana dos três p95 "+variant+": %.4f s."%median)
lines+=["O ganho observado é deste cenário de balcão, no mesmo processo. Não comprova desempenho de múltiplos workers ou da VPS; a consistência entre processos continua dependendo das transações MongoDB.",
"## Evidências operacionais"]
for name in ("p45-two-cashiers.json","p45-ledger-restore.json","p45-p32-equivalent.json","p43-financial-load.json","restart-integrity.json","rollback-integrity.json"):
    data=json.loads((out/name).read_text())
    if name=="restart-integrity.json": data={"same":data.get("same")}
    lines+=["### "+name,"~~~json\n"+json.dumps(data,ensure_ascii=False,indent=2)+"\n~~~"]
lines+=["## Instalação e pendências","Usar INSTALACAO-P46.txt e o build frontend/dist. Python 3.11, Node 22, MongoDB 7 em réplica autenticada dedicada, banco fictício exclusivo, APOLLO_CASH_MODE=operator, HTTPS válido, COOKIE_SECURE=true, CORS_ORIGINS exato e SERVE_FRONTEND_DIR absoluto.",
"- NÃO EXECUTADO: impressora térmica física 80 mm, duas vias, setores e recuperação real.",
"- NÃO EXECUTADO: instalação/atualização PWA em Android, iPhone e Windows físicos.",
"- NÃO VALIDADO: servidor de destino, domínio HTTPS externo, isolamento, backup/rollback na VPS. Nenhum endereço externo é declarado funcional.",
"- Integridade do bundle P32 original permanece pendente; requisito conhecido foi ensaiado diretamente por recuperação transacional.",
"Roteiro presencial: P46-Homologacao-Presencial.md. Não houve merge na principal, deploy de produção, dados ou vendas reais.",
"**Parecer: BLOQUEADO para liberação operacional pelos requisitos externos não executados.**"]
report="\n\n".join(lines)
(out/"P46-Resultado-Consolidado.md").write_text(report)
for path in out.glob("*Comparacao-P44.md"):
    path.unlink()
protocol=Path("docs/P46-Homologacao-Presencial.md")
(out/protocol.name).write_text(protocol.read_text())
package=out/"Apollo-P46-homologacao.zip"
with zipfile.ZipFile(package,"a",zipfile.ZIP_DEFLATED) as z:
    z.write(out/"P46-Resultado-Consolidado.md","P46-Resultado-Consolidado.md")
    z.write(out/protocol.name,protocol.name)
manifest=out/"SHA256SUMS.txt"
manifest.write_text("\n".join(hashlib.sha256(p.read_bytes()).hexdigest()+"  "+str(p.relative_to(root)) for p in sorted(root.rglob("*")) if p.is_file() and p!=manifest)+"\n")
summary={"tested_commit":commit,"original_artifact":artifact["id"],"original_artifact_digest":artifact["digest"],
"homologation_package_sha256":hashlib.sha256(package.read_bytes()).hexdigest(),
"paired_median_seconds":{v:statistics.median(s["financial_p95_seconds"] for s in samples if s["variant"]==v) for v in ("baseline","candidate")}}
Path("final-summary.json").write_text(json.dumps(summary,indent=2))
print(json.dumps(summary),flush=True)
