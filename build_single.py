from __future__ import annotations

import base64
import json
import mimetypes
import re
from pathlib import Path


# 有的系统没有 /etc/mime.types，guess_type 会认不出 webp；显式注册保证跨机器结果一致
mimetypes.add_type("image/webp", ".webp")

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "index.html"
OUTPUT = ROOT / "模拟中世纪领主-单文件版.html"

# 同一张图在数据表里可能被引用几十次；打包时每张只编码一次，
# JS 里的字符串引用改为查 GAME_ASSETS 表 —— 这是单文件版从 5.7MB 回到实际资源体量的关键。
ASSET_RE = re.compile(r"assets/[a-z0-9.-]+\.(?:webp|png)")


def encode_asset(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f"打包中止：找不到被引用的资源 {relative}")
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

    # 三个消费者引用到的资源并成一份清单，每张图只 base64 一次
    refs = sorted(set(ASSET_RE.findall(html)) | set(ASSET_RE.findall(css)) | set(ASSET_RE.findall(js)))
    assets = {rel: encode_asset(rel) for rel in refs}

    # CSS 无法查 JS 的表：背景图直接内联（当前每张背景在 CSS 里只出现一次，不产生重复）
    css = ASSET_RE.sub(lambda m: assets[m.group(0)], css)

    # JS：把 "assets/x.webp" 字符串字面量改写为查表，源码本身不动
    js = re.sub(
        r'"(assets/[a-z0-9.-]+\.(?:webp|png))"',
        lambda m: f"GAME_ASSETS[{json.dumps(m.group(1), ensure_ascii=False)}]",
        js,
    )

    # HTML 里的静态 <img>：src 改成 data-asset，由内联脚本开头统一回填。
    # 脚本块在 </body> 前，执行时这些 img 都已存在。
    html = re.sub(r'src="(assets/[a-z0-9.-]+\.(?:webp|png))"', r'data-asset="\1"', html)

    prelude = (
        "var GAME_ASSETS = " + json.dumps(assets, ensure_ascii=False) + ";\n"
        '(function () { "use strict"; var imgs = document.querySelectorAll("img[data-asset]");'
        " for (var i = 0; i < imgs.length; i += 1) {"
        ' imgs[i].src = GAME_ASSETS[imgs[i].getAttribute("data-asset")] || ""; } })();'
    )

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
    html = tags.sub(lambda _match: f"  <script>\n{prelude}\n{js}\n</script>\n", html, count=1)

    OUTPUT.write_text(html, encoding="utf-8")
    return OUTPUT


if __name__ == "__main__":
    built = build()
    print(f"built {built} ({built.stat().st_size} bytes)")
