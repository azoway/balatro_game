const elements = {};
function mkEl() {
  return {
    innerHTML: "", textContent: "", className: "", style: { setProperty(){} }, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
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
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

const fs = require("fs");
let src = fs.readFileSync(require("path").join(__dirname, "..", "game.js"), "utf8");
src += "\nmodule.exports = { G, evaluate, playHand, startBlind, JOKER_DEFS, rollShop, buyItem, computeScoring, newGameState, skipBlind, blindTarget, seedRNG, rng, buildDeck, TAROTS, BOSSES, saveGame, loadGame };";
const M = require("module");
const m = new M.Module("game");
m._compile(src, "game.js");
const { G, evaluate, playHand, startBlind, JOKER_DEFS, rollShop, buyItem,
  computeScoring, newGameState, skipBlind, blindTarget, seedRNG, rng, buildDeck, TAROTS, BOSSES,
  saveGame, loadGame } = m.exports;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", msg); }
}

const c = (rank, suit) => ({ rank, suit, id: Math.random().toString(36) });

/* ---------- 牌型判定 ---------- */
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

/* ---------- 可播种随机数 ---------- */
seedRNG(123);
const seqA = [rng(), rng(), rng()];
seedRNG(123);
const seqB = [rng(), rng(), rng()];
assert(seqA.every((v, i) => v === seqB[i]), "相同种子随机序列一致");
assert(seqA[0] !== seqA[1], "随机序列有变化");
assert(seqA.every(v => v >= 0 && v < 1), "随机数在 [0,1)");

newGameState(42); buildDeck();
const deck1 = G.deck.map(x => x.rank + x.suit).join(",");
newGameState(42); buildDeck();
const deck2 = G.deck.map(x => x.rank + x.suit).join(",");
assert(deck1 === deck2, "相同种子牌库洗牌顺序一致");

/* ---------- 底注目标（ANTE_BASE 修正） ---------- */
newGameState(1);
assert(blindTarget(0) === 100, "底注1小盲目标100: " + blindTarget(0));
assert(blindTarget(1) === 150, "底注1大盲目标150");
assert(blindTarget(2) === 200, "底注1 Boss目标200");
G.ante = 8;
assert(blindTarget(0) === 35000, "底注8小盲目标35000: " + blindTarget(0));

/* ---------- 纯函数计分 ---------- */
newGameState(7);
let sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * 2, "对子基础计分 48: " + sc.total);
G.jokers = [{ id: "joker", uid: "t1" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * (2 + 4), "小丑+4倍率后 144: " + sc.total);
assert(sc.steps.length === 3, "计分步骤 2卡+1小丑: " + sc.steps.length);
G.jokers = [];

/* ---------- 全部禁用 → 0 分 ---------- */
G.currentBoss = BOSSES.find(b => b.id === "club");
sc = computeScoring([c("2","♣"), c("5","♣"), c("9","♣"), c("J","♣"), c("K","♣")]);
assert(sc.allDebuffed === true && sc.total === 0, "全禁用牌 0 分");
G.currentBoss = null;

/* ---------- 跳过盲注奖励 ---------- */
newGameState(9);
G.boss = BOSSES[0];
const before = { money: G.money, reroll: G.freeReroll, lvls: Object.values(G.handLevels).reduce((a, b) => a + b, 0) };
const tag = skipBlind();
assert(!!tag, "跳过返回标签");
assert(G.blindIndex === 1, "跳过后盲注推进");
const changed = G.money > before.money || G.freeReroll > before.reroll ||
  Object.values(G.handLevels).reduce((a, b) => a + b, 0) > before.lvls;
assert(changed, "跳过奖励已生效");

/* ---------- 塔罗牌 ---------- */
newGameState(3);
G.shopStock = [];
const hermit = { kind: "tarot", def: TAROTS.find(t => t.id === "hermit"), sold: false };
G.shopStock.push(hermit);
G.money = 10;
buyItem(hermit, 4);
assert(G.money === 12, "隐者: $10 付$4 剩$6 翻倍 $12: " + G.money);
const tower = { kind: "tarot", def: TAROTS.find(t => t.id === "tower"), sold: false };
G.shopStock = [tower];
buyItem(tower, 8);
assert(G.handSize === 9, "高塔: 手牌上限 +1");

(async () => {
  /* ---------- 回合流程 ---------- */
  newGameState(2026);
  G.boss = BOSSES.find(b => b.id === "hook") || BOSSES[0];
  startBlind(0);
  assert(G.state === "playing", "进入回合");
  assert(G.hand.length === 8, "发8张手牌: " + G.hand.length);
  assert(G.deck.length === 44, "牌库44张");
  assert(G.target === 100, "底注1小盲目标100: " + G.target);

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

  /* ---------- 商店 ---------- */
  G.money = 100; G.state = "shop";
  rollShop();
  assert(G.shopStock.length === 4, "商店4件商品(2小丑+1星球+1塔罗): " + G.shopStock.length);
  assert(G.shopStock.some(i => i.kind === "tarot"), "商店含塔罗牌");
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

  /* ---------- 中途存档 / 读档 ---------- */
  newGameState(555);
  G.boss = BOSSES.find(b => b.id === "psychic");
  startBlind(0);
  G.selected.clear();
  G.hand.slice(0, 3).forEach(x => G.selected.add(x.id));
  await playHand();
  if (G.state === "playing") {
    saveGame();
    const snap = { hand: G.hand.map(x => x.rank + x.suit).join(","), handsLeft: G.handsLeft, score: G.roundScore, money: G.money };
    newGameState(1);  // 清空状态
    assert(loadGame() === true, "读档成功");
    assert(G.state === "playing", "恢复到回合中");
    assert(G.hand.map(x => x.rank + x.suit).join(",") === snap.hand, "手牌一致恢复");
    assert(G.handsLeft === snap.handsLeft && G.roundScore === snap.score && G.money === snap.money, "回合数据一致恢复");
  } else {
    console.log("(中途存档用例: 第一手即结束回合，跳过)");
  }
  localStorage.removeItem("joker_save_v1");

  /* ---------- 全部小丑牌回调不抛异常 ---------- */
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

  /* ---------- 全部塔罗牌不抛异常 ---------- */
  for (const t of TAROTS) {
    try { t.apply(G); pass++; }
    catch (e) { fail++; console.error("FAIL tarot:", t.id, e.message); }
  }

  console.log("结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
