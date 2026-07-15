const elements = {};
function mkEl() {
  return {
    innerHTML: "", textContent: "", className: "", style: { setProperty(){} }, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; } },
    appendChild(){}, append(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    onclick: null, onmouseenter: null, onmousemove: null, onmouseleave: null,
    disabled: false, offsetHeight: 0, remove(){}, addEventListener(){}, getBoundingClientRect(){ return {left:0,top:0,width:92,height:128}; }, setProperty(){},
  };
}
global.document = {
  addEventListener(){},
  getElementById: id => (elements[id] ||= mkEl()),
  createElement: () => mkEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: mkEl(),
};
global.window = { innerWidth: 1920, innerHeight: 1080 };
global.document.addEventListener = () => {};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 1);
global.confirm = () => true;
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };

const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname, "..", "game.js"), "utf8");
src += "\nmodule.exports = { G, evaluate, playHand, startBlind, JOKER_DEFS, rollShop, buyItem };";
const M = require("module");
const m = new M.Module("game");
m._compile(src, "game.js");
const { G, evaluate, playHand, startBlind, JOKER_DEFS, rollShop, buyItem } = m.exports;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", msg); }
}

const c = (rank, suit) => ({ rank, suit, id: Math.random().toString(36) });
assert(evaluate([c("A","♠"),c("A","♥"),c("A","♦"),c("A","♣"),c("K","♠")]).type === "four_kind", "四条");
assert(evaluate([c("A","♠"),c("A","♥"),c("K","♦"),c("K","♣"),c("K","♠")]).type === "full_house", "葫芦");
assert(evaluate([c("2","♠"),c("5","♠"),c("9","♠"),c("J","♠"),c("K","♠")]).type === "flush", "同花");
assert(evaluate([c("2","♠"),c("3","♥"),c("4","♦"),c("5","♣"),c("6","♠")]).type === "straight", "顺子");
assert(evaluate([c("A","♠"),c("2","♥"),c("3","♦"),c("4","♣"),c("5","♠")]).type === "straight", "A-5顺子");
assert(evaluate([c("10","♠"),c("J","♠"),c("Q","♠"),c("K","♠"),c("A","♠")]).type === "straight_flush", "同花顺");
assert(evaluate([c("7","♠"),c("7","♥"),c("7","♦")]).type === "three_kind", "三条");
assert(evaluate([c("7","♠"),c("7","♥"),c("2","♦"),c("2","♠")]).type === "two_pair", "两对");
assert(evaluate([c("7","♠"),c("7","♥")]).type === "pair", "对子");
assert(evaluate([c("7","♠"),c("K","♥")]).type === "high_card", "高牌");
assert(evaluate([c("7","♠"),c("K","♥")]).scoringCards[0].rank === "K", "高牌只计最大牌");
assert(evaluate([c("7","♠"),c("7","♥"),c("2","♦")]).scoringCards.length === 2, "对子计2张");

(async () => {
  assert(G.state === "blind-select", "初始状态");
  startBlind(0);
  assert(G.state === "playing", "进入回合");
  assert(G.hand.length === 8, "发8张手牌: " + G.hand.length);
  assert(G.deck.length === 44, "牌库44张");

  let safety = 0;
  while (G.state === "playing" && safety++ < 10) {
    G.selected.clear();
    G.hand.slice(0, Math.min(5, G.hand.length)).forEach(x => G.selected.add(x.id));
    const before = G.handsLeft;
    await playHand();
    assert(G.handsLeft === before - 1 || G.state !== "playing", "出牌次数递减");
  }
  console.log("回合结束后状态:", G.state, "分数:", G.roundScore, "目标:", G.target, "剩余出牌:", G.handsLeft);
  assert(G.state !== "playing", "回合已结束");

  G.money = 100; G.state = "shop";
  rollShop();
  assert(G.shopStock.length === 3, "商店3件商品");
  const jokerItem = G.shopStock.find(i => i.kind === "joker");
  if (jokerItem) {
    const n0 = G.jokers.length;
    buyItem(jokerItem, jokerItem.def.cost);
    assert(G.jokers.length === n0 + 1, "购买小丑牌");
  }
  const planetItem = G.shopStock.find(i => i.kind === "planet");
  if (planetItem) {
    const lvl0 = G.handLevels[planetItem.def.hand];
    buyItem(planetItem, 3);
    assert(G.handLevels[planetItem.def.hand] === lvl0 + 1, "星球牌升级");
  }

  for (const def of JOKER_DEFS) {
    const ctx = { type: "pair", cards: [c("7","♠"), c("7","♥")], playedCount: 2, hasPair: true, hasThree: false, firstFace: null };
    const j = { id: def.id, uid: "t" };
    try {
      if (def.after) def.after(ctx, G, j);
      if (def.perCard) def.perCard(c("A","♥"), ctx, G, j);
      if (def.money) def.money(G, j);
      if (def.onDiscard) def.onDiscard([c("K","♠")], G, j);
      pass++;
    } catch (e) { fail++; console.error("FAIL joker:", def.id, e.message); }
  }

  console.log("结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
