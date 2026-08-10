import game from "./_game.mjs";

// 观察三家 AI 在一局里的实际变化：领地数、主力兵力、资源囤积
function rngFor(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6D2B79F5;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const EPOCH = 1767225600000;
const originalNow = Date.now;
const originalRandom = Math.random;
const rows = [];

for (const seed of [1, 2, 3, 4, 5]) {
  const random = rngFor(seed);
  let now = EPOCH;
  Math.random = random;
  Date.now = () => now;
  const s = game.createInitialState(`AI观察${seed}`, "oath", "standard");
  const snap = label => {
    const f = s.factions;
    rows.push({
      seed, 时点: label,
      狼牙地: Object.keys(s.territories).filter(id => s.territories[id].owner === "wolf").length,
      河望地: Object.keys(s.territories).filter(id => s.territories[id].owner === "river").length,
      摄政地: Object.keys(s.territories).filter(id => s.territories[id].owner === "crown").length,
      狼牙兵: Object.values(f.wolf.armies[0].composition).reduce((a, b) => a + b, 0),
      摄政兵: Object.values(f.crown.armies[0].composition).reduce((a, b) => a + b, 0),
      狼牙金: Math.round(f.wolf.gold), 摄政金: Math.round(f.crown.gold)
    });
  };
  snap("开局");
  try {
    for (let i = 0; i < 48; i++) {
      now += game.TIME_CONFIG.seasonDurationMs;
      game.advanceWorld(s, now, { rng: random, maxCatchUpMs: Infinity });
      if (s.ended) break;
    }
  } finally { Math.random = originalRandom; Date.now = originalNow; }
  snap("48季后");
}

const at = label => rows.filter(r => r.时点 === label);
const avg = (label, key) => (at(label).reduce((a, r) => a + r[key], 0) / at(label).length).toFixed(1);
console.log("玩家完全不动的情况下，5 局平均：\n");
console.log("            狼牙地 河望地 摄政地 | 狼牙主力 摄政主力 | 狼牙金 摄政金");
for (const label of ["开局", "48季后"]) {
  console.log(`  ${label.padEnd(7)} ${avg(label,"狼牙地").padStart(5)} ${avg(label,"河望地").padStart(6)} ${avg(label,"摄政地").padStart(6)} | ${avg(label,"狼牙兵").padStart(8)} ${avg(label,"摄政兵").padStart(8)} | ${avg(label,"狼牙金").padStart(6)} ${avg(label,"摄政金").padStart(6)}`);
}
