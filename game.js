/* =========================================================
   小丑牌 · JOKER — Balatro 风格网页卡牌游戏
   ========================================================= */
"use strict";

/* ---------- 工具 ---------- */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "e9" : n.toLocaleString("en-US");

/* ---------- 音效 (WebAudio) ---------- */
const AudioFX = (() => {
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, type = "sine", vol = .18, when = 0) {
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime + when);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + when + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + when); o.stop(c.currentTime + when + dur);
    } catch (e) { /* 忽略 */ }
  }
  return {
    select: () => tone(520, .08, "triangle", .12),
    deselect: () => tone(380, .08, "triangle", .1),
    chip: i => tone(600 + i * 90, .1, "square", .07),
    mult: i => tone(300 + i * 60, .12, "sawtooth", .06),
    joker: () => { tone(700, .1, "triangle", .12); tone(1050, .12, "triangle", .1, .06); },
    play: () => tone(440, .12, "triangle", .14),
    discard: () => tone(240, .12, "sawtooth", .08),
    buy: () => { tone(660, .1, "sine", .14); tone(880, .14, "sine", .12, .08); },
    money: () => { tone(880, .08, "square", .08); tone(1320, .1, "square", .07, .05); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .14, i * .1)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .3, "sawtooth", .1, i * .14)),
    boss: () => { tone(150, .4, "sawtooth", .12); tone(147, .4, "sawtooth", .1, .05); },
  };
})();

/* ---------- 常量 ---------- */
const SUITS = ["♠", "♥", "♣", "♦"];
const SUIT_NAME = { "♠": "黑桃", "♥": "红桃", "♣": "梅花", "♦": "方片" };
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
const CHIP_VAL = r => r === "A" ? 11 : (RANK_VAL[r] >= 11 ? 10 : RANK_VAL[r]);

const HAND_TYPES = {
  flush_five:     { name: "同花五条", chips: 160, mult: 16, up: [50, 3] },
  straight_flush: { name: "同花顺",   chips: 100, mult: 8,  up: [40, 4] },
  four_kind:      { name: "四条",     chips: 60,  mult: 7,  up: [30, 3] },
  full_house:     { name: "葫芦",     chips: 40,  mult: 4,  up: [25, 2] },
  flush:          { name: "同花",     chips: 35,  mult: 4,  up: [15, 2] },
  straight:       { name: "顺子",     chips: 30,  mult: 4,  up: [30, 3] },
  three_kind:     { name: "三条",     chips: 30,  mult: 3,  up: [20, 2] },
  two_pair:       { name: "两对",     chips: 20,  mult: 2,  up: [20, 1] },
  pair:           { name: "对子",     chips: 10,  mult: 2,  up: [15, 1] },
  high_card:      { name: "高牌",     chips: 5,   mult: 1,  up: [10, 1] },
};

const ANTE_BASE = [100, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
const MAX_ANTE = 8;

/* ---------- Boss 盲注 ---------- */
const BOSSES = [
  { id: "hook",   name: "钩子",   desc: "每次出牌后随机弃掉 2 张手牌", icon: "🪝" },
  { id: "club",   name: "梅花",   desc: "所有梅花牌被禁用（不计分）", icon: "♣" },
  { id: "goad",   name: "刺棒",   desc: "所有黑桃牌被禁用（不计分）", icon: "♠" },
  { id: "window", name: "窗户",   desc: "所有方片牌被禁用（不计分）", icon: "♦" },
  { id: "head",   name: "头颅",   desc: "所有红桃牌被禁用（不计分）", icon: "♥" },
  { id: "psychic",name: "通灵者", desc: "每次必须打出 5 张牌", icon: "🔮" },
  { id: "manacle",name: "镣铐",   desc: "手牌上限 -1", icon: "⛓" },
  { id: "water",  name: "流水",   desc: "本回合弃牌次数为 0", icon: "💧" },
  { id: "needle", name: "针头",   desc: "本回合只能出 1 次牌", icon: "💉" },
  { id: "wall",   name: "高墙",   desc: "目标分数特别高", icon: "🧱" },
];

/* ---------- 小丑牌定义 ---------- */
/* trigger: perCard(逐卡计分时) / after(牌型算完后) / money(结算时) */
const JOKER_DEFS = [
  { id: "joker", name: "小丑", icon: "🃏", rarity: "common", cost: 3,
    desc: "+4 倍率",
    after: s => ({ mult: 4 }) },
  { id: "greedy", name: "贪婪小丑", icon: "🤑", rarity: "common", cost: 5,
    desc: "打出的每张方片牌 +3 倍率",
    perCard: (c) => c.suit === "♦" ? { mult: 3 } : null },
  { id: "lusty", name: "色欲小丑", icon: "😈", rarity: "common", cost: 5,
    desc: "打出的每张红桃牌 +3 倍率",
    perCard: (c) => c.suit === "♥" ? { mult: 3 } : null },
  { id: "wrathful", name: "暴怒小丑", icon: "😡", rarity: "common", cost: 5,
    desc: "打出的每张黑桃牌 +3 倍率",
    perCard: (c) => c.suit === "♠" ? { mult: 3 } : null },
  { id: "gluttonous", name: "暴食小丑", icon: "😋", rarity: "common", cost: 5,
    desc: "打出的每张梅花牌 +3 倍率",
    perCard: (c) => c.suit === "♣" ? { mult: 3 } : null },
  { id: "wily", name: "机智小丑", icon: "🧠", rarity: "common", cost: 4,
    desc: "打出的牌含三条时 +100 筹码",
    after: (s) => s.hasThree ? { chips: 100 } : null },
  { id: "sly", name: "狡猾小丑", icon: "🦊", rarity: "common", cost: 4,
    desc: "打出的牌含对子时 +50 筹码",
    after: (s) => s.hasPair ? { chips: 50 } : null },
  { id: "crafty", name: "灵巧小丑", icon: "🛠", rarity: "common", cost: 4,
    desc: "打出同花时 +80 筹码",
    after: (s) => s.type === "flush" || s.type === "straight_flush" || s.type === "flush_five" ? { chips: 80 } : null },
  { id: "jolly", name: "快乐小丑", icon: "😆", rarity: "common", cost: 4,
    desc: "打出的牌含对子时 +8 倍率",
    after: (s) => s.hasPair ? { mult: 8 } : null },
  { id: "zany", name: "滑稽小丑", icon: "🤪", rarity: "common", cost: 5,
    desc: "打出的牌含三条时 +12 倍率",
    after: (s) => s.hasThree ? { mult: 12 } : null },
  { id: "droll", name: "古怪小丑", icon: "🎭", rarity: "common", cost: 5,
    desc: "打出同花时 +10 倍率",
    after: (s) => s.type === "flush" || s.type === "straight_flush" || s.type === "flush_five" ? { mult: 10 } : null },
  { id: "crazy", name: "疯狂小丑", icon: "🌀", rarity: "common", cost: 5,
    desc: "打出顺子时 +12 倍率",
    after: (s) => s.type === "straight" || s.type === "straight_flush" ? { mult: 12 } : null },
  { id: "half", name: "半张小丑", icon: "🌓", rarity: "common", cost: 5,
    desc: "打出 ≤3 张牌时 +20 倍率",
    after: (s) => s.playedCount <= 3 ? { mult: 20 } : null },
  { id: "banner", name: "旗帜", icon: "🚩", rarity: "common", cost: 5,
    desc: "每剩余 1 次弃牌 +30 筹码",
    after: (s, g) => g.discardsLeft > 0 ? { chips: 30 * g.discardsLeft } : null },
  { id: "mystic", name: "神秘峰会", icon: "🏔", rarity: "common", cost: 5,
    desc: "弃牌次数为 0 时 +15 倍率",
    after: (s, g) => g.discardsLeft === 0 ? { mult: 15 } : null },
  { id: "fibonacci", name: "斐波那契", icon: "🐚", rarity: "uncommon", cost: 8,
    desc: "打出的每张 A/2/3/5/8 +8 倍率",
    perCard: (c) => ["A", "2", "3", "5", "8"].includes(c.rank) ? { mult: 8 } : null },
  { id: "scary_face", name: "鬼脸", icon: "👻", rarity: "common", cost: 4,
    desc: "打出的每张人头牌 +30 筹码",
    perCard: (c) => ["J", "Q", "K"].includes(c.rank) ? { chips: 30 } : null },
  { id: "even_steven", name: "偶数史蒂文", icon: "2️⃣", rarity: "common", cost: 4,
    desc: "打出的每张偶数牌 (2,4,6,8,10) +4 倍率",
    perCard: (c) => ["2", "4", "6", "8", "10"].includes(c.rank) ? { mult: 4 } : null },
  { id: "odd_todd", name: "奇数托德", icon: "3️⃣", rarity: "common", cost: 4,
    desc: "打出的每张奇数牌 (A,3,5,7,9) +31 筹码",
    perCard: (c) => ["A", "3", "5", "7", "9"].includes(c.rank) ? { chips: 31 } : null },
  { id: "blackboard", name: "黑板", icon: "🖤", rarity: "uncommon", cost: 8,
    desc: "打出的牌全为黑色花色时 ×3 倍率",
    after: (s) => s.cards.every(c => c.suit === "♠" || c.suit === "♣") ? { xmult: 3 } : null },
  { id: "baron_red", name: "红心女王", icon: "👸", rarity: "uncommon", cost: 8,
    desc: "打出的牌全为红色花色时 ×3 倍率",
    after: (s) => s.cards.every(c => c.suit === "♥" || c.suit === "♦") ? { xmult: 3 } : null },
  { id: "cavendish", name: "卡文迪什", icon: "🍌", rarity: "uncommon", cost: 7,
    desc: "×3 倍率，回合结束有 1/6 概率被吃掉",
    after: () => ({ xmult: 3 }),
    roundEnd: (g, j) => { if (Math.random() < 1 / 6) return "destroy"; } },
  { id: "photograph", name: "照片", icon: "📷", rarity: "common", cost: 5,
    desc: "打出的第一张人头牌 ×2 倍率",
    perCard: (c, s) => (["J", "Q", "K"].includes(c.rank) && s.firstFace === c) ? { xmult: 2 } : null },
  { id: "abstract", name: "抽象小丑", icon: "🎨", rarity: "common", cost: 4,
    desc: "每持有 1 张小丑牌 +3 倍率",
    after: (s, g) => ({ mult: 3 * g.jokers.length }) },
  { id: "bull", name: "公牛", icon: "🐂", rarity: "uncommon", cost: 6,
    desc: "每持有 $1 +2 筹码",
    after: (s, g) => g.money > 0 ? { chips: 2 * g.money } : null },
  { id: "bootstraps", name: "自力更生", icon: "👢", rarity: "uncommon", cost: 7,
    desc: "每持有 $5 +2 倍率",
    after: (s, g) => Math.floor(g.money / 5) > 0 ? { mult: 2 * Math.floor(g.money / 5) } : null },
  { id: "golden", name: "黄金小丑", icon: "🪙", rarity: "common", cost: 6,
    desc: "回合结束时获得 $4",
    money: () => 4 },
  { id: "supernova", name: "超新星", icon: "💥", rarity: "uncommon", cost: 6,
    desc: "本局该牌型每打出过 1 次 +1 倍率",
    after: (s, g) => ({ mult: (g.handPlayCounts[s.type] || 0) }) },
  { id: "acrobat", name: "杂技演员", icon: "🤸", rarity: "uncommon", cost: 8,
    desc: "最后一次出牌时 ×3 倍率",
    after: (s, g) => g.handsLeft === 0 ? { xmult: 3 } : null },
  { id: "duo", name: "二重奏", icon: "👯", rarity: "rare", cost: 10,
    desc: "打出的牌含对子时 ×2 倍率",
    after: (s) => s.hasPair ? { xmult: 2 } : null },
  { id: "trio", name: "三重奏", icon: "🎻", rarity: "rare", cost: 10,
    desc: "打出的牌含三条时 ×3 倍率",
    after: (s) => s.hasThree ? { xmult: 3 } : null },
  { id: "canio", name: "卡尼奥", icon: "🎪", rarity: "legendary", cost: 15,
    desc: "×1 倍率，每弃掉一张人头牌永久 +0.5",
    after: (s, g, j) => ({ xmult: 1 + (j.state || 0) }),
    onDiscard: (cards, g, j) => { j.state = (j.state || 0) + cards.filter(c => ["J", "Q", "K"].includes(c.rank)).length * 0.5; } },
];

/* ---------- 星球牌 ---------- */
const PLANETS = [
  { id: "pluto",   name: "冥王星", icon: "🪐", hand: "high_card" },
  { id: "mercury", name: "水星",   icon: "☿", hand: "pair" },
  { id: "uranus",  name: "天王星", icon: "🌀", hand: "two_pair" },
  { id: "venus",   name: "金星",   icon: "♀", hand: "three_kind" },
  { id: "saturn",  name: "土星",   icon: "🪐", hand: "straight" },
  { id: "jupiter", name: "木星",   icon: "🟠", hand: "flush" },
  { id: "earth",   name: "地球",   icon: "🌍", hand: "full_house" },
  { id: "mars",    name: "火星",   icon: "🔴", hand: "four_kind" },
  { id: "neptune", name: "海王星", icon: "🔵", hand: "straight_flush" },
];

/* ---------- 游戏状态 ---------- */
const G = {};

function newGame() {
  Object.assign(G, {
    deck: [], hand: [], selected: new Set(),
    jokers: [], maxJokers: 5,
    money: 4, ante: 1, round: 0,
    handSize: 8, maxHands: 4, maxDiscards: 3,
    handsLeft: 4, discardsLeft: 3,
    roundScore: 0, target: 0,
    blindIndex: 0,           // 0 小盲 1 大盲 2 Boss
    boss: null, currentBoss: null,
    skippedBoss: false,
    handLevels: Object.fromEntries(Object.keys(HAND_TYPES).map(k => [k, 1])),
    handPlayCounts: {},
    shopStock: [], rerollCost: 5,
    scoring: false,
    state: "blind-select",
  });
  pickBoss();
  showBlindSelect();
  render();
}

function pickBoss() { G.boss = rnd(BOSSES); }

function buildDeck() {
  G.deck = [];
  let uid = 0;
  for (const s of SUITS) for (const r of RANKS)
    G.deck.push({ suit: s, rank: r, id: `c${uid++}_${Math.random().toString(36).slice(2, 6)}` });
  // 洗牌
  for (let i = G.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [G.deck[i], G.deck[j]] = [G.deck[j], G.deck[i]];
  }
}

/* ---------- 盲注 ---------- */
function blindTarget(idx) {
  const base = ANTE_BASE[G.ante] ?? ANTE_BASE[ANTE_BASE.length - 1];
  const mults = [1, 1.5, G.boss?.id === "wall" ? 4 : 2];
  return Math.floor(base * mults[idx]);
}
const BLIND_META = [
  { name: "小盲注", cls: "", chip: "", reward: 3 },
  { name: "大盲注", cls: "big-blind", chip: "big", reward: 4 },
  { name: "Boss盲注", cls: "boss-blind", chip: "boss", reward: 5 },
];

function showBlindSelect() {
  G.state = "blind-select";
  const box = $("blind-options");
  box.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const m = BLIND_META[i];
    const el = document.createElement("div");
    el.className = "blind-option" + (i < G.blindIndex ? " done" : "");
    const isBoss = i === 2;
    el.innerHTML = `
      <div class="bo-name ${m.cls}" style="background:${["#006bb8", "#d07f1d", "#7a1fa0"][i]}">${isBoss ? (G.boss.icon + " " + G.boss.name) : m.name}</div>
      <div class="bo-chip">${isBoss ? G.boss.icon : (i === 0 ? "🔵" : "🟠")}</div>
      <div class="bo-target">${fmt(blindTarget(i))}</div>
      <div class="bo-reward">奖励 ${"$".repeat(m.reward)}</div>
      <div class="bo-effect">${isBoss ? G.boss.desc : ""}</div>
      ${i < G.blindIndex
        ? `<div class="bo-done-mark">✔ 已完成</div>`
        : i === G.blindIndex
          ? `<button class="btn btn-blue small" data-i="${i}">选择</button>${i < 2 ? `<button class="btn btn-red small" data-skip="${i}" style="margin-top:6px">跳过</button>` : ""}`
          : `<div class="bo-done-mark" style="color:#5a7a72">即将到来</div>`}
    `;
    box.appendChild(el);
  }
  box.querySelectorAll("button[data-i]").forEach(b =>
    b.onclick = () => startBlind(+b.dataset.i));
  box.querySelectorAll("button[data-skip]").forEach(b =>
    b.onclick = () => { G.blindIndex++; AudioFX.discard(); showBlindSelect(); });
  $("blind-select").classList.remove("hidden");
  $("shop").classList.add("hidden");
}

function startBlind(idx) {
  G.blindIndex = idx;
  G.currentBoss = idx === 2 ? G.boss : null;
  G.round++;
  G.roundScore = 0;
  G.target = blindTarget(idx);
  G.maxHands = 4; G.maxDiscards = 3;
  let handSize = G.handSize;
  if (G.currentBoss) {
    AudioFX.boss();
    if (G.currentBoss.id === "manacle") handSize -= 1;
    if (G.currentBoss.id === "water") G.maxDiscards = 0;
    if (G.currentBoss.id === "needle") G.maxHands = 1;
  } else AudioFX.play();
  G.handsLeft = G.maxHands;
  G.discardsLeft = G.maxDiscards;
  G.curHandSize = handSize;
  buildDeck();
  G.hand = [];
  G.selected.clear();
  drawToFull();
  G.state = "playing";
  $("blind-select").classList.add("hidden");
  render();
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

/* ---------- 选牌 ---------- */
function toggleSelect(card) {
  if (G.scoring || G.state !== "playing") return;
  if (G.selected.has(card.id)) { G.selected.delete(card.id); AudioFX.deselect(); }
  else if (G.selected.size < 5) { G.selected.add(card.id); AudioFX.select(); }
  render();
}

function selectedCards() { return G.hand.filter(c => G.selected.has(c.id)); }

/* ---------- 出牌计分 ---------- */
async function playHand() {
  const cards = selectedCards();
  if (!cards.length || G.scoring || G.state !== "playing") return;
  if (G.currentBoss?.id === "psychic" && cards.length !== 5) {
    flashMessage("🔮 通灵者：必须打出 5 张牌!");
    return;
  }
  G.scoring = true;
  G.handsLeft--;
  AudioFX.play();

  // 移入出牌区
  G.hand = G.hand.filter(c => !G.selected.has(c.id));
  G.selected.clear();
  const playArea = $("play-area");
  playArea.innerHTML = "";
  const cardEls = new Map();
  for (const c of cards) {
    const el = makeCardEl(c);
    if (isDebuffed(c)) el.classList.add("debuffed");
    playArea.appendChild(el);
    cardEls.set(c.id, el);
  }
  renderHand(); renderStats();
  await sleep(350);

  // 判定牌型
  const ev = evaluate(cards);
  const stats = handStats(ev.type);
  G.handPlayCounts[ev.type] = (G.handPlayCounts[ev.type] || 0) + 1;
  let chips = stats.chips, mult = stats.mult;
  $("hand-name").innerHTML = `${HAND_TYPES[ev.type].name} <span class="lvl">Lv.${stats.lvl}</span>`;
  setCalc(chips, mult);
  await sleep(450);

  const ctx = {
    type: ev.type, cards, playedCount: cards.length,
    hasPair: ev.hasPair, hasThree: ev.hasThree,
    firstFace: cards.find(c => ["J", "Q", "K"].includes(c.rank) && !isDebuffed(c)) || null,
  };

  // 逐卡计分
  let i = 0;
  for (const c of ev.scoringCards) {
    const el = cardEls.get(c.id);
    el.classList.add("scoring");
    chips += CHIP_VAL(c.rank);
    AudioFX.chip(i++);
    floatText(el, `+${CHIP_VAL(c.rank)}`, "chips");
    setCalc(chips, mult, "chips");
    await sleep(260);
    // 小丑牌逐卡效果
    for (const j of G.jokers) {
      const def = JOKER_DEFS.find(d => d.id === j.id);
      if (!def.perCard) continue;
      const r = def.perCard(c, ctx, G, j);
      if (r) {
        ({ chips, mult } = await applyJokerEffect(j, r, chips, mult));
      }
    }
    el.classList.remove("scoring");
    el.classList.add("scored");
  }

  // 小丑牌整体效果
  for (const j of G.jokers) {
    const def = JOKER_DEFS.find(d => d.id === j.id);
    if (!def.after) continue;
    const r = def.after(ctx, G, j);
    if (r) ({ chips, mult } = await applyJokerEffect(j, r, chips, mult));
  }

  // 结算总分
  await sleep(300);
  const total = Math.floor(chips * mult);
  showTotalBurst(chips, mult, total);
  AudioFX.money();
  $("game").classList.add("shake");
  setTimeout(() => $("game").classList.remove("shake"), 400);
  await countUp(G.roundScore, G.roundScore + total, 600);
  G.roundScore += total;
  await sleep(500);

  // 清理出牌区
  playArea.innerHTML = "";
  setCalc(0, 0);
  $("hand-name").innerHTML = "&nbsp;";

  // Boss: 钩子
  if (G.currentBoss?.id === "hook") {
    for (let k = 0; k < 2 && G.hand.length; k++) {
      const idx = Math.floor(Math.random() * G.hand.length);
      G.hand.splice(idx, 1);
    }
    flashMessage("🪝 钩子弃掉了你 2 张手牌!");
  }

  drawToFull();
  G.scoring = false;

  // 胜负判定
  if (G.roundScore >= G.target) { await winRound(); return; }
  if (G.handsLeft <= 0) { gameOver(false); return; }
  render();
}

async function applyJokerEffect(j, r, chips, mult) {
  const jokerEl = document.querySelector(`[data-jid="${j.uid}"]`);
  if (jokerEl) {
    jokerEl.classList.add("triggered");
    setTimeout(() => jokerEl.classList.remove("triggered"), 420);
  }
  AudioFX.joker();
  if (r.chips) { chips += r.chips; if (jokerEl) floatText(jokerEl, `+${r.chips}`, "chips"); setCalc(chips, mult, "chips"); }
  if (r.mult) { mult += r.mult; if (jokerEl) floatText(jokerEl, `+${r.mult} 倍率`, "mult"); setCalc(chips, mult, "mult"); }
  if (r.xmult) { mult = Math.round(mult * r.xmult * 100) / 100; if (jokerEl) floatText(jokerEl, `×${r.xmult}`, "mult"); setCalc(chips, mult, "mult"); }
  await sleep(340);
  return { chips, mult };
}

function setCalc(chips, mult, bump) {
  $("chips-box").textContent = fmt(Math.floor(chips));
  $("mult-box").textContent = fmt(Math.round(mult * 100) / 100);
  if (bump) {
    const el = $(bump === "chips" ? "chips-box" : "mult-box");
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 120);
  }
}

async function countUp(from, to, dur) {
  const el = $("round-score");
  const start = performance.now();
  return new Promise(res => {
    function step(t) {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.floor(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
  });
}

function floatText(el, text, cls) {
  const f = document.createElement("div");
  f.className = `float-score ${cls}`;
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 850);
}

function flashMessage(msg) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;top:18%;left:50%;transform:translateX(-50%);background:rgba(10,20,18,.92);border:2px solid #7a1fa0;border-radius:12px;padding:12px 26px;font-size:18px;font-weight:800;z-index:300;animation:fadeIn .2s";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

/* 总分爆发 */
function showTotalBurst(chips, mult, total) {
  const el = document.createElement("div");
  el.className = "total-burst";
  el.innerHTML = `<span class="tb-chips">${fmt(Math.floor(chips))}</span><span class="tb-x">×</span><span class="tb-mult">${fmt(Math.round(mult * 100) / 100)}</span><span class="tb-eq">=</span><span class="tb-total">${fmt(total)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

/* ---------- 弃牌 ---------- */
function discard() {
  const cards = selectedCards();
  if (!cards.length || !G.discardsLeft || G.scoring) return;
  G.discardsLeft--;
  AudioFX.discard();
  for (const j of G.jokers) {
    const def = JOKER_DEFS.find(d => d.id === j.id);
    if (def.onDiscard) def.onDiscard(cards, G, j);
  }
  G.hand = G.hand.filter(c => !G.selected.has(c.id));
  G.selected.clear();
  drawToFull();
  render();
}

/* ---------- 彩带粒子 ---------- */
function confetti(count = 80) {
  const colors = ["#f7d774", "#f4443e", "#0092e0", "#38bd64", "#a63fe0", "#ff8f80"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    const size = 6 + Math.random() * 8;
    p.style.cssText = `
      left:${Math.random() * 100}vw;
      width:${size}px;height:${size * (Math.random() > .5 ? 1 : .4)}px;
      background:${rnd(colors)};
      animation-duration:${2.2 + Math.random() * 2}s;
      animation-delay:${Math.random() * .8}s;
      --drift:${(Math.random() - .5) * 240}px;
      --spin:${(Math.random() - .5) * 1400}deg;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 5200);
  }
}

/* ---------- 回合胜利 / 商店 ---------- */
async function winRound() {
  G.state = "roundwon";
  AudioFX.win();
  confetti(G.blindIndex === 2 ? 140 : 70);
  render();
  await sleep(600);
  const m = BLIND_META[G.blindIndex];
  const lines = [];
  let earn = m.reward;
  lines.push([`击败 ${G.blindIndex === 2 ? G.boss.name : m.name}`, `$${m.reward}`]);
  if (G.handsLeft > 0) { lines.push([`剩余出牌次数 ×${G.handsLeft}`, `$${G.handsLeft}`]); earn += G.handsLeft; }
  const interest = Math.min(5, Math.floor(G.money / 5));
  if (interest > 0) { lines.push([`利息 (每$5得$1, 上限$5)`, `$${interest}`]); earn += interest; }
  for (const j of G.jokers) {
    const def = JOKER_DEFS.find(d => d.id === j.id);
    if (def.money) { const v = def.money(G, j); lines.push([`${def.icon} ${def.name}`, `$${v}`]); earn += v; }
    if (def.roundEnd && def.roundEnd(G, j) === "destroy") {
      flashMessage(`${def.icon} ${def.name} 被吃掉了!`);
      G.jokers = G.jokers.filter(x => x !== j);
    }
  }
  $("cashout-lines").innerHTML = lines.map(([a, b]) =>
    `<div class="co-line"><span>${a}</span><span class="co-val">${b}</span></div>`).join("");
  $("cashout-btn").textContent = `收取 $${earn}`;
  $("cashout-btn").onclick = () => {
    G.money += earn;
    AudioFX.money();
    $("cashout").classList.add("hidden");
    // Boss 击败 → 下一底注
    if (G.blindIndex === 2) {
      G.ante++;
      if (G.ante > MAX_ANTE) { gameOver(true); return; }
      G.blindIndex = 0;
      pickBoss();
    } else {
      G.blindIndex++;
    }
    openShop();
  };
  $("cashout").classList.remove("hidden");
}

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
}

function openShop() {
  G.state = "shop";
  G.rerollCost = 5;
  rollShop();
  renderShop();
  $("shop").classList.remove("hidden");
  render();
}

function renderShop() {
  const box = $("shop-items");
  box.innerHTML = "";
  G.shopStock.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "shop-item" + (item.sold ? " sold" : "");
    let cardEl, price;
    if (item.kind === "joker") {
      price = item.def.cost;
      cardEl = makeJokerEl({ id: item.def.id, uid: "shop" + idx }, true);
    } else {
      price = 3;
      const ht = HAND_TYPES[item.def.hand];
      cardEl = document.createElement("div");
      cardEl.className = "planet-card";
      cardEl.innerHTML = `<div class="p-icon">${item.def.icon}</div>
        <div class="p-name">${item.def.name}</div>
        <div class="p-desc">升级 ${ht.name}<br>+${ht.up[0]}筹码 +${ht.up[1]}倍率</div>`;
    }
    const priceEl = document.createElement("div");
    priceEl.className = "price-tag";
    priceEl.textContent = `$${price}`;
    const buyBtn = document.createElement("button");
    buyBtn.className = "btn btn-orange buy-btn";
    buyBtn.textContent = item.sold ? "已售" : "购买";
    buyBtn.disabled = item.sold || G.money < price ||
      (item.kind === "joker" && G.jokers.length >= G.maxJokers);
    buyBtn.onclick = () => buyItem(item, price);
    wrap.append(priceEl, cardEl, buyBtn);
    box.appendChild(wrap);
  });
  $("reroll-btn").textContent = `刷新 $${G.rerollCost}`;
  $("reroll-btn").disabled = G.money < G.rerollCost;
}

function buyItem(item, price) {
  if (G.money < price || item.sold) return;
  G.money -= price;
  item.sold = true;
  AudioFX.buy();
  if (item.kind === "joker") {
    G.jokers.push({ id: item.def.id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
  } else {
    G.handLevels[item.def.hand]++;
    flashMessage(`${item.def.icon} ${HAND_TYPES[item.def.hand].name} 升到 Lv.${G.handLevels[item.def.hand]}!`);
  }
  renderShop(); render();
}

function sellJoker(j) {
  if (G.scoring) return;
  const def = JOKER_DEFS.find(d => d.id === j.id);
  const v = Math.max(1, Math.floor(def.cost / 2));
  G.jokers = G.jokers.filter(x => x !== j);
  G.money += v;
  AudioFX.money();
  flashMessage(`卖出 ${def.name} +$${v}`);
  hideTooltip();
  render();
  if (G.state === "shop") renderShop();
}

/* ---------- 结束 ---------- */
function gameOver(win) {
  G.state = "over";
  win ? AudioFX.win() : AudioFX.lose();
  if (win) confetti(220);
  $("end-title").textContent = win ? "🎉 通关胜利!" : "游戏结束";
  $("end-title").className = "end-title " + (win ? "win" : "lose");
  $("end-detail").innerHTML = win
    ? `你击败了全部 ${MAX_ANTE} 个底注!<br>最终资金: $${G.money}`
    : `倒在了 底注 ${G.ante} · ${G.blindIndex === 2 ? G.boss.name : BLIND_META[G.blindIndex].name}<br>差 ${fmt(Math.max(0, G.target - G.roundScore))} 分`;
  $("end-screen").classList.remove("hidden");
}

/* ---------- 渲染 ---------- */
/* 标准扑克点阵排布 [x%, y%, 是否倒转] */
const PIP_LAYOUTS = {
  "2": [[50, 22], [50, 78, 1]],
  "3": [[50, 20], [50, 50], [50, 80, 1]],
  "4": [[32, 22], [68, 22], [32, 78, 1], [68, 78, 1]],
  "5": [[32, 22], [68, 22], [50, 50], [32, 78, 1], [68, 78, 1]],
  "6": [[32, 22], [68, 22], [32, 50], [68, 50], [32, 78, 1], [68, 78, 1]],
  "7": [[32, 22], [68, 22], [50, 36], [32, 50], [68, 50], [32, 78, 1], [68, 78, 1]],
  "8": [[32, 22], [68, 22], [50, 36], [32, 50], [68, 50], [50, 64, 1], [32, 78, 1], [68, 78, 1]],
  "9": [[32, 19], [68, 19], [32, 41], [68, 41], [50, 50], [32, 59, 1], [68, 59, 1], [32, 81, 1], [68, 81, 1]],
  "10": [[32, 19], [68, 19], [50, 30], [32, 41], [68, 41], [32, 59, 1], [68, 59, 1], [50, 70, 1], [32, 81, 1], [68, 81, 1]],
};
const FACE_ART = { J: "⚜️", Q: "👑", K: "♛" };
const FACE_CHAR = { J: "J", Q: "Q", K: "K" };

function makeCardEl(c) {
  const el = document.createElement("div");
  const red = c.suit === "♥" || c.suit === "♦";
  el.className = `card ${red ? "red-suit" : "dark-suit"}`;
  el.dataset.cid = c.id;

  const corners = `
    <div class="corner tl">${c.rank}<small>${c.suit}</small></div>
    <div class="corner br">${c.rank}<small>${c.suit}</small></div>`;

  let center;
  if (c.rank === "A") {
    center = `<div class="ace-area"><div class="ace-pip">${c.suit}</div><div class="ace-ring"></div></div>`;
  } else if (FACE_ART[c.rank]) {
    center = `
      <div class="face-frame">
        <div class="face-suit ftl">${c.suit}</div>
        <div class="face-art">${FACE_ART[c.rank]}</div>
        <div class="face-char">${FACE_CHAR[c.rank]}</div>
        <div class="face-suit fbr">${c.suit}</div>
      </div>`;
  } else {
    const pips = (PIP_LAYOUTS[c.rank] || []).map(([x, y, inv]) =>
      `<span class="pip-item${inv ? " inv" : ""}" style="left:${x}%;top:${y}%">${c.suit}</span>`
    ).join("");
    center = `<div class="pips">${pips}</div>`;
  }
  el.innerHTML = corners + center + `<div class="card-gloss"></div>`;
  return el;
}

/* 3D 视差倾斜：鼠标跟随 + 光泽随动 */
function attachTilt(el, maxDeg = 16) {
  el.addEventListener("mousemove", e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5;
    const py = (e.clientY - r.top) / r.height - .5;
    el.style.setProperty("--ry", (px * maxDeg).toFixed(2) + "deg");
    el.style.setProperty("--rx", (-py * maxDeg).toFixed(2) + "deg");
    el.style.setProperty("--gx", ((px + .5) * 100).toFixed(1) + "%");
    el.style.setProperty("--gy", ((py + .5) * 100).toFixed(1) + "%");
  });
  el.addEventListener("mouseleave", () => {
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  });
}

function renderHand() {
  const box = $("hand");
  box.innerHTML = "";
  const n = G.hand.length;
  let dealIdx = 0;
  G.hand.forEach((c, i) => {
    const el = makeCardEl(c);
    if (G.selected.has(c.id)) el.classList.add("selected");
    if (isDebuffed(c)) el.classList.add("debuffed");
    // 扇形排列
    const mid = (n - 1) / 2;
    const off = i - mid;
    el.style.transform = `rotate(${off * 2.2}deg) translateY(${Math.abs(off) * 4}px)`;
    el.style.zIndex = i;
    // 发牌动画（新抽的牌依次飞入）
    if (c.isNew) {
      el.classList.add("deal-in");
      el.style.animationDelay = (dealIdx++ * 60) + "ms";
      c.isNew = false;
    }
    el.onclick = () => toggleSelect(c);
    attachTilt(el);
    box.appendChild(el);
  });
  $("deck-count").textContent = `${G.deck.length}/52`;
}

function makeJokerEl(j, isShop = false) {
  const def = JOKER_DEFS.find(d => d.id === j.id);
  const el = document.createElement("div");
  el.className = `joker ${def.rarity}`;
  el.dataset.jid = j.uid;
  const rarityName = { common: "普通", uncommon: "罕见", rare: "稀有", legendary: "传奇" }[def.rarity];
  el.innerHTML = `<div class="j-icon">${def.icon}</div><div class="j-name">${def.name}</div><div class="j-tag">${rarityName}</div>`;
  el.onmouseenter = e => showTooltip(e, def, isShop);
  el.onmousemove = e => moveTooltip(e);
  el.onmouseleave = hideTooltip;
  attachTilt(el, 20);
  if (!isShop) el.onclick = () => { if (confirm(`卖出 ${def.name} 得 $${Math.max(1, Math.floor(def.cost / 2))}？`)) sellJoker(j); };
  return el;
}

function showTooltip(e, def, isShop) {
  const tt = $("tooltip");
  const rarityName = { common: "普通", uncommon: "罕见", rare: "稀有", legendary: "传奇" }[def.rarity];
  tt.innerHTML = `<div class="tt-title">${def.icon} ${def.name}</div>
    <div class="tt-rarity ${def.rarity}">${rarityName}</div>
    <div class="tt-desc">${def.desc}</div>
    ${isShop ? "" : `<div class="tt-sell">点击卖出 $${Math.max(1, Math.floor(def.cost / 2))}</div>`}`;
  tt.classList.remove("hidden");
  moveTooltip(e);
}
function moveTooltip(e) {
  const tt = $("tooltip");
  const x = Math.min(e.clientX + 16, window.innerWidth - 250);
  const y = Math.min(e.clientY + 16, window.innerHeight - tt.offsetHeight - 16);
  tt.style.left = x + "px"; tt.style.top = y + "px";
}
function hideTooltip() { $("tooltip").classList.add("hidden"); }

function renderJokers() {
  const box = $("jokers");
  box.innerHTML = "";
  G.jokers.forEach(j => box.appendChild(makeJokerEl(j)));
  for (let i = G.jokers.length; i < G.maxJokers; i++) {
    const s = document.createElement("div");
    s.className = "empty-slot";
    box.appendChild(s);
  }
  $("joker-count").textContent = `${G.jokers.length}/${G.maxJokers}`;
}

function renderStats() {
  $("hands-left").textContent = G.handsLeft;
  $("discards-left").textContent = G.discardsLeft;
  $("money").textContent = "$" + G.money;
  $("ante").textContent = G.ante;
  $("round").textContent = G.round;
  $("round-score").textContent = fmt(G.roundScore);
  const m = BLIND_META[G.blindIndex] || BLIND_META[0];
  const isBoss = G.blindIndex === 2 && G.state === "playing";
  $("blind-name").textContent = isBoss ? `${G.boss.icon} ${G.boss.name}` : m.name;
  $("blind-name").className = "blind-name " + m.cls;
  $("blind-chip").className = "blind-chip " + m.chip;
  $("blind-chip").textContent = isBoss ? G.boss.icon : "";
  $("blind-target").textContent = fmt(G.state === "playing" ? G.target : blindTarget(G.blindIndex));
  $("blind-reward").textContent = "奖励 " + "$".repeat(m.reward);
  const eff = $("blind-effect");
  if (isBoss) { eff.textContent = G.boss.desc; eff.classList.remove("hidden"); }
  else eff.classList.add("hidden");
}

function render() {
  renderHand();
  renderJokers();
  renderStats();
  // 预览选中牌型
  const sel = selectedCards();
  if (sel.length && !G.scoring) {
    const ev = evaluate(sel);
    const st = handStats(ev.type);
    $("hand-name").innerHTML = `${HAND_TYPES[ev.type].name} <span class="lvl">Lv.${st.lvl}</span>`;
    setCalc(st.chips, st.mult);
  } else if (!G.scoring) {
    $("hand-name").innerHTML = "&nbsp;";
    setCalc(0, 0);
  }
  $("play-btn").disabled = !sel.length || G.scoring || G.state !== "playing";
  $("discard-btn").disabled = !sel.length || !G.discardsLeft || G.scoring || G.state !== "playing";
  $("discard-btn").textContent = `弃牌 (${G.discardsLeft})`;
  $("play-btn").textContent = `出牌 (${G.handsLeft})`;
}

/* ---------- 牌型等级弹层 ---------- */
function showRunInfo() {
  const box = $("hand-levels");
  box.innerHTML = Object.entries(HAND_TYPES).map(([k, def]) => {
    const st = handStats(k);
    return `<div class="hl-row">
      <span class="hl-lvl">Lv.${st.lvl}</span>
      <span class="hl-name">${def.name}</span>
      <span class="hl-chips">${st.chips}</span><span class="hl-x">×</span><span class="hl-mult">${st.mult}</span>
    </div>`;
  }).join("");
  $("run-info").classList.remove("hidden");
}

/* ---------- 事件绑定 ---------- */
$("play-btn").onclick = playHand;
$("discard-btn").onclick = discard;
$("sort-rank").onclick = () => { sortHand("rank"); render(); };
$("sort-suit").onclick = () => { sortHand("suit"); render(); };
$("run-info-btn").onclick = showRunInfo;
$("close-info-btn").onclick = () => $("run-info").classList.add("hidden");
$("reroll-btn").onclick = () => {
  if (G.money < G.rerollCost) return;
  G.money -= G.rerollCost;
  G.rerollCost += 1;
  AudioFX.discard();
  rollShop(); renderShop(); render();
};
$("next-round-btn").onclick = () => {
  $("shop").classList.add("hidden");
  showBlindSelect();
};
$("restart-btn").onclick = () => {
  $("end-screen").classList.add("hidden");
  newGame();
};

/* ---------- 启动 ---------- */
newGame();
