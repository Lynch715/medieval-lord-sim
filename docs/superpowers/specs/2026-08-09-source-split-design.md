# app.js 拆分 · 设计文档

日期：2026-08-09
状态：已确认，待实现

## 一句话

把 3853 行的 `app.js` 按依赖方向拆成七个纯脚本，在不引入任何构建步骤的前提下同时满足浏览器、Node 测试与单文件打包三个消费者。

## 为什么现在拆

数据层刚在 P1/P2 两轮里彻底稳定下来，而 P3 的地图分层与 AI 改造会大改数据层。此刻拆分，后续改动的收益最大；再往后拖，等于在一个近 4000 行的文件里做地图重构。

`app.js` 已经到了单次编辑不可靠的规模：本轮就出现过整块 `cut` 误删相邻函数（`MAP_POINTS`、`fireTimer`）的事故各一次。

## 约束

四个必须同时满足的硬约束：

1. **无构建步骤** —— 项目的既有底线，改源码后刷新页面即可看到效果
2. **浏览器直接加载** —— `index.html` 用 `<script>` 标签，不用 `type="module"`
3. **Node 测试可导入** —— 四个测试文件需要拿到导出的 API
4. **`build_single.py` 仍能打出单文件版** —— 把所有源码内联进一个 HTML

ES 模块能满足 1–3，但第 4 条会碎：单文件里的 `<script type="module">` 无法 `import` 相对路径，除非引入打包器，而那违背第 1 条。

## 模块策略：有序经典脚本

`src/*.js` 全部是**零模块语法的纯脚本**——没有 `import`，没有 `export`，没有 IIFE 包裹。三个消费者各自按同一顺序拼接：

- **浏览器**：`index.html` 里按顺序排列 `<script src="src/xx.js">`
- **打包**：`build_single.py` 按顺序读文件、拼接、内联进一个 `<script>`
- **测试**：`tests/_game.mjs` 按顺序读文件、拼接、在 `vm` 里求值，导出结果

经典脚本的顶层 `const`/`function` 进入共享的全局词法环境，后加载的脚本可以直接引用先加载的，因此拼接语义与浏览器多标签加载语义一致。

**业务代码里因此没有任何模块样板。** 这是这个方案最大的好处：拆分是纯粹的物理切割，读代码的人不需要理解任何加载机制。

## 文件边界

按**依赖方向**切，不按代码类型切。规则：前面的文件不得引用后面的文件。

| 序号 | 文件 | 约行数 | 职责 |
|---|---|---|---|
| 01 | `src/01-data.js` | 1000 | 纯数据表：`TIME_CONFIG`、`TIMER_DEFS`、`TECH_DEFS`、`SEASONS`、`FACTIONS`、`TERRITORY_DEFS`（含邻接对称化）、`LORD_DEFS`、`LORD_ARCHETYPES`、`MINOR_LORD_ROWS`、`SEAT_TO_LORD`、`KNIGHT_*`、`BUILDINGS`、`UNIT_DEFS`、`PLANS`、`WORLD_EVENTS`、`NPC_ARCS`、`CREST_PATHS`、`GLYPH_PATHS`、各类常量 |
| 02 | `src/02-core.js` | 520 | 运行时全局与工具（`clamp`/`esc`/`clone`）、时钟与调度器、任务队列、科技与开城条件、骑士与指挥官查询、事件表规范化 |
| 03 | `src/03-domain.js` | 1540 | 领主与骑士的归属查询、三条收服路线、经济与产出、建筑、征募 |
| 04 | `src/04-war.js` | 650 | 战斗会话、行军、军团、AI 势力、战后处置 |
| 05 | `src/05-state.js` | 600 | 建档、存档迁移 v1→v6、`selfCheck`、事件与决策视图 |
| 06 | `src/06-ui.js` | 660 | 全部 `render*` / `show*` / DOM 绑定 / `boot()` |
| 07 | `src/07-exports.js` | 25 | 仅 `module.exports` 块 |

**`01-data.js` 必须零函数。** 数据表因此可以被随意读取和断言，不必担心副作用；P3 改地图与领主时只动这一个文件。唯一的例外是几段加载期展开（邻接对称化、附庸生成、骑士归属反查）——它们是数据的一部分（把声明补全），不是逻辑。

**实际切分时发现数据与函数在 app.js 里是交错的**（数据区分五段、函数区分五段），因此 01 与 02 各由五段不连续区间拼成，而科技与开城条件这类原本预期在 03 的函数因为夹在核心函数区里，实际落到了 02。上表已按实测结果修正。

`app.js` 本身在拆分后删除。

## 两个容易漏掉的细节

**每个文件都要写 `"use strict";`。** 现在 `app.js` 顶部有一条，但严格模式在经典脚本里是**逐脚本**生效的。拆成七个 `<script>` 后，只有第一个是严格模式，其余六个在浏览器里会退回宽松模式——而拼接出的单文件版和测试加载器却是全程严格的。三条路径的语义就此分叉，且只在浏览器里静默出错。

修法是每个 `src/*.js` 顶部都加。拼接后只有第一条是指令序言，其余六条退化为无副作用的字符串字面量，不影响任何行为。

**`createKnightRoster` 不能留在 `01-data.js`。** 它调用 `clone()`，而 `clone` 属于工具函数、住在 `02-core.js`。数据表本身（`KNIGHT_NAMES` / `KNIGHT_LIEGE` / `KNIGHT_DEFS`）留在 01，这个构造函数移到 02。这正是「01 必须零函数」这条规则要挡住的情况。

## 防漂移

文件清单会出现在三处：`index.html` 的 script 标签、`build_single.py`、测试加载器。这正是这个项目反复吃亏的那类「多处手工同步」问题。

用**一份清单加一条断言**锁死：

```json
// sources.json —— 唯一真相源，按加载顺序列出
["src/01-data.js", "src/02-core.js", "src/03-domain.js",
 "src/04-war.js", "src/05-state.js", "src/06-ui.js", "src/07-exports.js"]
```

`build_single.py` 与 `tests/_game.mjs` 都从它读取。`index.html` 仍然手写 script 标签（保持可直接打开），但 `tests/structure.test.mjs` 断言标签的顺序与内容必须与 `sources.json` 完全一致——少一个、多一个、顺序错了都会红。

## 测试加载器

```js
// tests/_game.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sources = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8"));
const source = sources.map(f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
const context = vm.createContext({ module: { exports: {} }, console, Date, Math, JSON });
new vm.Script(source).runInContext(context);
export default context.module.exports;
```

关键点：**测试求值的正是浏览器看到的那份拼接结果**，而不是另一套加载路径。加载器本身如果拼错顺序，所有测试会一起红。

四个测试文件各改一行：`const game = require("../app.js")` → `import game from "./_game.mjs"`。

`node --check app.js` 变成对每个 `src/*.js` 逐个检查，写进 README 的检查命令。

## 验收：零逻辑改动，输出逐字节比对

**这是一次纯搬运，一行逻辑都不改。**

拆分前先跑一次基线并把输出存盘：

```bash
node tests/structure.test.mjs > /tmp/before-structure.txt
node tests/lords.test.mjs      > /tmp/before-lords.txt
node tests/migration.test.mjs  > /tmp/before-migration.txt
node tests/clock.test.mjs      > /tmp/before-clock.txt
node tests/campaign-balance.sim.mjs > /tmp/before-balance.txt
```

拆分后重跑并 `diff`。五份输出必须**逐字节相同**——平衡模拟的结局分布、三条路线使用量、统一中位数全部一致。任何数字变化都说明搬漏了、搬重了或顺序错了。

这比人眼 review 3853 行搬运可靠得多。

## 风险与缓解

- **搬运顺序错误导致「引用了尚未定义的常量」**：函数声明会提升，但顶层 `const` 不会。若 `02-core.js` 在求值期就读取 `01-data.js` 的常量则没问题（前者在后），反向则会抛 `Cannot access before initialization`。缓解：严格按依赖方向排序，且 `node --check` 加载全套后跑一次 `createInitialState` 冒烟测试。
- **漏搬或重复搬运**：`diff` 逐字节比对会立刻暴露；另加一条断言，检查拼接后的源码行数与拆分前 `app.js` 的行数之差在合理范围内（允许因文件头注释而略增）。
- **`index.html` 与 `sources.json` 漂移**：由结构测试断言锁死。

## 不做的事

- 不改任何游戏逻辑、数值或文案
- 不进一步细分（`04-war.js` 650 行仍偏大，但再切会破坏「战斗会话」的内聚性，留待其真正妨碍编辑时再说）
- 不引入 TypeScript、打包器、依赖管理或任何构建工具
