(function () {
  'use strict';

  const GRID       = 10;
  const MAX_HP     = 10;
  const ATTACK_DMG = 2;
  const HEAL_AMT   = 2;
  const MAX_LOG    = 6;
  const DIRS       = [[0,-1],[0,1],[-1,0],[1,0]];
  const NUM_CRATES = 10;
  const NUM_BUSHES = 10;

  let state;

  // ── Random map ───────────────────────────────────────────────────
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function genMap() {
    const interior = [];
    for (let r = 1; r < GRID - 1; r++)
      for (let c = 1; c < GRID - 1; c++)
        interior.push([c, r]);
    shuffle(interior);

    const blocked = {};
    let cratesLeft = NUM_CRATES, bushesLeft = NUM_BUSHES;
    for (const [c, r] of interior) {
      if (cratesLeft === 0 && bushesLeft === 0) break;
      const key = `${c},${r}`;
      if (cratesLeft > 0) { blocked[key] = 'crate'; cratesLeft--; }
      else                { blocked[key] = 'bush';  bushesLeft--; }
    }

    const free = [];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++)
        if (!blocked[`${c},${r}`]) free.push([c, r]);
    shuffle(free);

    let playerStart = null, botStart = null;
    outer:
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const [pc, pr] = free[i], [bc, br] = free[j];
        if (Math.abs(pc - bc) + Math.abs(pr - br) < 7) continue;
        if (!bfsConnected(pc, pr, bc, br, blocked)) continue;
        playerStart = { col: pc, row: pr };
        botStart    = { col: bc, row: br };
        break outer;
      }
    }
    if (!playerStart) playerStart = { col: 0, row: GRID - 1 };
    if (!botStart)    botStart    = { col: GRID - 1, row: 0 };
    return { blocked, playerStart, botStart };
  }

  function bfsConnected(fc, fr, tc, tr, blocked) {
    const visited = new Set([`${fc},${fr}`]);
    const q = [{ col: fc, row: fr }];
    while (q.length) {
      const { col, row } = q.shift();
      if (col === tc && row === tr) return true;
      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr;
        if (nc < 0 || nc >= GRID || nr < 0 || nr >= GRID) continue;
        const key = `${nc},${nr}`;
        if (visited.has(key) || blocked[key]) continue;
        visited.add(key);
        q.push({ col: nc, row: nr });
      }
    }
    return false;
  }

  // ── Init ─────────────────────────────────────────────────────────
  function initGame() {
    const { blocked, playerStart, botStart } = genMap();
    state = {
      player:      { col: playerStart.col, row: playerStart.row, hp: MAX_HP },
      bot:         { col: botStart.col,    row: botStart.row,    hp: MAX_HP },
      blocked,
      turn:        'player',
      phase:       'roll',
      diceVal:     0,
      plannedPath: [],
      busy:        false,
    };
    ThreeScene.rebuildBoard(blocked);
    ThreeScene.setPlayerPos(state.player.col, state.player.row);
    ThreeScene.setBotPos(state.bot.col, state.bot.row);
    ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);
    ThreeScene.clearPathUI();
    updateTurnUI('YOUR TURN');
    setRollEnabled(true);
    setConfirmEnabled(false);
    hideModals();
    clearLog();
    log('⚔️ New game — new map!', 'dice');
  }

  // ── UI helpers ───────────────────────────────────────────────────
  function updateTurnUI(text) {
    document.getElementById('turn-info').textContent = text;
  }
  function setRollEnabled(on) {
    document.getElementById('roll-btn').disabled = !on;
  }
  function setConfirmEnabled(on) {
    const btn = document.getElementById('confirm-move-btn');
    btn.disabled      = !on;
    btn.style.display = on ? '' : 'none';
  }
  function showDiceResult(val) {
    const el = document.getElementById('dice-result-display');
    el.textContent = `🎲 ${val}`;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
  function showActionModal()  { document.getElementById('action-modal').classList.remove('hidden'); }
  function hideActionModal()  { document.getElementById('action-modal').classList.add('hidden');    }
  function hideModals() {
    hideActionModal();
    document.getElementById('result-overlay').classList.add('hidden');
  }
  function showResult(win) {
    document.getElementById('result-overlay').classList.remove('hidden');
    const title    = document.getElementById('result-title');
    const subtitle = document.getElementById('result-subtitle');
    if (win) {
      title.textContent    = '⚔️ VICTORY!';
      title.style.color    = '#ffe08a';
      subtitle.textContent = 'The enemy has fallen.';
    } else {
      title.textContent    = '💀 DEFEATED';
      title.style.color    = '#ff6666';
      subtitle.textContent = 'You have been slain...';
    }
  }
  function log(msg, type = '') {
    const el  = document.getElementById('log-entries');
    const div = document.createElement('div');
    div.className   = 'log-entry' + (type ? ' ' + type : '');
    div.textContent = msg;
    el.appendChild(div);
    while (el.children.length > MAX_LOG) el.removeChild(el.firstChild);
  }
  function clearLog() { document.getElementById('log-entries').innerHTML = ''; }

  // ── Walkability ──────────────────────────────────────────────────
  function isWalkable(col, row, asChar) {
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return false;
    if (state.blocked[`${col},${row}`]) return false;
    if (asChar === 'player' && state.bot.col    === col && state.bot.row    === row) return false;
    if (asChar === 'bot'    && state.player.col === col && state.player.row === row) return false;
    return true;
  }
  function isAdjacent(a, b) {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function rollDice() { return Math.floor(Math.random() * 6) + 1; }

  // ── Player roll ──────────────────────────────────────────────────
  async function onRollClick() {
    if (state.busy || state.phase !== 'roll' || state.turn !== 'player') return;
    state.busy = true;
    setRollEnabled(false);

    const val = rollDice();
    state.diceVal     = val;
    state.plannedPath = [];
    log(`You rolled a ${val}`, 'dice');
    updateTurnUI(`ROLLED ${val} — USE ALL ${val} STEPS`);

    await ThreeScene.animateDiceRoll(val);
    showDiceResult(val);

    state.phase = 'pathPlanning';
    state.busy  = false;
    ThreeScene.showPath([]);
    setConfirmEnabled(false);
    updateTurnUI(`${val} STEP${val !== 1 ? 'S' : ''} REMAINING`);
  }

  // ── Tile click: build path ───────────────────────────────────────
  function onTileClick(col, row) {
    if (state.phase !== 'pathPlanning' || state.busy) return;

    const path      = state.plannedPath;
    const stepsUsed = path.length;
    const stepsLeft = state.diceVal - stepsUsed;
    const tip       = stepsUsed > 0
      ? path[stepsUsed - 1]
      : { col: state.player.col, row: state.player.row };

    // Click current tip → undo last step
    if (stepsUsed > 0 && tip.col === col && tip.row === row) {
      path.pop();
      refreshPathUI();
      return;
    }

    // Must be adjacent to tip
    if (Math.abs(col - tip.col) + Math.abs(row - tip.row) !== 1) return;

    // No steps left
    if (stepsLeft <= 0) return;

    // Must be walkable (not blocked, not enemy tile)
    if (!isWalkable(col, row, 'player')) return;

    // All tiles including origin are allowed — free retracing
    path.push({ col, row });
    refreshPathUI();
  }

  function refreshPathUI() {
    const path      = state.plannedPath;
    const stepsUsed = path.length;
    const stepsLeft = state.diceVal - stepsUsed;
    const allUsed   = stepsUsed === state.diceVal;
    const tip       = stepsUsed > 0 ? path[stepsUsed - 1] : null;
    const adjToBot  = tip && isAdjacent(tip, state.bot);

    ThreeScene.showPath(path);
    setConfirmEnabled(allUsed);

    if (allUsed && adjToBot) {
      updateTurnUI('ALL STEPS USED — ADJACENT! CONFIRM ✔');
    } else if (allUsed) {
      updateTurnUI('ALL STEPS USED — CONFIRM MOVE ✔');
    } else {
      updateTurnUI(`${stepsLeft} STEP${stepsLeft !== 1 ? 'S' : ''} REMAINING`);
    }
  }

  // ── Confirm move ─────────────────────────────────────────────────
  async function onConfirmMove() {
    if (state.phase !== 'pathPlanning' || state.busy) return;
    if (state.plannedPath.length !== state.diceVal) return;

    state.busy = true;
    setConfirmEnabled(false);
    ThreeScene.clearPathUI();

    for (const step of state.plannedPath) {
      if (state.bot.col === step.col && state.bot.row === step.row) break;
      const prev = { col: state.player.col, row: state.player.row };
      state.player.col = step.col;
      state.player.row = step.row;
      await ThreeScene.animatePlayerMoveTo(prev.col, prev.row, step.col, step.row);
    }

    state.plannedPath = [];
    log(`Hero → (${state.player.col},${state.player.row})`, 'move');

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

  // ── Player actions ───────────────────────────────────────────────
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
    log(`💚 Hero heals ${healed} HP!`, 'heal');
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
    setConfirmEnabled(false);
    setTimeout(doBotTurn, 800);
  }

  // ── Bot AI ───────────────────────────────────────────────────────
  // BFS to shortest path toward a tile adjacent to player.
  function botShortestPath() {
    const { bot, player } = state;
    if (isAdjacent(bot, player)) return [];

    const targets = new Set(
      DIRS
        .map(([dc, dr]) => ({ col: player.col + dc, row: player.row + dr }))
        .filter(t => isWalkable(t.col, t.row, 'bot'))
        .map(t => `${t.col},${t.row}`)
    );
    if (targets.size === 0) return null;

    const visited = new Set([`${bot.col},${bot.row}`]);
    const queue   = [{ col: bot.col, row: bot.row, path: [] }];
    while (queue.length) {
      const { col, row, path } = queue.shift();
      for (const [dc, dr] of DIRS) {
        const nc = col + dc, nr = row + dr;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        if (!isWalkable(nc, nr, 'bot')) continue;
        visited.add(key);
        const newPath = [...path, { col: nc, row: nr }];
        if (targets.has(key)) return newPath;
        queue.push({ col: nc, row: nr, path: newPath });
      }
    }
    return null;
  }

  // Build a path of EXACTLY totalSteps for the bot.
  // Walk BFS path first, then burn remaining steps back-and-forth.
  function botBuildFullPath(totalSteps) {
    const bfsPath = botShortestPath();
    if (bfsPath === null) return null;

    const startTip = { col: state.bot.col, row: state.bot.row };

    if (bfsPath.length === 0) {
      // Already adjacent — burn all steps in place
      return burnSteps([], startTip, totalSteps, 'bot');
    }

    if (bfsPath.length >= totalSteps) {
      // BFS path covers all steps
      return bfsPath.slice(0, totalSteps);
    }

    // Walk full BFS path then burn remaining
    const remainder  = totalSteps - bfsPath.length;
    const tipAfterBFS = bfsPath[bfsPath.length - 1];
    return burnSteps(bfsPath, tipAfterBFS, remainder, 'bot');
  }

  // Append stepsToAdd back-and-forth steps onto basePath from tip.
  function burnSteps(basePath, tip, stepsToAdd, asChar) {
    if (stepsToAdd === 0) return basePath;

    let bounceTarget = null;
    for (const [dc, dr] of DIRS) {
      const nc = tip.col + dc, nr = tip.row + dr;
      if (isWalkable(nc, nr, asChar)) {
        bounceTarget = { col: nc, row: nr };
        break;
      }
    }

    const path = [...basePath];
    if (!bounceTarget) {
      // Completely walled in — just repeat tip
      for (let i = 0; i < stepsToAdd; i++) {
        path.push({ col: tip.col, row: tip.row });
      }
      return path;
    }

    let onBounce = false;
    for (let i = 0; i < stepsToAdd; i++) {
      path.push(onBounce
        ? { col: tip.col, row: tip.row }
        : { col: bounceTarget.col, row: bounceTarget.row }
      );
      onBounce = !onBounce;
    }
    return path;
  }

  async function doBotTurn() {
    if (state.phase === 'over') return;
    state.busy = true;

    const val = rollDice();
    log(`Enemy rolled a ${val}`, 'dice');
    updateTurnUI(`ENEMY ROLLED ${val}`);
    await ThreeScene.animateDiceRoll(val);
    await sleep(300);

    const fullPath = botBuildFullPath(val);

    if (!fullPath) {
      log('Enemy is blocked!', '');
    } else {
      for (const next of fullPath) {
        if (state.player.col === next.col && state.player.row === next.row) continue;
        const prev = { col: state.bot.col, row: state.bot.row };
        state.bot.col = next.col;
        state.bot.row = next.row;
        await ThreeScene.animateBotMoveTo(prev.col, prev.row, next.col, next.row);
      }
      log(`Enemy → (${state.bot.col},${state.bot.row})`, 'move');
    }

    // Attack/heal only after using ALL steps and landing adjacent
    if (isAdjacent(state.bot, state.player)) {
      await sleep(350);
      if (botShouldHeal()) {
        const healed = Math.min(HEAL_AMT, MAX_HP - state.bot.hp);
        state.bot.hp = Math.min(MAX_HP, state.bot.hp + HEAL_AMT);
        log(`Enemy heals ${healed} HP!`, 'heal');
        await ThreeScene.animateHeal(false);
        ThreeScene.updateHP(state.player.hp, MAX_HP, state.bot.hp, MAX_HP);
      } else {
        log(`💀 Enemy attacks ${ATTACK_DMG}!`, 'attack');
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
      }
    }

    state.busy = false;
    endBotTurn();
  }

  function botShouldHeal() {
    return state.bot.hp <= HEAL_AMT && state.player.hp > ATTACK_DMG;
  }

  function endBotTurn() {
    state.turn  = 'player';
    state.phase = 'roll';
    updateTurnUI('YOUR TURN');
    setRollEnabled(true);
  }

  // ── Wiring ───────────────────────────────────────────────────────
  function wireButtons() {
    document.getElementById('roll-btn').addEventListener('click', onRollClick);
    document.getElementById('confirm-move-btn').addEventListener('click', onConfirmMove);
    document.getElementById('btn-attack').addEventListener('click', onAttack);
    document.getElementById('btn-heal').addEventListener('click', onHeal);
    document.getElementById('btn-skip').addEventListener('click', onSkip);
    document.getElementById('restart-btn').addEventListener('click', () => {
      document.getElementById('result-overlay').classList.add('hidden');
      initGame();
    });
    ThreeScene.setTileClickHandler(onTileClick);
  }

  // ── Lobby ─────────────────────────────────────────────────────────
  function hideLobby() {
    document.getElementById('lobby').style.display = 'none';
  }

  function wireLobby() {
    document.getElementById('btn-play-bot').addEventListener('click', async () => {
      hideLobby();
      if (!ThreeScene._initialized) {
        await ThreeScene.init({});
        wireButtons();
      }
      initGame();
    });

    // Return to lobby from in-game
    document.addEventListener('returnToLobby', () => {
      if (state) { state.phase = 'over'; state.busy = false; }
      document.getElementById('lobby').style.display = '';
    });

    // Force end player turn (End Turn button)
    document.addEventListener('forceEndTurn', () => {
      if (!state || state.turn !== 'player' || state.phase === 'over' || state.busy) return;
      // If mid-action modal, close it
      hideActionModal();
      endPlayerTurn();
    });

    document.getElementById('btn-create').addEventListener('click', () => {
      // No-op for now
    });

    document.getElementById('btn-join').addEventListener('click', () => {
      // No-op for now
    });

    document.getElementById('btn-exit').addEventListener('click', () => {
      window.close();
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────
  function bootstrap() {
    wireLobby();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
