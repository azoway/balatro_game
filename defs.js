/* =========================================================
   小丑牌 · JOKER — 数据定义（牌型 / Boss / 小丑 / 星球 / 塔罗 / 卡包 / 优惠券 / 标签）
   name/desc 为 {zh, en} 双语对象，渲染时经 i18n.js 的 L() 取当前语言。
   加载顺序: i18n.js → defs.js → engine.js → ui.js
   ========================================================= */
"use strict";

/* ---------- 扑克常量 ---------- */
const SUITS = ["♠", "♥", "♣", "♦"];
const SUIT_NAME = {
  "♠": { zh: "黑桃", en: "Spades" },
  "♥": { zh: "红桃", en: "Hearts" },
  "♣": { zh: "梅花", en: "Clubs" },
  "♦": { zh: "方片", en: "Diamonds" },
};
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
const CHIP_VAL = r => r === "A" ? 11 : (RANK_VAL[r] >= 11 ? 10 : RANK_VAL[r]);

const HAND_TYPES = {
  flush_five:     { name: { zh: "同花五条", en: "Flush Five" },      chips: 160, mult: 16, up: [50, 3] },
  straight_flush: { name: { zh: "同花顺",   en: "Straight Flush" },  chips: 100, mult: 8,  up: [40, 4] },
  four_kind:      { name: { zh: "四条",     en: "Four of a Kind" },  chips: 60,  mult: 7,  up: [30, 3] },
  full_house:     { name: { zh: "葫芦",     en: "Full House" },      chips: 40,  mult: 4,  up: [25, 2] },
  flush:          { name: { zh: "同花",     en: "Flush" },           chips: 35,  mult: 4,  up: [15, 2] },
  straight:       { name: { zh: "顺子",     en: "Straight" },        chips: 30,  mult: 4,  up: [30, 3] },
  three_kind:     { name: { zh: "三条",     en: "Three of a Kind" }, chips: 30,  mult: 3,  up: [20, 2] },
  two_pair:       { name: { zh: "两对",     en: "Two Pair" },        chips: 20,  mult: 2,  up: [20, 1] },
  pair:           { name: { zh: "对子",     en: "Pair" },            chips: 10,  mult: 2,  up: [15, 1] },
  high_card:      { name: { zh: "高牌",     en: "High Card" },       chips: 5,   mult: 1,  up: [10, 1] },
};

const ANTE_BASE = [100, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
const MAX_ANTE = 8;
/* 无尽模式：超出 ANTE_BASE 后目标按此倍数逐级增长 */
const ENDLESS_GROWTH = 2.5;

/* ---------- 卡牌增强 ---------- */
const ENH_CHIPS = 30;      // 加成牌：计分时额外筹码
const ENH_MULT = 4;        // 倍率牌：计分时额外倍率
const ENH_STEEL_X = 1.5;   // 钢铁牌：留在手中时倍率乘数
const ENH_GOLD_MONEY = 3;  // 黄金牌：回合结束仍在手中时得钱
const ENH = {
  bonus: { name: { zh: "加成牌", en: "Bonus Card" }, icon: "🔷",
    desc: { zh: `计分时 +${ENH_CHIPS} 筹码`, en: `+${ENH_CHIPS} Chips when scored` } },
  mult:  { name: { zh: "倍率牌", en: "Mult Card" }, icon: "🔺",
    desc: { zh: `计分时 +${ENH_MULT} 倍率`, en: `+${ENH_MULT} Mult when scored` } },
  steel: { name: { zh: "钢铁牌", en: "Steel Card" }, icon: "🛡",
    desc: { zh: `留在手中时 ×${ENH_STEEL_X} 倍率`, en: `×${ENH_STEEL_X} Mult while held in hand` } },
  gold:  { name: { zh: "黄金牌", en: "Gold Card" }, icon: "💰",
    desc: { zh: `回合结束时若在手中 +$${ENH_GOLD_MONEY}`, en: `+$${ENH_GOLD_MONEY} if held in hand at end of round` } },
};

const RARITY_NAME = {
  common:    { zh: "普通", en: "Common" },
  uncommon:  { zh: "罕见", en: "Uncommon" },
  rare:      { zh: "稀有", en: "Rare" },
  legendary: { zh: "传奇", en: "Legendary" },
};

/* ---------- Boss 盲注 ---------- */
const BOSSES = [
  { id: "hook",   icon: "🪝", name: { zh: "钩子", en: "The Hook" },
    desc: { zh: "每次出牌后随机弃掉 2 张手牌", en: "Discards 2 random held cards after each played hand" } },
  { id: "club",   icon: "♣", name: { zh: "梅花", en: "The Club" },
    desc: { zh: "所有梅花牌被禁用（不计分）", en: "All Club cards are debuffed (no score)" } },
  { id: "goad",   icon: "♠", name: { zh: "刺棒", en: "The Goad" },
    desc: { zh: "所有黑桃牌被禁用（不计分）", en: "All Spade cards are debuffed (no score)" } },
  { id: "window", icon: "♦", name: { zh: "窗户", en: "The Window" },
    desc: { zh: "所有方片牌被禁用（不计分）", en: "All Diamond cards are debuffed (no score)" } },
  { id: "head",   icon: "♥", name: { zh: "头颅", en: "The Head" },
    desc: { zh: "所有红桃牌被禁用（不计分）", en: "All Heart cards are debuffed (no score)" } },
  { id: "psychic",icon: "🔮", name: { zh: "通灵者", en: "The Psychic" },
    desc: { zh: "每次必须打出 5 张牌", en: "Must play 5 cards every hand" } },
  { id: "manacle",icon: "⛓", name: { zh: "镣铐", en: "The Manacle" },
    desc: { zh: "手牌上限 -1", en: "-1 hand size" } },
  { id: "water",  icon: "💧", name: { zh: "流水", en: "The Water" },
    desc: { zh: "本回合弃牌次数为 0", en: "Start with 0 discards" } },
  { id: "needle", icon: "💉", name: { zh: "针头", en: "The Needle" },
    desc: { zh: "本回合只能出 1 次牌", en: "Play only 1 hand" } },
  { id: "wall",   icon: "🧱", name: { zh: "高墙", en: "The Wall" },
    desc: { zh: "目标分数特别高", en: "Extra large target score" } },
];

/* ---------- 盲注元数据 ---------- */
const BLIND_META = [
  { name: { zh: "小盲注", en: "Small Blind" }, cls: "", chip: "", reward: 3 },
  { name: { zh: "大盲注", en: "Big Blind" }, cls: "big-blind", chip: "big", reward: 4 },
  { name: { zh: "Boss盲注", en: "Boss Blind" }, cls: "boss-blind", chip: "boss", reward: 5 },
];

/* ---------- 小丑牌定义 ---------- */
/* trigger: perCard(逐卡计分时) / after(牌型算完后) / money(结算时) */
const JOKER_DEFS = [
  { id: "joker", icon: "🃏", rarity: "common", cost: 3,
    name: { zh: "小丑", en: "Joker" },
    desc: { zh: "+4 倍率", en: "+4 Mult" },
    after: s => ({ mult: 4 }) },
  { id: "greedy", icon: "🤑", rarity: "common", cost: 5,
    name: { zh: "贪婪小丑", en: "Greedy Joker" },
    desc: { zh: "打出的每张方片牌 +3 倍率", en: "Played Diamond cards give +3 Mult" },
    perCard: (c) => c.suit === "♦" ? { mult: 3 } : null },
  { id: "lusty", icon: "😈", rarity: "common", cost: 5,
    name: { zh: "色欲小丑", en: "Lusty Joker" },
    desc: { zh: "打出的每张红桃牌 +3 倍率", en: "Played Heart cards give +3 Mult" },
    perCard: (c) => c.suit === "♥" ? { mult: 3 } : null },
  { id: "wrathful", icon: "😡", rarity: "common", cost: 5,
    name: { zh: "暴怒小丑", en: "Wrathful Joker" },
    desc: { zh: "打出的每张黑桃牌 +3 倍率", en: "Played Spade cards give +3 Mult" },
    perCard: (c) => c.suit === "♠" ? { mult: 3 } : null },
  { id: "gluttonous", icon: "😋", rarity: "common", cost: 5,
    name: { zh: "暴食小丑", en: "Gluttonous Joker" },
    desc: { zh: "打出的每张梅花牌 +3 倍率", en: "Played Club cards give +3 Mult" },
    perCard: (c) => c.suit === "♣" ? { mult: 3 } : null },
  { id: "wily", icon: "🧠", rarity: "common", cost: 4,
    name: { zh: "机智小丑", en: "Wily Joker" },
    desc: { zh: "打出的牌含三条时 +100 筹码", en: "+100 Chips if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { chips: 100 } : null },
  { id: "sly", icon: "🦊", rarity: "common", cost: 4,
    name: { zh: "狡猾小丑", en: "Sly Joker" },
    desc: { zh: "打出的牌含对子时 +50 筹码", en: "+50 Chips if hand contains a Pair" },
    after: (s) => s.hasPair ? { chips: 50 } : null },
  { id: "crafty", icon: "🛠", rarity: "common", cost: 4,
    name: { zh: "灵巧小丑", en: "Crafty Joker" },
    desc: { zh: "打出同花时 +80 筹码", en: "+80 Chips if hand contains a Flush" },
    after: (s) => s.type === "flush" || s.type === "straight_flush" || s.type === "flush_five" ? { chips: 80 } : null },
  { id: "jolly", icon: "😆", rarity: "common", cost: 4,
    name: { zh: "快乐小丑", en: "Jolly Joker" },
    desc: { zh: "打出的牌含对子时 +8 倍率", en: "+8 Mult if hand contains a Pair" },
    after: (s) => s.hasPair ? { mult: 8 } : null },
  { id: "zany", icon: "🤪", rarity: "common", cost: 5,
    name: { zh: "滑稽小丑", en: "Zany Joker" },
    desc: { zh: "打出的牌含三条时 +12 倍率", en: "+12 Mult if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { mult: 12 } : null },
  { id: "droll", icon: "🎭", rarity: "common", cost: 5,
    name: { zh: "古怪小丑", en: "Droll Joker" },
    desc: { zh: "打出同花时 +10 倍率", en: "+10 Mult if hand contains a Flush" },
    after: (s) => s.type === "flush" || s.type === "straight_flush" || s.type === "flush_five" ? { mult: 10 } : null },
  { id: "crazy", icon: "🌀", rarity: "common", cost: 5,
    name: { zh: "疯狂小丑", en: "Crazy Joker" },
    desc: { zh: "打出顺子时 +12 倍率", en: "+12 Mult if hand contains a Straight" },
    after: (s) => s.type === "straight" || s.type === "straight_flush" ? { mult: 12 } : null },
  { id: "half", icon: "🌓", rarity: "common", cost: 5,
    name: { zh: "半张小丑", en: "Half Joker" },
    desc: { zh: "打出 ≤3 张牌时 +20 倍率", en: "+20 Mult if played hand has ≤3 cards" },
    after: (s) => s.playedCount <= 3 ? { mult: 20 } : null },
  { id: "banner", icon: "🚩", rarity: "common", cost: 5,
    name: { zh: "旗帜", en: "Banner" },
    desc: { zh: "每剩余 1 次弃牌 +30 筹码", en: "+30 Chips per remaining discard" },
    after: (s, g) => g.discardsLeft > 0 ? { chips: 30 * g.discardsLeft } : null },
  { id: "mystic", icon: "🏔", rarity: "common", cost: 5,
    name: { zh: "神秘峰会", en: "Mystic Summit" },
    desc: { zh: "弃牌次数为 0 时 +15 倍率", en: "+15 Mult when 0 discards remain" },
    after: (s, g) => g.discardsLeft === 0 ? { mult: 15 } : null },
  { id: "fibonacci", icon: "🐚", rarity: "uncommon", cost: 8,
    name: { zh: "斐波那契", en: "Fibonacci" },
    desc: { zh: "打出的每张 A/2/3/5/8 +8 倍率", en: "Each played A/2/3/5/8 gives +8 Mult" },
    perCard: (c) => ["A", "2", "3", "5", "8"].includes(c.rank) ? { mult: 8 } : null },
  { id: "scary_face", icon: "👻", rarity: "common", cost: 4,
    name: { zh: "鬼脸", en: "Scary Face" },
    desc: { zh: "打出的每张人头牌 +30 筹码", en: "Played face cards give +30 Chips" },
    perCard: (c) => ["J", "Q", "K"].includes(c.rank) ? { chips: 30 } : null },
  { id: "even_steven", icon: "2️⃣", rarity: "common", cost: 4,
    name: { zh: "偶数史蒂文", en: "Even Steven" },
    desc: { zh: "打出的每张偶数牌 (2,4,6,8,10) +4 倍率", en: "Played even cards (2,4,6,8,10) give +4 Mult" },
    perCard: (c) => ["2", "4", "6", "8", "10"].includes(c.rank) ? { mult: 4 } : null },
  { id: "odd_todd", icon: "3️⃣", rarity: "common", cost: 4,
    name: { zh: "奇数托德", en: "Odd Todd" },
    desc: { zh: "打出的每张奇数牌 (A,3,5,7,9) +31 筹码", en: "Played odd cards (A,3,5,7,9) give +31 Chips" },
    perCard: (c) => ["A", "3", "5", "7", "9"].includes(c.rank) ? { chips: 31 } : null },
  { id: "blackboard", icon: "🖤", rarity: "uncommon", cost: 8,
    name: { zh: "黑板", en: "Blackboard" },
    desc: { zh: "打出的牌全为黑色花色时 ×3 倍率", en: "×3 Mult if all played cards are black suits" },
    after: (s) => s.cards.every(c => c.suit === "♠" || c.suit === "♣") ? { xmult: 3 } : null },
  { id: "baron_red", icon: "👸", rarity: "uncommon", cost: 8,
    name: { zh: "红心女王", en: "Red Queen" },
    desc: { zh: "打出的牌全为红色花色时 ×3 倍率", en: "×3 Mult if all played cards are red suits" },
    after: (s) => s.cards.every(c => c.suit === "♥" || c.suit === "♦") ? { xmult: 3 } : null },
  { id: "cavendish", icon: "🍌", rarity: "uncommon", cost: 7,
    name: { zh: "卡文迪什", en: "Cavendish" },
    desc: { zh: "×3 倍率，回合结束有 1/6 概率被吃掉", en: "×3 Mult, 1 in 6 chance to be eaten at end of round" },
    after: () => ({ xmult: 3 }),
    roundEnd: (g, j) => { if (rng() < 1 / 6) return "destroy"; } },
  { id: "photograph", icon: "📷", rarity: "common", cost: 5,
    name: { zh: "照片", en: "Photograph" },
    desc: { zh: "打出的第一张人头牌 ×2 倍率", en: "First played face card gives ×2 Mult" },
    perCard: (c, s) => (["J", "Q", "K"].includes(c.rank) && s.firstFace === c) ? { xmult: 2 } : null },
  { id: "abstract", icon: "🎨", rarity: "common", cost: 4,
    name: { zh: "抽象小丑", en: "Abstract Joker" },
    desc: { zh: "每持有 1 张小丑牌 +3 倍率", en: "+3 Mult per Joker owned" },
    after: (s, g) => ({ mult: 3 * g.jokers.length }) },
  { id: "bull", icon: "🐂", rarity: "uncommon", cost: 6,
    name: { zh: "公牛", en: "Bull" },
    desc: { zh: "每持有 $1 +2 筹码", en: "+2 Chips per $1 owned" },
    after: (s, g) => g.money > 0 ? { chips: 2 * g.money } : null },
  { id: "bootstraps", icon: "👢", rarity: "uncommon", cost: 7,
    name: { zh: "自力更生", en: "Bootstraps" },
    desc: { zh: "每持有 $5 +2 倍率", en: "+2 Mult per $5 owned" },
    after: (s, g) => Math.floor(g.money / 5) > 0 ? { mult: 2 * Math.floor(g.money / 5) } : null },
  { id: "golden", icon: "🪙", rarity: "common", cost: 6,
    name: { zh: "黄金小丑", en: "Golden Joker" },
    desc: { zh: "回合结束时获得 $4", en: "Earn $4 at end of round" },
    money: () => 4 },
  { id: "supernova", icon: "💥", rarity: "uncommon", cost: 6,
    name: { zh: "超新星", en: "Supernova" },
    desc: { zh: "本局该牌型之前每打出过 1 次 +1 倍率", en: "+1 Mult per time this hand type was previously played" },
    after: (s, g) => {
      const n = (g.handPlayCounts[s.type] || 1) - 1;  // 不含本次
      return n > 0 ? { mult: n } : null;
    } },
  { id: "acrobat", icon: "🤸", rarity: "uncommon", cost: 8,
    name: { zh: "杂技演员", en: "Acrobat" },
    desc: { zh: "最后一次出牌时 ×3 倍率", en: "×3 Mult on the final hand of the round" },
    after: (s, g) => g.handsLeft === 0 ? { xmult: 3 } : null },
  { id: "duo", icon: "👯", rarity: "rare", cost: 10,
    name: { zh: "二重奏", en: "The Duo" },
    desc: { zh: "打出的牌含对子时 ×2 倍率", en: "×2 Mult if hand contains a Pair" },
    after: (s) => s.hasPair ? { xmult: 2 } : null },
  { id: "trio", icon: "🎻", rarity: "rare", cost: 10,
    name: { zh: "三重奏", en: "The Trio" },
    desc: { zh: "打出的牌含三条时 ×3 倍率", en: "×3 Mult if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { xmult: 3 } : null },
  { id: "canio", icon: "🎪", rarity: "legendary", cost: 15,
    name: { zh: "卡尼奥", en: "Canio" },
    desc: { zh: "×1 倍率，每弃掉一张人头牌永久 +0.5", en: "×1 Mult, gains +0.5 permanently per discarded face card" },
    after: (s, g, j) => ({ xmult: 1 + (j.state || 0) }),
    onDiscard: (cards, g, j) => { j.state = (j.state || 0) + cards.filter(c => ["J", "Q", "K"].includes(c.rank)).length * 0.5; } },

  /* --- 重触发类: retrigger(card, ctx, g, j) 返回额外触发次数 --- */
  { id: "hack", icon: "💻", rarity: "uncommon", cost: 6,
    name: { zh: "黑客", en: "Hack" },
    desc: { zh: "打出的每张 2/3/4/5 重新触发一次", en: "Retrigger each played 2, 3, 4 or 5" },
    retrigger: c => ["2", "3", "4", "5"].includes(c.rank) ? 1 : 0 },
  { id: "sock_buskin", icon: "👺", rarity: "uncommon", cost: 7,
    name: { zh: "悲喜面具", en: "Sock and Buskin" },
    desc: { zh: "打出的每张人头牌重新触发一次", en: "Retrigger each played face card" },
    retrigger: c => ["J", "Q", "K"].includes(c.rank) ? 1 : 0 },
  { id: "dusk", icon: "🌆", rarity: "uncommon", cost: 7,
    name: { zh: "黄昏", en: "Dusk" },
    desc: { zh: "最后一次出牌时，所有牌重新触发一次", en: "Retrigger all played cards on the final hand of the round" },
    retrigger: (c, s, g) => g.handsLeft === 0 ? 1 : 0 },

  /* --- 成长类: onPlay(ctx, g, j) 在每手结算后调用，可返回 "destroy" --- */
  { id: "green_joker", icon: "🥒", rarity: "common", cost: 4,
    name: { zh: "绿色小丑", en: "Green Joker" },
    desc: { zh: "每出一手牌 +1 倍率，每弃一次牌 -1 倍率", en: "+1 Mult per hand played, -1 Mult per discard" },
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onPlay: (s, g, j) => { j.state = (j.state || 0) + 1; },
    onDiscard: (cards, g, j) => { j.state = Math.max(0, (j.state || 0) - 1); } },
  { id: "ride_the_bus", icon: "🚌", rarity: "common", cost: 5,
    name: { zh: "坐公交", en: "Ride the Bus" },
    desc: { zh: "每连续打出一手不含人头牌的牌 +1 倍率，打出人头牌则重置", en: "+1 Mult per consecutive hand without face cards; resets when a face card is played" },
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onPlay: (s, g, j) => {
      if (s.cards.some(c => ["J", "Q", "K"].includes(c.rank))) j.state = 0;
      else j.state = (j.state || 0) + 1;
    } },
  { id: "ice_cream", icon: "🍦", rarity: "common", cost: 4,
    name: { zh: "冰淇淋", en: "Ice Cream" },
    desc: { zh: "+100 筹码，每出一手牌融化 -5，融尽后消失", en: "+100 Chips, melts by 5 per hand played; gone when it reaches 0" },
    after: (s, g, j) => {
      const v = 100 - 5 * (j.state || 0);
      return v > 0 ? { chips: v } : null;
    },
    onPlay: (s, g, j) => {
      j.state = (j.state || 0) + 1;
      if (100 - 5 * j.state <= 0) return "destroy";
    } },
  { id: "square", icon: "🟦", rarity: "common", cost: 4,
    name: { zh: "方形小丑", en: "Square Joker" },
    desc: { zh: "打出的手牌恰为 4 张时，永久 +4 筹码", en: "Gains +4 Chips permanently when played hand has exactly 4 cards" },
    after: (s, g, j) => (j.state || 0) > 0 ? { chips: j.state } : null,
    onPlay: (s, g, j) => { if (s.playedCount === 4) j.state = (j.state || 0) + 4; } },
  { id: "flash_card", icon: "⚡", rarity: "uncommon", cost: 6,
    name: { zh: "闪卡", en: "Flash Card" },
    desc: { zh: "每次商店刷新 +2 倍率", en: "+2 Mult per shop reroll" },
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onReroll: (g, j) => { j.state = (j.state || 0) + 2; } },
];
const JOKER_BY_ID = new Map(JOKER_DEFS.map(d => [d.id, d]));
const sellValue = def => Math.max(1, Math.floor(def.cost / 2));

/* ---------- 星球牌 ---------- */
const PLANETS = [
  { id: "pluto",   icon: "🪐", name: { zh: "冥王星", en: "Pluto" },   hand: "high_card" },
  { id: "mercury", icon: "☿",  name: { zh: "水星",   en: "Mercury" }, hand: "pair" },
  { id: "uranus",  icon: "🌀", name: { zh: "天王星", en: "Uranus" },  hand: "two_pair" },
  { id: "venus",   icon: "♀",  name: { zh: "金星",   en: "Venus" },   hand: "three_kind" },
  { id: "saturn",  icon: "🪐", name: { zh: "土星",   en: "Saturn" },  hand: "straight" },
  { id: "jupiter", icon: "🟠", name: { zh: "木星",   en: "Jupiter" }, hand: "flush" },
  { id: "earth",   icon: "🌍", name: { zh: "地球",   en: "Earth" },   hand: "full_house" },
  { id: "mars",    icon: "🔴", name: { zh: "火星",   en: "Mars" },    hand: "four_kind" },
  { id: "neptune", icon: "🔵", name: { zh: "海王星", en: "Neptune" }, hand: "straight_flush" },
];

/* ---------- 塔罗牌 ----------
   购买后进入消耗品槽，点击使用。
   apply(g)              : 即时效果，返回本地化消息
   targets:[min,max] + applyCards(cards, g) : 对选中手牌生效（回合中） */
const suitTarot = (id, zhName, enName, icon, suit) => ({
  id, icon, cost: 4, targets: [1, 3],
  name: { zh: zhName, en: enName },
  desc: { zh: `选中 ≤3 张手牌变为${SUIT_NAME[suit].zh}`, en: `Convert up to 3 selected cards to ${SUIT_NAME[suit].en}` },
  applyCards: (cards, g) => {
    cards.forEach(c => applyCardMod(c.id, x => x.suit = suit));
    return S("msg_suit_change", cards.length, suit);
  },
});
const enhTarot = (id, zhName, enName, icon, enh) => ({
  id, icon, cost: 5, targets: [1, 1],
  name: { zh: zhName, en: enName },
  desc: { zh: `选中 1 张手牌变为${ENH[enh].name.zh}（${ENH[enh].desc.zh}）`,
          en: `Convert 1 selected card to a ${ENH[enh].name.en} (${ENH[enh].desc.en})` },
  applyCards: (cards, g) => {
    applyCardMod(cards[0].id, x => x.enh = enh);
    return S("msg_enhanced", cards[0].rank + cards[0].suit, L(ENH[enh].name));
  },
});
const TAROTS = [
  { id: "hermit", icon: "🕯", cost: 4,
    name: { zh: "隐者", en: "The Hermit" },
    desc: { zh: "金钱翻倍 (最多 +$20)", en: "Double your money (max +$20)" },
    apply: g => { const v = Math.min(20, Math.max(0, g.money)); g.money += v; return `+$${v}`; } },
  { id: "temperance", icon: "⚖️", cost: 4,
    name: { zh: "节制", en: "Temperance" },
    desc: { zh: "获得持有小丑牌总售价 (最多 $30)", en: "Gain total sell value of your Jokers (max $30)" },
    apply: g => {
      const v = Math.min(30, g.jokers.reduce((s, j) => s + sellValue(JOKER_BY_ID.get(j.id)), 0));
      g.money += v; return `+$${v}`;
    } },
  { id: "empress", icon: "👑", cost: 4,
    name: { zh: "女皇", en: "The Empress" },
    desc: { zh: "随机牌型 +1 级", en: "Upgrade a random hand type by 1 level" },
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${L(HAND_TYPES[k].name)} → Lv.${g.handLevels[k]}`;
    } },
  { id: "strength", icon: "💪", cost: 5,
    name: { zh: "力量", en: "Strength" },
    desc: { zh: "每回合弃牌次数 +1 (本局)", en: "+1 discard per round (this run)" },
    apply: g => { g.bonusDiscards++; return S("msg_discard_up", 3 + g.bonusDiscards); } },
  { id: "judgement", icon: "📯", cost: 8,
    name: { zh: "审判", en: "Judgement" },
    desc: { zh: "每回合出牌次数 +1 (本局)", en: "+1 hand per round (this run)" },
    apply: g => { g.bonusHands++; return S("msg_hands_up", 4 + g.bonusHands); } },
  { id: "tower", icon: "🗼", cost: 8,
    name: { zh: "高塔", en: "The Tower" },
    desc: { zh: "手牌上限 +1 (本局)", en: "+1 hand size (this run)" },
    apply: g => { g.handSize++; return S("msg_handsize_up", g.handSize); } },
  suitTarot("sun",   "太阳", "The Sun",   "☀️", "♥"),
  suitTarot("star",  "星星", "The Star",  "⭐", "♦"),
  suitTarot("moon",  "月亮", "The Moon",  "🌙", "♣"),
  suitTarot("world", "世界", "The World", "🌏", "♠"),
  { id: "emperor", icon: "🤴", cost: 5, targets: [1, 2],
    name: { zh: "皇帝", en: "The Emperor" },
    desc: { zh: "选中 ≤2 张手牌点数 +1 (A→2)", en: "Raise rank of up to 2 selected cards by 1 (A→2)" },
    applyCards: (cards, g) => {
      cards.forEach(c => applyCardMod(c.id, x => {
        x.rank = RANKS[(RANKS.indexOf(x.rank) + 1) % RANKS.length];
      }));
      return S("msg_rank_up", cards.length);
    } },
  enhTarot("lovers",  "恋人", "The Lovers",  "💞", "bonus"),
  enhTarot("chariot", "战车", "The Chariot", "🛞", "mult"),
  enhTarot("justice", "正义", "Justice",     "🛡", "steel"),
  enhTarot("devil",   "恶魔", "The Devil",   "😈", "gold"),
  { id: "hanged", icon: "🪢", cost: 5, targets: [1, 2],
    name: { zh: "吊人", en: "The Hanged Man" },
    desc: { zh: "销毁选中的 ≤2 张牌（永久移出牌库）", en: "Destroy up to 2 selected cards (removed from deck permanently)" },
    applyCards: (cards, g) => {
      const ids = new Set(cards.map(c => c.id));
      g.masterDeck = g.masterDeck.filter(c => !ids.has(c.id));
      g.deck = g.deck.filter(c => !ids.has(c.id));
      g.hand = g.hand.filter(c => !ids.has(c.id));
      return S("msg_destroyed", cards.length);
    } },
];
const TAROT_BY_ID = new Map(TAROTS.map(t => [t.id, t]));

/* ---------- 卡包（购买后 3 选 1） ---------- */
const PACKS = [
  { kind: "arcana", icon: "🔮", cost: 4,
    name: { zh: "塔罗包", en: "Arcana Pack" },
    desc: { zh: "3 张塔罗牌选 1", en: "Pick 1 of 3 Tarot cards" } },
  { kind: "celestial", icon: "🪐", cost: 4,
    name: { zh: "星球包", en: "Celestial Pack" },
    desc: { zh: "3 张星球牌选 1（立即生效）", en: "Pick 1 of 3 Planet cards (applied instantly)" } },
  { kind: "buffoon", icon: "🎪", cost: 6,
    name: { zh: "小丑包", en: "Buffoon Pack" },
    desc: { zh: "3 张小丑牌选 1", en: "Pick 1 of 3 Jokers" } },
];

/* ---------- 优惠券（每局每种限购一次的永久升级） ---------- */
const VOUCHERS = [
  { id: "overstock", icon: "📦", cost: 10,
    name: { zh: "超额库存", en: "Overstock" },
    desc: { zh: "商店每次多 1 张小丑牌", en: "Shop offers +1 Joker" },
    apply: g => {} },
  { id: "clearance", icon: "🏷", cost: 8,
    name: { zh: "清仓甩卖", en: "Clearance Sale" },
    desc: { zh: "商店刷新费从 $3 起", en: "Shop rerolls start at $3" },
    apply: g => {} },
  { id: "crate", icon: "🧰", cost: 8,
    name: { zh: "手提箱", en: "Crate" },
    desc: { zh: "消耗品槽 +1", en: "+1 consumable slot" },
    apply: g => { g.maxConsumables++; } },
  { id: "retainer", icon: "💼", cost: 10,
    name: { zh: "伙伴合约", en: "Retainer" },
    desc: { zh: "小丑牌槽 +1", en: "+1 Joker slot" },
    apply: g => { g.maxJokers++; } },
  { id: "compound", icon: "🏦", cost: 10,
    name: { zh: "复利", en: "Compound Interest" },
    desc: { zh: "利息上限 $5 → $10", en: "Interest cap raised from $5 to $10" },
    apply: g => { g.interestCap = 10; } },
  { id: "grabber", icon: "🫳", cost: 10,
    name: { zh: "抓手", en: "Grabber" },
    desc: { zh: "每回合出牌次数 +1", en: "+1 hand per round" },
    apply: g => { g.bonusHands++; } },
];
const VOUCHER_BY_ID = new Map(VOUCHERS.map(v => [v.id, v]));

/* ---------- 小丑牌版本（商店随机附带，加价出售） ---------- */
const EDITIONS = {
  foil: { name: { zh: "闪箔", en: "Foil" }, desc: { zh: "+50 筹码", en: "+50 Chips" },
    effect: { chips: 50 }, costUp: 2 },
  holo: { name: { zh: "全息", en: "Holographic" }, desc: { zh: "+10 倍率", en: "+10 Mult" },
    effect: { mult: 10 }, costUp: 3 },
  poly: { name: { zh: "多彩", en: "Polychrome" }, desc: { zh: "×1.5 倍率", en: "×1.5 Mult" },
    effect: { xmult: 1.5 }, costUp: 5 },
};

/* ---------- 起始牌组 ---------- */
const DECKS = [
  { id: "classic", icon: "🂠",
    name: { zh: "经典牌组", en: "Classic Deck" },
    desc: { zh: "无修正", en: "No modifiers" },
    apply: g => {} },
  { id: "red", icon: "🟥",
    name: { zh: "红牌组", en: "Red Deck" },
    desc: { zh: "每回合弃牌次数 +1", en: "+1 discard per round" },
    apply: g => { g.bonusDiscards++; } },
  { id: "blue", icon: "🟦",
    name: { zh: "蓝牌组", en: "Blue Deck" },
    desc: { zh: "每回合出牌次数 +1", en: "+1 hand per round" },
    apply: g => { g.bonusHands++; } },
  { id: "yellow", icon: "🟨",
    name: { zh: "黄牌组", en: "Yellow Deck" },
    desc: { zh: "开局携带 $10", en: "Start with $10" },
    apply: g => { g.money = 10; } },
  { id: "ghost", icon: "👻",
    name: { zh: "幽灵牌组", en: "Ghost Deck" },
    desc: { zh: "开局携带 1 张随机塔罗牌", en: "Start with a random Tarot card" },
    apply: g => { g.consumables.push({ id: rnd(TAROTS).id, uid: "t0" }); } },
];

/* ---------- 跳过盲注的标签奖励 ---------- */
const SKIP_TAGS = [
  { id: "cash", icon: "💰",
    name: { zh: "金钱标签", en: "Cash Tag" },
    apply: g => { g.money += 3; return "+$3"; } },
  { id: "coupon", icon: "🎟",
    name: { zh: "优惠券标签", en: "Coupon Tag" },
    apply: g => { g.freeReroll++; return S("msg_free_reroll"); } },
  { id: "orbit", icon: "🪐",
    name: { zh: "星球标签", en: "Orbit Tag" },
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${L(HAND_TYPES[k].name)} → Lv.${g.handLevels[k]}`;
    } },
];
