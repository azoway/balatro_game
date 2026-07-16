/* =========================================================
   平衡性报告：node test/balance.js [局数]
   用策略机器人批量跑整局，输出胜率 / 死亡底注分布 / 经济与小丑数据，
   为调整 ANTE_BASE、小丑数值、商店价格提供依据。
   ========================================================= */
const { compileGame, enableFastClock, makeBot } = require("./harness");

const api = compileGame();
const { G, JOKER_BY_ID, DECKS, L } = api;
enableFastClock();
const bot = makeBot(api);

const N = Math.max(1, parseInt(process.argv[2] || "50", 10));
const DECK_ID = process.argv[3] || "classic";

(async () => {
  const runs = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const seed = 10007 + i * 7919;   // 固定序列，报告可复现
    const { result, violations } = await bot.simulate(seed, DECK_ID);
    runs.push({
      seed, result,
      ante: G.ante, round: G.round, money: G.money,
      jokers: G.jokers.map(j => j.id),
      vouchers: G.vouchers.slice(),
      bestHand: G.bestHand ? G.bestHand.total : 0,
    });
    if (violations.length) console.error(`⚠ seed=${seed}: ${violations.join("; ")}`);
    if ((i + 1) % 10 === 0) process.stdout.write(`  ...${i + 1}/${N}\n`);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const wins = runs.filter(r => r.result === "win").length;
  const losses = runs.filter(r => r.result === "lose");
  const weird = runs.filter(r => !["win", "lose"].includes(r.result));

  console.log(`\n===== 平衡报告 · ${N} 局 · 牌组 ${DECK_ID} · ${secs}s =====`);
  console.log(`胜率: ${wins}/${N} (${(wins / N * 100).toFixed(1)}%)${weird.length ? ` · 异常终局 ${weird.length}` : ""}`);

  // 死亡底注分布
  const byAnte = {};
  losses.forEach(r => byAnte[r.ante] = (byAnte[r.ante] || 0) + 1);
  console.log("\n死亡底注分布:");
  Object.keys(byAnte).sort((a, b) => a - b).forEach(a => {
    const n = byAnte[a];
    console.log(`  底注 ${a}: ${"█".repeat(Math.round(n / N * 60))} ${n} (${(n / N * 100).toFixed(0)}%)`);
  });

  const avg = (arr, f) => arr.length ? (arr.reduce((s, r) => s + f(r), 0) / arr.length) : 0;
  console.log(`\n平均: 底注 ${avg(runs, r => r.ante).toFixed(1)} · 回合 ${avg(runs, r => r.round).toFixed(1)} · 终局资金 $${avg(runs, r => r.money).toFixed(1)} · 最佳出牌 ${Math.round(avg(runs, r => r.bestHand))}`);
  console.log(`平均小丑数: ${avg(runs, r => r.jokers.length).toFixed(1)} · 平均优惠券数: ${avg(runs, r => r.vouchers.length).toFixed(1)}`);

  // 小丑购买率 与 携带者平均死亡底注（正相关 ≈ 更强）
  const jStats = {};
  runs.forEach(r => r.jokers.forEach(id => {
    (jStats[id] ||= { n: 0, anteSum: 0 }).n++;
    jStats[id].anteSum += r.ante;
  }));
  const rows = Object.entries(jStats)
    .map(([id, s]) => ({ id, n: s.n, avgAnte: s.anteSum / s.n }))
    .sort((a, b) => b.n - a.n);
  console.log("\n小丑持有率 Top15（持有局数 · 携带时平均到达底注）:");
  rows.slice(0, 15).forEach(r => {
    const def = JOKER_BY_ID.get(r.id);
    console.log(`  ${(def.icon + " " + L(def.name)).padEnd(14)} ×${String(r.n).padEnd(4)} 底注 ${r.avgAnte.toFixed(1)}`);
  });
  const never = [...JOKER_BY_ID.keys()].filter(id => !jStats[id]);
  if (never.length) console.log(`\n从未被购买: ${never.map(id => L(JOKER_BY_ID.get(id).name)).join("、")}`);
  process.exit(0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
