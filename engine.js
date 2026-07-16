/* =========================================================
   小丑牌 · JOKER — 引擎（RNG / 状态 / 存档 / 牌型判定 / 计分）
   不直接操作 DOM；loadGame/newGame 等在启动后才会调用 ui 层函数。
   ========================================================= */
"use strict";

/* ---------- 可播种随机数 (mulberry32) ----------
   所有影响玩法的随机（洗牌 / Boss / 商店 / 小丑效果）走 rng()，
   纯视觉随机（彩带、倾斜）用 Math.random，不污染随机流。 */
let _rngState = 1;
function seedRNG(seed) { _rngState = (seed >>> 0) || 1; }
function rng() {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = arr => arr[Math.floor(rng() * arr.length)];

/* 字符串 → uint32 种子 (djb2)；今日挑战用本地日期 */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
const todaySeed = () => hashStr("joker-" + new Date().toLocaleDateString("sv"));

/* ---------- 游戏状态 ---------- */
const G = {};

/* ---------- 存档 ---------- */
const SAVE_KEY = "joker_save_v1";

function saveGame() {
  if (G.state === "over") { localStorage.removeItem(SAVE_KEY); return; }
  try {
    const data = {
      v: 3,
      money: G.money, ante: G.ante, round: G.round,
      blindIndex: G.blindIndex, bossId: G.boss?.id,
      jokers: G.jokers.map(j => ({ id: j.id, uid: j.uid, state: j.state })),
      consumables: G.consumables.map(c => ({ id: c.id, uid: c.uid })),
      handLevels: G.handLevels, handPlayCounts: G.handPlayCounts,
      seed: G.seed, rngState: _rngState,
      masterDeck: G.masterDeck,
      handSize: G.handSize, bonusHands: G.bonusHands,
      bonusDiscards: G.bonusDiscards, freeReroll: G.freeReroll,
      seenBosses: G.seenBosses, endless: G.endless, bestHand: G.bestHand,
      state: G.state === "playing" ? "playing" : "other",
    };
    // 回合中存档：刷新后可从当前手牌继续
    if (G.state === "playing" && !G.scoring) {
      data.mid = {
        deck: G.deck, hand: G.hand,
        handsLeft: G.handsLeft, discardsLeft: G.discardsLeft,
        roundScore: G.roundScore, target: G.target,
        curHandSize: G.curHandSize, maxHands: G.maxHands, maxDiscards: G.maxDiscards,
        sortMode: G.sortMode || "rank",
      };
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* 隐私模式等场景静默失败 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (typeof d.ante !== "number" || !Array.isArray(d.jokers)) return false;
    newGameState();
    if (typeof d.seed === "number") G.seed = d.seed;
    seedRNG(typeof d.rngState === "number" ? d.rngState : G.seed);
    G.money = d.money; G.ante = d.ante; G.round = d.round;
    G.blindIndex = d.blindIndex ?? 0;
    G.boss = BOSSES.find(b => b.id === d.bossId) || rnd(BOSSES);
    G.jokers = d.jokers.filter(j => JOKER_BY_ID.has(j.id));
    G.consumables = (d.consumables || []).filter(c => TAROT_BY_ID.has(c.id));
    Object.assign(G.handLevels, d.handLevels);
    G.handPlayCounts = d.handPlayCounts || {};
    if (Array.isArray(d.masterDeck) && d.masterDeck.length) G.masterDeck = d.masterDeck;
    G.handSize = d.handSize ?? 8;
    G.bonusHands = d.bonusHands || 0;
    G.bonusDiscards = d.bonusDiscards || 0;
    G.freeReroll = d.freeReroll || 0;
    G.seenBosses = Array.isArray(d.seenBosses) ? d.seenBosses : [];
    G.endless = !!d.endless;
    G.bestHand = d.bestHand || null;
    if (d.state === "playing" && d.mid && Array.isArray(d.mid.hand)) {
      Object.assign(G, {
        state: "playing",
        deck: d.mid.deck || [], hand: d.mid.hand,
        handsLeft: d.mid.handsLeft, discardsLeft: d.mid.discardsLeft,
        roundScore: d.mid.roundScore || 0, target: d.mid.target,
        curHandSize: d.mid.curHandSize || G.handSize,
        maxHands: d.mid.maxHands ?? 4, maxDiscards: d.mid.maxDiscards ?? 3,
        sortMode: d.mid.sortMode || "rank",
      });
      G.currentBoss = G.blindIndex === 2 ? G.boss : null;
      $("blind-select").classList.add("hidden");
      $("shop").classList.add("hidden");
      render();
      flashMessage("📂 已恢复上局进度");
    } else {
      showBlindSelect();
      render();
      flashMessage("📂 已恢复上局进度（回到盲注选择）");
    }
    return true;
  } catch (e) { return false; }
}

function newGameState(seed) {
  const s = (seed ?? Date.now()) >>> 0;
  seedRNG(s);
  Object.assign(G, {
    seed: s,
    masterDeck: buildMasterDeck(),
    deck: [], hand: [], selected: new Set(),
    jokers: [], maxJokers: 5,
    consumables: [], maxConsumables: 2,
    money: 4, ante: 1, round: 0,
    handSize: 8, maxHands: 4, maxDiscards: 3,
    handsLeft: 4, discardsLeft: 3,
    bonusHands: 0, bonusDiscards: 0, freeReroll: 0,
    roundScore: 0, target: 0,
    blindIndex: 0,           // 0 小盲 1 大盲 2 Boss
    boss: null, currentBoss: null,
    seenBosses: [], endless: false, bestHand: null,
    handLevels: Object.fromEntries(Object.keys(HAND_TYPES).map(k => [k, 1])),
    handPlayCounts: {},
    shopStock: [], rerollCost: 5,
    scoring: false, speed: 1,
    state: "blind-select",
  });
}

function newGame(seed) {
  newGameState(seed);
  pickBoss();
  showBlindSelect();
  render();
}

/* 同一局内 Boss 不重复，全部见过后重置池 */
function pickBoss() {
  let pool = BOSSES.filter(b => !G.seenBosses.includes(b.id));
  if (!pool.length) { G.seenBosses = []; pool = BOSSES; }
  G.boss = rnd(pool);
  G.seenBosses.push(G.boss.id);
}

/* ---------- 牌库 ----------
   masterDeck 整局持久（塔罗可改花色/点数/增强/销毁），
   每个盲注从它复制 + 洗牌得到本回合的 deck。 */
function buildMasterDeck() {
  const d = [];
  let uid = 0;
  for (const s of SUITS) for (const r of RANKS)
    d.push({ suit: s, rank: r, id: `m${uid++}` });
  return d;
}

function buildDeck() {
  G.deck = G.masterDeck.map(c => ({ ...c }));
  for (let i = G.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [G.deck[i], G.deck[j]] = [G.deck[j], G.deck[i]];
  }
}

/* 对一张牌的所有副本（母牌库 / 本回合牌库 / 手牌）应用修改 */
function applyCardMod(id, fn) {
  for (const arr of [G.masterDeck, G.deck, G.hand]) {
    const c = arr.find(x => x.id === id);
    if (c) fn(c);
  }
}

/* ---------- 盲注目标 ---------- */
function blindTarget(idx) {
  const ai = G.ante - 1;
  const base = ai < ANTE_BASE.length
    ? ANTE_BASE[ai]
    : ANTE_BASE[ANTE_BASE.length - 1] * Math.pow(ENDLESS_GROWTH, ai - ANTE_BASE.length + 1);
  const mults = [1, 1.5, G.boss?.id === "wall" ? 4 : 2];
  return Math.floor(base * (mults[idx] ?? 1));
}

function drawToFull() {
  while (G.hand.length < G.curHandSize && G.deck.length > 0) {
    const c = G.deck.pop();
    c.isNew = true;           // 用于发牌动画
    G.hand.push(c);
  }
  sortHand(G.sortMode || "rank");
}

function sortHand(mode) {
  G.sortMode = mode;
  if (mode === "rank")
    G.hand.sort((a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank] || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  else
    G.hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || RANK_VAL[b.rank] - RANK_VAL[a.rank]);
}

function selectedCards() { return G.hand.filter(c => G.selected.has(c.id)); }

/* ---------- 牌型判定 ---------- */
function isDebuffed(card) {
  if (!G.currentBoss) return false;
  const map = { club: "♣", goad: "♠", window: "♦", head: "♥" };
  return map[G.currentBoss.id] === card.suit;
}

function evaluate(cards) {
  const active = cards.filter(c => !isDebuffed(c));
  const ranks = active.map(c => RANK_VAL[c.rank]);
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.values(counts).sort((a, b) => b - a);
  const suits = new Set(active.map(c => c.suit));
  const isFlush = active.length === 5 && suits.size === 1;
  let isStraight = false;
  if (active.length === 5) {
    const u = [...new Set(ranks)].sort((a, b) => a - b);
    if (u.length === 5) {
      isStraight = u[4] - u[0] === 4 ||
        (u.join() === "2,3,4,5,14");  // A-2-3-4-5
    }
  }
  let type;
  if (isFlush && groups[0] === 5) type = "flush_five";
  else if (isFlush && isStraight) type = "straight_flush";
  else if (groups[0] === 4) type = "four_kind";
  else if (groups[0] === 3 && groups[1] === 2) type = "full_house";
  else if (isFlush) type = "flush";
  else if (isStraight) type = "straight";
  else if (groups[0] === 3) type = "three_kind";
  else if (groups[0] === 2 && groups[1] === 2) type = "two_pair";
  else if (groups[0] === 2) type = "pair";
  else type = "high_card";

  // 计分牌：组成牌型的牌（高牌只算最大那张）
  let scoringCards;
  if (type === "high_card") {
    const best = active.slice().sort((a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank])[0];
    scoringCards = best ? [best] : [];
  } else if (["pair", "two_pair", "three_kind", "four_kind", "full_house"].includes(type)) {
    scoringCards = active.filter(c => counts[RANK_VAL[c.rank]] >= 2);
  } else {
    scoringCards = active.slice();
  }
  return {
    type, scoringCards,
    activeCount: active.length,
    hasPair: groups[0] >= 2,
    hasThree: groups[0] >= 3,
  };
}

function handStats(type) {
  const def = HAND_TYPES[type];
  const lvl = G.handLevels[type];
  return {
    chips: def.chips + def.up[0] * (lvl - 1),
    mult: def.mult + def.up[1] * (lvl - 1),
    lvl,
  };
}

/* ---------- 纯函数计分 ----------
   不触碰 DOM / 音效 / 动画，返回完整的计分步骤序列，
   playHand 只负责按步骤播放，测试可直接断言 total。 */
function computeScoring(cards, g = G) {
  const ev = evaluate(cards);
  const stats = handStats(ev.type);
  // 打出的牌全部被 Boss 禁用 → 0 分
  if (cards.length > 0 && ev.activeCount === 0) {
    return { ev, stats, ctx: null, steps: [], chips: 0, mult: 0, total: 0, allDebuffed: true };
  }
  const ctx = {
    type: ev.type, cards, playedCount: cards.length,
    hasPair: ev.hasPair, hasThree: ev.hasThree,
    firstFace: cards.find(c => ["J", "Q", "K"].includes(c.rank) && !isDebuffed(c)) || null,
  };
  let chips = stats.chips, mult = stats.mult;
  const steps = [];
  const applyEffect = (j, r) => {
    if (r.chips) chips += r.chips;
    if (r.mult) mult += r.mult;
    if (r.xmult) mult = Math.round(mult * r.xmult * 100) / 100;
    steps.push({ kind: "joker", joker: j, effect: r, chips, mult });
  };
  for (const c of ev.scoringCards) {
    const add = CHIP_VAL(c.rank) + (c.enh === "bonus" ? ENH_CHIPS : 0);
    chips += add;
    const enhMult = c.enh === "mult" ? ENH_MULT : 0;
    if (enhMult) mult += enhMult;
    steps.push({ kind: "card", card: c, add, enhMult, chips, mult });
    for (const j of g.jokers) {
      const def = JOKER_BY_ID.get(j.id);
      if (!def?.perCard) continue;
      const r = def.perCard(c, ctx, g, j);
      if (r) applyEffect(j, r);
    }
  }
  for (const j of g.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    if (!def?.after) continue;
    const r = def.after(ctx, g, j);
    if (r) applyEffect(j, r);
  }
  return { ev, stats, ctx, steps, chips, mult, total: Math.floor(chips * mult), allDebuffed: false };
}

/* ---------- 商店库存 ---------- */
function rollShop() {
  G.shopStock = [];
  const owned = new Set(G.jokers.map(j => j.id));
  const pool = JOKER_DEFS.filter(d => !owned.has(d.id));
  const weights = { common: 12, uncommon: 5, rare: 2, legendary: 1 };
  for (let i = 0; i < 2 && pool.length; i++) {
    const bag = [];
    pool.forEach(d => { for (let w = 0; w < weights[d.rarity]; w++) bag.push(d); });
    const pick = rnd(bag);
    pool.splice(pool.indexOf(pick), 1);
    G.shopStock.push({ kind: "joker", def: pick, sold: false });
  }
  G.shopStock.push({ kind: "planet", def: rnd(PLANETS), sold: false });
  G.shopStock.push({ kind: "tarot", def: rnd(TAROTS), sold: false });
}
