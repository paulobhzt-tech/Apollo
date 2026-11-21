"""Fetch historical P44 evidence read-only and compare identical sustained-read scenarios."""
import io,json,os,urllib.request,zipfile
from pathlib import Path
out=Path("evidence")
repo=os.environ["GITHUB_REPOSITORY"]
api="https://api.github.com/repos/"+repo
headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],"Accept":"application/vnd.github+json"}
def get(path,binary=False):
    with urllib.request.urlopen(urllib.request.Request(api+path,headers=headers),timeout=60) as response:
        return response.read() if binary else json.load(response)
result={"reference":"fbdd7aed9716fe18d1cc3f6f8990a0d62b566827","comparison":[]}
try:
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
