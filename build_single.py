from __future__ import annotations

import base64
import json
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
    # 文件清单以 sources.json 为唯一真相源，与浏览器、测试加载器共用同一份顺序。
    # 这里不再自己写死列表 —— 三处手工同步正是这个项目反复吃亏的地方。
    sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    js = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in sources)

    html = re.sub(
        r'<link rel="stylesheet" href="style\.css\?v=\d+">',
        f"<style>\n{css}\n</style>",
        html,
        count=1,
    )
    # 连续的七个 script 标签整体替换成一个内联块
    tags = re.compile(r'(?:[ \t]*<script src="src/[^"]+"></script>\n?)+')
    if not tags.search(html):
        raise SystemExit("index.html 里找不到 src/*.js 的 script 标签，打包中止")
    html = tags.sub(lambda _match: f"  <script>\n{js}\n</script>\n", html, count=1)
    html = re.sub(r"assets/[a-z0-9-]+\.(?:webp|png)", data_uri, html)
    OUTPUT.write_text(html, encoding="utf-8")
    return OUTPUT


if __name__ == "__main__":
    built = build()
    print(f"built {built} ({built.stat().st_size} bytes)")
