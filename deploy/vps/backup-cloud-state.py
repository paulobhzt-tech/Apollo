"""Write bounded, credential-free status for the optional Apollo backup panel."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

directory, status, *details = sys.argv[1:]
directory = Path(directory)
path = directory / "status.json"
try:
    history = json.loads(path.read_text())
except (OSError, ValueError):
    history = []

entry = {"status": status, "at": datetime.now(timezone.utc).isoformat()}
if status == "verified":
    name, size, checksum = details
    entry.update(name=name, size_bytes=int(size), sha256=checksum)

# Keep the most recent success available even if several consecutive runs fail.
last_success = next((item for item in history if item["status"] == "verified"), None)
history = [entry, *[item for item in history if item["status"] != "running"]][:20]
if last_success and last_success not in history:
    history[-1] = last_success

with NamedTemporaryFile("w", dir=directory, delete=False) as handle:
    temporary = Path(handle.name)
    try:
        json.dump(history, handle)
        handle.close()
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
