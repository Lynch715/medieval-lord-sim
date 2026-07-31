"use strict";

const SAVE_KEY = "iron-crown-lord-save-v1";
const VERSION = 1;
const MAX_TURNS = 48;
const CROWN_OPEN_TURN = 24;
const CAMPAIGN_AP_COST = 2;

const SEASONS = [
  { id: "spring", name: "春", phase: "春耕", grain: .45, gold: 1, note: "土地解冻，适合开垦与整顿村庄。" },
  { id: "summer", name: "夏", phase: "备战", grain: .75, gold: 1, note: "道路畅通，是训练和远征的好时节。" },
  { id: "autumn", name: "秋", phase: "收获", grain: 1.55, gold: 1.25, note: "麦仓最充盈，也是王室催税的时候。" },
  { id: "winter", name: "冬", phase: "越冬", grain: .1, gold: .75, note: "军队和百姓都在消耗你此前的积蓄。" }
];

const OATHS = {
  oath: { name: "守誓之人", short: "守誓", desc: "许下的承诺会成为你的力量，也会成为你的债。" },
  iron: { name: "铁腕之主", short: "铁腕", desc: "恐惧能让命令更快抵达，但不能让人忘记代价。" },
  wealth: { name: "富国之手", short: "富国", desc: "金币修得起城墙，也买不来所有人的忠诚。" }
};

const DIFFICULTIES = {
  standard: { name: "领主", income: 1, enemy: 1, winter: 1 },
  hard: { name: "乱世", income: .9, enemy: 1.16, winter: 1.18 },
  brutal: { name: "铁与血", income: .82, enemy: 1.32, winter: 1.38 }
};

const FACTIONS = {
  player: { name: "渡鸦家", color: "#c7a665" },
  wolf: { name: "狼牙氏族", color: "#9c5045" },
  river: { name: "河望伯领", color: "#66846f" },
  crown: { name: "摄政公爵", color: "#77879a" }
};

const TERRITORY_DEFS = {
  ravenstone: { name: "渡鸦堡", owner: "player", terrain: "丘陵城堡", gold: 10, grain: 34, people: 218, guard: 46, stability: 66, final: false, adj: ["ashfield", "pineford"], desc: "你的祖堡与四个贫穷村庄。城墙还在，屋顶却一直漏雨。" },
  ashfield: { name: "灰麦原", owner: "wolf", terrain: "开阔农田", gold: 7, grain: 38, people: 142, guard: 34, stability: 61, final: false, adj: ["ravenstone", "pineford", "crossford"], desc: "北境最肥沃的麦地。谁占住这里，谁就不怕下一个冬天。" },
  pineford: { name: "松林渡", owner: "wolf", terrain: "密林河渡", gold: 8, grain: 22, people: 96, guard: 39, stability: 69, final: false, adj: ["ravenstone", "ashfield", "highpass"], desc: "商道穿过密林与浅滩，狼牙氏族在树后布满哨所。" },
  highpass: { name: "北境关", owner: "wolf", terrain: "山地要塞", gold: 6, grain: 13, people: 72, guard: 54, stability: 76, final: false, adj: ["pineford", "crownvale"], desc: "扼守山口的石堡。难攻，却能挡住整个北方的袭扰。" },
  crossford: { name: "十字渡", owner: "river", terrain: "河谷集市", gold: 15, grain: 18, people: 116, guard: 38, stability: 72, final: false, adj: ["ashfield", "riverwatch", "crownvale"], desc: "两条商路在此交汇。这里的税吏比守军更让商人害怕。" },
  riverwatch: { name: "河望城", owner: "river", terrain: "河畔石城", gold: 14, grain: 24, people: 138, guard: 49, stability: 78, final: false, adj: ["crossford", "crownvale"], desc: "艾芙琳伯爵的坚城。城下水网密布，骑兵难以展开。" },
  crownvale: { name: "王冠谷", owner: "crown", terrain: "公爵王城", gold: 23, grain: 28, people: 186, guard: 68, stability: 82, final: true, adj: ["highpass", "crossford", "riverwatch"], desc: "摄政公爵把铁冠锁在这里。只有统一六领的人才有资格叩门。" }
};

const OFFICER_DEFS = {
  player: { name: "罗恩", title: "领主", portrait: "assets/player.webp", side: "player", stats: { force: 68, command: 65, scheme: 60, govern: 58, charm: 67 }, trait: "亲临阵前", traitText: "随军时军心不会低于45；你的选择会决定家族最终的统治方式。", loyalty: 100, ambition: 55 },
  oswin: { name: "奥斯温·维尔", title: "老管家", portrait: "assets/oswin.webp", side: "player", stats: { force: 27, command: 51, scheme: 78, govern: 88, charm: 69 }, trait: "旧账如山", traitText: "主持领地时收入更稳定；拒绝他的越冬警告会积累怨气。", loyalty: 76, ambition: 18 },
  renard: { name: "雷纳德·霍尔特", title: "骑士长", portrait: "assets/renard.webp", side: "player", stats: { force: 86, command: 83, scheme: 43, govern: 31, charm: 47 }, trait: "破阵者", traitText: "强攻和骑兵冲击更有力；占尽优势后撤退会激怒他。", loyalty: 70, ambition: 48 },
  ysabel: { name: "伊莎贝尔·马伦", title: "财政官", portrait: "assets/ysabel.webp", side: "player", stats: { force: 30, command: 48, scheme: 80, govern: 92, charm: 72 }, trait: "精确到一粒麦", traitText: "随军可降低补给与撤退损失；主持财税能减少盘剥。", loyalty: 68, ambition: 34 },
  edmund: { name: "埃德蒙·维恩", title: "私生表兄", portrait: "assets/edmund.webp", side: "player", stats: { force: 74, command: 76, scheme: 69, govern: 57, charm: 84 }, trait: "另一种继承", traitText: "伏击和招降能力出众；功劳越高，越希望得到自己的封地。", loyalty: 61, ambition: 82 },
  aveline: { name: "艾芙琳·多尔", title: "河望伯爵", portrait: "assets/aveline.webp", side: "river", stats: { force: 71, command: 80, scheme: 75, govern: 74, charm: 78 }, trait: "河地之主", traitText: "熟悉河谷作战与治理。若被逼到绝境，她会选择一个值得效忠的人。", loyalty: 52, ambition: 65 },
  bran: { name: "布兰·狼牙", title: "氏族战首", portrait: "assets/bran.webp", side: "wolf", stats: { force: 92, command: 80, scheme: 41, govern: 37, charm: 61 }, trait: "只服强者", traitText: "森林和山地作战极强；只会向正面击败自己的人低头。", loyalty: 48, ambition: 58 }
};

const BUILDINGS = {
  fields: { name: "农田与磨坊", base: 15, desc: "每级提高领地粮食产量，并缓解冬季缺粮。" },
  market: { name: "集市与商栈", base: 18, desc: "每级提高金币收入，但低稳定时更容易被劫掠。" },
  barracks: { name: "兵营与铁匠铺", base: 21, desc: "每级提高守军，并让本领征兵更便宜。" },
  walls: { name: "城墙与塔楼", base: 26, desc: "每级强化守城，是抵挡反攻的最后一道保险。" }
};

const PLANS = {
  assault: { name: "正面强攻", desc: "平原与骑士冲阵最强；突破快，但连续冒进仍会被反制。", mult: 1.12, casualty: 1.08 },
  steady: { name: "稳扎稳打", desc: "保存队列和人手，胜算稳定，突破能力较弱。", mult: .94, casualty: .72 },
  ambush: { name: "迂回伏击", desc: "依赖谋略，只在森林与山地获得完整优势。", mult: .92, casualty: .78 },
  parley: { name: "攻心劝降", desc: "正面战力最低；先打出优势后可减少伤亡与驻军压力。", mult: .86, casualty: .52 }
};

const UNIT_DEFS = {
  levy: { name: "长矛兵", short: "矛", gold: 10, grain: 6, amount: 8, desc: "便宜的盾墙骨架，适合守城和补充驻军，长期征发会拖累粮仓。" },
  archers: { name: "弓箭手", short: "弓", gold: 12, grain: 5, amount: 6, desc: "森林、山地和河谷的主力，并能解锁低伤亡箭雨。" },
  knights: { name: "披甲骑士", short: "骑", gold: 18, grain: 7, amount: 4, desc: "平原与强攻的破阵核心，昂贵但更不容易出现在伤亡名单里。" }
};

const POLICIES = {
  balanced: { name: "常例治理", gold: 1, grain: 1, desc: "不额外压榨，也不额外减免。" },
  relief: { name: "轻徭休养", gold: .76, grain: .96, desc: "少收税换稳定，每季稳定与民心恢复。" },
  extract: { name: "加征赋税", gold: 1.3, grain: 1, desc: "迅速增加金币，但每季损耗稳定。" },
  garrison: { name: "军屯边防", gold: .82, grain: .88, desc: "牺牲产出换守军恢复，适合新边境。" }
};

const MAP_POINTS = {
  ravenstone: [18, 56], ashfield: [47, 49], pineford: [28, 25], highpass: [53, 15],
  crossford: [44, 79], riverwatch: [72, 77], crownvale: [81, 42]
};
const MAP_LINKS = [
  ["ravenstone", "ashfield"], ["ravenstone", "pineford"], ["ashfield", "pineford"],
  ["ashfield", "crossford"], ["pineford", "highpass"], ["highpass", "crownvale"],
  ["crossford", "riverwatch"], ["crossford", "crownvale"], ["riverwatch", "crownvale"]
];

const PROLOGUE = [
  { kicker: "序章 · 雨夜继承", title: "葬钟响到第三次时，城门外已经站满债主", portrait: "assets/oswin.webp", body: ["你的父亲死在南方远征的归途上，没有荣耀，也没有带回战利品。", "老管家奥斯温把一串生锈的钥匙、一枚铁制印戒和王室催税令摆在桌上。渡鸦堡从此属于你——包括它欠下的一切。"] },
  { kicker: "第一封战书", title: "邻人没有给新领主留下哀悼的时间", portrait: "assets/bran.webp", body: ["北边的布兰·狼牙已经占了灰麦原。他让信使带来一句话：老渡鸦死了，小渡鸦最好学会低头。", "骑士长雷纳德握紧剑柄。财政官伊莎贝尔却提醒你，仓里的粮只够撑过一个坏冬天。"] },
  { kicker: "第一年 · 春", title: "王座还很远，先让村庄活过今年", portrait: "assets/player.webp", body: ["你必须决定先修田、征税、募兵还是安抚家臣。每个季度只有三次重要行动。", "土地能带来粮食和金币，也会带来要安置的百姓、要封赏的功臣与下一场战争。"] }
];

const WORLD_EVENTS = [
  { id: "spring_flood", kicker: "泥水越过田埂", title: "上游决堤，三座村庄都在抢最后一批木料", portrait: "assets/oswin.webp", body: "水淹进播种后的田地。现在救田能保住收成，救桥能保住商路，什么都不救则能保住国库。", options: [
    ["先保住田地", "金币 −12，粮食 +10，民心 +3", { gold: -12, grain: 10, support: 3 }, "领主的木料先送进了田间。"],
    ["重修商桥", "立即净支出金币 −7，威望 +2", { gold: -7, renown: 2 }, "商队在新桥上重新排起长队。"],
    ["让各村自己想办法", "金币不变；最低稳定 −8，民心 −5", { stabilityWeak: -8, support: -5 }, "洪水退去后，村民记住了城堡没有来人。"] ] },
  { id: "summer_drought", kicker: "旱风吹过麦田", title: "井水降到绳索也够不到的地方", portrait: "assets/ysabel.webp", body: "牲畜和人开始共用一条浑水沟。再等一个月也许会下雨，也许不会。", options: [
    ["买水车和外地粮", "金币 −18，粮食 +12，民心 +5", { gold: -18, grain: 12, support: 5 }, "运水车日夜进出城门。"],
    ["军队先减口粮", "粮食 +8，军心 −7，战争疲劳 +5", { grain: 8, morale: -7, warWeariness: 5 }, "军营的锅里只剩稀粥。"],
    ["维持原有配给", "粮食 −15，稳定 −3", { grain: -15, stabilityAll: -3 }, "粮仓替天空付了这笔账。"] ] },
  { id: "autumn_mice", kicker: "仓墙里的窸窣声", title: "新粮入仓时，老鼠也一起搬了进去", portrait: "assets/oswin.webp", body: "守仓人说只损了一角，伊莎贝尔却在账上找到了连续三年的相同说法。", options: [
    ["拆仓灭鼠", "金币 −10，粮食 −4，民心 +2", { gold: -10, grain: -4, support: 2 }, "旧仓墙被拆开，里面不只有鼠洞。"],
    ["处罚守仓人", "正统 +2，粮食 −9，民心 −2", { legitimacy: 2, grain: -9, support: -2 }, "两个守仓人被戴上木枷。"],
    ["封仓熏蒸，认下损失", "无需额外物资；最低稳定 −5，民心 −3", { stabilityWeak: -5, support: -3 }, "粮仓被封了三天。账本合上了，鼠声暂时停了。"] ] },
  { id: "winter_fever", kicker: "冬营里的咳嗽", title: "热病从伤兵棚传进了下城", portrait: "assets/renard.webp", body: "军医要酒、干净布匹和隔离营。商人说这些东西现在都值三倍价钱。", options: [
    ["照军医说的办", "金币 −17，粮食 −6，军心 +5", { gold: -17, grain: -6, morale: 5 }, "病棚外终于有了守卫和干净的水。"],
    ["把病人送去修道院", "金币 −8，民心 −3，军心 +2", { gold: -8, support: -3, morale: 2 }, "雪地上留下了一长串担架印。"],
    ["封住下城", "最低稳定 −7，民心 −8；最低守军 +3", { stabilityWeak: -7, support: -8, guardWeak: 3 }, "城门从里面上了闩。"] ] },
  { id: "wandering_masons", kicker: "来自南方的石匠", title: "一支石匠行会愿意留下，但要免三年人头税", portrait: "assets/ysabel.webp", body: "他们能修城墙、磨坊和桥。城里的老匠人则说，外来者会抢走所有好活。", options: [
    ["给他们特许", "金币 −11，最低守军 +6，民心 +2", { gold: -11, guardWeak: 6, support: 2 }, "石匠的棚屋在城墙下排成一列。"],
    ["让新旧匠人合营", "金币 −16，稳定 +4", { gold: -16, stabilityAll: 4 }, "两拨匠人先吵了三天，然后一起开工。"],
    ["拒绝特许，任其离开", "无需花费；威望 −1", { renown: -1 }, "石匠收起工具南下，城墙仍由旧匠人慢慢修补。"] ] },
  { id: "salt_merchants", kicker: "盐车到城门", title: "商人愿用一车盐换你的一纸护路令", portrait: "assets/ysabel.webp", body: "护路意味着要派兵，也意味着每个冬天都有人把盐送进北境。", options: [
    ["派兵护送", "金币 +13，粮食 +7，战争疲劳 +3", { gold: 13, grain: 7, warWeariness: 3 }, "渡鸦旗第一次跟着盐车走完全程。"],
    ["只收过路税", "金币 +18，民心 −3", { gold: 18, support: -3 }, "税吏数清了硬币，却没数路边的尸体。"],
    ["把护路交给村镇", "金币 +7，稳定 +5", { gold: 7, stabilityAll: 5 }, "沿路村镇自己排出了守夜次序。"] ] },
  { id: "clipped_coin", kicker: "被剪薄的银币", title: "集市上每三枚银币就有一枚缺了边", portrait: "assets/ysabel.webp", body: "拒收会让交易停摆，照收会把坏钱塞满你的金库。", options: [
    ["设官秤统一兑换", "金币 −9，正统 +5，稳定 +2", { gold: -9, legitimacy: 5, stabilityAll: 2 }, "每枚银币都要在官秤上过一次。"],
    ["按重量收税", "金币 +10，民心 −4", { gold: 10, support: -4 }, "商人把缺掉的银边算进了货价。"],
    ["暂时照旧流通", "金币 +5，正统 −4", { gold: 5, legitimacy: -4 }, "坏钱继续从一只手流向另一只手。"] ] },
  { id: "mill_dispute", kicker: "磨坊水闸之争", title: "上游领主磨麦时，下游农田就没有水", portrait: "assets/oswin.webp", body: "双方都拿着旧契约，双方的契约也都是真的。", options: [
    ["限定磨坊时辰", "金币 −5，民心 +6，稳定 +3", { gold: -5, support: 6, stabilityAll: 3 }, "水钟被挂在磨坊门口。"],
    ["支持磨坊主", "金币 +11，民心 −6", { gold: 11, support: -6 }, "磨坊转得更快，下游的田更干。"],
    ["拆掉私设水闸", "军心 +2，最低稳定 −3", { morale: 2, stabilityWeak: -3 }, "士兵用斧头结束了这场争论。"] ] },
  { id: "deserter_band", kicker: "林中的逃兵", title: "一群南方逃兵占了旧猎屋，愿意拿剑换口粮", portrait: "assets/renard.webp", body: "他们有战斗经验，也有丢下旧主的前科。", options: [
    ["编入长矛队", "粮食 −8，长矛兵 +7，军心 −2", { grain: -8, levy: 7, morale: -2 }, "逃兵换了旗帜，却没有换掉眼神。"],
    ["缴械后安置开荒", "粮食 −10，民心 +4，稳定 +2", { grain: -10, support: 4, stabilityAll: 2 }, "七把剑换成了七把锄头。"],
    ["限期离境", "威望 +2，民心 −2", { renown: 2, support: -2 }, "他们在夜里离开，带走了所有能带走的东西。"] ] },
  { id: "forest_rights", kicker: "领主的鹿，村民的柴", title: "巡林人抓住了三个在禁林里设套的孩子", portrait: "assets/oswin.webp", body: "按旧法要砍手。按村民的说法，他们只是想熬过冬天。", options: [
    ["开放枯木与小兽", "民心 +9，正统 −2", { support: 9, legitimacy: -2 }, "禁林第一次立起写着百姓权利的木牌。"],
    ["罚做巡林工役", "稳定 +3，粮食 +5", { stabilityAll: 3, grain: 5 }, "孩子们用一个冬天学会了森林的每条路。"],
    ["照旧法处置", "正统 +4，军心 +2，民心 −9", { legitimacy: 4, morale: 2, support: -9 }, "旧法得到了执行，村庄安静得过分。"] ] },
  { id: "monastery_tithe", kicker: "修道院的旧契", title: "修士拿来一张契约，声称渡鸦家欠了二十年什一税", portrait: "assets/oswin.webp", body: "羊皮纸是真的，签字也是真的。唯一的问题是，欠债的人都已经死了。", options: [
    ["承认旧债", "金币 −20，正统 +8", { gold: -20, legitimacy: 8 }, "修道院的钟为渡鸦家多响了一次。"],
    ["用粮食抵一半", "粮食 −18，正统 +3", { grain: -18, legitimacy: 3 }, "粮车停满了修道院外院。"],
    ["宣布债随人死", "金币不变，威望 +3，正统 −7", { renown: 3, legitimacy: -7 }, "契约被退回时，修士没有祝福你。"] ] },
  { id: "village_wedding", kicker: "一场跨村婚礼", title: "两个结仇三代的村庄想请你做证婚人", portrait: "assets/player.webp", body: "这是一场婚礼，也是一场停战。你带多少礼物去，会决定停战能维持多久。", options: [
    ["带酒和两头牛", "金币 −9，粮食 −5，民心 +8", { gold: -9, grain: -5, support: 8 }, "婚宴一直持续到天亮。"],
    ["只带领主祝福", "正统 +2，稳定 +2", { legitimacy: 2, stabilityAll: 2 }, "没有厚礼，但你的到场足以让两边放下刀。"],
    ["让管家代你出席", "金币 −3，民心 +2", { gold: -3, support: 2 }, "奥斯温替你喝了三杯很差的麦酒。"] ] },
  { id: "minor_heir", kicker: "没有土地的继承人", title: "一个小贵族的遗孤带着族谱来到大厅", portrait: "assets/edmund.webp", body: "族谱能证明他的姓，不能证明他还有多少追随者。收留他，也许是在养一名骑士，也许是在养一场争端。", options: [
    ["收为侍从", "金币 −8，披甲骑士 +1，正统 +2", { gold: -8, knights: 1, legitimacy: 2 }, "年轻人把旧徽记缝在渡鸦黑袍里面。"],
    ["给钱送去修道院", "金币 −12，民心 +2", { gold: -12, support: 2 }, "他离开时仍坚持按贵族礼仪行礼。"],
    ["让他自己证明价值", "威望 +2，家臣怨气 +2", { renown: 2, grievanceAll: 2 }, "大厅里没有人为他让出座位。"] ] },
  { id: "hostage_offer", kicker: "边境上的人质", title: "邻家骑士愿把长子留在渡鸦堡，换取停战和粮食", portrait: "assets/renard.webp", body: "这能让一段边境暂时安静，也会让一个孩子成为账本上的抵押物。", options: [
    ["收下人质，送足粮食", "粮食 −16，最低守军 +5，正统 −2", { grain: -16, guardWeak: 5, legitimacy: -2 }, "边境安静下来，孩子住进了北塔。"],
    ["只签停战，不收人", "粮食 −8，民心 +4，稳定 +2", { grain: -8, support: 4, stabilityAll: 2 }, "停战没有人质担保，只靠双方的脸面。"],
    ["拒绝交易", "军心 +3，威望 +2", { morale: 3, renown: 2 }, "使者把孩子带回了边境。"] ] },
  { id: "border_beacon", kicker: "熄灭的烽火", title: "北边三座烽火台同时没有点灯", portrait: "assets/renard.webp", body: "是守夜人偷懒，还是有人故意让边境失明？雷纳德要求立刻换防。", options: [
    ["彻查并换防", "金币 −10，最低守军 +8，军心 +3", { gold: -10, guardWeak: 8, morale: 3 }, "新守夜人整夜没有合眼。"],
    ["加倍赏金", "金币 −14，稳定 +3", { gold: -14, stabilityAll: 3 }, "烽火重新亮起，原因却没有查清。"],
    ["公开鞭打失职者", "军心 +5，民心 −5", { morale: 5, support: -5 }, "鞭声比烽火传得更远。"] ] },
  { id: "royal_inspector", kicker: "王城来的眼睛", title: "一名王室巡察官要逐页查看你的税册和兵册", portrait: "assets/ysabel.webp", body: "配合会给王城留下好印象，也会暴露你真正拥有多少人和粮。", options: [
    ["打开所有账册", "正统 +9，金币 −8", { legitimacy: 9, gold: -8 }, "巡察官带着整齐的副本离开。"],
    ["准备一套更体面的账", "金币 −13，威望 +3", { gold: -13, renown: 3 }, "伊莎贝尔让每个数字都恰好能解释。"],
    ["以边境战事为由拒绝", "正统 −8，军心 +4", { legitimacy: -8, morale: 4 }, "王室印章在门外等了一整天。"] ] },
  { id: "old_soldiers", kicker: "父亲留下的旧兵", title: "十二名老兵来讨当年远征欠下的军饷", portrait: "assets/renard.webp", body: "他们有人少了手指，有人带着父亲的剑，却没有一人带着欠条。", options: [
    ["连本带息偿还", "金币 −22，军心 +9，威望 +3", { gold: -22, morale: 9, renown: 3 }, "老兵在大厅里第一次称你为真正的领主。"],
    ["用土地工役抵账", "金币 −8，长矛兵 +5，稳定 −2", { gold: -8, levy: 5, stabilityAll: -2 }, "老兵重新列队，但这次旗帜属于你。"],
    ["没有凭证就没有欠款", "金币不变，军心 −9，正统 +2", { morale: -9, legitimacy: 2 }, "他们没有争辩，只是把旧剑带走了。"] ] },
  { id: "blacksmith_guild", kicker: "铁匠行会停锤", title: "铁匠拒绝继续按旧价给军队打箭头和马蹄", portrait: "assets/renard.webp", body: "矿石涨价是真的，铁匠想借战争抬价也是真的。军队等不了太久。", options: [
    ["接受新价", "金币 −17，弓箭手 +4，军心 +3", { gold: -17, archers: 4, morale: 3 }, "铁砧重新响了整夜。"],
    ["给行会一处官营炉", "金币 −23，最低守军 +7，稳定 +2", { gold: -23, guardWeak: 7, stabilityAll: 2 }, "新炉火成了城里最亮的东西。"],
    ["征用铁料", "无需花费；军心 +5，民心 −8，最低稳定 −2", { morale: 5, support: -8, stabilityWeak: -2 }, "士兵搬走铁料时，所有铁匠都停下了手。"] ] }
];

const NPC_ARCS = [
  { id: "oswin_old_debt", officerId: "oswin", minTurn: 2, title: "奥斯温把父亲的另一册旧账放到你面前", body: "册子里没有金币，只有每户村民在饥荒年被多拿走的麦袋数。", options: [["逐户退还", "粮食 −14；奥斯温忠诚 +8，民心 +6", { grain: -14, support: 6, loyalty: 8 }, "旧债第一次被倒着清算。"], ["把旧账封存", "正统 +2；奥斯温怨气 +8", { legitimacy: 2, grievance: 8 }, "账册被锁进最里面的柜子。"], ["只退还仍有凭据的人", "粮食 −6；奥斯温忠诚 +2", { grain: -6, loyalty: 2 }, "奥斯温接受了折中，却没有称赞它。"]] },
  { id: "renard_veterans", officerId: "renard", minTurn: 3, title: "雷纳德要求把最好的田留给阵亡者家属", body: "他说军队必须知道，倒下以后家里不会立刻失去一切。", options: [["设立军户田", "金币 −10，民心 +4；雷纳德忠诚 +8", { gold: -10, support: 4, loyalty: 8 }, "第一块军户田写下了阵亡者的名字。"], ["只发一次抚恤", "金币 −7；雷纳德忠诚 +2", { gold: -7, loyalty: 2 }, "钱袋发完，制度没有留下。"], ["土地属于活着的人", "正统 +2；雷纳德忠诚 −8、怨气 +10", { legitimacy: 2, loyalty: -8, grievance: 10 }, "雷纳德把名单收回了甲衣里。"]] },
  { id: "ysabel_hidden_ledger", officerId: "ysabel", minTurn: 4, title: "伊莎贝尔发现税吏藏着一本只给自己看的账", body: "顺着这本账查下去，会牵出一批能交钱、也能办事的地方豪强。", options: [["一查到底", "金币 +8，民心 +5；伊莎贝尔忠诚 +7", { gold: 8, support: 5, loyalty: 7 }, "被藏起来的税重新回到了公账。"], ["罚钱但留任", "金币 +17；伊莎贝尔怨气 +6", { gold: 17, grievance: 6 }, "税吏交了钱，仍坐在原来的椅子上。"], ["把名单收为己用", "金币 +12，正统 −4；伊莎贝尔功勋 +3", { gold: 12, legitimacy: -4, merit: 3 }, "那本暗账换了一个上锁的抽屉。"]] },
  { id: "edmund_bastard_seal", officerId: "edmund", minTurn: 5, title: "埃德蒙想在自己的军令上使用渡鸦封蜡", body: "这会让命令更快，也会让所有人看见他与领主共享家族标记。", options: [["给他一枚副印", "埃德蒙忠诚 +9、功勋 +4；正统 −3", { loyalty: 9, merit: 4, legitimacy: -3 }, "第二枚渡鸦印第一次落在军令上。"], ["只许战时使用", "埃德蒙忠诚 +3；威望 +1", { loyalty: 3, renown: 1 }, "副印被锁在军械库，只在出征时取出。"], ["拒绝", "正统 +4；埃德蒙怨气 +10", { legitimacy: 4, grievance: 10 }, "他把没有封蜡的军令折得很整齐。"]] },
  { id: "oswin_village_rolls", officerId: "oswin", minTurn: 8, title: "奥斯温要把每户人口和存粮都登记进新册", body: "这能让救济更准确，也能让征税和征兵更准确。村民因此既期待又害怕。", options: [["只登记口粮与灾户", "民心 +5；奥斯温功勋 +5", { support: 5, merit: 5 }, "新册先记下谁可能熬不过冬天。"], ["人口、粮食、牲畜全登记", "金币 +9，正统 +3；民心 −4", { gold: 9, legitimacy: 3, support: -4 }, "渡鸦堡第一次知道自己究竟统治着多少。"], ["沿用旧册", "不花资源；奥斯温忠诚 −5", { loyalty: -5 }, "旧册又被摆回长桌。"]] },
  { id: "renard_mercy", officerId: "renard", minTurn: 9, title: "雷纳德抓到一个临阵逃跑的年轻士兵", body: "按军法该处死。但这人是阵亡老兵唯一的儿子。", options: [["罚入最前列，不处死", "军心 +2；雷纳德忠诚 +5，民心 +3", { morale: 2, loyalty: 5, support: 3 }, "年轻人活了下来，也再没有离开过盾墙。"], ["军法不能开口子", "军心 +6，民心 −5；雷纳德怨气 +4", { morale: 6, support: -5, grievance: 4 }, "军法得以维持，雷纳德亲自埋了那名士兵。"], ["交给雷纳德决定", "雷纳德功勋 +4、忠诚 +3", { merit: 4, loyalty: 3 }, "他沉默很久，最后选择了鞭刑。"]] },
  { id: "ysabel_market_charter", officerId: "ysabel", minTurn: 10, title: "伊莎贝尔提出让集市自己选出四名司秤人", body: "商人会更愿意来，也会形成一股不完全听命于城堡的力量。", options: [["颁发集市特许", "金币 +12，民心 +5，正统 −2；伊莎贝尔忠诚 +6", { gold: 12, support: 5, legitimacy: -2, loyalty: 6 }, "四枚铜秤砣成了集市自治的标记。"], ["司秤人由城堡任命", "金币 +8，正统 +3", { gold: 8, legitimacy: 3 }, "秤仍归商人使用，名字由城堡决定。"], ["维持税吏监管", "金币 +4；伊莎贝尔怨气 +7", { gold: 4, grievance: 7 }, "税吏继续坐在每一杆秤旁边。"]] },
  { id: "edmund_whispers", officerId: "edmund", minTurn: 11, title: "大厅里开始流传埃德蒙才更像老领主的儿子", body: "谣言不是他放出的，但他也没有制止。现在所有人都在等你先开口。", options: [["公开称他为兄弟", "正统 −6；埃德蒙忠诚 +13、怨气 −10", { legitimacy: -6, loyalty: 13, grievance: -10 }, "你给了他族谱里没有的位置。"], ["让他当众宣誓", "正统 +5；埃德蒙忠诚 −4", { legitimacy: 5, loyalty: -4 }, "誓言很清楚，沉默也很清楚。"], ["查出传播者", "军心 +3；埃德蒙怨气 +6，民心 −3", { morale: 3, grievance: 6, support: -3 }, "三名侍从被赶出城堡，谣言却没有死。"]] },
  { id: "aveline_river_envoy", officerId: "aveline", minTurn: 12, side: "any", title: "艾芙琳派来一名不带武器的渡船主人", body: "他只问一件事：如果河望有一天降旗，渡船和水闸是否仍由河地人管理？", options: [["答应保留河地旧例", "正统 −2，民心 +4；艾芙琳忠诚倾向 +8", { legitimacy: -2, support: 4, loyalty: 8 }, "你的答复沿河传得比军令更快。"], ["一切法令必须统一", "正统 +5；艾芙琳怨气 +6", { legitimacy: 5, grievance: 6 }, "渡船主人听完便离开了。"], ["先索要通行税", "金币 +9；艾芙琳忠诚倾向 −4", { gold: 9, loyalty: -4 }, "谈判先从九枚金币开始。"]] },
  { id: "bran_blood_price", officerId: "bran", minTurn: 13, side: "any", title: "布兰送来三把断剑，要求交换战俘", body: "狼牙氏族用血债计算俘虏。按他们的规矩办，会让边境理解你的强硬，也会让俘虏家属憎恨你。", options: [["等额交换", "长矛兵 +4，民心 +2；布兰忠诚倾向 +6", { levy: 4, support: 2, loyalty: 6 }, "两队俘虏在河滩上擦肩而过。"], ["无条件放回伤员", "民心 +6，威望 −2；布兰怨气 −4", { support: 6, renown: -2, grievance: -4 }, "狼牙人没有道谢，却记住了这件事。"], ["拒绝并示众俘虏", "军心 +5，民心 −6；布兰怨气 +8", { morale: 5, support: -6, grievance: 8 }, "三把断剑被钉在城门上。"]] },
  { id: "aveline_shared_table", officerId: "aveline", minTurn: 16, side: "player", title: "艾芙琳拒绝在长桌末尾落座", body: "她可以做你的家臣，但不会假装自己从未统治过河地。", options: [["给她河地席位", "艾芙琳忠诚 +11、功勋 +3；正统 −2", { loyalty: 11, merit: 3, legitimacy: -2 }, "长桌多了一把刻着波纹的椅子。"], ["所有家臣按功勋排位", "威望 +3；艾芙琳忠诚 +3", { renown: 3, loyalty: 3 }, "她接受了规则，并开始积攒功勋。"], ["这里没有河望伯爵", "正统 +4；艾芙琳忠诚 −9、怨气 +12", { legitimacy: 4, loyalty: -9, grievance: 12 }, "她坐下了，却没有碰酒杯。"]] },
  { id: "bran_wolf_oath", officerId: "bran", minTurn: 17, side: "player", title: "布兰要带狼牙旧部在城外重新立誓", body: "他愿让渡鸦旗挂在最高处，但要保留氏族围火宣誓的方式。", options: [["亲自去围火旁受誓", "粮食 −6；布兰忠诚 +12，军心 +5", { grain: -6, loyalty: 12, morale: 5 }, "渡鸦与狼牙的名字在同一圈火边被喊出。"], ["让雷纳德代你监誓", "布兰忠诚 +4，威望 +2", { loyalty: 4, renown: 2 }, "两名战士用各自的方式确认了同一份忠诚。"], ["所有人必须在大厅跪下", "正统 +5；布兰忠诚 −10、怨气 +13", { legitimacy: 5, loyalty: -10, grievance: 13 }, "布兰跪下得很慢。"]] }
];

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
  fields: '<path d="M7 38h34M12 38c3-12 2-21-1-30m5 8-5 5m-3 4 5 4m14 9c-2-11-1-19 3-27m-7 8 5 4m5 2-6 5"/>',
  market: '<path d="M8 18h32l-3-10H11L8 18Zm3 0v22h26V18M17 40V27h12v13M9 18c1 7 7 7 9 0 2 7 8 7 10 0 2 7 8 7 10 0"/>',
  barracks: '<path d="M8 40h32M12 40V18l12-9 12 9v22M19 40V28h10v12M8 18h32"/>',
  walls: '<path d="M7 40h34V16h-6V9h-7v7h-8V9h-7v7H7v24Zm13 0V29h8v11"/>'
};

let S = null;
let creatorOath = "oath";
let creatorDifficulty = "standard";
let prologueIndex = 0;
let battleDraft = { targetId: null, leaderIds: ["player", "renard", "ysabel"], troops: 32, plan: "steady" };
let toastTimer = 0;
let audioContext = null;
let ambientTimer = 0;
let soundEnabled = true;
const AUDIO_KEY = "iron-crown-audio";

const $ = id => typeof document === "undefined" ? null : document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const esc = value => String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
const clone = value => JSON.parse(JSON.stringify(value));
const seasonOf = s => SEASONS[s.turn % 4];
const yearOf = s => Math.floor(s.turn / 4) + 1;
const difficultyOf = s => DIFFICULTIES[s.difficulty] || DIFFICULTIES.standard;
const officer = (s, id) => s.officers.find(o => o.id === id);
const ownedOfficers = s => s.officers.filter(o => o.side === "player");
const ownTerritoryIds = s => Object.keys(s.territories).filter(id => s.territories[id].owner === "player");
const owns = (s, id) => s.territories[id]?.owner === "player";

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
  ["levy", "archers", "knights"].forEach(type => { if (changes[type]) addUnits(s, type, changes[type]); });
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
    kicker: def.kicker || `${person?.title || "家臣"} · 人物事件`,
    title: def.title,
    portrait: def.portrait || person?.portrait || "assets/player.webp",
    body: `<p>${esc(def.body)}</p>`,
    options: def.options.map(([name, note, changes, chronicle]) => ({
      name, note,
      disabled: (changes.gold < 0 && s.gold < Math.abs(changes.gold)) || (changes.grain < 0 && s.grain < Math.abs(changes.grain)),
      effect() {
        applyEventEffects(s, changes, officerId);
        log(s, changes.support > 0 || changes.loyalty > 0 ? "good" : changes.support < 0 || changes.grievance > 5 ? "warn" : "info", chronicle);
      }
    }))
  };
}

function armyTotal(s) {
  if (!s.army) return Math.max(0, Math.round(s.troops || 0));
  return Object.keys(UNIT_DEFS).reduce((sum, type) => sum + Math.max(0, Math.round(s.army[type] || 0)), 0);
}

function syncTroops(s) {
  s.troops = armyTotal(s);
  return s.troops;
}

function addUnits(s, type, amount) {
  s.army ||= { levy: 0, archers: 0, knights: 0 };
  s.army[type] = Math.max(0, Math.round((s.army[type] || 0) + amount));
  return syncTroops(s);
}

function removeTroops(s, amount) {
  let left = Math.min(armyTotal(s), Math.max(0, Math.round(amount)));
  const removed = { levy: 0, archers: 0, knights: 0 };
  for (const type of ["levy", "archers", "knights"]) {
    const take = Math.min(s.army[type] || 0, left);
    s.army[type] -= take;
    removed[type] += take;
    left -= take;
  }
  syncTroops(s);
  return removed;
}

function selectedComposition(s, troops) {
  const total = Math.max(1, armyTotal(s));
  const selected = clamp(Math.round(troops), 0, total);
  const ratio = selected / total;
  const result = {
    knights: Math.min(s.army.knights || 0, Math.floor((s.army.knights || 0) * ratio)),
    archers: Math.min(s.army.archers || 0, Math.floor((s.army.archers || 0) * ratio)),
    levy: 0
  };
  result.levy = Math.min(s.army.levy || 0, selected - result.knights - result.archers);
  let missing = selected - result.levy - result.archers - result.knights;
  for (const type of ["levy", "archers", "knights"]) {
    if (missing <= 0) break;
    const room = Math.max(0, (s.army[type] || 0) - result[type]);
    const add = Math.min(room, missing);
    result[type] += add;
    missing -= add;
  }
  return result;
}

function compositionText(comp) {
  return `矛${comp.levy || 0} · 弓${comp.archers || 0} · 骑${comp.knights || 0}`;
}

function compositionPower(comp, targetId, planId, seasonId) {
  let weights = { levy: .92, archers: 1.1, knights: 1.7 };
  if (targetId === "ashfield") weights = { levy: .92, archers: 1.05, knights: 2.02 };
  if (["pineford"].includes(targetId)) weights = { levy: .98, archers: 1.34, knights: 1.2 };
  if (["highpass"].includes(targetId)) weights = { levy: 1.02, archers: 1.28, knights: 1.18 };
  if (["crossford", "riverwatch"].includes(targetId)) weights = { levy: .98, archers: 1.24, knights: 1.28 };
  if (targetId === "crownvale") weights = { levy: 1, archers: 1.02, knights: 1.34 };
  if (planId === "ambush") { weights.archers *= 1.12; weights.knights *= .93; }
  if (planId === "assault") { weights.knights *= 1.08; weights.archers *= .94; }
  const seasonMult = seasonId === "winter" ? { levy: .9, archers: .9, knights: .76 } : seasonId === "spring" ? { levy: .96, archers: .94, knights: .9 } : seasonId === "summer" ? { levy: 1.03, archers: 1.04, knights: 1.08 } : { levy: 1, archers: 1, knights: 1 };
  return Object.keys(UNIT_DEFS).reduce((sum, type) => sum + (comp[type] || 0) * weights[type] * seasonMult[type], 0);
}

function campaignSupply(s, troops, leaderIds = []) {
  const comp = selectedComposition(s, troops);
  let amount = Math.ceil((comp.levy + comp.archers) / 8 + comp.knights / 2.5);
  if (seasonOf(s).id === "winter") amount = Math.ceil(amount * 1.35);
  if (leaderIds.includes("ysabel")) amount = Math.ceil(amount * .84);
  return Math.max(1, amount);
}

function allocateLosses(comp, totalLoss) {
  const remaining = clone(comp);
  const result = { levy: 0, archers: 0, knights: 0 };
  const risks = { levy: 1, archers: .72, knights: .48 };
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

function createInitialState(name, oath, difficulty) {
  const territories = {};
  Object.entries(TERRITORY_DEFS).forEach(([id, d]) => {
    territories[id] = {
      owner: d.owner,
      stability: d.stability,
      guard: d.guard,
      devastated: 0,
      fiefHolder: null,
      policy: "balanced",
      buildings: { fields: id === "ravenstone" ? 1 : 0, market: id === "ravenstone" ? 1 : 0, barracks: id === "ravenstone" ? 1 : 0, walls: id === "ravenstone" ? 1 : 0 }
    };
  });
  const officers = Object.entries(OFFICER_DEFS).map(([id, d]) => ({
    id, ...clone(d), name: id === "player" ? (name.trim() || "罗恩") : d.name,
    loyalty: d.loyalty, ambition: d.ambition, grievance: 0, merit: 0, injured: 0, fief: null, captured: false
  }));
  const style = { oath: 0, iron: 0, wealth: 0 };
  style[oath] = 2;
  const state = {
    version: VERSION,
    playerName: name.trim() || "罗恩",
    oath, difficulty, style,
    turn: 0, ap: 3, tab: "hall",
    gold: oath === "wealth" ? 68 : 58,
    grain: 125,
    army: oath === "iron" ? { levy: 34, archers: 9, knights: 5 } : { levy: 30, archers: 8, knights: 4 },
    troops: oath === "iron" ? 48 : 42,
    support: oath === "oath" ? 61 : 54,
    morale: oath === "iron" ? 66 : 58,
    renown: 12,
    legitimacy: 35,
    training: 0,
    warWeariness: 0,
    campaignCooldown: 0,
    crisis: { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 },
    territories, officers,
    usedActions: {},
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
  log(state, "info", `${state.playerName}在雨夜接过渡鸦堡的领主印戒。`);
  return state;
}

function hydrateState(raw) {
  if (!raw || raw.version !== VERSION) return null;
  raw.pendingDecisions ||= [];
  raw.seenEvents ||= [];
  raw.seenNpcEvents ||= [];
  raw.usedActions ||= {};
  raw.flags ||= {};
  raw.style ||= { oath: 0, iron: 0, wealth: 0 };
  Object.values(raw.territories).forEach(t => { t.policy ||= "balanced"; });
  if (!raw.army) {
    const total = Math.max(0, Math.round(raw.troops || 0));
    const knights = Math.min(4, Math.floor(total / 8));
    const archers = Math.min(8, Math.floor(total / 4));
    raw.army = { levy: Math.max(0, total - knights - archers), archers, knights };
  }
  raw.warWeariness ??= 0;
  raw.campaignCooldown ??= 0;
  raw.crisis ||= { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 };
  raw.crisis.famine ??= 0;
  raw.crisis.debt ??= 0;
  raw.crisis.unrest ??= 0;
  raw.crisis.checkedTurn ??= -1;
  raw.officers.forEach(o => { o.grievance ??= 0; o.merit ??= 0; o.injured ??= 0; o.fief ??= null; });
  Object.values(raw.territories).forEach(t => {
    if (t.fiefHolder && t.fiefHolder !== "charter" && officer(raw, t.fiefHolder)?.side !== "player") t.fiefHolder = null;
  });
  raw.officers.forEach(o => {
    if (o.side !== "player" || (o.fief && raw.territories[o.fief]?.fiefHolder !== o.id)) o.fief = null;
  });
  syncTroops(raw);
  if (raw.battleSession && !raw.battleSession.composition) {
    raw.battleSession.composition = selectedComposition(raw, raw.battleSession.troops);
    raw.battleSession.lossesByType = { levy: 0, archers: 0, knights: 0 };
  }
  if (raw.battleSession) {
    raw.battleSession.flags ||= { demanded: false, pushed: false, aggression: 0 };
    raw.battleSession.flags.aggression ??= 0;
  }
  return raw;
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
  try { return hydrateState(JSON.parse(localStorage.getItem(SAVE_KEY))); }
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
  const share = t.fiefHolder ? (t.fiefHolder === "charter" ? .78 : .7) : 1;
  const wealth = s.oath === "wealth" ? 1.08 : 1;
  const bestGovernor = ownedOfficers(s).filter(o => !o.injured).sort((a, b) => b.stats.govern - a.stats.govern)[0];
  const admin = 1 + Math.max(0, (bestGovernor?.stats.govern || 55) - 55) / 550;
  const diff = difficultyOf(s).income;
  const policy = POLICIES[t.policy] || POLICIES.balanced;
  const fatigue = 1 - clamp(s.warWeariness || 0, 0, 100) / 400;
  const grainBase = d.grain + t.buildings.fields * 8;
  const goldBase = d.gold + t.buildings.market * 3;
  return {
    grain: Math.max(0, Math.round(grainBase * season.grain * stability * damage * share * diff * policy.grain * fatigue)),
    gold: Math.max(0, Math.round(goldBase * season.gold * stability * damage * share * wealth * admin * diff * policy.gold * fatigue))
  };
}

function forecast(s) {
  const season = seasonOf(s);
  const gross = ownTerritoryIds(s).reduce((acc, id) => {
    const out = territoryOutput(s, id, season);
    acc.gold += out.gold;
    acc.grain += out.grain;
    return acc;
  }, { gold: 0, grain: 0 });
  const ysabel = ownedOfficers(s).some(o => o.id === "ysabel" && !o.injured);
  const winterExtra = season.id === "winter" ? Math.ceil(subjects(s) / 35 * difficultyOf(s).winter) : 0;
  const seedReserve = season.id === "autumn" ? ownTerritoryIds(s).length * 2 : 0;
  const army = s.army || { levy: s.troops || 0, archers: 0, knights: 0 };
  let grainCost = Math.ceil(subjects(s) / 34 + army.levy / 4 + army.archers / 4 + army.knights / 3) + winterExtra + seedReserve;
  if (ysabel) grainCost = Math.ceil(grainCost * .92);
  const goldCost = Math.ceil(army.levy * .12 + army.archers * .23 + army.knights * .55) + ownedOfficers(s).filter(o => o.id !== "player").length;
  const fieldLevels = ownTerritoryIds(s).reduce((sum, id) => sum + (s.territories[id].buildings.fields || 0), 0);
  const storageCap = 105 + ownTerritoryIds(s).length * 45 + fieldLevels * 35;
  const projected = s.grain + gross.grain - grainCost;
  const spoilage = Math.max(0, Math.round((projected - storageCap) * .18));
  return { ...gross, grainCost, goldCost, storageCap, spoilage, netGold: gross.gold - goldCost, netGrain: gross.grain - grainCost - spoilage };
}

function buildingCost(s, id, type) {
  const level = s.territories[id].buildings[type];
  const discount = s.oath === "wealth" ? .88 : 1;
  return Math.round((BUILDINGS[type].base + level * 13) * discount);
}

function canUpgrade(s, id, type) {
  const t = s.territories[id];
  return !!t && t.owner === "player" && t.buildings[type] < 3 && s.ap > 0 && s.gold >= buildingCost(s, id, type);
}

function upgradeBuilding(id, type) {
  if (rejectDuringBattle(S)) return false;
  if (!canUpgrade(S, id, type)) { toast("行动点、金币或等级条件不足"); return false; }
  const t = S.territories[id];
  const cost = buildingCost(S, id, type);
  S.gold -= cost;
  S.ap--;
  t.buildings[type]++;
  if (type === "barracks") t.guard += 7;
  if (type === "walls") t.guard += 5;
  t.stability = clamp(t.stability + 3);
  S.style.wealth++;
  const text = `${TERRITORY_DEFS[id].name}完成${BUILDINGS[type].name}第${t.buildings[type]}级建设。`;
  S.lastAction = { name: "领地建设", text: `花费${cost}金币。${text}` };
  log(S, "good", text);
  playSound("build");
  saveGame();
  renderAll();
  return true;
}

const ACTIONS = [
  { id: "inspect", icon: "路", name: "巡视村庄", desc: "亲自听村民说话，修补一处最不稳定的统治裂缝。", effects: ["民心 +6", "最低稳定 +8"], max: 1,
    run(s) {
      s.support = clamp(s.support + 6 + (s.oath === "oath" ? 2 : 0));
      const ids = ownTerritoryIds(s).sort((a, b) => s.territories[a].stability - s.territories[b].stability);
      if (ids[0]) s.territories[ids[0]].stability = clamp(s.territories[ids[0]].stability + 8);
      s.style.oath++;
      return "你走过泥泞的村道，亲手裁决了三桩积压的纠纷。";
    } },
  { id: "tax", icon: "税", name: "提前征税", desc: "把未来的收成先变成军费。钱来得快，怨气也来得快。", effects: ["金币增加", "民心 −6", "稳定 −3"], max: 1,
    run(s) {
      const gain = Math.round((14 + ownTerritoryIds(s).length * 6) * (s.oath === "wealth" ? 1.18 : 1));
      s.gold += gain;
      s.support = clamp(s.support - 6);
      ownTerritoryIds(s).forEach(id => s.territories[id].stability = clamp(s.territories[id].stability - 3));
      s.style.wealth++;
      return `税吏带回${gain}金币。几个村庄的门在他们经过时关得很紧。`;
    } },
  { id: "recruit", icon: "矛", name: "征召长矛兵", desc: "从田地里抽走壮丁，补充承担盾墙与伤亡的主力。", effects: ["金币 −10", "粮食 −6", "长矛兵 +8～12"], max: 1,
    canRun: s => s.gold >= UNIT_DEFS.levy.gold && s.grain >= UNIT_DEFS.levy.grain,
    run(s) {
      const gain = recruitAmount(s, "levy");
      s.gold -= UNIT_DEFS.levy.gold; s.grain -= UNIT_DEFS.levy.grain; addUnits(s, "levy", gain); s.support = clamp(s.support - 2); s.style.iron++;
      return `${gain}名农夫放下锄头拿起长矛。秋收时，田里会少掉同样多的手。`;
    } },
  { id: "train", icon: "剑", name: "整训军队", desc: "让征召兵学会在冲锋面前保持队列。训练会逐季衰减。", effects: ["金币 −7", "粮食 −4", "训练 +8"], max: 1,
    canRun: s => s.gold >= 7 && s.grain >= 4 && armyTotal(s) >= 10,
    run(s) {
      s.gold -= 7; s.grain -= 4; s.training = clamp(s.training + 8); s.morale = clamp(s.morale + 4); s.style.iron++;
      return "雷纳德让队列在雨里反复转向，直到没有人再分不清自己的位置。";
    } },
  { id: "feast", icon: "杯", name: "设宴封赏", desc: "给功臣席位，给村民面包。能压住一些正在增长的野心。", effects: ["金币 −13", "粮食 −8", "家臣忠诚 +4"], max: 1,
    canRun: s => s.gold >= 13 && s.grain >= 8,
    run(s) {
      s.gold -= 13; s.grain -= 8; s.support = clamp(s.support + 4); s.renown = clamp(s.renown + 2);
      ownedOfficers(s).filter(o => o.id !== "player").forEach(o => { o.loyalty = clamp(o.loyalty + 4); o.grievance = clamp(o.grievance - 3); });
      s.style.oath++;
      return "长桌上没有银器，但每个立过功的人都听见了自己的名字。";
    } },
  { id: "fortify", icon: "盾", name: "加固边防", desc: "把木料和守军送往最薄弱的前线领地。", effects: ["金币 −8", "最低守军 +7", "稳定 +3"], max: 1,
    canRun: s => s.gold >= 8,
    run(s) {
      s.gold -= 8;
      const ids = ownTerritoryIds(s).sort((a, b) => s.territories[a].guard - s.territories[b].guard);
      if (ids[0]) { s.territories[ids[0]].guard += 7; s.territories[ids[0]].stability = clamp(s.territories[ids[0]].stability + 3); }
      s.style.iron++;
      return `${TERRITORY_DEFS[ids[0]].name}的壕沟被重新挖深，烽火台也换上了干柴。`;
    } },
  { id: "rest", icon: "营", name: "休整军队", desc: "停止扩张一个季度，让伤兵归队，也让村庄从征发中喘口气。", effects: ["金币 −4", "粮食 −5", "战争疲劳 −18"], max: 1,
    canRun: s => s.gold >= 4 && s.grain >= 5 && s.warWeariness > 0,
    run(s) {
      s.gold -= 4; s.grain -= 5; s.warWeariness = clamp(s.warWeariness - 18); s.morale = clamp(s.morale + 3);
      s.officers.forEach(o => { if (o.injured > 0) o.injured--; });
      return "军旗留在营地，伤员得到照料。人们第一次没有听见下一场远征的集合号。";
    } }
];

function applyAction(id) {
  if (rejectDuringBattle(S)) return false;
  const action = ACTIONS.find(a => a.id === id);
  if (!S || !action || S.ap < 1 || (S.usedActions[id] || 0) >= action.max || (action.canRun && !action.canRun(S))) {
    toast("本季度无法安排这件事");
    return false;
  }
  S.ap--;
  S.usedActions[id] = (S.usedActions[id] || 0) + 1;
  const text = action.run(S);
  S.lastAction = { name: action.name, text };
  log(S, "info", `${action.name}：${text}`);
  playSound(action.id === "tax" ? "tax" : action.id === "feast" ? "event" : "click");
  saveGame();
  renderAll();
  return true;
}

function canRecruitUnit(s, type) {
  const unit = UNIT_DEFS[type];
  const actionKey = type === "levy" ? "recruit" : `unit_${type}`;
  if (!unit || s.ap < 1 || s.usedActions[actionKey] || s.gold < unit.gold || s.grain < unit.grain) return false;
  if (type === "knights") {
    const barracks = ownTerritoryIds(s).reduce((sum, id) => sum + s.territories[id].buildings.barracks, 0);
    if (s.renown < 15 && barracks < 2) return false;
  }
  return true;
}

function recruitAmount(s, type) {
  const unit = UNIT_DEFS[type];
  if (!unit) return 0;
  const barracks = ownTerritoryIds(s).reduce((sum, id) => sum + s.territories[id].buildings.barracks, 0);
  const bonus = type === "levy" ? Math.min(3, barracks) : type === "archers" ? Math.floor(Math.min(4, barracks) / 2) : 0;
  return unit.amount + bonus + (s.oath === "iron" && type !== "knights" ? 1 : 0);
}

function recruitUnit(type) {
  if (rejectDuringBattle(S)) return false;
  if (!canRecruitUnit(S, type)) { toast("行动点、资源、威望或兵营条件不足"); return false; }
  const unit = UNIT_DEFS[type];
  const amount = recruitAmount(S, type);
  S.gold -= unit.gold;
  S.grain -= unit.grain;
  S.ap--;
  S.usedActions[type === "levy" ? "recruit" : `unit_${type}`] = 1;
  addUnits(S, type, amount);
  if (type === "levy") S.support = clamp(S.support - 2);
  S.style.iron++;
  S.lastAction = { name: `征募${unit.name}`, text: `${amount}名${unit.name}加入军队。不同地形会改变他们的实际战力。` };
  log(S, "info", S.lastAction.text);
  playSound("drum");
  saveGame(); renderAll();
  return true;
}

function setTerritoryPolicy(id, policyId) {
  if (rejectDuringBattle(S)) return false;
  const t = S.territories[id];
  const policy = POLICIES[policyId];
  const key = `policy_${id}`;
  if (!t || t.owner !== "player" || !policy || t.policy === policyId || S.ap < 1 || S.usedActions[key]) {
    toast("本季度无法调整这块领地的政策");
    return false;
  }
  t.policy = policyId;
  S.ap--;
  S.usedActions[key] = 1;
  if (policyId === "relief") S.style.oath++;
  if (policyId === "extract") S.style.wealth++;
  if (policyId === "garrison") S.style.iron++;
  S.lastAction = { name: `${TERRITORY_DEFS[id].name}改行${policy.name}`, text: `${policy.desc}该政策将持续生效，直到再次调整。` };
  log(S, "info", S.lastAction.text);
  playSound("click");
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

function enemyGuardCap(s, id) {
  const expansionPressure = Math.max(0, ownTerritoryIds(s).length - 1) * 4;
  const timePressure = Math.floor(s.turn / 4) * 3;
  return Math.round(TERRITORY_DEFS[id].guard + (expansionPressure + timePressure) * difficultyOf(s).enemy);
}

function settleSeasonEconomy(s) {
  const f = forecast(s);
  s.gold += f.gold - f.goldCost;
  s.grain += f.grain - f.grainCost - f.spoilage;
  if (f.spoilage > 0) log(s, "warn", `粮仓容量只有${f.storageCap}，潮气、鼠害与转运损失吃掉了${f.spoilage}粮食。升级农田与磨坊可扩充仓储。`);
  if (s.grain < 0) { const deficit = Math.abs(s.grain); s.grain = 0; applyShortage(s, deficit); }
  if (s.gold < -25) {
    s.morale = clamp(s.morale - 7);
    ownedOfficers(s).forEach(o => { if (o.id !== "player") o.loyalty = clamp(o.loyalty - 4); });
    log(s, "bad", "军饷拖欠，骑士与雇工开始在大厅外等你的解释。"
    );
  }
  ownTerritoryIds(s).forEach(id => {
    const t = s.territories[id];
    const guardCap = TERRITORY_DEFS[id].guard + t.buildings.barracks * 7 + t.buildings.walls * 5;
    if (t.devastated > 0) t.devastated--;
    if (t.policy === "relief") { t.stability = clamp(t.stability + 4); s.support = clamp(s.support + 1); }
    if (t.policy === "extract") t.stability = clamp(t.stability - 4);
    if (t.policy === "garrison") { t.guard = Math.min(guardCap, t.guard + 3); t.stability = clamp(t.stability + 1); }
    else if (t.stability >= 65 && t.guard < guardCap) t.guard++;
  });
  Object.keys(s.territories).filter(id => s.territories[id].owner !== "player").forEach(id => {
    const t = s.territories[id];
    const recovery = t.devastated > 0 ? 1 : Math.min(4, 2 + Math.floor(s.turn / 12));
    t.guard = Math.min(enemyGuardCap(s, id), t.guard + recovery);
    if (t.devastated > 0) t.devastated--;
  });
  if (s.warWeariness >= 60) {
    s.support = clamp(s.support - 3);
    s.morale = clamp(s.morale - 2);
    ownedOfficers(s).filter(o => o.id !== "player").forEach(o => o.loyalty = clamp(o.loyalty - 1));
    log(s, "warn", "连续征发开始压垮村庄，军队也在问下一场战争何时才会结束。");
  }
  log(s, f.netGrain >= 0 ? "good" : "warn", `${seasonOf(s).name}季结算：金币${f.netGold >= 0 ? "+" : ""}${f.netGold}，粮食${f.netGrain >= 0 ? "+" : ""}${f.netGrain}${f.spoilage ? `（含损耗${f.spoilage}）` : ""}。`);
}

function advanceSeason(s) {
  if (s.battleSession) { toast("必须先结束当前战役"); return false; }
  settleSeasonEconomy(s);
  enemyPressure(s, Math.random);
  s.officers.forEach(o => { if (o.injured > 0) o.injured--; });
  s.training = Math.max(0, s.training - 2);
  s.warWeariness = clamp(s.warWeariness - (s.usedActions.campaign ? 5 : 9));
  s.campaignCooldown = Math.max(0, (s.campaignCooldown || 0) - 1);
  s.turn++;
  s.ap = 3;
  s.usedActions = {};
  s.lastAction = null;
  handleOfficerPolitics(s);
  queueSeasonEvents(s);
  if (s.turn >= MAX_TURNS && !s.ended) {
    s.ended = true;
    s.endingReason = ownTerritoryIds(s).length >= 5 ? "great_lord" : "minor_lord";
  }
  checkDefeat(s);
  saveGame();
  renderAll();
  pumpDecision();
  playSound("season");
  refreshAmbient();
  return true;
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
        log(s, "warn", `${TERRITORY_DEFS[fiefId].name}失去受封领主，重新归于直辖，地方秩序随之动荡。`);
      }
      o.side = "gone";
      log(s, "bad", `${o.name}带着${gone}名追随者离开渡鸦堡。功劳没有换来土地，他不再等了。`);
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

function attackableTerritories(s) {
  const mine = new Set(ownTerritoryIds(s));
  return Object.keys(TERRITORY_DEFS).filter(id => {
    const d = TERRITORY_DEFS[id];
    if (mine.has(id)) return false;
    if (d.final && (mine.size < 6 || s.turn < CROWN_OPEN_TURN)) return false;
    return d.adj.some(next => mine.has(next));
  });
}

function factionTerritories(s, faction) {
  return Object.keys(s.territories).filter(id => s.territories[id].owner === faction);
}

function defenderLeader(s, targetId) {
  const owner = s.territories[targetId].owner;
  if (owner === "wolf" && officer(s, "bran")?.side === "wolf") return officer(s, "bran");
  if (owner === "river" && officer(s, "aveline")?.side === "river") return officer(s, "aveline");
  return null;
}

function averageStat(s, ids, stat) {
  const people = ids.map(id => officer(s, id)).filter(Boolean);
  if (!people.length) return 0;
  return people.reduce((sum, o) => sum + o.stats[stat], 0) / people.length;
}

function battleEstimate(s, targetId, leaderIds, troops, planId) {
  const t = s.territories[targetId];
  const d = TERRITORY_DEFS[targetId];
  const plan = PLANS[planId] || PLANS.steady;
  const force = averageStat(s, leaderIds, "force");
  const command = averageStat(s, leaderIds, "command");
  const scheme = averageStat(s, leaderIds, "scheme");
  let planMult = plan.mult;
  if (planId === "ambush") {
    planMult += scheme / 1400;
    if (["pineford", "highpass"].includes(targetId)) planMult += .15;
  }
  if (planId === "assault" && leaderIds.includes("renard")) planMult += .06;
  const composition = selectedComposition(s, troops);
  const unitPower = compositionPower(composition, targetId, planId, seasonOf(s).id);
  const fatigue = 1 - clamp(s.warWeariness || 0, 0, 100) / 300;
  const effectiveMorale = leaderIds.includes("player") ? Math.max(45, s.morale) : s.morale;
  let attack = unitPower * (.62 + command / 190 + force / 330) * (.72 + effectiveMorale / 190) * (1 + s.training / 190) * planMult * fatigue;
  if (leaderIds.includes("player")) attack *= 1.03;
  if (leaderIds.includes("bran") && ["pineford", "highpass"].includes(targetId)) attack *= 1.08;
  if (leaderIds.includes("aveline") && ["crossford", "riverwatch"].includes(targetId)) attack *= 1.08;
  const walls = t.buildings?.walls || (d.final ? 2 : 1);
  let defense = t.guard * (1 + walls * .11) * difficultyOf(s).enemy;
  const defender = defenderLeader(s, targetId);
  if (defender) defense *= 1 + defender.stats.command / 700;
  if (defender?.id === "bran" && ["pineford", "highpass"].includes(targetId)) defense *= 1.1;
  if (defender?.id === "aveline" && ["riverwatch", "crossford"].includes(targetId)) defense *= 1.08;
  const ratio = attack / Math.max(1, defense);
  let label = "胜负难料";
  if (ratio >= 1.28) label = "明显占优";
  else if (ratio >= 1.08) label = "略占上风";
  else if (ratio < .78) label = "近乎送死";
  else if (ratio < .94) label = "处于下风";
  return { attack, defense, ratio, label, planMult, composition, unitPower, fatigue, effectiveMorale };
}

function casualtyForecast(s, targetId, leaderIds, troops, planId) {
  const est = battleEstimate(s, targetId, leaderIds, troops, planId);
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

function startBattle(s, draft, rng = Math.random) {
  if (s.battleSession || s.ap < CAMPAIGN_AP_COST || s.usedActions.campaign || s.campaignCooldown > 0 || !attackableTerritories(s).includes(draft.targetId)) return null;
  const leaders = draft.leaderIds.map(id => officer(s, id)).filter(o => o?.side === "player" && !o.injured).slice(0, 3);
  const troops = clamp(Math.round(draft.troops), 10, armyTotal(s));
  if (!leaders.length || troops > armyTotal(s)) return null;
  const supply = campaignSupply(s, troops, leaders.map(o => o.id));
  if (s.grain < supply) return null;
  const est = battleEstimate(s, draft.targetId, leaders.map(o => o.id), troops, draft.plan);
  s.ap -= CAMPAIGN_AP_COST;
  s.usedActions.campaign = 1;
  s.grain -= supply;
  s.warWeariness = clamp(s.warWeariness + 5 + Math.ceil(troops / 12) + (seasonOf(s).id === "winter" ? 5 : 0));
  s.battles++;
  s.battleSession = {
    targetId: draft.targetId,
    leaderIds: leaders.map(o => o.id),
    troops,
    plan: draft.plan,
    composition: est.composition,
    lossesByType: { levy: 0, archers: 0, knights: 0 },
    ratio: est.ratio,
    stage: 0,
    momentum: clamp((est.ratio - 1) * 42, -42, 42),
    playerLoss: 0,
    enemyLoss: 0,
    history: [],
    flags: { demanded: false, pushed: false, aggression: 0 },
    seedMark: Math.round(rng() * 1e9)
  };
  log(s, "warn", `${leaders.map(o => o.name).join("、")}率${troops}人（${compositionText(est.composition)}）向${TERRITORY_DEFS[draft.targetId].name}进军。`);
  playSound("drum");
  return s.battleSession;
}

function stageOptions(s, session) {
  const ids = session.leaderIds;
  const scheme = averageStat(s, ids, "scheme");
  const force = averageStat(s, ids, "force");
  const charm = averageStat(s, ids, "charm");
  const options = [];
  if (session.stage === 0) {
    options.push({ id: "ridge", name: "抢下有利地形", by: "通用军令", desc: "稳步推进，在接敌前建立阵线。", mult: 1.05, casualty: .9 });
    if (scheme >= 64) options.push({ id: "scout", name: "从猎户小径绕过去", by: ids.includes("edmund") ? "埃德蒙" : ids.includes("ysabel") ? "伊莎贝尔" : "谋士提议", desc: "以谋略换取先手，降低接敌伤亡。", mult: 1.1 + scheme / 1200, casualty: .7 });
    if (ids.includes("renard")) options.push({ id: "forced", name: "趁他们还没列阵", by: "雷纳德", desc: "强行军抢先接敌；若继续冒进，守军会逐步看穿你的节奏。", mult: 1.12, casualty: 1.45, pushed: true });
  } else if (session.stage === 1) {
    options.push({ id: "shield", name: "稳住盾墙", by: "通用军令", desc: "守住阵线，用耐心消耗对方。", mult: 1, casualty: .75 });
    if ((session.composition?.archers || 0) >= 4) options.push({ id: "volley", name: "让弓手轮射压住阵脚", by: ids.includes("ysabel") ? "伊莎贝尔" : "弓手队长", desc: "以箭矢消耗敌军，森林和河地尤其有效。", mult: 1.08 + (session.composition.archers / Math.max(10, session.troops)) * .55, casualty: .68 });
    if ((force >= 68 || ids.includes("renard")) && (session.composition?.knights || 0) >= 2) options.push({ id: "charge", name: "让披甲骑士正面冲阵", by: ids.includes("renard") ? "雷纳德" : "阵中骑士", desc: "高风险冲击；平原威力最大，连续强攻时折损会陡升。", mult: 1.1 + force / 2400, casualty: 1.64, pushed: true });
    if (scheme >= 67) options.push({ id: "feint", name: "故意露出左翼", by: ids.includes("edmund") ? "埃德蒙" : "谋士提议", desc: "诱使敌军离开防线，再切断退路。", mult: 1.14 + scheme / 1600, casualty: .88 });
  } else {
    options.push({ id: "press", name: "把最后的预备队压上去", by: "通用军令", desc: "争取在天黑前结束战斗；守军会重点反击已经疲惫的突击队。", mult: 1.08, casualty: 1.48, pushed: true });
    options.push({ id: "hold", name: "收紧阵线，等他们先犯错", by: "通用军令", desc: "不追求大胜，优先保住现有优势。", mult: 1.01, casualty: .72 });
    if (session.momentum > 10 && charm >= 64) options.push({ id: "surrender", name: "让号手劝他们放下武器", by: ids.includes("edmund") ? "埃德蒙" : "阵中使者", desc: "只有占据优势时，劝降才不是示弱。", mult: .96 + charm / 1900, casualty: .38, surrender: true });
    options.push({ id: "retreat", name: "鸣金撤退", by: ids.includes("ysabel") ? "伊莎贝尔" : "通用军令", desc: "保住剩余人手，本场不夺地。", retreat: true });
  }
  return options.slice(0, 4);
}

function battleNarrative(session, choice, delta, loss, enemyLoss) {
  const target = TERRITORY_DEFS[session.targetId];
  const stageNames = ["行军接敌", "两军交锋", "胜负将分"];
  const direction = delta >= 8 ? "攻势明显向前推进" : delta <= -8 ? "阵线被逼得不断后退" : "双方都没能彻底压住对方";
  const special = choice.surrender ? "号角停下后，敌阵里开始有人放下长矛。" : choice.id === "scout" ? "斥候从林间带回了一条没有设防的小路。" : choice.id === "charge" ? "披甲骑士撞入盾墙的声音盖过了喊杀。" : choice.id === "volley" ? "三轮箭雨越过盾墙，迫使敌军把阵线缩在一起。" : choice.id === "feint" ? "敌军追进缺口时才发现退路已被切断。" : choice.id === "hold" ? "你没有追逐正在后退的旗帜，而是让每个人守住脚下。" : "军旗在泥水与箭雨中继续向前。";
  return { name: stageNames[session.stage], title: `${choice.by}：${choice.name}`, text: `${special}${direction}。本段折损${loss}人，敌军约损失${enemyLoss}人。` };
}

function applyBattleChoice(s, choiceId, rng = Math.random) {
  const session = s.battleSession;
  if (!session) return null;
  const choice = stageOptions(s, session).find(o => o.id === choiceId);
  if (!choice) return null;
  playSound(choice.pushed ? "drum" : "click");
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
  if (counterBlow > 0) history.text += ` 守军已适应连续突击，反扑额外削去约${Math.round(counterBlow)}点战场势头。`;
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
  Object.keys(UNIT_DEFS).forEach(type => { s.army[type] = Math.max(0, (s.army[type] || 0) - (lossesByType[type] || 0)); });
  syncTroops(s);
  s.casualties += session.playerLoss;
  s.warWeariness = clamp(s.warWeariness + Math.ceil(session.playerLoss * 1.5));
  const leaders = session.leaderIds.map(id => officer(s, id)).filter(Boolean);
  const injured = [];
  let persistentEnemyLoss = 0;
  let garrisoned = 0;
  let lostGold = 0;
  let lostGrain = 0;
  leaders.forEach(o => {
    if (rng() < Math.min(.32, session.playerLoss / Math.max(12, session.troops) * .8)) {
      o.injured = 1 + Math.floor(rng() * 2);
      injured.push(o.name);
    }
  });
  if (outcome === "win") {
    const t = s.territories[targetId];
    const desiredGarrison = Math.max(6, Math.round((session.troops - session.playerLoss) * (session.flags.demanded ? .16 : .22)));
    garrisoned = Math.min(Math.max(0, armyTotal(s) - 10), desiredGarrison);
    if (garrisoned > 0) removeTroops(s, garrisoned);
    t.owner = "player";
    t.stability = 38 + (s.oath === "oath" ? 7 : 0);
    t.guard = Math.max(10, 8 + garrisoned);
    t.devastated = 2;
    t.fiefHolder = null;
    s.wins++;
    s.renown = clamp(s.renown + 8);
    s.legitimacy = clamp(s.legitimacy + 3);
    s.morale = clamp(s.morale + 7);
    s.campaignCooldown = 3;
    leaders.forEach(o => { o.merit += 7 + (session.flags.demanded ? 2 : 0); o.loyalty = clamp(o.loyalty + 2); });
    s.pendingDecisions.push({ type: "conquest", territoryId: targetId, heroId: leaders.filter(o => o.id !== "player").sort((a, b) => b.merit - a.merit)[0]?.id || "renard" });
    if (["wolf", "river"].includes(oldOwner) && factionTerritories(s, oldOwner).length === 0) s.pendingDecisions.push({ type: "submission", faction: oldOwner });
    log(s, "good", `${targetName}陷落。此战折损${session.playerLoss}人，敌军约损失${session.enemyLoss}人；另留${garrisoned}名野战军维持占领。`);
    playSound("victory");
  } else if (outcome === "retreat") {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - (session.leaderIds.includes("ysabel") ? 2 : 6));
    s.renown = clamp(s.renown - 2);
    s.campaignCooldown = 2;
    if (session.flags.pushed && session.momentum > 10 && session.leaderIds.includes("renard")) officer(s, "renard").grievance = clamp(officer(s, "renard").grievance + 8);
    log(s, "warn", `军队从${targetName}有序撤回，折损${session.playerLoss}人；敌方约有${persistentEnemyLoss}人的战损无法及时补充。`);
  } else {
    const t = s.territories[targetId];
    persistentEnemyLoss = Math.min(Math.max(0, t.guard - 8), Math.round(session.enemyLoss * .72));
    t.guard = Math.max(8, t.guard - persistentEnemyLoss);
    if (persistentEnemyLoss > 0) { t.stability = clamp(t.stability - 2); t.devastated = Math.max(t.devastated, 1); }
    s.morale = clamp(s.morale - 10);
    s.renown = clamp(s.renown - 3);
    s.support = clamp(s.support - 3);
    s.campaignCooldown = 3;
    lostGold = Math.min(Math.max(0, s.gold), 4 + Math.ceil(session.playerLoss / 3));
    lostGrain = Math.min(Math.max(0, s.grain), 6 + Math.ceil(session.playerLoss / 2));
    s.gold -= lostGold;
    s.grain -= lostGrain;
    leaders.forEach(o => { o.loyalty = clamp(o.loyalty - 2); o.grievance = clamp(o.grievance + 3); });
    log(s, "bad", `${targetName}进攻失败，${session.playerLoss}人没有回来，辎重丢失${lostGold}金币与${lostGrain}粮食；敌方约有${persistentEnemyLoss}人的战损无法及时补充。`);
  }
  const report = { targetId, targetName, outcome, losses: session.playerLoss, lossesByType, composition: clone(session.composition), enemyLoss: session.enemyLoss, persistentEnemyLoss, garrisoned, lostGold, lostGrain, history: clone(session.history), momentum: session.momentum, injured };
  s.lastBattle = report;
  s.battleSession = null;
  if (ownTerritoryIds(s).length === Object.keys(TERRITORY_DEFS).length) s.pendingDecisions.push({ type: "iron_crown" });
  checkDefeat(s);
  saveGame();
  return { ended: true, report };
}

function enemyPressure(s, rng = Math.random) {
  if (s.turn < 2 || s.ended) return null;
  const chance = { standard: .17, hard: .25, brutal: .34 }[s.difficulty] || .17;
  if (rng() > chance) return null;
  const candidates = [];
  ["wolf", "river", "crown"].forEach(faction => {
    factionTerritories(s, faction).forEach(enemyId => {
      TERRITORY_DEFS[enemyId].adj.forEach(id => {
        if (owns(s, id)) candidates.push({ faction, enemyId, targetId: id });
      });
    });
  });
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const t = s.territories[pick.targetId];
  const source = s.territories[pick.enemyId];
  const attack = (source.guard * .66 + 15 + s.turn * .45) * difficultyOf(s).enemy * (.82 + rng() * .42);
  const defense = t.guard + t.buildings.walls * 8 + t.stability * .18;
  if (attack > defense * 1.12) {
    const oldHolder = t.fiefHolder;
    if (oldHolder && oldHolder !== "charter") {
      const holder = officer(s, oldHolder);
      if (holder) { holder.fief = null; holder.loyalty = clamp(holder.loyalty - 8); }
    }
    t.owner = pick.faction;
    t.fiefHolder = null;
    t.stability = 42;
    t.guard = Math.max(18, Math.round(attack * .36));
    t.devastated = 2;
    s.morale = clamp(s.morale - 7);
    s.renown = clamp(s.renown - 4);
    log(s, "bad", `${FACTIONS[pick.faction].name}越过边界，夺走了${TERRITORY_DEFS[pick.targetId].name}。`);
    if (pick.targetId === "ravenstone") { s.ended = true; s.endingReason = "fallen"; }
    return "captured";
  }
  const grainLoss = Math.min(s.grain, 5 + Math.floor(rng() * 9));
  const goldLoss = Math.min(Math.max(0, s.gold), 3 + Math.floor(rng() * 7));
  s.grain -= grainLoss; s.gold -= goldLoss; t.stability = clamp(t.stability - 5); t.devastated = Math.max(t.devastated, 1);
  log(s, "warn", `${FACTIONS[pick.faction].name}袭扰${TERRITORY_DEFS[pick.targetId].name}，抢走${grainLoss}粮食和${goldLoss}金币。`);
  return "raided";
}

function checkDefeat(s) {
  if (s.ended) return true;
  if (!owns(s, "ravenstone")) { s.ended = true; s.endingReason = "fallen"; return true; }
  s.crisis ||= { famine: 0, debt: 0, unrest: 0, checkedTurn: -1 };
  if (s.crisis.checkedTurn !== s.turn) {
    s.crisis.famine = s.grain <= 0 ? s.crisis.famine + 1 : 0;
    s.crisis.debt = s.gold < -25 ? s.crisis.debt + 1 : 0;
    s.crisis.unrest = s.support < 12 ? s.crisis.unrest + 1 : 0;
    s.crisis.checkedTurn = s.turn;
  }
  if (s.crisis.famine >= 3 || s.crisis.debt >= 3 || s.crisis.unrest >= 2 || (armyTotal(s) <= 0 && s.morale < 10)) {
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
      body: `<p>夺城只用了一个季度，真正的统治可能需要几年。当地的旧吏、村长和俘虏都在等你决定。</p><p>亲自统治可保留全部收入；分封能兑现功臣的功劳；地方自治最容易换来民心，却会失去一部分税收。</p>`,
      options: [
        { name: "纳入直属领地", note: "保留全部收入；稳定 +7，正统 +2，未获封功臣可能不满", effect() { t.fiefHolder = null; t.stability = clamp(t.stability + 7); s.legitimacy = clamp(s.legitimacy + 2); if (hero && hero.merit >= 20) hero.grievance = clamp(hero.grievance + 6); s.style.wealth++; log(s, "info", `${d.name}被纳入领主直辖。`); } },
        ...(hero && hero.side === "player" && hero.id !== "player" && !hero.fief ? [{ name: `把${d.name}封给${hero.name}`, note: "该家臣忠诚 +14；领地上缴七成收入，稳定 +13", effect() { t.fiefHolder = hero.id; t.stability = clamp(t.stability + 13); hero.fief = decision.territoryId; hero.loyalty = clamp(hero.loyalty + 14); hero.grievance = 0; hero.merit = Math.max(0, hero.merit - 12); s.legitimacy = clamp(s.legitimacy + (hero.id === "edmund" ? -2 : 1)); s.style.oath++; log(s, "good", `${hero.name}跪下接受了${d.name}的封地。`); } }] : []),
        { name: "允许村镇自治", note: "领地只上缴约八成收入；稳定 +18，民心 +5，正统 −2", effect() { t.fiefHolder = "charter"; t.stability = clamp(t.stability + 18); s.support = clamp(s.support + 5); s.legitimacy = clamp(s.legitimacy - 2); s.style.oath += 2; log(s, "good", `${d.name}获得自治特许状。`); } }
      ]
    };
  }
  if (decision.type === "submission") {
    const leader = officer(s, decision.faction === "wolf" ? "bran" : "aveline");
    const isBran = leader.id === "bran";
    return {
      kicker: "败者的誓言", title: `${leader.name}把武器放在了你的脚边`, portrait: leader.portrait,
      body: `<p>${isBran ? "“你拿走了我的渡口和山关。狼牙不会向城墙下跪，但会跟随真正打赢我们的人。”" : "“河望家的旗已经落下。我可以把河地的账册和渡船交给你，也可以带着我的名字离开北境。”"}</p><p>接纳旧领主能迅速稳定新领地，也把一个有野心的人带进了你的大厅。</p>`,
      options: [
        { name: "接受效忠，让其保留名号", note: "加入家臣；此前关系会影响初始忠诚；长矛兵 +6，新领地稳定 +8", effect() { const original = OFFICER_DEFS[leader.id].loyalty; const base = s.oath === "oath" ? 67 : s.oath === "iron" ? 58 : 61; const relation = clamp(Math.round((leader.loyalty - original) * .75 - leader.grievance / 4), -12, 12); leader.side = "player"; leader.loyalty = clamp(base + relation); leader.grievance = Math.max(0, Math.round(leader.grievance * .35)); addUnits(s, "levy", 6); factionTerritories(s, "player").forEach(id => { if (TERRITORY_DEFS[id].owner === decision.faction) s.territories[id].stability = clamp(s.territories[id].stability + 8); }); s.style.oath++; log(s, "good", `${leader.name}宣誓成为渡鸦家的家臣。此前的交往决定了这份誓言有多牢固。`); } },
        { name: "收取赎金，准其离境", note: "金币 +26，威望 +2；该人物永久离场", effect() { leader.side = "gone"; s.gold += 26; s.renown = clamp(s.renown + 2); s.style.wealth += 2; log(s, "info", `${leader.name}以赎金换取了离开北境的道路。`); } },
        { name: "折断武器，永不准其回来", note: "正统 +3，军心 +4；民心 −3", effect() { leader.side = "gone"; s.legitimacy = clamp(s.legitimacy + 3); s.morale = clamp(s.morale + 4); s.support = clamp(s.support - 3); s.style.iron += 2; log(s, "warn", `${leader.name}被放逐，旧旗帜在城门外烧成灰。`); } }
      ]
    };
  }
  if (decision.type === "first_winter") {
    return {
      kicker: "第一场雪", title: "城门外来了三十户没有粮食的人", portrait: "assets/oswin.webp",
      body: `<p>灰麦原的战乱烧掉了他们的村庄。奥斯温说仓库勉强能接济；伊莎贝尔提醒你，冬天才刚开始。</p><p>大厅里的人都在看你如何对待第一批求助者。</p>`,
      options: [
        { name: "打开粮仓，让他们进城", note: "粮食 −22，民心 +12，正统 +2；奥斯温忠诚 +5", disabled: s.grain < 22, effect() { s.grain -= 22; s.support = clamp(s.support + 12); s.legitimacy = clamp(s.legitimacy + 2); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty + 5); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance - 5); s.style.oath += 2; log(s, "good", "渡鸦堡为失去家园的人打开了粮仓。"); } },
        { name: "给一半口粮，让他们去南边", note: "粮食 −10，民心 +3；奥斯温怨气 +3", disabled: s.grain < 10, effect() { s.grain -= 10; s.support = clamp(s.support + 3); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 3); s.style.wealth++; log(s, "info", "难民拿到十袋麦子，被指向了南方的道路。"); } },
        { name: "关门。城堡先养活自己人", note: "粮食不变，军心 +3，民心 −10；奥斯温忠诚 −7、怨气 +12", effect() { s.morale = clamp(s.morale + 3); s.support = clamp(s.support - 10); officer(s, "oswin").loyalty = clamp(officer(s, "oswin").loyalty - 7); officer(s, "oswin").grievance = clamp(officer(s, "oswin").grievance + 12); s.style.iron += 2; log(s, "bad", "雪下了一夜，城门始终没有打开。奥斯温把这次警告记进了自己的账。"); } }
      ]
    };
  }
  if (decision.type === "cousin_demand") {
    const edmund = officer(s, "edmund");
    return {
      kicker: "家族暗流", title: "埃德蒙希望独自指挥下一次远征", portrait: "assets/edmund.webp",
      body: `<p>“我不是要你的椅子。我只是想证明，当年没有被写进族谱，并不代表我比任何人差。”</p><p>他的能力毋庸置疑。问题在于，城里已经有人私下称他为“另一只渡鸦”。</p>`,
      options: [
        { name: "给他军旗，让能力说话", note: "埃德蒙忠诚 +8、功勋 +5；正统 −3", effect() { edmund.loyalty = clamp(edmund.loyalty + 8); edmund.merit += 5; s.legitimacy = clamp(s.legitimacy - 3); s.style.oath++; log(s, "info", "埃德蒙第一次以独立统帅的身份接过军旗。"); } },
        { name: "让他在大厅里认清自己的位置", note: "正统 +4；埃德蒙忠诚 −10、怨气 +14", effect() { s.legitimacy = clamp(s.legitimacy + 4); edmund.loyalty = clamp(edmund.loyalty - 10); edmund.grievance = clamp(edmund.grievance + 14); s.style.iron += 2; log(s, "warn", "埃德蒙低头退下，但把那句话记住了。"); } },
        { name: "让他先去整顿商路", note: "金币 +10；埃德蒙忠诚 −3、治政功勋 +3", effect() { s.gold += 10; edmund.loyalty = clamp(edmund.loyalty - 3); edmund.merit += 3; s.style.wealth += 2; log(s, "info", "埃德蒙被派去整顿商路，带回了钱，也带回了沉默。"); } }
      ]
    };
  }
  if (decision.type === "royal_tax") {
    return {
      kicker: "王室催税", title: "摄政公爵要你补上父亲欠下的四十枚金币", portrait: "assets/ysabel.webp",
      body: `<p>使者把封蜡完好的命令放在长桌上。按时缴纳能保住名义上的合法地位；拒绝，则等于承认你准备靠军队回答王城。</p>`,
      options: [
        { name: "如数缴纳", note: "金币 −40，正统 +12", disabled: s.gold < 40, effect() { s.gold -= 40; s.legitimacy = clamp(s.legitimacy + 12); s.style.oath++; log(s, "info", "王室税金装箱南下，公爵的使者满意离开。"); } },
        { name: "只付一半，再送一封好信", note: "金币 −20，正统 +3，威望 −2", disabled: s.gold < 20, effect() { s.gold -= 20; s.legitimacy = clamp(s.legitimacy + 3); s.renown = clamp(s.renown - 2); s.style.wealth += 2; log(s, "warn", "你付了一半欠税，把剩下的争议留给措辞优美的信件。"); } },
        { name: "把催税令扔进火里", note: "威望 +8，军心 +6，正统 −12", effect() { s.renown = clamp(s.renown + 8); s.morale = clamp(s.morale + 6); s.legitimacy = clamp(s.legitimacy - 12); s.style.iron += 2; log(s, "warn", "王室催税令在大厅里烧成灰，北境从此知道你不会再低头。"); } }
      ]
    };
  }
  if (decision.type === "iron_crown") {
    return {
      kicker: "终章 · 铁冠", title: "摄政公爵的旗落下了", portrait: "assets/player.webp",
      body: `<p>七块领地第一次在同一面旗帜下报出收成、税金与兵数。旧王朝留下的铁冠就放在你面前，它并不华丽，甚至还留着一道斧痕。</p><p>家臣们等待你决定，从明天起，人们该怎样称呼这片土地的主人。</p>`,
      options: [
        { name: "以守誓者之名戴上铁冠", note: "结局将依据你的实际统治作风评价", effect() { s.style.oath++; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}在众家臣面前戴上铁冠。`); } },
        { name: "让所有人跪下，再戴上它", note: "铁腕统治 +2", effect() { s.style.iron += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}让大厅安静下来，然后戴上铁冠。`); } },
        { name: "先封住国库，再举行仪式", note: "富国统治 +2", effect() { s.style.wealth += 2; s.ended = true; s.endingReason = "unified"; log(s, "good", `${s.playerName}先接过账册，随后才接过铁冠。`); } }
      ]
    };
  }
  return null;
}

function pumpDecision() {
  if (!S || S.ended || !S.pendingDecisions.length || typeof document === "undefined") {
    $("modalMask")?.classList.add("hidden");
    return;
  }
  const view = decisionView(S, S.pendingDecisions[0]);
  if (!view) { S.pendingDecisions.shift(); saveGame(); pumpDecision(); return; }
  $("modalMask").classList.remove("hidden");
  $("modalKicker").textContent = view.kicker;
  $("modalTitle").textContent = view.title;
  $("modalBody").innerHTML = view.body;
  $("modalPortrait").src = view.portrait;
  $("modalPortrait").alt = view.title;
  $("modalResources").innerHTML = [["金币", Math.round(S.gold)], ["粮食", Math.round(S.grain)], ["民心", Math.round(S.support)], ["正统", Math.round(S.legitimacy)]].map(([label, value]) => `<span><small>${label}</small><b>${value}</b></span>`).join("");
  $("modal").scrollTop = 0;
  playSound("event");
  $("modalOptions").innerHTML = view.options.map((opt, i) => {
    const plus = (opt.note.match(/\+/g) || []).length;
    const minus = (opt.note.match(/−/g) || []).length;
    const tone = plus && !minus ? "gain" : minus && !plus ? "risk" : plus && minus ? "mixed" : "neutral";
    return `<button class="${tone}" data-decision-option="${i}" ${opt.disabled ? "disabled" : ""}><b>${esc(opt.name)}</b><small>${esc(opt.note)}</small></button>`;
  }).join("");
  $("modalOptions").querySelectorAll("[data-decision-option]").forEach(button => button.addEventListener("click", () => {
    const option = view.options[Number(button.dataset.decisionOption)];
    if (!option || option.disabled) return;
    option.effect();
    playSound("click");
    S.pendingDecisions.shift();
    $("modalMask").classList.add("hidden");
    saveGame();
    renderAll();
    if (!S.ended) pumpDecision();
  }));
}

function metrics(items) {
  return `<div class="metrics">${items.map(([value, label]) => `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join("")}</div>`;
}

function currentStyle(s) {
  return Object.entries(s.style).sort((a, b) => b[1] - a[1])[0][0];
}

function renderTop() {
  syncTroops(S);
  const season = seasonOf(S);
  const f = forecast(S);
  $("chapterText").textContent = `第${yearOf(S)}年 · ${season.name}季`;
  $("turnText").textContent = `${Math.min(S.turn + 1, MAX_TURNS)} / ${MAX_TURNS}`;
  $("apText").textContent = `${S.ap} / 3`;
  $("goldText").textContent = Math.round(S.gold);
  $("grainText").textContent = Math.round(S.grain);
  $("troopText").textContent = Math.round(S.troops);
  $("phaseText").textContent = season.phase;
  $("turnHint").textContent = S.battleSession ? "远征尚未结束" : `${season.note}`;
  $("endSeasonBtn").disabled = !!S.battleSession;
  $("playerNameText").textContent = S.playerName;
  $("oathBadge").textContent = OATHS[S.oath].name;
  $("territoryCount").textContent = `${ownTerritoryIds(S).length} / ${Object.keys(TERRITORY_DEFS).length}`;
  [["support", S.support], ["morale", S.morale], ["renown", S.renown], ["legitimacy", S.legitimacy], ["weariness", S.warWeariness]].forEach(([id, value]) => {
    $(`${id}Text`).textContent = Math.round(value);
    $(`${id}Bar`).style.width = `${clamp(value)}%`;
  });
  $("netGoldText").textContent = `${f.netGold >= 0 ? "+" : ""}${f.netGold} 金`;
  $("forecastList").innerHTML = [
    ["领地税收", `+${f.gold}`], ["粮食产出", `+${f.grain}`], ["军饷家臣", `−${f.goldCost}`], ["人口军粮", `−${f.grainCost}`], ["仓储损耗", f.spoilage ? `−${f.spoilage}` : "0"]
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

function renderHall() {
  const panel = $("panel");
  const available = ACTIONS;
  const council = ["oswin", "renard", "ysabel", "edmund"].map(id => officer(S, id)).filter(o => o?.side === "player");
  const f = forecast(S);
  panel.innerHTML = `
    <section class="hero-panel">
      <span class="eyebrow">THE GREAT HALL</span>
      <h2>${yearOf(S) === 1 ? "先让渡鸦堡活下来，再谈铁冠" : `第${yearOf(S)}年的账本，比战报更诚实`}</h2>
      <p>${seasonOf(S).note} 每次行动都在金币、粮食、民心、军队和家臣关系之间留下代价。</p>
      ${metrics([[subjects(S), "治下人口"], [armyTotal(S), "军队总数"], [`${f.netGrain >= 0 ? "+" : ""}${f.netGrain}`, "本季余粮"], [S.warWeariness, "战争疲劳"]])}
    </section>
    ${S.lastAction ? `<div class="feedback-banner"><b>${esc(S.lastAction.name)}</b><p>${esc(S.lastAction.text)}</p></div>` : ""}
    <div class="section-head"><h2>本季度议程</h2><span>每类行动每季只能安排一次</span></div>
    <div class="action-grid">${available.map(action => {
      const used = S.usedActions[action.id] || 0;
      const locked = action.canRun && !action.canRun(S);
      const disabled = S.ap < 1 || used >= action.max || locked;
      return `<article class="action-card ${used ? "used" : ""}"><div class="action-icon">${action.icon}</div><h3>${action.name}</h3><p>${action.desc}</p><div class="effect-row">${action.effects.map(e => `<span>${e}</span>`).join("")}</div><button data-action="${action.id}" ${disabled ? "disabled" : ""}>${used ? "本季已安排" : S.ap < 1 ? "行动点已用完" : locked ? "资源不足" : "安排 · 1点"}</button></article>`;
    }).join("")}</div>
    <div class="section-head"><h2>长桌两侧的人</h2><span>忠诚不是固定数值</span></div>
    <div class="council-row">${council.length ? council.map(o => officerCard(o)).join("") : `<div class="empty-state">长桌两侧已经无人应答。失去的家臣不会再参与议政。</div>`}</div>`;
  panel.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => applyAction(button.dataset.action)));
}

function officerCard(o, enemy = false) {
  if (!o) return "";
  const fief = o.fief ? TERRITORY_DEFS[o.fief]?.name : "无封地";
  const status = enemy ? FACTIONS[o.side]?.name || "已离场" : o.id === "player" ? "领主本人" : `忠诚 ${Math.round(o.loyalty)}`;
  const arcTotal = NPC_ARCS.filter(event => event.officerId === o.id).length;
  const arcDone = NPC_ARCS.filter(event => event.officerId === o.id && S.seenNpcEvents.includes(event.id)).length;
  return `<article class="officer-card ${enemy ? "enemy" : ""} ${o.injured ? "injured" : ""}">
    <img src="${o.portrait}" alt="${esc(o.name)}">
    <div class="card-copy"><div class="role-line"><h3>${esc(o.name)}</h3><span>${esc(o.title)}</span></div><p>${esc(o.trait)} · ${esc(o.traitText)}</p>
    <div class="stat-chips"><span>武${o.stats.force}</span><span>统${o.stats.command}</span><span>谋${o.stats.scheme}</span><span>治${o.stats.govern}</span><span>魅${o.stats.charm}</span></div>
    <div class="loyalty-line"><span>${status}</span><b>${o.injured ? `伤${o.injured}季` : enemy ? o.trait : `${fief} · 功${o.merit}`}${arcTotal ? ` · 剧情${arcDone}/${arcTotal}` : ""}</b></div><div class="loyalty-track"><i style="width:${enemy ? 56 : clamp(o.loyalty)}%"></i></div></div>
  </article>`;
}

function renderDomain() {
  const panel = $("panel");
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE DEMESNE</span><h2>土地不是地图上的颜色，是下一场冬天的口粮</h2><p>直辖地上缴全部产出；封给家臣后只上缴七成，但能兑现功劳并稳定新领地。每项建设最高三级。</p>${metrics([[ownTerritoryIds(S).length, "治下领地"], [subjects(S), "人口"], [forecast(S).grain, "本季产粮"], [forecast(S).gold, "本季税收"]])}</section>
    <div class="section-head"><h2>领地与建设</h2><span>建设消耗1点行动</span></div>
    <div class="domain-grid">${ownTerritoryIds(S).map(domainCard).join("")}</div>`;
  panel.querySelectorAll("[data-upgrade]").forEach(button => button.addEventListener("click", () => upgradeBuilding(button.dataset.territory, button.dataset.upgrade)));
  panel.querySelectorAll("[data-policy]").forEach(button => button.addEventListener("click", () => setTerritoryPolicy(button.dataset.territory, button.dataset.policy)));
}

function domainCard(id) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const out = territoryOutput(S, id);
  const holder = t.fiefHolder === "charter" ? "自治特许" : t.fiefHolder ? `${officer(S, t.fiefHolder)?.name || "旧领主"}封地` : "领主直辖";
  const activePolicy = POLICIES[t.policy] || POLICIES.balanced;
  return `<article class="domain-card"><div class="owner-line"><span>${esc(d.terrain)} · ${holder}</span><b>稳定 ${Math.round(t.stability)}</b></div><h3>${d.name}</h3><div class="stat-chips"><span>本季 ${out.gold}金</span><span>${out.grain}粮</span><span>守军 ${t.guard}</span><span>${t.devastated ? `战损${t.devastated}季` : "生产正常"}</span></div>
    <div class="building-grid">${Object.entries(BUILDINGS).map(([type, b]) => {
      const level = t.buildings[type];
      const cost = buildingCost(S, id, type);
      return `<div class="building-card"><b>${glyphSvg(type)}${b.name} · ${level}/3</b><small>${b.desc}</small><button data-territory="${id}" data-upgrade="${type}" ${!canUpgrade(S, id, type) ? "disabled" : ""}>${level >= 3 ? "已达最高级" : `升级 · ${cost}金 · 1点`}</button></div>`;
    }).join("")}</div><div class="policy-block"><div class="policy-title"><span>持续领地政策</span><b>${activePolicy.name}</b></div><div class="policy-grid">${Object.entries(POLICIES).map(([policyId, policy]) => { const active = t.policy === policyId; return `<button class="policy-btn ${active ? "active" : ""}" data-territory="${id}" data-policy="${policyId}" aria-pressed="${active}" ${!active && (S.ap < 1 || S.usedActions[`policy_${id}`]) ? "disabled" : ""}><b>${policy.name}</b><small>${policyId === "balanced" ? "收支稳定" : policyId === "relief" ? "稳民减税" : policyId === "extract" ? "增金伤稳" : "减产增防"}</small></button>`; }).join("")}</div></div></article>`;
}

function renderMap() {
  const panel = $("panel");
  const attackable = attackableTerritories(S);
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE NORTHERN MARCH</span><h2>守军、道路与河流，才是北境真正的边界</h2><p>金边闪烁的据点可以出征，明亮连线是当前战线。王冠谷需统一其余六领，并等到第7年王室威信动摇后开放。</p>${metrics([[ownTerritoryIds(S).length, "已控制"], [attackable.length, "可进攻"], [factionTerritories(S, "wolf").length, "狼牙领地"], [factionTerritories(S, "river").length, "河望领地"]])}</section>
    <div class="section-head"><h2>北境七领军势图</h2><span>点击据点查看或制定远征</span></div>
    <div class="map-shell"><div class="map-legend">${Object.entries(FACTIONS).map(([id, f]) => `<span style="--crest-color:${f.color}">${crestSvg(id, f.name)}${f.name}</span>`).join("")}</div><div class="realm-map">${mapRoutes(S)}${Object.keys(TERRITORY_DEFS).map(id => mapNode(id, attackable)).join("")}</div><div class="map-inspector">${Object.keys(TERRITORY_DEFS).map(id => territorySummary(id)).join("")}</div></div>`;
  panel.querySelectorAll("[data-map-territory]").forEach(button => button.addEventListener("click", () => {
    const id = button.dataset.mapTerritory;
    if (!attackable.includes(id)) {
      const crownLocked = TERRITORY_DEFS[id].final && (ownTerritoryIds(S).length < 6 || S.turn < CROWN_OPEN_TURN);
      toast(owns(S, id) ? `${TERRITORY_DEFS[id].name}由你控制` : crownLocked ? `统一其余六领并坚持到第7年，才能叩击王冠谷` : "这块领地尚未与我方接壤");
      return;
    }
    battleDraft.targetId = id;
    S.tab = "campaign";
    saveGame(); renderAll(); resetPageScroll();
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
  const locked = d.final && (ownTerritoryIds(S).length < 6 || S.turn < CROWN_OPEN_TURN);
  return `<button type="button" data-map-territory="${id}" class="map-node map-${id} ${mine ? "mine" : ""} ${canAttack ? "attackable" : ""} ${locked ? "locked" : ""}" style="--owner-color:${faction.color}">${crestSvg(t.owner, faction.name)}<span><b>${d.name}</b><small>${canAttack ? "可出征" : mine ? "我方 · " + t.guard : `守军 ${t.guard}`}</small></span></button>`;
}

function territorySummary(id) {
  const d = TERRITORY_DEFS[id];
  const t = S.territories[id];
  const faction = FACTIONS[t.owner];
  return `<article style="--owner-color:${faction.color}"><small style="color:${faction.color}">${faction.name}</small><h3>${d.name}</h3><p>${d.terrain}<br>守军 ${t.guard} · 稳定 ${Math.round(t.stability)}</p></article>`;
}

function terrainAdvice(targetId, composition) {
  if (targetId === "ashfield") return composition.knights >= 3 ? "开阔农田让骑士获得完整冲击距离。" : "开阔地缺少遮蔽，没有骑士时突破会更依赖人数。";
  if (targetId === "pineford") return composition.archers >= 4 ? "弓手可借密林掩护前进，骑士难以展开。" : "密林会削弱骑士，最好带足弓手或谋略家臣。";
  if (targetId === "highpass") return "山道狭窄，弓手和长矛兵更可靠，骑士战力大幅受限。";
  if (["crossford", "riverwatch"].includes(targetId)) return "河网切碎冲锋路线，弓手能隔水压制守军。";
  return "王城高墙会削弱远射和骑兵，人数、军心与攻城方略更加重要。";
}

function armyRosterHtml() {
  return `<div class="army-roster">${Object.entries(UNIT_DEFS).map(([type, unit]) => { const actionKey = type === "levy" ? "recruit" : `unit_${type}`; return `<article class="unit-card"><div class="unit-head"><b>${glyphSvg(type)}${unit.name}</b><strong>${S.army[type]}</strong></div><p>${unit.desc}</p><button data-recruit-unit="${type}" ${!canRecruitUnit(S, type) ? "disabled" : ""}>${S.usedActions[actionKey] ? "本季已征募" : type === "knights" && S.renown < 15 && ownTerritoryIds(S).reduce((n, id) => n + S.territories[id].buildings.barracks, 0) < 2 ? "需要15威望或2级兵营" : `征募 +${recruitAmount(S, type)} · ${unit.gold}金/${unit.grain}粮 · 1点`}</button></article>`; }).join("")}</div>`;
}

function renderCampaign() {
  if (S.battleSession) { renderActiveBattle(); return; }
  syncTroops(S);
  const panel = $("panel");
  const attackable = attackableTerritories(S);
  const crownWait = ownTerritoryIds(S).length >= 6 && S.turn < CROWN_OPEN_TURN;
  const targets = crownWait && !attackable.length ? ["crownvale"] : attackable;
  if (!targets.length) {
    panel.innerHTML = `<div class="empty-state">目前没有可进攻的相邻领地。先守住边界，或等待新的战线出现。</div>${S.lastBattle ? renderLastBattle(S.lastBattle) : ""}`;
    return;
  }
  const available = ownedOfficers(S).filter(o => !o.injured);
  if (!targets.includes(battleDraft.targetId)) battleDraft.targetId = targets[0];
  battleDraft.leaderIds = battleDraft.leaderIds.filter(id => available.some(o => o.id === id)).slice(0, 3);
  if (!battleDraft.leaderIds.length) battleDraft.leaderIds = available.slice().sort((a, b) => b.stats.command - a.stats.command).slice(0, 3).map(o => o.id);
  battleDraft.troops = clamp(battleDraft.troops, 10, Math.max(10, armyTotal(S)));
  const est = battleEstimate(S, battleDraft.targetId, battleDraft.leaderIds, battleDraft.troops, battleDraft.plan);
  const supply = campaignSupply(S, battleDraft.troops, battleDraft.leaderIds);
  const risk = casualtyForecast(S, battleDraft.targetId, battleDraft.leaderIds, battleDraft.troops, battleDraft.plan);
  const targetLocked = crownWait && battleDraft.targetId === "crownvale";
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE WAR COUNCIL</span><h2>同样四十个人，在密林和平原不是同一支军队</h2><p>兵种、季节、地形、选将与军心共同决定基础胜算。远征消耗2点行动；战后要整补，夺城还必须从野战军中留下驻军。</p>${metrics([[S.army.levy, "长矛兵"], [S.army.archers, "弓箭手"], [S.army.knights, "披甲骑士"], [S.campaignCooldown ? `${S.campaignCooldown}季` : "就绪", "远征整补"]])}</section>
    <div class="section-head"><h2>军队编成</h2><span>征募每类兵种每季一次</span></div>${armyRosterHtml()}
    <div class="section-head"><h2>远征计划</h2><span>消耗2点行动；战后需整补</span></div>
    ${crownWait ? `<div class="campaign-lock-note">六领已服，但摄政公爵仍握着王室名分。王冠谷将在第7年开放；你仍可在此征募、调整编成并准备决战。</div>` : ""}
    <div class="battle-layout"><div class="battle-targets">${targets.map(id => `<button class="target-row ${id === battleDraft.targetId ? "active" : ""} ${targetLocked && id === "crownvale" ? "locked" : ""}" data-target="${id}"><b>${TERRITORY_DEFS[id].name}</b><span>${targetLocked && id === "crownvale" ? "第7年开放" : `${FACTIONS[S.territories[id].owner].name} · ${TERRITORY_DEFS[id].terrain} · 守军${S.territories[id].guard}`}</span></button>`).join("")}</div>
    <div class="battle-form"><span class="form-label">行军方略</span><div class="plan-grid">${Object.entries(PLANS).map(([id, p]) => `<button class="plan-btn ${battleDraft.plan === id ? "active" : ""}" data-plan="${id}"><b>${p.name}</b><small>${p.desc}</small></button>`).join("")}</div>
    <span class="form-label">随军人物（最多3人）</span><div class="leader-checks">${available.map(o => `<div class="leader-check"><input id="lead_${o.id}" type="checkbox" data-leader="${o.id}" ${battleDraft.leaderIds.includes(o.id) ? "checked" : ""}><label for="lead_${o.id}">${esc(o.name)} · ${esc(o.title)}</label></div>`).join("")}</div>
    <span class="form-label">参战兵力：<b id="troopValue">${battleDraft.troops}</b> / ${armyTotal(S)}</span><input id="troopRange" class="troop-range" type="range" min="10" max="${Math.max(10, armyTotal(S))}" value="${battleDraft.troops}">
    <div class="army-summary">本次编成：<b>${compositionText(est.composition)}</b><br>${terrainAdvice(battleDraft.targetId, est.composition)} ${seasonOf(S).id === "winter" ? "严冬会额外削弱骑士并增加军粮消耗。" : ""}</div>
    <div id="battleEstimate" class="battle-estimate ${battleRiskClass(est.ratio)}">战前判断：<b>${est.label}</b><br>攻守比 ${est.ratio.toFixed(2)} · 预计折损 ${risk.low}—${risk.high} 人 · 携带 ${supply} 粮食 · 疲劳压制 ${Math.round((1 - est.fatigue) * 100)}%。${est.effectiveMorale !== S.morale ? `<br>领主亲征：军心按 ${Math.round(est.effectiveMorale)} 计入。` : ""}</div>
    <button id="launchBattle" class="launch-btn ${battleRiskClass(est.ratio)}" ${targetLocked || S.ap < CAMPAIGN_AP_COST || S.usedActions.campaign || S.campaignCooldown > 0 || armyTotal(S) < 10 || S.grain < supply || !battleDraft.leaderIds.length ? "disabled" : ""}>${targetLocked ? "王冠谷 · 第7年开放" : S.campaignCooldown > 0 ? `军队整补中 · 还需${S.campaignCooldown}季` : S.usedActions.campaign ? "本季已经出征" : S.ap < CAMPAIGN_AP_COST ? "需要2点行动" : S.grain < supply ? "军粮不足" : `出征 · ${TERRITORY_DEFS[battleDraft.targetId].name}`}</button></div></div>
    ${S.lastBattle ? renderLastBattle(S.lastBattle) : ""}`;
  panel.querySelectorAll("[data-target]").forEach(button => button.addEventListener("click", () => { battleDraft.targetId = button.dataset.target; renderCampaign(); }));
  panel.querySelectorAll("[data-plan]").forEach(button => button.addEventListener("click", () => { battleDraft.plan = button.dataset.plan; renderCampaign(); }));
  panel.querySelectorAll("[data-recruit-unit]").forEach(button => button.addEventListener("click", () => recruitUnit(button.dataset.recruitUnit)));
  panel.querySelectorAll("[data-leader]").forEach(input => input.addEventListener("change", () => {
    const id = input.dataset.leader;
    if (input.checked) {
      if (battleDraft.leaderIds.length >= 3) { input.checked = false; toast("最多选择3名随军人物"); return; }
      battleDraft.leaderIds.push(id);
    } else battleDraft.leaderIds = battleDraft.leaderIds.filter(x => x !== id);
    renderCampaign();
  }));
  $("troopRange")?.addEventListener("input", event => {
    battleDraft.troops = Number(event.target.value);
    $("troopValue").textContent = battleDraft.troops;
    const next = battleEstimate(S, battleDraft.targetId, battleDraft.leaderIds, battleDraft.troops, battleDraft.plan);
    const food = campaignSupply(S, battleDraft.troops, battleDraft.leaderIds);
    const nextRisk = casualtyForecast(S, battleDraft.targetId, battleDraft.leaderIds, battleDraft.troops, battleDraft.plan);
    $("battleEstimate").className = `battle-estimate ${battleRiskClass(next.ratio)}`;
    $("battleEstimate").innerHTML = `战前判断：<b>${next.label}</b><br>攻守比 ${next.ratio.toFixed(2)} · 预计折损 ${nextRisk.low}—${nextRisk.high} 人 · ${compositionText(next.composition)} · 携带 ${food} 粮食 · 疲劳压制 ${Math.round((1 - next.fatigue) * 100)}%。`;
  });
  $("launchBattle")?.addEventListener("click", () => {
    if (!startBattle(S, battleDraft)) { toast("现在无法发动这场远征"); return; }
    saveGame(); renderAll(); resetPageScroll();
  });
}

function renderActiveBattle() {
  const panel = $("panel");
  const session = S.battleSession;
  const target = TERRITORY_DEFS[session.targetId];
  const enemyFaction = S.territories[session.targetId].owner;
  const enemyCommander = defenderLeader(S, session.targetId);
  const playerLeaders = session.leaderIds.map(id => officer(S, id)).filter(Boolean);
  const options = stageOptions(S, session);
  const stageName = ["行军接敌", "两军交锋", "胜负将分"][session.stage];
  const marker = clamp(50 + session.momentum / 2, 1, 99);
  panel.innerHTML = `<section class="battle-session"><div class="battle-visual" style="background-image:url('${battleBackground(session.targetId)}')"><div class="battle-unit-row">${Object.entries(UNIT_DEFS).map(([type, unit]) => `<span class="battle-unit-chip">${glyphSvg(type)}<span>${unit.short}</span><b>${session.composition[type] || 0}</b></span>`).join("")}</div><div class="battle-commanders"><div class="commander-side" style="--crest-color:${FACTIONS.player.color}"><span class="crest">${crestSvg("player", FACTIONS.player.name)}</span><div><b>${playerLeaders.map(o => esc(o.name)).join("、")}</b><small>${FACTIONS.player.name} · ${compositionText(session.composition)}</small></div></div><div class="commander-side enemy" style="--crest-color:${FACTIONS[enemyFaction].color}"><span class="crest">${crestSvg(enemyFaction, FACTIONS[enemyFaction].name)}</span><div><b>${esc(enemyCommander?.name || FACTIONS[enemyFaction].name)}</b><small>${target.name} · 守军 ${S.territories[session.targetId].guard}</small></div></div></div></div><div class="battle-session-head"><span class="eyebrow">CAMPAIGN IN PROGRESS · ${esc(target.terrain)}</span><h2>${target.name}之战 · ${stageName}</h2><div class="stat-chips"><span>出征 ${session.troops}</span><span>${compositionText(session.composition)}</span><span>损失 ${compositionText(session.lossesByType || {})}</span><span>${PLANS[session.plan].name}</span></div><div class="momentum-label"><span>我军溃退</span><b>战场势头 ${Math.round(session.momentum) > 0 ? "+" : ""}${Math.round(session.momentum)}</b><span>敌军崩溃</span></div><div class="momentum-track"><i style="left:${marker}%"></i></div></div>
    <div class="battle-stage-list">${session.history.length ? session.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("") : `<div class="empty-state">两军尚未接触。随军人物正在等你的第一道命令。</div>`}</div>
    <div class="battle-choices"><h3>${stageName}：听谁的？</h3><div class="choice-stack">${options.map(o => `<button class="stage-choice" data-stage-choice="${o.id}"><b>${esc(o.name)}</b><small>${esc(o.by)} · ${esc(o.desc)}</small></button>`).join("")}</div></div></section>`;
  panel.querySelectorAll("[data-stage-choice]").forEach(button => button.addEventListener("click", () => {
    applyBattleChoice(S, button.dataset.stageChoice);
    saveGame();
    renderAll();
    if (!S.battleSession) pumpDecision();
  }));
}

function battleBackground(targetId) {
  if (targetId === "ashfield") return "assets/battle-plains.webp";
  if (targetId === "pineford") return "assets/battle-forest.webp";
  if (targetId === "highpass") return "assets/battle-mountain.webp";
  if (["crossford", "riverwatch"].includes(targetId)) return "assets/battle-river.webp";
  return "assets/battle-capital.webp";
}

function renderLastBattle(report) {
  const label = report.outcome === "win" ? "胜利" : report.outcome === "retreat" ? "撤退" : "战败";
  const lossText = report.lossesByType ? `（${compositionText(report.lossesByType)}）` : "";
  const costText = report.garrisoned ? ` · 留驻${report.garrisoned}人` : report.lostGold || report.lostGrain ? ` · 丢失${report.lostGold || 0}金/${report.lostGrain || 0}粮` : "";
  return `<div class="section-head"><h2>上一场战报</h2><span>${label}</span></div><div class="battle-session"><div class="battle-result"><span class="eyebrow">AFTER ACTION REPORT</span><strong>${label}</strong><p>${esc(report.targetName)} · 我军折损${report.losses}${lossText} · 敌军约损失${report.enemyLoss}${costText}${report.injured?.length ? ` · ${esc(report.injured.join("、"))}负伤` : ""}</p></div><div class="battle-stage-list">${report.history.map(h => `<article class="battle-stage"><time>${esc(h.name)}</time><div><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></article>`).join("")}</div></div>`;
}

function talkOfficer(id) {
  if (rejectDuringBattle(S)) return false;
  const o = officer(S, id);
  const key = `talk_${id}`;
  if (!o || o.side !== "player" || o.id === "player" || S.ap < 1 || S.gold < 3 || S.usedActions[key]) { toast("需要1点行动与3金币，且每季度只能召见一次"); return; }
  S.ap--;
  S.gold -= 3;
  S.usedActions[key] = 1;
  const gain = 3 + (S.oath === "oath" ? 1 : 0);
  o.loyalty = clamp(o.loyalty + gain);
  o.grievance = clamp(o.grievance - 5);
  S.lastAction = { name: `召见${o.name}`, text: `花费3金币安排私宴与赏赐。忠诚 +${gain}，怨气 −5。` };
  log(S, "info", `你在私室召见${o.name}，听完了那些不适合在长桌上说的话。`);
  saveGame(); renderAll();
}

function renderCourt() {
  const panel = $("panel");
  const own = ownedOfficers(S);
  const others = S.officers.filter(o => !["player", "gone"].includes(o.side));
  const averageLoyalty = own.length > 1 ? Math.round(own.filter(o => o.id !== "player").reduce((sum, o) => sum + o.loyalty, 0) / (own.length - 1)) : 100;
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE LORD'S COURT</span><h2>能替你夺城的人，也有能力夺走你的城</h2><p>忠诚、野心、功勋与封地会持续变化。高功勋家臣长期得不到土地，会积累怨气甚至带兵离开。</p>${metrics([[own.length, "我方人物"], [averageLoyalty, "平均忠诚"], [own.filter(o => o.fief).length, "受封家臣"], [own.reduce((sum, o) => sum + o.merit, 0), "总功勋"]])}</section>
    <div class="section-head"><h2>渡鸦堡家臣</h2><span>召见消耗1点行动与3金币，每季每人一次</span></div><div class="officer-grid">${own.map(o => `<div class="officer-slot">${officerCard(o)}${o.id !== "player" ? `<button class="secondary-btn" data-talk="${o.id}" ${S.ap < 1 || S.gold < 3 || S.usedActions[`talk_${o.id}`] ? "disabled" : ""}>召见 ${esc(o.name)} · 3金</button>` : ""}</div>`).join("")}</div>
    <div class="section-head"><h2>北境其他领主</h2><span>他们可以成为敌人、俘虏或家臣</span></div><div class="officer-grid">${others.length ? others.map(o => officerCard(o, true)).join("") : `<div class="empty-state">北境已经没有仍举着敌旗的著名领主。</div>`}</div>`;
  panel.querySelectorAll("[data-talk]").forEach(button => button.addEventListener("click", () => talkOfficer(button.dataset.talk)));
}

function renderChronicle() {
  const panel = $("panel");
  panel.innerHTML = `<section class="hero-panel"><span class="eyebrow">THE CHRONICLE</span><h2>编年史会记下胜利，也会记下粮仓为何空了</h2><p>每次建设、征税、封赏、战败、吞并和承诺都留在这里。最终评价依据你真正做过的事，而不是开局选择的名号。</p>${metrics([[S.battles, "远征场次"], [S.wins, "胜场"], [S.casualties, "累计阵亡"], [OATHS[currentStyle(S)].short, "当前作风"]])}</section>
    <div class="section-head"><h2>渡鸦堡编年史</h2><span>最近120条</span></div><div class="chronicle">${S.log.map(item => `<article class="log-row"><time>第${Math.floor(item.turn / 4) + 1}年 · ${SEASONS[item.turn % 4].name}</time><div><b>${item.kind === "good" ? "得势" : item.kind === "bad" ? "代价" : item.kind === "warn" ? "暗流" : "记事"}</b><p>${esc(item.text)}</p></div></article>`).join("")}</div>`;
}

function endingCopy(s) {
  const style = currentStyle(s);
  if (s.endingReason === "fallen") return { title: "渡鸦落地", text: "祖堡的旗在清晨被扯下。你曾经拥有土地、家臣和一枚印戒，最后却没有足够的人守住那扇门。" };
  if (s.endingReason === "collapsed") return { title: "空掉的大厅", text: "没有敌军攻破城墙。先离开的是拿不到军饷的士兵，然后是没有粮食的村民，最后连家臣也不再来参加议事。" };
  if (s.endingReason === "minor_lord") return { title: "守堡之人", text: "十二年过去，渡鸦堡仍在你手里。你没有拿到铁冠，却让这个曾经漏雨的家活了下来。北境不会歌颂你，但会记得你。" };
  if (s.endingReason === "great_lord") return { title: "无冠之主", text: "期限结束时，你已经控制北境大半土地。王冠谷仍在远处，但任何一道王命都必须先问过你的军队和粮仓。" };
  if (style === "oath") return { title: "守誓的铁冠", text: "旧领主、村镇代表与渡鸦家的功臣一同站在大厅里。他们服从的不是你的姓，而是这些年没有被你赖掉的承诺。" };
  if (style === "iron") return { title: "沉默的铁冠", text: "最后一面敌旗落下后，北境安静了很久。所有人都知道你的命令会抵达，也知道违抗命令的人去了哪里。" };
  return { title: "金库上的铁冠", text: "商路、磨坊和税册第一次被同一套数字连在一起。你把一个破败封地变成了不会停下的统治机器。" };
}

function endingVisual(s) {
  if (s.endingReason === "fallen") return { src: "assets/battle-capital.webp", alt: "陷落的渡鸦堡", cls: "ending-fallen" };
  if (s.endingReason === "collapsed") return { src: "assets/oswin.webp", alt: "空掉的大厅", cls: "ending-collapsed" };
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
  refreshAmbient();
  const copy = endingCopy(s);
  const visual = endingVisual(s);
  $("ending").classList.add(...visual.cls.split(" "));
  $("endingPortrait").src = visual.src;
  $("endingPortrait").alt = visual.alt;
  const victory = s.endingReason === "unified";
  $("endingBody").innerHTML = `<span class="eyebrow">${victory ? "THE IRON CROWN" : "THE CHRONICLE CLOSES"}</span><h1>${copy.title}</h1><div class="story-body"><p>${copy.text}</p><p>编年史给你的统治留下了“${OATHS[currentStyle(s)].short}”二字。开局的誓言只是起点，真正决定这两个字的是每一次征税、封赏、拒绝与出兵。</p></div><div class="ending-stats"><div><b>${Math.min(s.turn + 1, MAX_TURNS)}</b><span>经过季度</span></div><div><b>${ownTerritoryIds(s).length}</b><span>最终领地</span></div><div><b>${s.wins}</b><span>胜场</span></div><div><b>${ownedOfficers(s).length}</b><span>最终家臣</span></div></div><button id="endingRestart" class="primary-btn" type="button">重新继承渡鸦堡</button>`;
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
  refreshAmbient();
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
  playSound("click");
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
  saveGame();
  renderAll();
  pumpDecision();
  resetPageScroll();
  refreshAmbient();
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
}

function ensureAudio() {
  if (!soundEnabled || typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function tone(frequency, duration = .16, volume = .025, type = "sine", delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + .018);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .03);
}

function noise(duration = .12, volume = .018, delay = 0) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const length = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = "lowpass"; filter.frequency.value = 520;
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + delay);
}

function playSound(kind = "click") {
  if (!soundEnabled) return;
  if (kind === "tax") { tone(690, .11, .035, "triangle"); tone(920, .14, .025, "triangle", .09); }
  else if (kind === "build") { noise(.09, .035); tone(118, .14, .04, "square"); noise(.08, .028, .13); }
  else if (kind === "drum") { tone(72, .22, .065, "sine"); noise(.11, .025); tone(64, .24, .05, "sine", .18); }
  else if (kind === "victory") { [196, 247, 294, 392].forEach((f, i) => tone(f, .42, .025, "triangle", i * .11)); }
  else if (kind === "event") { tone(294, .28, .018, "triangle"); tone(220, .34, .014, "sine", .12); }
  else if (kind === "season") { [147, 196, 247].forEach((f, i) => tone(f, .5, .014, "sine", i * .12)); }
  else tone(245, .07, .014, "triangle");
}

function ambientPulse() {
  if (!S || !soundEnabled || !audioContext) return;
  const bases = { spring: 174, summer: 196, autumn: 147, winter: 110 };
  const base = bases[seasonOf(S).id] || 147;
  tone(base, 4.8, .0045, "sine");
  tone(base * 1.5, 3.7, .0028, "triangle", .5);
  if (seasonOf(S).id === "winter") noise(1.5, .0025, .2);
}

function refreshAmbient() {
  if (ambientTimer) clearInterval(ambientTimer);
  ambientTimer = 0;
  if (!soundEnabled || !audioContext || !S) return;
  ambientPulse();
  ambientTimer = setInterval(ambientPulse, 7600);
}

function updateSoundButton() {
  const button = $("soundBtn");
  if (!button) return;
  button.textContent = soundEnabled ? "声" : "静";
  button.setAttribute("aria-pressed", String(soundEnabled));
  button.setAttribute("aria-label", soundEnabled ? "关闭环境音" : "开启环境音");
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  if (typeof localStorage !== "undefined") localStorage.setItem(AUDIO_KEY, soundEnabled ? "on" : "off");
  updateSoundButton();
  if (soundEnabled) { ensureAudio(); playSound("event"); refreshAmbient(); }
  else if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = 0; }
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

function boot() {
  lockZoom();
  soundEnabled = typeof localStorage === "undefined" || localStorage.getItem(AUDIO_KEY) !== "off";
  updateSoundButton();
  document.addEventListener("pointerdown", () => { if (soundEnabled) { ensureAudio(); refreshAmbient(); } }, { once: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (ambientTimer) clearInterval(ambientTimer);
      ambientTimer = 0;
    } else refreshAmbient();
  });
  $("newGameBtn")?.addEventListener("click", showCreator);
  $("continueBtn")?.addEventListener("click", () => { S = loadGame(); showGame(); });
  $("oathPicker")?.querySelectorAll("[data-oath]").forEach(button => button.addEventListener("click", () => {
    creatorOath = button.dataset.oath;
    $("oathPicker").querySelectorAll("button").forEach(other => other.classList.toggle("active", other === button));
  }));
  $("difficultyPicker")?.querySelectorAll("[data-difficulty]").forEach(button => button.addEventListener("click", () => {
    creatorDifficulty = button.dataset.difficulty;
    $("difficultyPicker").querySelectorAll("button").forEach(other => other.classList.toggle("active", other === button));
  }));
  $("startGameBtn")?.addEventListener("click", () => {
    S = createInitialState($("playerName").value, creatorOath, creatorDifficulty);
    prologueIndex = 0;
    $("creator").classList.add("hidden");
    $("prologue").classList.remove("hidden");
    renderPrologue();
    playSound("event");
  });
  $("nextPrologueBtn")?.addEventListener("click", () => {
    if (prologueIndex < PROLOGUE.length - 1) { prologueIndex++; renderPrologue(); playSound("click"); }
    else showGame();
  });
  $("gameNav")?.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
    if (!S) { showMenu(); return; }
    if (S.battleSession && button.dataset.tab !== "campaign") { rejectDuringBattle(S); return; }
    S.tab = button.dataset.tab;
    saveGame();
    renderAll();
    playSound("click");
    resetPageScroll();
  }));
  $("endSeasonBtn")?.addEventListener("click", () => S && advanceSeason(S));
  $("saveBtn")?.addEventListener("click", () => { if (saveGame()) toast("进度已保存在本机"); });
  $("soundBtn")?.addEventListener("click", toggleSound);
  $("restartBtn")?.addEventListener("click", () => {
    if (confirm("删除当前存档并重新开始？")) { deleteSave(); S = null; showMenu(); }
  });
  showMenu();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createInitialState, hydrateState, seasonOf, forecast, territoryOutput, buildingCost,
    attackableTerritories, battleEstimate, startBattle, stageOptions, applyBattleChoice,
    finishBattle, enemyPressure, decisionView, subjects, TERRITORY_DEFS, OFFICER_DEFS,
    SEASONS, PLANS, ACTIONS, UNIT_DEFS, POLICIES, clamp, armyTotal, syncTroops,
    selectedComposition, compositionPower, campaignSupply, allocateLosses, recruitAmount, canRecruitUnit,
    settleSeasonEconomy, casualtyForecast, queueSeasonEvents, WORLD_EVENTS, NPC_ARCS,
    applyEventEffects, handleOfficerPolitics, interactionLocked, advanceSeason, checkDefeat,
    enemyGuardCap, battleRiskClass, CROWN_OPEN_TURN, CAMPAIGN_AP_COST
  };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", boot);
