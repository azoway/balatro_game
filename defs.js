/* =========================================================
   小丑牌 · JOKER — 数据定义（牌型 / Boss / 小丑 / 星球 / 塔罗 / 标签）
   加载顺序: defs.js → engine.js → ui.js
   ========================================================= */
"use strict";

/* ---------- 扑克常量 ---------- */
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
/* 无尽模式：超出 ANTE_BASE 后目标按此倍数逐级增长 */
const ENDLESS_GROWTH = 2.5;

/* ---------- 卡牌增强 ---------- */
const ENH_CHIPS = 30;
const ENH_MULT = 4;
const ENH = {
  bonus: { name: "加成牌", icon: "🔷", desc: `计分时 +${ENH_CHIPS} 筹码` },
  mult:  { name: "倍率牌", icon: "🔺", desc: `计分时 +${ENH_MULT} 倍率` },
};

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

/* ---------- 盲注元数据 ---------- */
const BLIND_META = [
  { name: "小盲注", cls: "", chip: "", reward: 3 },
  { name: "大盲注", cls: "big-blind", chip: "big", reward: 4 },
  { name: "Boss盲注", cls: "boss-blind", chip: "boss", reward: 5 },
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

/* ---------- 塔罗牌 ----------
   购买后进入消耗品槽（上限 2），点击使用。
   apply(g)              : 即时效果
   targets:[min,max] + applyCards(cards, g) : 对选中手牌生效（回合中） */
const suitTarot = (id, name, icon, suit) => ({
  id, name, icon, cost: 4, targets: [1, 3],
  desc: `选中 ≤3 张手牌变为${SUIT_NAME[suit]}`,
  applyCards: (cards, g) => {
    cards.forEach(c => applyCardMod(c.id, x => x.suit = suit));
    return `${cards.length} 张牌变为 ${suit}`;
  },
});
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
  suitTarot("sun",   "太阳", "☀️", "♥"),
  suitTarot("star",  "星星", "⭐", "♦"),
  suitTarot("moon",  "月亮", "🌙", "♣"),
  suitTarot("world", "世界", "🌏", "♠"),
  { id: "emperor", name: "皇帝", icon: "🤴", cost: 5, targets: [1, 2],
    desc: "选中 ≤2 张手牌点数 +1 (A→2)",
    applyCards: (cards, g) => {
      cards.forEach(c => applyCardMod(c.id, x => {
        x.rank = RANKS[(RANKS.indexOf(x.rank) + 1) % RANKS.length];
      }));
      return `${cards.length} 张牌点数 +1`;
    } },
  { id: "lovers", name: "恋人", icon: "💞", cost: 5, targets: [1, 1],
    desc: `选中 1 张手牌变为${ENH.bonus.name}（${ENH.bonus.desc}）`,
    applyCards: (cards, g) => {
      applyCardMod(cards[0].id, x => x.enh = "bonus");
      return `${cards[0].rank}${cards[0].suit} 变为${ENH.bonus.name}`;
    } },
  { id: "chariot", name: "战车", icon: "🛞", cost: 5, targets: [1, 1],
    desc: `选中 1 张手牌变为${ENH.mult.name}（${ENH.mult.desc}）`,
    applyCards: (cards, g) => {
      applyCardMod(cards[0].id, x => x.enh = "mult");
      return `${cards[0].rank}${cards[0].suit} 变为${ENH.mult.name}`;
    } },
  { id: "hanged", name: "吊人", icon: "🪢", cost: 5, targets: [1, 2],
    desc: "销毁选中的 ≤2 张牌（永久移出牌库）",
    applyCards: (cards, g) => {
      const ids = new Set(cards.map(c => c.id));
      g.masterDeck = g.masterDeck.filter(c => !ids.has(c.id));
      g.deck = g.deck.filter(c => !ids.has(c.id));
      g.hand = g.hand.filter(c => !ids.has(c.id));
      return `销毁 ${cards.length} 张牌`;
    } },
];
const TAROT_BY_ID = new Map(TAROTS.map(t => [t.id, t]));

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
