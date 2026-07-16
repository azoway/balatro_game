/* =========================================================
   小丑牌 · JOKER — Balatro 风格网页卡牌游戏
   ========================================================= */
"use strict";

/* ---------- 工具 ---------- */
const $ = id => document.getElementById(id);
/* 计分期间点击屏幕可 4 倍速快进（G.speed） */
const sleep = ms => new Promise(r => setTimeout(r, ms / (G.speed || 1)));
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + "e9" : n.toLocaleString("en-US");

/* 环境能力检测（测试环境无 matchMedia，一律回退 false） */
const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
const NO_HOVER = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(hover: none)").matches : false;

/* ---------- 可播种随机数 (mulberry32) ----------
   所有影响玩法的随机（洗牌 / Boss / 商店 / 小丑效果）走 rng()，
   纯视觉随机（彩带、倾斜）仍用 Math.random，不污染随机流。 */
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

/* ---------- 音效 (WebAudio) ---------- */
const AudioFX = (() => {
  let ctx = null;
  let muted = false;
  const ac = () => {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();   // 浏览器自动播放策略
    return ctx;
  };
  function tone(freq, dur, type = "sine", vol = .18, when = 0) {
    if (muted) return;
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
    toggleMute: () => (muted = !muted),
    isMuted: () => muted,
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
    roundEnd: (g, j) => { if (rng() < 1 / 6) return "destroy"; } },
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
    desc: "本局该牌型之前每打出过 1 次 +1 倍率",
    after: (s, g) => {
      const n = (g.handPlayCounts[s.type] || 1) - 1;  // 不含本次
      return n > 0 ? { mult: n } : null;
    } },
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
const JOKER_BY_ID = new Map(JOKER_DEFS.map(d => [d.id, d]));
const sellValue = def => Math.max(1, Math.floor(def.cost / 2));

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

/* ---------- 塔罗牌（购买后立即生效的消耗品） ---------- */
const TAROTS = [
  { id: "hermit", name: "隐者", icon: "🕯", cost: 4,
    desc: "金钱翻倍 (最多 +$20)",
    apply: g => { const v = Math.min(20, Math.max(0, g.money)); g.money += v; return `+$${v}`; } },
  { id: "temperance", name: "节制", icon: "⚖️", cost: 4,
    desc: "获得持有小丑牌总售价 (最多 $30)",
    apply: g => {
      const v = Math.min(30, g.jokers.reduce((s, j) => s + sellValue(JOKER_BY_ID.get(j.id)), 0));
      g.money += v; return `+$${v}`;
    } },
  { id: "empress", name: "女皇", icon: "👑", cost: 4,
    desc: "随机牌型 +1 级",
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${HAND_TYPES[k].name} → Lv.${g.handLevels[k]}`;
    } },
  { id: "strength", name: "力量", icon: "💪", cost: 5,
    desc: "每回合弃牌次数 +1 (本局)",
    apply: g => { g.bonusDiscards++; return `弃牌上限 ${3 + g.bonusDiscards}`; } },
  { id: "judgement", name: "审判", icon: "📯", cost: 8,
    desc: "每回合出牌次数 +1 (本局)",
    apply: g => { g.bonusHands++; return `出牌上限 ${4 + g.bonusHands}`; } },
  { id: "tower", name: "高塔", icon: "🗼", cost: 8,
    desc: "手牌上限 +1 (本局)",
    apply: g => { g.handSize++; return `手牌上限 ${g.handSize}`; } },
];

/* ---------- 跳过盲注的标签奖励 ---------- */
const SKIP_TAGS = [
  { id: "cash", name: "金钱标签", icon: "💰",
    apply: g => { g.money += 3; return "+$3"; } },
  { id: "coupon", name: "优惠券标签", icon: "🎟",
    apply: g => { g.freeReroll++; return "下次商店可免费刷新 1 次"; } },
  { id: "orbit", name: "星球标签", icon: "🪐",
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${HAND_TYPES[k].name} 升到 Lv.${g.handLevels[k]}`;
    } },
];

/* ---------- 游戏状态 ---------- */
const G = {};

/* ---------- 存档 ---------- */
const SAVE_KEY = "joker_save_v1";

function saveGame() {
  if (G.state === "over") { localStorage.removeItem(SAVE_KEY); return; }
  try {
    const data = {
      v: 2,
      money: G.money, ante: G.ante, round: G.round,
      blindIndex: G.blindIndex, bossId: G.boss?.id,
      jokers: G.jokers.map(j => ({ id: j.id, uid: j.uid, state: j.state })),
      handLevels: G.handLevels, handPlayCounts: G.handPlayCounts,
      seed: G.seed, rngState: _rngState,
      handSize: G.handSize, bonusHands: G.bonusHands,
      bonusDiscards: G.bonusDiscards, freeReroll: G.freeReroll,
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
    Object.assign(G.handLevels, d.handLevels);
    G.handPlayCounts = d.handPlayCounts || {};
    G.handSize = d.handSize ?? 8;
    G.bonusHands = d.bonusHands || 0;
    G.bonusDiscards = d.bonusDiscards || 0;
    G.freeReroll = d.freeReroll || 0;
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
    deck: [], hand: [], selected: new Set(),
    jokers: [], maxJokers: 5,
    money: 4, ante: 1, round: 0,
    handSize: 8, maxHands: 4, maxDiscards: 3,
    handsLeft: 4, discardsLeft: 3,
    bonusHands: 0, bonusDiscards: 0, freeReroll: 0,
    roundScore: 0, target: 0,
    blindIndex: 0,           // 0 小盲 1 大盲 2 Boss
    boss: null, currentBoss: null,
    skippedBoss: false,
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

function pickBoss() { G.boss = rnd(BOSSES); }

function buildDeck() {
  G.deck = [];
  let uid = 0;
  for (const s of SUITS) for (const r of RANKS)
    G.deck.push({ suit: s, rank: r, id: `c${uid++}` });
  // 洗牌
  for (let i = G.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [G.deck[i], G.deck[j]] = [G.deck[j], G.deck[i]];
  }
}

/* ---------- 盲注 ---------- */
function blindTarget(idx) {
  const base = ANTE_BASE[G.ante - 1] ?? ANTE_BASE[ANTE_BASE.length - 1];
  const mults = [1, 1.5, G.boss?.id === "wall" ? 4 : 2];
  return Math.floor(base * (mults[idx] ?? 1));
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
          ? `<button class="btn btn-blue small" data-i="${i}">选择</button>${i < 2 ? `<button class="btn btn-red small" data-skip="${i}" style="margin-top:6px">跳过 🎁</button>` : ""}`
          : `<div class="bo-done-mark" style="color:#5a7a72">即将到来</div>`}
    `;
    box.appendChild(el);
  }
  box.querySelectorAll("button[data-i]").forEach(b =>
    b.onclick = () => startBlind(+b.dataset.i));
  box.querySelectorAll("button[data-skip]").forEach(b =>
    b.onclick = () => skipBlind());
  $("blind-select").classList.remove("hidden");
  $("shop").classList.add("hidden");
}

/* 跳过盲注 → 随机标签奖励（放弃奖励金/商店，换一个小补偿） */
function skipBlind() {
  const tag = rnd(SKIP_TAGS);
  const msg = tag.apply(G);
  G.blindIndex++;
  AudioFX.discard();
  flashMessage(`${tag.icon} ${tag.name}: ${msg}`);
  saveGame();
  showBlindSelect();
  renderStats();
  return tag;
}

function startBlind(idx) {
  G.blindIndex = idx;
  G.currentBoss = idx === 2 ? G.boss : null;
  G.round++;
  G.roundScore = 0;
  G.target = blindTarget(idx);
  G.maxHands = 4 + G.bonusHands;
  G.maxDiscards = 3 + G.bonusDiscards;
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
  saveGame();
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
    chips += CHIP_VAL(c.rank);
    steps.push({ kind: "card", card: c, add: CHIP_VAL(c.rank), chips, mult });
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

/* ---------- 选牌 ---------- */
function toggleSelect(card) {
  if (G.scoring || G.state !== "playing") return;
  if (G.selected.has(card.id)) { G.selected.delete(card.id); AudioFX.deselect(); }
  else if (G.selected.size < 5) { G.selected.add(card.id); AudioFX.select(); }
  else return;
  // 增量更新：只切换这张牌的选中态，不重建整个手牌 DOM
  const el = $("hand").querySelector?.(`[data-cid="${card.id}"]`);
  if (el) el.classList.toggle("selected", G.selected.has(card.id));
  renderPreview();
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
  G.speed = 1;
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
  renderHand(); renderStats(); renderPreview();
  await sleep(350);

  // 计分（纯函数），出牌次数先入账（超新星语义：不含本次）
  const ev0 = evaluate(cards);
  G.handPlayCounts[ev0.type] = (G.handPlayCounts[ev0.type] || 0) + 1;
  const sc = computeScoring(cards);

  if (sc.allDebuffed) {
    $("hand-name").textContent = "🚫 全部禁用";
    setCalc(0, 0);
    flashMessage("🚫 打出的牌全部被禁用，本次得 0 分!");
    await sleep(700);
  } else {
    $("hand-name").innerHTML = `${HAND_TYPES[sc.ev.type].name} <span class="lvl">Lv.${sc.stats.lvl}</span>`;
    setCalc(sc.stats.chips, sc.stats.mult);
    await sleep(450);

    // 按步骤播放动画
    let curEl = null, chipIdx = 0;
    for (const step of sc.steps) {
      if (step.kind === "card") {
        if (curEl) { curEl.classList.remove("scoring"); curEl.classList.add("scored"); }
        curEl = cardEls.get(step.card.id) || null;
        if (curEl) curEl.classList.add("scoring");
        AudioFX.chip(chipIdx++);
        if (curEl) floatText(curEl, `+${step.add}`, "chips");
        setCalc(step.chips, step.mult, "chips");
        await sleep(260);
      } else {
        await animateJokerStep(step);
      }
    }
    if (curEl) { curEl.classList.remove("scoring"); curEl.classList.add("scored"); }

    // 结算总分
    await sleep(300);
    showTotalBurst(sc.chips, sc.mult, sc.total);
    AudioFX.money();
    if (!REDUCED_MOTION) {
      $("game").classList.add("shake");
      setTimeout(() => $("game").classList.remove("shake"), 400);
    }
    await countUp(G.roundScore, G.roundScore + sc.total, 600);
  }
  G.roundScore += sc.total;
  await sleep(500);

  // 清理出牌区
  playArea.innerHTML = "";
  setCalc(0, 0);
  $("hand-name").innerHTML = "&nbsp;";

  // Boss: 钩子
  if (G.currentBoss?.id === "hook") {
    const hooked = [];
    for (let k = 0; k < 2 && G.hand.length; k++) {
      const idx = Math.floor(rng() * G.hand.length);
      hooked.push(...G.hand.splice(idx, 1));
    }
    // 与主动弃牌一致，触发小丑牌 onDiscard
    for (const j of G.jokers) {
      const def = JOKER_BY_ID.get(j.id);
      if (def?.onDiscard) def.onDiscard(hooked, G, j);
    }
    flashMessage("🪝 钩子弃掉了你 2 张手牌!");
  }

  drawToFull();
  G.scoring = false;
  G.speed = 1;

  // 胜负判定
  if (G.roundScore >= G.target) { await winRound(); return; }
  if (G.handsLeft <= 0) { gameOver(false); return; }
  saveGame();
  render();
}

async function animateJokerStep(step) {
  const jokerEl = document.querySelector(`[data-jid="${step.joker.uid}"]`);
  if (jokerEl) {
    jokerEl.classList.add("triggered");
    setTimeout(() => jokerEl.classList.remove("triggered"), 420);
  }
  AudioFX.joker();
  const r = step.effect;
  if (r.chips) { if (jokerEl) floatText(jokerEl, `+${r.chips}`, "chips"); setCalc(step.chips, step.mult, "chips"); }
  if (r.mult) { if (jokerEl) floatText(jokerEl, `+${r.mult} 倍率`, "mult"); setCalc(step.chips, step.mult, "mult"); }
  if (r.xmult) { if (jokerEl) floatText(jokerEl, `×${r.xmult}`, "mult"); setCalc(step.chips, step.mult, "mult"); }
  await sleep(340);
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
  dur = dur / (G.speed || 1);
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
  el.className = "flash-msg";
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
  if (!cards.length || !G.discardsLeft || G.scoring || G.state !== "playing") return;
  G.discardsLeft--;
  AudioFX.discard();
  for (const j of G.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    if (def?.onDiscard) def.onDiscard(cards, G, j);
  }
  G.hand = G.hand.filter(c => !G.selected.has(c.id));
  G.selected.clear();
  drawToFull();
  saveGame();
  render();
}

/* ---------- 彩带粒子（纯视觉，用 Math.random 不占用游戏随机流） ---------- */
function confetti(count = 80) {
  if (REDUCED_MOTION) return;
  const colors = ["#f7d774", "#f4443e", "#0092e0", "#38bd64", "#a63fe0", "#ff8f80"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    const size = 6 + Math.random() * 8;
    p.style.cssText = `
      left:${Math.random() * 100}vw;
      width:${size}px;height:${size * (Math.random() > .5 ? 1 : .4)}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
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
    const def = JOKER_BY_ID.get(j.id);
    if (def?.money) { const v = def.money(G, j); lines.push([`${def.icon} ${def.name}`, `$${v}`]); earn += v; }
  }
  // 先收集再删除，避免遍历中修改数组
  const destroyed = G.jokers.filter(j => {
    const def = JOKER_BY_ID.get(j.id);
    return def?.roundEnd && def.roundEnd(G, j) === "destroy";
  });
  for (const j of destroyed) {
    const def = JOKER_BY_ID.get(j.id);
    flashMessage(`${def.icon} ${def.name} 被吃掉了!`);
    G.jokers = G.jokers.filter(x => x !== j);
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
    saveGame();
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
  G.shopStock.push({ kind: "tarot", def: rnd(TAROTS), sold: false });
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
    } else if (item.kind === "tarot") {
      price = item.def.cost;
      cardEl = document.createElement("div");
      cardEl.className = "planet-card tarot-card";
      cardEl.innerHTML = `<div class="p-icon">${item.def.icon}</div>
        <div class="p-name">${item.def.name}</div>
        <div class="p-desc">${item.def.desc}</div>`;
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
  $("reroll-btn").textContent = G.freeReroll > 0 ? `刷新 (免费 ×${G.freeReroll})` : `刷新 $${G.rerollCost}`;
  $("reroll-btn").disabled = G.freeReroll <= 0 && G.money < G.rerollCost;
}

function buyItem(item, price) {
  if (G.money < price || item.sold) return;
  G.money -= price;
  item.sold = true;
  AudioFX.buy();
  if (item.kind === "joker") {
    G.jokers.push({ id: item.def.id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
  } else if (item.kind === "tarot") {
    const msg = item.def.apply(G);
    flashMessage(`${item.def.icon} ${item.def.name}: ${msg}`);
  } else {
    G.handLevels[item.def.hand]++;
    flashMessage(`${item.def.icon} ${HAND_TYPES[item.def.hand].name} 升到 Lv.${G.handLevels[item.def.hand]}!`);
  }
  saveGame();
  renderShop(); render();
}

function sellJoker(j) {
  if (G.scoring) return;
  const def = JOKER_BY_ID.get(j.id);
  const v = sellValue(def);
  G.jokers = G.jokers.filter(x => x !== j);
  G.money += v;
  AudioFX.money();
  flashMessage(`卖出 ${def.name} +$${v}`);
  hideTooltip();
  saveGame();
  render();
  if (G.state === "shop") renderShop();
}

/* ---------- 结束 ---------- */
function gameOver(win) {
  G.state = "over";
  localStorage.removeItem(SAVE_KEY);
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

/* 3D 视差倾斜：#game 上统一事件委托，卡牌/小丑不再各自挂监听器 */
let _tiltEl = null;
function resetTilt(el) {
  el.style.setProperty("--ry", "0deg");
  el.style.setProperty("--rx", "0deg");
}
function handleTiltMove(e) {
  if (REDUCED_MOTION) return;
  const el = e.target?.closest?.(".card, .joker") || null;
  if (_tiltEl && _tiltEl !== el) { resetTilt(_tiltEl); _tiltEl = null; }
  if (!el) return;
  _tiltEl = el;
  const maxDeg = el.classList.contains("joker") ? 20 : 16;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - .5;
  const py = (e.clientY - r.top) / r.height - .5;
  el.style.setProperty("--ry", (px * maxDeg).toFixed(2) + "deg");
  el.style.setProperty("--rx", (-py * maxDeg).toFixed(2) + "deg");
  el.style.setProperty("--gx", ((px + .5) * 100).toFixed(1) + "%");
  el.style.setProperty("--gy", ((py + .5) * 100).toFixed(1) + "%");
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
    if (c.isNew && !REDUCED_MOTION) {
      el.classList.add("deal-in");
      el.style.animationDelay = (dealIdx++ * 60) + "ms";
    }
    c.isNew = false;
    box.appendChild(el);
  });
  $("deck-count").textContent = `${G.deck.length}/52`;
}

function makeJokerEl(j, isShop = false) {
  const def = JOKER_BY_ID.get(j.id);
  const el = document.createElement("div");
  el.className = `joker ${def.rarity}`;
  el.dataset.jid = j.uid;
  const rarityName = { common: "普通", uncommon: "罕见", rare: "稀有", legendary: "传奇" }[def.rarity];
  el.innerHTML = `<div class="j-icon">${def.icon}</div><div class="j-name">${def.name}</div><div class="j-tag">${rarityName}</div>`;
  el.onmouseenter = e => showTooltip(e, def, isShop);
  el.onmousemove = e => moveTooltip(e);
  el.onmouseleave = () => { hideTooltip(); cancelSellConfirm(el); };
  // 触屏设备无 hover：点击商店小丑牌显示说明
  if (isShop && NO_HOVER) el.onclick = e => showTooltip(e, def, true);
  // 双击确认出售（避免原生 confirm 阻塞动画）
  if (!isShop) el.onclick = e => {
    if (el.classList.contains("confirm-sell")) { sellJoker(j); return; }
    if (NO_HOVER) showTooltip(e, def, false);   // 触屏首次点击先看说明
    document.querySelectorAll(".joker.confirm-sell").forEach(cancelSellConfirm);
    el.classList.add("confirm-sell");
    const badge = document.createElement("div");
    badge.className = "sell-badge";
    badge.textContent = `再点一次卖出 $${sellValue(def)}`;
    el.appendChild(badge);
    el._sellTimer = setTimeout(() => cancelSellConfirm(el), 2500);
  };
  return el;
}

function showTooltip(e, def, isShop) {
  const tt = $("tooltip");
  const rarityName = { common: "普通", uncommon: "罕见", rare: "稀有", legendary: "传奇" }[def.rarity];
  tt.innerHTML = `<div class="tt-title">${def.icon} ${def.name}</div>
    <div class="tt-rarity ${def.rarity}">${rarityName}</div>
    <div class="tt-desc">${def.desc}</div>
    ${isShop ? "" : `<div class="tt-sell">点击卖出 $${sellValue(def)}</div>`}`;
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

function cancelSellConfirm(el) {
  el.classList.remove("confirm-sell");
  el.querySelector(".sell-badge")?.remove();
  if (el._sellTimer) { clearTimeout(el._sellTimer); el._sellTimer = null; }
}

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

/* 牌型预览 + 按钮状态（选牌时的轻量更新，不重建手牌 DOM） */
function renderPreview() {
  const sel = selectedCards();
  if (sel.length && !G.scoring) {
    const ev = evaluate(sel);
    if (ev.activeCount === 0) {
      $("hand-name").textContent = "🚫 全部禁用";
      setCalc(0, 0);
    } else {
      const st = handStats(ev.type);
      $("hand-name").innerHTML = `${HAND_TYPES[ev.type].name} <span class="lvl">Lv.${st.lvl}</span>`;
      setCalc(st.chips, st.mult);
    }
  } else if (!G.scoring) {
    $("hand-name").innerHTML = "&nbsp;";
    setCalc(0, 0);
  }
  $("play-btn").disabled = !sel.length || G.scoring || G.state !== "playing";
  $("discard-btn").disabled = !sel.length || !G.discardsLeft || G.scoring || G.state !== "playing";
  $("discard-btn").textContent = `弃牌 (${G.discardsLeft})`;
  $("play-btn").textContent = `出牌 (${G.handsLeft})`;
}

function render() {
  renderHand();
  renderJokers();
  renderStats();
  renderPreview();
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
$("new-run-btn").onclick = () => {
  // 双击确认，防误触丢档
  const btn = $("new-run-btn");
  if (btn.dataset.confirm) {
    delete btn.dataset.confirm;
    btn.textContent = "重新开局";
    localStorage.removeItem(SAVE_KEY);
    document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
    newGame();
  } else {
    btn.dataset.confirm = "1";
    btn.textContent = "确认放弃本局?";
    setTimeout(() => { delete btn.dataset.confirm; btn.textContent = "重新开局"; }, 2500);
  }
};
$("close-info-btn").onclick = () => $("run-info").classList.add("hidden");
$("reroll-btn").onclick = () => {
  if (G.freeReroll > 0) G.freeReroll--;
  else if (G.money >= G.rerollCost) { G.money -= G.rerollCost; G.rerollCost += 1; }
  else return;
  AudioFX.discard();
  saveGame();
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

/* 手牌点击：容器级事件委托 */
$("hand").onclick = e => {
  const el = e.target?.closest?.(".card");
  if (!el) return;
  const card = G.hand.find(c => c.id === el.dataset.cid);
  if (card) toggleSelect(card);
};

/* 3D 倾斜：全局委托 */
$("game").addEventListener("pointermove", handleTiltMove);

/* 计分中点击任意处 → 4 倍速快进；触屏点空白处收起 tooltip */
document.addEventListener("pointerdown", e => {
  if (G.scoring && G.speed === 1) {
    G.speed = 4;
    flashMessage("⏩ 加速");
  }
  if (NO_HOVER && !e.target?.closest?.(".joker")) hideTooltip();
});

/* 键盘操作：1-9 选牌 / Enter 出牌 / X 弃牌 / R 点数排序 / S 花色排序 / M 静音 */
document.addEventListener("keydown", e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "m") {
    const muted = AudioFX.toggleMute();
    flashMessage(muted ? "🔇 已静音" : "🔊 声音开启");
    return;
  }
  if (G.state !== "playing" || G.scoring) return;
  if (/^[1-9]$/.test(k)) {
    const c = G.hand[+k - 1];
    if (c) toggleSelect(c);
  } else if (e.key === "Enter") {
    if (!$("play-btn").disabled) playHand();
  } else if (k === "x") {
    if (!$("discard-btn").disabled) discard();
  } else if (k === "r") { sortHand("rank"); render(); }
  else if (k === "s") { sortHand("suit"); render(); }
});

/* ---------- 启动 ---------- */
if (!loadGame()) newGame();
