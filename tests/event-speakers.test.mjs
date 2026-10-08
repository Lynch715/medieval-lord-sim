import assert from "node:assert/strict";
import game from "./_game.mjs";

// 世界事件点名的家臣还没投过来，就不能让他开口。
const s = game.createInitialState("说话人", "oath", "standard");
assert.notEqual(game.officer(s, "renard").side, "player", "开局雷纳德还是别人家的");
const view = game.decisionView(s, { type: "world_event", eventId: "deserter_band" });
assert.ok(!view.body.includes("雷纳德"), "没投过来的雷纳德不该在事件里说话");
assert.ok(view.body.includes("守备队长"));
assert.equal(view.portrait, "assets/oswin.webp", "立绘不能用敌方领主的");

const inspector = game.decisionView(s, { type: "world_event", eventId: "royal_inspector" });
assert.ok(!JSON.stringify(inspector.options.map(o => [o.name, o.note])).includes("伊莎贝尔"));

game.officer(s, "renard").side = "player";
const joined = game.decisionView(s, { type: "world_event", eventId: "deserter_band" });
assert.ok(joined.body.includes("雷纳德"), "投过来之后照原样说话");
assert.equal(joined.portrait, "assets/renard.webp");
console.log("event-speakers ok");
