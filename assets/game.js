/**
 * game.js — Core game logic for Dice Corner Duel (3D)
 * Grid-based logic only. All rendering delegated to ThreeScene.
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────
  const GRID       = 10;
  const MAX_HP     = 10;
  const ATTACK_DMG = 2;
  const HEAL_AMT   = 2;
  const MAX_LOG    = 6;

  // ── Game state ─────────────────────────────────────────────────────
  let state;

  // ── Blocked tile definitions ───────────────────────────────────────
  function genBlocked() {
    const blocked = {};
    const rawCrates = [
      [2,2],[2,7],[7,2],[7,7],
      [4,4],[5,5],[3,6],[6,3],
      [1,5],[8,4],[4,1],[5,8],
    ];
    const rawBushes = [
      [3,3],[6,6],[2,5],[7,4],
      [5,2],[4,7],[1,8],[8,1],
      [3,8],[6,1],
    ];
    rawCrates.forEach(([c,r]) => { blocked[`${c},${r}`] = 'crate'; });
    rawBushes.forEach(([c,r]) => { blocked[`${c},${r}`] = 'bush';  });
    return blocked;
  }

  // ── Init ───────────────────────────────────────────────────────────
  function initGame() {
    const blocked = genBlocked();

    state = {
      player:  { col: 0, row: 9, hp: MAX_HP },
      bot:     { col: 9, row: 0, hp: MAX_HP },
      blocked,
      turn:    'player',   // 'player' | 'bot'
      phase:   'roll',     // 'roll' | 'action' | 'botTurn' | 'over'
      diceVal: 0,
      busy:    false,
    };

    ThreeScene.rebuildBoard(blocked);
    ThreeScene.setPlayerPos(state.player.col, state.player.row);
    ThreeScene.setBotPos(state.bot.col, state.bot.row);
    ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);

    updateTurnUI('YOUR TURN');
    setRollEnabled(true);
    hideModals();
    clearLog();
    log('⚔️ New game started!', 'dice');
  }

  // ── UI helpers ─────────────────────────────────────────────────────
  function updateTurnUI(text) {
    document.getElementById('turn-info').textContent = text;
  }

  function setRollEnabled(on) {
    document.getElementById('roll-btn').disabled = !on;
  }

  function showDiceResult(val) {
    const el = document.getElementById('dice-result-display');
    el.textContent = `🎲 ${val}`;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  function showActionModal() {
    document.getElementById('action-modal').classList.remove('hidden');
  }

  function hideActionModal() {
    document.getElementById('action-modal').classList.add('hidden');
  }

  function hideModals() {
    hideActionModal();
    document.getElementById('result-overlay').classList.add('hidden');
  }

  function showResult(win) {
    const overlay = document.getElementById('result-overlay');
    const title   = document.getElementById('result-title');
    const subtitle = document.getElementById('result-subtitle');
    overlay.classList.remove('hidden');
    if (win) {
      title.textContent   = '⚔️ VICTORY!';
      title.style.color   = '#ffe08a';
      subtitle.textContent = 'The enemy has fallen.';
    } else {
      title.textContent   = '💀 DEFEATED';
      title.style.color   = '#ff6666';
      subtitle.textContent = 'You have been slain...';
    }
  }

  function log(msg, type = '') {
    const el = document.getElementById('log-entries');
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ' ' + type : '');
    entry.textContent = msg;
    el.appendChild(entry);
    while (el.children.length > MAX_LOG) el.removeChild(el.firstChild);
  }

  function clearLog() {
    document.getElementById('log-entries').innerHTML = '';
  }

  // ── Dice ───────────────────────────────────────────────────────────
  function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
  }

  // ── Movement / pathfinding ─────────────────────────────────────────
  function isWalkable(col, row, excludeChar) {
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return false;
    const key = `${col},${row}`;
    if (state.blocked[key]) return false;
    // Don't walk into the other character's current tile
    if (excludeChar === 'player' && state.bot.col === col    && state.bot.row === row)    return false;
    if (excludeChar === 'bot'    && state.player.col === col && state.player.row === row) return false;
    return true;
  }

  const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];

  function bfsPath(fromCol, fromRow, toCol, toRow, asChar) {
    const visited = new Set();
    const queue = [{ col: fromCol, row: fromRow, path: [] }];
    visited.add(`${fromCol},${fromRow}`);
    while (queue.length) {
      const { col, row, path } = queue.shift();
      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        if (!isWalkable(nc, nr, asChar)) {
          // Still consider it if it's the exact target (adjacent check)
          if (nc === toCol && nr === toRow) return [...path, { col: nc, row: nr }];
          continue;
        }
        visited.add(key);
        const newPath = [...path, { col: nc, row: nr }];
        if (nc === toCol && nr === toRow) return newPath;
        queue.push({ col: nc, row: nr, path: newPath });
      }
    }
    return [];
  }

  function isAdjacent(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  }

  // ── Player turn ────────────────────────────────────────────────────
  async function onRollClick() {
    if (state.busy || state.phase !== 'roll' || state.turn !== 'player') return;
    state.busy = true;
    setRollEnabled(false);

    const val = rollDice();
    state.diceVal = val;
    log(`You rolled a ${val}`, 'dice');
    updateTurnUI(`ROLLED ${val} — MOVING`);

    await ThreeScene.animateDiceRoll(val);
    showDiceResult(val);

    // Move player
    const path = bfsPath(state.player.col, state.player.row, state.bot.col, state.bot.row, 'player');
    const steps = Math.min(val, path.length);

    for (let i = 0; i < steps; i++) {
      const next = path[i];
      // Stop if we'd be adjacent to bot (we can't enter bot's tile)
      if (!isWalkable(next.col, next.row, 'player')) break;
      const prev = { col: state.player.col, row: state.player.row };
      state.player.col = next.col;
      state.player.row = next.row;
      await ThreeScene.animatePlayerMoveTo(prev.col, prev.row, next.col, next.row);
    }

    log(`Hero moves to (${state.player.col},${state.player.row})`, 'move');

    // Check adjacency
    if (isAdjacent(state.player, state.bot)) {
      state.phase = 'action';
      updateTurnUI('CHOOSE ACTION');
      state.busy = false;
      showActionModal();
    } else {
      state.busy = false;
      endPlayerTurn();
    }
  }

  async function onAttack() {
    if (state.busy || state.phase !== 'action') return;
    state.busy = true;
    hideActionModal();

    log(`⚔️ Hero attacks for ${ATTACK_DMG}!`, 'attack');
    await ThreeScene.animateAttack(true);
    state.bot.hp = Math.max(0, state.bot.hp - ATTACK_DMG);
    ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);

    if (state.bot.hp <= 0) {
      log('💀 Enemy defeated!', 'attack');
      await ThreeScene.animateDeath(false);
      state.phase = 'over';
      state.busy  = false;
      showResult(true);
      return;
    }

    state.busy = false;
    endPlayerTurn();
  }

  async function onHeal() {
    if (state.busy || state.phase !== 'action') return;
    state.busy = true;
    hideActionModal();

    const healed = Math.min(HEAL_AMT, MAX_HP - state.player.hp);
    state.player.hp = Math.min(MAX_HP, state.player.hp + HEAL_AMT);
    log(`💚 Hero heals for ${healed} HP!`, 'heal');
    await ThreeScene.animateHeal(true);
    ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);

    state.busy = false;
    endPlayerTurn();
  }

  function onSkip() {
    if (state.busy || state.phase !== 'action') return;
    hideActionModal();
    log('⏭ Skipped action', '');
    endPlayerTurn();
  }

  function endPlayerTurn() {
    state.turn  = 'bot';
    state.phase = 'botTurn';
    updateTurnUI('ENEMY TURN…');
    setRollEnabled(false);
    setTimeout(() => doBotTurn(), 900);
  }

  // ── Bot AI ─────────────────────────────────────────────────────────
  async function doBotTurn() {
    if (state.phase === 'over') return;
    state.busy = true;

    const val = rollDice();
    log(`Enemy rolled a ${val}`, 'dice');
    updateTurnUI(`ENEMY ROLLED ${val}`);

    await ThreeScene.animateDiceRoll(val);
    await sleep(300);

    // Bot uses BFS toward player
    const path = bfsPath(state.bot.col, state.bot.row, state.player.col, state.player.row, 'bot');
    const steps = Math.min(val, path.length);

    for (let i = 0; i < steps; i++) {
      const next = path[i];
      if (!isWalkable(next.col, next.row, 'bot')) break;
      const prev = { col: state.bot.col, row: state.bot.row };
      state.bot.col = next.col;
      state.bot.row = next.row;
      await ThreeScene.animateBotMoveTo(prev.col, prev.row, next.col, next.row);
    }

    log(`Enemy moves to (${state.bot.col},${state.bot.row})`, 'move');

    // Bot action if adjacent
    if (isAdjacent(state.bot, state.player)) {
      await sleep(400);
      const action = botChooseAction();
      if (action === 'attack') {
        log(`💀 Enemy attacks for ${ATTACK_DMG}!`, 'attack');
        await ThreeScene.animateAttack(false);
        state.player.hp = Math.max(0, state.player.hp - ATTACK_DMG);
        ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);
        if (state.player.hp <= 0) {
          log('💀 Hero defeated…', 'attack');
          await ThreeScene.animateDeath(true);
          state.phase = 'over';
          state.busy  = false;
          showResult(false);
          return;
        }
      } else {
        const healed = Math.min(HEAL_AMT, MAX_HP - state.bot.hp);
        state.bot.hp = Math.min(MAX_HP, state.bot.hp + HEAL_AMT);
        log(`Enemy heals for ${healed} HP`, 'heal');
        await ThreeScene.animateHeal(false);
        ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);
      }
    }

    state.busy = false;
    endBotTurn();
  }

  function botChooseAction() {
    // Prefer attack; heal if low HP and far from killing player
    if (state.bot.hp <= 4 && state.player.hp > ATTACK_DMG) {
      return 'heal';
    }
    return 'attack';
  }

  function endBotTurn() {
    state.turn  = 'player';
    state.phase = 'roll';
    updateTurnUI('YOUR TURN');
    setRollEnabled(true);
  }

  // ── Utilities ──────────────────────────────────────────────────────
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── Wiring ────────────────────────────────────────────────────────
  function wireButtons() {
    document.getElementById('roll-btn').addEventListener('click', onRollClick);
    document.getElementById('btn-attack').addEventListener('click', onAttack);
    document.getElementById('btn-heal').addEventListener('click', onHeal);
    document.getElementById('btn-skip').addEventListener('click', onSkip);
    document.getElementById('restart-btn').addEventListener('click', () => {
      document.getElementById('result-overlay').classList.add('hidden');
      initGame();
    });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────
  function bootstrap() {
    const blocked = genBlocked();
    ThreeScene.init(blocked);
    wireButtons();
    initGame();
  }

  // Wait for DOM + scripts
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
