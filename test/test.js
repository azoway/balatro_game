const elements = {};
function mkEl() {
  return {
    innerHTML: "", textContent: "", className: "", style: { setProperty(){} }, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    appendChild(){}, append(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    onclick: null, onmouseenter: null, onmousemove: null, onmouseleave: null,
    disabled: false, offsetHeight: 0, remove(){}, addEventListener(){}, getBoundingClientRect(){ return {left:0,top:0,width:92,height:128}; }, setProperty(){}, setAttribute(){},
  };
}
global.document = {
  addEventListener(){},
  getElementById: id => (elements[id] ||= mkEl()),
  createElement: () => mkEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: mkEl(),
  title: "",
  documentElement: mkEl(),
};
global.window = { innerWidth: 1920, innerHeight: 1080 };
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
const path = require("path");
const root = path.join(__dirname, "..");
let src = ["i18n.js", "defs.js", "engine.js", "ui.js"]
  .map(f => fs.readFileSync(path.join(root, f), "utf8"))
  .join("\n");
src += "\nmodule.exports = { G, evaluate, playHand, startBlind, discard, JOKER_DEFS, rollShop, buyItem, computeScoring, newGameState, skipBlind, blindTarget, seedRNG, rng, buildDeck, TAROTS, TAROT_BY_ID, BOSSES, PACKS, VOUCHERS, saveGame, loadGame, useConsumable, applyCardMod, pickBoss, openPack, choosePackOption, skipPack, loadStats, recordGameEnd, markJokersSeen, RANK_VAL, ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L };";
const M = require("module");
const m = new M.Module("game");
m._compile(src, "game.js");
const { G, evaluate, playHand, startBlind, discard, JOKER_DEFS, rollShop, buyItem,
  computeScoring, newGameState, skipBlind, blindTarget, seedRNG, rng, buildDeck,
  TAROTS, TAROT_BY_ID, BOSSES, PACKS, VOUCHERS, saveGame, loadGame, useConsumable,
  applyCardMod, pickBoss, openPack, choosePackOption, skipPack,
  loadStats, recordGameEnd, markJokersSeen, RANK_VAL,
  ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L } = m.exports;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", msg); }
}

const c = (rank, suit, extra) => ({ rank, suit, id: Math.random().toString(36), ...extra });

/* ---------- i18n ---------- */
assert(L({ zh: "甲", en: "A" }) === "甲", "默认中文");
assert(S("msg_destroyed", 2).includes("2"), "模板填充");
assert(S("__missing__") === "__missing__", "缺失键回退");

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

newGameState(42); buildDeck();
const deck1 = G.deck.map(x => x.rank + x.suit).join(",");
newGameState(42); buildDeck();
const deck2 = G.deck.map(x => x.rank + x.suit).join(",");
assert(deck1 === deck2, "相同种子牌库洗牌顺序一致");

/* ---------- 底注目标（含无尽增长） ---------- */
newGameState(1);
assert(blindTarget(0) === 100, "底注1小盲目标100");
assert(blindTarget(1) === 150, "底注1大盲目标150");
assert(blindTarget(2) === 200, "底注1 Boss目标200");
G.ante = 8;
assert(blindTarget(0) === 35000, "底注8小盲目标35000");
G.ante = 10;
assert(blindTarget(0) === 125000, "底注10无尽增长 ×2.5: " + blindTarget(0));

/* ---------- Boss 同局不重复 ---------- */
newGameState(11);
const seen = new Set();
for (let i = 0; i < BOSSES.length; i++) { pickBoss(); seen.add(G.boss.id); }
assert(seen.size === BOSSES.length, "连续选 Boss 不重复: " + seen.size);
pickBoss();
assert(G.boss && G.seenBosses.length === 1, "池耗尽后重置再选");

/* ---------- 纯函数计分 ---------- */
newGameState(7);
let sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * 2, "对子基础计分 48: " + sc.total);
G.jokers = [{ id: "joker", uid: "t1" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * (2 + 4), "小丑+4倍率后 144: " + sc.total);
assert(sc.steps.length === 3, "计分步骤 2卡+1小丑");
G.jokers = [];

/* ---------- 卡牌增强计分 ---------- */
sc = computeScoring([c("K","♥", { enh: "bonus" })]);
assert(sc.total === (5 + 10 + ENH_CHIPS) * 1, "加成牌 +30 筹码: " + sc.total);
sc = computeScoring([c("K","♥", { enh: "mult" })]);
assert(sc.total === (5 + 10) * (1 + ENH_MULT), "倍率牌 +4 倍率: " + sc.total);
// 钢铁牌：留在手中生效
G.hand = [c("2","♠", { enh: "steel" })];
sc = computeScoring([c("K","♥")]);
assert(sc.total === Math.floor((5 + 10) * 1 * ENH_STEEL_X), "钢铁牌手中 ×1.5: " + sc.total);
assert(sc.steps.some(s => s.kind === "held"), "钢铁牌产生 held 步骤");
G.hand = [];

/* ---------- 全部禁用 → 0 分 ---------- */
G.currentBoss = BOSSES.find(b => b.id === "club");
sc = computeScoring([c("2","♣"), c("5","♣"), c("9","♣"), c("J","♣"), c("K","♣")]);
assert(sc.allDebuffed === true && sc.total === 0, "全禁用牌 0 分");
G.currentBoss = null;

/* ---------- 持久化牌库 + 塔罗改牌 ---------- */
newGameState(13);
assert(G.masterDeck.length === 52, "母牌库52张");
const m0 = G.masterDeck[0];
G.hand = [{ ...m0 }];
G.deck = [];
TAROT_BY_ID.get("sun").applyCards([G.hand[0]], G);
assert(G.hand[0].suit === "♥" && G.masterDeck[0].suit === "♥", "太阳: 手牌与母牌库同步变红桃");
buildDeck();
assert(G.deck.find(x => x.id === m0.id).suit === "♥", "改动在下回合牌库中保留");

const aceCard = G.masterDeck.find(x => x.rank === "A");
G.hand = [{ ...aceCard }];
TAROT_BY_ID.get("emperor").applyCards([G.hand[0]], G);
assert(G.hand[0].rank === "2", "皇帝: A→2 回绕");

G.hand = [{ ...G.masterDeck[5] }];
TAROT_BY_ID.get("justice").applyCards([G.hand[0]], G);
assert(G.masterDeck[5].enh === "steel", "正义: 附加钢铁增强");
G.hand = [{ ...G.masterDeck[8] }];
TAROT_BY_ID.get("devil").applyCards([G.hand[0]], G);
assert(G.masterDeck[8].enh === "gold", "恶魔: 附加黄金增强");

G.hand = [{ ...G.masterDeck[6] }, { ...G.masterDeck[7] }];
TAROT_BY_ID.get("hanged").applyCards(G.hand.slice(), G);
assert(G.masterDeck.length === 50 && G.hand.length === 0, "吊人: 永久销毁2张");

/* ---------- 跳过盲注奖励 ---------- */
newGameState(9);
G.boss = BOSSES[0];
const before = { money: G.money, reroll: G.freeReroll, lvls: Object.values(G.handLevels).reduce((a, b) => a + b, 0) };
const tag = skipBlind();
assert(!!tag && G.blindIndex === 1, "跳过推进并返回标签");
const changed = G.money > before.money || G.freeReroll > before.reroll ||
  Object.values(G.handLevels).reduce((a, b) => a + b, 0) > before.lvls;
assert(changed, "跳过奖励已生效");

/* ---------- 塔罗购买进入消耗品槽 + 使用 ---------- */
newGameState(3);
G.state = "shop";
const hermit = { kind: "tarot", def: TAROT_BY_ID.get("hermit"), sold: false };
G.shopStock = [hermit];
G.money = 10;
buyItem(hermit, 4);
assert(G.money === 6 && G.consumables.length === 1, "购买塔罗进入消耗品槽");
assert(useConsumable(G.consumables[0]) === true, "使用隐者成功");
assert(G.money === 12 && G.consumables.length === 0, "隐者: $6 翻倍为 $12");
G.consumables = [{ id: "sun", uid: "x1" }];
assert(useConsumable(G.consumables[0]) === false && G.consumables.length === 1, "目标塔罗需在回合中使用");
G.consumables = [];

/* ---------- 优惠券 ---------- */
newGameState(15);
G.state = "shop"; G.money = 50; G.shopStock = [];
const crate = { kind: "voucher", def: VOUCHERS.find(v => v.id === "crate"), sold: false };
G.shopStock = [crate];
buyItem(crate, crate.def.cost);
assert(G.maxConsumables === 3 && G.vouchers.includes("crate"), "手提箱: 消耗品槽 +1");
const retainer = { kind: "voucher", def: VOUCHERS.find(v => v.id === "retainer"), sold: false };
G.shopStock = [retainer];
buyItem(retainer, retainer.def.cost);
assert(G.maxJokers === 6, "伙伴合约: 小丑槽 +1");
const compound = { kind: "voucher", def: VOUCHERS.find(v => v.id === "compound"), sold: false };
G.shopStock = [compound];
buyItem(compound, compound.def.cost);
assert(G.interestCap === 10, "复利: 利息上限 $10");

/* ---------- 商店库存构成 ---------- */
newGameState(17);
rollShop();
assert(G.shopStock.filter(i => i.kind === "joker").length === 2, "默认2张小丑");
assert(G.shopStock.some(i => i.kind === "planet") && G.shopStock.some(i => i.kind === "tarot"), "含星球与塔罗");
assert(G.shopStock.some(i => i.kind === "pack") && G.shopStock.some(i => i.kind === "voucher"), "含卡包与优惠券");
G.vouchers = ["overstock"];
rollShop();
assert(G.shopStock.filter(i => i.kind === "joker").length === 3, "超额库存: 3张小丑");

/* ---------- 卡包 ---------- */
newGameState(19);
openPack("arcana");
assert(G.pendingPack && G.pendingPack.choices.length === 3, "塔罗包3个选项");
assert(choosePackOption(0) === true && G.consumables.length === 1 && !G.pendingPack, "选取塔罗入槽");
openPack("celestial");
const beforeLvls = JSON.stringify(G.handLevels);
assert(choosePackOption(1) === true, "选取星球牌");
assert(JSON.stringify(G.handLevels) !== beforeLvls, "星球包立即升级牌型");
openPack("buffoon");
G.jokers = JOKER_DEFS.slice(0, 5).map((d, i) => ({ id: d.id, uid: "f" + i }));
assert(choosePackOption(0) === "full", "小丑槽满返回 full");
skipPack();
assert(!G.pendingPack, "放弃卡包清空");
G.jokers = [];

/* ---------- 跨局统计 / 图鉴 ---------- */
localStorage.removeItem("joker_stats_v1");
markJokersSeen(["joker", "banner"]);
assert(loadStats().seenJokers.length === 2, "图鉴记录见过的小丑");
newGameState(21);
G.ante = 3; G.bestHand = { type: "pair", total: 500 };
recordGameEnd(false);
const st = loadStats();
assert(st.games === 1 && st.bestAnte === 3 && st.bestScore === 500, "战绩统计记录");

(async () => {
  /* ---------- 回合流程 ---------- */
  newGameState(2026);
  G.boss = BOSSES[0];
  startBlind(0);
  assert(G.state === "playing", "进入回合");
  assert(G.hand.length === 8 && G.deck.length === 44, "发牌与牌库");
  assert(G.target === 100, "底注1小盲目标100");

  let safety = 0;
  while (G.state === "playing" && safety++ < 10) {
    G.selected.clear();
    G.hand.slice(0, Math.min(5, G.hand.length)).forEach(x => G.selected.add(x.id));
    const before = G.handsLeft;
    await playHand();
    assert(G.handsLeft === before - 1 || G.state !== "playing", "出牌次数递减");
  }
  console.log("回合结束后状态:", G.state, "分数:", G.roundScore, "目标:", G.target);
  assert(G.state !== "playing", "回合已结束");
  assert(G.bestHand && G.bestHand.total > 0, "最佳出牌已记录");

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
    newGameState(1);
    assert(loadGame() === true, "读档成功");
    assert(G.state === "playing", "恢复到回合中");
    assert(G.hand.map(x => x.rank + x.suit).join(",") === snap.hand, "手牌一致恢复");
    assert(G.handsLeft === snap.handsLeft && G.roundScore === snap.score && G.money === snap.money, "回合数据一致恢复");
    assert(G.masterDeck.length === 52, "母牌库随档恢复");
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

  /* ---------- 全部即时塔罗不抛异常 ---------- */
  for (const t of TAROTS.filter(x => x.apply)) {
    try { t.apply(G); pass++; }
    catch (e) { fail++; console.error("FAIL tarot:", t.id, e.message); }
  }

  /* ---------- 种子全局模拟（快进时钟 + 策略机器人） ----------
     机器人会打组合牌、用弃牌换牌、买小丑/星球/优惠券/开卡包，
     覆盖中后期 Boss、商店与无尽增长路径。 */
  let _fakeNow = 0;
  global.performance.now = () => (_fakeNow += 120);
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (cb, ms) => realSetTimeout(cb, 0);

  const byRankDesc = (a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank];
  function bestSelection(hand, mustFive) {
    // 同花优先
    const bySuit = {};
    hand.forEach(x => (bySuit[x.suit] ||= []).push(x));
    for (const s in bySuit) {
      if (bySuit[s].length >= 5) return bySuit[s].sort(byRankDesc).slice(0, 5);
    }
    // 点数分组（对子/三条/四条 + 次组）
    const byRank = {};
    hand.forEach(x => (byRank[x.rank] ||= []).push(x));
    const groups = Object.values(byRank).sort((a, b) => b.length - a.length || RANK_VAL[b[0].rank] - RANK_VAL[a[0].rank]);
    let sel = [];
    for (const g of groups) {
      if (g.length >= 2 && sel.length + g.length <= 5) sel.push(...g);
    }
    if (!sel.length) sel = hand.slice().sort(byRankDesc).slice(0, 1);
    if (mustFive) {
      const rest = hand.filter(x => !sel.includes(x)).sort(byRankDesc);
      while (sel.length < 5 && rest.length) sel.push(rest.shift());
      if (sel.length !== 5) return null;
    }
    return sel;
  }

  function botShop() {
    for (const cons of G.consumables.slice()) {
      const def = TAROT_BY_ID.get(cons.id);
      if (def.apply) useConsumable(cons);
    }
    for (const item of G.shopStock) {
      if (item.sold) continue;
      const price = item.kind === "planet" ? 3 : item.def.cost;
      if (item.kind === "joker" && G.jokers.length < G.maxJokers && G.money >= price) buyItem(item, price);
      else if (item.kind === "planet" && G.money >= price + 4) buyItem(item, price);
      else if (item.kind === "voucher" && G.money >= price + 6) buyItem(item, price);
      else if (item.kind === "pack" && G.money >= price + 8) {
        buyItem(item, price);
        if (G.pendingPack && choosePackOption(0) !== true) skipPack();
      }
    }
  }

  async function simulate(seed, maxRounds = 60) {
    newGameState(seed);
    pickBoss();
    while (G.round < maxRounds) {
      startBlind(G.blindIndex);
      let steps = 0;
      while (G.state === "playing" && steps++ < 20) {
        const mustFive = G.currentBoss?.id === "psychic";
        let sel = bestSelection(G.hand, mustFive);
        // 没组合且还有弃牌次数 → 弃掉 5 张最小的散牌换手
        if (!mustFive && sel && sel.length <= 1 && G.discardsLeft > 0 && G.hand.length > 5) {
          G.selected.clear();
          G.hand.slice().sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]).slice(0, 5)
            .forEach(x => G.selected.add(x.id));
          discard();
          continue;
        }
        if (!sel) sel = G.hand.slice(0, Math.min(5, G.hand.length));
        G.selected.clear();
        sel.forEach(x => G.selected.add(x.id));
        await playHand();
        assert(G.money >= 0, "模拟中金钱非负");
        assert(Number.isFinite(G.roundScore), "分数为有限数");
      }
      if (G.state === "roundwon") {
        elements["cashout-btn"].onclick();       // 收取奖励
        if (G.state === "over") return "win";
        botShop();                                // 商店采购
        elements["next-round-btn"].onclick();    // → 盲注选择
      } else if (G.state === "over") {
        return "lose";
      } else {
        return "stuck:" + G.state;
      }
    }
    return "cap";
  }

  let bestAnte = 0;
  for (const seed of [1001, 20260716, 777]) {
    try {
      const result = await simulate(seed);
      bestAnte = Math.max(bestAnte, G.ante);
      console.log(`模拟 seed=${seed}: ${result}, 底注 ${G.ante}, 回合 ${G.round}, 小丑 ${G.jokers.length}, $${G.money}`);
      assert(["win", "lose", "cap"].includes(result), `模拟正常结束 (seed=${seed}): ${result}`);
    } catch (e) {
      fail++;
      console.error(`FAIL 模拟崩溃 (seed=${seed}):`, e.stack || e.message);
    }
  }
  assert(bestAnte >= 2, "机器人至少打到底注 2（覆盖商店/Boss路径）: " + bestAnte);

  console.log("结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
