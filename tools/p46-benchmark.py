"""Paired same-runner benchmark on fresh fictitious databases; never a VPS test."""
import json, os, shutil, ssl, subprocess, sys, tempfile, time
from pathlib import Path
import httpx

root=Path(__file__).resolve().parents[1]
assert os.environ["MONGO_URL"].startswith("mongodb://127.0.0.1:")
assert os.environ["DB_NAME"]=="apollo_p40_browser_fictitious"
out=root/"evidence"
baseline=subprocess.check_output(["git","show","7f24b70282bc08851732976dcad435dd5f5a36fc:backend/routers/operations.py"],cwd=root,text=True)
load=(root/"tools/p45-load.py").read_text()
assert "for session_count in (10,30,50):" in load
results=[]
with tempfile.TemporaryDirectory(prefix="apollo-p46-paired-") as temp:
    temp=Path(temp)
    for pair in range(3):
        for variant in (("baseline","candidate") if pair%2==0 else ("candidate","baseline")):
            work=temp/f"{pair}-{variant}"
            backend=work/"backend"
            shutil.copytree(root/"backend",backend,ignore=shutil.ignore_patterns("__pycache__",".env"))
            if variant=="baseline":
                (backend/"routers/operations.py").write_text(baseline)
            dbname=f"apollo_p40_browser_p46_pair_{os.environ['GITHUB_RUN_ID']}_{pair}_{variant}"
            env=dict(os.environ,DB_NAME=dbname,APOLLO_CASH_MODE="operator",COOKIE_SECURE="true",
                     CORS_ORIGINS="https://127.0.0.1:8010")
            (work/"evidence").mkdir()
            subprocess.run([sys.executable,"p40_seed_ci.py"],cwd=backend,env=env,check=True)
            runner=backend/"p46_profile_server.py"
            runner.write_text('''import json,time
from pathlib import Path
from routers import operations
original=operations.record_counter_sale
metrics={"transaction_body_attempts":0,"transaction_body_seconds":0}
async def measured(*args,**kwargs):
    metrics["transaction_body_attempts"]+=1
    started=time.monotonic()
    try:
        return await original(*args,**kwargs)
    finally:
        metrics["transaction_body_seconds"]+=time.monotonic()-started
operations.record_counter_sale=measured
import server,uvicorn
try:
    uvicorn.run(server.app,host="127.0.0.1",port=8010,
                ssl_keyfile="/tmp/apollo-p41-tls/server.key",
                ssl_certfile="/tmp/apollo-p41-tls/server.crt")
finally:
    Path("profile.json").write_text(json.dumps(metrics))
''')
            sample=load.replace("apollo_p40_browser_fictitious",dbname).replace("8001","8010").replace("for session_count in (10,30,50):","for session_count in ():")
            (work/"load.py").write_text(sample)
            logpath=out/f"p46-pair-{pair}-{variant}-server.log"
            with logpath.open("w") as log:
                server=subprocess.Popen([sys.executable,str(runner)],cwd=backend,env=env,stdout=log,stderr=subprocess.STDOUT)
                try:
                    tls=ssl.create_default_context(cafile="/tmp/apollo-p41-tls/apollo-local-ca.crt")
                    for _ in range(120):
                        if server.poll() is not None:
                            raise RuntimeError("benchmark server exited; inspect "+str(logpath))
                        try:
                            if httpx.get("https://127.0.0.1:8010/api/",verify=tls).is_success:
                                break
                        except httpx.HTTPError:
                            pass
                        time.sleep(.25)
                    else:
                        raise RuntimeError("benchmark server readiness timed out")
                    with (out/f"p46-pair-{pair}-{variant}-load.log").open("w") as loadlog:
                        subprocess.run([sys.executable,"load.py"],cwd=work,env=env,stdout=loadlog,stderr=subprocess.STDOUT,check=True)
                finally:
                    server.terminate()
                    server.wait(timeout=30)
            result=json.loads((work/"evidence/p43-financial-load.json").read_text())
            result.update(json.loads((backend/"profile.json").read_text()),pair=pair,variant=variant,database=dbname)
            results.append(result)
            (out/f"p46-pair-{pair}-{variant}.json").write_text(json.dumps(result,indent=2))
            print(json.dumps(result),flush=True)
report={"scope":"single runner, one process, three alternating paired samples, fresh fictitious replica databases",
        "baseline_commit":"7f24b70282bc08851732976dcad435dd5f5a36fc",
        "candidate_commit":subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip(),
        "samples":results}
(out/"p46-financial-paired.json").write_text(json.dumps(report,indent=2))
