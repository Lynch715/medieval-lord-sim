# app.js 拆分 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 3853 行的 `app.js` 拆成七个零模块语法的纯脚本，浏览器、Node 测试与单文件打包三个消费者按同一顺序拼接，行为逐字节不变。

**Architecture:** `sources.json` 是文件清单的唯一真相源。`build_single.py` 与 `tests/_game.mjs` 都读它；`index.html` 手写 script 标签但由结构测试断言与清单一致。测试加载器用 `vm` 求值拼接结果，因此测试跑的正是浏览器看到的那份代码。

**Tech Stack:** 纯 ES2022 经典脚本（无构建、无框架），Node 内置 `assert` 与 `vm`，`python3 build_single.py` 打包。

**⚠️ 这是一次纯搬运，一行逻辑都不改。** 验收标准是五套测试输出与拆分前**逐字节相同**。

**基线：** HEAD 为 `533cd48`（拆分设计文档），五套测试全绿。

---

## 两个会静默炸掉拆分的加载期依赖

动手前必须知道这两件事，它们不会在 `node --check` 里暴露：

**1. `app.js:963-964` 在加载期就调用 `normalizeEventDefinitions(WORLD_EVENTS)`。**
这个函数与它的三个辅助函数（`normalizeEventLanguage` / `collapseEventMetrics` / `normalizeEventChanges`）都在 911-962 行。如果把事件数据和这两行调用一起放进 `01-data.js`，就必须把四个函数也搬进去，破坏「零函数」规则。

**处理方式：** `WORLD_EVENTS` / `NPC_ARCS` 的**数据**留在 `01-data.js`；四个 normalize 函数**和那两行调用**一起移到 `02-core.js`。01 先加载定义好数据，02 再定义函数并立即对其规范化，顺序天然正确。

**2. 顶层 `const` 不提升，函数声明提升。**
`01-data.js` 里有六处加载期就执行的语句（`EXTRA_TERRITORIES` 展开、`RESTORATION_OWNERS` 覆盖、邻接对称化、`MINOR_LORD_ROWS.forEach`、`KNIGHT_LIEGE` 填充、`KNIGHT_DEFS` 构造）。它们全部只依赖同文件内更早的数据，因此**只要保持数据之间的现有相对顺序**就是安全的。不要为了「归类好看」重排数据块。

---

### Task 1: 立基线指纹

**Files:**
- 无（只产出 `/tmp` 下的基线快照）

- [ ] **Step 1: 跑五套测试并存盘**

```bash
cd "/Users/ruis/Claude/Projects/html游戏/游戏库/03-模拟经营/模拟中世纪领主"
mkdir -p /tmp/split-baseline
node tests/structure.test.mjs        > /tmp/split-baseline/structure.txt 2>&1
node tests/lords.test.mjs            > /tmp/split-baseline/lords.txt 2>&1
node tests/migration.test.mjs        > /tmp/split-baseline/migration.txt 2>&1
node tests/clock.test.mjs            > /tmp/split-baseline/clock.txt 2>&1
node tests/campaign-balance.sim.mjs  > /tmp/split-baseline/balance.txt 2>&1
wc -l app.js > /tmp/split-baseline/lines.txt
```

- [ ] **Step 2: 确认基线全绿**

```bash
grep -l "AssertionError\|Error" /tmp/split-baseline/*.txt || echo "基线全绿"
cat /tmp/split-baseline/balance.txt | tail -20
```

Expected: 输出 `基线全绿`，且 balance.txt 里能看到结局分布。

若基线本身就红，**停下来报告**——拆分不能在红灯上开始。

---

### Task 2: 先让加载器跑起来，再动代码

**Files:**
- Create: `sources.json`
- Create: `tests/_game.mjs`
- Modify: `tests/structure.test.mjs`、`tests/lords.test.mjs`、`tests/migration.test.mjs`、`tests/clock.test.mjs`、`tests/campaign-balance.sim.mjs`

这一步**先不拆代码**，只把测试切换到新加载器，清单里暂时只有 `app.js`。这样「加载器是否可用」与「拆分是否保行为」两件事被分开验证——加载器出问题时不会被误判成拆分错误。

- [ ] **Step 1: 建清单（暂时只有一个文件）**

创建 `sources.json`：

```json
["app.js"]
```

- [ ] **Step 2: 建测试加载器**

创建 `tests/_game.mjs`：

```js
// 用与浏览器完全相同的拼接顺序求值源码。
// 测试因此跑的正是浏览器看到的那份代码，而不是另一套加载路径。
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const sources = JSON.parse(readFileSync(new URL("sources.json", root), "utf8"));
const source = sources.map(file => readFileSync(new URL(file, root), "utf8")).join("\n");

const context = vm.createContext({
  module: { exports: {} },
  console, Date, Math, JSON, Object, Array, String, Number, Boolean,
  Set, Map, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat
});
new vm.Script(source, { filename: "game-bundle.js" }).runInContext(context);

export default context.module.exports;
export const bundledSource = source;
export const sourceFiles = sources;
```

- [ ] **Step 3: 五个测试文件改用加载器**

每个文件把这两行：

```js
const require = createRequire(import.meta.url);
const game = require("../app.js");
```

替换为：

```js
import game from "./_game.mjs";
```

并删除现在不再需要的 `import { createRequire } from "node:module";`。

`tests/structure.test.mjs` 还读了源码文本做术语黑名单检查：

```js
const source = readFileSync(fileURLToPath(new URL("../app.js", import.meta.url)), "utf8");
```

改为从加载器拿拼接结果（这样拆分后仍然检查全部源码）：

```js
import game, { bundledSource } from "./_game.mjs";
const source = bundledSource;
```

并删掉随之无用的 `fileURLToPath` 导入（`readFileSync` 仍被 html/css 两行使用，保留）。

- [ ] **Step 4: 验证加载器可用且行为未变**

```bash
node tests/structure.test.mjs && node tests/lords.test.mjs && node tests/migration.test.mjs && node tests/clock.test.mjs && node tests/campaign-balance.sim.mjs > /tmp/after-loader-balance.txt
diff /tmp/split-baseline/balance.txt /tmp/after-loader-balance.txt && echo "加载器行为一致"
```

Expected: 五套全过，`diff` 无输出，打印 `加载器行为一致`。

若 `vm` 上下文缺了某个全局（例如 `Set`），会报 `X is not defined`——按报错补进 `vm.createContext` 的白名单，不要改业务代码。

- [ ] **Step 5: 提交**

```bash
git add sources.json tests/
git commit -m "拆分准备：引入 sources.json 与 vm 测试加载器"
```

---

### Task 3: 执行拆分

**Files:**
- Create: `src/01-data.js` 至 `src/07-exports.js`
- Delete: `app.js`
- Modify: `sources.json`

- [ ] **Step 1: 按清单切分**

**数据与函数在 app.js 里是交错的**，不能顺序切一刀。实测的真实布局：

```
  3-300   数据（含 KNIGHT_DEFS）
301-350   函数（骑士与指挥官查询）
351-355   数据（STAT_LABELS / OFFICER_STAT_KEYS）
356-767   函数（时钟、调度器、格式化、科技、开城、任务队列）
768-806   数据（BUILDINGS / PLANS / UNIT_DEFS / UNIT_DISPLAY_HINTS）
807-810   函数（unitDisplayHint）
811-910   数据（MAP_POINTS / MAP_LINKS / PROLOGUE / WORLD_EVENTS / NPC_ARCS）
911-965   函数（事件规范化 + 两行加载期调用）
966-991   数据（CREST_PATHS / GLYPH_PATHS）
992+      运行时
```

所以 `01-data.js` 由**五段不连续的数据区**拼成，`02-core.js` 由**五段函数区**拼成。

把下面的脚本存为 `split.py` 后执行（用锚点定位而非写死行号，脚本会自校验每个锚点唯一）：

```python
from pathlib import Path
lines = Path("app.js").read_text(encoding="utf-8").splitlines(keepends=True)

def at(prefix):
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if len(hits) != 1:
        raise SystemExit(f"锚点不唯一或缺失：{prefix} -> {[h+1 for h in hits]}")
    return hits[0]

KEYS = ["const SAVE_KEY", "function createKnightRoster", "const STAT_LABELS", "function makeClock",
        "const BUILDING_MAX_LEVEL", "function unitDisplayHint", "const MAP_POINTS",
        "function normalizeEventLanguage", "const CREST_PATHS", "let S = null;",
        "function lordAt(", "function battleEstimate(", "function createInitialState(",
        "function renderTop(", 'if (typeof module !== "undefined"']
M = {k: at(k) for k in KEYS}

def seg(a, b):
    return lines[M[a]:M[b]]

PLAN = [
  # 五段数据区，保持彼此的现有相对顺序 —— 加载期的六处展开依赖它
  ("01-data.js",
   seg("const SAVE_KEY", "function createKnightRoster")
   + seg("const STAT_LABELS", "function makeClock")
   + seg("const BUILDING_MAX_LEVEL", "function unitDisplayHint")
   + seg("const MAP_POINTS", "function normalizeEventLanguage")
   + seg("const CREST_PATHS", "let S = null;"),
   "纯数据表。不得出现函数声明；五段数据区的相对顺序不可调整，加载期的展开依赖它。"),
  # 五段函数区 + 运行时全局。事件规范化的两行调用在此执行，此时 01 的数据已就位
  ("02-core.js",
   seg("let S = null;", "function lordAt(")
   + seg("function createKnightRoster", "const STAT_LABELS")
   + seg("function makeClock", "const BUILDING_MAX_LEVEL")
   + seg("function unitDisplayHint", "const MAP_POINTS")
   + seg("function normalizeEventLanguage", "const CREST_PATHS"),
   "运行时全局与工具、时钟与调度器、任务队列、科技与开城条件、事件表规范化。"),
  ("03-domain.js", seg("function lordAt(", "function battleEstimate("),
   "领主与骑士、三条收服路线、经济产出、建筑与征募。"),
  ("04-war.js", seg("function battleEstimate(", "function createInitialState("),
   "战斗会话、行军、军团、AI 势力与战后处置。"),
  ("05-state.js", seg("function createInitialState(", "function renderTop("),
   "建档、存档迁移、自检、事件与决策视图。"),
  ("06-ui.js", seg("function renderTop(", 'if (typeof module !== "undefined"'),
   "全部渲染、DOM 绑定与启动流程。"),
  ("07-exports.js", lines[M['if (typeof module !== "undefined"']:],
   "仅 module.exports，供 Node 测试使用。"),
]

Path("src").mkdir(exist_ok=True)
total = 0
for name, chunk, note in PLAN:
    body = "".join(chunk).replace('"use strict";\n\n', "", 1)
    Path("src/" + name).write_text('"use strict";\n\n// ' + note + "\n\n" + body, encoding="utf-8")
    n = body.count("\n")
    total += n
    print("  src/%-16s %5d 行" % (name, n))
print("  合计 %d 行（原 app.js %d 行）" % (total, len(lines)))
```

Run: `python3 split.py && rm split.py`

- [ ] **Step 2: 确认切分结果**

```bash
grep -c "^function " src/01-data.js
head -1 src/*.js
```

Expected: 第一条输出 `0`（数据文件零函数）；第二条七个文件首行都是 `"use strict";`

合计行数应与 `app.js` 的 3853 接近——差值只来自被剥离的一条 `"use strict"` 与新增的七行文件头注释。若差值超过 20 行，说明有块被漏搬或重复搬运，**停下来查**。

- [ ] **Step 3: 更新清单并删除 app.js**

```bash
cat > sources.json <<'EOF'
[
  "src/01-data.js",
  "src/02-core.js",
  "src/03-domain.js",
  "src/04-war.js",
  "src/05-state.js",
  "src/06-ui.js",
  "src/07-exports.js"
]
EOF
git rm --cached app.js >/dev/null && rm app.js
```

- [ ] **Step 4: 逐文件语法检查**

```bash
for f in src/*.js; do node --check "$f" || echo "语法错误：$f"; done
```

Expected: 无输出。

单文件 `node --check` 可能对「引用了别的文件里的标识符」报错吗？不会——`--check` 只做语法解析，不做标识符解析。

- [ ] **Step 5: 跑五套测试并逐字节比对**

```bash
node tests/structure.test.mjs        > /tmp/after-structure.txt 2>&1
node tests/lords.test.mjs            > /tmp/after-lords.txt 2>&1
node tests/migration.test.mjs        > /tmp/after-migration.txt 2>&1
node tests/clock.test.mjs            > /tmp/after-clock.txt 2>&1
node tests/campaign-balance.sim.mjs  > /tmp/after-balance.txt 2>&1
for n in structure lords migration clock balance; do
  diff -q /tmp/split-baseline/$n.txt /tmp/after-$n.txt && echo "$n 一致" || echo "!!! $n 有差异"
done
```

Expected: 五行全部输出「一致」。

**任何一行报「有差异」都必须停下来查**，不要往下走。常见原因：
- `Cannot access 'X' before initialization` —— 某个加载期执行的语句被排到了它依赖的数据之前
- 平衡模拟数字变了 —— 某段代码被漏搬或重复搬运
- `X is not defined` —— 某个块被切掉了

排查手段：`node -e "require('./src/01-data.js')"` 之类逐文件加载会因缺少依赖而失败，改用 `node tests/_game.mjs` 触发完整拼接求值看第一个报错在哪。

- [ ] **Step 6: 提交**

```bash
git add -A src sources.json
git commit -m "拆分：app.js 切分为七个纯脚本"
```

---

### Task 4: 接上浏览器与打包，并锁死清单漂移

**Files:**
- Modify: `index.html`
- Modify: `build_single.py`
- Modify: `tests/structure.test.mjs`

- [ ] **Step 1: 写防漂移断言（先失败）**

追加到 `tests/structure.test.mjs`（`console.log("structure tests passed");` 之前）：

```js
// 文件清单出现在三处（sources.json / index.html / 打包脚本），必须完全一致。
// 这正是本项目反复吃亏的「多处手工同步」，用断言钉死。
import { sourceFiles } from "./_game.mjs";
const scriptSrcs = [...html.matchAll(/<script src="([^"?]+)[^"]*"><\/script>/g)].map(m => m[1]);
assert.deepEqual(scriptSrcs, sourceFiles,
  `index.html 的 script 标签必须与 sources.json 完全一致（顺序也要）。\n  标签：${scriptSrcs.join(", ")}\n  清单：${sourceFiles.join(", ")}`);

const buildScript = readFileSync(fileURLToPath(new URL("../build_single.py", import.meta.url)), "utf8");
assert.ok(buildScript.includes("sources.json"), "build_single.py 必须从 sources.json 读取文件清单，不得自己写死列表");
```

注意 `structure.test.mjs` 顶部的 import 要合并为一行：`import game, { bundledSource, sourceFiles } from "./_game.mjs";`

- [ ] **Step 2: 运行确认失败**

Run: `node tests/structure.test.mjs`
Expected: FAIL — index.html 仍然只有一个 `app.js` 标签

- [ ] **Step 3: 改 index.html**

把这一行：

```html
  <script src="app.js?v=14"></script>
```

替换为七行（顺序必须与 `sources.json` 一致）：

```html
  <script src="src/01-data.js?v=15"></script>
  <script src="src/02-core.js?v=15"></script>
  <script src="src/03-domain.js?v=15"></script>
  <script src="src/04-war.js?v=15"></script>
  <script src="src/05-state.js?v=15"></script>
  <script src="src/06-ui.js?v=15"></script>
  <script src="src/07-exports.js?v=15"></script>
```

同时把 `<link rel="stylesheet" href="style.css?v=14">` 的版本号也改成 `v=15`，保持缓存串一致。

- [ ] **Step 4: 改 build_single.py**

把 `build()` 里读取与替换 JS 的部分改为按清单拼接：

```python
def build() -> Path:
    html = SOURCE.read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    # 文件清单以 sources.json 为唯一真相源，与浏览器和测试加载器共用同一份顺序
    sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    js = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in sources)

    html = re.sub(
        r'<link rel="stylesheet" href="style\.css\?v=\d+">',
        f"<style>\n{css}\n</style>",
        html,
        count=1,
    )
    # 七个 script 标签整体替换为一个内联块
    html = re.sub(
        r'(?:\s*<script src="src/[^"]+"></script>)+',
        lambda _match: f"\n  <script>\n{js}\n</script>",
        html,
        count=1,
    )
    html = re.sub(r"assets/[a-z0-9-]+\.(?:webp|png)", data_uri, html)
    OUTPUT.write_text(html, encoding="utf-8")
    return OUTPUT
```

并在文件顶部的 import 区加上 `import json`。

- [ ] **Step 5: 验证三条路径都通**

```bash
node tests/structure.test.mjs && echo "断言通过"
python3 build_single.py
python3 - <<'PY'
from pathlib import Path
html = Path("模拟中世纪领主-单文件版.html").read_text(encoding="utf-8")
assert "<script src=" not in html, "单文件版不应残留外部 script 引用"
assert html.count("<script>") >= 1, "单文件版应内联脚本"
assert "createInitialState" in html, "单文件版应包含游戏逻辑"
print("单文件版检查通过，大小", len(html) // 1024, "KB")
PY
```

Expected: 断言通过、打包成功、单文件检查通过。

- [ ] **Step 6: 提交**

```bash
git add index.html build_single.py tests/structure.test.mjs
git commit -m "拆分：index.html 与打包脚本改用 sources.json，并断言三处清单一致"
```

---

### Task 5: 浏览器实跑与文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 浏览器验证**

```bash
python3 -m http.server 8788
```

开新档逐项确认：
- 六个页签均能渲染且无控制台报错（拆分最可能的失败形态就是某个文件没被加载，导致 `X is not defined`）
- 顶栏「距加冕」倒计时正常走动，资源持续增长
- 将领页三条路线状态正常显示
- 地图能点开叛臣领地并看到守将与说服阻力

**同时打开单文件版**（`open 模拟中世纪领主-单文件版.html`）跑一遍同样的检查——它走的是拼接路径，与多标签路径可能在严格模式上有差异，必须分别验证。

- [ ] **Step 2: 更新 README 的检查命令**

把「检查与封装」段替换为：

```bash
for f in src/*.js; do node --check "$f"; done
node tests/structure.test.mjs
node tests/lords.test.mjs
node tests/migration.test.mjs
node tests/clock.test.mjs
node tests/campaign-balance.sim.mjs
python3 build_single.py
```

并在其后补一段源码结构说明：

```markdown
## 源码结构

源码按依赖方向拆成七个纯脚本，浏览器、测试与打包共用 `sources.json` 里的同一份顺序：

| 文件 | 职责 |
|---|---|
| `src/01-data.js` | 纯数据表：时间、科技、地图、领主名册、骑士、建筑、兵种、事件、图标。不含函数 |
| `src/02-core.js` | 运行时全局、工具函数、时钟与调度器、任务队列 |
| `src/03-domain.js` | 领主与骑士、三条收服路线、经济产出、建筑与科技 |
| `src/04-war.js` | 战斗、行军、军团、AI 势力 |
| `src/05-state.js` | 建档、存档迁移、自检、事件与决策 |
| `src/06-ui.js` | 渲染、DOM 绑定与启动 |
| `src/07-exports.js` | 仅 `module.exports`，供 Node 测试使用 |

这些文件是**零模块语法的经典脚本**，没有 `import`/`export`，靠加载顺序共享作用域。改动文件清单时只改 `sources.json` 与 `index.html`，结构测试会断言两者一致。
```

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "拆分：README 补上源码结构与新的检查命令"
```

---

## 完成标准

- 五套测试输出与 `/tmp/split-baseline/` 逐字节相同
- `src/01-data.js` 中 `grep -c "^function "` 输出 `0`
- 每个 `src/*.js` 首行都是 `"use strict";`
- `index.html` 的 script 标签与 `sources.json` 完全一致（由结构测试断言）
- `build_single.py` 从 `sources.json` 读清单，不自己写死列表
- 多标签版与单文件版在浏览器里都无控制台报错
- 仓库中不再有 `app.js`

## 移交给 P3 的好处

- 地图与领主数据全部集中在 `src/01-data.js`，P3 的地图分层只改这一个文件
- AI 逻辑集中在 `src/04-war.js`，P3 的 AI 决策改造不会碰到渲染或存档
- 新增周期系统仍然只需往 `src/01-data.js` 的 `TIMER_DEFS` 加一行，再在 `src/02-core.js` 的 `fireTimer` 加一个分支
