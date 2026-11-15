"""Offline read-only audit: python tools/reconcile_backup.py backup.json report.json."""
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bson import json_util
from lib.reconciliation import audit

if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('Use: reconcile_backup.py input.json output.json')
    source=Path(sys.argv[1]);output=Path(sys.argv[2])
    if source.resolve()==output.resolve():raise SystemExit('Input and output must differ')
    if output.exists():raise SystemExit('Output exists; choose a new report path')
    payload=json_util.loads(source.read_text())
    data=payload.get('data',payload)
    if not isinstance(data,dict) or any(not isinstance(v,list) for v in data.values()):
        raise SystemExit('Expected a collection-to-documents mapping')
    output.write_text(json.dumps(audit(data),ensure_ascii=False,indent=2)+'\n')
