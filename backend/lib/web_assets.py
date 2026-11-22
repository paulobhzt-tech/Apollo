from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse


def web_response(root: Path, path: str) -> FileResponse:
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise HTTPException(404)

    # API routers are registered first. A missing API endpoint is still an API error.
    if path == "api" or path.startswith("api/"):
        raise HTTPException(404)
    if target.is_file():
        headers = {"Cache-Control": "no-cache"} if path in {
            "index.html", "build-integrity.json", "manifest.webmanifest", "sw.js",
        } else None
        return FileResponse(target, headers=headers)

    if path == "assets" or path.startswith("assets/") or "." in Path(path).name:
        raise HTTPException(404)
    return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})
