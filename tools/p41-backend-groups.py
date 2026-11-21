"""P41 mandatory backend groups, each with an independent disposable database."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
os.chdir(root / "backend")
evidence = root / "evidence"
evidence.mkdir(exist_ok=True)
files = sorted(Path("tests").glob("test_*.py"))
special = {"test_catalog_standalone.py", "test_restore_disposable_integration.py",
           "test_tscheck_autoteste.py", "test_tscheck_delivery_simulate.py", "test_tscheck_nfce_invoice.py"}
groups = [
    ("replica", [str(p) for p in files if p.name not in special], os.environ["MONGO_URL"]),
    ("standalone", ["tests/test_catalog_standalone.py"], "mongodb://127.0.0.1:27018"),
    ("restore", ["tests/test_restore_disposable_integration.py"], os.environ["MONGO_URL"]),
]
failed = False
for name, paths, mongo in groups:
    env = dict(os.environ, MONGO_URL=mongo, DB_NAME="apollo_restore_test_p41_" + name,
               APOLLO_ALLOW_DISPOSABLE_RESTORE="1")
    args = ["python", "-m", "pytest", "-q", "-ra", "-n", "0",
            "--junitxml=" + str(evidence / (name + ".xml")), *paths]
    with (evidence / (name + ".log")).open("w") as log:
        result = subprocess.run(args, env=env, stdout=log, stderr=subprocess.STDOUT)
    print((evidence / (name + ".log")).read_text(), flush=True)
    failed |= result.returncode != 0
raise SystemExit(1 if failed else 0)
