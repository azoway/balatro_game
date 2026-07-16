/* =========================================================
   小丑牌 · JOKER — UI（渲染 / 动画 / 音效 / 流程 / 事件绑定）
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

/* ---------- 音效 (WebAudio) ---------- */
const AudioFX = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem("joker_muted") === "1"; } catch (e) { /* 忽略 */ }
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
    toggleMute: () => {
      muted = !muted;
      try { localStorage.setItem("joker_muted", muted ? "1" : "0"); } catch (e) { /* 忽略 */ }
      return muted;
    },
    select: () => tone(520, .08, "triangle", .12),
    deselect: () => tone(380, .08, "triangle", .1),
    chip: i => tone(600 + i * 90, .1, "square", .07),
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

/* ---------- 盲注选择 ---------- */
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
  if (!sc.allDebuffed && (!G.bestHand || sc.total > G.bestHand.total))
    G.bestHand = { type: sc.ev.type, total: sc.total };

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
        if (curEl) {
          floatText(curEl, `+${step.add}`, "chips");
          if (step.enhMult) floatText(curEl, `+${step.enhMult} 倍率`, "mult");
        }
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
      if (!G.endless && G.ante > MAX_ANTE) { gameOver(true); return; }
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
      (item.kind === "joker" && G.jokers.length >= G.maxJokers) ||
      (item.kind === "tarot" && G.consumables.length >= G.maxConsumables);
    buyBtn.onclick = () => buyItem(item, price);
    wrap.append(priceEl, cardEl, buyBtn);
    box.appendChild(wrap);
  });
  $("reroll-btn").textContent = G.freeReroll > 0 ? `刷新 (免费 ×${G.freeReroll})` : `刷新 $${G.rerollCost}`;
  $("reroll-btn").disabled = G.freeReroll <= 0 && G.money < G.rerollCost;
}

function buyItem(item, price) {
  if (G.money < price || item.sold) return;
  if (item.kind === "tarot" && G.consumables.length >= G.maxConsumables) return;
  G.money -= price;
  item.sold = true;
  AudioFX.buy();
  if (item.kind === "joker") {
    G.jokers.push({ id: item.def.id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
  } else if (item.kind === "tarot") {
    G.consumables.push({ id: item.def.id, uid: "t" + Date.now() + Math.random().toString(36).slice(2, 5) });
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

/* ---------- 消耗品（塔罗）使用 ---------- */
function useConsumable(cons) {
  if (G.scoring) return false;
  const def = TAROT_BY_ID.get(cons.id);
  let msg;
  if (def.targets) {
    if (G.state !== "playing") { flashMessage("🔒 只能在回合中对手牌使用"); return false; }
    const sel = selectedCards();
    const [min, max] = def.targets;
    if (sel.length < min || sel.length > max) {
      flashMessage(`请先选中 ${min === max ? min : `${min}-${max}`} 张手牌`);
      return false;
    }
    msg = def.applyCards(sel, G);
    G.selected.clear();
  } else {
    msg = def.apply(G);
  }
  G.consumables = G.consumables.filter(x => x !== cons);
  AudioFX.buy();
  flashMessage(`${def.icon} ${def.name}: ${msg}`);
  hideTooltip();
  saveGame();
  render();
  if (G.state === "shop") renderShop();
  return true;
}

function makeConsumableEl(cons) {
  const def = TAROT_BY_ID.get(cons.id);
  const el = document.createElement("div");
  el.className = "consumable";
  el.dataset.uid = cons.uid;
  el.innerHTML = `<div class="c-icon">${def.icon}</div><div class="c-name">${def.name}</div>`;
  el.onmouseenter = e => showTarotTip(e, def);
  el.onmousemove = e => moveTooltip(e);
  el.onmouseleave = () => { hideTooltip(); cancelSellConfirm(el); };
  // 双击确认使用（与小丑牌卖出一致的交互）
  el.onclick = e => {
    if (el.classList.contains("confirm-sell")) { cancelSellConfirm(el); useConsumable(cons); return; }
    if (NO_HOVER) showTarotTip(e, def);
    document.querySelectorAll(".consumable.confirm-sell, .joker.confirm-sell").forEach(cancelSellConfirm);
    el.classList.add("confirm-sell");
    const badge = document.createElement("div");
    badge.className = "sell-badge";
    badge.textContent = def.targets ? "再点一次对选中手牌使用" : "再点一次使用";
    el.appendChild(badge);
    el._sellTimer = setTimeout(() => cancelSellConfirm(el), 2500);
  };
  return el;
}

function renderConsumables() {
  const box = $("consumables");
  box.innerHTML = "";
  G.consumables.forEach(c => box.appendChild(makeConsumableEl(c)));
  for (let i = G.consumables.length; i < G.maxConsumables; i++) {
    const s = document.createElement("div");
    s.className = "consumable-slot";
    box.appendChild(s);
  }
  $("consumable-count").textContent = `${G.consumables.length}/${G.maxConsumables}`;
}

/* ---------- 结束 ---------- */
function runStatsHTML() {
  const played = Object.entries(G.handPlayCounts).sort((a, b) => b[1] - a[1]);
  let s = `<div class="end-stats">回合数 ${G.round}`;
  if (played[0]) s += ` · 最常出牌型: ${HAND_TYPES[played[0][0]].name} ×${played[0][1]}`;
  if (G.bestHand) s += `<br>最佳出牌: ${HAND_TYPES[G.bestHand.type].name} ${fmt(G.bestHand.total)} 分`;
  s += `<br>种子: ${G.seed}`;
  return s + `</div>`;
}

function gameOver(win) {
  G.state = "over";
  localStorage.removeItem(SAVE_KEY);
  win ? AudioFX.win() : AudioFX.lose();
  if (win) confetti(220);
  $("end-title").textContent = win ? "🎉 通关胜利!" : "游戏结束";
  $("end-title").className = "end-title " + (win ? "win" : "lose");
  $("end-detail").innerHTML = (win
    ? `你击败了全部 ${MAX_ANTE} 个底注!<br>最终资金: $${G.money}`
    : `倒在了 ${G.endless ? "无尽模式 · " : ""}底注 ${G.ante} · ${G.blindIndex === 2 ? G.boss.name : BLIND_META[G.blindIndex].name}<br>差 ${fmt(Math.max(0, G.target - G.roundScore))} 分`)
    + runStatsHTML();
  $("endless-btn").classList.toggle("hidden", !win);
  $("end-screen").classList.remove("hidden");
}

/* ---------- 卡面渲染 ---------- */
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
  let enhMark = "";
  if (c.enh && ENH[c.enh]) {
    el.classList.add(`enh-${c.enh}`);
    enhMark = `<div class="enh-mark" title="${ENH[c.enh].name}: ${ENH[c.enh].desc}">${ENH[c.enh].icon}</div>`;
  }
  el.innerHTML = corners + center + enhMark + `<div class="card-gloss"></div>`;
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
  $("deck-count").textContent = `${G.deck.length}/${G.masterDeck.length}`;
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
    document.querySelectorAll(".joker.confirm-sell, .consumable.confirm-sell").forEach(cancelSellConfirm);
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
function showTarotTip(e, def) {
  const tt = $("tooltip");
  tt.innerHTML = `<div class="tt-title">${def.icon} ${def.name}</div>
    <div class="tt-rarity uncommon">塔罗牌</div>
    <div class="tt-desc">${def.desc}</div>
    <div class="tt-sell">${def.targets ? "选中手牌后点击使用" : "点击使用"}</div>`;
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
  $("ante").textContent = G.ante + (G.endless ? "∞" : "");
  $("round").textContent = G.round;
  $("round-score").textContent = fmt(G.roundScore);
  $("seed-line").textContent = `种子 ${G.seed ?? "-"}${G.seed === todaySeed() ? " · 今日挑战" : ""}`;
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
  renderConsumables();
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
/* 双击确认的破坏性按钮（重新开局 / 今日挑战） */
function bindConfirmButton(btn, label, confirmLabel, action) {
  btn.onclick = () => {
    if (btn.dataset.confirm) {
      delete btn.dataset.confirm;
      btn.textContent = label;
      action();
    } else {
      btn.dataset.confirm = "1";
      btn.textContent = confirmLabel;
      setTimeout(() => { delete btn.dataset.confirm; btn.textContent = label; }, 2500);
    }
  };
}

function startFreshGame(seed) {
  localStorage.removeItem(SAVE_KEY);
  document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
  newGame(seed);
}

$("play-btn").onclick = playHand;
$("discard-btn").onclick = discard;
$("sort-rank").onclick = () => { sortHand("rank"); render(); };
$("sort-suit").onclick = () => { sortHand("suit"); render(); };
$("run-info-btn").onclick = showRunInfo;
bindConfirmButton($("new-run-btn"), "重新开局", "确认放弃本局?", () => startFreshGame());
bindConfirmButton($("daily-btn"), "今日挑战", "确认放弃本局?", () => {
  startFreshGame(todaySeed());
  flashMessage(`📅 今日挑战 · 种子 ${G.seed}`);
});
$("seed-line").onclick = () => {
  const v = typeof window.prompt === "function"
    ? window.prompt("输入种子开始新局（将放弃当前进度，留空取消）:", "") : null;
  if (!v || !v.trim()) return;
  const t = v.trim();
  startFreshGame(/^\d+$/.test(t) ? parseInt(t, 10) : hashStr(t));
  flashMessage(`🎲 种子 ${G.seed}`);
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
$("endless-btn").onclick = () => {
  G.endless = true;
  $("end-screen").classList.add("hidden");
  G.blindIndex = 0;
  pickBoss();
  openShop();
  saveGame();
  flashMessage("♾️ 无尽模式!目标分数将持续增长");
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
  if (NO_HOVER && !e.target?.closest?.(".joker, .consumable")) hideTooltip();
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

/* ---------- PWA ---------- */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof location !== "undefined" && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* 离线支持是增强项 */ });
}

/* ---------- 启动 ---------- */
if (!loadGame()) newGame();
