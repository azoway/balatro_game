/* =========================================================
   小丑牌 · JOKER — 国际化（zh / en）
   L(obj)  : 取 {zh, en} 双语对象的当前语言值
   S(key, ...args) : 取界面文案模板并填充 {0} {1} …
   最先加载；语言偏好存 localStorage("joker_lang")，切换后刷新页面生效。
   ========================================================= */
"use strict";

let LANG = "zh";
try { LANG = localStorage.getItem("joker_lang") === "en" ? "en" : "zh"; } catch (e) { /* 忽略 */ }

const L = v => (v && typeof v === "object") ? (v[LANG] ?? v.zh) : v;

const STR = {
  game_title:        { zh: "小丑牌 · JOKER", en: "JOKER — a Balatro-like" },

  /* 盲注选择 */
  blind_select_title:{ zh: "选择盲注", en: "Choose your Blind" },
  select_btn:        { zh: "选择", en: "Select" },
  skip_btn:          { zh: "跳过 🎁", en: "Skip 🎁" },
  done_mark:         { zh: "✔ 已完成", en: "✔ Cleared" },
  upcoming:          { zh: "即将到来", en: "Upcoming" },
  reward_word:       { zh: "奖励", en: "Reward" },

  /* 侧边栏 / 主界面 */
  target_label:      { zh: "目标分数", en: "Score at least" },
  round_score_label: { zh: "回合分数", en: "Round score" },
  hands_label:       { zh: "出牌", en: "Hands" },
  discards_label:    { zh: "弃牌", en: "Discards" },
  ante_label:        { zh: "底注", en: "Ante" },
  round_label:       { zh: "回合", en: "Round" },
  jokers_label:      { zh: "小丑牌", en: "Jokers" },
  consumables_label: { zh: "消耗品", en: "Consumables" },
  deck_label:        { zh: "牌库", en: "Deck" },
  run_info_btn:      { zh: "牌型等级", en: "Hand Levels" },
  new_run_btn:       { zh: "重新开局", en: "New Run" },
  daily_btn:         { zh: "今日挑战", en: "Daily Run" },
  collection_btn:    { zh: "图鉴", en: "Collection" },
  confirm_abandon:   { zh: "确认放弃本局?", en: "Abandon this run?" },
  hotkeys:           { zh: "快捷键: 1-9选牌 · Enter出牌 · X弃牌 · R/S排序 · M静音 · 计分中点击加速",
                       en: "Hotkeys: 1-9 select · Enter play · X discard · R/S sort · M mute · click to speed up scoring" },
  sort_label:        { zh: "排序", en: "Sort" },
  sort_rank_btn:     { zh: "点数", en: "Rank" },
  sort_suit_btn:     { zh: "花色", en: "Suit" },
  play_btn:          { zh: "出牌", en: "Play" },
  discard_btn:       { zh: "弃牌", en: "Discard" },
  seed_word:         { zh: "种子", en: "Seed" },
  today_suffix:      { zh: " · 今日挑战", en: " · Daily" },
  seed_prompt:       { zh: "输入种子开始新局（将放弃当前进度，留空取消）:",
                       en: "Enter a seed to start a new run (abandons current progress, empty to cancel):" },
  seed_start:        { zh: "🎲 种子 {0}", en: "🎲 Seed {0}" },
  daily_start:       { zh: "📅 今日挑战 · 种子 {0}", en: "📅 Daily Run · Seed {0}" },

  /* 计分 / 回合 */
  mult_word:         { zh: "倍率", en: "Mult" },
  chips_word:        { zh: "筹码", en: "Chips" },
  psychic_need5:     { zh: "🔮 通灵者：必须打出 5 张牌!", en: "🔮 The Psychic: you must play 5 cards!" },
  all_debuffed_name: { zh: "🚫 全部禁用", en: "🚫 All debuffed" },
  all_debuffed_flash:{ zh: "🚫 打出的牌全部被禁用，本次得 0 分!", en: "🚫 All played cards are debuffed — 0 points!" },
  hook_flash:        { zh: "🪝 钩子弃掉了你 2 张手牌!", en: "🪝 The Hook discarded 2 of your cards!" },
  accelerate:        { zh: "⏩ 加速", en: "⏩ Speed up" },
  muted:             { zh: "🔇 已静音", en: "🔇 Muted" },
  unmuted:           { zh: "🔊 声音开启", en: "🔊 Sound on" },

  /* 结算 */
  round_won_title:   { zh: "回合胜利!", en: "Round won!" },
  defeat_word:       { zh: "击败", en: "Defeated" },
  hands_left_bonus:  { zh: "剩余出牌次数", en: "Remaining hands" },
  interest_line:     { zh: "利息 (每$5得$1, 上限${0})", en: "Interest ($1 per $5, cap ${0})" },
  gold_cards_line:   { zh: "💰 手中黄金牌 ×{0}", en: "💰 Gold cards in hand ×{0}" },
  eaten_flash:       { zh: "{0} 被吃掉了!", en: "{0} was eaten!" },
  cashout_collect:   { zh: "收取", en: "Cash out" },

  /* 商店 */
  shop_title:        { zh: "🛒 商 店", en: "🛒 SHOP" },
  buy_btn:           { zh: "购买", en: "Buy" },
  sold_out:          { zh: "已售", en: "Sold" },
  upgrade_word:      { zh: "升级", en: "Upgrade" },
  reroll_free:       { zh: "刷新 (免费 ×{0})", en: "Reroll (free ×{0})" },
  reroll_cost:       { zh: "刷新 ${0}", en: "Reroll ${0}" },
  next_round_btn:    { zh: "下一回合 ➜", en: "Next round ➜" },
  sold_flash:        { zh: "卖出 {0} +${1}", en: "Sold {0} +${1}" },
  sell_again:        { zh: "再点一次卖出 ${0}", en: "Click again to sell ${0}" },
  click_sell:        { zh: "点击卖出 ${0}", en: "Click to sell ${0}" },
  move_joker_tip:    { zh: "调整结算顺序", en: "Change scoring order" },

  /* 塔罗 / 消耗品 */
  tarot_label:       { zh: "塔罗牌", en: "Tarot" },
  click_use:         { zh: "点击使用", en: "Click to use" },
  select_first_use:  { zh: "选中手牌后点击使用", en: "Select cards in hand, then click to use" },
  use_again:         { zh: "再点一次使用", en: "Click again to use" },
  use_again_target:  { zh: "再点一次对选中手牌使用", en: "Click again to use on selected cards" },
  only_in_round:     { zh: "🔒 只能在回合中对手牌使用", en: "🔒 Can only be used on cards during a round" },
  need_select:       { zh: "请先选中 {0} 张手牌", en: "Select {0} card(s) in hand first" },
  msg_suit_change:   { zh: "{0} 张牌变为 {1}", en: "{0} card(s) converted to {1}" },
  msg_rank_up:       { zh: "{0} 张牌点数 +1", en: "{0} card(s) rank +1" },
  msg_enhanced:      { zh: "{0} 变为{1}", en: "{0} became a {1}" },
  msg_destroyed:     { zh: "销毁 {0} 张牌", en: "Destroyed {0} card(s)" },
  msg_discard_up:    { zh: "弃牌上限 {0}", en: "Discard limit {0}" },
  msg_hands_up:      { zh: "出牌上限 {0}", en: "Hand limit {0}" },
  msg_handsize_up:   { zh: "手牌上限 {0}", en: "Hand size {0}" },
  msg_free_reroll:   { zh: "下次商店可免费刷新 1 次", en: "Next shop reroll is free" },

  /* 卡包 */
  pick_one:          { zh: "3 选 1", en: "Pick 1 of 3" },
  choose_btn:        { zh: "选择", en: "Choose" },
  pack_skip_btn:     { zh: "放弃卡包", en: "Skip pack" },
  pack_taken:        { zh: "获得 {0}", en: "Got {0}" },
  slots_full:        { zh: "槽位已满!", en: "Slots are full!" },

  /* 牌库查看 */
  deck_view_title:   { zh: "牌库一览", en: "Deck Overview" },
  deck_hint_playing: { zh: "灰色 = 本回合已抽走 · 图标 = 增强", en: "Grey = already drawn this round · icon = enhancement" },
  deck_hint_all:     { zh: "整局牌库 · 图标 = 增强", en: "Full run deck · icon = enhancement" },
  close_btn:         { zh: "返回", en: "Back" },

  /* 图鉴 / 统计 */
  collection_title:  { zh: "图鉴 · 战绩", en: "Collection · Stats" },
  stats_line:        { zh: "局数 {0} · 通关 {1} · 最高底注 {2} · 最佳出牌 {3} · 图鉴 {4}/{5}",
                       en: "Runs {0} · Wins {1} · Best ante {2} · Best hand {3} · Collection {4}/{5}" },

  /* 牌型等级 */
  hand_levels_title: { zh: "牌型等级", en: "Hand Levels" },

  /* 结束 */
  win_title:         { zh: "🎉 通关胜利!", en: "🎉 You win!" },
  lose_title:        { zh: "游戏结束", en: "Game over" },
  win_detail:        { zh: "你击败了全部 {0} 个底注!<br>最终资金: ${1}", en: "You beat all {0} antes!<br>Final money: ${1}" },
  fell_at:           { zh: "倒在了", en: "Defeated at" },
  endless_word:      { zh: "无尽模式", en: "Endless" },
  ante_word:         { zh: "底注", en: "Ante" },
  short_by:          { zh: "差 {0} 分", en: "{0} points short" },
  rounds_word:       { zh: "回合数", en: "Rounds" },
  fav_hand:          { zh: "最常出牌型", en: "Most played" },
  best_play:         { zh: "最佳出牌", en: "Best hand" },
  restart_btn:       { zh: "再来一局", en: "Play again" },
  endless_btn:       { zh: "♾️ 无尽模式", en: "♾️ Endless mode" },
  endless_start:     { zh: "♾️ 无尽模式!目标分数将持续增长", en: "♾️ Endless mode! Targets keep growing" },

  /* 存档 */
  msg_restored:      { zh: "📂 已恢复上局进度", en: "📂 Progress restored" },
  msg_restored_blind:{ zh: "📂 已恢复上局进度（回到盲注选择）", en: "📂 Progress restored (back to blind select)" },
};

function S(key, ...args) {
  let s = L(STR[key]) ?? key;
  args.forEach((a, i) => { s = s.replaceAll(`{${i}}`, a); });
  return s;
}
