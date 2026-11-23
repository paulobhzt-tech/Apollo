#!/usr/bin/env python3
"""Switch an existing local release pointer after verifying both retained packages."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

VERIFIER = Path(__file__).resolve().parents[2] / "frontend/scripts/verify-build.mjs"


def switch(root, current, target, current_manifest, target_manifest, rollback):
    for commit in (current, target):
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            raise ValueError("Expected a full release SHA")
    if current == target:
        raise ValueError("Current and target must be different")
    root = root.resolve(strict=True)
    live = root / "live"
    with (root / ".switch.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not live.is_symlink() or os.readlink(live) != current:
            raise ValueError("Active release changed or does not use the expected relative pointer")
        packages = [(target, target_manifest)] if rollback else [(current, current_manifest), (target, target_manifest)]
        for commit, manifest in packages:
            tree = root / commit
            if tree.is_symlink() or not tree.is_dir():
                raise ValueError("Release tree must be a directory under the release root")
            manifest = manifest.resolve(strict=True)
            if manifest.is_relative_to(root):
                raise ValueError("Audited manifests must be stored outside the release root")
            subprocess.run(
                ["node", str(VERIFIER), str(tree)], check=True,
                env={**os.environ, "EXPECTED_COMMIT": commit, "EXPECTED_MANIFEST": str(manifest)},
            )
        with tempfile.TemporaryDirectory(prefix=".switch-", dir=root) as temporary:
            pointer = Path(temporary) / "live"
            pointer.symlink_to(target)
            os.replace(pointer, live)
        print(json.dumps({"previous": current, "active": target, "rollback": rollback}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("root", "current", "target", "current_manifest", "target_manifest"):
        parser.add_argument(name, type=Path if name in ("root", "current_manifest", "target_manifest") else str)
    parser.add_argument("--rollback", action="store_true", help="Verify the return target even when the current release is damaged")
    try:
        switch(**vars(parser.parse_args()))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Release switch refused: {error}\n")
