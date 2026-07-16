/* =========================================================
   测试共享环境：DOM 桩 + 源码编译 + 快进时钟 + 策略机器人
   test.js（回归测试）与 balance.js（平衡报告）共用。
   ========================================================= */
"use strict";

const elements = {};
function mkEl() {
  return {
    innerHTML: "", textContent: "", className: "", style: { setProperty(){} }, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    appendChild(){}, append(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    onclick: null, onmouseenter: null, onmousemove: null, onmouseleave: null,
    disabled: false, offsetHeight: 0, remove(){}, addEventListener(){},
    getBoundingClientRect(){ return { left: 0, top: 0, width: 92, height: 128 }; },
    setProperty(){}, setAttribute(){}, click(){ if (this.onclick) this.onclick(); },
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
const ROOT = path.join(__dirname, "..");
const SOURCES = ["i18n.js", "defs.js", "engine.js", "ui.js"];

let _api = null;
function compileGame() {
  if (_api) return _api;
  let src = SOURCES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  src += `\nmodule.exports = { G, evaluate, playHand, startBlind, discard, JOKER_DEFS, JOKER_BY_ID,
    rollShop, rollEdition, buyItem, computeScoring, newGameState, newGame, skipBlind, blindTarget,
    seedRNG, rng, buildDeck, TAROTS, TAROT_BY_ID, BOSSES, PACKS, VOUCHERS, EDITIONS, DECKS, PLANETS,
    saveGame, loadGame, useConsumable, applyCardMod, pickBoss, openPack, choosePackOption, skipPack,
    loadStats, recordGameEnd, markJokersSeen, RANK_VAL, HAND_TYPES,
    ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L };`;
  const M = require("module");
  const m = new M.Module("game");
  m._compile(src, "game.js");
  _api = m.exports;
  return _api;
}

/* 快进时钟：sleep 立即返回，rAF 动画数帧内结束 */
function enableFastClock() {
  let fakeNow = 0;
  global.performance.now = () => (fakeNow += 120);
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (cb, ms) => realSetTimeout(cb, 0);
}

/* 策略机器人：打组合牌、弃牌换手、商店采购、开卡包 */
function makeBot(api) {
  const { G, RANK_VAL, TAROT_BY_ID, playHand, discard, startBlind, buyItem,
    useConsumable, choosePackOption, skipPack, newGameState, newGame, pickBoss } = api;
  const byRankDesc = (a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank];

  function bestSelection(hand, mustFive) {
    const bySuit = {};
    hand.forEach(x => (bySuit[x.suit] ||= []).push(x));
    for (const s in bySuit) {
      if (bySuit[s].length >= 5) return bySuit[s].sort(byRankDesc).slice(0, 5);
    }
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
      const price = item.kind === "planet" ? 3
        : item.kind === "joker" ? item.def.cost + (item.ed ? api.EDITIONS[item.ed].costUp : 0)
        : item.def.cost;
      if (item.kind === "joker" && G.jokers.length < G.maxJokers && G.money >= price) buyItem(item, price);
      else if (item.kind === "planet" && G.money >= price + 4) buyItem(item, price);
      else if (item.kind === "voucher" && G.money >= price + 6) buyItem(item, price);
      else if (item.kind === "pack" && G.money >= price + 8) {
        buyItem(item, price);
        if (G.pendingPack && choosePackOption(0) !== true) skipPack();
      }
    }
  }

  /* 自动打一整局；返回 { result, violations }，result ∈ win/lose/cap/stuck */
  async function simulate(seed, deckId = "classic", maxRounds = 60) {
    newGameState(seed);
    const deck = api.DECKS.find(d => d.id === deckId) || api.DECKS[0];
    G.deckId = deck.id;
    deck.apply(G);
    pickBoss();
    const violations = [];
    while (G.round < maxRounds) {
      startBlind(G.blindIndex);
      let steps = 0;
      while (G.state === "playing" && steps++ < 20) {
        const mustFive = G.currentBoss?.id === "psychic";
        let sel = bestSelection(G.hand, mustFive);
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
        if (G.money < 0) violations.push(`金钱为负: ${G.money}`);
        if (!Number.isFinite(G.roundScore)) violations.push(`分数非法: ${G.roundScore}`);
      }
      if (G.state === "roundwon") {
        elements["cashout-btn"].onclick();
        if (G.state === "over") return { result: "win", violations };
        botShop();
        elements["next-round-btn"].onclick();
      } else if (G.state === "over") {
        return { result: "lose", violations };
      } else {
        return { result: "stuck:" + G.state, violations };
      }
    }
    return { result: "cap", violations };
  }

  return { bestSelection, botShop, simulate };
}

module.exports = { elements, compileGame, enableFastClock, makeBot, ROOT, SOURCES };
