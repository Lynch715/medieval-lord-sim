"use strict";

const SAVE_KEY = "iron-crown-lord-save-v1";
const VERSION = 2;
const MAX_TURNS = 48;
const TIME_CONFIG = {
  seasonDurationMs: 5 * 60 * 1000,
  logicTickMs: 1000,
  uiTickMs: 250,
  // 离线只推进一季；长时间离开不应把玩家锁死在连续崩溃判定里。
  maxOfflineSeasonCatchup: 1
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
    { id: "law_code", name: "统一法典", desc: "稳定度低于50的领地不再额外损失金币。", cost: { knowledge: 42, gold: 68 }, requires: ["provincial_offices"] }
  ],
  commerce: [
    { id: "coinage", name: "统一铸币", desc: "金币流量 +8%，商站收益提高。", cost: { knowledge: 12, gold: 24 }, requires: [] },
    { id: "caravanserai", name: "商旅驿站", desc: "每座商站额外带回金币，并降低贸易风险。", cost: { knowledge: 22, gold: 36 }, requires: ["coinage"] },
    { id: "trade_guild", name: "商会特许", desc: "市场建筑的金币加成提高。", cost: { knowledge: 30, gold: 48 }, requires: ["caravanserai"] },
    { id: "market_charter", name: "自由市契约", desc: "外围城市签订城约的信任门槛降低。", cost: { knowledge: 40, gold: 62 }, requires: ["trade_guild"] },
    { id: "royal_exchange", name: "王家汇兑", desc: "商站收益再提高；完成统一时额外获得威望。", cost: { knowledge: 54, gold: 86 }, requires: ["market_charter"] }
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
  crowstep: ["鸦阶", "northern_lords", 91, 27, "mountain", ["crownvale"]],
  barrowhill: ["冢丘", "northern_lords", 8, 18, "hills", ["pineford", "ravenstone"]],
  greywood: ["灰林", "northern_lords", 92, 55, "forest", ["crownvale", "riverwatch"]],
  duchyroad: ["公爵大道", "royal_crown", 70, 37, "plains", ["crownvale", "highpass"]],
  crownfield: ["王冠田", "royal_crown", 91, 38, "plains", ["crownvale"]],
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

const playableTerritoryIds = () => Object.keys(TERRITORY_DEFS).filter(id => TERRITORY_DEFS[id].playable !== false);

// 侦察是当前唯一的城市行动。使者、商站、断粮道和城约属于「说服路线」，
// 会在领主绑定领地与王室正统性落地后重建，届时它们要作用于具体的叛臣，而不是匿名城市。
const CITY_ACTION_DEFS = {
  scout: { name: "派出斥候", note: "花2金币，记录守军与地形两季。", cost: { gold: 2 } }
};
const CITY_ACTION_DURATIONS = { scout: 20 * 1000 };

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

function createKnightRoster() {
  return KNIGHT_DEFS.map(def => ({ ...clone(def), captured: false, recruitedAt: 0 }));
}

function knightById(s, id) {
  return (s?.knights || []).find(knight => knight.id === id) || null;
}

// 军团指挥官只保留两类：玩家王子，或没有立绘的骑士。
// 旧存档里的领主编制仍然保留作兼容，但新军团不会再把领主当作军团长。
function commanderById(s, id) {
  if (id === "player") return officer(s, id);
  return knightById(s, id) || officer(s, id) || null;
}

function commanderName(s, id) {
  return commanderById(s, id)?.name || "未任命指挥官";
}

function commanderStats(s, id) {
  const person = commanderById(s, id);
  if (!person) return { force: 0, command: 0, scheme: 0, govern: 0, charm: 0 };
  return person.stats || { force: person.force || 0, command: person.command || 0, scheme: person.scheme || 0, govern: 0, charm: 0 };
}

function armyCommander(s, army) {
  const id = army?.commanderId || army?.leaders?.[0] || "player";
  return { id, person: commanderById(s, id), isKnight: !!knightById(s, id) };
}

function activeKnights(s) {
  return (s?.knights || []).filter(knight => knight.side === "player" && knight.status === "active");
}

function assignedCommanderIds(s) {
  return new Set((s?.armies || []).filter(army => army.owner === "player").map(army => army.commanderId || army.leaders?.[0]).filter(Boolean));
}

function knightBattleMultiplier(s, selectedIds = null) {
  const roster = selectedIds ? activeKnights(s).filter(knight => selectedIds.includes(knight.id)) : activeKnights(s);
  const coefficient = roster.reduce((sum, knight) => sum + ((knight.force || 50) + (knight.command || 45)) / 200 * .008, 0);
  return 1 + Math.min(.24, coefficient);
}

function availableKnights(s) {
  return (s?.knights || []).filter(knight => knight.status === "available" && knight.side === "neutral");
}

const STAT_LABELS = { force: "武力", command: "统率", scheme: "谋略", govern: "治理", charm: "魅力" };
const OFFICER_STAT_KEYS = ["command", "govern"];

function makeClock(turn = 0, now = Date.now()) {
  const seasonIndex = Math.max(0, Math.min(MAX_TURNS - 1, Math.round(turn || 0)));
  return {
    seasonIndex,
    seasonStartedAt: now,
    seasonEndsAt: now + TIME_CONFIG.seasonDurationMs,
    lastProcessedAt: now
  };
}

function initClock(s, now = Date.now()) {
  if (!s) return null;
  s.clock = makeClock(s.turn, now);
  return s.clock;
}

function getSeasonRemainingMs(s, now = Date.now()) {
  const effectiveNow = s?.pauseState?.pausedAt || now;
  return Math.max(0, (s?.clock?.seasonEndsAt || effectiveNow) - effectiveNow);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatResourceRate(value, unit) {
  // 以“每小时”展示，避免低流量出现模糊的小数；这里只改变显示单位，不改变资源结算。
  const perHour = Math.round(value * 3600);
  if (perHour === 0 && Math.abs(value) > 0) return value > 0 ? `+1${unit}/时` : `−1${unit}/时`;
  return `${perHour > 0 ? "+" : perHour < 0 ? "−" : ""}${Math.abs(perHour)}${unit}/时`;
}

function formatSeasonCoefficient(value) {
  return `${Math.round(value * 100)}%`;
}

function getQueueUsage(s, queueKey) {
  return (s?.jobs || []).filter(job => job.status === "running" && job.queueKey === queueKey).length;
}

function getRunningJob(s, queueKey) {
  return (s?.jobs || []).find(job => job.status === "running" && job.queueKey === queueKey) || null;
}

function techDefinition(branch, techId) {
  return (TECH_DEFS[branch] || []).find(tech => tech.id === techId) || null;
}

function techMaxLevel(tech) {
  return Math.max(1, Math.round(tech?.maxLevel || TECH_MAX_LEVEL));
}

function techLevel(s, techId) {
  for (const [branch, techs] of Object.entries(TECH_DEFS)) {
    const tech = techs.find(item => item.id === techId);
    if (!tech) continue;
    const state = s?.tech?.[branch] || {};
    const stored = state.levels?.[techId];
    if (Number.isFinite(stored)) return Math.max(0, Math.min(techMaxLevel(tech), Math.round(stored)));
    return state.completed?.includes(techId) ? 1 : 0;
  }
  return 0;
}

function techCost(tech, level) {
  const next = Math.max(1, Math.round(level || 1));
  const growth = 1 + (next - 1) * .55;
  return { knowledge: Math.round(tech.cost.knowledge * growth), gold: Math.round(tech.cost.gold * growth) };
}

function researchDuration(tech, level) {
  return (45 + Math.max(0, Math.round(level || 1) - 1) * 15) * 1000;
}

function techCompleted(s, techId) {
  return techLevel(s, techId) > 0;
}

function marchDuration(s) {
  return Math.max(20 * 1000, Math.round(JOB_CONFIG.MARCH.durationMs * (1 - techLevel(s, "field_doctrine") * .25)));
}

function territoryDistance(originId, destinationId) {
  const origin = MAP_POINTS[originId];
  const destination = MAP_POINTS[destinationId];
  if (!origin || !destination) return 1;
  return Math.max(1, Math.round(Math.hypot(destination[0] - origin[0], destination[1] - origin[1]) / 8));
}

function marchDurationForDistance(s, originId, destinationId) {
  const distance = territoryDistance(originId, destinationId);
  return Math.max(20 * 1000, Math.round(marchDuration(s) * (0.72 + distance * 0.16)));
}

function researchQueueJob(s) {
  return getRunningJob(s, "research:global");
}

function canResearch(s, branch, techId) {
  const tech = techDefinition(branch, techId);
  const branchState = s?.tech?.[branch];
  const currentLevel = techLevel(s, techId);
  const nextLevel = currentLevel + 1;
  if (!tech || !branchState || currentLevel >= techMaxLevel(tech) || researchQueueJob(s)) return false;
  if (tech.requires.some(id => !techCompleted(s, id))) return false;
  const cost = techCost(tech, nextLevel);
  return s.knowledge >= cost.knowledge && s.gold >= cost.gold;
}

function crownRequirements(s) {
  return {
    territories: ownTerritoryIds(s).length >= 18,
    renown: (s?.renown || 0) >= 60,
    siege: techCompleted(s, "war_engineering"),
    army: armyTotal(s, "army_1") >= 80
  };
}

function crownAccessMet(s) {
  const requirements = crownRequirements(s);
  return Object.values(requirements).every(Boolean);
}

function crownRequirementText(s) {
  const requirements = crownRequirements(s);
  const missing = [];
  if (!requirements.territories) missing.push("收复18处旧土");
  if (!requirements.renown) missing.push("威望60");
  if (!requirements.siege) missing.push("完成攻城工程");
  if (!requirements.army) missing.push("王国主力80人");
  return missing.length ? `还需：${missing.join("、")}` : "已满足进军王冠谷的条件";
}

function primaryTerritoryId(s) {
  return ownTerritoryIds(s)[0] || "ravenstone";
}

function recruitmentTerritoryId(s) {
  const army = armyEntity(s, "army_1");
  return army && army.owner === "player" && army.status === "idle" && owns(s, army.locationId) ? army.locationId : primaryTerritoryId(s);
}

function getJobRemainingMs(job, now = Date.now()) {
  return Math.max(0, (job?.endAt || now) - now);
}

function pauseWorld(s, reason = "event", now = Date.now()) {
  if (!s || s.pauseState) return false;
  s.pauseState = { pausedAt: now, reason };
  return true;
}

function resumeWorld(s, now = Date.now()) {
  if (!s?.pauseState) return false;
  const pausedAt = s.pauseState.pausedAt;
  const delta = Math.max(0, now - pausedAt);
  if (delta > 0) {
    (s.jobs || []).filter(job => job.status === "running").forEach(job => {
      job.startedAt += delta;
      job.endAt += delta;
    });
    if (s.clock) {
      s.clock.seasonStartedAt += delta;
      s.clock.seasonEndsAt += delta;
      s.clock.lastProcessedAt = now;
    }
  }
  s.pauseState = null;
  return true;
}

function startJob(s, job = {}) {
  if (!s) return null;
  s.jobs ||= [];
  const now = Number.isFinite(job.startedAt) ? job.startedAt : Date.now();
  const endAt = Number.isFinite(job.endAt) ? job.endAt : now + Math.max(0, job.durationMs || 0);
  const record = {
    id: job.id || `job_${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: job.type || "BUILD",
    territoryId: job.territoryId || null,
    armyId: job.armyId || null,
    startedAt: now,
    endAt,
    status: "running",
    payload: job.payload || {},
    queueKey: job.queueKey || `${job.type || "BUILD"}:${job.territoryId || "global"}`
  };
  s.jobs.push(record);
  return record;
}

function finishJob(s, job, now = Date.now()) {
  if (!job || job.status !== "running") return false;
  job.status = "completed";
  job.completedAt = now;
  applyCompletedJob(s, job);
  return true;
}

function cancelJob(s, jobId) {
  const job = (s?.jobs || []).find(item => item.id === jobId && item.status === "running");
  if (!job) return false;
  job.status = "cancelled";
  job.cancelledAt = Date.now();
  if (job.type === "MARCH") {
    const groupIds = job.payload?.armyIds || [job.armyId];
    groupIds.map(id => armyEntity(s, id)).filter(Boolean).forEach(army => { army.destinationId = null; army.status = "idle"; army.jobId = null; });
  }
  return true;
}

function processCompletedJobs(s, now = Date.now()) {
  let completed = 0;
  (s?.jobs || []).slice().sort((a, b) => a.endAt - b.endAt).forEach(job => {
    if (job.status === "running" && getJobRemainingMs(job, now) <= 0 && finishJob(s, job, now)) completed++;
  });
  return completed;
}

function startArmyRecovery(s, army, durationMs = JOB_CONFIG.RECOVER.durationMs, now = Date.now()) {
  if (!s || !army) return null;
  const existing = army.jobId && (s.jobs || []).find(job => job.id === army.jobId && job.status === "running");
  if (existing) return existing;
  const job = startJob(s, {
    type: "RECOVER", armyId: army.id, startedAt: now, endAt: now + durationMs,
    queueKey: `recover:${army.id}`, payload: { durationMs }
  });
  army.status = "recovering";
  army.jobId = job.id;
  army.destinationId = null;
  return job;
}

function applyCompletedJob(s, job) {
  if (!s || !job) return false;
  if (job.type === "CITY_ACTION") {
    return resolveCityAction(s, job.territoryId, job.payload?.actionId);
  }
  if (job.type === "OFFICER_RECRUIT") {
    const recruit = officer(s, job.payload?.officerId);
    if (!recruit || recruit.side !== "neutral") return false;
    recruit.side = "player";
    recruit.loyalty = clamp(job.payload?.startingLoyalty || 58);
    recruit.grievance = 0;
    recruit.recruitedAt = s.turn;
    const text = `${recruit.name}接受封赏，正式加入你的领主议会。`;
    s.lastAction = { name: "领主招募完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "KNIGHT_ACTION") {
    const knight = knightById(s, job.payload?.knightId);
    const action = job.payload?.actionId;
    if (!knight) return false;
    if (action === "recruit" || action === "surrender") {
      knight.side = "player";
      knight.status = "active";
      knight.loyalty = clamp(Math.round(job.payload?.loyalty || (action === "surrender" ? 42 : 58)));
      knight.recruitedAt = s.turn;
      const text = `${knight.name}披挂入列，成为你的骑士。`;
      s.lastAction = { name: "骑士加入", text };
      log(s, "good", text);
      return true;
    }
    if (action === "execute") {
      knight.status = "executed";
      knight.side = "gone";
      const text = `${knight.name}被处死，敌方骑士团士气受挫。`;
      s.lastAction = { name: "处死骑士", text };
      log(s, "warn", text);
      return true;
    }
    if (action === "release") {
      knight.status = "released";
      knight.side = "neutral";
      knight.captured = false;
      const text = `${knight.name}获释离开，今后可能在别处重新出现。`;
      s.lastAction = { name: "释放骑士", text };
      log(s, "info", text);
      return true;
    }
    return false;
  }
  if (job.type === "BUILD") {
    const territory = s.territories[job.territoryId];
    const type = job.payload?.buildingType;
    if (!territory || !BUILDINGS[type]) return false;
    territory.buildings[type] = Math.min(BUILDING_MAX_LEVEL, (territory.buildings[type] || 0) + 1);
    if (type === "barracks") territory.guard += 7;
    if (type === "walls") territory.guard += 5;
    if (type === "watchtower") territory.guard += 3;
    territory.stability = clamp(territory.stability + 3);
    s.style.wealth++;
    const text = `${TERRITORY_DEFS[job.territoryId].name}完成${BUILDINGS[type].name}第${territory.buildings[type]}级建设。`;
    s.lastAction = { name: "领地建设完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RECRUIT") {
    const type = job.payload?.unitType;
    const amount = Math.max(0, Math.round(job.payload?.amount || 0));
    if (!UNIT_DEFS[type] || amount <= 0) return false;
    addUnits(s, type, amount, job.territoryId || primaryTerritoryId(s));
    if (type === "levy") s.support = clamp(s.support - 2);
    s.style.iron++;
    const place = TERRITORY_DEFS[job.territoryId || primaryTerritoryId(s)]?.name || "本领地";
    const text = `${place}的${amount}名${UNIT_DEFS[type].name}完成训练，编入当地驻军。`;
    s.lastAction = { name: "征募完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RESEARCH") {
    const branch = job.payload?.branch;
    const techId = job.payload?.techId;
    const tech = techDefinition(branch, techId);
    if (!tech || !s.tech?.[branch]) return false;
    const nextLevel = Math.max(1, Math.min(techMaxLevel(tech), Math.round(job.payload?.level || techLevel(s, techId) + 1)));
    s.tech[branch].levels ||= {};
    s.tech[branch].levels[techId] = nextLevel;
    if (!s.tech[branch].completed.includes(techId)) s.tech[branch].completed.push(techId);
    s.tech[branch].level = Object.values(s.tech[branch].levels).reduce((sum, level) => sum + Number(level || 0), 0);
    const text = `研究完成：${tech.name}第${nextLevel}阶。${tech.desc}`;
    s.lastAction = { name: "科技研究完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "MARCH") {
    const army = armyEntity(s, job.armyId);
    const destinationId = job.payload?.destinationId;
    if (!army || !TERRITORY_DEFS[destinationId]) return false;
    const originId = job.payload?.originId || army.locationId;
    const groupIds = job.payload?.armyIds || [army.id];
    const groupArmies = groupIds.map(id => armyEntity(s, id)).filter(Boolean);
    groupArmies.forEach(item => {
      item.locationId = destinationId;
      item.destinationId = null;
      item.status = "idle";
      item.jobId = null;
    });
    if (army.owner !== "player" && s.territories[destinationId]?.owner === "player") {
      const result = resolveAIAttack(s, army, destinationId, Math.random, originId);
      if (result !== "captured") army.locationId = originId;
      startArmyRecovery(s, army, result === "captured" ? 110 * 1000 : 90 * 1000, job.completedAt || Date.now());
    }
    const battlePlan = job.payload?.battlePlan;
    if (army.owner === "player" && battlePlan && s.territories[destinationId]?.owner !== "player") {
      startBattle(s, { ...battlePlan, armyId: army.id, armyIds: groupIds, armyOrigins: job.payload?.armyOrigins, originId, targetId: destinationId, arrival: true, supplyAlreadyPaid: true });
    }
    const text = `${army.name}抵达${TERRITORY_DEFS[destinationId].name}。`;
    s.lastAction = { name: "行军完成", text };
    log(s, "good", text);
    return true;
  }
  if (job.type === "RECOVER") {
    const army = armyEntity(s, job.armyId);
    if (!army) return false;
    army.status = "idle";
    army.jobId = null;
    const text = `${army.name}完成整补，可以再次行军或出征。`;
    if (army.owner === "player") s.lastAction = { name: "军团整补完成", text };
    log(s, "info", text);
    return true;
  }
  return false;
}

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

function unitDisplayHint(type) {
  return UNIT_DISPLAY_HINTS[type] || UNIT_DEFS[type]?.role || "适应多种战场";
}

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
function normalizeEventLanguage(value) {
  return String(value ?? "")
    .replace(/王室认可/g, "声望")
    .replace(/战争疲劳/g, "军心")
    .replace(/稳定度/g, "民心")
    .replace(/稳定/g, "民心")
    .replace(/功劳/g, "声望")
    .replace(/野心/g, "忠诚")
    .replace(/不满\s*[+]\s*(\d+)/g, "忠诚 −$1")
    .replace(/不满\s*[−-]\s*(\d+)/g, "忠诚 +$1")
    .replace(/不满上升/g, "忠诚下降")
    .replace(/不满下降/g, "忠诚上升")
    .replace(/人口/g, "居民");
}

function collapseEventMetrics(note) {
  let text = note;
  ["金币", "粮食", "军心", "民心", "声望", "忠诚"].forEach(label => {
    const pattern = new RegExp(`${label}\\s*([+−-])\\s*(\\d+)[，,；;]\\s*${label}\\s*([+−-])\\s*(\\d+)`, "g");
    text = text.replace(pattern, (_, signA, amountA, signB, amountB) => {
      const total = (signA === "-" || signA === "−" ? -1 : 1) * Number(amountA) + (signB === "-" || signB === "−" ? -1 : 1) * Number(amountB);
      return `${label} ${total >= 0 ? "+" : "−"}${Math.abs(total)}`;
    });
  });
  return text;
}

function normalizeEventChanges(changes = {}) {
  const next = { ...changes };
  const add = (key, value) => { next[key] = (next[key] || 0) + value; };
  if (next.legitimacy) { add("renown", next.legitimacy); delete next.legitimacy; }
  if (next.warWeariness) { add("morale", next.warWeariness); delete next.warWeariness; }
  if (next.stabilityAll) { add("support", next.stabilityAll); delete next.stabilityAll; }
  if (next.stabilityWeak) { add("support", next.stabilityWeak); delete next.stabilityWeak; }
  if (next.grievanceAll) { add("loyaltyAll", -next.grievanceAll); delete next.grievanceAll; }
  if (next.grievance) { add("loyalty", -next.grievance); delete next.grievance; }
  if (next.merit) { add("renown", next.merit); delete next.merit; }
  delete next.ambition;
  return next;
}

function normalizeEventDefinitions(events) {
  events.forEach(event => {
    event.kicker = normalizeEventLanguage(event.kicker);
    event.title = normalizeEventLanguage(event.title);
    event.body = normalizeEventLanguage(event.body);
    event.options = event.options.map(([name, note, changes, chronicle]) => [
      normalizeEventLanguage(name), collapseEventMetrics(normalizeEventLanguage(note)), normalizeEventChanges(changes), normalizeEventLanguage(chronicle)
    ]);
  });
}

normalizeEventDefinitions(WORLD_EVENTS);
normalizeEventDefinitions(NPC_ARCS);

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

let S = null;
let creatorDifficulty = "standard";
let prologueIndex = 0;
let toastTimer = 0;
let worldTimer = 0;
let hiddenAt = 0;

const $ = id => typeof document === "undefined" ? null : document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
const clone = value => JSON.parse(JSON.stringify(value));
const seasonOf = s => SEASONS[s.turn % 4];
const yearOf = s => Math.floor(s.turn / 4) + 1;
const difficultyOf = s => DIFFICULTIES[s.difficulty] || DIFFICULTIES.standard;
const officer = (s, id) => s.officers.find(o => o.id === id);
const ownedOfficers = s => s.officers.filter(o => o.side === "player");
const ownTerritoryIds = s => Object.keys(s.territories).filter(id => TERRITORY_DEFS[id]?.playable !== false && s.territories[id].owner === "player");
const owns = (s, id) => s.territories[id]?.owner === "player";

// 返回的是运行时 officer 记录（含 side/loyalty 等可变字段），不是 LORD_DEFS 静态条目。
// 契约：返回 null 同时代表「此地无守将」和「lordId 指向了不存在的领主」两种情况，
// 调用方无法区分——数据损坏由 selfCheck() 负责发现。
function lordAt(s, territoryId) {
  const lordId = s?.territories?.[territoryId]?.lordId;
  return lordId ? (officer(s, lordId) || null) : null;
}

// 辖地由 territories 派生，不单独存储，因此永远不会和地图对不上。
function lordHoldings(s, lordId) {
  if (!lordId) return [];
  return Object.keys(s?.territories || {}).filter(id => s.territories[id].lordId === lordId);
}

// 从属关系取自静态表：本作没有「附庸改换门庭」的流程，领主只会从叛臣归降为玩家方。
// 必须挡住 lordId 为空的调用，否则会把所有 liege 为 null 的独立叛臣当成某人的附庸返回。
function lordVassals(s, lordId) {
  if (!lordId) return [];
  return (s?.officers || []).filter(o => LORD_DEFS[o.id]?.liege === lordId && o.side !== "player" && o.side !== "gone");
}

const cityIntelActive = (s, id) => (s.cityIntel?.[id] || -1) >= s.turn;

function cityActionLockKey(id, action) { return `city_${id}_${action}`; }

function cityActionAvailable(s, id, action) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || !CITY_ACTION_DEFS[action] || s.battleSession) return false;
  if (cityActionJob(s, id) || (s.seasonLocks?.[cityActionLockKey(id, action)] || 0) >= 1) return false;
  if (action === "scout") return !owns(s, id);
  return false;
}

function cityActionCostMet(s, action) {
  const cost = CITY_ACTION_DEFS[action]?.cost || {};
  return (s.gold || 0) >= (cost.gold || 0) && (s.grain || 0) >= (cost.grain || 0);
}

function cityActionJob(s, id) {
  return getRunningJob(s, `city:${id}`);
}

function cityAction(s, id, action) {
  if (!cityActionAvailable(s, id, action)) return false;
  if (!cityActionCostMet(s, action)) return false;
  const d = TERRITORY_DEFS[id];
  const cost = CITY_ACTION_DEFS[action].cost;
  s.gold -= cost.gold || 0;
  s.grain -= cost.grain || 0;
  s.seasonLocks ||= {};
  s.seasonLocks[cityActionLockKey(id, action)] = 1;
  const job = startJob(s, {
    type: "CITY_ACTION",
    territoryId: id,
    startedAt: Date.now(),
    durationMs: CITY_ACTION_DURATIONS[action],
    queueKey: `city:${id}`,
    payload: { actionId: action, gold: cost.gold || 0, grain: cost.grain || 0 }
  });
  const text = `${d.name}开始${CITY_ACTION_DEFS[action].name}，预计${formatDuration(CITY_ACTION_DURATIONS[action])}后完成。`;
  s.lastAction = { name: `${d.name} · 行动已安排`, text };
  log(s, "info", text);
  return !!job;
}

function resolveCityAction(s, id, action) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || !CITY_ACTION_DEFS[action]) return false;
  s.cityIntel ||= {};
  if (action !== "scout") return false;
  s.cityIntel[id] = s.turn + 2;
  const text = `斥候从${d.name}带回城防、粮道与地形记录。`;
  s.lastAction = { name: `${d.name} · ${CITY_ACTION_DEFS[action].name}`, text };
  log(s, "info", text);
  return true;
}

function cityActionOptions(s, id) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t) return [];
  const options = ["scout", "envoy", "trade", "raid", "charter", "steward"].filter(action => cityActionAvailable(s, id, action));
  return options.map(action => {
    const def = CITY_ACTION_DEFS[action];
    const cost = [def.cost.gold ? `${def.cost.gold}金` : "", def.cost.grain ? `${def.cost.grain}粮` : ""].filter(Boolean).join(" · ");
    return { id: action, name: def.name, note: `${def.note}${cost ? `（${cost}）` : ""}`, disabled: !cityActionCostMet(s, action) };
  });
}

function crestSvg(faction, title = "") {
  const path = CREST_PATHS[faction] || CREST_PATHS.player;
  return `<svg viewBox="0 0 48 54" role="img" aria-label="${esc(title || FACTIONS[faction]?.name || "家徽")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function glyphSvg(id) {
  return `<span class="ui-glyph" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${GLYPH_PATHS[id] || GLYPH_PATHS.levy}</svg></span>`;
}

function weakestTerritoryId(s, stat = "stability") {
  return ownTerritoryIds(s).sort((a, b) => (s.territories[a][stat] || 0) - (s.territories[b][stat] || 0))[0];
}

function applyEventEffects(s, changes = {}, officerId = null) {
  changes = normalizeEventChanges(changes);
  ["gold", "grain", "support", "morale", "renown", "legitimacy", "warWeariness"].forEach(key => {
    if (changes[key] == null) return;
    s[key] = ["support", "morale", "renown", "legitimacy", "warWeariness"].includes(key) ? clamp((s[key] || 0) + changes[key]) : (s[key] || 0) + changes[key];
  });
  if (changes.stabilityAll) ownTerritoryIds(s).forEach(id => s.territories[id].stability = clamp(s.territories[id].stability + changes.stabilityAll));
  if (changes.stabilityWeak) {
    const id = weakestTerritoryId(s, "stability");
    if (id) s.territories[id].stability = clamp(s.territories[id].stability + changes.stabilityWeak);
  }
  if (changes.guardWeak) {
    const id = weakestTerritoryId(s, "guard");
    if (id) s.territories[id].guard = Math.max(0, s.territories[id].guard + changes.guardWeak);
  }
  if (changes.loyaltyAll || changes.grievanceAll) ownedOfficers(s).filter(o => o.id !== "player").forEach(o => {
    o.loyalty = clamp(o.loyalty + (changes.loyaltyAll || 0));
    o.grievance = clamp(o.grievance + (changes.grievanceAll || 0));
  });
  Object.keys(UNIT_DEFS).forEach(type => { if (changes[type]) addUnits(s, type, changes[type]); });
  const person = officerId ? officer(s, officerId) : null;
  if (person) {
    if (changes.loyalty) person.loyalty = clamp(person.loyalty + changes.loyalty);
    if (changes.grievance) person.grievance = clamp(person.grievance + changes.grievance);
    if (changes.merit) person.merit = Math.max(0, person.merit + changes.merit);
  }
}

function scriptedEventView(s, def, officerId = null) {
  const person = officerId ? officer(s, officerId) : null;
  return {
    kicker: cleanDisplayText(def.kicker || `${person?.title || "家臣"} · 人物事件`),
    title: cleanDisplayText(def.title),
    portrait: def.portrait || person?.portrait || "assets/player.webp",
    body: `<p>${esc(cleanDisplayText(def.body))}</p>`,
    options: def.options.map(([name, note, changes, chronicle]) => ({
      name: cleanDisplayText(name), note: cleanDisplayText(note),
      disabled: (changes.gold < 0 && s.gold < Math.abs(changes.gold)) || (changes.grain < 0 && s.grain < Math.abs(changes.grain)),
      effect() {
        applyEventEffects(s, changes, officerId);
        log(s, changes.support > 0 || changes.loyalty > 0 ? "good" : changes.support < 0 || changes.grievance > 5 ? "warn" : "info", cleanDisplayText(chronicle));
      }
    }))
  };
}

function compositionTotal(comp = {}) {
  return Object.keys(UNIT_DEFS).reduce((sum, type) => sum + Math.max(0, Math.round(comp[type] || 0)), 0);
}

function emptyComposition() {
  return Object.fromEntries(Object.keys(UNIT_DEFS).map(type => [type, 0]));
}

function territoryGarrison(s, territoryId) {
  const t = s?.territories?.[territoryId];
  if (!t) return emptyComposition();
  t.garrison ||= emptyComposition();
  return t.garrison;
}

function playerComposition(s) {
  const split = playerCompositionSplit(s);
  return Object.keys(split.mobile).reduce((total, type) => { total[type] = split.mobile[type] + split.garrison[type]; return total; }, emptyComposition());
}

function playerCompositionSplit(s) {
  const mobile = emptyComposition();
  const garrison = emptyComposition();
  (s?.armies || []).filter(army => army.owner === "player").forEach(army => Object.keys(mobile).forEach(type => { mobile[type] += Math.max(0, Math.round(army.composition?.[type] || 0)); }));
  ownTerritoryIds(s).forEach(id => Object.keys(garrison).forEach(type => { garrison[type] += Math.max(0, Math.round(territoryGarrison(s, id)[type] || 0)); }));
  return { mobile, garrison };
}

function armyTotal(s, armyId = null) {
  if (armyId) return compositionTotal(armyEntity(s, armyId)?.composition);
  const armies = (s?.armies || []).filter(army => army.owner === "player").reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  const garrisons = ownTerritoryIds(s).reduce((sum, id) => sum + compositionTotal(territoryGarrison(s, id)), 0);
  return armies + garrisons;
}

function defaultArmyEntity(s) {
  return {
    id: "army_1",
    name: "渡鸦第一军团",
    owner: "player",
    locationId: "ravenstone",
    destinationId: null,
    composition: { ...emptyComposition(), ...(s.army || {}) },
    leaders: ["player"],
    commanderId: "player",
    morale: s.morale,
    training: s.training,
    supply: 100,
    status: "idle",
    jobId: null
  };
}

function playerArmies(s) {
  return (s?.armies || []).filter(army => army.owner === "player");
}

function nextArmyId(s) {
  const used = new Set((s?.armies || []).map(army => army.id));
  let index = 1;
  while (used.has(`army_${index}`)) index++;
  return `army_${index}`;
}

function armyStatusText(s, army) {
  if (!army) return "未编成";
  const job = army.jobId ? (s.jobs || []).find(item => item.id === army.jobId && item.status === "running") : null;
  if (army.status === "marching") return job ? `行军中 · ${formatDuration(getJobRemainingMs(job))}` : "行军中";
  if (army.status === "recovering") return job ? `整补中 · ${formatDuration(getJobRemainingMs(job))}` : "整补中";
  if (army.status === "engaged") return "交战中";
  if (army.status === "supporting") return "随同出征";
  return "待命";
}

function canUseCommander(s, id, ignoreArmyId = null) {
  if (playerArmies(s).some(army => army.id !== ignoreArmyId && (army.commanderId || army.leaders?.[0]) === id)) return false;
  if (id === "player") return true;
  const knight = knightById(s, id);
  if (!knight || knight.side !== "player" || knight.status !== "active") return false;
  return true;
}

function createArmyFromMain(s, name, commanderId, composition) {
  if (!s || s.battleSession) return false;
  const main = armyEntity(s, "army_1");
  const clean = { ...emptyComposition(), ...(composition || {}) };
  const total = compositionTotal(clean);
  if (!main || main.status !== "idle" || !canUseCommander(s, commanderId) || !name?.trim() || total < 10) return false;
  if (Object.keys(UNIT_DEFS).some(type => clean[type] > (main.composition[type] || 0))) return false;
  if (compositionTotal(main.composition) - total < 10) return false;
  Object.keys(UNIT_DEFS).forEach(type => { main.composition[type] = Math.max(0, (main.composition[type] || 0) - clean[type]); });
  const army = {
    id: nextArmyId(s), name: name.trim().slice(0, 18), owner: "player", locationId: main.locationId,
    destinationId: null, composition: clean, leaders: [commanderId], commanderId,
    morale: s.morale, training: s.training, supply: 100, status: "idle", jobId: null
  };
  s.armies.push(army);
  syncTroops(s);
  s.lastAction = { name: "军团编成", text: `${army.name}在${TERRITORY_DEFS[army.locationId]?.name || "驻地"}组建，由${commanderName(s, commanderId)}带领。` };
  log(s, "good", s.lastAction.text);
  return army;
}

function disbandArmy(s, armyId) {
  if (!s || s.battleSession || armyId === "army_1") return false;
  const army = armyEntity(s, armyId);
  const main = armyEntity(s, "army_1");
  if (!army || !main || army.owner !== "player" || army.status !== "idle") return false;
  if (army.locationId === main.locationId && main.status === "idle") {
    Object.keys(UNIT_DEFS).forEach(type => { main.composition[type] += army.composition[type] || 0; });
  } else {
    const garrison = territoryGarrison(s, army.locationId);
    Object.keys(UNIT_DEFS).forEach(type => { garrison[type] += army.composition[type] || 0; });
  }
  s.armies = s.armies.filter(item => item.id !== armyId);
  syncTroops(s);
  s.lastAction = { name: "军团解散", text: `${army.name}已解散，兵力${army.locationId === main.locationId ? "编回主军" : "留作当地驻军"}。` };
  log(s, "info", s.lastAction.text);
  return true;
}

function armyEntity(s, id = "army_1") {
  const own = (s?.armies || []).find(army => army.id === id);
  if (own) return own;
  return Object.values(s?.factions || {}).flatMap(faction => faction.armies || []).find(army => army.id === id) || null;
}

function ensureAIFactions(s) {
  s.factions ||= {};
  Object.entries(AI_FACTION_DEFS).forEach(([id, def]) => {
    const faction = s.factions[id] ||= { id, ...clone(def), relations: {}, tech: { completed: [] }, armies: [] };
    faction.relations ||= {};
    faction.tech ||= { completed: [] };
    faction.tech.completed ||= [];
    faction.armies = Array.isArray(faction.armies) ? faction.armies : [];
    if (!faction.armies.length) faction.armies.push({
      id: `${id}_army_1`, name: `${FACTIONS[id].name}主力`, owner: id, locationId: def.capital, destinationId: null,
      composition: { ...emptyComposition(), levy: id === "crown" ? 46 : 30, archers: id === "river" ? 15 : 8, knights: id === "crown" ? 10 : 4, heavy_infantry: id === "crown" ? 8 : 3, crossbowmen: id === "crown" ? 5 : 2, light_cavalry: id === "wolf" ? 5 : 2 },
      leaders: id === "wolf" ? ["bran"] : id === "river" ? ["aveline"] : [], morale: 62, training: 10, supply: 100, status: "idle", jobId: null
    });
  });
  return s.factions;
}

function syncArmyEntities(s) {
  if (!s) return;
  s.armies = Array.isArray(s.armies) && s.armies.length ? s.armies : [defaultArmyEntity(s)];
  s.armies.forEach(army => {
    army.name ||= army.id === "army_1" ? "渡鸦第一军团" : "北境军团";
    army.commanderId ||= army.leaders?.[0] || "player";
    army.leaders = [army.commanderId];
    army.composition = { ...emptyComposition(), ...(army.composition || {}) };
    army.morale ??= s.morale;
    army.training ??= s.training;
    army.supply = Math.max(0, Math.min(100, Number(army.supply ?? 100)));
  });
  const main = s.armies[0];
  s.army = clone(main.composition);
}

function syncTroops(s) {
  syncArmyEntities(s);
  s.troops = armyTotal(s);
  return s.troops;
}

function addUnits(s, type, amount, territoryId = primaryTerritoryId(s)) {
  const garrison = territoryGarrison(s, territoryId);
  garrison[type] = Math.max(0, Math.round((garrison[type] || 0) + amount));
  return syncTroops(s);
}

function removeFromComposition(comp, amount) {
  let left = Math.min(compositionTotal(comp), Math.max(0, Math.round(amount)));
  const removed = emptyComposition();
  for (const type of Object.keys(UNIT_DEFS)) {
    const take = Math.min(comp[type] || 0, left);
    comp[type] = Math.max(0, (comp[type] || 0) - take);
    removed[type] += take;
    left -= take;
  }
  return removed;
}

function removeTroops(s, amount) {
  let left = Math.max(0, Math.round(amount));
  const removed = emptyComposition();
  const pools = [
    ...ownTerritoryIds(s).map(id => territoryGarrison(s, id)),
    ...(s.armies || []).filter(army => army.owner === "player").map(army => army.composition)
  ];
  pools.forEach(comp => {
    if (left <= 0) return;
    const part = removeFromComposition(comp, left);
    Object.keys(removed).forEach(type => { removed[type] += part[type]; });
    left -= compositionTotal(part);
  });
  syncTroops(s);
  return removed;
}

function deployGarrison(s, territoryId, armyId = "army_1") {
  const army = armyEntity(s, armyId);
  const garrison = territoryGarrison(s, territoryId);
  if (!army || army.owner !== "player" || army.status !== "idle" || army.locationId !== territoryId || compositionTotal(garrison) <= 0) return false;
  Object.keys(UNIT_DEFS).forEach(type => {
    army.composition[type] = Math.max(0, (army.composition[type] || 0) + (garrison[type] || 0));
    garrison[type] = 0;
  });
  syncTroops(s);
  const text = `${TERRITORY_DEFS[territoryId].name}驻军编入${army.name}。`;
  s.lastAction = { name: "补充军团", text };
  log(s, "info", text);
  return true;
}

function selectedComposition(s, troops, armyId = "army_1") {
  const source = armyEntity(s, armyId)?.composition || s.army || emptyComposition();
  const total = Math.max(1, compositionTotal(source));
  const selected = clamp(Math.round(troops), 0, total);
  const ratio = selected / total;
  const result = emptyComposition();
  Object.keys(UNIT_DEFS).forEach(type => { result[type] = Math.min(source[type] || 0, Math.floor((source[type] || 0) * ratio)); });
  let missing = selected - compositionTotal(result);
  for (const type of Object.keys(UNIT_DEFS)) {
    if (missing <= 0) break;
    const room = Math.max(0, (source[type] || 0) - result[type]);
    const add = Math.min(room, missing);
    result[type] += add;
    missing -= add;
  }
  return result;
}

function compositionText(comp) {
  return Object.entries(UNIT_DEFS).filter(([type]) => (comp[type] || 0) > 0).map(([type, unit]) => `${unit.short}${Math.round(comp[type] || 0)}`).join(" · ") || "无兵力";
}

function unitTerrainMultiplier(type, tags = []) {
  if (tags.includes("plains")) return { levy: .92, archers: 1.05, knights: 2.02, heavy_infantry: 1.18, crossbowmen: 1.08, light_cavalry: 1.65 }[type] || 1;
  if (tags.includes("forest")) return { levy: .98, archers: 1.34, knights: 1.2, heavy_infantry: 1.08, crossbowmen: 1.2, light_cavalry: .86 }[type] || 1;
  if (tags.includes("mountain")) return { levy: 1.02, archers: 1.28, knights: 1.18, heavy_infantry: 1.22, crossbowmen: 1.18, light_cavalry: .82 }[type] || 1;
  if (tags.includes("river")) return { levy: .98, archers: 1.24, knights: 1.28, heavy_infantry: 1.08, crossbowmen: 1.18, light_cavalry: .9 }[type] || 1;
  if (tags.includes("capital")) return { levy: 1, archers: 1.02, knights: 1.34, heavy_infantry: 1.2, crossbowmen: 1.18, light_cavalry: .9 }[type] || 1;
  return { levy: .92, archers: 1.1, knights: 1.7, heavy_infantry: 1.15, crossbowmen: 1.12, light_cavalry: 1.25 }[type] || 1;
}

function unitLevel(s, type) {
  const unit = UNIT_DEFS[type];
  if (!unit) return 1;
  const tech = (unit.equipmentTech || []).reduce((sum, id) => sum + techLevel(s, id), 0);
  const barracks = ownTerritoryIds(s).reduce((max, id) => Math.max(max, s.territories[id].buildings?.barracks || 0), 0);
  return Math.max(1, Math.min(5, 1 + Math.floor(tech / 2) + Math.floor(barracks / 3)));
}

function unitEquipment(s, type) {
  const unit = UNIT_DEFS[type] || UNIT_DEFS.levy;
  const level = unitLevel(s, type);
  return { level, attack: Math.round(unit.attack * (1 + (level - 1) * .1) * 100), defense: Math.round(unit.defense * (1 + (level - 1) * .09) * 100), hp: Math.round(unit.hp * (1 + (level - 1) * .12)) };
}

function counterMultiplier(attacker, defender) {
  const attackTotal = Math.max(1, compositionTotal(attacker));
  const defendTotal = Math.max(1, compositionTotal(defender));
  let advantage = 0;
  Object.entries(attacker).forEach(([a, count]) => Object.entries(defender).forEach(([d, enemyCount]) => {
    if (!count || !enemyCount) return;
    const unit = UNIT_DEFS[a];
    if (unit?.counters?.includes(d)) advantage += count * enemyCount;
    if (unit?.weakTo?.includes(d)) advantage -= count * enemyCount;
  }));
  return Math.max(.74, Math.min(1.3, 1 + advantage / Math.max(1, attackTotal * defendTotal) * .55));
}

function compositionPower(comp, targetId, planId, seasonId, s = null) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  const seasonMult = seasonId === "winter" ? .88 : seasonId === "spring" ? .94 : seasonId === "summer" ? 1.04 : 1;
  return Object.keys(UNIT_DEFS).reduce((sum, type) => {
    const equipment = s ? unitEquipment(s, type) : { attack: Math.round(UNIT_DEFS[type].attack * 100) };
    let planMult = planId === "ambush" && ["archers", "crossbowmen"].includes(type) ? 1.12 : planId === "assault" && ["knights", "light_cavalry"].includes(type) ? 1.08 : 1;
    return sum + (comp[type] || 0) * (equipment.attack / 100) * unitTerrainMultiplier(type, tags) * seasonMult * planMult;
  }, 0);
}

function campaignSupply(s, troops, leaderIds = [], armyId = "army_1") {
  const comp = selectedComposition(s, troops, armyId);
  return compositionSupply(s, comp, leaderIds);
}

function compositionSupply(s, comp = {}, leaderIds = []) {
  let amount = Math.ceil(Object.entries(comp).reduce((sum, [type, count]) => sum + count * (UNIT_DEFS[type]?.supply || 1), 0) / 8);
  if (seasonOf(s).id === "winter") amount = Math.ceil(amount * 1.35);
  if (leaderIds.includes("ysabel")) amount = Math.ceil(amount * .84);
  return Math.max(1, amount);
}

function allocateLosses(comp, totalLoss) {
  const remaining = clone(comp);
  const result = emptyComposition();
  const risks = Object.fromEntries(Object.entries(UNIT_DEFS).map(([type, unit]) => [type, type === "heavy_infantry" || type === "knights" ? .48 : type === "archers" || type === "crossbowmen" ? .72 : 1]));
  let left = Math.min(Math.round(totalLoss), Object.values(comp).reduce((a, b) => a + b, 0));
  while (left > 0) {
    const candidates = Object.keys(UNIT_DEFS).filter(type => remaining[type] > 0).sort((a, b) => remaining[b] * risks[b] - remaining[a] * risks[a]);
    if (!candidates.length) break;
    const type = candidates[0];
    remaining[type]--;
    result[type]++;
    left--;
  }
  return result;
}

function createInitialState(name, startingStyle, difficulty) {
  const territories = {};
  Object.entries(TERRITORY_DEFS).forEach(([id, d]) => {
    territories[id] = {
      owner: d.owner,
      stability: d.stability,
      guard: d.guard,
      devastated: 0,
      fiefHolder: null,
      garrison: emptyComposition(),
      lordId: d.owner === "player" ? null : (SEAT_TO_LORD[id] || null),
      buildings: { fields: id === "ravenstone" ? 1 : id === "westmarch" ? 2 : 0, market: id === "ravenstone" || id === "blackthorn" ? 1 : 0, barracks: id === "ravenstone" || id === "ironhill" ? 1 : 0, walls: id === "ravenstone" ? 1 : 0, granary: id === "ravenstone" || id === "westmarch" ? 1 : 0, academy: 0, workshop: id === "ironhill" ? 1 : 0, roads: 0, watchtower: 0, temple: 0 }
    };
  });
  const officers = Object.entries(LORD_DEFS).map(([id, d]) => {
    // 领主的 side 就是其势力；只有 tier "loyal" 的人（王子、老管家）站在玩家一边。
    const side = d.tier === "loyal" ? "player" : d.faction;
    return {
      id, ...clone(d), side, recruitable: false,
      name: id === "player" ? (name.trim() || "罗恩") : d.name,
      loyalty: d.loyalty, ambition: d.ambition, grievance: 0, merit: 0, injured: 0, fief: null,
      captured: false, rapport: 0, submitted: false, promisedFief: null
    };
  });
  const style = { oath: 0, iron: 0, wealth: 0 };
  if (style[startingStyle] != null) style[startingStyle] = 2;
  const state = {
    version: VERSION,
    playerName: name.trim() || "罗恩",
    difficulty, style,
    turn: 0, tab: "hall", selectedTerritoryId: "ravenstone",
    gold: 58,
    grain: 125,
    knowledge: 12,
    army: { levy: 30, archers: 8, knights: 4, heavy_infantry: 0, crossbowmen: 0, light_cavalry: 0 },
    troops: 42,
    armies: [],
    support: 52,
    morale: 55,
    renown: 8,
    legitimacy: 35,
    training: 0,
    warWeariness: 0,
    crisis: { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 },
    territories, officers, knights: createKnightRoster(),
    clock: null,
    pauseState: null,
    jobs: [],
    tech: clone(TECH_DEFAULTS),
    factions: {},
    seasonLocks: {},
    cityIntel: {},
    battles: 0, wins: 0, casualties: 0,
    lastAction: null,
    lastBattle: null,
    battleSession: null,
    pendingDecisions: [],
    seenEvents: [],
    seenNpcEvents: [],
    flags: { firstWinter: false, cousinDemand: false, taxDemand: false },
    ended: false,
    endingReason: null,
    log: []
  };
  state.armies = [defaultArmyEntity(state)];
  ensureAIFactions(state);
  initClock(state);
  log(state, "info", `${state.playerName}在雨夜接过渡鸦堡的领主印戒。`);
  return state;
}

function migrateV1ToV2(raw, now = Date.now()) {
  const migrated = clone(raw);
  migrated.version = VERSION;
  delete migrated.ap;
  migrated.clock = makeClock(migrated.turn || 0, now);
  migrated.jobs = Array.isArray(migrated.jobs) ? migrated.jobs : [];
  migrated.tech ||= clone(TECH_DEFAULTS);
  migrated.factions ||= {};
  migrated.migrationLog = [...(migrated.migrationLog || []), "v1-to-v2"];
  return migrated;
}

function migrateSave(raw, now = Date.now()) {
  if (!raw) return null;
  let migrated = clone(raw);
  if (migrated.version === 1 || migrated.version == null) migrated = migrateV1ToV2(migrated, now);
  if (migrated.version !== VERSION) return null;
  return hydrateV2(migrated);
}

function hydrateState(raw) {
  return migrateSave(raw);
}

function hydrateV2(raw) {
  if (!raw || raw.version !== VERSION) return null;
  raw.turn ??= 0;
  raw.selectedTerritoryId ||= "ravenstone";
  raw.clock ||= makeClock(raw.turn);
  raw.pauseState ||= null;
  raw.jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
  raw.knowledge ??= 12;
  raw.tech ||= clone(TECH_DEFAULTS);
  Object.keys(TECH_DEFAULTS).forEach(branch => {
    raw.tech[branch] ||= clone(TECH_DEFAULTS[branch]);
    raw.tech[branch].completed = Array.isArray(raw.tech[branch].completed) ? raw.tech[branch].completed : [];
    raw.tech[branch].levels = raw.tech[branch].levels && typeof raw.tech[branch].levels === "object" ? raw.tech[branch].levels : {};
    raw.tech[branch].completed.forEach(id => { if (!Number.isFinite(raw.tech[branch].levels[id])) raw.tech[branch].levels[id] = 1; });
    raw.tech[branch].level = Object.values(raw.tech[branch].levels).reduce((sum, level) => sum + Math.max(0, Math.min(TECH_MAX_LEVEL, Math.round(level || 0))), 0);
  });
  raw.factions ||= {};
  raw.cityIntel ||= {};
  delete raw.cityRelations;
  delete raw.cityTradeposts;
  raw.pendingDecisions ||= [];
  raw.seenEvents ||= [];
  raw.seenNpcEvents ||= [];
  raw.officers ||= [];
  // 早期版本在重复打开存档时可能写入同一名候选领主，按 id 去重，避免领主府出现重复卡片。
  const uniqueOfficers = new Map();
  raw.officers.forEach(o => { if (o?.id && !uniqueOfficers.has(o.id)) uniqueOfficers.set(o.id, o); });
  raw.officers = [...uniqueOfficers.values()];
  // 旧存档把可招募领主标成 locked；迁移后统一放入中立候选区，避免人物页看不到可招募对象。
  raw.officers.forEach(o => { if (LORD_DEFS[o.id]?.recruitable && o.side === "locked") o.side = "neutral"; });
  const defaultKnights = createKnightRoster();
  raw.knights = Array.isArray(raw.knights) ? raw.knights : [];
  const knightMap = new Map(raw.knights.filter(knight => knight?.id).map(knight => [knight.id, knight]));
  defaultKnights.forEach(knight => { if (!knightMap.has(knight.id)) knightMap.set(knight.id, knight); });
raw.knights = [...knightMap.values()].map(knight => ({ ...knight, status: knight.status || "available", loyalty: Math.round(knight.loyalty || 50), force: Math.round(knight.force || 50), command: Math.round(knight.command || 45), scheme: Math.round(knight.scheme || 45) }));
  raw.seasonLocks ||= {};
  raw.flags ||= {};
  raw.flags.firstWinter ??= false;
  raw.flags.cousinDemand ??= false;
  raw.flags.taxDemand ??= false;
  raw.style ||= { oath: 0, iron: 0, wealth: 0 };
  const buildingDefaults = Object.fromEntries(Object.keys(BUILDINGS).map(type => [type, 0]));
  Object.values(raw.territories).forEach(t => { delete t.policy; t.garrison ||= emptyComposition(); t.buildings = { ...buildingDefaults, ...(t.buildings || {}) }; });
  const legacyArmyMissing = !raw.army;
  if (legacyArmyMissing) {
    const total = Math.max(0, Math.round(raw.troops || 0));
    const knights = Math.min(4, Math.floor(total / 8));
    const archers = Math.min(8, Math.floor(total / 4));
    raw.army = { ...emptyComposition(), levy: Math.max(0, total - knights - archers), archers, knights };
  }
  if (!Array.isArray(raw.armies) || !raw.armies.length) raw.armies = [defaultArmyEntity(raw)];
  raw.armies.forEach((army, index) => {
    army.id ||= `army_${index + 1}`;
    army.name ||= index === 0 ? "渡鸦第一军团" : `第${index + 1}军团`;
    army.owner ||= "player";
    army.locationId ||= "ravenstone";
    army.destinationId ??= null;
    if (legacyArmyMissing && index === 0) army.composition = clone(raw.army);
    army.composition = { ...emptyComposition(), ...(army.composition || (index === 0 ? raw.army : {})) };
    army.leaders = Array.isArray(army.leaders) && army.leaders.length ? army.leaders : ["player"];
    army.commanderId ||= army.leaders.find(id => id === "player" || knightById(raw, id)?.status === "active") || "player";
    army.leaders = [army.commanderId];
    army.morale ??= raw.morale;
    army.training ??= raw.training;
    army.supply ??= 100;
    army.status ||= "idle";
    army.jobId ??= null;
  });
  if (raw.armies[0] && raw.armies[0].composition && raw.troops && Object.values(raw.territories).every(t => compositionTotal(t.garrison) === 0) && raw.armies.length === 1) {
    raw.armies[0].composition = clone(raw.armies[0].composition);
  }
  raw.warWeariness ??= 0;
  raw.crisis ||= { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 };
  raw.crisis.famine ??= 0;
  raw.crisis.debt ??= 0;
  raw.crisis.unrest ??= 0;
  raw.crisis.checkedTurn ??= -1;
  raw.officers.forEach(o => { o.grievance ??= 0; o.merit ??= 0; o.injured ??= 0; o.fief ??= null; });
  // 旧存档曾把玩家称为“主将”。迁移时同步为领主称谓，避免旧文案继续污染新界面。
  const playerOfficer = raw.officers.find(o => o.id === "player");
  if (playerOfficer) {
    playerOfficer.title = LORD_DEFS.player.title;
    playerOfficer.trait = LORD_DEFS.player.trait;
    playerOfficer.traitText = LORD_DEFS.player.traitText;
  }
  Object.values(raw.territories).forEach(t => {
    if (t.fiefHolder && t.fiefHolder !== "charter" && officer(raw, t.fiefHolder)?.side !== "player") t.fiefHolder = null;
  });
  raw.officers.forEach(o => {
    if (o.side !== "player" || (o.fief && raw.territories[o.fief]?.fiefHolder !== o.id)) o.fief = null;
  });
  syncTroops(raw);
  if (raw.battleSession && !raw.battleSession.composition) {
    raw.battleSession.composition = selectedComposition(raw, raw.battleSession.troops);
    raw.battleSession.lossesByType = emptyComposition();
  }
  if (raw.battleSession) {
    raw.battleSession.flags ||= { demanded: false, pushed: false, aggression: 0 };
    raw.battleSession.flags.aggression ??= 0;
  }
  ensureAIFactions(raw);
  return raw;
}

function selfCheck(s = S) {
  const errors = [];
  if (!s) errors.push("state missing");
  if (s && s.version !== VERSION) errors.push(`version ${s.version} !== ${VERSION}`);
  if (s && !s.clock?.seasonEndsAt) errors.push("clock missing seasonEndsAt");
  if (s && !Array.isArray(s.jobs)) errors.push("jobs must be an array");
  if (s && Array.isArray(s.jobs)) {
    const ids = s.jobs.map(job => job.id);
    if (new Set(ids).size !== ids.length) errors.push("duplicate job id");
    const queues = s.jobs.filter(job => job.status === "running").map(job => job.queueKey);
    if (new Set(queues).size !== queues.length) errors.push("duplicate running queue");
  }
  if (s && !Array.isArray(s.officers)) errors.push("officers must be an array");
  if (s && Array.isArray(s.officers)) {
    const officerIds = s.officers.map(item => item?.id).filter(Boolean);
    if (new Set(officerIds).size !== officerIds.length) errors.push("duplicate officer id");
  }
  if (s && !Array.isArray(s.armies) || s && !s.armies?.length) errors.push("armies missing");
  if (s && Array.isArray(s.armies)) s.armies.forEach(army => {
    if (!army.locationId) errors.push(`army ${army.id || "unknown"} location missing`);
    if (!army.composition) errors.push(`army ${army.id || "unknown"} composition missing`);
  });
  if (s && !Number.isFinite(s.knowledge)) errors.push("knowledge missing");
  if (s && (!Number.isFinite(s.gold) || !Number.isFinite(s.grain))) errors.push("resources missing");
  if (s && !s.territories?.ravenstone) errors.push("ravenstone territory missing");
  if (s && armyTotal(s) !== Math.round(s.troops || 0)) errors.push("army total mismatch");
  return { ok: errors.length === 0, errors };
}

function interactionLocked(s) {
  return !!s?.battleSession;
}

function rejectDuringBattle(s) {
  if (!interactionLocked(s)) return false;
  toast("远征尚未结束，必须先下达战场命令");
  return true;
}

function log(s, kind, text) {
  s.log.unshift({ turn: s.turn, kind, text });
  s.log = s.log.slice(0, 120);
}

function saveGame() {
  if (!S || typeof localStorage === "undefined") return false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; }
  catch (_) { return false; }
}

function loadGame() {
  if (typeof localStorage === "undefined") return null;
  try {
    const loaded = hydrateState(JSON.parse(localStorage.getItem(SAVE_KEY)));
    if (!loaded) return null;
    catchUpOffline(loaded, Date.now());
    return loaded;
  }
  catch (_) { return null; }
}

function deleteSave() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
}

function subjects(s) {
  return Math.round(ownTerritoryIds(s).reduce((sum, id) => {
    const t = s.territories[id];
    return sum + TERRITORY_DEFS[id].people * (1 - Math.min(3, t.devastated) * .08);
  }, 0));
}

function territoryOutput(s, id, season = seasonOf(s)) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  const stability = .62 + t.stability / 265;
  const damage = 1 - Math.min(3, t.devastated) * .13;
  const share = t.fiefHolder && t.fiefHolder !== "charter" ? (techLevel(s, "provincial_offices") ? .77 + Math.max(0, techLevel(s, "provincial_offices") - 1) * .015 : .7) : 1;
  const wealth = 1;
  const bestGovernor = ownedOfficers(s).filter(o => !o.injured).sort((a, b) => b.stats.govern - a.stats.govern)[0];
  const admin = 1 + Math.max(0, (bestGovernor?.stats.govern || 55) - 55) / 550;
  const diff = difficultyOf(s).income;
  const grainTech = (1 + techLevel(s, "heavy_plow") * .08) * (1 + techLevel(s, "crop_rotation") * .1) * (1 + techLevel(s, "seed_selection") * .08) * (season.id === "winter" ? 1 + techLevel(s, "winter_storage") * .12 : 1) * (season.id !== "winter" ? 1 + techLevel(s, "irrigation") * .06 : 1);
  const goldTech = (1 + techLevel(s, "tax_registry") * .08) * (1 + techLevel(s, "coinage") * .08) * (1 + techLevel(s, "trade_guild") * .08);
  // 每块领地保留一小段基础余量，确保自动换季结算不是“产出刚好被开支吃完”；
  // 玩家仍需通过政策、建筑和扩张把余量放大，而不是靠反复点击应急征收维持运转。
  const grainBase = (d.grain + t.buildings.fields * 8 + 4) * grainTech;
  const goldBase = (d.gold + t.buildings.market * 3 + t.buildings.roads * 1.5 + 1) * goldTech;
  return {
    grain: Math.max(0, Math.round(grainBase * season.grain * stability * damage * share * diff)),
    gold: Math.max(0, Math.round(goldBase * season.gold * stability * damage * share * wealth * admin * diff))
  };
}

function forecast(s, season = seasonOf(s)) {
  const gross = ownTerritoryIds(s).reduce((acc, id) => {
    const out = territoryOutput(s, id, season);
    acc.gold += out.gold;
    acc.grain += out.grain;
    return acc;
  }, { gold: 0, grain: 0 });
  const winterExtra = season.id === "winter" ? Math.max(1, ownTerritoryIds(s).length) * difficultyOf(s).winter : 0;
  const seedReserve = season.id === "autumn" ? ownTerritoryIds(s).length * 2 : 0;
  const armySplit = playerCompositionSplit(s);
  const army = armySplit.mobile;
  const garrison = armySplit.garrison;
  let grainCost = Math.max(0, Math.ceil(army.levy / 4 + army.archers / 4 + army.knights / 3 + army.heavy_infantry / 3 + army.crossbowmen / 3 + army.light_cavalry / 3 + garrison.levy / 8 + garrison.archers / 8 + garrison.knights / 6) - 1) + winterExtra + seedReserve;
  if (techLevel(s, "census")) grainCost = Math.ceil(grainCost * Math.max(.82, 1 - techLevel(s, "census") * .06));
  const armyGoldCost = army.levy * .12 + army.archers * .23 + army.knights * .55 + garrison.levy * .06 + garrison.archers * .12 + garrison.knights * .28;
  const goldCost = Math.ceil(armyGoldCost * Math.max(.64, 1 - techLevel(s, "professional_army") * .18)) + ownedOfficers(s).filter(o => o.id !== "player").length + activeKnights(s).length;
  const fieldLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.fields || 0), 0);
  const granaryLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.granary || 0), 0);
  const storageCap = 105 + ownTerritoryIds(s).length * 45 + fieldLevels * 35 + granaryLevels * 32;
  const projected = s.grain + gross.grain - grainCost;
  const spoilageRate = Math.max(.05, .18 - granaryLevels * .018);
  const spoilage = Math.max(0, Math.round((projected - storageCap) * spoilageRate));
  return { ...gross, grainCost, goldCost, storageCap, spoilage, netGold: gross.gold - goldCost, netGrain: gross.grain - grainCost - spoilage };
}

function resourceFlow(s, season = seasonOf(s)) {
  const f = forecast(s, season);
  const duration = Math.max(1, TIME_CONFIG.seasonDurationMs);
  return { goldPerSecond: f.netGold / (duration / 1000), grainPerSecond: f.netGrain / (duration / 1000), goldGrossPerSecond: f.gold / (duration / 1000), grainGrossPerSecond: f.grain / (duration / 1000), forecast: f };
}

function accrueResources(s, fromAt, toAt) {
  if (!s || !s.clock || !Number.isFinite(fromAt) || !Number.isFinite(toAt) || toAt <= fromAt) return 0;
  // 只结算到本季边界为止：跨季由 advanceSeason() 负责推进季号后再次调用，
  // 否则同一段时间会按新季系数被重复结算。
  const boundary = Math.min(toAt, s.clock.seasonEndsAt || toAt);
  const changed = Math.max(0, boundary - fromAt) / 1000;
  if (changed > 0) {
    const flow = resourceFlow(s, seasonOf(s));
    s.gold += flow.goldPerSecond * changed;
    s.grain += flow.grainPerSecond * changed;
  }
  return changed;
}

function buildingCost(s, id, type) {
  const level = s.territories[id].buildings[type];
  return Math.round(BUILDINGS[type].base + level * 13);
}

function canUpgrade(s, id, type) {
  const t = s.territories[id];
  return !!t && t.owner === "player" && t.buildings[type] < BUILDING_MAX_LEVEL && !getRunningJob(s, `build:${id}`) && s.gold >= buildingCost(s, id, type);
}

function upgradeBuilding(id, type) {
  if (rejectDuringBattle(S)) return false;
  if (!canUpgrade(S, id, type)) { toast("金币或等级条件不足"); return false; }
  const t = S.territories[id];
  const cost = buildingCost(S, id, type);
  S.gold -= cost;
  const targetLevel = t.buildings[type] + 1;
  startJob(S, {
    type: "BUILD",
    territoryId: id,
    startedAt: Date.now(),
    durationMs: JOB_CONFIG.BUILD.durationMs,
    queueKey: `build:${id}`,
    payload: { buildingType: type, targetLevel, cost }
  });
  const text = `${TERRITORY_DEFS[id].name}开始建设${BUILDINGS[type].name}第${targetLevel}级，预计${formatDuration(JOB_CONFIG.BUILD.durationMs)}后完成。`;
  S.lastAction = { name: "领地建设排队", text: `花费${cost}金币。${text}` };
  log(S, "info", S.lastAction.text);
  saveGame();
  renderAll();
  return true;
}

function canRecruitUnit(s, type, territoryId = recruitmentTerritoryId(s)) {
  const unit = UNIT_DEFS[type];
  const territory = s?.territories?.[territoryId];
  if (!unit || !territory || territory.owner !== "player" || getRunningJob(s, `recruit:${territoryId}`) || s.gold < unit.gold || s.grain < unit.grain) return false;
  if (unit.unlockTech && !techCompleted(s, unit.unlockTech)) return false;
  if (["knights", "heavy_infantry", "light_cavalry"].includes(type)) {
    const barracks = territory.buildings.barracks || 0;
    if (s.renown < 15 && barracks < 2) return false;
  }
  return true;
}

function queueRecruitment(s, type, territoryId = recruitmentTerritoryId(s), now = Date.now()) {
  if (!s || !canRecruitUnit(s, type, territoryId)) return null;
  const unit = UNIT_DEFS[type];
  const amount = recruitAmount(s, type, territoryId);
  s.gold -= unit.gold;
  s.grain -= unit.grain;
  return startJob(s, {
    type: "RECRUIT",
    territoryId,
    startedAt: now,
    durationMs: JOB_CONFIG.RECRUIT.durationMs,
    queueKey: `recruit:${territoryId}`,
    payload: { unitType: type, amount, gold: unit.gold, grain: unit.grain }
  });
}

function queueResearch(s, branch, techId, now = Date.now()) {
  if (!canResearch(s, branch, techId)) return null;
  const tech = techDefinition(branch, techId);
  const level = techLevel(s, techId) + 1;
  const cost = techCost(tech, level);
  s.gold -= cost.gold;
  s.knowledge -= cost.knowledge;
  return startJob(s, {
    type: "RESEARCH",
    startedAt: now,
    endAt: now + researchDuration(tech, level),
    queueKey: "research:global",
    payload: { branch, techId, level, gold: cost.gold, knowledge: cost.knowledge }
  });
}

function startMarch(s, armyId, destinationId, now = Date.now(), payload = {}) {
  const army = armyEntity(s, armyId);
  const originId = army?.locationId;
  const longExpedition = payload?.battlePlan && s.territories[destinationId]?.owner !== "player";
  if (!army || army.owner !== "player" || army.status !== "idle" || !TERRITORY_DEFS[destinationId] || TERRITORY_DEFS[destinationId].playable === false || (!longExpedition && !TERRITORY_DEFS[originId]?.adj.includes(destinationId)) || getRunningJob(s, `march:${armyId}`)) return null;
  const job = startJob(s, {
    type: "MARCH",
    armyId,
    startedAt: now,
    endAt: now + marchDurationForDistance(s, originId, destinationId),
    queueKey: `march:${armyId}`,
    payload: { originId, destinationId, ...payload }
  });
  army.destinationId = destinationId;
  army.status = "marching";
  army.jobId = job.id;
  army.leaders = army.leaders?.length ? army.leaders : ["player"];
  return job;
}

function startArmyGroupMarch(s, armyIds, destinationId, now = Date.now(), payload = {}) {
  const ids = [...new Set((armyIds || []).filter(Boolean))];
  const armies = ids.map(id => armyEntity(s, id));
  if (!ids.length || armies.some(army => !army || army.owner !== "player" || army.status !== "idle")) return null;
  if (payload?.battlePlan && !ids.some(id => attackableTerritories(s, id).includes(destinationId))) return null;
  const lead = armies[0];
  const armyOrigins = Object.fromEntries(armies.map(army => [army.id, army.locationId]));
  const job = startMarch(s, lead.id, destinationId, now, { ...payload, armyIds: ids, armyOrigins });
  if (!job) return null;
  armies.slice(1).forEach(army => {
    army.destinationId = destinationId;
    army.status = "marching";
    army.jobId = job.id;
  });
  return job;
}

function recruitAmount(s, type, territoryId = recruitmentTerritoryId(s)) {
  const unit = UNIT_DEFS[type];
  if (!unit) return 0;
  const barracks = s.territories[territoryId]?.buildings?.barracks || 0;
  const workshop = s.territories[territoryId]?.buildings?.workshop || 0;
  const trainingBonus = type === "levy" ? Math.min(5, barracks) + Math.floor(workshop / 2) : ["archers", "crossbowmen"].includes(type) ? Math.floor(Math.min(5, barracks) / 2) + Math.floor(workshop / 3) : Math.floor(barracks / 2);
  return unit.amount + trainingBonus;
}

function recruitUnit(type) {
  if (rejectDuringBattle(S)) return false;
  if (!canRecruitUnit(S, type)) { toast("资源、威望或兵营条件不足"); return false; }
  const unit = UNIT_DEFS[type];
  const job = queueRecruitment(S, type);
  if (!job) { toast("资源、威望或兵营条件不足"); return false; }
  S.lastAction = { name: `征募${unit.name}排队`, text: `${job.payload.amount}名${unit.name}开始训练，预计${formatDuration(JOB_CONFIG.RECRUIT.durationMs)}后加入军队。` };
  log(S, "info", S.lastAction.text);
  saveGame(); renderAll();
  return true;
}

function applyShortage(s, deficit) {
  const deserters = Math.min(armyTotal(s), Math.ceil(deficit / 3));
  removeTroops(s, deserters);
  s.support = clamp(s.support - Math.min(18, 6 + deficit));
  s.morale = clamp(s.morale - Math.min(16, 4 + deficit));
  ownTerritoryIds(s).forEach(id => s.territories[id].stability = clamp(s.territories[id].stability - 6));
  ownedOfficers(s).forEach(o => { if (o.id !== "player") o.loyalty = clamp(o.loyalty - 3); });
  log(s, "bad", `粮仓见底，${deserters}名士兵离队，村庄开始宰杀来年的种畜。`);
}

function applyUnrest(s) {
  const deserters = Math.min(armyTotal(s), Math.max(1, Math.ceil((25 - s.support) / 4)));
  removeTroops(s, deserters);
  ownTerritoryIds(s).forEach(id => { s.territories[id].stability = clamp(s.territories[id].stability - 4); s.territories[id].devastated = Math.max(s.territories[id].devastated, 1); });
  log(s, "bad", `民心跌破底线，${deserters}名驻军离队，领地生产受到影响。`);
}

function enemyGuardCap(s, id) {
  const expansionPressure = Math.max(0, ownTerritoryIds(s).length - 1) * 4;
  const timePressure = Math.floor(s.turn / 4) * 3;
  return Math.round(TERRITORY_DEFS[id].guard + (expansionPressure + timePressure) * difficultyOf(s).enemy);
}

function settleSeasonEconomy(s, options = {}) {
  const f = forecast(s);
  if (!options.resourcesAlreadyAccrued) {
    s.gold += f.gold - f.goldCost;
    s.grain += f.grain - f.grainCost - f.spoilage;
  }
  const academyLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.academy || 0), 0);
  s.knowledge = Math.max(0, Math.round((s.knowledge || 0) + 3 + academyLevels + techLevel(s, "relay_roads") * 2));
  if (f.spoilage > 0) log(s, "warn", `粮仓容量只有${f.storageCap}，潮气、鼠害与转运损失吃掉了${f.spoilage}粮食。升级农田与磨坊可扩充仓储。`);
  if (s.grain < 0) { const deficit = Math.abs(s.grain); s.grain = 0; applyShortage(s, deficit); }
  if (s.support < 25) applyUnrest(s);
  ownTerritoryIds(s).forEach(id => {
    const t = s.territories[id];
    const guardCap = TERRITORY_DEFS[id].guard + t.buildings.barracks * 7 + t.buildings.walls * 5 + t.buildings.watchtower * 4;
    if (t.devastated > 0) t.devastated--;
    if (t.stability >= 65 && t.guard < guardCap) t.guard++;
  });
  Object.keys(s.territories).filter(id => s.territories[id].owner !== "player").forEach(id => {
    const t = s.territories[id];
    const normalRecovery = Math.min(4, 2 + Math.floor(s.turn / 12));
    const recovery = t.devastated > 0 ? 1 : Math.max(1, normalRecovery - techLevel(s, "blockade"));
    t.guard = Math.min(enemyGuardCap(s, id), t.guard + recovery);
    if (t.devastated > 0) t.devastated--;
  });
  log(s, f.netGrain >= 0 ? "good" : "warn", `${seasonOf(s).name}季结算：金币${f.netGold >= 0 ? "+" : ""}${f.netGold}，粮食${f.netGrain >= 0 ? "+" : ""}${f.netGrain}${f.spoilage ? `（含损耗${f.spoilage}）` : ""}。`);
}

function advanceSeason(s, options = {}) {
  if (s.battleSession) { if (s === S) toast("必须先结束当前战役"); return false; }
  const eventAt = Number.isFinite(options.at) ? options.at : Date.now();
  settleSeasonEconomy(s, { resourcesAlreadyAccrued: !!options.resourcesAlreadyAccrued });
  if (!options.offline) enemyPressure(s, options.rng || Math.random, eventAt);
  s.officers.forEach(o => { o.injured = 0; });
  s.training = Math.max(0, s.training - Math.max(0, 2 - Math.ceil(techLevel(s, "field_doctrine") / 2)));
  s.warWeariness = 0;
  s.turn++;
  s.seasonLocks = {};
  s.lastAction = null;
  handleOfficerPolitics(s);
  queueSeasonEvents(s);
  if (s.turn >= MAX_TURNS && !s.ended) {
    s.ended = true;
    s.endingReason = ownTerritoryIds(s).length >= 5 ? "great_lord" : "minor_lord";
  }
  if (options.offline) {
    // 离线期间不把饥荒、欠薪和民乱连续累计到结束；回到游戏后再由玩家处理。
    s.crisis ||= { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 };
    s.crisis.famine = Math.max(0, s.crisis.famine - 1);
    s.crisis.debt = Math.max(0, s.crisis.debt - 1);
    s.crisis.unrest = Math.max(0, s.crisis.unrest - 1);
    s.crisis.checkedTurn = s.turn;
  } else checkDefeat(s);
  s.clock ||= makeClock(s.turn, eventAt);
  s.clock.seasonIndex = s.turn;
  s.clock.seasonStartedAt = eventAt;
  s.clock.seasonEndsAt = eventAt + TIME_CONFIG.seasonDurationMs;
  s.clock.lastProcessedAt = eventAt;
  if (options.save !== false && s === S) saveGame();
  if (options.render !== false && s === S) {
    renderAll();
    pumpDecision();
  }
  return true;
}

function advanceSeasonAuto(s, now = Date.now(), options = {}) {
  if (!s || s.ended || s.battleSession || s.pauseState) return { seasons: 0, jobs: 0 };
  s.clock ||= makeClock(s.turn, now);
  let seasons = 0;
  let jobs = 0;
  let guard = 0;
  while (!s.ended && guard++ < 2000) {
    const nextJob = (s.jobs || []).filter(job => job.status === "running").sort((a, b) => a.endAt - b.endAt)[0];
    const nextJobAt = nextJob?.endAt ?? Infinity;
    const nextSeasonAt = s.clock.seasonEndsAt;
    const nextAt = Math.min(nextJobAt, nextSeasonAt);
    if (nextAt <= now && nextJobAt > nextSeasonAt && seasons >= TIME_CONFIG.maxOfflineSeasonCatchup) break;
    const cursor = s.clock.lastProcessedAt || s.clock.seasonStartedAt || now;
    const accrualTo = Math.min(nextAt, now);
    if (accrualTo > cursor) {
      accrueResources(s, cursor, accrualTo);
      s.clock.lastProcessedAt = accrualTo;
    }
    if (nextAt > now) break;
    if (nextJobAt <= nextSeasonAt) {
      jobs += processCompletedJobs(s, nextJobAt);
      s.clock.lastProcessedAt = nextJobAt;
      continue;
    }
    if (seasons >= TIME_CONFIG.maxOfflineSeasonCatchup) break;
    if (!advanceSeason(s, { fromClock: true, at: nextSeasonAt, save: false, render: false, offline: !!options.offline, resourcesAlreadyAccrued: true })) break;
    seasons++;
  }
  if (seasons >= TIME_CONFIG.maxOfflineSeasonCatchup && s.clock.seasonEndsAt <= now) {
    s.clock.seasonStartedAt = now;
    s.clock.seasonEndsAt = now + TIME_CONFIG.seasonDurationMs;
    s.clock.lastProcessedAt = now;
  }
  const finalCursor = s.clock.lastProcessedAt || s.clock.seasonStartedAt || now;
  if (now > finalCursor) accrueResources(s, finalCursor, now);
  jobs += processCompletedJobs(s, now);
  s.clock.lastProcessedAt = now;
  return { seasons, jobs };
}

function catchUpOffline(s, now = Date.now()) {
  if (!s) return 0;
  s.clock ||= makeClock(s.turn, now);
  if (s.pauseState) {
    if (s.clock.seasonEndsAt <= now) {
      s.pauseState.pausedAt = now;
      s.clock.seasonStartedAt = now;
      s.clock.seasonEndsAt = now + TIME_CONFIG.seasonDurationMs;
    }
    s.clock.lastProcessedAt = now;
    return 0;
  }
  const result = advanceSeasonAuto(s, now, { offline: true });
  if (result.seasons > 0) {
    const text = `你离开期间结算了${result.seasons}季。离线期间不会发生敌袭，领地崩溃判定留给你回来后的正常经营。`;
    s.lastAction = { name: "离线结算完成", text };
    log(s, "info", text);
    saveGame();
  }
  return result.seasons;
}

function updateJobCountdowns(now = Date.now()) {
  if (typeof document === "undefined" || !S) return;
  document.querySelectorAll("[data-job-countdown]").forEach(node => {
    const job = (S.jobs || []).find(item => item.id === node.dataset.jobCountdown);
    if (!job || job.status !== "running") return;
    const effectiveNow = S.pauseState?.pausedAt || now;
    node.textContent = `${node.dataset.jobPrefix || ""}${formatDuration(getJobRemainingMs(job, effectiveNow))}`;
  });
}

function updateWorldTime(now = Date.now()) {
  if (!S || S.ended || S.pauseState) {
    updateJobCountdowns(now);
    return { seasons: 0, jobs: 0 };
  }
  S.clock ||= makeClock(S.turn, now);
  const shouldProcessLogic = now - (S.clock.lastProcessedAt || 0) >= TIME_CONFIG.logicTickMs;
  const result = shouldProcessLogic ? advanceSeasonAuto(S, now) : { seasons: 0, jobs: 0 };
  const { seasons, jobs } = result;
  updateJobCountdowns(now);
  if (seasons || jobs) {
    saveGame();
    renderAll();
    pumpDecision();
  } else if (typeof document !== "undefined" && !$("game")?.classList.contains("hidden")) {
    renderTop();
  }
  return { seasons, jobs };
}

function handleOfficerPolitics(s) {
  ownedOfficers(s).forEach(o => {
    if (o.id === "player") return;
    if (o.merit >= 12 && !o.fief) {
      const ambitionPressure = Math.ceil(o.ambition / 24) + (o.merit >= 24 ? 1 : 0);
      o.grievance = clamp(o.grievance + ambitionPressure);
    }
    if (o.grievance >= 70 && o.loyalty < 38) {
      const gone = Math.min(armyTotal(s), 6 + Math.round(o.command / 15));
      removeTroops(s, gone);
      if (o.fief && s.territories[o.fief]) {
        const fiefId = o.fief;
        s.territories[fiefId].fiefHolder = null;
        s.territories[fiefId].stability = clamp(s.territories[fiefId].stability - 10);
        o.fief = null;
        log(s, "warn", `${TERRITORY_DEFS[fiefId].name}失去管理者，重新改由你管理，地方稳定下降。`);
      }
      o.side = "gone";
      log(s, "bad", `${o.name}因长期没有得到领地管理权，带着${gone}名追随者离开渡鸦堡。`);
    }
  });
}

function queueSeasonEvents(s) {
  const season = seasonOf(s);
  if (season.id === "winter" && !s.flags.firstWinter) {
    s.flags.firstWinter = true;
    s.pendingDecisions.push({ type: "first_winter" });
  }
  if (s.turn >= 5 && !s.flags.cousinDemand && officer(s, "edmund")?.side === "player") {
    s.flags.cousinDemand = true;
    s.pendingDecisions.push({ type: "cousin_demand" });
  }
  if (s.turn >= 10 && !s.flags.taxDemand) {
    s.flags.taxDemand = true;
    s.pendingDecisions.push({ type: "royal_tax" });
  }
  if (s.turn >= 2 && s.turn % 2 === 0) {
    const nextWorld = WORLD_EVENTS.find(event => !s.seenEvents.includes(event.id));
    if (nextWorld) {
      s.seenEvents.push(nextWorld.id);
      s.pendingDecisions.push({ type: "world_event", eventId: nextWorld.id });
    }
  }
  if (s.turn >= 3 && s.turn % 3 === 0) {
    const nextNpc = NPC_ARCS.find(event => {
      if (s.seenNpcEvents.includes(event.id) || s.turn < event.minTurn) return false;
      const person = officer(s, event.officerId);
      if (!person || person.side === "gone") return false;
      return event.side !== "player" || person.side === "player";
    });
    if (nextNpc) {
      s.seenNpcEvents.push(nextNpc.id);
      s.pendingDecisions.push({ type: "npc_arc", eventId: nextNpc.id });
    }
  }
}

function attackableTerritories(s, armyId = "army_1") {
  const mine = new Set(ownTerritoryIds(s));
  const army = armyEntity(s, armyId);
  if (!army || army.owner !== "player" || army.status !== "idle") return [];
  const origin = TERRITORY_DEFS[army.locationId];
  return Object.keys(TERRITORY_DEFS).filter(id => {
    const d = TERRITORY_DEFS[id];
    if (d.playable === false) return false;
    if (mine.has(id)) return false;
    if (d.final && !crownAccessMet(s)) return false;
    return origin?.adj?.includes(id) && !mine.has(id);
  });
}

function factionTerritories(s, faction) {
  return Object.keys(s.territories).filter(id => s.territories[id].owner === faction);
}

function defenderLeader(s, targetId) {
  const owner = s.territories[targetId].owner;
  if (owner === "wolf" && officer(s, "bran")?.side === "wolf") return officer(s, "bran");
  if (owner === "river" && officer(s, "aveline")?.side === "river") return officer(s, "aveline");
  if (owner === "crown" && officer(s, "regent")?.side === "crown") return officer(s, "regent");
  return null;
}

function averageStat(s, ids, stat) {
  const people = ids.map(id => commanderStats(s, id)).filter(Boolean);
  if (!people.length) return 0;
  return people.reduce((sum, person) => sum + (person[stat] || 0), 0) / people.length;
}

function defenderComposition(s, targetId) {
  const t = s.territories[targetId];
  const guard = Math.max(1, Math.round(t?.guard || 1));
  const owner = t?.owner;
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  const share = owner === "crown" ? { levy: .35, archers: .2, knights: .12, heavy_infantry: .15, crossbowmen: .12, light_cavalry: .06 } : owner === "river" ? { levy: .4, archers: .28, knights: .08, heavy_infantry: .08, crossbowmen: .1, light_cavalry: .06 } : owner === "wolf" ? { levy: .5, archers: .18, knights: .12, heavy_infantry: .05, crossbowmen: .03, light_cavalry: .12 } : tags.includes("fortified") ? { levy: .4, archers: .2, knights: .08, heavy_infantry: .16, crossbowmen: .12, light_cavalry: .04 } : { levy: .5, archers: .22, knights: .1, heavy_infantry: .06, crossbowmen: .06, light_cavalry: .06 };
  const result = emptyComposition();
  Object.keys(UNIT_DEFS).forEach(type => { result[type] = Math.round(guard * (share[type] || 0)); });
  result.levy = Math.max(0, result.levy + guard - compositionTotal(result));
  return result;
}

function battleEstimate(s, targetId, leaderIds, troops, planId, armyId = "army_1", explicitComposition = null, selectedKnightIds = null) {
  const t = s.territories[targetId];
  const d = TERRITORY_DEFS[targetId];
  const plan = PLANS[planId] || PLANS.steady;
  const force = averageStat(s, leaderIds, "force");
  const command = averageStat(s, leaderIds, "command");
  const scheme = averageStat(s, leaderIds, "scheme");
  let planMult = plan.mult;
  if (planId === "ambush") {
    planMult += scheme / 1400;
    if ((d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) planMult += .15;
  }
  if (planId === "assault" && leaderIds.includes("renard")) planMult += .06;
  const composition = explicitComposition ? { ...emptyComposition(), ...explicitComposition } : selectedComposition(s, troops, armyId);
  const enemyComposition = defenderComposition(s, targetId);
  const unitPower = compositionPower(composition, targetId, planId, seasonOf(s).id, s);
  const counter = counterMultiplier(composition, enemyComposition);
  const fatigue = 1;
  const effectiveMorale = leaderIds.includes("player") ? Math.max(45, s.morale) : s.morale;
  let attack = unitPower * (.62 + command / 190 + force / 330) * (.72 + effectiveMorale / 190) * planMult * fatigue * counter;
  if (leaderIds.includes("player")) attack *= 1.03;
  const knightMultiplier = knightBattleMultiplier(s, selectedKnightIds);
  attack *= knightMultiplier;
  if (leaderIds.includes("bran") && (d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) attack *= 1.08;
  if (leaderIds.includes("aveline") && (d.terrainTags || []).includes("river")) attack *= 1.08;
  const walls = t.buildings?.walls || (d.final ? 2 : 1);
  const watchtower = t.buildings?.watchtower || 0;
  const wallFactor = techLevel(s, "sappers") ? Math.max(.05, .09 - techLevel(s, "sappers") * .01) : .11;
  const enemyPower = compositionPower(enemyComposition, targetId, "steady", seasonOf(s).id);
  const enemyCounter = counterMultiplier(enemyComposition, composition);
  const enemyEquipmentFactor = Math.max(.92, Math.min(1.12, enemyPower / Math.max(1, t.guard)));
  let defense = t.guard * (1 + walls * wallFactor + watchtower * .025) * difficultyOf(s).enemy * (1 + (enemyCounter - 1) * .55) * enemyEquipmentFactor;
  if (techLevel(s, "siege_ladders") && (d.terrainTags || []).includes("fortified")) attack *= 1 + techLevel(s, "siege_ladders") * .05;
  if (techLevel(s, "trebuchet") && (d.terrainTags || []).some(tag => ["fortified", "capital"].includes(tag))) attack *= 1 + techLevel(s, "trebuchet") * .04;
  const defender = defenderLeader(s, targetId);
  if (defender) defense *= 1 + defender.stats.command / 700;
  if (defender?.id === "bran" && (d.terrainTags || []).some(tag => ["forest", "mountain"].includes(tag))) defense *= 1.1;
  if (defender?.id === "aveline" && (d.terrainTags || []).includes("river")) defense *= 1.08;
  const ratio = attack / Math.max(1, defense);
  let label = "胜负难料";
  if (ratio >= 1.28) label = "明显占优";
  else if (ratio >= 1.08) label = "略占上风";
  else if (ratio < .78) label = "近乎送死";
  else if (ratio < .94) label = "处于下风";
  return { attack, defense, ratio, label, planMult, composition, defenderComposition: enemyComposition, unitPower, counter, knightMultiplier, fatigue, effectiveMorale };
}

function casualtyForecast(s, targetId, leaderIds, troops, planId, armyId = "army_1") {
  const est = battleEstimate(s, targetId, leaderIds, troops, planId, armyId);
  const plan = PLANS[planId] || PLANS.steady;
  const oddsPenalty = Math.min(.1, Math.max(0, .9 / Math.max(.15, est.ratio) - 1) * .035);
  let center = troops * (.03 + Math.max(.007, 1 / Math.max(.2, est.ratio) * .014) + oddsPenalty) * plan.casualty * 3;
  if (leaderIds.includes("ysabel")) center *= .9;
  return { low: Math.max(2, Math.round(center * .72)), high: Math.max(3, Math.round(center * 1.35)) };
}

function battleRiskClass(ratio) {
  if (ratio >= 1.28) return "favorable";
  if (ratio < .78) return "deadly";
  if (ratio < .94) return "risky";
  return "uncertain";
}

function battlePowerText(ratio) {
  if (ratio >= 1.28) return "我军明显占优";
  if (ratio >= 1.08) return "我军略占上风";
  if (ratio < .78) return "这场战斗近乎送死";
  if (ratio < .94) return "我军处于下风";
  return "胜负难料";
}

function battleBreakdownText(est) {
  return "";
}

function battleFatigueText(fatigue) {
  const percent = Math.round((1 - fatigue) * 100);
  return percent > 0 ? `战争疲劳使战力降低${percent}%。` : "";
}

function battleMoraleText(effectiveMorale, morale) {
  return effectiveMorale !== morale ? `领主亲征时，本场军心最低按${Math.round(effectiveMorale)}点计算。` : "";
}

function battleMomentumText(value) {
  const momentum = Math.round(value);
  const label = momentum >= 15 ? "我军明显占优" : momentum >= 5 ? "我军略占优势" : momentum <= -15 ? "敌军明显占优" : momentum <= -5 ? "敌军略占优势" : "双方势均力敌";
  return `当前战况：${label}`;
}

function armyGroupComposition(s, armyIds = []) {
  const result = emptyComposition();
  armyIds.map(id => armyEntity(s, id)).filter(Boolean).forEach(army => {
    Object.keys(UNIT_DEFS).forEach(type => { result[type] += Math.max(0, Math.round(army.composition?.[type] || 0)); });
  });
  return result;
}

function startBattle(s, draft, rng = Math.random) {
  const arrival = draft.arrival === true;
  const armyIds = [...new Set((draft.armyIds || [draft.armyId || "army_1"]).filter(Boolean))];
  const armies = armyIds.map(id => armyEntity(s, id)).filter(army => army?.owner === "player");
  if (s.battleSession || !armies.length || armies.length !== armyIds.length) return null;
  if (!arrival && !armyIds.some(id => attackableTerritories(s, id).includes(draft.targetId))) return null;
  if (armies.some(army => !["idle", "marching"].includes(army.status))) return null;
  const army = armies[0];
  const defaultLeaderIds = armies.map(item => item.commanderId || item.leaders?.[0] || "player");
  const leaderIds = [...new Set((draft.leaderIds?.length ? draft.leaderIds : defaultLeaderIds).filter(Boolean))].slice(0, 3);
  const leaders = leaderIds.map(id => commanderById(s, id)).filter(person => person && (person.id === "player" || person.side === "player" && person.status === "active" || person.side === "player" && person.injured === 0)).slice(0, 3);
  const availableComposition = armyGroupComposition(s, armyIds);
  const availableTroops = compositionTotal(availableComposition);
  const requestedComposition = draft.composition ? { ...emptyComposition(), ...draft.composition } : null;
  const compositionValid = requestedComposition && Object.keys(UNIT_DEFS).every(type => requestedComposition[type] >= 0 && requestedComposition[type] <= (availableComposition[type] || 0));
  if (draft.composition && !compositionValid) return null;
  const troops = requestedComposition ? compositionTotal(requestedComposition) : clamp(Math.round(draft.troops), 10, availableTroops);
  if (!leaders.length || troops > availableTroops) return null;
  if (troops < 10) return null;
  const supply = draft.composition ? compositionSupply(s, requestedComposition, leaders.map(o => o.id)) : campaignSupply(s, troops, leaders.map(o => o.id), army.id);
  if (!draft.supplyAlreadyPaid && s.grain < supply) return null;
  const knightIds = (draft.knightIds || draft.commandKnightIds || []).filter(id => activeKnights(s).some(knight => knight.id === id));
  const estimateComposition = requestedComposition || selectedComposition({ ...s, armies: [{ ...army, composition: availableComposition }] }, troops, army.id);
  const est = battleEstimate(s, draft.targetId, leaderIds, troops, draft.plan, army.id, estimateComposition, knightIds.length ? knightIds : null);
  if (!draft.supplyAlreadyPaid) s.grain -= supply;
  s.warWeariness = 0;
  s.battles++;
  s.battleSession = {
    armyId: army.id,
    armyIds,
    armyOrigins: draft.armyOrigins || Object.fromEntries(armies.map(item => [item.id, item.locationId])),
    originId: draft.originId || army.locationId,
    targetId: draft.targetId,
    leaderIds: leaders.map(o => o.id),
    knightIds,
    troops,
    plan: draft.plan,
    composition: est.composition,
    lossesByType: emptyComposition(),
    ratio: est.ratio,
    stage: 0,
    momentum: clamp((est.ratio - 1) * 42, -42, 42),
    playerLoss: 0,
    enemyLoss: 0,
    history: [],
    flags: { demanded: false, pushed: false, aggression: 0 },
    seedMark: Math.round(rng() * 1e9)
  };
  armies.forEach(item => {
    item.status = "engaged";
    item.destinationId = draft.targetId;
    item.jobId = null;
    item.leaders = [item.commanderId || "player"];
  });
  pauseWorld(s, "battle");
  log(s, "warn", `${leaders.map(o => o.name).join("、")}率${troops}人（${compositionText(est.composition)}）向${TERRITORY_DEFS[draft.targetId].name}进军。`);
  return s.battleSession;
}

function stageOptions(s, session) {
  const ids = session.leaderIds;
  const scheme = averageStat(s, ids, "scheme");
  const force = averageStat(s, ids, "force");
  const charm = averageStat(s, ids, "charm");
  const options = [];
  if (session.stage === 0) {
    options.push({ id: "ridge", name: "抢下有利地形", by: "通用命令", desc: "先占据有利位置，减少开战时的伤亡。", mult: 1.05, casualty: .9 });
    if (scheme >= 64) options.push({ id: "scout", name: "从猎户小径绕过去", by: ids.includes("edmund") ? "埃德蒙" : ids.includes("ysabel") ? "伊莎贝尔" : "谋士提议", desc: "从小路绕到敌军侧面，减少第一轮伤亡。", mult: 1.1 + scheme / 1200, casualty: .7 });
    if (ids.includes("renard")) options.push({ id: "forced", name: "立即冲向敌军", by: "雷纳德", desc: "快速冲向敌军。连续选择强攻会明显增加伤亡。", mult: 1.12, casualty: 1.45, pushed: true });
  } else if (session.stage === 1) {
    options.push({ id: "shield", name: "稳住盾牌队伍", by: "通用命令", desc: "守住防线，尽量减少伤亡。", mult: 1, casualty: .75 });
    if ((session.composition?.archers || 0) >= 4) options.push({ id: "volley", name: "让弓手轮流射击", by: ids.includes("ysabel") ? "伊莎贝尔" : "弓手队长", desc: "持续射击压制敌军。在森林和河地效果更好。", mult: 1.08 + (session.composition.archers / Math.max(10, session.troops)) * .55, casualty: .68 });
    if ((force >= 68 || ids.includes("renard")) && (session.composition?.knights || 0) >= 2) options.push({ id: "charge", name: "让披甲骑士正面冲锋", by: ids.includes("renard") ? "雷纳德" : "随军骑士", desc: "平原威力最大，但连续强攻会明显增加伤亡。", mult: 1.1 + force / 2400, casualty: 1.64, pushed: true });
    if (scheme >= 67) options.push({ id: "feint", name: "故意露出左翼", by: ids.includes("edmund") ? "埃德蒙" : "谋士提议", desc: "诱使敌军离开防线，再切断退路。", mult: 1.14 + scheme / 1600, casualty: .88 });
  } else {
    options.push({ id: "press", name: "派出剩余部队强攻", by: "通用命令", desc: "争取在天黑前结束战斗，但疲惫的部队会承受更多伤亡。", mult: 1.08, casualty: 1.48, pushed: true });
    options.push({ id: "hold", name: "停止追击，守住优势", by: "通用命令", desc: "不追求大胜，优先减少伤亡。", mult: 1.01, casualty: .72 });
    if (session.momentum > 10 && charm >= 64) options.push({ id: "surrender", name: "让号手劝他们放下武器", by: ids.includes("edmund") ? "埃德蒙" : "随军使者", desc: "仅在我军占据优势时可能奏效。", mult: .96 + charm / 1900, casualty: .38, surrender: true });
    options.push({ id: "retreat", name: "下令撤退", by: ids.includes("ysabel") ? "伊莎贝尔" : "通用命令", desc: "保住剩余士兵，本场无法占领目标。", retreat: true });
  }
  return options.slice(0, 4);
}

function battleNarrative(session, choice, delta, loss, enemyLoss) {
  const target = TERRITORY_DEFS[session.targetId];
  const stageNames = ["接近敌军", "正面交战", "最后阶段"];
  const direction = delta >= 8 ? "我军取得优势" : delta <= -8 ? "我军陷入劣势" : "双方仍在僵持";
  const special = choice.surrender ? "号手发出劝降信号，部分敌军放下武器。" : choice.id === "scout" ? "斥候发现一条未设防的小路。" : choice.id === "charge" ? "披甲骑士正面冲击敌军盾牌队伍。" : choice.id === "volley" ? "弓手完成三轮齐射，敌军开始后退。" : choice.id === "feint" ? "敌军追入缺口后，退路被我军切断。" : choice.id === "hold" ? "我军停止追击并守住现有位置。" : "我军按命令继续推进。";
  return { name: stageNames[session.stage], title: `${choice.by}：${choice.name}`, text: `${special}${direction}。本阶段我军损失${loss}人，敌军约损失${enemyLoss}人。` };
}

function battleChoiceHint(choice) {
  const hints = { ridge: "稳住先手 · 伤亡较低", scout: "谋略推进 · 首轮损失较低", forced: "快速推进 · 伤亡风险高", shield: "稳住战线 · 伤亡低", volley: "弓手压制 · 需要弓手", charge: "骑士冲锋 · 伤亡风险高", feint: "制造缺口 · 依赖谋略", press: "追击推进 · 伤亡风险高", hold: "守住优势 · 可能错失战果", surrender: "劝降机会 · 只在占优时出现", retreat: "保存兵力 · 放弃本次攻城" };
  return hints[choice.id] || "改变当前战况";
}

function battleSituation(session) {
  const stage = ["接敌", "交锋", "决胜"][session.stage] || "决胜";
  const momentum = Math.round(session.momentum);
  const state = momentum >= 12 ? "我军掌握主动" : momentum <= -12 ? "敌军正在压迫战线" : "双方仍在争夺主动";
  const terrain = TERRITORY_DEFS[session.targetId]?.terrain || "战场";
  return { stage, title: `${stage}阶段 · ${state}`, text: `${terrain}地形正在影响推进。下一道军令会同时改变推进速度和伤亡。` };
}

function applyBattleChoice(s, choiceId, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const choice = stageOptions(s, session).find(o => o.id === choiceId);
  if (!choice) return null;
  if (choice.retreat) return finishBattle(s, "retreat", rng);
  const priorAggression = session.flags.aggression || 0;
  let adaptation = 1;
  let casualtySurge = 1;
  if (choice.pushed) {
    session.flags.pushed = true;
    adaptation = 1 - Math.min(.18, priorAggression * .08);
    casualtySurge = 1 + priorAggression * .22;
    session.flags.aggression = priorAggression + 1;
  } else session.flags.aggression = Math.max(0, priorAggression - 1);
  if (choice.surrender) session.flags.demanded = true;
  const wave = .71 + rng() * .58;
  const effectiveMult = choice.mult * adaptation;
  let delta = (session.ratio * effectiveMult * wave - 1) * 34;
  const counterBlow = choice.pushed && priorAggression > 0 ? priorAggression * (6 + rng() * 8) : 0;
  delta -= counterBlow;
  session.momentum = clamp(session.momentum + delta, -100, 100);
  const remaining = Math.max(1, session.troops - session.playerLoss);
  const oddsPenalty = Math.min(.1, Math.max(0, .9 / Math.max(.15, session.ratio) - 1) * .035);
  let loss = Math.max(1, Math.round(remaining * (.03 + Math.max(.007, 1 / Math.max(.2, session.ratio) * .014) + oddsPenalty) * choice.casualty * casualtySurge * (.78 + rng() * .45)));
  if (session.leaderIds.includes("ysabel")) loss = Math.max(1, Math.round(loss * .9));
  const defender = s.territories[session.targetId].guard;
  const enemyLoss = Math.max(1, Math.round(defender * .035 * effectiveMult * (.78 + rng() * .5)));
  session.playerLoss = Math.min(session.troops - 1, session.playerLoss + loss);
  session.lossesByType = allocateLosses(session.composition, session.playerLoss);
  session.enemyLoss = Math.min(defender, session.enemyLoss + enemyLoss);
  const history = battleNarrative(session, choice, delta, loss, enemyLoss);
  if (counterBlow > 0) history.text += ` 连续强攻被敌军看穿，我军优势下降${Math.round(counterBlow)}点。`;
  session.history.push(history);
  session.stage++;
  if (session.stage >= 3) {
    const surrenderWin = session.flags.demanded && session.momentum > 4;
    return finishBattle(s, session.momentum >= 8 || surrenderWin ? "win" : "loss", rng);
  }
  saveGame();
  return { ended: false, session };
}

function finishBattle(s, outcome, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const targetId = session.targetId;
  const targetName = TERRITORY_DEFS[targetId].name;
  const oldOwner = s.territories[targetId].owner;
  const lossesByType = session.lossesByType || allocateLosses(session.composition || selectedComposition(s, session.troops), session.playerLoss);
  const engagedArmies = (session.armyIds || [session.armyId || "army_1"]).map(id => armyEntity(s, id)).filter(Boolean);
  const engagedArmy = engagedArmies[0] || null;
  Object.keys(UNIT_DEFS).forEach(type => {
    let left = Math.max(0, lossesByType[type] || 0);
    engagedArmies.forEach(army => {
      if (left <= 0) return;
      const take = Math.min(left, army.composition[type] || 0);
      army.composition[type] = Math.max(0, (army.composition[type] || 0) - take);
      left -= take;
    });
  });
  syncTroops(s);
  s.casualties += session.playerLoss;
  s.warWeariness = 0;
  const leaders = session.leaderIds.map(id => commanderById(s, id)).filter(Boolean);
  // 领主不再进入受伤计时；战后只结算兵力、军心与领地归属。
  const injured = [];
  let persistentEnemyLoss = 0;
  let garrisoned = 0;
  let lostGold = 0;
  let lostGrain = 0;
  if (outcome === "win") {
    const t = s.territories[targetId];
    const desiredGarrison = Math.max(6, Math.round((session.troops - session.playerLoss) * (session.flags.demanded ? .16 : .22)));
    garrisoned = Math.min(Math.max(0, armyTotal(s, engagedArmy?.id) - 10), desiredGarrison);
    if (garrisoned > 0 && engagedArmy) {
      const moved = removeFromComposition(engagedArmy.composition, garrisoned);
      Object.keys(UNIT_DEFS).forEach(type => { territoryGarrison(s, targetId)[type] += moved[type]; });
    }
    t.owner = "player";
    t.stability = 45;
    t.guard = Math.max(10, 8 + garrisoned);
    t.devastated = 2;
    t.fiefHolder = null;
    s.wins++;
    s.renown = clamp(s.renown + 8);
    s.legitimacy = clamp(s.legitimacy + 3);
    s.morale = clamp(s.morale + 7);
    leaders.forEach(o => { if (o.merit != null) o.merit += 7 + (session.flags.demanded ? 2 : 0); if (o.loyalty != null) o.loyalty = clamp(o.loyalty + 2); });
    const submissive = factionTerritories(s, oldOwner).length === 0 ? officer(s, oldOwner === "wolf" ? "bran" : oldOwner === "river" ? "aveline" : "") : null;
    if (submissive && submissive.side !== "player" && submissive.side !== "gone") {
      submissive.side = "neutral";
      submissive.recruitable = true;
      submissive.recruitCost ||= 28;
      log(s, "info", `${submissive.name}失去最后一座城，愿意以中立身份等待你的处置。`);
    } else {
      const waiting = s.officers.find(o => o.side === "locked" && o.id !== "player");
      if (waiting) {
        waiting.side = "neutral";
        waiting.recruitable = true;
        waiting.recruitCost ||= 24;
        log(s, "info", `${waiting.name}听闻你的胜利，派使者来渡鸦堡请求议和。`);
      }
    }
    s.pendingDecisions.push({ type: "conquest", territoryId: targetId, heroId: leaders.filter(o => o.id !== "player").sort((a, b) => b.merit - a.merit)[0]?.id || "renard" });
    const capturedKnight = (s.knights || []).find(knight => knight.side === oldOwner && knight.status === "available" && rng() < .45);
    if (capturedKnight) { capturedKnight.status = "captured"; capturedKnight.captured = true; log(s, "info", `${capturedKnight.name}在${targetName}城下被俘，可选择招降、处死或释放。`); }
    if (["wolf", "river"].includes(oldOwner) && factionTerritories(s, oldOwner).length === 0) s.pendingDecisions.push({ type: "submission", faction: oldOwner });
    log(s, "good", `${targetName}被占领。此战我军损失${session.playerLoss}人，敌军约损失${session.enemyLoss}人。另抽调${garrisoned}名士兵驻守新领地。`);
  } else if (outcome === "retreat") {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - (session.leaderIds.includes("ysabel") ? 2 : 6));
    s.renown = clamp(s.renown - 2);
    if (session.flags.pushed && session.momentum > 10 && session.leaderIds.includes("renard")) officer(s, "renard").grievance = clamp(officer(s, "renard").grievance + 8);
    log(s, "warn", `军队从${targetName}撤回，我军损失${session.playerLoss}人。敌方守军减少${persistentEnemyLoss}人，之后会缓慢补充。`);
  } else {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - 10);
    s.renown = clamp(s.renown - 3);
    s.support = clamp(s.support - 3);
    lostGold = Math.min(Math.max(0, s.gold), 4 + Math.ceil(session.playerLoss / 3));
    lostGrain = Math.min(Math.max(0, s.grain), 6 + Math.ceil(session.playerLoss / 2));
    s.gold -= lostGold;
    s.grain -= lostGrain;
    leaders.forEach(o => { if (o.loyalty != null) o.loyalty = clamp(o.loyalty - 2); if (o.grievance != null) o.grievance = clamp(o.grievance + 3); });
    log(s, "bad", `${targetName}进攻失败，我军损失${session.playerLoss}人。战败时丢失${lostGold}金币和${lostGrain}粮食；敌方守军减少${persistentEnemyLoss}人，之后会缓慢补充。`);
  }
  const resumedAt = Date.now();
  resumeWorld(s, resumedAt);
  const recoveryAt = resumedAt;
  engagedArmies.forEach(engagedArmy => {
    engagedArmy.destinationId = null;
    engagedArmy.locationId = outcome === "win" ? targetId : (session.armyOrigins?.[engagedArmy.id] || engagedArmy.locationId || "ravenstone");
    engagedArmy.leaders = [engagedArmy.commanderId || session.leaderIds[0] || "player"];
    engagedArmy.morale = s.morale;
    engagedArmy.training = s.training;
    engagedArmy.status = "idle";
    engagedArmy.jobId = null;
    startArmyRecovery(s, engagedArmy, outcome === "win" ? 90 * 1000 : 120 * 1000, recoveryAt);
  });
  const report = { targetId, targetName, outcome, losses: session.playerLoss, lossesByType, composition: clone(session.composition), enemyLoss: session.enemyLoss, persistentEnemyLoss, garrisoned, lostGold, lostGrain, history: clone(session.history), momentum: session.momentum, injured };
  s.lastBattle = report;
  s.battleSession = null;
  if (ownTerritoryIds(s).length === playableTerritoryIds().length) s.pendingDecisions.push({ type: "iron_crown" });
  checkDefeat(s);
  saveGame();
  return { ended: true, report };
}

function aiArmyPower(army) {
  const comp = army.composition || {};
  return (comp.levy || 0) * .92 + (comp.archers || 0) * 1.08 + (comp.knights || 0) * 1.72;
}

function resolveAIAttack(s, army, targetId, rng = Math.random, originId = army?.locationId) {
  const faction = army.owner;
  const t = s.territories[targetId];
  if (!t || t.owner !== "player") return null;
  const vulnerableKeep = targetId === "ravenstone" && s.turn > 16 && (t.guard < 30 || s.grain < 24 || s.support < 25);
  const decisiveRaid = faction === "wolf" && targetId === "ravenstone" && s.turn > 12 && (vulnerableKeep || rng() < .12);
  const attack = aiArmyPower(army) * (.56 + (army.morale || 50) / 420) * (difficultyOf(s).enemy * (.9 + rng() * .2)) * (decisiveRaid ? 1.65 : 1);
  const defense = t.guard + (t.buildings.walls || 0) * 8 + (t.buildings.watchtower || 0) * 4 + t.stability * .2;
  const loss = Math.max(1, Math.round((army.composition?.levy || 0) * .08));
  army.composition.levy = Math.max(0, (army.composition.levy || 0) - loss);
  if (attack > defense * (decisiveRaid ? .92 : 1.1)) {
    const oldHolder = t.fiefHolder;
    if (oldHolder && oldHolder !== "charter") {
      const holder = officer(s, oldHolder);
      if (holder) { holder.fief = null; holder.loyalty = clamp(holder.loyalty - 8); }
    }
    t.owner = faction;
    t.fiefHolder = null;
    t.stability = 42;
    t.guard = Math.max(18, Math.round(attack * .34));
    t.devastated = 2;
    log(s, "bad", `${FACTIONS[faction].name}的${army.name}攻占${TERRITORY_DEFS[targetId].name}。`);
    if (targetId === "ravenstone") { s.ended = true; s.endingReason = "fallen"; }
    return "captured";
  }
  const grainLoss = Math.min(s.grain, 5 + Math.floor(rng() * 9));
  const goldLoss = Math.min(Math.max(0, s.gold), 3 + Math.floor(rng() * 7));
  s.grain -= grainLoss; s.gold -= goldLoss;
  t.stability = clamp(t.stability - 5);
  t.devastated = Math.max(t.devastated, 1);
  log(s, "warn", `${FACTIONS[faction].name}的${army.name}袭扰${TERRITORY_DEFS[targetId].name}，抢走${grainLoss}粮食和${goldLoss}金币。`);
  army.locationId = originId || army.locationId;
  return attack > defense * .92 ? "raided" : "repulsed";
}

function startAIMarch(s, factionId, army, targetId, now = Date.now()) {
  if (!army || army.status !== "idle" || !TERRITORY_DEFS[army.locationId]?.adj.includes(targetId)) return null;
  const job = startJob(s, { type: "MARCH", armyId: army.id, startedAt: now, endAt: now + marchDuration(s), queueKey: `march:${army.id}`, payload: { originId: army.locationId, destinationId: targetId, factionId } });
  army.destinationId = targetId;
  army.status = "marching";
  army.jobId = job.id;
  return job;
}

function runAiTurn(s, rng = Math.random, now = Date.now()) {
  if (!s || s.ended) return null;
  ensureAIFactions(s);
  let started = 0;
  Object.entries(AI_FACTION_DEFS).forEach(([factionId, def]) => {
    const faction = s.factions[factionId];
    faction.gold += Math.round(10 * difficultyOf(s).income);
    faction.grain += 18;
    faction.knowledge += 2;
    const army = faction.armies.find(item => item.status === "idle");
    if (!army || s.turn < 2) return;
    const targets = (TERRITORY_DEFS[army.locationId]?.adj || []).filter(id => owns(s, id));
    if (!targets.length) return;
    const chance = def.personality === "aggressive" ? .23 : def.personality === "cautious" ? .1 : .16;
    if (rng() <= chance && startAIMarch(s, factionId, army, targets[Math.floor(rng() * targets.length)], now)) started++;
  });
  return started ? "marching" : null;
}

function enemyPressure(s, rng = Math.random, now = Date.now()) {
  return runAiTurn(s, rng, now);
}

function checkDefeat(s) {
  if (s.ended) return true;
  if (!owns(s, "ravenstone")) { s.ended = true; s.endingReason = "fallen"; return true; }
  s.crisis ||= { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 };
  if (s.crisis.checkedTurn !== s.turn) {
    s.crisis.famine = s.grain <= 0 ? s.crisis.famine + 1 : 0;
    // 债务不再作为危机机制；保留旧存档字段只是为了兼容读取。
    s.crisis.debt = 0;
    s.crisis.unrest = s.support < 12 ? s.crisis.unrest + 1 : 0;
    s.crisis.checkedTurn = s.turn;
  }
  if (s.crisis.famine >= 3 || s.crisis.unrest >= 2 || (armyTotal(s) <= 0 && s.morale < 10)) {
    s.ended = true;
    s.endingReason = "collapsed";
    return true;
  }
  return false;
}

function decisionView(s, decision) {
  if (decision.type === "world_event") {
    const event = WORLD_EVENTS.find(item => item.id === decision.eventId);
    return event ? scriptedEventView(s, event) : null;
  }
  if (decision.type === "npc_arc") {
    const event = NPC_ARCS.find(item => item.id === decision.eventId);
    return event ? scriptedEventView(s, event, event.officerId) : null;
  }
  if (decision.type === "conquest") {
    const t = s.territories[decision.territoryId];
    const d = TERRITORY_DEFS[decision.territoryId];
    const hero = officer(s, decision.heroId);
    return {
      kicker: "战后处置", title: `${d.name}已经换了旗帜，接下来由谁收税？`, portrait: hero?.portrait || "assets/player.webp",
      body: `<p>${d.name}已经换旗，但原有官员、村长和俘虏仍在等待新的管理安排。</p><p>你可以直接管理这块领地，获得全部收入；也可以交给家臣，只获得七成收入；还可以让当地村镇自己管理，快速提高稳定度。</p>`,
      options: [
        { name: "由你直接管理", note: "获得全部收入；稳定 +7，王室认可 +2，高功劳家臣可能不满", effect() { t.fiefHolder = null; t.stability = clamp(t.stability + 7); s.legitimacy = clamp(s.legitimacy + 2); if (hero && hero.merit >= 20) hero.grievance = clamp(hero.grievance + 6); s.style.wealth++; log(s, "info", `${d.name}改由你直接管理。`); } },
        ...(hero && hero.side === "player" && hero.id !== "player" && !hero.fief ? [{ name: `交给${hero.name}管理`, note: "该家臣忠诚 +14；领地上缴七成收入，稳定 +13", effect() { t.fiefHolder = hero.id; t.stability = clamp(t.stability + 13); hero.fief = decision.territoryId; hero.loyalty = clamp(hero.loyalty + 14); hero.grievance = 0; hero.merit = Math.max(0, hero.merit - 12); s.legitimacy = clamp(s.legitimacy + (hero.id === "edmund" ? -2 : 1)); s.style.oath++; log(s, "good", `${hero.name}开始管理${d.name}。`); } }] : []),
        { name: "让当地村镇自己管理", note: "领地上缴约八成收入；稳定 +18，民心 +5，王室认可 −2", effect() { t.fiefHolder = "charter"; t.stability = clamp(t.stability + 18); s.support = clamp(s.support + 5); s.legitimacy = clamp(s.legitimacy - 2); s.style.oath += 2; log(s, "good", `${d.name}开始由当地村镇自行管理。`); } }
      ]
    };
  }
  if (decision.type === "submission") {
    const leader = officer(s, decision.faction === "wolf" ? "bran" : "aveline");
    const isBran = leader.id === "bran";
    return {
      kicker: "敌方领主投降", title: `${leader.name}请求成为你的家臣`, portrait: leader.portrait,
      body: `<p>${isBran ? "“你拿走了我的渡口和山关。狼牙不会向城墙下跪，但会跟随真正打赢我们的人。”" : "“河望家的旗已经落下。我可以把河地的账册和渡船交给你，也可以带着我的名字离开北境。”"}</p><p>接受投降可提高新领地稳定并获得一名家臣。收取赎金或放逐会让该人物永久离开。</p>`,
      options: [
        { name: "接受投降，让他成为家臣", note: "加入家臣；之前的事件会影响忠诚；长矛兵 +6，新领地稳定 +8", effect() { const original = LORD_DEFS[leader.id].loyalty; const base = 67; const relation = clamp(Math.round((leader.loyalty - original) * .75 - leader.grievance / 4), -12, 12); leader.side = "player"; leader.loyalty = clamp(base + relation); leader.grievance = Math.max(0, Math.round(leader.grievance * .35)); addUnits(s, "levy", 6); factionTerritories(s, "player").forEach(id => { if (TERRITORY_DEFS[id].owner === decision.faction) s.territories[id].stability = clamp(s.territories[id].stability + 8); }); s.style.oath++; log(s, "good", `${leader.name}加入渡鸦家，当前忠诚为${leader.loyalty}。`); } },
        { name: "收取26金币，放他离开", note: "金币 +26，威望 +2；该人物永久离开", effect() { leader.side = "gone"; s.gold += 26; s.renown = clamp(s.renown + 2); s.style.wealth += 2; log(s, "info", `${leader.name}支付赎金后离开北境。`); } },
        { name: "放逐他，禁止再次返回", note: "王室认可 +3，军心 +4；民心 −3", effect() { leader.side = "gone"; s.legitimacy = clamp(s.legitimacy + 3); s.morale = clamp(s.morale + 4); s.support = clamp(s.support - 3); s.style.iron += 2; log(s, "warn", `${leader.name}被放逐，旧旗帜在城门外烧成灰。`); } }
      ]
    };
  }
  if (decision.type === "first_winter") {
    return {
      kicker: "第一场雪", title: "城门外来了三十户没有粮食的人", portrait: "assets/oswin.webp",
      body: `<p>灰麦原的战乱烧掉了他们的村庄。奥斯温说仓库勉强能接济；伊莎贝尔提醒你，冬天才刚开始。</p><p>大厅里的人都在看你如何对待第一批求助者。</p>`,
      options: [
        { name: "打开粮仓，让他们进城", note: "粮食 −22，民心 +12，王室认可 +2；奥斯温忠诚 +5", disabled: s.grain < 22, effect() { s.grain -= 22; s.support = clamp(s.support + 12); s.legitimacy = clamp(s.legitimacy + 2); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty + 5); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance - 5); s.style.oath += 2; log(s, "good", "渡鸦堡为失去家园的人打开了粮仓。"); } },
        { name: "给他们10袋粮，让他们去南边", note: "粮食 −10，民心 +3；奥斯温不满 +3", disabled: s.grain < 10, effect() { s.grain -= 10; s.support = clamp(s.support + 3); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 3); s.style.wealth++; log(s, "info", "难民拿到十袋麦子，被指向了南方的道路。"); } },
        { name: "关门。城堡先养活自己人", note: "粮食不变，军心 +3，民心 −10；奥斯温忠诚 −7、不满 +12", effect() { s.morale = clamp(s.morale + 3); s.support = clamp(s.support - 10); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty - 7); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 12); s.style.iron += 2; log(s, "bad", "城门保持关闭，难民继续向南。奥斯温的忠诚下降，不满上升。"); } }
      ]
    };
  }
  if (decision.type === "cousin_demand") {
    const edmund = officer(s, "edmund");
    return {
      kicker: "家族暗流", title: "埃德蒙希望独自指挥下一次远征", portrait: "assets/edmund.webp",
      body: `<p>“让我单独领一次兵。”埃德蒙盯着桌上的军旗，“我打得赢，他们自然会闭嘴。”</p><p>已经有几名骑士开始跟随埃德蒙。让他单独领军，会增加他的功劳，也可能让他的野心更大。</p>`,
      options: [
        { name: "同意让他单独领军", note: "埃德蒙忠诚 +8、功劳 +5；王室认可 −3", effect() { edmund.loyalty = clamp(edmund.loyalty + 8); edmund.merit += 5; s.legitimacy = clamp(s.legitimacy - 3); s.style.oath++; log(s, "info", "埃德蒙接过军旗，下一次会议由他汇报商路和军情。"); } },
        { name: "当众拒绝他的请求", note: "王室认可 +4；埃德蒙忠诚 −10、不满 +14", effect() { s.legitimacy = clamp(s.legitimacy + 4); edmund.loyalty = clamp(edmund.loyalty - 10); edmund.grievance = clamp(edmund.grievance + 14); s.style.iron += 2; log(s, "warn", "埃德蒙交还军旗，忠诚下降，不满上升。"); } },
        { name: "让他先去保护商路", note: "金币 +10；埃德蒙忠诚 −3、管理功劳 +3", effect() { s.gold += 10; edmund.loyalty = clamp(edmund.loyalty - 3); edmund.merit += 3; s.style.wealth += 2; log(s, "info", "埃德蒙保护商路，带回10金币并增加3点功劳。"); } }
      ]
    };
  }
  if (decision.type === "royal_tax") {
    return {
      kicker: "王室催税", title: "摄政公爵要你补上父亲欠下的四十枚金币", portrait: "assets/ysabel.webp",
      body: `<p>使者把王室命令放在长桌上。按时缴纳会提高王室认可；拒绝缴税则会明显降低王室认可，但能提高军心和威望。</p>`,
      options: [
        { name: "支付全部40金币", note: "金币 −40，王室认可 +12", disabled: s.gold < 40, effect() { s.gold -= 40; s.legitimacy = clamp(s.legitimacy + 12); s.style.oath++; log(s, "info", "王室税金装箱南下，公爵的使者满意离开。"); } },
        { name: "只付20金币并请求延期", note: "金币 −20，王室认可 +3，威望 −2", disabled: s.gold < 20, effect() { s.gold -= 20; s.legitimacy = clamp(s.legitimacy + 3); s.renown = clamp(s.renown - 2); s.style.wealth += 2; log(s, "warn", "使者收下20金币，并把剩余欠税写入回报。"); } },
        { name: "烧掉命令，拒绝缴税", note: "威望 +8，军心 +6，王室认可 −12", effect() { s.renown = clamp(s.renown + 8); s.morale = clamp(s.morale + 6); s.legitimacy = clamp(s.legitimacy - 12); s.style.iron += 2; log(s, "warn", "使者带着烧毁的封蜡返回王城，渡鸦堡公开拒绝缴税。"); } }
      ]
    };
  }
  if (decision.type === "iron_crown") {
    const crownTechBonus = () => {
      if (techLevel(s, "royal_exchange")) s.renown = clamp(s.renown + 10 * techLevel(s, "royal_exchange"));
      if (techLevel(s, "iron_crown_doctrine")) s.morale = clamp(s.morale + 8 * techLevel(s, "iron_crown_doctrine"));
    };
    const crownTechNote = `${techLevel(s, "royal_exchange") ? `；王家汇兑额外威望 +${10 * techLevel(s, "royal_exchange")}` : ""}${techLevel(s, "iron_crown_doctrine") ? `；铁冠军令军心 +${8 * techLevel(s, "iron_crown_doctrine")}` : ""}`;
    return {
      kicker: "终章 · 铁冠", title: "王冠谷已经落入你手中", portrait: "assets/player.webp",
      body: `<p>王冠谷已经被占领，北境七块领地全部归你统治。家臣把旧王朝的铁冠送进大厅，等待你决定如何完成加冕。</p>`,
      options: [
        { name: "保留各地旧规矩，再戴上铁冠", note: `守信风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.oath++; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}保留各地旧规矩，然后戴上铁冠。`); } },
        { name: "要求所有领主跪下宣誓，再戴上铁冠", note: `强硬风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.iron += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}要求所有领主跪下宣誓，然后戴上铁冠。`); } },
        { name: "先清点国库和税册，再举行加冕", note: `经营风格 +2${crownTechNote}`, effect() { crownTechBonus(); s.style.wealth += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}先清点国库和税册，随后才举行加冕。`); } }
      ]
    };
  }
  return null;
}

function pumpDecision() {
  if (!S || S.ended || !S.pendingDecisions.length || typeof document === "undefined") {
    $("modalMask")?.classList.add("hidden");
    if (S && !S.battleSession && S.pauseState?.reason === "decision") resumeWorld(S, Date.now());
    return;
  }
  if (pauseWorld(S, "decision")) renderTop();
  const view = decisionView(S, S.pendingDecisions[0]);
  if (!view) { S.pendingDecisions.shift(); saveGame(); pumpDecision(); return; }
  $("modalMask").classList.remove("hidden");
  $("modalKicker").textContent = cleanDisplayText(view.kicker);
  $("modalTitle").textContent = cleanDisplayText(view.title);
  $("modalBody").innerHTML = cleanDisplayText(view.body);
  $("modalPortrait").src = view.portrait;
  $("modalPortrait").alt = view.title;
  $("modalResources").innerHTML = [["金币", Math.round(S.gold)], ["粮食", Math.round(S.grain)], ["军队", Math.round(S.troops)], ["民心", Math.round(S.support)], ["军心", Math.round(S.morale)], ["声望", Math.round(S.renown)]].map(([label, value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("");
  $("modal").scrollTop = 0;
  $("modalOptions").innerHTML = view.options.map((opt, i) => {
    const plus = (opt.note.match(/\+/g) || []).length;
    const minus = (opt.note.match(/−/g) || []).length;
    const tone = plus && !minus ? "gain" : minus && !plus ? "risk" : plus && minus ? "mixed" : "neutral";
    return `<button class="${tone}" data-decision-option="${i}" ${opt.disabled ? "disabled" : ""}><b>${esc(cleanDisplayText(opt.name))}</b><small>${esc(cleanDisplayText(opt.note))}</small></button>`;
  }).join("");
  $("modalOptions").querySelectorAll("[data-decision-option]").forEach(button => button.addEventListener("click", () => {
    const option = view.options[Number(button.dataset.decisionOption)];
    if (!option || option.disabled) return;
    option.effect();
    S.pendingDecisions.shift();
    $("modalMask").classList.add("hidden");
    if (!S.pendingDecisions.length) resumeWorld(S, Date.now());
    saveGame();
    renderAll();
    if (!S.ended) pumpDecision();
  }));
}

function metrics(items) {
  return `<div class="metrics">${items.map(([value, label]) => { const display = typeof value === "number" ? Math.round(value) : value; return `<div class="metric"><b>${esc(display)}</b><span>${esc(label)}</span></div>`; }).join("")}</div>`;
}

function cleanDisplayText(value) {
  return String(value ?? "")
    .replace(/王室认可/g, "声望")
    .replace(/战争疲劳/g, "军心")
    .replace(/人口/g, "居民")
    .replace(/稳定/g, "民心")
    .replace(/功劳/g, "声望")
    .replace(/野心/g, "忠诚")
    .replace(/不满\s*[+]\s*(\d+)/g, "忠诚 −$1")
    .replace(/不满\s*[−-]\s*(\d+)/g, "忠诚 +$1")
    .replace(/不满上升/g, "忠诚下降")
    .replace(/不满下降/g, "忠诚上升")
    .replace(/不满/g, "忠诚");
}

function currentStyle(s) {
  return Object.entries(s.style).sort((a, b) => b[1] - a[1])[0][0];
}

function renderTop() {
  syncTroops(S);
  const season = seasonOf(S);
  const f = forecast(S);
  const flow = resourceFlow(S, season);
  $("chapterText").textContent = `第${yearOf(S)}年 · ${season.name}季`;
  $("turnText").textContent = `${Math.min(S.turn + 1, MAX_TURNS)} / ${MAX_TURNS}`;
  $("goldText").textContent = Math.round(S.gold);
  $("grainText").textContent = Math.round(S.grain);
  if ($("knowledgeText")) $("knowledgeText").textContent = Math.round(S.knowledge || 0);
  $("troopText").textContent = Math.round(S.troops);
  $("phaseText").textContent = season.phase;
  $("turnHint").textContent = S.battleSession ? "远征尚未结束" : `距离换季 ${formatDuration(getSeasonRemainingMs(S))}`;
  $("playerNameText").textContent = S.playerName;
  $("oathBadge").textContent = "合法继承人";
  $("territoryCount").textContent = `${ownTerritoryIds(S).length} / ${playableTerritoryIds().length}`;
  [["support", S.support], ["morale", S.morale], ["renown", S.renown]].forEach(([id, value]) => {
    $(`${id}Text`).textContent = Math.round(value);
    $(`${id}Bar`).style.width = `${clamp(value)}%`;
  });
  $("goldSideText").textContent = Math.round(S.gold); $("grainSideText").textContent = Math.round(S.grain); $("armySideText").textContent = Math.round(S.troops);
  $("goldBar").style.width = `${clamp(S.gold / 2)}%`; $("grainBar").style.width = `${clamp(S.grain / 4)}%`; $("armyBar").style.width = `${clamp(S.troops / 2)}%`;
  $("netGoldText").textContent = formatResourceRate(flow.goldPerSecond, "金");
  $("forecastList").innerHTML = [
    ["金币流量", formatResourceRate(flow.goldPerSecond, "金")], ["粮食流量", formatResourceRate(flow.grainPerSecond, "粮")], ["本季净金", `${f.netGold >= 0 ? "+" : "−"}${Math.abs(f.netGold)}`], ["本季净粮", `${f.netGrain >= 0 ? "+" : "−"}${Math.abs(f.netGrain)}`], ["粮仓容量", `${f.storageCap}`]
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
  $("gameNav").querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("active", button.dataset.tab === S.tab));
}

function renderAll() {
  if (!S || typeof document === "undefined") return;
  if (S.ended) { showEnding(S); return; }
  if (S.battleSession) S.tab = "campaign";
  $("menu").classList.add("hidden");
  $("creator").classList.add("hidden");
  $("prologue").classList.add("hidden");
  $("ending").classList.add("hidden");
  $("game").classList.remove("hidden");
  renderTop();
  const renderers = { hall: renderHall, domain: renderDomain, map: renderMap, campaign: renderCampaign, court: renderCourt, chronicle: renderChronicle };
  (renderers[S.tab] || renderHall)();
  if (S.pendingDecisions.length) setTimeout(pumpDecision, 0);
}

function researchPanelHtml() {
  const queue = researchQueueJob(S);
  return `<section class="research-panel"><div class="section-head"><h2>学堂与研究</h2><span>当前知识 ${Math.round(S.knowledge || 0)} · 全局仅限一个研究队列 · 每项科技三阶</span></div><div class="tech-grid">${Object.entries(TECH_DEFS).map(([branch, techs]) => `<article class="tech-branch"><div class="tech-branch-head"><b>${TECH_BRANCH_NAMES[branch]}</b><small>${techs.reduce((sum, tech) => sum + techLevel(S, tech.id), 0)} / ${techs.reduce((sum, tech) => sum + techMaxLevel(tech), 0)} 阶</small></div>${techs.map(tech => {
    const currentLevel = techLevel(S, tech.id);
    const maxLevel = techMaxLevel(tech);
    const nextLevel = currentLevel + 1;
    const active = queue?.payload?.techId === tech.id;
    const unmet = tech.requires.filter(id => !techCompleted(S, id));
    const cost = techCost(tech, nextLevel);
    const duration = researchDuration(tech, nextLevel);
    const affordable = S.knowledge >= cost.knowledge && S.gold >= cost.gold;
    const label = currentLevel >= maxLevel ? `已满阶 · ${currentLevel}/${maxLevel}` : active ? `研究中 · ${nextLevel}/${maxLevel} · ${formatDuration(getJobRemainingMs(queue))}` : queue ? "研究队列占用" : unmet.length ? `需要：${unmet.map(id => techDefinition(branch, id)?.name || id).join("、")}` : !affordable ? "知识或金币不足" : `研究 ${nextLevel}/${maxLevel} · ${cost.knowledge}知 · ${cost.gold}金 · ${formatDuration(duration)}`;
    const disabled = currentLevel >= maxLevel || !!queue || unmet.length > 0 || !affordable;
    return `<div class="tech-card ${currentLevel >= maxLevel ? "completed" : active ? "active" : ""}"><div><b>${esc(tech.name)} <i class="tech-level-badge">${currentLevel}/${maxLevel}</i></b><small>${esc(tech.desc)} 每阶都会强化效果，研究时间逐阶增加。</small></div><button data-research-branch="${branch}" data-research="${tech.id}" ${disabled ? "disabled" : ""}>${active && queue ? `<span data-job-countdown="${queue.id}" data-job-prefix="研究中 · ">研究中 · ${nextLevel}/${maxLevel} · ${formatDuration(getJobRemainingMs(queue))}</span>` : label}</button></div>`;
  }).join("")}</article>`).join("")}</div></section>`;
}

function renderHall() {
  const panel = $("panel");
  const f = forecast(S);
  const flow = resourceFlow(S);
  const activeJobs = (S.jobs || []).filter(job => job.status === "running");
  const queueHtml = activeJobs.length ? activeJobs.map(job => {
    const label = job.type === "BUILD" ? `建设 · ${TERRITORY_DEFS[job.territoryId]?.name || "领地"}` : job.type === "RECRUIT" ? "募集兵力" : job.type === "RESEARCH" ? "科技研究" : job.type === "MARCH" ? `${job.payload?.armyIds?.length > 1 ? "合军行军" : "军团行军"} · ${TERRITORY_DEFS[job.payload?.destinationId]?.name || "目标"}` : job.type === "OFFICER_RECRUIT" ? `招募领主 · ${officer(S, job.payload?.officerId)?.name || "候选人"}` : job.type === "CITY_ACTION" ? `城市行动 · ${TERRITORY_DEFS[job.territoryId]?.name || "城市"}` : "军政指令";
    return `<div class="queue-row"><b>${label}</b><span data-job-countdown="${job.id}" data-job-prefix="">${formatDuration(getJobRemainingMs(job))}</span></div>`;
  }).join("") : `<div class="empty-state">当前没有进行中的建设、研究、募兵或行军。</div>`;
  panel.innerHTML = `
    <section class="hero-panel">
      <span class="eyebrow">STRATEGY OVERVIEW</span>
      <h2>${S.turn === 0 ? "第一年春：先发展，再出征" : `第${yearOf(S)}年${seasonOf(S).name}季 · 军政总览`}</h2>
      <p>${seasonOf(S).note} 资源会自动流入，季节系数会改变金币与粮食的速度。先建设生产，再研究科技、募集兵力，最后选择出征时机。</p>
      ${metrics([[S.gold, "金币"], [S.grain, "粮食"], [armyTotal(S), "军队"], [S.support, "民心"], [S.morale, "军心"], [S.renown, "声望"]])}
    </section>
    ${S.lastAction ? `<div class="feedback-banner"><b>${esc(S.lastAction.name)}</b><p>${esc(S.lastAction.text)}</p></div>` : ""}
    <div class="strategy-overview"><article class="flow-card"><div class="section-head"><h3>实时资源流量（按小时）</h3><span>${seasonOf(S).name}季系数 · 金${formatSeasonCoefficient(seasonOf(S).gold)} / 粮${formatSeasonCoefficient(seasonOf(S).grain)}</span></div><div class="flow-values"><b>${formatResourceRate(flow.goldPerSecond, "金")}</b><b>${formatResourceRate(flow.grainPerSecond, "粮")}</b></div><p>本季预计净额：金币 ${f.netGold >= 0 ? "+" : "−"}${Math.abs(f.netGold)} · 粮食 ${f.netGrain >= 0 ? "+" : "−"}${Math.abs(f.netGrain)}</p></article><article class="queue-card"><div class="section-head"><h3>进行中的军政事务</h3><span>${activeJobs.length} 项</span></div>${queueHtml}</article></div>
    <div class="quick-actions"><button data-quick-tab="domain"><b>发展领地</b><small>建筑与科技</small></button><button data-quick-tab="court"><b>查看将领</b><small>招募领主、管理骑士</small></button><button data-quick-tab="campaign"><b>编组军队</b><small>兵种与军团</small></button><button data-quick-tab="map"><b>查看地图</b><small>选择军团出征</small></button></div>`;
  panel.querySelectorAll("[data-quick-tab]").forEach(button => button.addEventListener("click", () => { S.tab = button.dataset.quickTab; saveGame(); renderAll(); resetPageScroll(); }));
}

function officerCard(o, enemy = false) {
  if (!o) return "";
  const fief = o.fief ? `管理${TERRITORY_DEFS[o.fief]?.name}` : "未管理领地";
  const status = enemy ? `${o.recruitable ? "可招募领主" : FACTIONS[o.side]?.name || "已经离开"} · 忠诚 ${Math.round(o.loyalty)}` : o.id === "player" ? "王子本人" : `忠诚 ${Math.round(o.loyalty)}`;
  return `<article class="officer-card ${enemy ? "enemy" : ""}">
    <img src="${o.portrait}" alt="${esc(o.name)}">
    <div class="card-copy"><div class="role-line"><h3>${esc(o.name)}</h3><span>${esc(o.title)}</span></div><p>领主的统率与治理决定带兵和经营效率。</p>
    <div class="stat-chips">${OFFICER_STAT_KEYS.map(key => `<span>${STAT_LABELS[key]}${o.stats[key]}</span>`).join("")}</div>
    <div class="loyalty-line"><span>${status}</span><b>${fief}</b></div><div class="loyalty-track"><i style="width:${enemy ? 56 : clamp(o.loyalty)}%"></i></div></div>
  </article>`;
}

function renderDomain() {
  const panel = $("panel");
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">RESTORATION ECONOMY</span><h2>发展复国根基</h2><p>农田养军，市场聚财，铁匠铺和兵营把资源变成收复旧土的军力。建筑最高五级，每块领地同时只进行一项建设。</p>${metrics([[ownTerritoryIds(S).length, "收复领地"], [S.support, "民心"], [forecast(S).grain, "本季产粮"], [forecast(S).gold, "本季金币"]])}</section>
    <div class="section-head"><h2>领地建设</h2><span>农田、市场、兵营、城墙、粮仓、学宫、工坊、驿道、烽火台、神殿</span></div>
    <div class="domain-grid">${ownTerritoryIds(S).map(domainCard).join("")}</div>${researchPanelHtml()}`;
  panel.querySelectorAll("[data-upgrade]").forEach(button => button.addEventListener("click", () => upgradeBuilding(button.dataset.territory, button.dataset.upgrade)));
  panel.querySelectorAll("[data-research]").forEach(button => button.addEventListener("click", () => {
    const job = queueResearch(S, button.dataset.researchBranch, button.dataset.research);
    if (!job) { toast("现在无法开始这项研究"); return; }
    const tech = techDefinition(button.dataset.researchBranch, button.dataset.research);
    S.lastAction = { name: "研究排队", text: `${tech.name}第${techLevel(S, tech.id) + 1}阶开始研究，预计${formatDuration(job.endAt - job.startedAt)}后完成。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
}

function domainCard(id) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const out = territoryOutput(S, id);
  const holder = t.fiefHolder === "charter" ? "村镇自治" : t.fiefHolder ? `由${officer(S, t.fiefHolder)?.name || "旧领主"}管理` : "由你管理";
  return `<article class="domain-card"><div class="owner-line"><span>${esc(d.terrain)} · ${holder}</span><b>王国民心 ${Math.round(S.support)}</b></div><h3>${d.name}</h3><div class="stat-chips"><span>本季 ${out.gold}金</span><span>${out.grain}粮</span><span>守军 ${t.guard}</span><span>生产正常</span></div>
    <div class="building-grid">${Object.entries(BUILDINGS).map(([type, b]) => {
      const level = t.buildings[type];
      const cost = buildingCost(S, id, type);
      const buildJob = getRunningJob(S, `build:${id}`);
      const buildingQueued = buildJob?.payload?.buildingType === type;
      const buildLabel = buildingQueued ? `建设中 · ${formatDuration(getJobRemainingMs(buildJob))}` : buildJob ? "建设队列占用" : level >= BUILDING_MAX_LEVEL ? "已达最高级" : `升级 · ${cost}金`;
      return `<div class="building-card"><b>${glyphSvg(type)}${b.name} · ${level}/${BUILDING_MAX_LEVEL}</b><small>${b.desc}</small><button data-territory="${id}" data-upgrade="${type}" ${!canUpgrade(S, id, type) ? "disabled" : ""}>${buildingQueued ? `<span data-job-countdown="${buildJob.id}" data-job-prefix="建设中 · ">建设中 · ${formatDuration(getJobRemainingMs(buildJob))}</span>` : buildLabel}</button></div>`;
    }).join("")}</div></article>`;
}

function renderMap() {
  const panel = $("panel");
  const attackable = [...new Set(playerArmies(S).flatMap(army => attackableTerritories(S, army.id)))];
  const mapArmy = armyEntity(S, "army_1");
  const mapMarchJob = mapArmy?.jobId ? S.jobs.find(job => job.id === mapArmy.jobId && job.status === "running") : null;
  const mapArmyStatus = `${playerArmies(S).length}支军团 · ${playerArmies(S).filter(army => army.status === "idle").length}支待命`;
  const selectedId = S.selectedTerritoryId || "ravenstone";
  const controlled = ownTerritoryIds(S).length;
  const interactiveCount = Object.keys(TERRITORY_DEFS).length;
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE RESTORATION MAP</span><h2>把父亲的旧领土夺回来</h2><p>每个城堡和城镇都是复国路线上的一站。点击敌方城堡，查看守军、侦察情报并直接配置远征。<br><b>${mapArmyStatus}</b></p>${metrics([[`${controlled} / ${playableTerritoryIds().length}`, "已收复"], [attackable.length, "邻近目标"], [playableTerritoryIds().length, "可占领地点"], [interactiveCount, "地图地点"]])}</section>
    <div class="unification-track"><div><b>复国进度</b><span>收复父亲留下的旧土，逐步逼近王冠谷</span></div><strong>${Math.round(controlled / playableTerritoryIds().length * 100)}%</strong><i style="width:${Math.round(controlled / playableTerritoryIds().length * 100)}%"></i></div>
    <div class="section-head"><h2>北境地图</h2><span>城堡统辖附近附属镇 · 金边为军团可达目标 · 点击目标配置远征</span></div>
    <div class="map-shell"><div class="map-legend">${Object.entries(FACTIONS).map(([id, f]) => `<span style="--crest-color:${f.color}">${crestSvg(id, f.name)}${f.name}</span>`).join("")}<span class="map-legend-note">金边目标可直接配置远征 · 斥候情报按季更新 · 手机左右滑动地图</span></div><div class="map-viewport" tabindex="0" aria-label="可横向浏览的北境地图"><div class="realm-map">${mapRoutes(S)}${Object.keys(TERRITORY_DEFS).map(id => mapNode(id, attackable)).join("")}</div></div><div class="map-inspector">${territorySummary(S, selectedId, attackable)}</div></div>`;
  panel.querySelectorAll("[data-map-territory]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.mapTerritory;
    S.selectedTerritoryId = id;
    saveGame(); renderMap();
    toast(owns(S, id) ? `${TERRITORY_DEFS[id].name}由你控制` : attackable.includes(id) ? `${TERRITORY_DEFS[id].name}已接壤，可以制定远征` : `${TERRITORY_DEFS[id].name}等待你的使者`);
  }));
  panel.querySelectorAll("[data-city-action]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.cityId;
    const action = button.dataset.cityAction;
    if (!cityAction(S, id, action)) { toast("资源不足，或本季已经安排过这项城市行动"); return; }
    saveGame(); renderMap();
    toast(S.lastAction.text);
  }));
  panel.querySelectorAll("[data-city-attack]").forEach(button => button.addEventListener("click", () => {
    S.selectedTerritoryId = button.dataset.cityAttack;
    saveGame(); renderMap();
  }));
  panel.querySelectorAll("[data-castle-launch]").forEach(button => button.addEventListener("click", () => {
    const targetId = button.dataset.castleLaunch;
    const army = armyEntity(S, "army_1");
    const composition = emptyComposition();
    panel.querySelectorAll(`[data-castle-unit="${targetId}"]`).forEach(input => { composition[input.dataset.unitType] = clamp(Math.round(Number(input.value) || 0), 0, Math.round(Number(input.max) || 0)); });
    const total = compositionTotal(composition);
    const knight = panel.querySelector(`[data-castle-knight="${targetId}"]`)?.value;
    const leaderIds = ["player"];
    const plan = panel.querySelector(`[data-castle-plan="${targetId}"]`)?.value || "steady";
    const minimum = compositionSupply(S, composition, leaderIds);
    const grainInput = panel.querySelector(`[data-castle-grain="${targetId}"]`);
    const carried = Math.max(0, Math.round(Number(grainInput?.value) || 0));
    if (!army || army.status !== "idle" || total < 10 || total > armyTotal(S, army.id) || Object.keys(UNIT_DEFS).some(type => composition[type] > (army.composition[type] || 0))) { toast("请先选择不超过主力现有数量的兵种，至少出兵10人"); return; }
    if (carried < minimum || carried > S.grain) { toast(`至少需要携带${minimum}粮食`); return; }
    S.grain -= carried;
    const job = startMarch(S, "army_1", targetId, Date.now(), { battlePlan: { leaderIds, knightIds: knight ? [knight] : [], composition, troops: total, plan, suppliedGrain: carried } });
    if (!job) { S.grain += carried; toast("王国主力当前无法长途出征"); return; }
    S.lastAction = { name: "远征出发", text: `王国主力携${compositionText(composition)}和${carried}粮食出发，预计${formatDuration(job.endAt - job.startedAt)}后抵达${TERRITORY_DEFS[targetId].name}。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-expedition-launch]").forEach(button => button.addEventListener("click", () => {
    const targetId = button.dataset.expeditionLaunch;
    const armyIds = [...panel.querySelectorAll("[data-expedition-army]")].filter(input => input.checked).map(input => input.dataset.expeditionArmy);
    const armies = armyIds.map(id => armyEntity(S, id)).filter(Boolean);
    const plan = panel.querySelector(`[data-expedition-plan="${targetId}"]`)?.value || "steady";
    const commanders = armies.map(army => armyCommander(S, army).id);
    const aggregate = armyGroupComposition(S, armyIds);
    const minimum = compositionSupply(S, aggregate, commanders);
    const carried = Math.max(0, Math.round(Number(panel.querySelector(`[data-expedition-grain="${targetId}"]`)?.value) || 0));
    if (!armyIds.length || armies.some(army => army.status !== "idle") || compositionTotal(aggregate) < 10) { toast("至少选择一支待命军团"); return; }
    if (carried < minimum || carried > S.grain) { toast(`这支远征至少需要${minimum}粮食`); return; }
    S.grain -= carried;
    const job = startArmyGroupMarch(S, armyIds, targetId, Date.now(), { battlePlan: { leaderIds: commanders, composition: aggregate, troops: compositionTotal(aggregate), plan, armyIds }, suppliedGrain: carried });
    if (!job) { S.grain += carried; toast("所选军团无法从当前位置合军出发"); return; }
    S.lastAction = { name: "军团远征出发", text: `${armyIds.length > 1 ? "多支军团合军" : armies[0].name}携${carried}粮食前往${TERRITORY_DEFS[targetId].name}，预计${formatDuration(job.endAt - job.startedAt)}后抵达。` };
    log(S, "info", S.lastAction.text);
    saveGame(); renderAll();
  }));
}

function mapRoutes(s) {
  const zones = Object.entries(MAP_POINTS).map(([id, [cx, cy]]) => `<circle cx="${cx}" cy="${cy}" r="10" style="--zone-color:${FACTIONS[s.territories[id].owner].color}"/>`).join("");
  const routes = MAP_LINKS.map(([a, b]) => {
    const [x1, y1] = MAP_POINTS[a];
    const [x2, y2] = MAP_POINTS[b];
    const ownerA = s.territories[a].owner;
    const ownerB = s.territories[b].owner;
    const kind = ownerA === ownerB ? (ownerA === "player" ? "owned" : "enemy") : (ownerA === "player" || ownerB === "player" ? "frontier" : "contested");
    return `<line class="${kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join("");
  return `<svg class="map-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${zones}${routes}</svg>`;
}

function mapNode(id, attackable) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const faction = FACTIONS[t.owner];
  const mine = t.owner === "player";
  const canAttack = attackable.includes(id);
  const locked = d.final && !crownAccessMet(S);
  const minor = d.playable === false;
  const settlementType = d.type === "castle" || d.type === "capital" ? "城堡" : "附属镇";
  const status = canAttack ? "可出征" : mine ? `我方${settlementType} · 守军${t.guard}` : minor ? "道路节点 · 可侦察" : locked ? "条件未满足" : `守军 ${t.guard}`;
  return `<button type="button" data-map-territory="${id}" class="map-node ${mine ? "mine" : ""} ${minor ? "minor" : ""} ${canAttack ? "attackable" : ""} ${locked ? "locked" : ""}" style="--owner-color:${faction.color};left:${d.x}%;top:${d.y}%">${crestSvg(t.owner, faction.name)}<span><b>${d.name}</b><small>${status}</small></span></button>`;
}

function castleExpeditionHtml(s, id) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  if (!d || !t || t.owner === "player" || d.playable === false) return "";
  const eligible = playerArmies(s).filter(army => army.status === "idle" && attackableTerritories(s, army.id).includes(id));
  const previewIds = eligible.length ? [eligible[0].id] : [];
  const preview = armyGroupComposition(s, previewIds);
  const leaders = previewIds.map(armyId => armyCommander(s, armyEntity(s, armyId)).id);
  const required = previewIds.length ? compositionSupply(s, preview, leaders) : 0;
  const locked = d.final && !crownAccessMet(s);
  const disabled = locked || !eligible.length || compositionTotal(preview) < 10 || s.grain < required;
  const previewTroops = compositionTotal(preview);
  // 战前预测按「默认勾选第一支军团 + 稳扎稳打」推演。勾选多支或换方略后，
  // 实际战力会高于这里的下限，所以文案标注为「按当前预选」。
  const est = previewTroops ? battleEstimate(s, id, leaders, previewTroops, "steady", previewIds[0], preview) : null;
  const risk = previewTroops ? casualtyForecast(s, id, leaders, previewTroops, "steady", previewIds[0]) : null;
  const forecastHtml = est ? `<div class="battle-estimate ${battleRiskClass(est.ratio)}">胜算预测（按当前预选）：<b>${est.label}</b><br>${battlePowerText(est.ratio)}${battleBreakdownText(est)}。预计伤亡${risk.low}—${risk.high}人。${battleMoraleText(est.effectiveMorale, s.morale)}<br>${terrainAdvice(id, preview)}${seasonOf(s).id === "winter" ? " 严冬会额外削弱骑士并增加军粮消耗。" : ""}</div>` : "";
  return `<section class="castle-plan"><div class="castle-plan-head"><b>从这里配置远征</b><span>${eligible.length ? `可用${eligible.length}支军团 · 预计${formatDuration(Math.min(...eligible.map(army => marchDurationForDistance(s, army.locationId, id))))}` : "没有在途或待命军团"}</span></div>
    <p class="expedition-note">选择一支军团单独出征，或勾选多支军团合军。每支军团会保留自己的兵种和指挥官。</p>
    ${forecastHtml}
    <div class="expedition-army-list">${eligible.length ? eligible.map((army, index) => { const commander = armyCommander(s, army); return `<label class="expedition-army-row"><input type="checkbox" data-expedition-army="${army.id}" ${index === 0 ? "checked" : ""}><span><b>${esc(army.name)}</b><small>${esc(commander.person?.name || "未任命")} · ${commander.isKnight ? "骑士" : "王子"} · ${compositionTotal(army.composition)}人 · ${compositionText(army.composition)}</small></span></label>`; }).join("") : `<div class="empty-state">先在军队页组建军团，再回到地图出征。</div>`}</div>
    <div class="castle-plan-grid"><label>作战方式<select data-expedition-plan="${id}">${Object.entries(PLANS).map(([planId, plan]) => `<option value="${planId}">${plan.name}</option>`).join("")}</select></label><label>携带粮食<input type="number" min="${required}" max="${Math.max(required, Math.floor(s.grain))}" value="${required}" data-expedition-grain="${id}"><small>当前预选至少需要${required}粮。</small></label></div>
    <button class="city-attack-btn" data-expedition-launch="${id}" ${disabled ? "disabled" : ""}>${locked ? "王冠谷 · 条件未满足" : !eligible.length ? "没有可出征军团" : s.grain < required ? "粮食不足" : `出征 · ${d.name}`}</button></section>`;
}

function territorySummary(s, id, attackable = []) {
  const d = TERRITORY_DEFS[id];
  const t = s.territories[id];
  const faction = FACTIONS[t.owner];
  const actions = cityActionOptions(s, id);
  const cityJob = cityActionJob(s, id);
  const intel = cityIntelActive(s, id) ? "斥候情报有效" : "情报会随季节过时";
  const actionHtml = cityJob ? `<div class="city-queue"><b>斥候行动进行中</b><span data-job-countdown="${cityJob.id}" data-job-prefix="">${formatDuration(getJobRemainingMs(cityJob))}</span><small>完成后会记录这座城的基础军情。</small></div>` : actions.length ? `<div class="city-actions">${actions.map(action => `<button data-city-action="${action.id}" data-city-id="${id}" ${action.disabled ? "disabled" : ""}><b>${action.name}</b><small>${action.note}</small></button>`).join("")}</div>` : "";
  const attack = attackable.includes(id) ? `<button class="city-attack-btn" data-city-attack="${id}">打开出征配置</button>` : "";
  const castlePlan = t.owner !== "player" && d.playable !== false ? castleExpeditionHtml(s, id) : "";
  const settlementType = d.type === "castle" || d.type === "capital" ? "城堡" : "附属镇";
  return `<article style="--owner-color:${faction.color}"><div class="city-inspector-head"><div><small style="color:${faction.color}">${faction.name} · ${settlementType}</small><h3>${d.name}</h3></div><b class="city-relation">${t.owner === "player" ? "我方领地" : "独立领地"}</b></div><p>${d.terrain} · 守军 ${t.guard} · 民心 ${Math.round(S.support)}<br>${esc(d.desc)}<br><span class="city-intel">${intel}</span></p>${attack}${castlePlan}${actionHtml}</article>`;
}

function terrainAdvice(targetId, composition) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  if (tags.includes("plains")) return (composition.knights || 0) + (composition.light_cavalry || 0) >= 3 ? "开阔地适合骑士冲锋。" : "开阔地缺少遮蔽，没有骑兵时突破会更依赖人数。";
  if (tags.includes("forest")) return (composition.archers || 0) + (composition.crossbowmen || 0) >= 4 ? "远射兵可借密林掩护前进，骑士难以展开。" : "密林会削弱骑兵，最好带足远射兵或谋略家臣。";
  if (tags.includes("mountain")) return "山道狭窄，弓手和长矛兵更可靠，骑士战力大幅受限。";
  if (tags.includes("river")) return "河网切碎冲锋路线，弓手能隔水压制守军。";
  return "这里的地形会影响远射和骑兵，人数、军心与作战方式更加重要。";
}

function unitUnlockLabel(s, type, territoryId) {
  const unit = UNIT_DEFS[type];
  if (unit.unlockTech && !techCompleted(s, unit.unlockTech)) return `完成${techDefinition("military", unit.unlockTech)?.name || "军事科技"}`;
  if (["knights", "heavy_infantry", "light_cavalry"].includes(type) && s.renown < 15 && (s.territories[territoryId].buildings.barracks || 0) < 2) return "需要15威望或2级兵营";
  return `征募 +${recruitAmount(s, type, territoryId)} · ${unit.gold}金/${unit.grain}粮`;
}

function armyRosterHtml() {
  const territoryId = recruitmentTerritoryId(S);
  const garrison = territoryGarrison(S, territoryId);
  const recruitJob = getRunningJob(S, `recruit:${territoryId}`);
  const place = TERRITORY_DEFS[territoryId]?.name || "本领地";
  const army = armyEntity(S, "army_1");
  const deployable = army?.status === "idle" && army.locationId === territoryId && compositionTotal(garrison) > 0;
  const main = army?.composition || emptyComposition();
  return `<div class="army-roster"><div class="section-note">王国主力：${compositionText(main)} · ${compositionTotal(main)}人；${place}待编驻军：${compositionText(garrison)}。训练完成后先进入驻军，再由主力驻扎时编入。</div>${deployable ? `<button class="secondary-btn" data-deploy-garrison="${territoryId}">把${place}驻军编入王国主力</button>` : ""}${Object.entries(UNIT_DEFS).map(([type, unit]) => { const queued = recruitJob?.payload?.unitType === type; const label = queued ? `训练中 · ${formatDuration(getJobRemainingMs(recruitJob))}` : recruitJob ? "训练队列占用" : unitUnlockLabel(S, type, territoryId); const count = garrison[type] || 0; const mainCount = main[type] || 0; const equipment = unitEquipment(S, type); return `<article class="unit-card"><div class="unit-head"><b>${glyphSvg(type)}${unit.name}</b><strong>${mainCount}<small>主力 · ${count}待编</small></strong></div><p>${unitDisplayHint(type)}<br>装备等级 ${equipment.level}</p><button data-recruit-unit="${type}" ${!canRecruitUnit(S, type, territoryId) ? "disabled" : ""}>${queued ? `<span data-job-countdown="${recruitJob.id}" data-job-prefix="训练中 · ">${label}</span>` : label}</button></article>`; }).join("")}</div>`;
}

function armyCorpsHtml() {
  const armies = playerArmies(S);
  const main = armyEntity(S, "army_1");
  const assigned = assignedCommanderIds(S);
  const commanderOptions = [{ id: "player", name: `${S.playerName} · 王子亲征` }].filter(option => canUseCommander(S, option.id)).concat(activeKnights(S).filter(knight => !assigned.has(knight.id)).map(knight => ({ id: knight.id, name: `${knight.name} · 骑士` })));
  const canCreate = main?.status === "idle" && compositionTotal(main.composition) >= 20 && commanderOptions.length > 0;
  return `<section class="corps-panel"><div class="section-head"><h2>军团编制</h2><span>${armies.length}支军团 · 每支由王子或骑士带领</span></div>
    <div class="corps-grid">${armies.map(army => { const commander = armyCommander(S, army); const canDisband = army.id !== "army_1" && army.status === "idle"; return `<article class="corps-card ${army.id === "army_1" ? "primary" : ""}"><div class="corps-card-head"><b>${esc(army.name)}</b><span>${army.id === "army_1" ? "主军" : "独立军团"}</span></div><p><strong>${esc(commander.person?.name || "未任命")}</strong> · ${commander.isKnight ? "骑士" : "王子"}<br>${TERRITORY_DEFS[army.locationId]?.name || "未知地点"} · ${armyStatusText(S, army)}</p><div class="stat-chips"><span>${compositionTotal(army.composition)}人</span><span>${compositionText(army.composition)}</span></div>${canDisband ? `<button class="ghost-btn" data-disband-army="${army.id}">解散军团</button>` : `<small class="corps-note">${army.id === "army_1" ? "主军不可解散" : "行军或交战中"}</small>`}</article>`; }).join("")}</div>
    <div class="corps-create"><div><h3>组建新军团</h3><p>从渡鸦第一军团抽调兵力，至少留下10人。组建完成后，地图上可以单独出征或合军。</p></div>
      <div class="corps-create-grid"><label>军团名称<input id="newArmyName" maxlength="18" value="第二军团" placeholder="例如：黑棘骑士团"></label><label>带队指挥官<select id="newArmyCommander">${commanderOptions.map(option => `<option value="${option.id}">${esc(option.name)}</option>`).join("")}</select></label></div>
      <div class="corps-unit-picks">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<label><span>${unit.name} · 主军${main?.composition[type] || 0}</span><input type="number" min="0" max="${main?.composition[type] || 0}" value="0" data-new-army-unit="${type}"></label>`).join("")}</div>
      <button class="secondary-btn" data-create-army ${canCreate ? "" : "disabled"}>${canCreate ? "组建军团" : "主军至少需要20人，且要有空闲骑士"}</button>
    </div></section>`;
}

function bindArmyControls(panel) {
  panel.querySelectorAll("[data-create-army]").forEach(button => button.addEventListener("click", () => {
    const composition = emptyComposition();
    panel.querySelectorAll("[data-new-army-unit]").forEach(input => { composition[input.dataset.newArmyUnit] = Math.max(0, Math.round(Number(input.value) || 0)); });
    const army = createArmyFromMain(S, $("newArmyName")?.value || "第二军团", $("newArmyCommander")?.value || "player", composition);
    if (!army) { toast("兵力、指挥官或主军状态不符合组建条件"); return; }
    saveGame(); renderAll();
  }));
  panel.querySelectorAll("[data-disband-army]").forEach(button => button.addEventListener("click", () => {
    if (!disbandArmy(S, button.dataset.disbandArmy)) { toast("军团行军或交战中，暂时不能解散"); return; }
    saveGame(); renderAll();
  }));
}

function renderCampaign() {
  if (S.battleSession) { renderActiveBattle(); return; }
  syncTroops(S);
  const panel = $("panel");
  const armies = playerArmies(S);
  const totalMobile = armies.reduce((sum, army) => sum + compositionTotal(army.composition), 0);
  const activeUnits = new Set(armies.flatMap(army => Object.entries(army.composition).filter(([, count]) => count > 0).map(([type]) => type))).size;
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE WAR COUNCIL</span><h2>军队与军团</h2><p>军队页负责募兵和编制。先把兵卒分成几支由王子或骑士带领的军团，再去地图选择目标出征；地图上可以单独出征，也可以多军团合军。</p>${metrics([[totalMobile, "机动兵力"], [activeUnits, "现役兵种"], [armies.length, "军团数量"], [activeKnights(S).length, "在列骑士"]])}</section>
    ${armyCorpsHtml()}
    <div class="section-head"><h2>兵种与补充</h2><span>训练完成后进入本地驻军，再编入渡鸦第一军团</span></div>${armyRosterHtml()}
    ${S.lastBattle ? renderLastBattle(S.lastBattle) : ""}`;
  bindArmyControls(panel);
  panel.querySelectorAll("[data-recruit-unit]").forEach(button => button.addEventListener("click", () => recruitUnit(button.dataset.recruitUnit)));
  panel.querySelectorAll("[data-deploy-garrison]").forEach(button => button.addEventListener("click", () => { if (!deployGarrison(S, button.dataset.deployGarrison)) toast("第一军团必须驻扎在本地且完成整补"); saveGame(); renderAll(); }));
}

function renderActiveBattle() {
  const panel = $("panel");
  const session = S.battleSession;
  const target = TERRITORY_DEFS[session.targetId];
  const enemyFaction = S.territories[session.targetId].owner;
  const enemyCommander = defenderLeader(S, session.targetId);
  const playerLeaders = session.leaderIds.map(id => commanderById(S, id)).filter(Boolean);
  const options = stageOptions(S, session);
  const stageName = ["接近敌军", "正面交战", "最后阶段"][session.stage];
  const marker = clamp(50 + session.momentum / 2, 1, 99);
  const situation = battleSituation(session);
  const phaseNames = ["接近敌军", "正面交战", "最后阶段"];
  panel.innerHTML = `<section class="battle-session"><div class="battle-visual" style="background-image:url('${battleBackground(session.targetId)}')"><div class="battle-unit-row">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<span class="battle-unit-chip">${glyphSvg(type)}<span>${unit.short}</span><b>${session.composition[type] || 0}</b></span>`).join("")}</div><div class="battle-commanders"><div class="commander-side" style="--crest-color:${FACTIONS.player.color}"><span class="crest">${crestSvg("player", FACTIONS.player.name)}</span><div><b>${playerLeaders.map(o => esc(o.name)).join("、")}</b><small>${FACTIONS.player.name} · ${compositionText(session.composition)}</small></div></div><div class="commander-side enemy" style="--crest-color:${FACTIONS[enemyFaction].color}"><span class="crest">${crestSvg(enemyFaction, FACTIONS[enemyFaction].name)}</span><div><b>${esc(enemyCommander?.name || FACTIONS[enemyFaction].name)}</b><small>${target.name} · 守军 ${S.territories[session.targetId].guard}</small></div></div></div></div><div class="battle-session-head"><span class="eyebrow">CAMPAIGN IN PROGRESS · ${esc(target.terrain)}</span><h2>${target.name}之战 · ${stageName}</h2><div class="battle-timeline">${phaseNames.map((name, index) => `<span class="battle-phase ${index < session.stage ? "done" : index === session.stage ? "active" : ""}"><i>${index + 1}</i>${name}</span>`).join("")}</div><div class="stat-chips"><span>出征 ${session.troops}</span><span>${compositionText(session.composition)}</span><span>损失 ${compositionText(session.lossesByType || {})}</span><span>${PLANS[session.plan].name}</span></div><div class="momentum-label"><span>我军劣势</span><b>${battleMomentumText(session.momentum)}</b><span>我军优势</span></div><div class="momentum-track"><i style="left:${marker}%"></i></div></div><div class="battle-situation"><b>战况推演 · ${situation.title}</b><p>${situation.text}</p></div>
    <div class="battle-stage-list">${session.history.length ? session.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("") : `<div class="empty-state">两军尚未接触。请选择第一道军令。</div>`}</div>
    <div class="battle-choices"><h3>${stageName}：选择军令</h3><div class="choice-stack">${options.map(o => `<button class="stage-choice" data-stage-choice="${o.id}"><b>${esc(o.name)}</b><small>${esc(o.by)} · ${esc(o.desc)}</small><em>${battleChoiceHint(o)}</em></button>`).join("")}</div></div></section>`;
  panel.querySelectorAll("[data-stage-choice]").forEach(button => button.addEventListener("click", () => {
    applyBattleChoice(S, button.dataset.stageChoice);
    saveGame();
    renderAll();
    if (!S.battleSession) pumpDecision();
  }));
}

function battleBackground(targetId) {
  const tags = TERRITORY_DEFS[targetId]?.terrainTags || [];
  if (tags.includes("capital")) return "assets/battle-capital.webp";
  if (tags.includes("plains")) return "assets/battle-plains.webp";
  if (tags.includes("forest")) return "assets/battle-forest.webp";
  if (tags.includes("mountain")) return "assets/battle-mountain.webp";
  if (tags.includes("river")) return "assets/battle-river.webp";
  return "assets/battle-plains.webp";
}

function renderLastBattle(report) {
  const label = report.outcome === "win" ? "胜利" : report.outcome === "retreat" ? "撤退" : "战败";
  const lossText = report.lossesByType ? `（${compositionText(report.lossesByType)}）` : "";
  const costText = report.garrisoned ? ` · 抽调${report.garrisoned}人驻守` : report.lostGold || report.lostGrain ? ` · 丢失${report.lostGold || 0}金币和${report.lostGrain || 0}粮食` : "";
  return `<div class="section-head"><h2>上一场战报</h2><span>${label}</span></div><div class="battle-session"><div class="battle-result"><span class="eyebrow">战斗结果 · AFTER ACTION REPORT</span><strong>${label}</strong><p>${esc(report.targetName)} · 我军损失${report.losses}人${lossText} · 敌军约损失${report.enemyLoss}人${costText}${report.injured?.length ? ` · ${esc(report.injured.join("、"))}负伤` : ""}</p></div><div class="battle-stage-list">${report.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("")}</div></div>`;
}

function talkOfficer(id) {
  if (rejectDuringBattle(S)) return false;
  const o = officer(S, id);
  if (!o || o.side !== "player" || o.id === "player" || S.gold < 3) { toast("需要3金币"); return; }
  S.gold -= 3;
  const gain = 4;
  o.loyalty = clamp(o.loyalty + gain);
  o.grievance = clamp(o.grievance - 5);
  S.lastAction = { name: `召见${o.name}`, text: `花费3金币安排私宴与赏赐。忠诚 +${gain}，不满 −5。` };
  log(S, "info", `你在私室召见${o.name}，听取了他对领地近况的意见。`);
  saveGame(); renderAll();
}

function recruitOfficer(id) {
  if (rejectDuringBattle(S)) return false;
  const candidate = officer(S, id);
  const job = getRunningJob(S, `officer:${id}`);
  const cost = candidate?.recruitCost || 0;
  if (!candidate || !candidate.recruitable || candidate.side !== "neutral" || job || S.gold < cost) {
    toast(job ? "这名领主正在考虑你的封赏" : `招募需要${cost}金币`);
    return false;
  }
  S.gold -= cost;
  const record = startJob(S, {
    type: "OFFICER_RECRUIT", startedAt: Date.now(), durationMs: JOB_CONFIG.OFFICER_RECRUIT.durationMs,
    queueKey: `officer:${id}`, payload: { officerId: id, startingLoyalty: candidate.loyalty }
  });
  S.lastAction = { name: "领主招募排队", text: `${candidate.name}接受你的封赏，预计${formatDuration(JOB_CONFIG.OFFICER_RECRUIT.durationMs)}后抵达渡鸦堡。` };
  log(S, "info", S.lastAction.text);
  saveGame(); renderAll();
  return !!record;
}

function knightAction(id, actionId, state = S) {
  if (!state || rejectDuringBattle(state)) return false;
  const knight = knightById(state, id);
  if (!knight || getRunningJob(state, `knight:${id}`)) return false;
  const allowed = {
    recruit: knight.status === "available" && knight.side === "neutral",
    surrender: knight.status === "captured" && knight.side !== "player",
    execute: knight.status === "captured" && knight.side !== "player",
    release: knight.status === "captured" || (knight.status === "active" && knight.side === "player")
  };
  if (!allowed[actionId]) return false;
  const cost = actionId === "recruit" ? knight.recruitCost : actionId === "surrender" ? 4 : 0;
  if (state.gold < cost) { if (state === S) toast(`需要${cost}金币`); return false; }
  state.gold -= cost;
  const job = startJob(state, {
    type: "KNIGHT_ACTION", startedAt: Date.now(), durationMs: JOB_CONFIG.KNIGHT_RECRUIT.durationMs,
    queueKey: `knight:${id}`, payload: { knightId: id, actionId, loyalty: actionId === "surrender" ? 42 : 58, gold: cost }
  });
  if (job) {
    knight.status = actionId === "recruit" ? "recruiting" : actionId === "surrender" ? "negotiating" : "processing";
    state.lastAction = { name: actionId === "recruit" ? "招募骑士排队" : actionId === "surrender" ? "招降骑士排队" : actionId === "execute" ? "处死骑士排队" : "释放骑士排队", text: `${knight.name}将在${formatDuration(job.endAt - job.startedAt)}后完成处理。` };
    log(state, "info", state.lastAction.text);
    if (state === S) { saveGame(); renderAll(); }
  }
  return !!job;
}

function knightCard(knight) {
  const job = getRunningJob(S, `knight:${knight.id}`);
  const status = knight.status === "active" ? "我方骑士" : knight.status === "captured" ? "俘虏" : knight.status === "available" ? "待招募" : knight.status === "gone" || knight.status === "executed" ? "已离场" : knight.status === "released" ? "已释放" : "处理中";
  const buttons = [];
  if (knight.status === "available" && knight.side === "neutral") buttons.push(`<button class="secondary-btn" data-knight-action="recruit" data-knight-id="${knight.id}" ${job || S.gold < knight.recruitCost ? "disabled" : ""}>${job ? `处理中 · ${formatDuration(getJobRemainingMs(job))}` : `招募 · ${knight.recruitCost}金`}</button>`);
  if (knight.status === "captured") {
    buttons.push(`<button class="secondary-btn" data-knight-action="surrender" data-knight-id="${knight.id}" ${job || S.gold < 4 ? "disabled" : ""}>招降 · 4金</button>`);
    buttons.push(`<button class="danger-btn" data-knight-action="execute" data-knight-id="${knight.id}" ${job ? "disabled" : ""}>处死</button>`);
  }
  if (knight.status === "active" || knight.status === "captured") buttons.push(`<button class="ghost-btn" data-knight-action="release" data-knight-id="${knight.id}" ${job ? "disabled" : ""}>释放</button>`);
  return `<article class="knight-card"><div class="knight-mark">骑</div><div class="card-copy"><div class="role-line"><h3>${esc(knight.name)}</h3><span>${status}</span></div><p>无立绘骑士 · 武力${knight.force} · 谋略${knight.scheme || 45}</p><div class="knight-actions">${buttons.join("")}</div></div></article>`;
}

function renderCourt() {
  const panel = $("panel");
  const own = ownedOfficers(S);
  const others = S.officers.filter(o => !["player", "gone"].includes(o.side));
  const candidates = others.filter(o => o.recruitable && o.side === "neutral");
  const enemies = others.filter(o => ["wolf", "river", "crown"].includes(o.side));
  const locked = others.filter(o => o.side === "locked");
  const averageLoyalty = own.length > 1 ? Math.round(own.filter(o => o.id !== "player").reduce((sum, o) => sum + o.loyalty, 0) / (own.length - 1)) : 100;
  const knights = S.knights || [];
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">COMMANDERS & KNIGHTS</span><h2>将领与骑士</h2><p>有立绘的人物是领主，负责封地与政务；无立绘人物是骑士，负责带领军团。只有加入你的骑士，才会出现在军队编制里。</p>${metrics([[own.length, "我方领主"], [activeKnights(S).length, "我方骑士"], [averageLoyalty, "平均忠诚"], [own.filter(o => o.fief).length, "已封领地"]])}</section>
    <div class="section-head"><h2>我方领主</h2><span>治理封地、处理忠诚，不再直接占用军团指挥位</span></div><div class="officer-grid">${own.map(o => `<div class="officer-slot">${officerCard(o)}</div>`).join("")}</div>
    <div class="section-head"><h2>可招募领主</h2><span>金币预扣，招募需要${formatDuration(JOB_CONFIG.OFFICER_RECRUIT.durationMs)}</span></div><div class="officer-grid">${candidates.length ? candidates.map(o => { const job = getRunningJob(S, `officer:${o.id}`); const label = job ? `<span data-job-countdown="${job.id}" data-job-prefix="招募中 · ">招募中 · ${formatDuration(getJobRemainingMs(job))}</span>` : `招募 · ${o.recruitCost}金`; return `<div class="officer-slot">${officerCard(o, true)}<button class="secondary-btn" data-recruit-officer="${o.id}" ${job || S.gold < o.recruitCost ? "disabled" : ""}>${label}</button></div>`; }).join("") : `<div class="empty-state">当前没有可招募的领主。</div>`}</div>
    <div class="section-head"><h2>骑士名册</h2><span>${activeKnights(S).length}名在列 · ${availableKnights(S).length}名可招募 · 俘虏可处置</span></div><div class="knight-grid">${knights.filter(k => !["gone", "executed", "released"].includes(k.status)).map(knightCard).join("") || `<div class="empty-state">暂时没有可处理的骑士。</div>`}</div>
    <div class="section-head"><h2>敌方领主</h2><span>可在战场击败、招降或迫使其离场</span></div><div class="officer-grid">${enemies.length ? enemies.map(o => officerCard(o, true)).join("") : `<div class="empty-state">北境已经没有仍举着敌旗的领主。</div>`}</div>
    ${locked.length ? `<div class="section-head"><h2>尚未归附</h2><span>${locked.length}名领主仍在观望</span></div><div class="empty-state">占领新的城堡或接受敌方领主投降后，才能解锁新的领主。</div>` : ""}`;
  panel.querySelectorAll("[data-recruit-officer]").forEach(button => button.addEventListener("click", () => recruitOfficer(button.dataset.recruitOfficer)));
  panel.querySelectorAll("[data-knight-action]").forEach(button => button.addEventListener("click", () => knightAction(button.dataset.knightId, button.dataset.knightAction)));
}

function renderChronicle() {
  const panel = $("panel");
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE CHRONICLE</span><h2>复国编年史</h2><p>这里记录建设、侦察、封赏、战争和重大事件。</p>${metrics([[S.battles, "出征次数"], [S.wins, "胜场"], [S.casualties, "累计伤亡"], [ownTerritoryIds(S).length, "控制领地"]])}</section>
    <div class="section-head"><h2>渡鸦家编年史</h2><span>最近120条</span></div><div class="chronicle">${S.log.map(item => `<article class="log-row"><time>第${Math.floor(item.turn / 4) + 1}年 · ${SEASONS[item.turn % 4].name}</time><div><b>${item.kind === "good" ? "进展" : item.kind === "bad" ? "损失" : item.kind === "warn" ? "警示" : "记录"}</b><p>${cleanDisplayText(item.text)}</p></div></article>`).join("")}</div>`;
}

function endingCopy(s) {
  const style = currentStyle(s);
  if (s.endingReason === "fallen") return { title: "渡鸦堡陷落", text: "清晨，敌军从东门进入渡鸦堡。城墙上的守军已经不足一队，渡鸦旗在午前被扯下。" };
  if (s.endingReason === "collapsed") return { title: "领地崩溃", text: "没有敌军攻破城墙。军饷拖欠后，士兵先散去；冬粮见底后，村民开始逃亡。最后一次议事，没有家臣到场。" };
  if (s.endingReason === "minor_lord") return { title: "守住渡鸦堡", text: "十二年结束时，渡鸦堡仍在你手中。你没有得到铁冠，但城墙得到了修补，四个村庄也熬过了最后一个冬天。" };
  if (s.endingReason === "great_lord") return { title: "北境大领主", text: "十二年结束时，你已控制北境大半土地。王冠谷仍由摄政公爵占据，但王室的税吏和使者已经不敢绕过渡鸦堡行事。" };
  if (style === "oath") return { title: "守信领主统一北境", text: "王冠谷陷落后，旧领主、村镇代表和渡鸦家的功臣在大厅宣誓效忠。你曾答应保留的土地、旧规矩和封赏，大多得到了兑现。" };
  if (style === "iron") return { title: "强硬领主统一北境", text: "最后一面敌旗落下后，各地守军被重新编制，税册和军令统一送往渡鸦堡。北境很少再发生公开反抗，城堡地牢却始终没有空过。" };
  return { title: "经营领主统一北境", text: "战争结束后，七领使用了同一套税册和度量。商路重新开放，磨坊和集市按季向渡鸦堡纳税，你的金库足以维持一支常备军。" };
}

function endingVisual(s) {
  if (s.endingReason === "fallen") return { src: "assets/battle-capital.webp", alt: "陷落的渡鸦堡", cls: "ending-fallen" };
  if (s.endingReason === "collapsed") return { src: "assets/oswin.webp", alt: "领地崩溃后的大厅", cls: "ending-collapsed" };
  if (s.endingReason === "minor_lord") return { src: "assets/player.webp", alt: "守住渡鸦堡的领主", cls: "ending-minor" };
  if (s.endingReason === "great_lord") return { src: "assets/northern-march-map.webp", alt: "北境领地图", cls: "ending-great" };
  return { src: "assets/player.webp", alt: "戴上铁冠的北境之主", cls: `ending-unified ending-${currentStyle(s)}` };
}

function showEnding(s) {
  if (typeof document === "undefined") return;
  $("menu").classList.add("hidden");
  $("creator").classList.add("hidden");
  $("prologue").classList.add("hidden");
  $("game").classList.add("hidden");
  $("modalMask").classList.add("hidden");
  $("ending").classList.remove("hidden");
  ["ending-fallen", "ending-collapsed", "ending-minor", "ending-great", "ending-unified", "ending-oath", "ending-iron", "ending-wealth"].forEach(cls => $("ending").classList.remove(cls));
  resetPageScroll();
  const copy = endingCopy(s);
  const visual = endingVisual(s);
  $("ending").classList.add(...visual.cls.split(" "));
  $("endingPortrait").src = visual.src;
  $("endingPortrait").alt = visual.alt;
  const victory = s.endingReason === "unified";
  $("endingBody").innerHTML = `<span class="eyebrow">${victory ? "THE IRON CROWN" : "THE CHRONICLE CLOSES"}</span><h1>${copy.title}</h1><div class="story-body"><p>${copy.text}</p><p class="ending-style"><b>本局统治风格：${STYLES[currentStyle(s)].short}</b></p></div><div class="ending-stats"><div><b>${Math.min(s.turn + 1, MAX_TURNS)}</b><span>经过季度</span></div><div><b>${ownTerritoryIds(s).length}</b><span>最终领地</span></div><div><b>${s.wins}</b><span>胜场</span></div><div><b>${ownedOfficers(s).length}</b><span>最终家臣</span></div></div><button id="endingRestart" class="primary-btn" type="button">重新继承渡鸦堡</button>`;
  $("endingRestart").addEventListener("click", () => {
    if (confirm("删除当前存档并重新开始？")) { deleteSave(); S = null; showMenu(); }
  });
}

function showMenu() {
  $("creator")?.classList.add("hidden");
  $("prologue")?.classList.add("hidden");
  $("game")?.classList.add("hidden");
  $("ending")?.classList.add("hidden");
  $("modalMask")?.classList.add("hidden");
  $("menu")?.classList.remove("hidden");
  resetPageScroll();
  const saved = loadGame();
  const button = $("continueBtn");
  if (saved) {
    button.classList.remove("hidden");
    button.textContent = saved.ended ? `查看结局 · ${saved.playerName}` : `继续 · 第${yearOf(saved)}年${seasonOf(saved).name}季`;
  } else button.classList.add("hidden");
}

function showCreator() {
  $("menu").classList.add("hidden");
  $("creator").classList.remove("hidden");
  resetPageScroll();
}

function renderPrologue() {
  const slide = PROLOGUE[prologueIndex];
  $("prologuePortrait").src = slide.portrait;
  $("prologuePortrait").alt = slide.title;
  $("prologueKicker").textContent = slide.kicker;
  $("prologueTitle").textContent = slide.title;
  $("prologueBody").innerHTML = slide.body.map(p => `<p>${esc(p)}</p>`).join("");
  $("prologueProgress").style.width = `${(prologueIndex + 1) / PROLOGUE.length * 100}%`;
  $("nextPrologueBtn").innerHTML = prologueIndex === PROLOGUE.length - 1 ? "进入议事厅 <span>→</span>" : "继续 <span>→</span>";
  resetPageScroll();
}

function showGame() {
  if (!S) { showMenu(); return; }
  const check = selfCheck(S);
  if (!check.ok && typeof console !== "undefined") console.warn("[iron-crown selfCheck]", check.errors);
  saveGame();
  renderAll();
  pumpDecision();
  resetPageScroll();
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
}

function resetPageScroll() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  });
}

function lockZoom() {
  ["gesturestart", "gesturechange", "gestureend"].forEach(type => document.addEventListener(type, event => event.preventDefault(), { passive: false }));
  ["touchstart", "touchmove"].forEach(type => document.addEventListener(type, event => { if (event.touches?.length > 1) event.preventDefault(); }, { passive: false }));
  document.addEventListener("wheel", event => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
  document.addEventListener("dblclick", event => event.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener("touchend", event => {
    const now = Date.now();
    if (now - lastTouchEnd < 280) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

function startWorldClock() {
  if (worldTimer) clearInterval(worldTimer);
  worldTimer = setInterval(() => updateWorldTime(Date.now()), TIME_CONFIG.uiTickMs);
}

function boot() {
  lockZoom();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else {
      const resumedAt = Date.now();
      const offlineSeasons = hiddenAt && S ? catchUpOffline(S, resumedAt) : 0;
      hiddenAt = 0;
      if (offlineSeasons && S && !S.ended) {
        renderAll();
        pumpDecision();
      } else updateWorldTime(resumedAt);
    }
  });
  $("newGameBtn")?.addEventListener("click", showCreator);
  $("continueBtn")?.addEventListener("click", () => { S = loadGame(); showGame(); });
  $("difficultyPicker")?.querySelectorAll("[data-difficulty]").forEach(button => button.addEventListener("click", () => {
    creatorDifficulty = button.dataset.difficulty;
    $("difficultyPicker").querySelectorAll("button").forEach(other => other.classList.toggle("active", other === button));
  }));
  $("startGameBtn")?.addEventListener("click", () => {
    S = createInitialState($("playerName").value, "oath", creatorDifficulty);
    prologueIndex = 0;
    $("creator").classList.add("hidden");
    $("prologue").classList.remove("hidden");
    renderPrologue();
  });
  $("nextPrologueBtn")?.addEventListener("click", () => {
    if (prologueIndex < PROLOGUE.length - 1) { prologueIndex++; renderPrologue(); }
    else showGame();
  });
  $("gameNav")?.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    if (!S) { showMenu(); return; }
    if (S.battleSession && button.dataset.tab !== "campaign") { rejectDuringBattle(S); return; }
    S.tab = button.dataset.tab;
    saveGame();
    renderAll();
    resetPageScroll();
  }));
  $("saveBtn")?.addEventListener("click", () => { if (saveGame()) toast("进度已保存在本机"); });
  $("restartBtn")?.addEventListener("click", () => {
    if (confirm("删除当前存档并重新开始？")) { deleteSave(); S = null; showMenu(); }
  });
  showMenu();
  startWorldClock();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createInitialState, hydrateState, seasonOf, forecast, resourceFlow, accrueResources, territoryOutput, buildingCost, BUILDINGS, BUILDING_MAX_LEVEL,
    attackableTerritories, battleEstimate, startBattle, stageOptions, applyBattleChoice,
    finishBattle, enemyPressure, runAiTurn, startMarch, marchDurationForDistance, territoryDistance, decisionView, subjects, TERRITORY_DEFS, playableTerritoryIds, LORD_DEFS, LORD_ARCHETYPES, SEAT_TO_LORD, lordAt, lordHoldings, lordVassals,
    SEASONS, PLANS, UNIT_DEFS, clamp, armyTotal, syncTroops,
    selectedComposition, compositionPower, campaignSupply, allocateLosses, recruitAmount, canRecruitUnit, unitLevel, unitEquipment, counterMultiplier, defenderComposition, knightBattleMultiplier,
    settleSeasonEconomy, casualtyForecast, queueSeasonEvents, WORLD_EVENTS, NPC_ARCS,
    applyEventEffects, handleOfficerPolitics, interactionLocked, advanceSeason, checkDefeat,
    enemyGuardCap, battleRiskClass, crownRequirements, crownAccessMet, crownRequirementText, VERSION, TIME_CONFIG, JOB_CONFIG, TECH_DEFS,
    initClock, updateWorldTime, processCompletedJobs, startJob, cancelJob, finishJob,
    getQueueUsage, getRunningJob, getJobRemainingMs, queueRecruitment, queueResearch, canResearch, techCompleted, techLevel, techCost, researchDuration, activeKnights, knightAction, armyEntity, playerArmies, createArmyFromMain, disbandArmy, startArmyGroupMarch, armyGroupComposition, commanderById, armyCommander, ensureAIFactions, recruitmentTerritoryId, deployGarrison, pauseWorld, resumeWorld, catchUpOffline, advanceSeasonAuto, migrateV1ToV2,
    migrateSave, selfCheck, cityAction, cityActionOptions, cityActionAvailable, CITY_ACTION_DEFS, recruitOfficer
  };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
