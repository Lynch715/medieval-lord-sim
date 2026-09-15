"use strict";

// 纯数据表：时间、势力、领地、领主、骑士、建筑、兵种、地图、事件、纹章。
// 不得出现函数声明。五段数据区的相对顺序不可调整 —— 加载期的展开（邻接对称化、
// 附庸生成、骑士归属反查）依赖它。

const SAVE_KEY = "iron-crown-lord-save-v1";
const VERSION = 8;
// 加冕记在游戏时间（elapsedMs）上而非真实时间，这样暂停与离线都不会让公爵偷跑。
const CORONATION_AT_MS = 48 * 5 * 60 * 1000;      // 12 游戏年
const CORONATION_DELAY_MS = 20 * 60 * 1000;       // 每拿下一块公爵直辖地推迟 20 分钟
const TIME_CONFIG = {
  seasonDurationMs: 5 * 60 * 1000,
  logicTickMs: 1000,
  uiTickMs: 250,
  // 在线单次补算的上限。关页离线已经完全冻结（见 catchUpOffline），这里只兜底
  // 一种情况：页面仍「可见」但被浏览器节流（窗口被遮挡时可降到 1 次/分钟）。
  // 一季是合理上限 —— 这也正是原注释一直写的意图，只是当初值写成了 2 小时，
  // 与注释差了 24 倍，玩家关页过一夜就被补掉 6 个游戏年。
  maxCatchUpMs: 5 * 60 * 1000
};

// 每个周期性系统有自己的节奏，不再全部挤在换季那一刻。
// drift（守军与稳定度慢漂移）属 P1b 连续化那批，此处先不加。
const TIMER_DEFS = {
  season:  { intervalMs: 5 * 60 * 1000, offline: true },
  aiWolf:  { intervalMs: 60 * 1000, faction: "wolf", offline: false },
  aiRiver: { intervalMs: 75 * 1000, faction: "river", offline: false },
  aiCrown: { intervalMs: 90 * 1000, faction: "crown", offline: false },
  events:  { intervalMs: 120 * 1000, offline: false },
  drift:   { intervalMs: 5 * 1000, offline: true }
};

const TECH_DEFAULTS = {
  agriculture: { level: 0, completed: [], levels: {} },
  military: { level: 0, completed: [], levels: {} },
  administration: { level: 0, completed: [], levels: {} },
  commerce: { level: 0, completed: [], levels: {} },
  siege: { level: 0, completed: [], levels: {} }
};

const TECH_MAX_LEVEL = 3;

const JOB_CONFIG = {
  BUILD: { durationMs: 30 * 1000, label: "建设" },
  RECRUIT: { durationMs: 20 * 1000, label: "训练" },
  OFFICER_RECRUIT: { durationMs: 35 * 1000, label: "招募领主" },
  KNIGHT_RECRUIT: { durationMs: 25 * 1000, label: "招募骑士" },
  RESEARCH: { durationMs: 45 * 1000, label: "研究" },
  MARCH: { durationMs: 40 * 1000, label: "行军" },
  RECOVER: { durationMs: 90 * 1000, label: "整补" }
};

const TECH_DEFS = {
  agriculture: [
    { id: "heavy_plow", name: "重犁", desc: "所有领地粮食产出 +8%。", cost: { knowledge: 10, gold: 18 }, requires: [] },
    { id: "crop_rotation", name: "轮作", desc: "所有领地粮食产出再提高 10%。", cost: { knowledge: 18, gold: 28 }, requires: ["heavy_plow"] },
    { id: "irrigation", name: "水渠灌溉", desc: "春夏粮食流量提高，旱情影响降低。", cost: { knowledge: 26, gold: 40 }, requires: ["crop_rotation"] },
    { id: "seed_selection", name: "选种法", desc: "所有农田建筑的粮食加成提高。", cost: { knowledge: 36, gold: 56 }, requires: ["irrigation"] },
    { id: "winter_storage", name: "冬储法", desc: "冬季粮食产量提高，仓储损耗进一步降低。", cost: { knowledge: 48, gold: 72 }, requires: ["seed_selection"] }
  ],
  military: [
    { id: "refined_iron", name: "精炼铁器", desc: "解锁披甲骑士、重步兵，并提升重甲兵种的攻击、防御和生命。", cost: { knowledge: 10, gold: 22 }, requires: [] },
    { id: "longbow", name: "长弓", desc: "解锁弓手装备升级，弓箭手征募量提高。", cost: { knowledge: 18, gold: 32 }, requires: ["refined_iron"] },
    { id: "war_engineering", name: "攻城工程", desc: "解锁弩手和王冠谷远征资格；攻城装备会提升破甲兵种。", cost: { knowledge: 24, gold: 45 }, requires: ["longbow"] },
    { id: "field_doctrine", name: "野战条令", desc: "解锁轻骑兵，训练度衰减减半，机动兵种装备升级。", cost: { knowledge: 34, gold: 52 }, requires: ["war_engineering"] },
    { id: "professional_army", name: "常备军制", desc: "所有兵种获得最后一档装备，军队军饷降低，主力军心更稳定。", cost: { knowledge: 46, gold: 70 }, requires: ["field_doctrine"] }
  ],
  administration: [
    { id: "tax_registry", name: "税籍", desc: "所有领地金币收入 +8%。", cost: { knowledge: 10, gold: 20 }, requires: [] },
    { id: "relay_roads", name: "驿站道路", desc: "换季时额外获得 2 知识。", cost: { knowledge: 18, gold: 30 }, requires: ["tax_registry"] },
    { id: "census", name: "人口清册", desc: "降低人口粮食消耗，并提高征募上限。", cost: { knowledge: 24, gold: 38 }, requires: ["relay_roads"] },
    { id: "provincial_offices", name: "行省官署", desc: "家臣管理领地时少损失一成收入。", cost: { knowledge: 32, gold: 52 }, requires: ["census"] },
    { id: "law_code", name: "统一法典", desc: "稳定度偏低的领地不再继续流失金币：产出按稳定度 50 托底，每多一阶再抬 10 点。", cost: { knowledge: 42, gold: 68 }, requires: ["provincial_offices"] }
  ],
  commerce: [
    { id: "coinage", name: "统一铸币", desc: "所有领地金币产出 +8%。", cost: { knowledge: 12, gold: 24 }, requires: [] },
    { id: "caravanserai", name: "商旅驿站", desc: "驿道每级额外带回金币。", cost: { knowledge: 22, gold: 36 }, requires: ["coinage"] },
    { id: "trade_guild", name: "商会特许", desc: "市场建筑的金币加成提高。", cost: { knowledge: 30, gold: 48 }, requires: ["caravanserai"] },
    { id: "market_charter", name: "自由市契约", desc: "商路铺开，收买领主的开价降低（每阶 −12%，最多 −30%）。", cost: { knowledge: 40, gold: 62 }, requires: ["trade_guild"] },
    { id: "royal_exchange", name: "王家汇兑", desc: "驿道收益再提高；完成统一时额外获得威望。", cost: { knowledge: 54, gold: 86 }, requires: ["market_charter"] }
  ],
  siege: [
    { id: "siege_ladders", name: "攻城梯", desc: "攻城战第一阶段突破力提高。", cost: { knowledge: 14, gold: 28 }, requires: [] },
    { id: "sappers", name: "坑道工", desc: "城墙与要塞的防御加成降低。", cost: { knowledge: 24, gold: 42 }, requires: ["siege_ladders"] },
    { id: "trebuchet", name: "配重投石机", desc: "解锁大型攻城准备，王冠谷战斗更稳定。", cost: { knowledge: 36, gold: 60 }, requires: ["sappers"] },
    { id: "blockade", name: "围城营", desc: "围城期间敌军守军恢复速度降低。", cost: { knowledge: 48, gold: 78 }, requires: ["trebuchet"] },
    { id: "iron_crown_doctrine", name: "铁冠军令", desc: "完成北境统一所需的最终军事学。", cost: { knowledge: 64, gold: 100 }, requires: ["blockade"] }
  ]
};

const TECH_BRANCH_NAMES = { agriculture: "农业", military: "军事", administration: "行政", commerce: "商贸", siege: "攻城" };

const SEASONS = [
  { id: "spring", name: "春", phase: "春耕", grain: .45, gold: 1, note: "地化了，能下种了。粮仓里的是去年的粮，省着点。" },
  { id: "summer", name: "夏", phase: "备战", grain: .75, gold: 1, note: "路干了，马能跑了。要打仗，夏天打。" },
  // 秋收从 1.55 压到 1.1：原值下一个秋天就能收 +137～+362 粮，冬季那点赤字
  // 随手就补上了，全年净额恒为正且随扩张变大，「囤粮过冬」这个循环完全不存在。
  { id: "autumn", name: "秋", phase: "收获", grain: 1.1, gold: 1.25, note: "收麦子的季节。仓满了，收税的也来了。" },
  { id: "winter", name: "冬", phase: "越冬", grain: .1, gold: .75, note: "地里长不出东西，人和马照样要吃。看紧粮仓。" }
];

// 统治风格：不是开局选项，而是由玩家整局的实际决策累积出来的，只用于结局判定与文案。
const STYLES = {
  oath: { name: "守信", short: "守信" },
  iron: { name: "强硬", short: "强硬" },
  wealth: { name: "经营", short: "经营" }
};

const DIFFICULTIES = {
  standard: { name: "普通", income: 1, enemy: 1.2, winter: 1 },
  hard: { name: "困难", income: .9, enemy: 1.36, winter: 1.18 },
  brutal: { name: "极难", income: .82, enemy: 1.52, winter: 1.38 }
};

const FACTIONS = {
  player: { name: "渡鸦家", color: "#c7a665" },
  wolf: { name: "狼牙氏族", color: "#9c5045" },
  river: { name: "河望领地", color: "#66846f" },
  crown: { name: "摄政公爵", color: "#77879a" },
  neutral: { name: "独立领主", color: "#8f866c" }
};

const AI_FACTION_DEFS = {
  wolf: { capital: "pineford", personality: "aggressive", gold: 72, grain: 150, knowledge: 8 },
  river: { capital: "riverwatch", personality: "trader", gold: 96, grain: 180, knowledge: 12 },
  crown: { capital: "crownvale", personality: "cautious", gold: 130, grain: 220, knowledge: 16 }
};

// 三类领地各有职能，type 不再只是界面上「城堡／附属镇」两个字：
//   核心城堡（castle / capital）—— 控制大区：占住它，同区自有领地产出与稳定都上一个台阶
//   战略要点（fort）        —— 防御投射：本身守军上限高，还抬高相邻自有领地的守军上限
//   附庸城镇（town）        —— 普通的扩张口粮
// 大区加成看着不大，实际收益要连同下面的稳定加成一起算：稳定既直接抬产出
// （产出系数是 .62 + 稳定/265），又是守军自然回复的门槛。两项合起来约一成。
// 定在这个量级是配平出来的：早先给到 .2 时机器人胜率从 35% 一路窜到 61%，
// 「控制大区」会强到让其他决策都不重要。
const REGION_CONTROL_OUTPUT_BONUS = .05;
const REGION_CONTROL_STABILITY_BONUS = 8;
const FORT_GUARD_PROJECTION = .25;

// 三家 AI 各自的补兵偏好。性格不再只决定出兵概率，也决定它们养出什么样的军队。
const AI_RECRUIT_TASTE = {
  aggressive: ["light_cavalry", "levy", "knights"],
  trader: ["archers", "crossbowmen", "levy"],
  cautious: ["heavy_infantry", "crossbowmen", "knights"]
};
// 每次决策拿出金库的几成补兵。AI 此前只进不出：48 季能囤到六百多金而一个兵不买，
// 同时每次进攻还要掉 8% 长矛兵 —— 它不是静态，是在自己饿死。
const AI_REINVEST_SHARE = .35;
// 养兵上限 = 基数 + 每块地的份额。占的地越多能养的兵越多，也因此限制了无限膨胀。
const AI_ARMY_BASE_CAP = 52;
const AI_ARMY_CAP_PER_TERRITORY = 17;
// 吞并中立割据比进攻玩家慢：AI 会蚕食无主小领，但主线压力仍来自玩家自己的边境。
const AI_ANNEX_CHANCE_SCALE = .45;

const TERRITORY_DEFS = {
  ravenstone: { name: "渡鸦堡", region: "raven_march", x: 20, y: 56, type: "castle", terrain: "丘陵城堡", terrainTags: ["hills", "fortified"], owner: "player", gold: 10, grain: 34, people: 218, guard: 46, stability: 66, final: false, playable: true, adj: ["blackthorn", "westmarch", "ironhill", "ashfield", "pineford"], desc: "你的祖堡。城墙还在，附近三座附属镇是渡鸦家最后的粮仓、林场和铁作坊。" },
  ashfield: { name: "灰麦原", region: "wolf_march", x: 47, y: 49, type: "town", terrain: "开阔农田", terrainTags: ["plains"], owner: "wolf", gold: 7, grain: 38, people: 142, guard: 34, stability: 61, final: false, playable: true, adj: ["ravenstone", "pineford", "crossford"], desc: "北境最肥沃的麦地。谁占住这里，谁就不怕下一个冬天。" },
  pineford: { name: "松林渡", region: "wolf_march", x: 28, y: 25, type: "town", terrain: "密林河渡", terrainTags: ["forest", "river"], owner: "wolf", gold: 8, grain: 22, people: 96, guard: 39, stability: 69, final: false, playable: true, adj: ["ravenstone", "ashfield", "highpass"], desc: "商道穿过密林与浅滩，狼牙氏族在树后布满哨所。" },
  highpass: { name: "北境关", region: "wolf_march", x: 53, y: 15, type: "fort", terrain: "山地要塞", terrainTags: ["mountain", "fortified"], owner: "wolf", gold: 6, grain: 13, people: 72, guard: 54, stability: 76, final: false, playable: true, adj: ["pineford", "crownvale"], desc: "扼守山口的石堡。难攻，却能挡住整个北方的袭扰。" },
  crossford: { name: "十字渡", region: "riverlands", x: 44, y: 79, type: "town", terrain: "河谷集市", terrainTags: ["river", "plains"], owner: "river", gold: 15, grain: 18, people: 116, guard: 38, stability: 72, final: false, playable: true, adj: ["ashfield", "riverwatch", "crownvale"], desc: "两条商路在此交汇。这里的税吏比守军更让商人害怕。" },
  riverwatch: { name: "河望城", region: "riverlands", x: 72, y: 77, type: "castle", terrain: "河畔石城", terrainTags: ["river", "fortified"], owner: "river", gold: 14, grain: 24, people: 138, guard: 49, stability: 78, final: false, playable: true, adj: ["crossford", "crownvale"], desc: "艾芙琳伯爵的坚城。城下水网密布，骑兵难以展开。" },
  crownvale: { name: "王冠谷", region: "royal_crown", x: 81, y: 42, type: "capital", terrain: "公爵王城", terrainTags: ["plains", "fortified", "capital"], owner: "crown", gold: 23, grain: 28, people: 186, guard: 68, stability: 82, final: true, playable: true, adj: ["highpass", "crossford", "riverwatch"], desc: "摄政公爵把铁冠锁在这里。只有准备好攻城器械、威望和足够主力，王城才会打开城门。" }
};

const EXTRA_TERRITORIES = {
  ravenmere: ["渡鸦湖", "raven_march", 8, 68, "river", ["ravenstone", "ashfield"]],
  blackthorn: ["黑棘林", "raven_march", 9, 39, "forest", ["ravenstone", "pineford"]],
  oldwatch: ["旧哨塔", "raven_march", 12, 78, "fortified", ["ravenstone", "crossford"]],
  wolfden: ["狼穴", "wolf_march", 37, 10, "mountain", ["pineford", "highpass"]],
  redfen: ["赤泥沼", "wolf_march", 65, 20, "forest", ["highpass", "crownvale"]],
  stonejaw: ["石颚堡", "wolf_march", 68, 8, "fortified", ["highpass", "crownvale"]],
  millrun: ["磨坊溪", "riverlands", 20, 88, "plains", ["crossford", "ashfield"]],
  reedbank: ["芦苇岸", "riverlands", 60, 91, "river", ["crossford", "riverwatch"]],
  saltbridge: ["盐桥", "riverlands", 86, 73, "river", ["riverwatch", "crownvale"]],
  ashgate: ["灰门", "northern_lords", 64, 58, "plains", ["ashfield", "crossford"]],
  frostfield: ["霜原", "northern_lords", 78, 15, "plains", ["highpass", "crownvale"]],
  crowstep: ["鸦阶", "northern_lords", 91, 27, "mountain", ["crownvale", "frostfield"]],
  barrowhill: ["冢丘", "northern_lords", 8, 18, "hills", ["pineford", "ravenstone"]],
  greywood: ["灰林", "northern_lords", 92, 55, "forest", ["crownvale", "riverwatch"]],
  duchyroad: ["公爵大道", "royal_crown", 70, 37, "plains", ["crownvale", "highpass"]],
  // 王冠田与鸦阶原本只与王冠谷相邻，而王冠谷是必须先满足开城条件才能打的终点，
  // 于是这两块地在任何设计下都永远打不到。各补一条通往最近的可达邻居的路。
  crownfield: ["王冠田", "royal_crown", 91, 38, "plains", ["crownvale", "greywood"]],
  kingsford: ["王渡", "royal_crown", 92, 84, "river", ["crownvale", "riverwatch"]],
  ironhill: ["铁溪镇", "raven_march", 39, 58, "mountain", ["ravenstone", "ashfield"]],
  westmarch: ["麦田镇", "raven_march", 11, 72, "plains", ["ravenstone", "crossford"]],
  eastmarch: ["东境镇", "neutral_cities", 97, 64, "plains", ["crownvale"]],
  tradersrest: ["商旅驿", "neutral_cities", 33, 91, "river", ["crossford"]],
  bellmarket: ["钟市", "neutral_cities", 84, 95, "plains", ["riverwatch"]],
  freehold: ["自由城", "neutral_cities", 4, 8, "hills", ["pineford"]],
  northpass: ["北隘口", "neutral_cities", 42, 2, "mountain", ["highpass"]],
  sunmere: ["日照湖", "neutral_cities", 14, 34, "river", ["ravenstone"]],
  moonfen: ["月沼", "neutral_cities", 58, 93, "forest", ["crossford"]],
  redquarry: ["赤石采场", "neutral_cities", 76, 3, "mountain", ["crownvale"]],
  southgate: ["南门镇", "neutral_cities", 52, 96, "plains", ["riverwatch"]],
  ashcoast: ["灰岸", "neutral_cities", 98, 8, "river", ["crownvale"]]
};
// 地形档案：扩展领地此前一律 5 金 / 12 粮 / 60 人 / 20 守 / 55 稳，
// 24 块可占领地里有 14 块数值完全相同 —— 「下一块打哪」除了看邻接之外没有任何内容。
// 现在按地形拉开：河谷有商路所以金多，密林粮稳但难治，山地穷而险，要塞产出低但极难攻。
const TERRAIN_PROFILES = {
  plains:    { gold: 6, grain: 19, people: 82, guard: 15, stability: 59, terrain: "平原" },
  river:     { gold: 10, grain: 13, people: 86, guard: 16, stability: 61, terrain: "河谷" },
  forest:    { gold: 4, grain: 16, people: 54, guard: 21, stability: 52, terrain: "密林" },
  hills:     { gold: 5, grain: 12, people: 63, guard: 23, stability: 56, terrain: "丘陵" },
  mountain:  { gold: 3, grain: 8, people: 41, guard: 29, stability: 50, terrain: "山地" },
  fortified: { gold: 5, grain: 10, people: 57, guard: 38, stability: 68, terrain: "要塞" }
};

const TERRAIN_FLAVOUR = {
  plains: "一眼望到头的麦地。收成好，骑兵来了也一眼望到头。",
  river: "渡口、集市、税吏。钱在这儿转，兵在这儿站不住。",
  forest: "林子密。骑兵进不来，盗匪出不去。",
  hills: "坡地。站在上头能看见谁来了，看见了也不一定挡得住。",
  mountain: "石头比麦子多。守着省心，养兵费粮。",
  fortified: "石墙、箭塔、干粮。攻的人流血，守的人挨饿。"
};

Object.entries(EXTRA_TERRITORIES).forEach(([id, [name, region, x, y, tag, adj]]) => {
  const profile = TERRAIN_PROFILES[tag] || TERRAIN_PROFILES.plains;
  TERRITORY_DEFS[id] = {
    name, region, x, y,
    type: tag === "fortified" || tag === "mountain" ? "fort" : "town",
    terrain: profile.terrain, terrainTags: [tag], owner: "neutral",
    gold: profile.gold, grain: profile.grain, people: profile.people,
    guard: profile.guard, stability: profile.stability,
    final: false, playable: false, adj,
    desc: TERRAIN_FLAVOUR[tag] || `${name}是北境地图上的一处节点。`
  };
});

// 每个大区补一座核心城堡，否则「控制大区」在这些区里无从争夺。
// 松林渡是狼牙氏族的据点，灰门是雷纳德割据的主城——两者本来就是各自区域的重心。
TERRITORY_DEFS.pineford.type = "castle";
TERRITORY_DEFS.ashgate.type = "castle";
// 灰门原本套的是平原城镇档案，18 名守军撑不起一座区域重心。雷纳德是六名大叛臣
// 之一，他的主城该像样一点。
Object.assign(TERRITORY_DEFS.ashgate, {
  gold: 9, grain: 21, people: 124, guard: 30, stability: 70, terrain: "石门城",
  desc: "雷纳德把守着北境通往东面的石门。父亲在世时，他是最先递上效忠状的那一个。"
});
// 商旅驿孤悬在只有它一块地的 neutral_cities 区里，永远拿不到大区加成；并入河谷区。
TERRITORY_DEFS.tradersrest.region = "riverlands";

// 复国版地图：四块开局领地，25 个可夺取节点，其余节点作为侦察与道路上的互动地点。
const RESTORATION_OWNERS = {
  ravenstone: "player", blackthorn: "player", westmarch: "player", ironhill: "player",
  ashfield: "wolf", pineford: "wolf", highpass: "wolf", wolfden: "wolf", redfen: "wolf", stonejaw: "wolf",
  crossford: "river", riverwatch: "river", reedbank: "river", saltbridge: "river", millrun: "river",
  crownvale: "crown", duchyroad: "crown", crownfield: "crown", kingsford: "crown",
  ashgate: "neutral", frostfield: "neutral", crowstep: "neutral", greywood: "neutral", tradersrest: "neutral"
};
Object.entries(RESTORATION_OWNERS).forEach(([id, owner]) => {
  if (!TERRITORY_DEFS[id]) return;
  TERRITORY_DEFS[id].owner = owner;
  TERRITORY_DEFS[id].playable = true;
});
TERRITORY_DEFS.blackthorn.name = "黑棘镇";
TERRITORY_DEFS.blackthorn.desc = "渡鸦家的林镇，木材、猎物和皮革是这里最重要的产出。";
TERRITORY_DEFS.westmarch.name = "麦田镇";
TERRITORY_DEFS.westmarch.desc = "渡鸦堡南侧的粮镇，收成决定王国能否养得起下一支军队。";
TERRITORY_DEFS.ironhill.name = "铁溪镇";
TERRITORY_DEFS.ironhill.desc = "旧铁溪矿镇，矿石和铁匠铺是复国军械的根基。";
TERRITORY_DEFS.blackthorn.gold = 7; TERRITORY_DEFS.blackthorn.grain = 16;
TERRITORY_DEFS.westmarch.gold = 5; TERRITORY_DEFS.westmarch.grain = 30;
TERRITORY_DEFS.ironhill.gold = 15; TERRITORY_DEFS.ironhill.grain = 8;

// 邻接必须对称。EXTRA_TERRITORIES 里的节点各自声明了邻居，但 7 个原始核心节点
// 的 adj 从未反向补回；而 attackableTerritories 读的是出发地的 adj，
// 结果是从核心领地打不到任何扩展领地——24 块可占领地里只有 10 块真正可达。
Object.entries(TERRITORY_DEFS).forEach(([id, d]) => {
  d.adj.forEach(nb => {
    if (TERRITORY_DEFS[nb] && !TERRITORY_DEFS[nb].adj.includes(id)) TERRITORY_DEFS[nb].adj.push(id);
  });
});

const playableTerritoryIds = () => Object.keys(TERRITORY_DEFS).filter(id => TERRITORY_DEFS[id].playable !== false);

// 侦察是当前唯一的城市行动。使者、商站、断粮道和城约属于「说服路线」，
// 会在领主绑定领地与王室正统性落地后重建，届时它们要作用于具体的叛臣，而不是匿名城市。
const CITY_ACTION_DEFS = {
  scout: { name: "派出斥候", note: "花2金币，记录守军与地形两季。", cost: { gold: 2 } },
  envoy: { name: "派使者", note: "花8金币，去探他的开价。一局对每人只派一次。", cost: { gold: 8 } }
};
// 使者不再刷好感。旧设计里每人 120 秒冷却、每次 +8，一局下来平均派 180 趟，
// 所谓外交就是每两分钟把将领页从头点到尾。现在使者对每个领主只去一次：
// 探出他的开价，顺带听他说句话。说服靠的是把开价做到，不是把使者派够。
const CITY_ACTION_DURATIONS = { scout: 20 * 1000, envoy: 30 * 1000 };
// 冷却用绝对到期时刻，而不是「本季已用」——季不再是结算单位，锁也不该按季走。
const CITY_ACTION_COOLDOWNS = { scout: 90 * 1000, envoy: 0 };

// 开价：每个领主一条明码条件。满足了，说服公式里才有他那一份杠杆（leverage）；
// 不满足，正统性和兵临城下堆到天上他也不宣誓。kind 为 none 的人不谈，只认刀。
//   battle_near  在他辖地的邻边打赢一仗（含打他自己的城）
//   legitimacy   王室正统性到 value
//   renown       威望到 value
//   own          玩家拿下指定领地
//   gold         一次性付清 value 金（将领页有按钮）
//   treasury     金库里存满 value 金
//   neighbour    他辖地的任一邻边归玩家
//   besieged     他辖地至少两块邻边归玩家（邻近压力 ≥ 8）
//   liege_down   他的主君已归附或已除名
const LORD_PRICES = {
  renard:  { kind: "battle_near", leverage: 30, text: "在他眼皮底下打赢一仗", hint: "他辖地邻边的任何一场胜仗都算，打他自己的城也算" },
  ysabel:  { kind: "legitimacy", value: 50, leverage: 25, text: "王室正统性到 50", hint: "她认账，只认渡鸦家还是不是王家的账" },
  edmund:  { kind: "renown", value: 60, leverage: 45, text: "威望压过他，到 60", hint: "名声不如他，他凭什么叫你殿下" },
  aveline: { kind: "own", territoryId: "crossford", leverage: 20, text: "先拿下十字渡", hint: "河地的门户。守得住这里，她才信你守得住河地" },
  bran:    { kind: "none", leverage: 0, text: "不谈。只认刀", hint: "使者去了也白去，他只服正面打赢他的人" },
  roderic: { kind: "gold", value: 90, leverage: 30, text: "补上十一年欠饷，90 金", hint: "钱到了他就不欠先王什么了，也就不欠篡位者什么了" },
  regent:  { kind: "none", leverage: 0, text: "篡位者不谈", hint: "铁冠在他手里，他为什么要谈" }
};
const ARCHETYPE_PRICES = {
  garrison: { kind: "besieged", leverage: 10, text: "两面被围", hint: "他只想守墙。让他看见墙外两边都是渡鸦旗" },
  venal:    { kind: "treasury", value: 160, leverage: 10, text: "金库存满 160 金", hint: "他跟有钱的走。先让他看见你比他主君有钱" },
  loyalist: { kind: "liege_down", leverage: 12, text: "主君先倒", hint: "主君还在他就不换旗，主君倒了他也就没了主意" },
  waverer:  { kind: "neighbour", leverage: 8, text: "打下他任一邻居", hint: "谁看着能赢就跟谁。赢一次给他看" }
};

const LORD_DEFS = {
  player:  { name: "罗恩", title: "渡鸦家的王子", portrait: "assets/player.webp", stats: { force: 68, command: 65, scheme: 60, govern: 58, charm: 67 }, trait: "合法继承人", traitText: "亲自出战时，本场军心最低按45点计算；只有收复旧土后，才有资格重新戴上王冠。", loyalty: 100, ambition: 55, tier: "loyal",  faction: "player",  seat: "ravenstone", liege: null,   oldTie: "先王之子",                     defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: ["knight_2"] },
  regent:  { name: "摄政公爵", title: "篡位摄政 · 王冠谷", portrait: "assets/regent-duke.webp", age: 52, stats: { force: 62, command: 86, scheme: 72, govern: 78, charm: 64 }, trait: "铁冠法统", traitText: "守住王冠谷，拒绝承认渡鸦家的继承权。", loyalty: 100, ambition: 68, tier: "liege",  faction: "crown",   seat: "crownvale",  liege: null,   oldTie: "父亲加冕时的监誓人",           defiance: 95, routes: { force: 1,   persuade: 0, bribe: 0 },   knights: ["knight_17", "knight_18"] },
  oswin:   { name: "奥斯温·维尔", title: "苔原领主", portrait: "assets/oswin.webp", stats: { force: 27, command: 51, scheme: 78, govern: 88, charm: 69 }, trait: "旧账如山", traitText: "主持领地时收入更稳定；拒绝他的越冬警告会积累不满。", loyalty: 76, ambition: 18, tier: "loyal",  faction: "player",  seat: null,         liege: null,   oldTie: "父亲的老管家，唯一没有走的人", defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: [] },
  renard:  { name: "雷纳德·霍尔特", title: "黑石领主", portrait: "assets/renard.webp", stats: { force: 86, command: 83, scheme: 43, govern: 31, charm: 47 }, trait: "破阵者", traitText: "强攻和骑兵冲击更有力；占尽优势后撤退会激怒他。", loyalty: 70, ambition: 48, tier: "liege",  faction: "neutral", seat: "ashgate",    liege: null,   oldTie: "父亲的骑士长",                 defiance: 70, routes: { force: 1.2, persuade: 1, bribe: 0.2 }, knights: ["knight_3", "knight_4"] },
  ysabel:  { name: "伊莎贝尔·马伦", title: "白麦领主", portrait: "assets/ysabel.webp", stats: { force: 30, command: 48, scheme: 80, govern: 92, charm: 72 }, trait: "精确到一粒麦", traitText: "随军可降低补给与撤退损失；主持财税能减少盘剥。", loyalty: 68, ambition: 34, tier: "liege",  faction: "neutral", seat: "frostfield", liege: null,   oldTie: "父亲的财政官",                 defiance: 45, routes: { force: 0.7, persuade: 1, bribe: 0.6 }, knights: ["knight_5"] },
  edmund:  { name: "埃德蒙·维恩", title: "鸦堡领主", portrait: "assets/edmund.webp", stats: { force: 74, command: 76, scheme: 69, govern: 57, charm: 84 }, trait: "另一种继承", traitText: "伏击和招降能力出众；功劳越高，越希望管理自己的领地。", loyalty: 61, ambition: 82, tier: "liege",  faction: "neutral", seat: "crowstep",   liege: null,   oldTie: "父亲的私生侄，另一条继承线",   defiance: 85, routes: { force: 1,   persuade: 1, bribe: 0.5 }, knights: ["knight_6", "knight_7"] },
  aveline: { name: "艾芙琳·多尔", title: "河望领主", portrait: "assets/aveline.webp", stats: { force: 71, command: 80, scheme: 75, govern: 74, charm: 78 }, trait: "河地之主", traitText: "熟悉河谷作战与治理。若被逼到绝境，她会选择一个值得效忠的人。", loyalty: 52, ambition: 65, tier: "liege",  faction: "river",   seat: "riverwatch", liege: null,   oldTie: "父亲的河地总管",               defiance: 62, routes: { force: 1,   persuade: 1, bribe: 0.8 }, knights: ["knight_19", "knight_20"] },
  bran:    { name: "布兰·狼牙", title: "狼牙领主", portrait: "assets/bran.webp", stats: { force: 92, command: 80, scheme: 41, govern: 37, charm: 61 }, trait: "只服强者", traitText: "森林和山地作战极强；只会向正面击败自己的人低头。", loyalty: 48, ambition: 58, tier: "liege",  faction: "wolf",    seat: "highpass",   liege: null,   oldTie: "父亲的北境边将",               defiance: 78, routes: { force: 1,   persuade: 0, bribe: 0.3 }, knights: ["knight_9", "knight_10"] },
  roderic: { name: "罗德里克·石手", title: "石手领主", portrait: "assets/roderic.webp", age: 44, stats: { force: 82, command: 78, scheme: 48, govern: 46, charm: 53 }, trait: "守关", traitText: "守城和山地作战更稳，适合镇守新领地。", loyalty: 55, ambition: 47, tier: "vassal", faction: "wolf",    seat: "stonejaw",   liege: "bran", oldTie: "父亲的关隘守将，欠饷十一年",   defiance: 55, routes: { force: 0.9, persuade: 1, bribe: 1.2 }, knights: ["knight_11"] }
};

// ── 人物台词 ─────────────────────────────────────────────────────────
// 每个深写领主一套，浅写附庸按原型一套。键：
//   envoy       使者去了他说什么（顺便把开价说出来）
//   refuse      开价没做到时他挂在将领页上的那句
//   soften      开价做到了、可以谈时
//   captured    被押到厅上
//   execute     临刑最后一句
//   submitForce / submitTalk / submitBribe   三种归附方式各一句
//   battle: { good, even, bad }   带兵时每阶段结算后的话
// 占位：{player} 玩家名，{seat} 主城，{liege} 主君名。数组会按当季轮着用。
const LORD_LINES = {
  bran: {
    envoy: ["回去告诉那个小崽子：他爹的骨头还在我的狗嘴里。想要我跪？先把老子打趴下。"],
    refuse: ["使者？操他妈的使者。渡鸦家什么时候学会派娘们儿说话了。", "有种带兵来北境关。没种就滚回去种地。"],
    soften: ["……"],
    captured: ["打赢了就是打赢了。别废话，砍或者不砍，挑一个。"],
    execute: ["砍利索点。你爹当年砍人就磨磨蹭蹭的。"],
    submitForce: ["行。你打赢了。狼牙认打赢的人——下次你要是输了，我照样咬你。"],
    submitTalk: ["……"],
    submitBribe: ["……"],
    battle: { good: ["杀！别停！追到他们妈都认不出来！", "看见没？这才叫打仗！"], even: ["还他妈僵着？弓手，射他们的马！", "前排顶住，谁缩老子踹谁！"], bad: ["撤个屁！狼牙人没有退路，只有坟！", "妈的……收拢，收拢！"] }
  },
  renard: {
    envoy: ["你爹的骑士长不听使者的，只看阵。让他带兵来灰门旁边打一仗给我看。输了我跪，赢了他滚。"],
    refuse: ["我一场仗没见他打赢过。跪一个没打过仗的娃娃？我的剑不答应。", "灰门的门开着。他要真是他爹的种，就带兵来。"],
    soften: ["那一仗我看见了。行，小子手上有活。让他来灰门，我当面说。"],
    captured: ["我输了，不用你提醒。骑士长没有第二次投降——你要么用我，要么埋我。"],
    execute: ["砍吧。告诉我的人，我是站着死的。"],
    submitForce: ["我的剑跟着打赢我的人。你爹是，你也是。"],
    submitTalk: ["我看过你打仗。够了，不用再说。这把剑归你。"],
    submitBribe: ["钱我收了。别指望我为钱卖命，我为打仗卖命。"],
    battle: { good: ["缺口开了！骑士上！别让他们合拢！", "就是这样。压过去。"], even: ["稳住前排！谁退一步我亲手砍了他。", "弓手再慢一拍，前排就没了。"], bad: ["前排塌了……收拢！能走的扶着不能走的！", "妈的，这仗打得跟你爹当年一样烂。"] }
  },
  ysabel: {
    envoy: ["先王欠我三年薪俸，欠霜原两千袋粮。他儿子要我认他，先让北境认他——正统性够了，账就能算。"],
    refuse: ["他还不是王。一个名字都得靠打仗证明的人，账簿上写不上。", "正统性差多少，我这儿有数。他自己也该有数。"],
    soften: ["行了，北境认他了，账也就能算了。让他来，我把账本带上。"],
    captured: ["打赢我不难，我只有三十个守军和一本账。账你要不要？"],
    execute: ["杀一个管账的？行。以后粮食你自己数。"],
    submitForce: ["输了就输了。账本我带来了——你的仓库比我想的还烂。"],
    submitTalk: ["先王的账，我认了。你的账，从今天开始记。"],
    submitBribe: ["这笔钱我记在「渡鸦家收买」一栏。别怕，我每一笔都记。"],
    battle: { good: ["按计划走。伤亡比预算低两成。", "省着点箭，够用了。"], even: ["补给还够两天。两天里打不完，就得撤。", "别浪费人。"], bad: ["别算了。撤，尸体不用数。", "预算超了。撤。"] }
  },
  edmund: {
    envoy: ["使者？我堂弟连自己来的胆子都没有？回去告诉他：血是一样的血，凭什么他坐上面。"],
    refuse: ["北境还没听说过他的名字。等大家都叫他殿下了，我再考虑叫不叫。", "威望？他那点威望，够在酒馆赊一杯。"],
    soften: ["行啊，堂弟出名了。全北境都叫他殿下，我叫一声也不掉块肉。"],
    captured: ["同一个爷爷的血。你砍我，砍的也是你自己的姓。当然，你可以试试。"],
    execute: ["好，杀自家人。北境会记住渡鸦家是怎么对亲戚的。"],
    submitForce: ["我跪。堂弟，别得意——跪的是你的剑，不是你。"],
    submitTalk: ["叫一声殿下不难。能不能让我一直叫下去，看你。"],
    submitBribe: ["用钱买一个姓维恩的？行，成交。别后悔。"],
    battle: { good: ["他们乱了！从侧面进去，掏心！", "看，堂弟，这叫打仗。"], even: ["别冲。让他们再走两步……再走两步……", "急什么。"], bad: ["不是我的错，谁让弓手站那儿的？撤！", "行了，别送了。撤。"] }
  },
  aveline: {
    envoy: ["替我谢谢殿下的使者。河望的规矩是：先看人守不守得住十字渡，再谈谁做河地的主。"],
    refuse: ["十字渡还在别人手里。河地不跟守不住渡口的人。", "殿下要是连十字渡都拿不下，谈什么河望。"],
    soften: ["十字渡是殿下的了。好，河地人守约——请殿下来河望，谈河税和渡船。"],
    captured: ["河望降了。我只求一件事：河地的水闸，留给懂水的人。"],
    execute: ["殿下要杀我，河地人会记很多年。请吧。"],
    submitForce: ["我输在城墙上，不输在河上。河地归你，水闸归我，可以吗？"],
    submitTalk: ["殿下守住了渡口。河地归渡鸦家，从今天起。"],
    submitBribe: ["殿下的金子很重。我收下，河地人会看我怎么花。"],
    battle: { good: ["水网困住他们了。收网。", "让他们在泥里多站一会儿。"], even: ["别急。河里的人比岸上的人耐心。", "等潮。"], bad: ["上岸！上岸！别在水里等死！", "撤到渡口。快。"] }
  },
  roderic: {
    envoy: ["先王欠我十一年饷。布兰一个子儿没给，就许了个「以后」。你家小子肯付钱，我听钱的。九十金，一分不能少。"],
    refuse: ["饷没到。别跟我谈忠诚，忠诚不能吃。", "九十金。数够了再来。"],
    soften: ["钱到了。十一年，我等了十一年。行，石颚堡听你的。"],
    captured: ["我是守关的，不是造反的。你付我饷，我给你守；不付，你砍。"],
    execute: ["十一年没拿到饷，最后拿到一刀。行吧。"],
    submitForce: ["关破了，我认。饷的事，以后再算。"],
    submitTalk: ["拿人钱，守人关。石颚堡从今天起是渡鸦家的门。"],
    submitBribe: ["钱到了，关就是你的。简单。"],
    battle: { good: ["守住了！再来！石头都比你们硬！", "好，就这么打。"], even: ["别追。守关的不追，追出去就没关了。", "顶着。"], bad: ["墙塌了一段……堵！拿尸体堵！", "退进关里。"] }
  },
  regent: {
    envoy: ["渡鸦家的小子派了个使者？告诉他：铁冠在我头上，不在他爹的坟里。回去种地。"],
    refuse: ["我没什么好跟一个孩子谈的。"],
    soften: ["……"],
    captured: ["你赢了。北境从来是打赢的人戴冠——我给你父亲戴过一次，现在轮到你。"],
    execute: ["杀吧。你会发现戴着这顶冠的时候，杀人比现在容易得多。"],
    submitForce: ["……"], submitTalk: ["……"], submitBribe: ["……"],
    battle: { good: ["他们已经在跑了。不用追。", "王城不缺人。"], even: ["沉住气。王城不缺时间。"], bad: ["退进内城。让他们尝尝攻城的滋味。"] }
  },
  player: {
    battle: { good: ["冲！让他们看看谁是北境的主人！", "父亲的旗还在。跟上！"], even: ["顶住。顶住就是赢。", "别慌。再等等。"], bad: ["……撤。留着命，还有下一仗。", "收兵。今天到此为止。"] }
  }
};

const ARCHETYPE_LINES = {
  garrison: {
    envoy: ["我就守这堵墙。谁把我两边都围了，我跟谁。别的别跟我说。"],
    refuse: ["两边还没围上。回去。"],
    soften: ["两边都是渡鸦旗了。好吧，开门。"],
    captured: ["墙没守住。随便你。"],
    execute: ["守了一辈子墙，死在墙下，也算。"],
    submitForce: ["墙破了。人还在，你用不用？"],
    submitTalk: ["开门。别拆我的墙。"],
    submitBribe: ["钱？行。墙照样是我守。"],
    battle: { good: ["顶住了。再来。"], even: ["别出去。守着。"], bad: ["墙……墙没了。"] }
  },
  venal: {
    envoy: ["价钱好说。让你家小子先攒够一百六十金——攒不够，说明他没{liege}有钱，我跟穷人干什么。"],
    refuse: ["金库是空的。空国库让我换旗？"],
    soften: ["一百六十金，我看见了。什么时候签？"],
    captured: ["别杀，我值钱。真的。"],
    execute: ["我出双倍——哦，你不要。行吧。"],
    submitForce: ["跟谁不是跟。跟你。"],
    submitTalk: ["有钱的主子好。"],
    submitBribe: ["成交。下次涨价。"],
    battle: { good: ["赢了赢了，战利品归我三成。"], even: ["再打下去不划算啊。"], bad: ["撤撤撤，人没了钱也没了。"] }
  },
  loyalist: {
    envoy: ["我主君{liege}还站着。他站着我就不跪。你先去找他。"],
    refuse: ["主君没倒。滚。"],
    soften: ["主君倒了……行，我没主意了。你说怎么办。"],
    captured: ["我为{liege}守的城。杀我随便，别让我改口骂他。"],
    execute: ["主君……算了，他也不在了。"],
    submitForce: ["主君不在了。我跟你，别让我再换一次。"],
    submitTalk: ["我不是叛他，是他先没了。"],
    submitBribe: ["钱我收，心不换。"],
    battle: { good: ["为{liege}！", "上！"], even: ["守住。"], bad: ["撤……对不起主君。"] }
  },
  waverer: {
    envoy: ["我看看。你家小子要是能打赢我隔壁那个，我再说。"],
    refuse: ["隔壁还是那面旗。没看出来你能赢。"],
    soften: ["隔壁换旗了。行，我信了。什么时候来接我？"],
    captured: ["早说了我跟能赢的。你赢了，我跟你，行不行？"],
    execute: ["我都说跟你了！"],
    submitForce: ["赢家说了算。"],
    submitTalk: ["早该这样。"],
    submitBribe: ["钱加上你能打，双保险。"],
    battle: { good: ["赢了？赢了！我就说跟对人了。"], even: ["这……能赢吗？"], bad: ["我就知道……撤！"] }
  }
};

// 骑士带兵没有个人剧本，用通用的
const KNIGHT_BATTLE_LINES = { good: ["开了！跟我上！", "压上去，别给他们喘气！"], even: ["盾墙别散！稳住！", "顶住，等骑士。"], bad: ["撤！带上伤员！", "退！退到线后面！"] };

// 浅写附庸只有名字、出身和倾向，用四种原型区分行为，不单独写剧本。
const LORD_ARCHETYPES = {
  garrison: { title: "守成领主", defiance: 54, routes: { force: 1,   persuade: 1,   bribe: 0.7 }, trait: "守成", traitText: "只想守住自己的城墙，不主动惹事。" },
  venal:    { title: "贪财领主", defiance: 46, routes: { force: 0.9, persuade: 1,   bribe: 1.4 }, trait: "贪财", traitText: "开价明确，钱到位就换旗。" },
  loyalist: { title: "忠仆领主", defiance: 62, routes: { force: 1.1, persuade: 1,   bribe: 0.3 }, trait: "死忠", traitText: "认死主君，除非主君先倒下。" },
  waverer:  { title: "观望领主", defiance: 42, routes: { force: 0.9, persuade: 1,   bribe: 1   }, trait: "观望", traitText: "谁看着能赢就跟谁，最容易被说动。" }
};

// [id, 姓名, 主城, 势力, 主君, 原型, 初始骑士]
// 位置元组，列顺序敏感。knight_1 与 knight_8 刻意不分配给任何领主——
// 它们是无主的游侠骑士，测试会锁定这一点，不要当成漏填补上。
const MINOR_LORD_ROWS = [
  ["gilbert", "吉尔伯特·铺石", "duchyroad",   "crown",   "regent",  "loyalist", ["knight_21"]],
  ["alwin",   "阿尔文·麦茬",   "crownfield",  "crown",   "regent",  "garrison", ["knight_22"]],
  ["luca",    "卢卡·浅滩",     "kingsford",   "crown",   "regent",  "venal",    []],
  ["harald",  "哈拉尔·牙岩",   "wolfden",     "wolf",    "bran",    "loyalist", ["knight_12"]],
  ["morton",  "莫尔顿·泥步",   "redfen",      "wolf",    "bran",    "waverer",  []],
  ["selma",   "塞尔玛·灰穗",   "ashfield",    "wolf",    "bran",    "venal",    ["knight_13"]],
  ["otto",    "奥托·松脂",     "pineford",    "wolf",    "bran",    "garrison", ["knight_14"]],
  ["piers",   "皮尔斯·双道",   "crossford",   "river",   "aveline", "venal",    ["knight_23"]],
  ["vera",    "薇拉·苇心",     "reedbank",    "river",   "aveline", "waverer",  []],
  ["conrad",  "康拉德·盐税",   "saltbridge",  "river",   "aveline", "venal",    ["knight_24"]],
  ["hanna",   "汉娜·磨坊",     "millrun",     "river",   "aveline", "garrison", []],
  ["godwin",  "戈德温·灰枝",   "greywood",    "neutral", null,      "garrison", ["knight_15"]],
  ["miro",    "米罗·秤星",     "tradersrest", "neutral", null,      "venal",    ["knight_16"]]
];

MINOR_LORD_ROWS.forEach(([id, name, seat, faction, liege, archetypeId, knights], index) => {
  const archetype = LORD_ARCHETYPES[archetypeId];
  LORD_DEFS[id] = {
    name, title: `${archetype.title} · ${TERRITORY_DEFS[seat].name}`,
    portrait: null,                       // 浅写领主没有立绘，由家徽兜底
    age: 34 + (index % 5) * 6,
    tier: "vassal", faction, seat, liege, archetype: archetypeId,
    oldTie: `父亲在世时管理${TERRITORY_DEFS[seat].name}的旧吏`,
    defiance: archetype.defiance, routes: { ...archetype.routes }, knights,
    trait: archetype.trait, traitText: archetype.traitText,
    stats: { force: 44 + (index % 6) * 5, command: 40 + (index % 5) * 6, scheme: 38 + (index % 7) * 5, govern: 42 + (index % 4) * 7, charm: 40 + (index % 6) * 6 },
    loyalty: 50, ambition: 30 + (index % 5) * 8
  };
});

// 开价挂到定义上：深写领主按名字查表，浅写附庸按原型。
Object.entries(LORD_DEFS).forEach(([id, def]) => {
  def.price = LORD_PRICES[id] || (def.archetype ? ARCHETYPE_PRICES[def.archetype] : null) || null;
});

// 主城 → 领主 的反查表。territory.lordId 是运行时真相源，这里只提供开局初值。
const SEAT_TO_LORD = Object.fromEntries(
  Object.entries(LORD_DEFS).filter(([, d]) => d.tier !== "loyal" && d.seat).map(([id, d]) => [d.seat, id])
);

const KNIGHT_NAMES = [
  "阿尔德里克·铁掌", "贝伦·灰盾", "科尔文·长矛", "德里克·鸦眼", "埃尔莎·白鬃", "法恩·磨石",
  "加雷特·断弦", "赫尔曼·冷泉", "伊沃·黑马", "贾斯珀·松针", "凯尔·旧门", "莱娜·红披风",
  "马丁·石路", "诺兰·盐河", "奥斯卡·霜刃", "佩林·铜扣", "昆特·高墙", "罗兰·野火",
  "塞德里克·狼徽", "托马斯·铁钉", "乌尔里克·深林", "瓦尔德·白塔", "威尔·窄桥", "约恩·麦穗"
];

// 骑士归属由 LORD_DEFS[].knights 决定；liegeLordId 是运行时可变状态（可被招降、释放）。
const KNIGHT_LIEGE = {};
Object.entries(LORD_DEFS).forEach(([lordId, def]) => (def.knights || []).forEach(knightId => { KNIGHT_LIEGE[knightId] = lordId; }));

const KNIGHT_DEFS = KNIGHT_NAMES.map((name, index) => {
  const id = `knight_${index + 1}`;
  const liegeLordId = KNIGHT_LIEGE[id] || null;
  return {
    id, name, liegeLordId,
    side: liegeLordId ? LORD_DEFS[liegeLordId].faction : "neutral",
    status: liegeLordId === "player" ? "active" : "available",
    force: 48 + (index % 7) * 5,
    command: 42 + (index % 6) * 6,
    scheme: 38 + (index % 8) * 6,
    loyalty: 52 + (index % 5) * 4,
    recruitCost: 8 + (index % 4) * 3
  };
});

const STAT_LABELS = { force: "武力", command: "统率", scheme: "谋略", govern: "治理", charm: "魅力" };
const OFFICER_STAT_KEYS = ["command", "govern"];

// clock.elapsedMs 是游戏时间的唯一真相源（不含暂停时长）。
// turn / 季节 / 年份全部由它派生，任何代码都无法靠调用函数凭空推进世界。
const BUILDING_MAX_LEVEL = 5;
const BUILDINGS = {
  fields: { name: "农田与磨坊", base: 15, desc: "提高粮食流量；高等级解锁轮作与冬储。" },
  market: { name: "集市与商栈", base: 18, desc: "提高金币流量；低稳定时更容易被劫掠。" },
  barracks: { name: "兵营与铁匠铺", base: 21, desc: "提高守军和征募规模，解锁更高阶兵种。" },
  walls: { name: "城墙与塔楼", base: 26, desc: "强化守城，是抵挡反攻的最后一道保险。" },
  granary: { name: "粮仓与地窖", base: 19, desc: "扩大储粮容量，降低换季损耗。" },
  academy: { name: "学宫与书院", base: 28, desc: "提高知识流量，缩短科技发展周期。" },
  workshop: { name: "军械工坊", base: 24, desc: "降低募兵与远征装备成本，提高部队补充效率。" },
  roads: { name: "驿道与桥梁", base: 22, desc: "提高金币流量，降低行军和商路损耗。" },
  watchtower: { name: "烽火台", base: 23, desc: "提高守军上限，提前发现敌军反攻。" },
  temple: { name: "神殿与施舍院", base: 25, desc: "提高民心恢复速度，降低领地动荡。" }
};

const PLANS = {
  assault: { name: "正面强攻", desc: "适合平原和骑士冲锋。突破力强，连续冒进会增加伤亡。", mult: 1.12, casualty: 1.08 },
  steady: { name: "稳扎稳打", desc: "保持队列，减少伤亡，但突破能力较弱。", mult: .94, casualty: .72 },
  ambush: { name: "迂回伏击", desc: "依赖谋略，在森林和山地更有效。", mult: .92, casualty: .78 },
  parley: { name: "攻心劝降", desc: "不适合正面强攻；先取得优势，再尝试劝降。", mult: .86, casualty: .52 }
};

const UNIT_DEFS = {
  levy: { name: "长矛兵", short: "矛", gold: 10, grain: 6, amount: 8, attack: 1, defense: 1.08, hp: 100, supply: 1, role: "前列", counters: ["light_cavalry", "knights"], weakTo: ["archers", "crossbowmen"], equipmentTech: ["refined_iron", "professional_army"], desc: "便宜可靠的前列兵，能挡住骑兵，但怕远程压制。" },
  archers: { name: "弓箭手", short: "弓", gold: 12, grain: 5, amount: 6, attack: 1.08, defense: .78, hp: 82, supply: 1, role: "远射", counters: ["heavy_infantry", "knights"], weakTo: ["levy", "light_cavalry"], equipmentTech: ["longbow", "professional_army"], desc: "远射压制重甲目标，在森林、山地和河谷更容易发挥。" },
  knights: { name: "披甲骑士", short: "骑", gold: 18, grain: 7, amount: 4, attack: 1.7, defense: 1.28, hp: 145, supply: 2, role: "重骑", unlockTech: "refined_iron", counters: ["archers", "crossbowmen"], weakTo: ["levy", "heavy_infantry"], equipmentTech: ["refined_iron", "field_doctrine", "professional_army"], desc: "昂贵的重骑兵，平原冲锋强大，但会被长矛和重步兵拖住。" },
  heavy_infantry: { name: "重步兵", short: "重", gold: 15, grain: 7, amount: 5, attack: 1.25, defense: 1.5, hp: 155, supply: 2, role: "盾墙", unlockTech: "refined_iron", counters: ["levy", "knights"], weakTo: ["archers", "crossbowmen"], equipmentTech: ["refined_iron", "war_engineering", "professional_army"], desc: "披甲盾墙，正面防御最高，适合守城和压住骑兵。" },
  crossbowmen: { name: "弩手", short: "弩", gold: 16, grain: 6, amount: 5, attack: 1.42, defense: .82, hp: 88, supply: 1, role: "破甲", unlockTech: "war_engineering", counters: ["heavy_infantry", "knights"], weakTo: ["light_cavalry", "levy"], equipmentTech: ["war_engineering", "professional_army"], desc: "装填较慢但破甲力强，专门惩罚重甲兵种。" },
  light_cavalry: { name: "轻骑兵", short: "轻骑", gold: 14, grain: 6, amount: 5, attack: 1.32, defense: .92, hp: 112, supply: 2, role: "机动", unlockTech: "field_doctrine", counters: ["archers", "crossbowmen"], weakTo: ["levy", "heavy_infantry"], equipmentTech: ["field_doctrine", "professional_army"], desc: "机动迅速，适合绕击远程部队，不宜正面撞盾墙。" }
};

const UNIT_DISPLAY_HINTS = {
  levy: "擅长对付骑兵",
  archers: "克制重甲",
  heavy_infantry: "正面作战强",
  knights: "克制远程",
  crossbowmen: "远射破甲",
  light_cavalry: "机动追击"
};

const MAP_POINTS = Object.fromEntries(Object.entries(TERRITORY_DEFS).map(([id, d]) => [id, [d.x, d.y]]));
const MAP_LINKS = Object.entries(TERRITORY_DEFS).flatMap(([id, d]) => d.adj.filter(next => id < next).map(next => [id, next]));

const PROLOGUE = [
  { kicker: "序章", title: "雨夜。老管家把印戒推过来，没说话", portrait: "assets/oswin.webp", body: ["父亲的死讯是傍晚到的，信使的马跑死在城门口。奥斯温把印戒放在桌上，戒面朝下，像放一块烫手的炭。", "他等你戴上，才开口：“北境的旗，今晚会换一半。”"] },
  { kicker: "第一封信", title: "第二天早上，二十个人送来了二十面自己的旗", portrait: "assets/bran.webp", body: ["布兰的信只有一行：狼牙不跪娃娃。伊莎贝尔的信是一本账。雷纳德没写信，派人送回了父亲赏他的剑。", "剩下的地：渡鸦堡、黑棘镇、麦田镇、铁溪镇。粮仓够撑几季。奥斯温说，几季够了，够你决定先打谁。"] },
  { kicker: "第一年 · 春", title: "地里的雪化了。城墙上还挂着去年的旗", portrait: "assets/player.webp", body: ["种地，收税，打铁，练兵。每一件都慢，每一件都得做。摄政公爵在王冠谷筹备加冕——他戴上那顶冠的那天，你就只是个有四块地的乡下领主。", "先把这四块地转起来。然后，一座城一座城地拿回来。"] }
];

const WORLD_EVENTS = [
  { id: "spring_flood", seasons: ["spring"], kicker: "春汛", title: "上游决了堤。三个村在抢木头", portrait: "assets/oswin.webp", body: "水漫进刚下种的田，西边的商桥塌了一段。库里的木料只够修一处。奥斯温说，田是三个村的，桥是商人的，木头是您的。", options: [
    ["先修田埂", "金币 −12，粮食 +10，民心 +3", { gold: -12, grain: 10, support: 3 }, "木头和民夫全送去了田里。十袋种粮没被冲走，商人在断桥边骂了一下午。"],
    ["先修桥", "金币 −7，威望 +2", { gold: -7, renown: 2 }, "桥四天修好，车马照走。田里的水自己退的，退得慢。"],
    ["不给木头，各村自己想办法", "金币不变；最低稳定 −8，民心 −5", { stabilityWeak: -8, support: -5 }, "三个村各自拆了自家的屋顶去堵水。淹得最狠的那个村，有两户搬走了。"] ] },
  { id: "summer_drought", seasons: ["summer"], kicker: "旱", title: "三个村的井见底了", portrait: "assets/ysabel.webp", body: "人和牲口从同一条浑水沟里舀水。奥斯温说十天不下雨，先死牲口，再死人。天上一朵云都没有。", options: [
    ["从南方买水买粮", "金币 −18，粮食 +12，民心 +5", { gold: -18, grain: 12, support: 5 }, "南方的车队拉来了水桶和麦子。价钱是平时两倍，没人还价。"],
    ["削军营的口粮", "粮食 +8，军心 −7，战争疲劳 +5", { grain: 8, morale: -7, warWeariness: 5 }, "军营改喝稀粥。第三天有两个兵和伙夫打了一架，伙夫赢了。"],
    ["照旧配给", "粮食 −15，稳定 −3", { grain: -15, stabilityAll: -3 }, "仓里又发出十五袋。三个村没断粮，仓底看得见了。"] ] },
  { id: "autumn_mice", seasons: ["autumn"], kicker: "入仓", title: "新粮进仓三天，仓里全是老鼠", portrait: "assets/oswin.webp", body: "守仓人报的损耗不到一成。伊莎贝尔翻了翻旧账：过去三年秋天，报的数字一模一样，连零头都一样。", options: [
    ["拆仓灭鼠", "金币 −10，粮食 −4，民心 +2", { gold: -10, grain: -4, support: 2 }, "旧仓拆开，鼠洞找到了，还找到两本假账。守仓人当晚没回家。"],
    ["罚守仓人", "王室认可 +2，粮食 −9，民心 −2", { legitimacy: 2, grain: -9, support: -2 }, "两个守仓人戴了木枷。坏了的粮是追不回来的，老鼠也没走。"],
    ["封仓，不追究", "无需额外物资；最低稳定 −5，民心 −3", { stabilityWeak: -5, support: -3 }, "仓封了三天。老鼠少了点，守仓人还是那两个，账还是那本。"] ] },
  { id: "winter_fever", seasons: ["winter"], kicker: "疫", title: "伤兵棚的热病传进了下城", portrait: "assets/renard.webp", body: "军医要隔离营，要烈酒，要干净布。商人把这三样的价钱抬了三倍。雷纳德说，要么现在花钱，要么下个月埋人。", options: [
    ["按军医说的办", "金币 −17，粮食 −6，军心 +5", { gold: -17, grain: -6, morale: 5 }, "病棚外站了岗，病人用单独的井。花的钱肉疼，死的人少了。"],
    ["病人送修道院", "金币 −8，民心 −3，军心 +2", { gold: -8, support: -3, morale: 2 }, "伤兵和下城的病人分批送去了修道院。修士收了钱，没收笑脸。"],
    ["封了下城", "最低稳定 −7，民心 −8；最低守军 +3", { stabilityWeak: -7, support: -8, guardWeak: 3 }, "守军堵了下城的口子，谁也不许出。里头的人在墙上砸了一夜。"] ] },
  { id: "wandering_masons", kicker: "外来人", title: "一帮南方石匠想留下，条件是免三年人头税", portrait: "assets/ysabel.webp", body: "他们会修墙、修磨坊、修桥，手艺比本地的好。本地匠人说，这帮人一来，好活全没了。", options: [
    ["免", "金币 −11，最低守军 +6，民心 +2", { gold: -11, guardWeak: 6, support: 2 }, "石匠在墙根搭了工棚，当周就上了北塔。本地匠人在酒馆骂了一个月。"],
    ["外来的本地的一起干", "金币 −16，稳定 +4", { gold: -16, stabilityAll: 4 }, "两边分了工钱和工位。吵了三天，第四天开工。"],
    ["不免，让他们走", "无需花费；威望 −1", { renown: -1, flag: "masons_left" }, "他们收了家伙往南走。本地匠人很高兴，墙还是那堵墙。"] ] },
  { id: "salt_merchants", seasons: ["autumn", "winter"], kicker: "盐", title: "盐商愿意交钱交盐，要你派兵护路", portrait: "assets/ysabel.webp", body: "派兵是负担，可北境自己不产盐。这条路通了，以后每个冬天都有盐进来。", options: [
    ["派兵护送", "金币 +13，粮食 +7，战争疲劳 +3", { gold: 13, grain: 7, warWeariness: 3, flag: "salt_guarded" }, "一队兵跟着盐车走了一趟。盐商交了钱和盐，说明年还来。"],
    ["只收税，不派人", "金币 +18，民心 −3", { gold: 18, support: -3, flag: "salt_robbed" }, "税收了。盐商回程在林子边被抢了两车。他没再说明年的事。"],
    ["沿路村子自己巡", "金币 +7，稳定 +5", { gold: 7, stabilityAll: 5 }, "村里排了守夜的班。盐车过去了，村里人第一次觉得这条路是自己的。"] ] },
  { id: "clipped_coin", kicker: "坏钱", title: "集市上每三枚银币就有一枚被剪了边", portrait: "assets/ysabel.webp", body: "不收，买卖停摆。收，坏钱进你的金库。伊莎贝尔说，剪边的人就在城里，但抓不到。", options: [
    ["设兑换点", "金币 −9，王室认可 +5，稳定 +2", { gold: -9, legitimacy: 5, stabilityAll: 2 }, "集市设了官方兑换点，缺边的按重量换。第一天排了一条街。"],
    ["按重量收税", "金币 +10，民心 −4", { gold: 10, support: -4 }, "税吏带了秤。商人第二天就把盐、布、铁器全涨了价。"],
    ["照收", "金币 +5，王室认可 −4", { gold: 5, legitimacy: -4 }, "坏钱接着流。几个商人开始拒收渡鸦堡的税票，说和坏钱一样。"] ] },
  { id: "mill_dispute", seasons: ["spring", "summer"], kicker: "水", title: "上游磨坊一开闸，下游的田就干", portrait: "assets/oswin.webp", body: "磨坊主拿着契约，农户也拿着契约。两张都是真的，两张都是先王签的。", options: [
    ["定用水时段", "金币 −5，民心 +6，稳定 +3", { gold: -5, support: 6, stabilityAll: 3 }, "磨坊门口挂了个水钟。磨坊上午用水，田下午用水，谁也不痛快，谁也没饿着。"],
    ["磨坊随便用", "金币 +11，民心 −6", { gold: 11, support: -6 }, "磨坊全天开闸。下游两片田裂了，农户把契约烧了。"],
    ["派兵拆闸", "军心 +2，最低稳定 −3", { morale: 2, stabilityWeak: -3 }, "兵去拆闸，磨坊的护工拦着，打了一架。闸拆了，磨坊停了。"] ] },
  { id: "deserter_band", kicker: "林子里的人", title: "一群南方逃兵占了旧猎屋，想拿剑换饭", portrait: "assets/renard.webp", body: "他们打过仗，也从仗里跑过。雷纳德说，这种人一半能用，一半会再跑，问题是分不出哪一半。", options: [
    ["收了当长矛兵", "粮食 −8，长矛兵 +7，军心 −2", { grain: -8, levy: 7, morale: -2, flag: "deserters_taken" }, "七个人宣了誓，编进长矛队。老兵们看他们的眼神像看贼。"],
    ["收了武器，去开荒", "粮食 −10，民心 +4，稳定 +2", { grain: -10, support: 4, stabilityAll: 2 }, "剑交了，人送去东边的荒地。开春有人看见他们在种地，种得不错。"],
    ["赶走", "威望 +2，民心 −2", { renown: 2, support: -2 }, "守军把他们押出了边界。猎屋附近的村子少了几个临时护卫，多了几个夜里睡不着的人。"] ] },
  { id: "forest_rights", seasons: ["autumn", "winter"], kicker: "禁林", title: "巡林人抓了三个在禁林下套的孩子", portrait: "assets/oswin.webp", body: "旧法是砍手。孩子最大的十三岁，套子里是一只兔子。村民说，冬天快到了，家里没肉。", options: [
    ["村民可以捡柴抓小兽", "民心 +9，王室认可 −2", { support: 9, legitimacy: -2, flag: "hands_spared" }, "城堡贴了告示：枯木随便捡，兔子随便抓，鹿不行。三个孩子当天回了家。"],
    ["罚他们巡一个冬天的林", "稳定 +3，粮食 +5", { stabilityAll: 3, grain: 5 }, "三个孩子跟着巡林人走了一个冬天。手还在，兔子倒是抓了不少，都进了城堡的锅。"],
    ["按旧法砍", "王室认可 +4，军心 +2，民心 −9", { legitimacy: 4, morale: 2, support: -9, flag: "hands_cut" }, "砍了。一个月里，附近村子没人来城堡的集市。"] ] },
  { id: "monastery_tithe", kicker: "旧契", title: "修道院来讨二十年前的教会税", portrait: "assets/oswin.webp", body: "契约是真的，签字是真的，欠税的人全死了。院长说，人死了，账不死。", options: [
    ["全付", "金币 −20，王室认可 +8", { gold: -20, legitimacy: 8 }, "二十金送进修道院。院长在契约上盖了结清印，盖之前先数了一遍。"],
    ["用粮抵一半", "粮食 −18，王室认可 +3", { grain: -18, legitimacy: 3 }, "十八袋粮运进去，剩下的欠款重新写了张契约。院长说，不急。"],
    ["先王的债不归我", "金币不变，威望 +3，王室认可 −7", { renown: 3, legitimacy: -7 }, "契约退了回去。修道院从那周起不再为渡鸦家做公开祈祷，村里人注意到了。"] ] },
  { id: "village_wedding", seasons: ["spring", "summer", "autumn"], kicker: "婚礼", title: "两个结了三代仇的村子想请你证婚", portrait: "assets/player.webp", body: "婚礼也是停战。你带多少礼去，决定停战能撑多久。奥斯温说，带少了，他们会觉得殿下不看重这事；带多了，他们下次还请。", options: [
    ["带酒和两头牛", "金币 −9，粮食 −5，民心 +8", { gold: -9, grain: -5, support: 8 }, "两头牛分给两家亲族，喝到天亮，没打架。新郎的爹和新娘的爹最后抱在一起哭。"],
    ["只带祝福", "王室认可 +2，稳定 +2", { legitimacy: 2, stabilityAll: 2 }, "你在两村面前证了婚。两边当场交换了扣押的牲口，交换得很仔细。"],
    ["让管家去", "金币 −3，民心 +2", { gold: -3, support: 2 }, "奥斯温代你念了祝词，念完把两村签的停战约收进了袖子。"] ] },
  { id: "minor_heir", kicker: "族谱", title: "一个小贵族的遗孤带着族谱来了", portrait: "assets/edmund.webp", body: "族谱能证明他的姓，别的什么都证明不了。没有地，没有人，就一个姓。收下他，多一个侍从，也可能多一场别人家的继承官司。", options: [
    ["收为侍从", "金币 −8，披甲骑士 +1，王室认可 +2", { gold: -8, knights: 1, legitimacy: 2 }, "他编进了侍从队，胸口的旧家徽没摘。"],
    ["给钱送去修道院", "金币 −12，民心 +2", { gold: -12, support: 2 }, "十二金和一个孩子去了修道院。族谱奥斯温封了起来，说以后也许用得上。"],
    ["先放外院看看", "威望 +2，家臣不满 +2", { renown: 2, grievanceAll: 2 }, "他住进了外院。家臣们没给他席位，也没给他随从，就给了一间屋。"] ] },
  { id: "hostage_offer", kicker: "人质", title: "邻家骑士想把长子留在渡鸦堡，换停战和粮", portrait: "assets/renard.webp", body: "收下孩子，两边停战；对方毁约，孩子归你处置。孩子十二岁，在门口站着，没哭。", options: [
    ["收人，给粮", "粮食 −16，最低守军 +5，王室认可 −2", { grain: -16, guardWeak: 5, legitimacy: -2, flag: "hostage_held" }, "十六袋粮送去边境，孩子住进了北塔。第一晚他没睡。"],
    ["只停战，不收人", "粮食 −8，民心 +4，稳定 +2", { grain: -8, support: 4, stabilityAll: 2 }, "停战书签了。孩子跟着使者回了家，走的时候回头看了城堡一眼。"],
    ["不谈", "军心 +3，威望 +2", { morale: 3, renown: 2 }, "使者带着孩子走了。边境守军当晚重新排了岗。"] ] },
  { id: "border_beacon", kicker: "烽火", title: "北边三座烽火台同一晚都没点灯", portrait: "assets/renard.webp", body: "是守夜的偷懒，还是有人故意让边境瞎了一晚？雷纳德要立刻换防。三个守夜的说，那晚风大。", options: [
    ["查，换防", "金币 −10，最低守军 +8，军心 +3", { gold: -10, guardWeak: 8, morale: 3 }, "三个守夜的撤了，新人当晚上岗。风大不大没人再提。"],
    ["守夜赏钱翻倍", "金币 −14，稳定 +3", { gold: -14, stabilityAll: 3 }, "赏钱翻倍，灯重新亮了。那晚为什么灭的，到现在没人说。"],
    ["当众鞭打", "军心 +5，民心 −5", { morale: 5, support: -5 }, "三个守夜的在城门口挨了鞭子。他们的家人一周后搬走了。"] ] },
  { id: "royal_inspector", kicker: "王城的眼睛", title: "一个王室巡察官要一页一页查你的税册和兵册", portrait: "assets/ysabel.webp", body: "配合，王城会高看你一眼。可他也会把你的兵数、人口、存粮一个不落地带回王冠谷。伊莎贝尔说，账她可以重做一套，就是要点时间。", options: [
    ["全打开", "王室认可 +9，金币 −8", { legitimacy: 9, gold: -8 }, "他查了三天，带走了盖印副本。走的时候说，渡鸦堡比传闻的穷。"],
    ["做一套体面账", "金币 −13，威望 +3", { gold: -13, renown: 3 }, "伊莎贝尔连夜重做了缺页。巡察官没看出问题，或者看出了没说。"],
    ["边境有战事，不接待", "王室认可 −8，军心 +4", { legitimacy: -8, morale: 4 }, "城门没开。他当晚在村里的酒馆写了封信，写了很久。"] ] },
  { id: "old_soldiers", kicker: "旧兵", title: "十二个老兵来讨当年远征的欠饷", portrait: "assets/renard.webp", body: "有人少了手指，有人带着先王给的剑，没人带着欠条。领头的说，那年发饷的人死在南边了，可他们没死。", options: [
    ["连本带息还", "金币 −22，军心 +9，威望 +3", { gold: -22, morale: 9, renown: 3 }, "十二个人领了饷和利息。雷纳德把收据交给军需官，脸上第一次有点笑。"],
    ["用地和守军职位抵", "金币 −8，长矛兵 +5，稳定 −2", { gold: -8, levy: 5, stabilityAll: -2 }, "五个人要了地和差事，进了守军。剩下七个什么都没要，走了。"],
    ["没欠条就没欠款", "金币不变，军心 −9，王室认可 +2", { morale: -9, legitimacy: 2 }, "他们没争。把先王的剑放在桌上，走了。剑还在桌上。"] ] },
  { id: "blacksmith_guild", kicker: "铁匠停锤", title: "铁匠不肯再按旧价给军队打箭头和马蹄铁", portrait: "assets/renard.webp", body: "矿石涨价是真的，铁匠想趁打仗抬价也是真的。军队等不了太久，铁匠知道军队等不了太久。", options: [
    ["认新价", "金币 −17，弓箭手 +4，军心 +3", { gold: -17, archers: 4, morale: 3 }, "行会开了工。四个新弓手领到了箭头和护具，铁匠的老婆换了新裙子。"],
    ["出钱建座新炉", "金币 −23，最低守军 +7，稳定 +2", { gold: -23, guardWeak: 7, stabilityAll: 2 }, "新炉在城堡东边开了火。行会不高兴，但也不敢再涨价。"],
    ["直接搬铁料", "无需花费；军心 +5，民心 −8，最低稳定 −2", { morale: 5, support: -8, stabilityWeak: -2 }, "兵把行会的库存搬空了。铁匠关了两间作坊，剩下的锤声也小了。"] ] }
];

// ── 补充事件 ─────────────────────────────────────────────────────────
// seasons 缺省 = 四季都可能。requires 是后续事件的触发条件：
//   flag  某个选项留下的记号（applyEventEffects 里 changes.flag 写入 s.flags[name] = 当季 turn）
//   gap   记号落下之后至少隔几季
//   stat/min/max  额外看一项数值
// 抽取时后续事件优先于普通池，所以「上次的选择」总会在几季后找上门。
WORLD_EVENTS.push(
  { id: "wolves_down", seasons: ["winter"], kicker: "雪夜", title: "狼下山了。三户人家的羊圈一夜之间空了", portrait: "assets/bran.webp", body: "雪深到膝盖，狼比人先饿。牧羊人把一只死羊拖到城门口，说下一个就是人。", options: [
    ["悬赏狼头，一颗一金", "金币 −9，民心 +5", { gold: -9, support: 5 }, "猎户们扛着弓进了林子。三天后城门口挂了七颗狼头，赏金付了七枚。"],
    ["派一队守军去守羊圈", "最低守军 −4，民心 +3，军心 −2", { guardWeak: -4, support: 3, morale: -2 }, "守军在羊圈边上冻了三夜。狼没再来，人倒是骂了三夜。"],
    ["羊是他们的，狼也是他们的", "民心 −6", { support: -6 }, "牧羊人把死羊留在城门口走了。第二天早上羊不见了，血迹通向村里。"] ] },
  { id: "watered_beer", seasons: ["summer"], kicker: "酒馆", title: "麦酒掺了水。士兵把酒保按在桶里灌了个够", portrait: "assets/renard.webp", body: "酒保鼻青脸肿地来告状。士兵们说，掺水的酒喝着跟马尿一样，他们只是帮他尝尝。", options: [
    ["罚士兵，赔酒保", "金币 −6，军心 −4，民心 +3", { gold: -6, morale: -4, support: 3 }, "闹事的几个被罚洗了一个月马厩。酒保收了赔钱，酒里的水少了一半。"],
    ["查酒。掺水的酒馆一律封门", "金币 +4，民心 −2，军心 +3", { gold: 4, support: -2, morale: 3 }, "三家酒馆被封，罚金进了国库。士兵们说这是今年最痛快的一天。"],
    ["各打五十大板，然后请全营喝一顿", "金币 −12，军心 +7", { gold: -12, morale: 7 }, "酒保和士兵一起挨了板子，然后一起喝到天亮。没人再提掺水的事。"] ] },
  { id: "lynched_thief", kicker: "路口的树", title: "村民私刑吊死了一个偷马的。绳子还在树上晃", portrait: "assets/oswin.webp", body: "奥斯温说，那人偷的是寡妇家唯一一匹马。村民没等你判，自己判了。你不管，以后他们什么都自己判。", options: [
    ["吊人的领头人打二十鞭", "民心 −5，稳定 +4，王室认可 +3", { support: -5, stabilityAll: 4, legitimacy: 3 }, "领头的在树下挨了二十鞭。村里人看着，没人吭声。绳子当天被割了。"],
    ["把尸体收了，别的不问", "民心 +2，最低稳定 −4", { support: 2, stabilityWeak: -4 }, "尸体埋在树后头。三个月后，那棵树上又多了一根绳子。"],
    ["立块碑：以后偷马者，就这个下场", "军心 +3，民心 +3，王室认可 −4", { morale: 3, support: 3, legitimacy: -4 }, "碑立在树下。偷马的确实少了，来渡鸦堡告状的也少了。"] ] },
  { id: "relic_monk", kicker: "圣物", title: "一个游方僧要卖你先王的一节指骨", portrait: "assets/oswin.webp", body: "布包里是一截发黄的骨头。僧人说是从父亲战死的地方捡来的，要价十五金。奥斯温看了一眼，说先王的手指没这么短。", options: [
    ["买下来，供在礼拜堂", "金币 −15，王室认可 +5，民心 +3", { gold: -15, legitimacy: 5, support: 3 }, "骨头装进了银匣。信不信是一回事，村民排队来看是另一回事。"],
    ["把他和骨头一起扔出去", "威望 +2", { renown: 2 }, "僧人被扔出城门，骨头扔在他后头。他捡起来拍拍土，去了下一座城。"],
    ["给他五金，让他闭嘴走人", "金币 −5", { gold: -5 }, "五枚金币换他不去别的城说这是渡鸦家的骨头。他答应得很痛快，痛快得让人不放心。"] ] },
  { id: "spring_mud", seasons: ["spring"], kicker: "化冻", title: "路全烂了。三辆运粮车陷在半道，车夫要弃车", portrait: "assets/ysabel.webp", body: "泥到车轴。车夫说再等一天车就沉到底了，粮食要么现在扛走，要么留给泥。", options: [
    ["调民夫去扛粮", "金币 −7，粮食 +14", { gold: -7, grain: 14 }, "五十个民夫在泥里扛了一天。粮食进了仓，人回来时看不出谁是谁。"],
    ["把粮就地分给附近村子", "粮食 −6，民心 +7", { grain: -6, support: 7 }, "附近三个村子的人把车卸空了。他们记得这顿，至少记到秋天。"],
    ["车和粮都不管，先修路", "金币 −10，稳定 +3", { gold: -10, stabilityAll: 3 }, "粮食沉进了泥里。路修好了，明年的车不会再陷在这儿。"] ] },
  { id: "harvest_hands", seasons: ["autumn"], kicker: "收麦", title: "麦子熟透了，地里缺人手。军营里有两百个闲人", portrait: "assets/ysabel.webp", body: "伊莎贝尔算过：士兵下地十天，能多收三成。雷纳德说，让士兵拿镰刀，下次打仗他们就只会拿镰刀。", options: [
    ["全营下地十天", "粮食 +22，军心 −6", { grain: 22, morale: -6 }, "两百个士兵弯了十天腰。麦子全进了仓，骂声也全进了军营。"],
    ["只派新兵去", "粮食 +11，军心 −2", { grain: 11, morale: -2 }, "新兵下地，老兵在营里笑他们。麦子收了一半多。"],
    ["士兵是打仗的，不下地", "粮食 −8，军心 +3", { grain: -8, morale: 3 }, "有一片麦子烂在了地里。雷纳德说，值。"] ] },
  { id: "summer_fair", seasons: ["summer"], kicker: "赛会", title: "集市要办摔跤赛。商人想抽头，士兵想下注，教士想禁", portrait: "assets/player.webp", body: "三拨人在大厅门口吵成一团。奥斯温说，随便哪一拨赢了，另外两拨都记恨你。", options: [
    ["办。城堡抽两成", "金币 +14，民心 +4，王室认可 −2", { gold: 14, support: 4, legitimacy: -2 }, "赛会办了三天。城堡抽了头，教士在门口念了三天经，没人听。"],
    ["办。不抽头，赢家由领主赏", "金币 −8，民心 +8，军心 +3", { gold: -8, support: 8, morale: 3 }, "冠军是个铁匠学徒，把一个骑士摔得半天没起来。你赏了他一把剑。"],
    ["禁了", "民心 −5，王室认可 +2", { support: -5, legitimacy: 2 }, "赛会禁了。摔跤改在林子里办，抽头的换成了别人。"] ] },
  { id: "widow_field", kicker: "田产", title: "寡妇的地被小叔子占了。两边都拿着地契", portrait: "assets/oswin.webp", body: "寡妇有三个孩子。小叔子有六个。两张地契都是先王的书记写的，字迹一模一样。", options: [
    ["地归寡妇，小叔子滚", "民心 +4，最低稳定 −3", { support: 4, stabilityWeak: -3 }, "小叔子带着六个孩子搬去了邻村。走之前把井填了。"],
    ["地一分为二", "民心 +2，稳定 +2", { support: 2, stabilityAll: 2 }, "地从中间划开。两家都说吃了亏，两家都没再来告状。"],
    ["地归城堡，两家都当佃户", "金币 +6，民心 −5", { gold: 6, support: -5 }, "地进了城堡的册子。两家人一起交租，一起骂你。"] ] },
  { id: "father_alive", kicker: "酒馆的话", title: "有人在酒馆里说，先王没死，在南边当雇佣兵", portrait: "assets/edmund.webp", body: "说这话的是个断了腿的老兵。他说亲眼见过，那人左脸有疤，用左手拿剑。父亲确实是左撇子。", options: [
    ["派人去南边找", "金币 −14，王室认可 +2", { gold: -14, legitimacy: 2 }, "两个骑士南下了。三个月后回来，说找到了一个左撇子，不是他。"],
    ["把老兵关起来", "民心 −4，王室认可 +4", { support: -4, legitimacy: 4 }, "老兵关进了地牢。酒馆里没人再说这事，但也没人再说别的。"],
    ["请他喝酒，听他说完", "金币 −3，民心 +3", { gold: -3, support: 3 }, "老兵喝到第三杯改口说是右脸有疤，第五杯说可能是右手拿剑。你替他付了酒钱。"] ] },
  { id: "bridge_toll", kicker: "桥头", title: "桥头收过路费的守军，把钱塞进了自己的靴子", portrait: "assets/renard.webp", body: "账上一季四金，商人说他们一季至少交了二十。守桥的是雷纳德的老部下。", options: [
    ["查。贪的全吐出来", "金币 +16，军心 −5", { gold: 16, morale: -5 }, "靴子里翻出十六金。守桥的换了人，新人的靴子暂时是空的。"],
    ["把桥税包给商人，守军只管守", "金币 +8，稳定 +3", { gold: 8, stabilityAll: 3 }, "商人自己收自己的税，守军回营。账目第一次对上了。"],
    ["守军辛苦，睁一眼闭一眼", "军心 +4，民心 −4", { morale: 4, support: -4 }, "守桥的知道你知道。他们收得更狠了，但也守得更勤了。"] ] },
  { id: "frozen_river", seasons: ["winter"], kicker: "冰面", title: "河封冻了。狼牙那边的商队踩着冰过来卖皮子", portrait: "assets/bran.webp", body: "十几个裹着狼皮的汉子站在冰上，说要用皮子换盐和铁。他们身上带着刀，但没拔。", options: [
    ["换。皮子好，铁也不缺", "金币 +9，民心 +3，王室认可 −2", { gold: 9, support: 3, legitimacy: -2 }, "皮子换了铁。他们走时说明年还来。狼牙的人说话算数，打仗也算数。"],
    ["换皮子可以，铁不卖", "金币 +5", { gold: 5 }, "他们只换到了盐。走的时候有人往冰上吐了口唾沫。"],
    ["把冰面凿开，人赶回去", "最低守军 +3，民心 −2，军心 +2", { guardWeak: 3, support: -2, morale: 2 }, "冰凿开了一道口子。他们绕远路回去了，皮子背在背上，刀握在手里。"] ] },
  { id: "beekeeper", seasons: ["spring", "summer"], kicker: "蜂箱", title: "养蜂人要在城墙根放二十只蜂箱", portrait: "assets/oswin.webp", body: "他说墙根向阳，蜜好。守军说，上次有人被蛰得从墙上掉下来。", options: [
    ["放。蜜分城堡三成", "粮食 +6，民心 +3", { grain: 6, support: 3 }, "蜂箱排在墙根。守军学会了走另一边，蜜倒是真的好。"],
    ["放到林子边去", "民心 +1", { support: 1 }, "蜂箱搬去了林边。养蜂人说那边蜜差，但也没再来烦你。"],
    ["不放。城墙是打仗的", "军心 +2，民心 −2", { morale: 2, support: -2 }, "养蜂人背着蜂箱走了。守军松了口气，然后又开始抱怨没蜜吃。"] ] },
  { id: "bard_song", kicker: "歌", title: "一个游吟诗人在酒馆唱你父亲怎么打败仗的", portrait: "assets/edmund.webp", body: "歌很长，押韵，也很难听。酒馆里有人跟着唱。埃德蒙说他也会唱。", options: [
    ["把他拖出来割了舌头", "军心 +3，民心 −7，王室认可 −3", { morale: 3, support: -7, legitimacy: -3 }, "诗人再没唱过歌。那首歌倒是传得更远了，多了一段讲你割舌头。"],
    ["赏他十金，让他写一首新的", "金币 −10，威望 +4", { gold: -10, renown: 4 }, "新歌讲的是你怎么继承渡鸦堡。比旧歌短，也比旧歌难听。但酒馆里唱的是新的。"],
    ["让他唱。唱完请他喝一杯", "民心 +4", { support: 4 }, "你在酒馆听完了整首歌，然后请他喝了一杯。他第二天走了，歌留下了。"] ] },
  { id: "tax_riot", seasons: ["autumn"], kicker: "税", title: "两个村子把税吏捆在牛车上送了回来", portrait: "assets/ysabel.webp", body: "税吏没受伤，就是身上被泼了粪。村民说，秋税加了三成，谁定的？伊莎贝尔说，没人定，是税吏自己加的。", options: [
    ["税吏问罪，多收的退回", "金币 −11，民心 +8，稳定 +3", { gold: -11, support: 8, stabilityAll: 3 }, "税吏戴着枷在村口站了三天。多收的钱退回去了，税吏没退回去。"],
    ["税吏问罪，多收的充公", "金币 +6，民心 +2", { gold: 6, support: 2 }, "税吏进了地牢，钱进了国库。村民说这跟没退也差不多。"],
    ["捆税吏的人抓起来", "王室认可 +3，民心 −9，最低稳定 −5", { legitimacy: 3, support: -9, stabilityWeak: -5 }, "抓了六个。那两个村子今年的税一粒麦子都没交上来。"] ] },

  // 后续事件：上一次的选择过几季找上门
  { id: "deserters_hold", requires: { flag: "deserters_taken", gap: 2, stat: "morale", min: 45 }, kicker: "旧账", title: "那几个逃兵，昨天在演武场上把骑士队撂倒了", portrait: "assets/renard.webp", body: "雷纳德不情愿地说：“打得不赖。狗东西在南边学的，看来没白跑。”", options: [
    ["编入前列，给正式军饷", "军心 +6，长矛兵 +3", { morale: 6, levy: 3 }, "七个逃兵成了前列。他们自己又拉来三个，说是南边的老伙计。"],
    ["赏酒，别的照旧", "军心 +3", { morale: 3 }, "一桶酒抬进营里。逃兵喝了，老兵也喝了，喝完谁也没提逃兵这两个字。"] ] },
  { id: "deserters_run", requires: { flag: "deserters_taken", gap: 2, stat: "morale", max: 44 }, kicker: "旧账", title: "逃兵夜里跑了。带走了七把矛和马厩里最好的两匹马", portrait: "assets/renard.webp", body: "雷纳德把断了的门闩扔在桌上：“逃过一次的人，就会逃第二次。我说过。”", options: [
    ["派骑兵追", "金币 −5，军心 +2，长矛兵 −7", { gold: -5, morale: 2, levy: -7 }, "追到林边，只找回一匹马。矛和人都没了。"],
    ["算了。让他们跑", "军心 −4，长矛兵 −7", { morale: -4, levy: -7 }, "营里少了七个人和七把矛。老兵说，早知道。"] ] },
  { id: "hostage_betrayed", requires: { flag: "hostage_held", gap: 3 }, kicker: "人质", title: "邻家骑士毁约了。他儿子还在你的北塔里", portrait: "assets/renard.webp", body: "骑士带人劫了边境两个村。按约定，那孩子归你处置。孩子十二岁，在塔里养了一只乌鸦。", options: [
    ["按约处死，头送回去", "军心 +5，民心 −8，王室认可 −5", { morale: 5, support: -8, legitimacy: -5 }, "头送了回去。骑士没再来劫村，也没人再跟渡鸦家换人质。"],
    ["放他回去，带一句话", "民心 +4，王室认可 +2，最低守军 −4", { support: 4, legitimacy: 2, guardWeak: -4 }, "孩子带着乌鸦回了家。骑士又劫了一个村，然后就再没消息。"],
    ["留他当侍从，不提这事", "威望 +2，民心 +2", { renown: 2, support: 2 }, "孩子留下了，乌鸦也留下了。三年后他成了你最好的侍从之一。"] ] },
  { id: "masons_gone_wolf", requires: { flag: "masons_left", gap: 2 }, kicker: "石匠", title: "被你赶走的石匠去了狼牙。北境关又高了一截", portrait: "assets/bran.webp", body: "斥候说，新墙用的是南方的手艺，比旧墙厚一倍。布兰给了他们十年免税。", options: [
    ["知道了", "狼牙氏族全部领地守军 +8", { guardFaction: ["wolf", 8] }, "石匠在北境关修了一整个夏天。布兰站在新墙上朝南边看了很久。"] ] },
  { id: "hands_revenge", requires: { flag: "hands_cut", gap: 2 }, kicker: "禁林", title: "巡林人的屋子夜里被烧了。三个孩子的爹一起干的", portrait: "assets/renard.webp", body: "巡林人没死，烧伤了半张脸。三个男人跑进了林子，村里没人肯说他们往哪跑了。", options: [
    ["搜林子，抓到吊死", "军心 +3，民心 −8，最低稳定 −6", { morale: 3, support: -8, stabilityWeak: -6 }, "搜了七天，抓到一个。吊在了砍手的那棵树上。另外两个再没回来，他们的地荒了。"],
    ["不追。给巡林人补一间屋", "金币 −6，民心 +2", { gold: -6, support: 2 }, "新屋盖在旧屋的灰上。巡林人不肯住，去了别的林子。"] ] },
  { id: "hands_mushrooms", requires: { flag: "hands_spared", gap: 2 }, seasons: ["spring", "summer", "autumn"], kicker: "禁林", title: "三个孩子送来一筐蘑菇，放在城门口就跑了", portrait: "assets/oswin.webp", body: "筐上拴了一根兔子皮。奥斯温说，是禁林里的种，这三个小崽子还在里头设套。", options: [
    ["收下。让厨房做了", "民心 +4，粮食 +2", { support: 4, grain: 2 }, "蘑菇炖了一锅。那三个孩子后来每年春天都送一筐，一直送到他们长大。"],
    ["收下，让巡林人盯紧点", "稳定 +2", { stabilityAll: 2 }, "巡林人盯了一个月，什么也没抓到。蘑菇很好吃。"] ] },
  { id: "salt_returns", requires: { flag: "salt_guarded", gap: 3 }, seasons: ["winter"], kicker: "盐车", title: "盐商又来了。这次带了两车盐，和一封给你的信", portrait: "assets/ysabel.webp", body: "信上说，北境的路是今年最安全的路，南方的商会想知道你要什么。伊莎贝尔说，这意思是他们想要专营。", options: [
    ["给他们专营，抽一成", "金币 +20，王室认可 −2", { gold: 20, legitimacy: -2 }, "盐路专营给了南方商会。冬天有盐了，价钱是他们定的。"],
    ["不专营。谁的车都能走", "金币 +8，民心 +5", { gold: 8, support: 5 }, "盐商有点失望，但还是卸了两车盐。第二年来了三家盐商。"] ] },
  { id: "salt_gone", requires: { flag: "salt_robbed", gap: 3 }, seasons: ["winter"], kicker: "盐", title: "冬天到了，一辆盐车都没来", portrait: "assets/ysabel.webp", body: "去年被抢的盐商回南方讲了一路。今年北境的盐价翻了三倍，腌肉的缸空了一半。", options: [
    ["高价从河望买盐", "金币 −16，民心 +2", { gold: -16, support: 2 }, "艾芙琳的人卖了盐，价是三倍。腌肉缸满了，国库瘪了。"],
    ["没盐就没盐", "民心 −7，粮食 −10", { support: -7, grain: -10 }, "腌不住的肉臭在了缸里。村民这个冬天吃了很多没味道的粥。"] ] }
);

const NPC_ARCS = [
  { id: "oswin_old_debt", officerId: "oswin", minTurn: 2, title: "奥斯温翻出一本旧账", body: "账本纸都黄了。“先王那几年多收的粮，哪户多收了几袋，都在这上头。六年了，那些人还在种地。还不还，您一句话。我就是个记账的。”", options: [["逐户退", "粮食 −14；奥斯温忠诚 +8，民心 +6", { grain: -14, support: 6, loyalty: 8 }, "奥斯温带着书记一村一村地走，十四袋麦子退回去。有个老太太不肯收，说先王早死了。"], ["账封起来", "王室认可 +2；奥斯温不满 +8", { legitimacy: 2, grievance: 8 }, "账本锁进了柜子。奥斯温没再提，但他记账的手明显慢了。"], ["有凭据的退，没凭据的算了", "粮食 −6；奥斯温忠诚 +2", { grain: -6, loyalty: 2 }, "五户拿出了旧凭据，退了六袋。剩下的名字还在账上，奥斯温没划掉。"]] },
  { id: "renard_veterans", officerId: "renard", minTurn: 3, title: "雷纳德把十二个名字拍在桌上", body: "“死人不领饷，家里人得吃饭。这十二个是上一仗死的，家里都在等。全营的人都在看您怎么办——您要是不管，下次他们就不冲了。”", options: [["每家一块免税田", "金币 −10，民心 +4；雷纳德忠诚 +8", { gold: -10, support: 4, loyalty: 8 }, "十二块地划了出去。雷纳德把名单收进怀里，说这才像话。"], ["一次性发抚恤", "金币 −7；雷纳德忠诚 +2", { gold: -7, loyalty: 2 }, "每家七个银币。雷纳德没说什么，但也没说好。"], ["不给。军饷发到死为止", "王室认可 +2；雷纳德忠诚 −8、不满 +10", { legitimacy: 2, loyalty: -8, grievance: 10 }, "雷纳德把名单收回去，之后三次军议一个字没说。"]] },
  { id: "ysabel_hidden_ledger", officerId: "ysabel", minTurn: 4, title: "伊莎贝尔查到一本暗账", body: "“少的税不是一个人拿的，六个村的大户都有份。继续查，能追回八金，也会得罪六个村。停手，就当没看见。您选。”", options: [["查到底", "金币 +8，民心 +5；伊莎贝尔忠诚 +7", { gold: 8, support: 5, loyalty: 7 }, "六个税吏撤了，八金追回来。伊莎贝尔把暗账抄了一份，锁在她自己的柜子里。"], ["罚钱，人留着", "金币 +17；伊莎贝尔不满 +6", { gold: 17, grievance: 6 }, "罚金收了十七金。税吏还是那六个，暗账还是那本，只是这次记得更小心了。"], ["名单给我，别声张", "金币 +12，王室认可 −4；伊莎贝尔功劳 +3", { gold: 12, legitimacy: -4, merit: 3 }, "名单进了你的私库。伊莎贝尔留了一份副本，你知道她留了。"]] },
  { id: "edmund_bastard_seal", officerId: "edmund", minTurn: 5, title: "埃德蒙要一枚渡鸦家的印", body: "“我的军令到每个村都要重新核验，耽误半天。给我枚备用印，命令早到半天，死的人少一半。至于别人怎么想——堂弟，别人怎么想从来不是我的事。”", options: [["给他", "埃德蒙忠诚 +9、功劳 +4；王室认可 −3", { loyalty: 9, merit: 4, legitimacy: -3 }, "他接过印，当场在一封军令上盖了。盖得很重。"], ["只许战时用", "埃德蒙忠诚 +3；威望 +1", { loyalty: 3, renown: 1 }, "印锁进军械库，出征才领。他说行，语气像说不行。"], ["不给", "王室认可 +4；埃德蒙不满 +10", { legitimacy: 4, grievance: 10 }, "他把没盖印的军令收回去。“行，堂弟。”就这一句。"]] },
  { id: "oswin_village_rolls", officerId: "oswin", minTurn: 8, title: "奥斯温要重登户口", body: "“旧册漏了三十七户，去年逃荒回来的人一个没记。先记灾户，救济不会送错人；全记清，征税征兵也不会送错人。就看您想先做哪件。”", options: [["先记该救的", "民心 +5；奥斯温功劳 +5", { support: 5, merit: 5 }, "书记先登了缺粮、生病、没劳力的。救济名单重排了一遍，有三户是第一次领到。"], ["户口粮食牲畜全记", "金币 +9，王室认可 +3；民心 −4", { gold: 9, legitimacy: 3, support: -4 }, "一户一户数，连鸡都数了。多出来的税户和壮丁进了新册，村里人看书记的眼神变了。"], ["旧册凑合用", "不花资源；奥斯温忠诚 −5", { loyalty: -5 }, "旧册接着用。那三十七户这一季的救济和税都没他们的份，好的坏的都没有。"]] },
  { id: "renard_mercy", officerId: "renard", minTurn: 9, title: "雷纳德抓了个逃兵", body: "他把剑放在桌上。“临阵跑的，按军法该死。可这小子他爹上一仗死的，家里就剩他一个。军法是军法，人是人。您定。”", options: [["罚去最前排，不杀", "军心 +2；雷纳德忠诚 +5，民心 +3", { morale: 2, loyalty: 5, support: 3 }, "小子调到了前排。后面两次操练他都是第一个到的。"], ["按军法杀", "军心 +6，民心 −5；雷纳德不满 +4", { morale: 6, support: -5, grievance: 4 }, "雷纳德亲自主持的宣判。他没看那孩子的脸。"], ["你的兵，你定", "雷纳德功劳 +4、忠诚 +3", { merit: 4, loyalty: 3 }, "雷纳德判了鞭刑，把小子留在自己队里。他说这是他的兵，他自己管。"]] },
  { id: "ysabel_market_charter", officerId: "ysabel", minTurn: 10, title: "伊莎贝尔想让商人自己管秤", body: "“让商人选四个人管秤，城堡只管定期查。一季能多收十二金，商人也不用天天跟税吏吵。坏处是——他们会觉得秤是自己的。”", options: [["让商人自己选", "金币 +12，民心 +5，王室认可 −2；伊莎贝尔忠诚 +6", { gold: 12, support: 5, legitimacy: -2, loyalty: 6 }, "四个管秤的选出来了。铜秤砣上盖了城堡的印，秤是商人的，印是你的。"], ["城堡指定", "金币 +8，王室认可 +3", { gold: 8, legitimacy: 3 }, "四个管秤的是你任命的。商人可以推荐人选，推荐了三个，你用了一个。"], ["税吏接着管", "金币 +4；伊莎贝尔不满 +7", { gold: 4, grievance: 7 }, "税吏还管着秤。外地商队还是那么几家，一家没多。"]] },
  { id: "edmund_whispers", officerId: "edmund", minTurn: 11, title: "大厅里有人说，埃德蒙更像先王", body: "埃德蒙先开了口：“不是我让他们说的。堂弟，你要我堵住每张嘴，也行——给我个名分。不然他们明天换个说法，我还得再堵一次。”", options: [["当众叫他兄弟", "王室认可 −6；埃德蒙忠诚 +13、不满 −10", { legitimacy: -6, loyalty: 13, grievance: -10 }, "你在所有家臣面前叫了他一声兄弟，书记记进了家族册。他愣了一下，然后笑了。"], ["让他当众宣誓", "王室认可 +5；埃德蒙忠诚 −4", { legitimacy: 5, loyalty: -4 }, "他宣了誓，回到座位上，没再开口。宣誓词一个字没错，语气全错。"], ["查是谁在传", "军心 +3；埃德蒙不满 +6，民心 −3", { morale: 3, grievance: 6, support: -3 }, "三个侍从被赶出城堡。村里照样在传，只是传的人换了。"]] },
  { id: "aveline_river_envoy", officerId: "aveline", minTurn: 12, side: "any", title: "艾芙琳派了个渡船主人来", body: "渡船主人没带武器，带了句话：“河望要是哪天降旗，渡船、水闸、河税，还归不归河地人管？伯爵想先听个准话。”", options: [["河地旧规矩不动", "王室认可 −2，民心 +4；她以后加入，初始忠诚 +8", { legitimacy: -2, support: 4, loyalty: 8 }, "你的话被抄了六份，送去河望的渡口和集市。渡船主人走的时候鞠了一躬。"], ["所有领地一套规矩", "王室认可 +5；艾芙琳不满 +6", { legitimacy: 5, grievance: 6 }, "渡船主人听完，当天就回了河望。没鞠躬。"], ["先交过路税再说", "金币 +9；她以后加入，初始忠诚 −4", { gold: 9, loyalty: -4 }, "九金交了。河地规矩的事，他没再问，你也没再说。"]] },
  { id: "bran_blood_price", officerId: "bran", minTurn: 13, side: "any", title: "布兰扔来三把断剑", body: "信使把三把断剑扔在地上：“三批俘虏换三批俘虏。布兰说，少一个人，少换一队。他还说——渡鸦家的小崽子要是敢耍花样，下次扔的就不是剑。”", options: [["等额换", "长矛兵 +4，民心 +2；他以后加入，初始忠诚 +6", { levy: 4, support: 2, loyalty: 6 }, "河滩上换的人。四个长矛兵回来了，瘦了一圈，没缺胳膊腿。"], ["伤员无条件放回", "民心 +6，威望 −2；布兰不满 −4", { support: 6, renown: -2, grievance: -4 }, "狼牙人把伤员带走了，什么都没留下。三天后有人在城门口放了一张狼皮。"], ["不换，俘虏示众", "军心 +5，民心 −6；布兰不满 +8", { morale: 5, support: -6, grievance: 8 }, "三把断剑钉在了城门上。狼牙那边再没派过信使。"]] },
  { id: "aveline_shared_table", officerId: "aveline", minTurn: 16, side: "player", title: "艾芙琳要一个正式席位", body: "她站在座位旁边没坐。“殿下让我坐末席，河地人就会认为我没权了。没权的伯爵管不住河地。我要一个正式席位——不是为我，是为殿下省事。”", options: [["给她河地席位", "艾芙琳忠诚 +11、功劳 +3；王室认可 −2", { loyalty: 11, merit: 3, legitimacy: -2 }, "长桌多了一把椅子，椅背刻着河望的波纹。她坐下了，坐得很直。"], ["席位按功劳排", "威望 +3；艾芙琳忠诚 +3", { renown: 3, loyalty: 3 }, "席位改按功劳排。她排在第三，坐下了，说这规矩公道。"], ["不给伯爵席位", "王室认可 +4；艾芙琳忠诚 −9、不满 +12", { legitimacy: 4, loyalty: -9, grievance: 12 }, "她坐下了，坐末席。一整晚没碰酒杯。"]] },
  { id: "bran_wolf_oath", officerId: "bran", minTurn: 17, side: "player", title: "布兰要在城外重新宣誓", body: "“狼牙人在火边发誓，不在屋里。渡鸦旗挂最高，行。你来不来，给我一句话——你不来，我的人会觉得你看不起火。”", options: [["亲自去", "粮食 −6；布兰忠诚 +12，军心 +5", { grain: -6, loyalty: 12, morale: 5 }, "火堆有一人高。狼牙旧部一个个上前，渡鸦旗挂在氏族旗上头。布兰最后一个，跪得很快。"], ["派雷纳德去", "布兰忠诚 +4，威望 +2", { loyalty: 4, renown: 2 }, "雷纳德去了。回来说，火是好火，人是好人，就是有人问了三次殿下怎么没来。"], ["进大厅跪着宣", "王室认可 +5；布兰忠诚 −10、不满 +13", { legitimacy: 5, loyalty: -10, grievance: 13 }, "布兰进了大厅。跪下得很慢，很慢。"]] },
  // 罗德里克
  { id: "roderic_back_pay", officerId: "roderic", minTurn: 6, side: "player", title: "罗德里克来对账", body: "“十一年欠饷，我算过：连本带利一百四十金。您要是一次付清，石颚堡的人以后只认渡鸦旗。要是不付——我也不走，就是心里有本账。”", options: [["一次付清", "金币 −40；罗德里克忠诚 +15，军心 +3", { gold: -40, loyalty: 15, morale: 3 }, "他数了三遍，数完把钱袋系在腰上，说这下踏实了。"], ["分四季付", "金币 −12；罗德里克忠诚 +5", { gold: -12, loyalty: 5 }, "第一笔付了。他点点头，说先王当年也是这么说的。"], ["先王的账不归我", "王室认可 +2；罗德里克忠诚 −10、不满 +12", { legitimacy: 2, loyalty: -10, grievance: 12 }, "他没吵，就说了一句：“行，我记着。”"]] },
  { id: "roderic_pass_wall", officerId: "roderic", minTurn: 14, side: "player", title: "罗德里克想修石颚堡的墙", body: "“北面墙裂了三道，冬天一冻就塌。给我三十金和二十个民夫，开春前修好。不给的话，下次狼牙来我就只能拿人堵。我堵过，不好用。”", options: [["给钱给人", "金币 −30，最低守军 +10；罗德里克忠诚 +8", { gold: -30, guardWeak: 10, loyalty: 8 }, "墙开春前修好了。他在新墙上刻了个石手印，说这是他的活。"], ["只给民夫，钱自己想办法", "最低守军 +4；罗德里克忠诚 +1", { guardWeak: 4, loyalty: 1 }, "他把关里的旧箭塔拆了补墙。墙修了一半，箭塔没了。"], ["等打完仗再说", "罗德里克不满 +7", { grievance: 7 }, "他说行。冬天墙塌了一段，他真拿人堵了，堵住了。"]] },
  // 浅写附庸按原型各一条：谁归附了就落在谁头上，一局只弹一次
  { id: "venal_side_deal", archetype: "venal", minTurn: 4, side: "player", title: "{name}悄悄带来一桩买卖", body: "“有个南方商队想走我们这条路，不想交正税，想交个「心意」。心意归我们俩分。殿下要是不方便知道，就当我没说。”", options: [["拿了，分他一半", "金币 +14，王室认可 −5；忠诚 +6", { gold: 14, legitimacy: -5, loyalty: 6 }, "钱到了。他很高兴，你也拿到了钱。这事没人知道，除了你们俩和整个商队。"], ["让商队交正税", "金币 +6，王室认可 +2；不满 +5", { gold: 6, legitimacy: 2, grievance: 5 }, "商队交了正税，少交了一半。他说殿下真是个正派人，说得不像夸。"], ["再有下次，割他的舌头", "王室认可 +4；忠诚 −8，不满 +10", { legitimacy: 4, loyalty: -8, grievance: 10 }, "他脸白了一下，然后说明白了。以后再没带来过买卖，也没带来过别的。"]] },
  { id: "garrison_new_wall", archetype: "garrison", minTurn: 6, side: "player", title: "{name}只想要一堵新墙", body: "“我不要地，不要官，就要把我那段墙再加高三尺。加高了我守得住，守得住殿下就少操一份心。二十金。”", options: [["给", "金币 −20，最低守军 +8；忠诚 +7", { gold: -20, guardWeak: 8, loyalty: 7 }, "墙高了三尺。他每天早上上去走一圈，走完才吃饭。"], ["给一半", "金币 −10，最低守军 +3；忠诚 +2", { gold: -10, guardWeak: 3, loyalty: 2 }, "加高了一尺半。他说也行，语气像不行。"], ["现在没钱", "不满 +5", { grievance: 5 }, "他没再要。但下次军议，他坐得离你远了一个位子。"]] },
  { id: "loyalist_old_flag", archetype: "loyalist", minTurn: 6, side: "player", title: "{name}还留着旧主君的旗", body: "有人报告他屋里挂着旧旗。他自己来了：“旗是他给我的，人不在了，旗我留着。殿下要是嫌碍眼，我现在就烧，但我不会说那是面坏旗。”", options: [["留着，没人管你", "忠诚 +10，民心 +2", { loyalty: 10, support: 2 }, "旗还挂着。他从那天起，军议第一个到。"], ["收起来，别挂出来", "忠诚 +2", { loyalty: 2 }, "旗收进了箱子。他说好，说得很轻。"], ["当面烧了", "王室认可 +3；忠诚 −12，不满 +10", { legitimacy: 3, loyalty: -12, grievance: 10 }, "他烧了。烧的时候没看火，看你。"]] },
  { id: "waverer_neighbour", archetype: "waverer", minTurn: 6, side: "player", title: "{name}问下一个打谁", body: "“殿下，我跟着您是因为您能赢。隔壁那位最近在招兵，我看着心慌。您要是打他，我出人；您要是不打——我就得想想我站的地方对不对。”", options: [["告诉他下一个就是隔壁", "军心 +3；忠诚 +6", { morale: 3, loyalty: 6 }, "他松了口气，说他能出二十个人。后来出了十二个。"], ["让他管好自己的城", "忠诚 −3", { loyalty: -3 }, "他说是，走的时候回头看了两次。"], ["再问一次就换人守他的城", "王室认可 +2；忠诚 −8，不满 +8", { legitimacy: 2, loyalty: -8, grievance: 8 }, "他不问了。他的城从那以后守军总是刚好够数，一个不多。"]] }
];

// 事件统一使用当前版本的六项资源与忠诚；旧存档仍可通过效果迁移继续读取。
const CREST_PATHS = {
  player: '<path d="M8 3h32v26c0 10-7 17-16 21C15 46 8 39 8 29V3Z"/><path d="M15 30c5-3 7-9 9-17 2 8 4 14 9 17-3 0-5 1-9 5-4-4-6-5-9-5Z"/><path d="m18 18 6-5 6 5-6-2-6 2Z"/>',
  wolf: '<path d="M8 3h32v26c0 10-7 17-16 21C15 46 8 39 8 29V3Z"/><path d="m14 16 5-7 5 6 5-6 5 7-2 16-8 7-8-7-2-16Z"/><path d="m19 24 3 2m7-2-3 2m-5 7h6"/>',
  river: '<path d="M8 3h32v26c0 10-7 17-16 21C15 46 8 39 8 29V3Z"/><path d="M13 30c4-4 8-4 11 0 3-4 7-4 11 0M13 36c4-4 8-4 11 0 3-4 7-4 11 0M15 23h18M18 23v-7m12 7v-7m-15 0h18"/>',
  crown: '<path d="M8 3h32v26c0 10-7 17-16 21C15 46 8 39 8 29V3Z"/><path d="m14 18 5 5 5-9 5 9 5-5-2 12H16l-2-12Zm3 17h14"/>'
};

const GLYPH_PATHS = {
  levy: '<path d="M10 36 35 7m-5 1 6-2-2 6M8 32l8 8M18 15l11 11M20 37H8l2-12 10 12Z"/>',
  archers: '<path d="M12 7c14 7 14 27 0 34m0-17h25m-6-5 6 5-6 5M12 7c-8 8-8 26 0 34"/>',
  knights: '<path d="M16 38h19l-2-8-6-4 4-10-7-8-9 6-3 15 4 9Zm2-19 8-3m-4-7 1 6"/>',
  heavy_infantry: '<path d="M12 39V17l12-8 12 8v22M17 22h14M18 29h12M20 39V29h8v10"/>',
  crossbowmen: '<path d="M8 24h32M24 9v30M13 13l22 22m0-22L13 35M10 19l5 5-5 5m28-10-5 5 5 5"/>',
  light_cavalry: '<path d="M9 37h28M13 32l6-12 9-4 6 9-8 2-5 8m1-15 5-7 6 3M19 20l-7-4"/>',
  fields: '<path d="M7 38h34M12 38c3-12 2-21-1-30m5 8-5 5m-3 4 5 4m14 9c-2-11-1-19 3-27m-7 8 5 4m5 2-6 5"/>',
  market: '<path d="M8 18h32l-3-10H11L8 18Zm3 0v22h26V18M17 40V27h12v13M9 18c1 7 7 7 9 0 2 7 8 7 10 0 2 7 8 7 10 0"/>',
  barracks: '<path d="M8 40h32M12 40V18l12-9 12 9v22M19 40V28h10v12M8 18h32"/>',
  walls: '<path d="M7 40h34V16h-6V9h-7v7h-8V9h-7v7H7v24Zm13 0V29h8v11"/>',
  granary: '<path d="M10 20h28v20H10zM8 20l16-11 16 11M16 26h4m8 0h4m-16 8h4m8 0h4"/>',
  academy: '<path d="M8 18 24 9l16 9-16 9L8 18Zm7 5v9c5 4 13 4 18 0v-9M24 27v13"/>',
  workshop: '<path d="M9 39h30M13 35l8-8 5 5 10-13M31 16h6v6"/>',
  roads: '<path d="M8 40h32M12 34l8-8 7 5 9-13M14 13h20"/>',
  watchtower: '<path d="M14 40V18h20v22M10 18h28M18 18l6-9 6 9M20 26h8v8h-8z"/>',
  temple: '<path d="M8 40h32M12 37V20h24v17M8 20h32L24 9 8 20Zm9 0v17m7-17v17m7-17v17"/>'
};

