/* 回归测试：牌型 / 计分 / 塔罗 / 商店 / 存档迁移 / SW 资源校验 + 机器人整局模拟 */
const fs = require("fs");
const path = require("path");
const { elements, compileGame, enableFastClock, makeBot, ROOT } = require("./harness");

const api = compileGame();
const { G, evaluate, playHand, startBlind, JOKER_DEFS, rollShop, rollEdition, buyItem,
  computeScoring, newGameState, newGame, skipBlind, blindTarget, seedRNG, rng, buildDeck,
  TAROTS, TAROT_BY_ID, BOSSES, VOUCHERS, EDITIONS, DECKS, HAND_TYPES,
  saveGame, loadGame, useConsumable, pickBoss, openPack, choosePackOption, skipPack,
  loadStats, recordGameEnd, markJokersSeen,
  ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L } = api;

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
G.hand = [c("2","♠", { enh: "steel" })];
sc = computeScoring([c("K","♥")]);
assert(sc.total === Math.floor((5 + 10) * 1 * ENH_STEEL_X), "钢铁牌手中 ×1.5: " + sc.total);
assert(sc.steps.some(s => s.kind === "held"), "钢铁牌产生 held 步骤");
G.hand = [];

/* ---------- 重触发小丑 ---------- */
G.jokers = [{ id: "hack", uid: "r1" }];
sc = computeScoring([c("3","♠"), c("3","♥")]);
// 对3: 基础10筹码 + 每张3触发两次(3×4) = 22, ×2 = 44
assert(sc.total === (10 + 3 * 4) * 2, "黑客重触发 2/3/4/5: " + sc.total);
assert(sc.steps.filter(s => s.kind === "card").length === 4, "重触发产生4个卡步骤");
assert(sc.steps.some(s => s.again), "重触发步骤带 again 标记");
G.jokers = [{ id: "sock_buskin", uid: "r2" }];
sc = computeScoring([c("K","♠"), c("K","♥")]);
assert(sc.total === (10 + 10 * 4) * 2, "悲喜面具重触发人头牌: " + sc.total);
G.jokers = [{ id: "dusk", uid: "r3" }];
G.handsLeft = 0;
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 * 4) * 2, "黄昏最后一手全重触发: " + sc.total);
G.handsLeft = 4;
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * 2, "黄昏非最后一手不触发: " + sc.total);
G.jokers = [];

/* ---------- 成长小丑 ---------- */
const gj = { id: "green_joker", uid: "g1" };
const ctxNoFace = { cards: [c("7","♠")], type: "high_card", playedCount: 1, hasPair: false, hasThree: false };
const defGreen = JOKER_DEFS.find(d => d.id === "green_joker");
defGreen.onPlay(ctxNoFace, G, gj);
defGreen.onPlay(ctxNoFace, G, gj);
assert(gj.state === 2, "绿色小丑出牌累计 +2");
defGreen.onDiscard([c("2","♠")], G, gj);
assert(gj.state === 1, "绿色小丑弃牌 -1");
assert(defGreen.after(ctxNoFace, G, gj).mult === 1, "绿色小丑 after 生效");

const bus = { id: "ride_the_bus", uid: "b1" };
const defBus = JOKER_DEFS.find(d => d.id === "ride_the_bus");
defBus.onPlay(ctxNoFace, G, bus);
defBus.onPlay(ctxNoFace, G, bus);
assert(bus.state === 2, "坐公交连续无人头累计");
defBus.onPlay({ ...ctxNoFace, cards: [c("K","♠")] }, G, bus);
assert(bus.state === 0, "坐公交遇人头重置");

const ice = { id: "ice_cream", uid: "i1", state: 19 };
const defIce = JOKER_DEFS.find(d => d.id === "ice_cream");
assert(defIce.after(ctxNoFace, G, ice).chips === 5, "冰淇淋剩 5 筹码");
assert(defIce.onPlay(ctxNoFace, G, ice) === "destroy", "冰淇淋融尽销毁");

const sq = { id: "square", uid: "s1" };
const defSq = JOKER_DEFS.find(d => d.id === "square");
defSq.onPlay({ ...ctxNoFace, playedCount: 4 }, G, sq);
assert(sq.state === 4 && defSq.after(ctxNoFace, G, sq).chips === 4, "方形小丑4张牌成长");

const flash = { id: "flash_card", uid: "f1" };
const defFlash = JOKER_DEFS.find(d => d.id === "flash_card");
defFlash.onReroll(G, flash);
assert(flash.state === 2 && defFlash.after(ctxNoFace, G, flash).mult === 2, "闪卡刷新成长");

/* ---------- 小丑版本 ---------- */
G.jokers = [{ id: "joker", uid: "e1", ed: "foil" }];
sc = computeScoring([c("K","♥")]);
assert(sc.total === (5 + 10 + 50) * (1 + 4), "闪箔 +50 筹码: " + sc.total);
G.jokers = [{ id: "joker", uid: "e2", ed: "poly" }];
sc = computeScoring([c("K","♥")]);
assert(sc.total === Math.floor(15 * (1 * 1.5 + 4)), "多彩 ×1.5 在自身效果前: " + sc.total);
G.jokers = [];
seedRNG(99);
let edOk = true;
for (let i = 0; i < 200; i++) {
  if (![null, "foil", "holo", "poly"].includes(rollEdition())) edOk = false;
}
assert(edOk, "版本掉落值合法");

/* ---------- 新牌型: 五条 / 同花葫芦 ---------- */
newGameState(7);
assert(evaluate([c("7","♠"),c("7","♥"),c("7","♦"),c("7","♣"),c("7","♠")]).type === "five_kind", "五条(混花色)");
assert(evaluate([c("7","♥"),c("7","♥"),c("7","♥"),c("7","♥"),c("7","♥")]).type === "flush_five", "同花五条优先于五条");
assert(evaluate([c("7","♥"),c("7","♥"),c("7","♥"),c("K","♥"),c("K","♥")]).type === "flush_house", "同花葫芦");
assert(evaluate([c("7","♥"),c("7","♠"),c("7","♥"),c("K","♥"),c("K","♥")]).type === "full_house", "混花色仍是普通葫芦");
sc = computeScoring([c("7","♠"),c("7","♥"),c("7","♦"),c("7","♣"),c("7","♠")]);
assert(sc.total === (120 + 7 * 5) * 12, "五条计分 120+35 ×12: " + sc.total);
assert(api.PLANETS.length === 12 && Object.keys(HAND_TYPES).every(h => api.PLANETS.some(p => p.hand === h)), "12张星球牌覆盖全部牌型");

/* ---------- 牌型规则小丑: 四指 / 抄近路 / 飞溅 ---------- */
const flush4 = [c("2","♠"),c("5","♠"),c("9","♠"),c("K","♠")];
assert(evaluate(flush4).type === "high_card", "无四指: 4张同花不成立");
G.jokers = [{ id: "four_fingers", uid: "ff" }];
assert(evaluate(flush4).type === "flush", "四指: 4张同花成立");
assert(evaluate([c("3","♠"),c("4","♥"),c("5","♦"),c("6","♣")]).type === "straight", "四指: 4张顺子成立");
G.jokers = [{ id: "shortcut", uid: "sc" }];
assert(evaluate([c("2","♠"),c("4","♥"),c("6","♦"),c("8","♣"),c("10","♠")]).type === "straight", "抄近路: 跳点顺子");
assert(evaluate([c("2","♠"),c("5","♥"),c("6","♦"),c("8","♣"),c("10","♠")]).type === "high_card", "抄近路: 跳2点不成立");
G.jokers = [{ id: "splash", uid: "sp" }];
let evSplash = evaluate([c("7","♠"),c("7","♥"),c("2","♦"),c("3","♣"),c("9","♠")]);
assert(evSplash.type === "pair" && evSplash.scoringCards.length === 5, "飞溅: 全部5张参与计分");
G.jokers = [];

/* ---------- 蓝图复制 ---------- */
G.jokers = [{ id: "blueprint", uid: "bp" }, { id: "joker", uid: "jk" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 4 + 4), "蓝图复制右侧+4倍率: " + sc.total);
G.jokers = [{ id: "joker", uid: "jk" }, { id: "blueprint", uid: "bp" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 4), "蓝图右侧无小丑则无效果: " + sc.total);
G.jokers = [{ id: "blueprint", uid: "b1" }, { id: "blueprint", uid: "b2" }, { id: "joker", uid: "jk" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 12), "蓝图链式复制: " + sc.total);
G.jokers = [];

/* ---------- 持有类小丑: 男爵 / 射月 / 高举拳头 ---------- */
G.jokers = [{ id: "baron", uid: "ba" }];
G.hand = [c("K","♠"), c("K","♥"), c("2","♦")];
sc = computeScoring([c("7","♥")]);
// 高牌基础5 + 卡7 = 12 筹码, 倍率 1×1.5×1.5 = 2.25
assert(sc.total === Math.floor((5 + 7) * 2.25), "男爵: 手中2张K ×1.5×1.5: " + sc.total);
assert(sc.steps.filter(s => s.kind === "heldJoker").length === 2, "男爵产生2个 heldJoker 步骤");
G.jokers = [{ id: "shoot_the_moon", uid: "sm" }];
G.hand = [c("Q","♠")];
sc = computeScoring([c("7","♥")]);
assert(sc.total === (5 + 7) * (1 + 13), "射月: 手中Q +13倍率: " + sc.total);
G.jokers = [{ id: "raised_fist", uid: "rf" }];
G.hand = [c("3","♠"), c("K","♥")];
sc = computeScoring([c("7","♥")]);
assert(sc.total === (5 + 7) * (1 + 6), "高举拳头: 最小点数3 ×2 加倍率: " + sc.total);
G.jokers = []; G.hand = [];

/* ---------- 徒步者: 计分牌永久成长 ---------- */
newGameState(23);
const hikerJ = { id: "hiker", uid: "hk" };
const defHiker = JOKER_DEFS.find(d => d.id === "hiker");
const permCard = G.masterDeck[0];
G.hand = [];
defHiker.onPlay({ cards: [permCard], scoringCards: [permCard] }, G, hikerJ);
defHiker.onPlay({ cards: [permCard], scoringCards: [permCard] }, G, hikerJ);
assert(G.masterDeck[0].perm === 10, "徒步者: 母牌库永久 +10 筹码");
sc = computeScoring([{ ...G.masterDeck[0] }]);
const baseChip = (r => r === "A" ? 11 : (api.RANK_VAL[r] >= 11 ? 10 : api.RANK_VAL[r]))(G.masterDeck[0].rank);
assert(sc.total === (5 + baseChip + 10) * 1, "永久筹码参与计分: " + sc.total);

/* ---------- 起始牌组 ---------- */
newGame(1, "red");
assert(G.bonusDiscards === 1 && G.deckId === "red", "红牌组 +1 弃牌");
newGame(1, "blue");
assert(G.bonusHands === 1, "蓝牌组 +1 出牌");
newGame(1, "yellow");
assert(G.money === 10, "黄牌组开局 $10");
newGame(1, "ghost");
assert(G.consumables.length === 1 && TAROT_BY_ID.has(G.consumables[0].id), "幽灵牌组开局塔罗");
newGame(1, "nonsense");
assert(G.deckId === "classic", "未知牌组回退经典");

/* ---------- 全部禁用 → 0 分 ---------- */
newGameState(7);
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
G.state = "shop"; G.money = 50;
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

/* ---------- 跨局统计 / 图鉴 / 历史 ---------- */
localStorage.removeItem("joker_stats_v1");
markJokersSeen(["joker", "banner"]);
assert(loadStats().seenJokers.length === 2, "图鉴记录见过的小丑");
newGameState(21);
G.ante = 3; G.bestHand = { type: "pair", total: 500 }; G.deckId = "red";
recordGameEnd(false);
const st = loadStats();
assert(st.games === 1 && st.bestAnte === 3 && st.bestScore === 500, "战绩统计记录");
assert(st.history.length === 1 && st.history[0].seed === 21 && st.history[0].deck === "red", "对局历史记录");
for (let i = 0; i < 12; i++) recordGameEnd(false);
assert(loadStats().history.length === 10, "历史最多10条");

/* ---------- 存档迁移（v2 / v3 旧档能加载） ---------- */
const v2save = {
  money: 8, ante: 2, round: 4, blindIndex: 1, bossId: "hook",
  jokers: [{ id: "joker", uid: "old1" }],
  handLevels: Object.fromEntries(Object.keys(HAND_TYPES).map(k => [k, 1])),
  handPlayCounts: { pair: 3 }, seed: 42, rngState: 42,
  handSize: 8, bonusHands: 0, bonusDiscards: 0, freeReroll: 0, state: "other",
};
localStorage.setItem("joker_save_v1", JSON.stringify(v2save));
assert(loadGame() === true, "v2 旧档可加载");
assert(G.money === 8 && G.ante === 2 && G.jokers.length === 1, "v2 基础字段恢复");
assert(G.masterDeck.length === 52, "v2 无母牌库 → 重建52张");
assert(G.maxJokers === 5 && G.maxConsumables === 2 && G.interestCap === 5, "v2 新字段取默认");
assert(Array.isArray(G.vouchers) && G.vouchers.length === 0 && G.deckId === "classic", "v2 优惠券/牌组默认");

const v3save = { ...v2save, v: 3, masterDeck: G.masterDeck, consumables: [{ id: "hermit", uid: "c1" }], seenBosses: ["hook"], endless: false, bestHand: { type: "pair", total: 99 } };
localStorage.setItem("joker_save_v1", JSON.stringify(v3save));
assert(loadGame() === true, "v3 旧档可加载");
assert(G.consumables.length === 1 && G.seenBosses.length === 1 && G.bestHand.total === 99, "v3 字段恢复");
localStorage.removeItem("joker_save_v1");

/* ---------- SW 资源清单与缓存版本校验 ---------- */
{
  const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const cacheName = (swSrc.match(/const CACHE = "([^"]+)"/) || [])[1];
  const assetList = [...swSrc.matchAll(/"\.\/([^"]*)"/g)].map(x => x[1]).filter(Boolean);
  assert(!!cacheName, "sw.js 有 CACHE 名");
  for (const a of assetList) {
    assert(fs.existsSync(path.join(ROOT, a)), `SW 资源存在: ${a}`);
  }
  const expected = ["index.html", "style.css", "i18n.js", "defs.js", "engine.js", "ui.js", "manifest.json", "icon.svg", "apple-touch-icon.png"];
  for (const f of expected) {
    assert(assetList.includes(f), `SW 清单包含: ${f}`);
  }
  // 静态资源内容变了但 CACHE 没升版本 → 报错提醒（快照存 test/sw-snapshot.json）
  const crypto = require("crypto");
  const hash = crypto.createHash("sha1");
  for (const a of assetList) hash.update(fs.readFileSync(path.join(ROOT, a)));
  const current = { hash: hash.digest("hex"), cache: cacheName };
  const snapPath = path.join(__dirname, "sw-snapshot.json");
  if (fs.existsSync(snapPath)) {
    const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
    assert(!(snap.hash !== current.hash && snap.cache === current.cache),
      `静态资源已变化但 sw.js 的 CACHE 仍为 "${cacheName}"，请升级版本号`);
  }
  fs.writeFileSync(snapPath, JSON.stringify(current, null, 2) + "\n");
}

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
      if (def.onPlay) def.onPlay(ctx, G, j);
      if (def.onReroll) def.onReroll(G, j);
      if (def.retrigger) def.retrigger(c("K","♠"), ctx, G, j);
      pass++;
    } catch (e) { fail++; console.error("FAIL joker:", def.id, e.message); }
  }

  /* ---------- 全部即时塔罗不抛异常 ---------- */
  for (const t of TAROTS.filter(x => x.apply)) {
    try { t.apply(G); pass++; }
    catch (e) { fail++; console.error("FAIL tarot:", t.id, e.message); }
  }

  /* ---------- 种子全局模拟（快进时钟 + 策略机器人，覆盖不同起始牌组） ---------- */
  enableFastClock();
  const bot = makeBot(api);
  let bestAnte = 0;
  const deckIds = ["classic", "blue", "red"];
  for (const [i, seed] of [1001, 20260716, 777].entries()) {
    try {
      const { result, violations } = await bot.simulate(seed, deckIds[i]);
      bestAnte = Math.max(bestAnte, G.ante);
      console.log(`模拟 seed=${seed} ${deckIds[i]}: ${result}, 底注 ${G.ante}, 回合 ${G.round}, 小丑 ${G.jokers.length}, $${G.money}`);
      assert(["win", "lose", "cap"].includes(result), `模拟正常结束 (seed=${seed}): ${result}`);
      assert(violations.length === 0, `模拟无不变量违规 (seed=${seed}): ${violations.join("; ")}`);
    } catch (e) {
      fail++;
      console.error(`FAIL 模拟崩溃 (seed=${seed}):`, e.stack || e.message);
    }
  }
  assert(bestAnte >= 2, "机器人至少打到底注 2（覆盖商店/Boss路径）: " + bestAnte);

  console.log("结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
