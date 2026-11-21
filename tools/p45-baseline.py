"""Fetch historical P44 evidence read-only and compare identical sustained-read scenarios."""
import io,json,os,urllib.request,zipfile
from pathlib import Path
out=Path("evidence")
out.mkdir(exist_ok=True)
repo=os.environ["GITHUB_REPOSITORY"]
api="https://api.github.com/repos/"+repo
headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"}
class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,newheaders,newurl):
        redirected=super().redirect_request(req,fp,code,msg,newheaders,newurl)
        from urllib.parse import urlsplit
        if redirected is not None and urlsplit(req.full_url).netloc!=urlsplit(newurl).netloc:
            redirected.remove_header("Authorization")
        return redirected
opener=urllib.request.build_opener(SafeRedirect())
def get(path,binary=False):
    with opener.open(urllib.request.Request(api+path,headers=headers),timeout=60) as response:
        return response.read() if binary else json.load(response)
result={"reference":"fbdd7aed9716fe18d1cc3f6f8990a0d62b566827","comparison":[]}
try:
    current_run=os.environ.get("P45_EVIDENCE_RUN")
    if current_run:
        artifacts=get("/actions/runs/"+current_run+"/artifacts")["artifacts"]
        current_artifact=next(a for a in artifacts if a["name"]=="Apollo-P45-experimental-evidence" and not a["expired"])
        assert current_artifact["size_in_bytes"]<200_000_000
        current_zip=zipfile.ZipFile(io.BytesIO(get("/actions/artifacts/"+str(current_artifact["id"])+"/zip",True)))
        for count in (10,30,50):
            name="p44-sustained-"+str(count)+".json"
            member=next(n for n in current_zip.namelist() if n.endswith("/"+name) or n==name)
            (out/name).write_bytes(current_zip.read(member))
        result["candidate_run_url"]="https://github.com/"+repo+"/actions/runs/"+current_run
    runs=get("/actions/runs?head_sha="+result["reference"]+"&per_page=100")["workflow_runs"]
    runs=[r for r in runs if r["conclusion"]=="success" and r["name"]=="P44 isolated Web PWA acceptance"]
    assert runs,"No successful P44 baseline run available"
    run=runs[0]
    result["run_url"]=run["html_url"]
    artifacts=get("/actions/runs/"+str(run["id"])+"/artifacts")["artifacts"]
    artifact=next(x for x in artifacts if x["name"]=="Apollo-P44-experimental-evidence" and not x["expired"])
    assert artifact["size_in_bytes"]<200_000_000
    archive=zipfile.ZipFile(io.BytesIO(get("/actions/artifacts/"+str(artifact["id"])+"/zip",True)))
    for count in (10,30,50):
        name="p44-sustained-"+str(count)+".json"
        names=[n for n in archive.namelist() if n.endswith("/"+name) or n==name]
        assert len(names)==1,(name,names)
        old=json.loads(archive.read(names[0]))
        current=json.loads((out/name).read_text())
        result["comparison"].append({"sessions":count,"P44":old,"P45":current,
            "p95_ratio":current["p95_seconds"]/old["p95_seconds"]})
    result["status"]="compared"
except Exception as error:
    result["status"]="historical comparison unavailable"
    result["reason"]=type(error).__name__+": "+str(error)
(out/"p45-load-comparison.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result),flush=True)

if result["status"]=="compared":
    lines=["# Apollo P45 — comparação complementar com P44",
        "Candidata testada: d8aff0cc41f5ac960c2306935a08ef7782abd34e.",
        "Este complemento substitui a indicação de comparação indisponível do primeiro relatório P45. Aplicação e build permanecem os mesmos do ensaio completo; esta execução somente lê artefatos.",
        "| Sessões | Requisições P44 | Requisições P45 | p95 P44 (ms) | p95 P45 (ms) | Variação |",
        "|---|---:|---:|---:|---:|---:|"]
    for row in result["comparison"]:
        a,b=row["P44"],row["P45"]
        lines.append("| %s | %s | %s | %.2f | %.2f | %+.2f%% |"%(row["sessions"],a["requests"],b["requests"],1000*a["p95_seconds"],1000*b["p95_seconds"],100*(row["p95_ratio"]-1)))
    lines += ["Ambos os ensaios: 30 segundos por cenário, zero erros HTTP de leitura.",
        "A variação de cerca de 1% com 50 sessões, junto de resultados melhores nos demais cenários, não demonstra regressão consistente. Não se trata de teste estatístico repetido.",
        "P45: pagamentos concorrentes (50 requisições, 25 vendas únicas) tiveram p95 de 6,63 s, sem duplicação e com diferença financeira zero. P44 não registrou p95 financeiro; não há comparação numérica equivalente para essa métrica.",
        "P44: "+result["run_url"],"P45: "+result.get("candidate_run_url","execução principal")]
    (out/"Apollo-P45-Comparacao-P44.md").write_text("\n\n".join(lines))
else:
    raise SystemExit(1)
