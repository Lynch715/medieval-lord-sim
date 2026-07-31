from __future__ import annotations

import base64
import mimetypes
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "模拟中世纪领主-单文件版.html"


def data_uri(match: re.Match[str]) -> str:
    relative = match.group(0)
    path = ROOT / relative
    if not path.is_file():
        return relative
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build() -> Path:
    html = SOURCE.read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")

    html = re.sub(
        r'<link rel="stylesheet" href="style\.css\?v=\d+">',
        f"<style>\n{css}\n</style>",
        html,
        count=1,
    )
    html = re.sub(
        r'<script src="app\.js\?v=\d+"></script>',
        f"<script>\n{js}\n</script>",
        html,
        count=1,
    )
    html = re.sub(r"assets/[a-z0-9-]+\.(?:webp|png)", data_uri, html)
    OUTPUT.write_text(html, encoding="utf-8")
    return OUTPUT


if __name__ == "__main__":
    built = build()
    print(f"built {built} ({built.stat().st_size} bytes)")
