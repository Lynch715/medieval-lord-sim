"use strict";

// 纯数据表：时间、势力、领地、领主、骑士、建筑、兵种、地图、事件、纹章。
// 不得出现函数声明。五段数据区的相对顺序不可调整 —— 加载期的展开（邻接对称化、
// 附庸生成、骑士归属反查）依赖它。

const SAVE_KEY = "iron-crown-lord-save-v1";
const VERSION = 7;
// 加冕记在游戏时间（elapsedMs）上而非真实时间，这样暂停与离线都不会让公爵偷跑。
const CORONATION_AT_MS = 48 * 5 * 60 * 1000;      // 12 游戏年
const CORONATION_DELAY_MS = 20 * 60 * 1000;       // 每拿下一块公爵直辖地推迟 20 分钟
const TIME_CONFIG = {
  seasonDurationMs: 5 * 60 * 1000,
  logicTickMs: 1000,
  uiTickMs: 250,
  // 离线只推进一季；长时间离开不应把玩家锁死在连续崩溃判定里。
  maxCatchUpMs: 2 * 60 * 60 * 1000
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
  { id: "spring", name: "春", phase: "春耕", grain: .45, gold: 1, note: "土地解冻，适合开垦与整顿村庄。" },
  { id: "summer", name: "夏", phase: "备战", grain: .75, gold: 1, note: "道路畅通，是训练和远征的好时节。" },
  { id: "autumn", name: "秋", phase: "收获", grain: 1.55, gold: 1.25, note: "秋季粮食和金币产量最高，也更容易遇到王室催税。" },
  { id: "winter", name: "冬", phase: "越冬", grain: .1, gold: .75, note: "冬季产粮很少，军队和居民仍会继续消耗粮食。" }
];

// 统治风格：不是开局选项，而是由玩家整局的实际决策累积出来的，只用于结局判定与文案。
const STYLES = {
  oath: { name: "守信", short: "守信" },
  iron: { name: "强硬", short: "强硬" },
  wealth: { name: "经营", short: "经营" }
};

const DIFFICULTIES = {
  standard: { name: "普通", income: 1, enemy: 1, winter: 1 },
  hard: { name: "困难", income: .9, enemy: 1.16, winter: 1.18 },
  brutal: { name: "极难", income: .82, enemy: 1.32, winter: 1.38 }
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
Object.entries(EXTRA_TERRITORIES).forEach(([id, [name, region, x, y, tag, adj]]) => {
  TERRITORY_DEFS[id] = { name, region, x, y, type: tag === "fortified" ? "fort" : "town", terrain: tag === "forest" ? "密林" : tag === "mountain" ? "山地" : tag === "river" ? "河谷" : tag === "hills" ? "丘陵" : "平原", terrainTags: [tag], owner: "neutral", gold: 5, grain: 12, people: 60, guard: 20, stability: 55, final: false, playable: false, adj, desc: `${name}是北境地图上的一处战略节点。` };
});

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
  envoy: { name: "派使者", note: "花8金币，提高该领主对渡鸦家的好感。", cost: { gold: 8 } }
};
// 单靠使者堆不满：抵抗高的领主必须配合邻近压力与正统性才谈得动。
// 上限从 40 压到 24，是为了让「一季一发使者、发满全场」这种纯外交打法
// 拿不到决定性的杠杆 —— 好感是加速器，不是替代打仗的另一条通路。
const ENVOY_RAPPORT_GAIN = 8;
const ENVOY_RAPPORT_CAP = 24;
const RELEASE_RAPPORT_GAIN = 12;
const CITY_ACTION_DURATIONS = { scout: 20 * 1000, envoy: 30 * 1000 };
// 冷却用绝对到期时刻，而不是「本季已用」——季不再是结算单位，锁也不该按季走。
const CITY_ACTION_COOLDOWNS = { scout: 90 * 1000, envoy: 120 * 1000 };

const LORD_DEFS = {
  player:  { name: "罗恩", title: "渡鸦家的王子", portrait: "assets/player.webp", stats: { force: 68, command: 65, scheme: 60, govern: 58, charm: 67 }, trait: "合法继承人", traitText: "亲自出战时，本场军心最低按45点计算；只有收复旧土后，才有资格重新戴上王冠。", loyalty: 100, ambition: 55, tier: "loyal",  faction: "player",  seat: "ravenstone", liege: null,   oldTie: "先王之子",                     defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: ["knight_2"] },
  regent:  { name: "摄政公爵", title: "篡位摄政 · 王冠谷", portrait: "assets/regent-duke.webp", age: 52, stats: { force: 62, command: 86, scheme: 72, govern: 78, charm: 64 }, trait: "铁冠法统", traitText: "守住王冠谷，拒绝承认渡鸦家的继承权。", loyalty: 100, ambition: 68, tier: "liege",  faction: "crown",   seat: "crownvale",  liege: null,   oldTie: "父亲加冕时的监誓人",           defiance: 95, routes: { force: 1,   persuade: 0,   bribe: 0 },   knights: ["knight_17", "knight_18"] },
  oswin:   { name: "奥斯温·维尔", title: "苔原领主", portrait: "assets/oswin.webp", stats: { force: 27, command: 51, scheme: 78, govern: 88, charm: 69 }, trait: "旧账如山", traitText: "主持领地时收入更稳定；拒绝他的越冬警告会积累不满。", loyalty: 76, ambition: 18, tier: "loyal",  faction: "player",  seat: null,         liege: null,   oldTie: "父亲的老管家，唯一没有走的人", defiance: 0,  routes: { force: 0, persuade: 0, bribe: 0 },        knights: [] },
  renard:  { name: "雷纳德·霍尔特", title: "黑石领主", portrait: "assets/renard.webp", stats: { force: 86, command: 83, scheme: 43, govern: 31, charm: 47 }, trait: "破阵者", traitText: "强攻和骑兵冲击更有力；占尽优势后撤退会激怒他。", loyalty: 70, ambition: 48, tier: "liege",  faction: "neutral", seat: "ashgate",    liege: null,   oldTie: "父亲的骑士长",                 defiance: 70, routes: { force: 1.2, persuade: 0.6, bribe: 0.2 }, knights: ["knight_3", "knight_4"] },
  ysabel:  { name: "伊莎贝尔·马伦", title: "白麦领主", portrait: "assets/ysabel.webp", stats: { force: 30, command: 48, scheme: 80, govern: 92, charm: 72 }, trait: "精确到一粒麦", traitText: "随军可降低补给与撤退损失；主持财税能减少盘剥。", loyalty: 68, ambition: 34, tier: "liege",  faction: "neutral", seat: "frostfield", liege: null,   oldTie: "父亲的财政官",                 defiance: 45, routes: { force: 0.7, persuade: 1.3, bribe: 0.6 }, knights: ["knight_5"] },
  edmund:  { name: "埃德蒙·维恩", title: "鸦堡领主", portrait: "assets/edmund.webp", stats: { force: 74, command: 76, scheme: 69, govern: 57, charm: 84 }, trait: "另一种继承", traitText: "伏击和招降能力出众；功劳越高，越希望管理自己的领地。", loyalty: 61, ambition: 82, tier: "liege",  faction: "neutral", seat: "crowstep",   liege: null,   oldTie: "父亲的私生侄，另一条继承线",   defiance: 85, routes: { force: 1,   persuade: 0.4, bribe: 0.5 }, knights: ["knight_6", "knight_7"] },
  aveline: { name: "艾芙琳·多尔", title: "河望领主", portrait: "assets/aveline.webp", stats: { force: 71, command: 80, scheme: 75, govern: 74, charm: 78 }, trait: "河地之主", traitText: "熟悉河谷作战与治理。若被逼到绝境，她会选择一个值得效忠的人。", loyalty: 52, ambition: 65, tier: "liege",  faction: "river",   seat: "riverwatch", liege: null,   oldTie: "父亲的河地总管",               defiance: 62, routes: { force: 1,   persuade: 1,   bribe: 0.8 }, knights: ["knight_19", "knight_20"] },
  bran:    { name: "布兰·狼牙", title: "狼牙领主", portrait: "assets/bran.webp", stats: { force: 92, command: 80, scheme: 41, govern: 37, charm: 61 }, trait: "只服强者", traitText: "森林和山地作战极强；只会向正面击败自己的人低头。", loyalty: 48, ambition: 58, tier: "liege",  faction: "wolf",    seat: "highpass",   liege: null,   oldTie: "父亲的北境边将",               defiance: 78, routes: { force: 1,   persuade: 0.2, bribe: 0.3 }, knights: ["knight_9", "knight_10"] },
  roderic: { name: "罗德里克·石手", title: "石手领主", portrait: "assets/roderic.webp", age: 44, stats: { force: 82, command: 78, scheme: 48, govern: 46, charm: 53 }, trait: "守关", traitText: "守城和山地作战更稳，适合镇守新领地。", loyalty: 55, ambition: 47, tier: "vassal", faction: "wolf",    seat: "stonejaw",   liege: "bran", oldTie: "父亲的关隘守将，欠饷十一年",   defiance: 55, routes: { force: 0.9, persuade: 0.7, bribe: 1.2 }, knights: ["knight_11"] }
};

// 浅写附庸只有名字、出身和倾向，用四种原型区分行为，不单独写剧本。
const LORD_ARCHETYPES = {
  garrison: { title: "守成领主", defiance: 42, routes: { force: 1,   persuade: 0.8, bribe: 0.7 }, trait: "守成", traitText: "只想守住自己的城墙，不主动惹事。" },
  venal:    { title: "贪财领主", defiance: 35, routes: { force: 0.9, persuade: 0.5, bribe: 1.4 }, trait: "贪财", traitText: "开价明确，钱到位就换旗。" },
  loyalist: { title: "忠仆领主", defiance: 50, routes: { force: 1.1, persuade: 0.4, bribe: 0.3 }, trait: "死忠", traitText: "认死主君，除非主君先倒下。" },
  waverer:  { title: "观望领主", defiance: 30, routes: { force: 0.9, persuade: 1.2, bribe: 1   }, trait: "观望", traitText: "谁看着能赢就跟谁，最容易被说动。" }
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
  { kicker: "序章 · 王国分裂", title: "父亲死后，北境的旗帜一夜之间换了颜色", portrait: "assets/oswin.webp", body: ["你的父亲曾统治整个北境。晚年却遇上战争、饥荒和贵族叛乱，王国从边境开始裂开。父亲死去的消息传出后，手下领主纷纷宣布独立。", "你是渡鸦家最后的合法继承人，但继承到手的不是王冠，而是渡鸦堡、黑棘镇、麦田镇和铁溪镇。"] },
  { kicker: "第一封战书", title: "曾经向父亲跪拜的人，现在要你交出印章", portrait: "assets/bran.webp", body: ["狼牙公爵、河望伯爵、铁岭侯爵和更多旧臣都挂起了自己的旗帜。他们说北境已经没有国王，只有各自的领地。", "渡鸦堡的城墙还在，粮仓却只够支撑几季。你要先让四块旧土重新运转，再把叛乱领主一座城一座城地打回去。"] },
  { kicker: "第一年 · 春", title: "复国不是一句誓言，是下一场战争的粮草", portrait: "assets/player.webp", body: ["发展农田、市场和铁匠铺，研究新的军械，招募骑士与兵卒；每一次经营，最后都要落到收复旧土上。", "当最后一面叛旗倒下，你才能在父亲的王座前重新宣告：北境仍属于渡鸦家。"] }
];

const WORLD_EVENTS = [
  { id: "spring_flood", kicker: "春季洪水", title: "上游决堤，三座村庄开始抢运木料", portrait: "assets/oswin.webp", body: "洪水淹进刚播种的田地，西侧商桥也塌了一段。仓库剩下的木料只够先修一处。", options: [
    ["先抢修田埂", "金币 −12，粮食 +10，民心 +3", { gold: -12, grain: 10, support: 3 }, "木料和民夫先被送往田间，十袋种粮免于被水冲走。"],
    ["先重修商桥", "金币 −7，威望 +2", { gold: -7, renown: 2 }, "商桥当天开始抢修，四天后恢复车马通行。"],
    ["不提供木料，让各村自己解决", "金币不变；最低稳定 −8，民心 −5", { stabilityWeak: -8, support: -5 }, "三座村庄各自拆屋取木，受灾最重的村庄稳定度下降。"] ] },
  { id: "summer_drought", kicker: "夏季旱情", title: "三个村庄的水井已经见底", portrait: "assets/ysabel.webp", body: "村民开始从同一条浑水沟里给人和牲畜取水。奥斯温判断，如果十天内仍不下雨，牲畜会先大批死亡。", options: [
    ["从南方购买水和粮食", "金币 −18，粮食 +12，民心 +5", { gold: -18, grain: 12, support: 5 }, "南方商队运来了水桶、麦粮和牲畜饲料。"],
    ["削减军营口粮", "粮食 +8，军心 −7，战争疲劳 +5", { grain: 8, morale: -7, warWeariness: 5 }, "军营从今天起改发稀粥，几名士兵因此与伙夫发生争执。"],
    ["维持原有配给", "粮食 −15，稳定 −3", { grain: -15, stabilityAll: -3 }, "仓库追加发出十五袋粮，三个村庄暂时没有断粮。"] ] },
  { id: "autumn_mice", kicker: "秋粮入仓", title: "新粮入仓后，粮仓暴发鼠患", portrait: "assets/oswin.webp", body: "守仓人报告损失不足一成。伊莎贝尔却查到，过去三年秋天都报过几乎相同的损耗。", options: [
    ["拆仓灭鼠", "金币 −10，粮食 −4，民心 +2", { gold: -10, grain: -4, support: 2 }, "旧仓被拆开，除了鼠洞，还查出了两本伪造的损耗账。"],
    ["处罚守仓人", "王室认可 +2，粮食 −9，民心 −2", { legitimacy: 2, grain: -9, support: -2 }, "两名守仓人被戴上木枷，仓内已经损坏的粮食无法追回。"],
    ["封仓灭鼠，不再追查", "无需额外物资；最低稳定 −5，民心 −3", { stabilityWeak: -5, support: -3 }, "粮仓封闭三天。鼠患暂时得到控制，守仓人继续留任。"] ] },
  { id: "winter_fever", kicker: "冬季疫病", title: "伤兵棚的热病传进了下城", portrait: "assets/renard.webp", body: "军医要求设置隔离营，并购买烈酒和干净布匹。商人已经把这些物资的价格抬到平时三倍。", options: [
    ["按军医要求设隔离营", "金币 −17，粮食 −6，军心 +5", { gold: -17, grain: -6, morale: 5 }, "士兵在病棚外设岗，病人开始使用单独的水井和布匹。"],
    ["把病人送去修道院", "金币 −8，民心 −3，军心 +2", { gold: -8, support: -3, morale: 2 }, "伤兵和下城病患被分批送往修道院，城内床位很快腾空。"],
    ["封锁下城", "最低稳定 −7，民心 −8；最低守军 +3", { stabilityWeak: -7, support: -8, guardWeak: 3 }, "守军封住下城出入口，并禁止居民在隔离期内离开。"] ] },
  { id: "wandering_masons", kicker: "来自南方的石匠", title: "一支石匠行会愿意留下，但要免三年人头税", portrait: "assets/ysabel.webp", body: "他们能修城墙、磨坊和桥。城里的老匠人则说，外来者会抢走所有好活。", options: [
    ["同意免税三年", "金币 −11，最低守军 +6，民心 +2", { gold: -11, guardWeak: 6, support: 2 }, "石匠在城墙下搭起工棚，当周便开始修补北侧塔楼。"],
    ["让外地和本地工匠一起干", "金币 −16，稳定 +4", { gold: -16, stabilityAll: 4 }, "城堡为两边分配了工钱和工位，争执三天后工程开工。"],
    ["不同意免税，让他们离开", "无需花费；威望 −1", { renown: -1 }, "行会收起工具南下，现有工程继续由本地匠人负责。"] ] },
  { id: "salt_merchants", kicker: "盐车到城门", title: "盐商愿意交钱和盐，请你派兵保护商路", portrait: "assets/ysabel.webp", body: "派兵会增加军队负担，但此后每个冬天都会有盐运进北境。", options: [
    ["派兵保护盐商", "金币 +13，粮食 +7，战争疲劳 +3", { gold: 13, grain: 7, warWeariness: 3 }, "一队士兵护送盐车通过北境，商人按约交付盐和金币。"],
    ["只收税，不派护卫", "金币 +18，民心 −3", { gold: 18, support: -3 }, "税吏收下过路费，没有为商队安排护卫。两辆盐车在返程时遭到抢劫。"],
    ["让沿路村庄负责巡逻", "金币 +7，稳定 +5", { gold: 7, stabilityAll: 5 }, "沿路村镇自行排出守夜和巡路次序，商队恢复通行。"] ] },
  { id: "clipped_coin", kicker: "被剪薄的银币", title: "集市上每三枚银币就有一枚缺了边", portrait: "assets/ysabel.webp", body: "拒收会让交易停摆，照收会把坏钱塞满你的金库。", options: [
    ["设立官方兑换点", "金币 −9，王室认可 +5，稳定 +2", { gold: -9, legitimacy: 5, stabilityAll: 2 }, "集市设置官方兑换点，缺边银币按实际重量兑换后才能缴税。"],
    ["银币按重量收税", "金币 +10，民心 −4", { gold: 10, support: -4 }, "税吏按重量收银，商人随即提高了盐、布和铁器的价格。"],
    ["继续使用这些银币", "金币 +5，王室认可 −4", { gold: 5, legitimacy: -4 }, "缺边银币继续流通，几名商人拒绝接受渡鸦堡的税票。"] ] },
  { id: "mill_dispute", kicker: "磨坊水闸之争", title: "上游领主磨麦时，下游农田就没有水", portrait: "assets/oswin.webp", body: "双方都拿着旧契约，双方的契约也都是真的。", options: [
    ["规定磨坊用水时间", "金币 −5，民心 +6，稳定 +3", { gold: -5, support: 6, stabilityAll: 3 }, "水钟被挂在磨坊门口，磨坊和下游农户按时段分水。"],
    ["让磨坊继续全天用水", "金币 +11，民心 −6", { gold: 11, support: -6 }, "磨坊获准全天开闸，下游两片农田很快出现干裂。"],
    ["派兵拆掉水闸", "军心 +2，最低稳定 −3", { morale: 2, stabilityWeak: -3 }, "士兵拆掉私设水闸，磨坊主的护工与他们发生冲突。"] ] },
  { id: "deserter_band", kicker: "林中的逃兵", title: "一群南方逃兵占了旧猎屋，愿意拿剑换口粮", portrait: "assets/renard.webp", body: "他们有战斗经验，也有丢下旧主的前科。", options: [
    ["招收他们当长矛兵", "粮食 −8，长矛兵 +7，军心 −2", { grain: -8, levy: 7, morale: -2 }, "七名逃兵宣誓后被编入长矛队，原有士兵对这项安排提出质疑。"],
    ["收走武器，让他们开荒", "粮食 −10，民心 +4，稳定 +2", { grain: -10, support: 4, stabilityAll: 2 }, "逃兵交出武器，被送往东侧荒地修屋开垦。"],
    ["赶出领地", "威望 +2，民心 −2", { renown: 2, support: -2 }, "守军押送他们离开边界，猎屋附近的村民失去了临时护卫。"] ] },
  { id: "forest_rights", kicker: "领主的鹿，村民的柴", title: "巡林人抓住了三个在禁林里设套的孩子", portrait: "assets/oswin.webp", body: "按旧法要砍手。按村民的说法，他们只是想熬过冬天。", options: [
    ["允许村民捡柴和抓小兽", "民心 +9，王室认可 −2", { support: 9, legitimacy: -2 }, "城堡宣布，村民可以在禁林捡拾枯木并猎取兔类。"],
    ["罚他们巡林一个冬天", "稳定 +3，粮食 +5", { stabilityAll: 3, grain: 5 }, "三个孩子免于断手，改在巡林队服役一个冬天。"],
    ["按旧法砍手", "王室认可 +4，军心 +2，民心 −9", { legitimacy: 4, morale: 2, support: -9 }, "三个孩子按旧法受刑。此后一个月，附近村民不再进入城堡集市。"] ] },
  { id: "monastery_tithe", kicker: "修道院的旧契", title: "修道院要求你补交二十年前欠下的教会税", portrait: "assets/oswin.webp", body: "契约和签字都是真的。这笔税原本需要把收入的十分之一交给教会，但欠税的人都已经死了。", options: [
    ["支付全部欠税", "金币 −20，王室认可 +8", { gold: -20, legitimacy: 8 }, "二十枚金币被送入修道院，院长在契约上盖下结清印记。"],
    ["用粮食抵掉一半", "粮食 −18，王室认可 +3", { grain: -18, legitimacy: 3 }, "十八袋粮食运进修道院，剩余欠款被重新记入契约。"],
    ["拒绝偿还父亲的欠税", "金币不变，威望 +3，王室认可 −7", { renown: 3, legitimacy: -7 }, "使者退回契约，修道院随后停止为渡鸦家举行公开祈祷。"] ] },
  { id: "village_wedding", kicker: "一场跨村婚礼", title: "两个结仇三代的村庄想请你做证婚人", portrait: "assets/player.webp", body: "这是一场婚礼，也是一场停战。你带多少礼物去，会决定停战能维持多久。", options: [
    ["带酒和两头牛", "金币 −9，粮食 −5，民心 +8", { gold: -9, grain: -5, support: 8 }, "两头牛被分给双方亲族，婚宴持续到天亮，没有发生斗殴。"],
    ["只带领主祝福", "王室认可 +2，稳定 +2", { legitimacy: 2, stabilityAll: 2 }, "你在两村代表面前完成证婚，双方当场交换了扣押的牲畜。"],
    ["让管家代你出席", "金币 −3，民心 +2", { gold: -3, support: 2 }, "奥斯温代你宣读祝词，并记录了两村共同签下的停战约定。"] ] },
  { id: "minor_heir", kicker: "没有土地的继承人", title: "一个小贵族的遗孤带着族谱来到大厅", portrait: "assets/edmund.webp", body: "族谱能证明他的姓，但他没有领地或追随者。收为侍从能补充一名骑士，也可能引来原领地的继承争端。", options: [
    ["收为侍从", "金币 −8，披甲骑士 +1，王室认可 +2", { gold: -8, knights: 1, legitimacy: 2 }, "年轻人被编入领主侍从队，并保留了家族旧徽记。"],
    ["给钱送去修道院", "金币 −12，民心 +2", { gold: -12, support: 2 }, "他带着十二枚金币前往修道院，族谱由奥斯温封存。"],
    ["暂时留在外院观察", "威望 +2，家臣不满 +2", { renown: 2, grievanceAll: 2 }, "年轻人被安排住进外院，现有家臣拒绝为他提供席位和随从。"] ] },
  { id: "hostage_offer", kicker: "边境上的人质", title: "邻家骑士愿把长子留在渡鸦堡，换取停战和粮食", portrait: "assets/renard.webp", body: "接受后，双方可暂时停战；若对方毁约，这个孩子将由渡鸦堡处置。", options: [
    ["收下人质，送足粮食", "粮食 −16，最低守军 +5，王室认可 −2", { grain: -16, guardWeak: 5, legitimacy: -2 }, "十六袋粮食送往边境，骑士的长子被安置在北塔。"],
    ["只签停战，不收人", "粮食 −8，民心 +4，稳定 +2", { grain: -8, support: 4, stabilityAll: 2 }, "双方签下停战书，孩子随父亲的使者返回边境。"],
    ["拒绝交易", "军心 +3，威望 +2", { morale: 3, renown: 2 }, "使者带孩子离开，边境守军随即恢复战备。"] ] },
  { id: "border_beacon", kicker: "熄灭的烽火", title: "北边三座烽火台同时没有点灯", portrait: "assets/renard.webp", body: "是守夜人偷懒，还是有人故意让边境失明？雷纳德要求立刻换防。", options: [
    ["彻查并换防", "金币 −10，最低守军 +8，军心 +3", { gold: -10, guardWeak: 8, morale: 3 }, "三名守夜人被撤换，新守军当晚接管了烽火台。"],
    ["加倍守夜赏金", "金币 −14，稳定 +3", { gold: -14, stabilityAll: 3 }, "赏金翻倍后，三座烽火台重新点灯，失火原因仍未查清。"],
    ["公开鞭打失职者", "军心 +5，民心 −5", { morale: 5, support: -5 }, "三名守夜人在城门前受刑，他们的家属随后离开了附近村庄。"] ] },
  { id: "royal_inspector", kicker: "王城来的眼睛", title: "一名王室巡察官要逐页查看你的税册和兵册", portrait: "assets/ysabel.webp", body: "配合检查可提高王室认可，但巡察官也会带走你的实际兵力、人口和存粮数字。", options: [
    ["打开所有账册", "王室认可 +9，金币 −8", { legitimacy: 9, gold: -8 }, "巡察官查阅税册和兵册三天，带走了盖印副本。"],
    ["准备一套体面账册", "金币 −13，威望 +3", { gold: -13, renown: 3 }, "伊莎贝尔重做了缺页和涂改处，巡察官没有发现无法解释的数字。"],
    ["以边境战事为由拒绝", "王室认可 −8，军心 +4", { legitimacy: -8, morale: 4 }, "守军没有打开城门，巡察官当晚写信向王城报告。"] ] },
  { id: "old_soldiers", kicker: "父亲留下的旧兵", title: "十二名老兵来讨当年远征欠下的军饷", portrait: "assets/renard.webp", body: "他们有人少了手指，有人带着父亲的剑，却没有一人带着欠条。", options: [
    ["连本带息偿还", "金币 −22，军心 +9，威望 +3", { gold: -22, morale: 9, renown: 3 }, "十二名老兵领到欠饷和利息，雷纳德把收据交给了军需官。"],
    ["用土地和守军职位抵债", "金币 −8，长矛兵 +5，稳定 −2", { gold: -8, levy: 5, stabilityAll: -2 }, "五名老兵接受土地和守军职位，随后加入渡鸦堡守军。"],
    ["没有凭证就没有欠款", "金币不变，军心 −9，王室认可 +2", { morale: -9, legitimacy: 2 }, "他们没有争辩，只是把旧剑带走了。"] ] },
  { id: "blacksmith_guild", kicker: "铁匠行会停锤", title: "铁匠拒绝继续按旧价给军队打箭头和马蹄", portrait: "assets/renard.webp", body: "矿石涨价是真的，铁匠想借战争抬价也是真的。军队等不了太久。", options: [
    ["接受新价", "金币 −17，弓箭手 +4，军心 +3", { gold: -17, archers: 4, morale: 3 }, "行会按新价恢复开工，四名新弓手领到了箭头和护具。"],
    ["出钱为铁匠建一座新炉", "金币 −23，最低守军 +7，稳定 +2", { gold: -23, guardWeak: 7, stabilityAll: 2 }, "新炉在城堡东侧开火，边境守军优先领取了新铁器。"],
    ["强行拿走铁料", "无需花费；军心 +5，民心 −8，最低稳定 −2", { morale: 5, support: -8, stabilityWeak: -2 }, "士兵搬走行会库存，铁匠停工并关闭了两间作坊。"] ] }
];

const NPC_ARCS = [
  { id: "oswin_old_debt", officerId: "oswin", minTurn: 2, title: "奥斯温找到一册父亲留下的欠粮账", body: "“哪一户多收了几袋，都在这里。”奥斯温把账册推过来，“已经过去六年了。还不还，由您决定。”", options: [["逐户退还", "粮食 −14；奥斯温忠诚 +8，民心 +6", { grain: -14, support: 6, loyalty: 8 }, "奥斯温带着书记逐户核对，十四袋麦粮被退回原主。"], ["把旧账封存", "王室认可 +2；奥斯温不满 +8", { legitimacy: 2, grievance: 8 }, "账册被锁进旧领主的柜子。奥斯温此后没有再提这件事。"], ["只退还仍有凭据的人", "粮食 −6；奥斯温忠诚 +2", { grain: -6, loyalty: 2 }, "只有五户拿出了旧凭据，其余人的名字仍留在账上。"]] },
  { id: "renard_veterans", officerId: "renard", minTurn: 3, title: "雷纳德为阵亡者家属申请田地", body: "“死人不能领军饷，家里人总得活。”雷纳德把十二个名字放在桌上，“士兵都在看您怎么处理。”", options: [["给家属免税田", "金币 −10，民心 +4；雷纳德忠诚 +8", { gold: -10, support: 4, loyalty: 8 }, "十二户阵亡者家属各分到一块免税田。"], ["只发一次补偿金", "金币 −7；雷纳德忠诚 +2", { gold: -7, loyalty: 2 }, "每户领到一次补偿金，此后不再享受额外田产。"], ["拒绝给予补偿", "王室认可 +2；雷纳德忠诚 −8、不满 +10", { legitimacy: 2, loyalty: -8, grievance: 10 }, "雷纳德收回名单，之后的会议没有再发言。"]] },
  { id: "ysabel_hidden_ledger", officerId: "ysabel", minTurn: 4, title: "伊莎贝尔查到税吏的秘密账本", body: "“少掉的税不是一个人拿的。”伊莎贝尔指着账上的名字，“继续查，至少能追回八枚金币，但会得罪六个村镇里的大户。”", options: [["一查到底", "金币 +8，民心 +5；伊莎贝尔忠诚 +7", { gold: 8, support: 5, loyalty: 7 }, "六名涉案税吏被撤换，追回的八枚金币记入公账。"], ["罚钱但留任", "金币 +17；伊莎贝尔不满 +6", { gold: 17, grievance: 6 }, "税吏和地方大户交出罚金，原有征税人员继续留任。"], ["把名单收为己用", "金币 +12，王室认可 −4；伊莎贝尔功劳 +3", { gold: 12, legitimacy: -4, merit: 3 }, "暗账和名单被收入领主私库，伊莎贝尔保留了一份副本。"]] },
  { id: "edmund_bastard_seal", officerId: "edmund", minTurn: 5, title: "埃德蒙要求使用渡鸦家的军令印章", body: "“我的军令每到一个村庄，都要重新核验身份。”埃德蒙说，“给我一枚备用印章，命令能早到半天。至于别人怎么想，不是我的问题。”", options: [["给他一枚备用印章", "埃德蒙忠诚 +9、功劳 +4；王室认可 −3", { loyalty: 9, merit: 4, legitimacy: -3 }, "埃德蒙接过备用印章，当场在一封军令上盖了印。"], ["只许战时使用", "埃德蒙忠诚 +3；威望 +1", { loyalty: 3, renown: 1 }, "备用印章被锁进军械库，只有出征时才能领用。"], ["拒绝给他备用印章", "王室认可 +4；埃德蒙不满 +10", { legitimacy: 4, grievance: 10 }, "埃德蒙收回没有盖印的军令，之后没有再提这件事。"]] },
  { id: "oswin_village_rolls", officerId: "oswin", minTurn: 8, title: "奥斯温准备重新登记各村人口", body: "“旧册漏了三十七户，去年逃荒回来的人也没记。”奥斯温摊开登记册，“先记灾户，救济不会送错；全都记清，征税和征兵也不会送错。”", options: [["只登记需要救济的人", "民心 +5；奥斯温功劳 +5", { support: 5, merit: 5 }, "书记先登记缺粮、患病和失去劳力的家庭，救济名单重新排定。"], ["登记人口、粮食和牲畜", "金币 +9，王室认可 +3；民心 −4", { gold: 9, legitimacy: 3, support: -4 }, "书记逐户清点人口、存粮和牲畜，新增税户与可征兵人数被写入新册。"], ["继续使用旧记录", "不花资源；奥斯温忠诚 −5", { loyalty: -5 }, "旧记录继续使用，三十七户没有被纳入本季救济和征税安排。"]] },
  { id: "renard_mercy", officerId: "renard", minTurn: 9, title: "雷纳德抓到一名临阵逃跑的士兵", body: "“按军法，该死。”雷纳德把剑放在桌上，“但他父亲死在上一场仗里，家里只剩这一个儿子。您来定。”", options: [["罚他去最前排，不处死", "军心 +2；雷纳德忠诚 +5，民心 +3", { morale: 2, loyalty: 5, support: 3 }, "年轻士兵被调入前列，并在接下来的两次训练中按时归队。"], ["按军法处死", "军心 +6，民心 −5；雷纳德不满 +4", { morale: 6, support: -5, grievance: 4 }, "士兵按军法被处死，雷纳德亲自主持了军营里的宣判。"], ["交给雷纳德决定", "雷纳德功劳 +4、忠诚 +3", { merit: 4, loyalty: 3 }, "雷纳德判处鞭刑，并把年轻士兵留在自己队中。"]] },
  { id: "ysabel_market_charter", officerId: "ysabel", minTurn: 10, title: "伊莎贝尔提议让商人自己选人管理集市用秤", body: "“让商人选四个人负责检查秤，每季度大约能多收十二金币。”伊莎贝尔说，“城堡只负责定期检查。”", options: [["让商人自己选管理人员", "金币 +12，民心 +5，王室认可 −2；伊莎贝尔忠诚 +6", { gold: 12, support: 5, legitimacy: -2, loyalty: 6 }, "商人选出四名管理人员，城堡为铜秤砣加盖了查验印记。"], ["由城堡指定管理人员", "金币 +8，王室认可 +3", { gold: 8, legitimacy: 3 }, "四名管理人员由城堡任命，商人仍可推举候选者。"], ["继续让税吏直接管理", "金币 +4；伊莎贝尔不满 +7", { gold: 4, grievance: 7 }, "税吏继续监管每一杆秤，外地商队数量没有增加。"]] },
  { id: "edmund_whispers", officerId: "edmund", minTurn: 11, title: "大厅里有人说埃德蒙更像老领主的儿子", body: "“不是我让他们说的。”埃德蒙先开了口，“您若要我堵住每个人的嘴，也请给我一个名分，免得他们明天再换一种说法。”", options: [["公开称他为兄弟", "王室认可 −6；埃德蒙忠诚 +13、不满 −10", { legitimacy: -6, loyalty: 13, grievance: -10 }, "你在家臣面前称埃德蒙为兄弟，并让书记把这句话写入家族记录。"], ["让他当众宣誓", "王室认可 +5；埃德蒙忠诚 −4", { legitimacy: 5, loyalty: -4 }, "埃德蒙完成效忠宣誓，随后回到自己的席位，没有再开口。"], ["查出传播者", "军心 +3；埃德蒙不满 +6，民心 −3", { morale: 3, grievance: 6, support: -3 }, "三名传播谣言的侍从被逐出城堡，关于埃德蒙身世的议论仍在村镇流传。"]] },
  { id: "aveline_river_envoy", officerId: "aveline", minTurn: 12, side: "any", title: "艾芙琳派来一名不带武器的渡船主人", body: "渡船主人带来艾芙琳的口信：“若河望有一天降旗，渡船、水闸和河税，是否仍由河地人管理？”", options: [["答应保留河地旧规矩", "王室认可 −2，民心 +4；若她以后加入，初始忠诚 +8", { legitimacy: -2, support: 4, loyalty: 8 }, "你的答复被抄成六份，分别送往河望的渡口和集市。"], ["所有领地使用同一套命令", "王室认可 +5；艾芙琳不满 +6", { legitimacy: 5, grievance: 6 }, "渡船主人听完答复，当日便返回河望。"], ["先收取通行税", "金币 +9；若她以后加入，初始忠诚 −4", { gold: 9, loyalty: -4 }, "使者交出九枚金币，关于河地管理方式的谈判没有继续。"]] },
  { id: "bran_blood_price", officerId: "bran", minTurn: 13, side: "any", title: "布兰送来三把断剑，要求交换战俘", body: "信使把三把断剑扔在地上：“三批俘虏换三批俘虏。布兰说，少一个人，就少换一队。”", options: [["等额交换", "长矛兵 +4，民心 +2；若他以后加入，初始忠诚 +6", { levy: 4, support: 2, loyalty: 6 }, "两队俘虏在河滩完成交换，四名长矛兵回到渡鸦军中。"], ["无条件放回伤员", "民心 +6，威望 −2；布兰不满 −4", { support: 6, renown: -2, grievance: -4 }, "狼牙人带走伤员，没有留下谢礼。"], ["拒绝并示众俘虏", "军心 +5，民心 −6；布兰不满 +8", { morale: 5, support: -6, grievance: 8 }, "三把断剑被钉上城门，狼牙氏族随即停止了谈判。"]] },
  { id: "aveline_shared_table", officerId: "aveline", minTurn: 16, side: "player", title: "艾芙琳要求一个正式席位", body: "“如果您让我坐在最后，河地人就会认为我已经失去权力。”艾芙琳站在座位旁，“我要一个正式席位。”", options: [["给她河地代表席位", "艾芙琳忠诚 +11、功劳 +3；王室认可 −2", { loyalty: 11, merit: 3, legitimacy: -2 }, "长桌增设河地席位，椅背刻上了河望家的波纹。"], ["所有家臣按功劳排位", "威望 +3；艾芙琳忠诚 +3", { renown: 3, loyalty: 3 }, "家臣席位改按功劳排列，艾芙琳接受规则并坐在第三席。"], ["拒绝保留她的伯爵席位", "王室认可 +4；艾芙琳忠诚 −9、不满 +12", { legitimacy: 4, loyalty: -9, grievance: 12 }, "她坐下了，却没有碰酒杯。"]] },
  { id: "bran_wolf_oath", officerId: "bran", minTurn: 17, side: "player", title: "布兰要带狼牙旧部在城外重新宣誓", body: "“狼牙人在火边发誓，不在屋里。”布兰说，“渡鸦旗可以挂最高。你来不来，给我一句话。”", options: [["亲自去接受狼牙人的宣誓", "粮食 −6；布兰忠诚 +12，军心 +5", { grain: -6, loyalty: 12, morale: 5 }, "你在城外围火旁接受狼牙旧部宣誓，渡鸦旗挂在氏族旗上方。"], ["派雷纳德代你前往", "布兰忠诚 +4，威望 +2", { loyalty: 4, renown: 2 }, "雷纳德代表渡鸦家参加宣誓，名单当晚送回城堡。"], ["要求他们进大厅跪下宣誓", "王室认可 +5；布兰忠诚 −10、不满 +13", { legitimacy: 5, loyalty: -10, grievance: 13 }, "布兰跪下得很慢。"]] }
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

