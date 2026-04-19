/**
 * threeScene.js — 2D Canvas renderer for Dice Corner Duel
 * Adds path-planning UI: reachable tile highlights, click-to-draw path, confirm button.
 */

const ThreeScene = (() => {
  'use strict';

  const GRID     = 10;
  const CELL     = 60;
  const CANVAS_W = GRID * CELL;
  const CANVAS_H = GRID * CELL;

  let canvas, ctx;
  let playerPos  = { col: 0, row: 9 };
  let botPos     = { col: 9, row: 0 };
  let blockedMap = {};
  let playerHP = 10, playerMax = 10, botHP = 10, botMax = 10;
  let shakeX = 0, shakeY = 0;
  let healFX  = [];
  let hitFX   = null;
  let flashFX = null;

  // Path-planning state
  let reachableTiles = []; // [{col,row}]
  let plannedPath    = []; // [{col,row}]
  let tileClickCB    = null;
  let hoveredTile    = null; // {col,row}

  const IMG = {};

  // ── Asset loading ─────────────────────────────────────────────────
  function loadImage(name, src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { IMG[name] = img; resolve(); };
      img.onerror = resolve;
      img.src     = src;
    });
  }
  async function loadAllAssets() {
    await Promise.all(Object.entries(SPRITE_ASSETS).map(([k,v]) => loadImage(k,v)));
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init(blocked) {
    blockedMap = blocked;
    buildUI();
    await loadAllAssets();
    startLoop();
  }

  // ── Build full HTML shell ─────────────────────────────────────────
  function buildUI() {
    if (!document.querySelector('link[href*="Cinzel"]')) {
      const lnk = document.createElement('link');
      lnk.rel  = 'stylesheet';
      lnk.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&display=swap';
      document.head.appendChild(lnk);
    }
    ['hud','roll-area','game-log','action-modal','result-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const heroSrc  = SPRITE_ASSETS.hero_sprite  || '';
    const enemySrc = SPRITE_ASSETS.enemy_sprite || '';

    const wrap = document.createElement('div');
    wrap.id = 'gw';
    wrap.innerHTML = `
      <div id="gw-header">
        <button id="gw-menu" aria-label="Menu">☰</button>
        <div class="gw-avatar" id="gw-av1">
          <img src="${heroSrc}" alt="P1"/>
          <span class="gw-badge">1P</span>
        </div>
        <div id="gw-title">
          <div id="gw-turn-title">Player Turn</div>
          <div id="gw-turn-sub">Roll the dice to start your move.</div>
          <div id="gw-turn-meta">Turn 1 &nbsp; Dice: -</div>
        </div>
        <div class="gw-avatar" id="gw-av2">
          <img src="${enemySrc}" alt="P2"/>
          <span class="gw-badge red">2P</span>
        </div>
      </div>

      <div id="gw-board-wrap">
        <canvas id="gw-canvas"></canvas>
      </div>

      <div id="gw-stats">
        <div class="gw-stat">
          <div class="gw-sname">Player 1</div>
          <div class="gw-shp" id="gw-p1hp">10</div>
          <div class="gw-smeta" id="gw-p1pos">(0,9)</div>
          <div class="gw-smeta" id="gw-p1die">Die -</div>
        </div>
        <div class="gw-stat">
          <div class="gw-sname">Aud(weak Bot)</div>
          <div class="gw-shp" id="gw-p2hp">10</div>
          <div class="gw-smeta" id="gw-p2pos">(9,0)</div>
          <div class="gw-smeta" id="gw-p2die">Die -</div>
        </div>
      </div>

      <div id="gw-roll-row">
        <button id="gw-roll-btn">ROLL</button>
        <button id="gw-confirm-btn" style="display:none">✔ CONFIRM</button>
        <div id="gw-result-block">
          <div class="gw-rlabel">RESULT</div>
          <div id="gw-result-num">-</div>
        </div>
      </div>

      <div id="gw-bottom">
        <button class="gw-bbtn" id="gw-endturn">End Turn</button>
        <button class="gw-bbtn dim" id="gw-nextround">Next Round</button>
        <button class="gw-bbtn" id="gw-lobby">Return Lobby</button>
      </div>

      <!-- Action modal -->
      <div id="gw-action-modal" class="gw-overlay gw-hide">
        <div class="gw-mbox">
          <h2>⚔️ ADJACENT!</h2>
          <p>Choose your action:</p>
          <button id="gw-btn-attack" class="gw-abtn red-btn">⚔️ Attack (-2 HP)</button>
          <button id="gw-btn-heal"   class="gw-abtn grn-btn">💚 Heal (+2 HP)</button>
          <button id="gw-btn-skip"   class="gw-abtn skp-btn">⏭ Skip</button>
        </div>
      </div>

      <!-- Result overlay -->
      <div id="gw-result-overlay" class="gw-overlay gw-hide">
        <div class="gw-mbox">
          <div id="gw-res-title"  style="font-size:2.4rem;font-weight:900;margin-bottom:.4rem"></div>
          <div id="gw-res-sub"    style="font-size:.9rem;opacity:.65;margin-bottom:1.8rem;letter-spacing:1px"></div>
          <button id="gw-restart" class="gw-abtn" style="background:#7b4010;border-color:#c9a84c;color:#ffe08a">🔄 Play Again</button>
        </div>
      </div>

      <!-- Log -->
      <div id="gw-log"><div id="gw-log-inner"></div></div>
    `;
    document.body.appendChild(wrap);
    injectCSS();
    hookGameJS();
  }

  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
:root{--br:#3a1e08;--bg1:#6b3d1a;--bg2:#3d1e08;--gold:#c9a84c;--gold2:#ffe08a;--text:#e8d0a0;--muted:#a08060;}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;background:#2e1604;font-family:'Cinzel',Georgia,serif;overflow:hidden;display:flex;align-items:center;justify-content:center;}
#gw{display:flex;flex-direction:column;width:clamp(340px,520px,98vw);max-height:98dvh;
  background:linear-gradient(180deg,var(--bg1),var(--bg2));border-radius:14px;
  border:3px solid #1a0c03;box-shadow:0 10px 50px rgba(0,0,0,.85);overflow:hidden;position:relative;}

/* Header */
#gw-header{display:flex;align-items:center;gap:10px;padding:10px 14px 9px;
  background:linear-gradient(180deg,#2e1604,#200e02);border-bottom:2.5px solid #1a0c03;flex-shrink:0;}
#gw-menu{background:#200e02;border:2px solid #5a3010;color:var(--gold);
  width:38px;height:38px;border-radius:8px;cursor:pointer;font-size:18px;flex-shrink:0;}
.gw-avatar{position:relative;width:58px;height:58px;flex-shrink:0;border-radius:50%;
  border:3px solid var(--gold);background:rgba(0,0,0,.4);
  display:flex;align-items:center;justify-content:center;overflow:visible;}
.gw-avatar img{width:46px;height:46px;object-fit:contain;border-radius:50%;}
.gw-badge{position:absolute;top:-5px;right:-7px;background:#3a7bd5;color:#fff;
  font-size:9px;font-weight:700;border-radius:10px;padding:2px 5px;border:2px solid #fff;line-height:1.2;}
.gw-badge.red{background:#c0392b;}
#gw-title{flex:1;text-align:center;}
#gw-turn-title{font-size:1.2rem;font-weight:700;color:var(--gold2);}
#gw-turn-sub{font-size:.62rem;color:#b09070;margin:.2rem 0 .1rem;}
#gw-turn-meta{font-size:.62rem;color:var(--muted);letter-spacing:.5px;}

/* Board */
#gw-board-wrap{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;
  padding:10px;background:linear-gradient(180deg,#4a2a0e,#341404);
  border-top:2px solid #1a0c03;border-bottom:2px solid #1a0c03;overflow:hidden;}
#gw-canvas{display:block;border:3px solid #200e02;
  box-shadow:inset 0 0 20px rgba(0,0,0,.4);image-rendering:pixelated;
  max-width:100%;max-height:100%;cursor:pointer;}

/* Stats */
#gw-stats{display:flex;flex-shrink:0;background:#3d1e08;border-bottom:2px solid #1a0c03;}
.gw-stat{flex:1;padding:9px 14px;text-align:center;border-right:2px solid #1a0c03;}
.gw-stat:last-child{border-right:none;}
.gw-sname{font-size:.65rem;color:var(--muted);font-weight:600;letter-spacing:.4px;margin-bottom:2px;}
.gw-shp{font-size:2.2rem;font-weight:900;color:var(--gold2);line-height:1;}
.gw-smeta{font-size:.6rem;color:var(--muted);margin-top:1px;}

/* Roll row */
#gw-roll-row{display:flex;align-items:stretch;flex-shrink:0;border-bottom:2.5px solid #1a0c03;}
#gw-roll-btn{flex:1;background:linear-gradient(180deg,#f0e0b0,#d4b870);border:none;
  font-family:'Cinzel',serif;font-size:1.7rem;font-weight:900;color:#4a2a08;letter-spacing:4px;
  padding:13px 0;cursor:pointer;transition:filter .12s;}
#gw-roll-btn:hover:not([disabled]){filter:brightness(1.08);}
#gw-roll-btn[disabled]{opacity:.4;cursor:not-allowed;}
#gw-confirm-btn{flex:1;background:linear-gradient(180deg,#3a8a3a,#226022);border:none;
  font-family:'Cinzel',serif;font-size:1.1rem;font-weight:700;color:#afffaf;letter-spacing:2px;
  padding:13px 0;cursor:pointer;transition:filter .12s;border-left:2px solid #1a0c03;}
#gw-confirm-btn:hover:not([disabled]){filter:brightness(1.12);}
#gw-confirm-btn[disabled]{opacity:.4;cursor:not-allowed;}
#gw-result-block{width:82px;flex-shrink:0;background:#200e02;border-left:2px solid #1a0c03;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
.gw-rlabel{font-size:.5rem;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;}
#gw-result-num{font-size:1.6rem;font-weight:900;color:var(--gold2);}

/* Bottom row */
#gw-bottom{display:flex;flex-shrink:0;}
.gw-bbtn{flex:1;background:linear-gradient(180deg,#5a3010,#3a1e08);border:none;
  border-top:2px solid #1a0c03;border-right:2px solid #1a0c03;
  font-family:'Cinzel',serif;font-size:.7rem;font-weight:700;color:var(--text);
  padding:12px 6px;cursor:pointer;transition:background .15s,color .15s;}
.gw-bbtn:last-child{border-right:none;}
.gw-bbtn:hover:not(.dim){background:linear-gradient(180deg,#7a4a20,#5a2e10);color:var(--gold2);}
.gw-bbtn.dim{opacity:.38;cursor:default;}

/* Modals */
.gw-overlay{position:absolute;inset:0;z-index:600;
  display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.68);backdrop-filter:blur(4px);}
.gw-hide{display:none!important;}
.gw-mbox{background:linear-gradient(180deg,#3e1f08,#260e02);
  border:2px solid var(--gold);border-radius:12px;padding:30px 42px;text-align:center;
  box-shadow:0 0 50px rgba(201,168,76,.2),0 24px 64px rgba(0,0,0,.8);animation:gwIn .22s ease;}
@keyframes gwIn{from{opacity:0;transform:scale(.9) translateY(18px)}to{opacity:1;transform:none}}
.gw-mbox h2{font-size:1.15rem;color:var(--gold2);margin-bottom:8px;}
.gw-mbox p{font-size:.75rem;color:rgba(232,223,192,.65);margin-bottom:18px;letter-spacing:.8px;}
.gw-abtn{display:block;width:100%;margin-bottom:10px;padding:11px 18px;
  font-family:'Cinzel',serif;font-size:.82rem;letter-spacing:1px;border-radius:6px;cursor:pointer;transition:all .14s;border:1.5px solid;}
.gw-abtn:last-child{margin-bottom:0;}
.red-btn{background:rgba(224,68,68,.12);border-color:#e04444;color:#ffa0a0;}
.red-btn:hover{background:rgba(224,68,68,.3);}
.grn-btn{background:rgba(68,201,122,.12);border-color:#44c97a;color:#90ffc0;}
.grn-btn:hover{background:rgba(68,201,122,.3);}
.skp-btn{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.14);color:rgba(232,223,192,.45);}
.skp-btn:hover{background:rgba(255,255,255,.1);}

/* Log */
#gw-log{position:absolute;bottom:108px;left:8px;width:190px;pointer-events:none;z-index:300;}
#gw-log-inner{display:flex;flex-direction:column;gap:3px;}
.gw-le{font-size:.6rem;color:rgba(232,223,192,.72);background:rgba(15,6,0,.8);
  border-left:2.5px solid rgba(201,168,76,.5);padding:3px 7px;border-radius:0 3px 3px 0;animation:gwLog .18s ease;}
@keyframes gwLog{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}
.gw-le.attack{border-color:#e04444;color:#ffa0a0;}
.gw-le.heal{border-color:#44c97a;color:#90ffc0;}
.gw-le.move{border-color:rgba(100,150,255,.5);color:#b0c8ff;}
.gw-le.dice{border-color:var(--gold);color:var(--gold2);}
    `;
    document.head.appendChild(s);
  }

  // ── Shim: proxy old IDs → new UI ─────────────────────────────────
  function hookGameJS() {
    // Proxy buttons (old ID → new element click)
    const btnMap = {
      'roll-btn':         'gw-roll-btn',
      'confirm-move-btn': 'gw-confirm-btn',
      'btn-attack':       'gw-btn-attack',
      'btn-heal':         'gw-btn-heal',
      'btn-skip':         'gw-btn-skip',
      'restart-btn':      'gw-restart',
    };
    Object.entries(btnMap).forEach(([oldId, newId]) => {
      const proxy = document.createElement('button');
      proxy.id = oldId;
      proxy.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
      document.body.appendChild(proxy);
      const real = document.getElementById(newId);
      if (real) real.addEventListener('click', () => proxy.click());
      new MutationObserver(() => {
        if (!real) return;
        real.disabled = proxy.disabled;
        // Also sync display for confirm button
        if (oldId === 'confirm-move-btn') {
          real.style.display = proxy.style.display === 'none' ? 'none' : '';
        }
      }).observe(proxy, { attributes: true, attributeFilter: ['disabled','style'] });
    });

    // Text shims
    const textShims = {
      'turn-info':           'gw-turn-title',
      'dice-result-display': 'gw-result-num',
      'result-title':        'gw-res-title',
      'result-subtitle':     'gw-res-sub',
    };
    Object.entries(textShims).forEach(([oldId, newId]) => {
      const el = document.createElement('div');
      el.id = oldId;
      el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';
      document.body.appendChild(el);
      new MutationObserver(() => {
        const real = document.getElementById(newId);
        if (!real) return;
        real.textContent = el.textContent;
        if (el.style.color) real.style.color = el.style.color;
      }).observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
    });

    // Log shim
    const logShim = document.createElement('div');
    logShim.id = 'log-entries';
    logShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;overflow:hidden;';
    document.body.appendChild(logShim);
    new MutationObserver(() => {
      const inner = document.getElementById('gw-log-inner');
      if (!inner) return;
      inner.innerHTML = '';
      Array.from(logShim.children).forEach(child => {
        const div = document.createElement('div');
        div.className   = 'gw-le ' + child.className.replace('log-entry','').trim();
        div.textContent = child.textContent;
        inner.appendChild(div);
      });
    }).observe(logShim, { childList: true, subtree: true });

    // HP shims (unused by canvas renderer but needed to not throw)
    ['player-hp-bar','bot-hp-bar','player-hp-text','bot-hp-text'].forEach(id => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
      document.body.appendChild(el);
    });

    // Action modal shim
    const actionShim = document.createElement('div');
    actionShim.id = 'action-modal';
    actionShim.className = 'hidden';
    actionShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(actionShim);
    const gwAction = document.getElementById('gw-action-modal');
    new MutationObserver(() => {
      actionShim.classList.contains('hidden')
        ? gwAction.classList.add('gw-hide')
        : gwAction.classList.remove('gw-hide');
    }).observe(actionShim, { attributes: true, attributeFilter: ['class'] });

    // Result overlay shim
    const resultShim = document.createElement('div');
    resultShim.id = 'result-overlay';
    resultShim.className = 'hidden';
    resultShim.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;';
    document.body.appendChild(resultShim);
    const gwResult = document.getElementById('gw-result-overlay');
    new MutationObserver(() => {
      resultShim.classList.contains('hidden')
        ? gwResult.classList.add('gw-hide')
        : gwResult.classList.remove('gw-hide');
    }).observe(resultShim, { attributes: true, attributeFilter: ['class'] });

    document.getElementById('gw-restart').addEventListener('click', () => {
      gwResult.classList.add('gw-hide');
    });
  }

  // ── Canvas setup & loop ───────────────────────────────────────────
  function startLoop() {
    canvas = document.getElementById('gw-canvas');
    canvas.width  = CANVAS_W;
    canvas.height = CANVAS_H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);

    // Tile click & hover
    canvas.addEventListener('click',     onCanvasClick);
    // Hover removed — no tile hints

    let lastT = 0;
    function loop(ts = 0) {
      requestAnimationFrame(loop);
      const dt = Math.min((ts - lastT) / 1000, 0.05);
      lastT = ts;
      tick(dt);
      draw();
    }
    requestAnimationFrame(loop);
  }

  function scaleCanvas() {
    const wrap = document.getElementById('gw-board-wrap');
    if (!wrap || !canvas) return;
    const avW = wrap.clientWidth  - 20;
    const avH = wrap.clientHeight - 20;
    const sc  = Math.min(avW / CANVAS_W, avH / CANVAS_H, 1.5);
    canvas.style.width  = Math.floor(CANVAS_W * sc) + 'px';
    canvas.style.height = Math.floor(CANVAS_H * sc) + 'px';
  }

  // Convert canvas click → grid col/row (accounting for CSS scaling)
  function canvasToGrid(e) {
    const rect    = canvas.getBoundingClientRect();
    const scaleX  = CANVAS_W / rect.width;
    const scaleY  = CANVAS_H / rect.height;
    const px      = (e.clientX - rect.left) * scaleX;
    const py      = (e.clientY - rect.top)  * scaleY;
    const col     = Math.floor(px / CELL);
    const row     = Math.floor(py / CELL);
    if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null;
    return { col, row };
  }

  function onCanvasClick(e) {
    const tile = canvasToGrid(e);
    if (tile && tileClickCB) tileClickCB(tile.col, tile.row);
  }

  // onCanvasHover removed

  // ── Smooth animation state ────────────────────────────────────────
  const anim = {
    player: { x: 0,         y: 9*CELL, tx: 0,         ty: 9*CELL },
    bot:    { x: 9*CELL,    y: 0,      tx: 9*CELL,    ty: 0      },
  };

  function colRowToXY(col, row) { return { x: col*CELL, y: row*CELL }; }

  function tick(dt) {
    const spd = 10;
    for (const a of [anim.player, anim.bot]) {
      a.x += (a.tx - a.x) * Math.min(spd*dt, 1);
      a.y += (a.ty - a.y) * Math.min(spd*dt, 1);
    }
    for (let i = healFX.length-1; i >= 0; i--) {
      const p = healFX[i];
      p.x += p.vx; p.y += p.vy; p.vy -= 0.12;
      p.life -= dt * 1.6;
      if (p.life <= 0) healFX.splice(i, 1);
    }
    shakeX *= 0.82; shakeY *= 0.82;
    if (hitFX)   { hitFX.t   -= dt; if (hitFX.t   <= 0) hitFX   = null; }
    if (flashFX) { flashFX.t -= dt; if (flashFX.t <= 0) flashFX = null; }
  }

  // ── Draw ──────────────────────────────────────────────────────────
  function draw() {
    ctx.save();
    ctx.translate(Math.round(shakeX), Math.round(shakeY));

    // ── Floor tiles ──
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const x = col*CELL, y = row*CELL;
        if (IMG.tile_floor) {
          ctx.drawImage(IMG.tile_floor, x, y, CELL + 1, CELL + 1);
        } else {
          ctx.fillStyle = (col+row)%2===0 ? '#8a7a62' : '#7a6a52';
          ctx.fillRect(x, y, CELL + 1, CELL + 1);
        }
      }
    }

    // No reachable tile hints — player navigates freely

    // ── Path trail ──
    if (plannedPath.length > 0) {
      // Draw connecting lines between path steps
      ctx.save();
      ctx.strokeStyle = '#ffee44';
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      // Start from player origin
      const originX = anim.player.x + CELL/2;
      const originY = anim.player.y + CELL/2;
      ctx.moveTo(originX, originY);
      for (const step of plannedPath) {
        ctx.lineTo(step.col*CELL + CELL/2, step.row*CELL + CELL/2);
      }
      ctx.stroke();
      ctx.restore();

      // Draw numbered step markers on each path tile
      plannedPath.forEach((step, idx) => {
        const cx = step.col*CELL + CELL/2;
        const cy = step.row*CELL + CELL/2;
        const isLast = idx === plannedPath.length - 1;

        // Tile tint
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle   = isLast ? '#ffdd00' : '#ffe844';
        ctx.fillRect(step.col*CELL, step.row*CELL, CELL, CELL);
        ctx.restore();

        // Border
        ctx.save();
        ctx.strokeStyle = isLast ? '#ff8800' : '#ffdd00';
        ctx.lineWidth   = isLast ? 3 : 2;
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(step.col*CELL + 1, step.row*CELL + 1, CELL-2, CELL-2);
        ctx.restore();

        // Step number badge
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI*2);
        ctx.fillStyle   = isLast ? '#ff8800' : '#333300';
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.fillStyle   = '#fff';
        ctx.globalAlpha = 1;
        ctx.font        = 'bold 11px Arial,sans-serif';
        ctx.textAlign   = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(idx+1), cx, cy+1);
        ctx.restore();
      });
    }

    // ── Obstacles ──
    for (const [key, type] of Object.entries(blockedMap)) {
      const [col, row] = key.split(',').map(Number);
      const x = col*CELL, y = row*CELL;
      const img = type === 'crate' ? IMG.crate : IMG.bush;
      if (img) {
        const ar = img.naturalWidth / img.naturalHeight;
        const dh = CELL * 0.9;
        const dw = dh * ar;
        ctx.drawImage(img, x + (CELL-dw)/2, y + (CELL-dh)/2 + 2, dw, dh);
      } else {
        ctx.fillStyle = type === 'crate' ? '#8b5e2a' : '#2d7a3a';
        ctx.fillRect(x+8, y+8, CELL-16, CELL-16);
      }
    }

    // ── Characters ──
    drawChar('bot',    anim.bot.x,    anim.bot.y,    false);
    drawChar('player', anim.player.x, anim.player.y, true);

    // ── Heal particles ──
    for (const p of healFX) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life * 0.9);
      ctx.fillStyle   = '#50ff90';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4*Math.max(p.life, 0.1), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // ── Screen flash ──
    if (flashFX && flashFX.t > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(flashFX.t * 2.5, 0.38);
      ctx.fillStyle   = flashFX.color;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawChar(who, ax, ay, isPlayer) {
    const img   = isPlayer ? IMG.hero_sprite : IMG.enemy_sprite;
    const hp    = isPlayer ? playerHP : botHP;
    const isHit = hitFX && hitFX.who === who;
    const cx    = ax + CELL/2;

    if (img) {
      const drawW = CELL * 1.25;
      const drawH = drawW * (img.naturalHeight / img.naturalWidth);
      const dx    = cx - drawW/2;
      const dy    = ay + CELL - drawH + CELL*0.12;
      ctx.save();
      if (isHit && Math.floor(Date.now()/50) % 2 === 0) {
        ctx.filter = 'brightness(3) saturate(0.1)';
      }
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = isPlayer ? '#4a90e2' : '#c0392b';
      ctx.beginPath();
      ctx.arc(cx, ay+CELL/2, CELL*0.32, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // HP bubble
    const bx = cx, by = ay+5, br = 13;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI*2);
    ctx.fillStyle   = isPlayer ? '#2e72b8' : '#b82e2e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.fillStyle   = '#fff';
    ctx.font        = `bold ${hp >= 10 ? 9 : 11}px Arial,sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(hp), bx, by+1);
    ctx.restore();
  }

  // ── Public: positions ─────────────────────────────────────────────
  function setPlayerPos(col, row) {
    playerPos = { col, row };
    const p   = colRowToXY(col, row);
    anim.player.x = anim.player.tx = p.x;
    anim.player.y = anim.player.ty = p.y;
    syncStatPos();
  }
  function setBotPos(col, row) {
    botPos = { col, row };
    const p = colRowToXY(col, row);
    anim.bot.x = anim.bot.tx = p.x;
    anim.bot.y = anim.bot.ty = p.y;
    syncStatPos();
  }
  function syncStatPos() {
    const p1 = document.getElementById('gw-p1pos');
    const p2 = document.getElementById('gw-p2pos');
    if (p1) p1.textContent = `(${playerPos.col},${playerPos.row})`;
    if (p2) p2.textContent = `(${botPos.col},${botPos.row})`;
  }

  // ── Public: rebuild ───────────────────────────────────────────────
  function rebuildBoard(blocked) {
    blockedMap     = blocked;
    reachableTiles = [];
    plannedPath    = [];
    healFX  = []; hitFX = null; flashFX = null;
    shakeX  = 0;  shakeY = 0;
  }

  // ── Public: path-planning API ─────────────────────────────────────
  function showReachable(tiles) {
    reachableTiles = tiles || [];
  }
  function showPath(path) {
    plannedPath = path || [];
  }
  function clearPathUI() {
    reachableTiles = [];
    plannedPath    = [];
    hoveredTile    = null;
  }
  function setTileClickHandler(cb) {
    tileClickCB = cb;
  }

  // ── Public: animate move ──────────────────────────────────────────
  async function animateMove(who, tc, tr) {
    const a = who === 'player' ? anim.player : anim.bot;
    const p = colRowToXY(tc, tr);
    a.tx = p.x; a.ty = p.y;
    if (who === 'player') playerPos = { col: tc, row: tr };
    else                  botPos    = { col: tc, row: tr };
    syncStatPos();
    return sleep(330);
  }
  async function animatePlayerMoveTo(fc, fr, tc, tr) { return animateMove('player', tc, tr); }
  async function animateBotMoveTo(fc, fr, tc, tr)    { return animateMove('bot',    tc, tr); }

  // ── Public: attack ────────────────────────────────────────────────
  async function animateAttack(isPlayer) {
    const att    = isPlayer ? anim.player : anim.bot;
    const def    = isPlayer ? anim.bot    : anim.player;
    const defWho = isPlayer ? 'bot' : 'player';
    const ox = att.tx, oy = att.ty;
    att.tx = ox + (def.tx-ox)*0.38;
    att.ty = oy + (def.ty-oy)*0.38;
    await sleep(140);
    flashFX = { color: '#e00', t: 0.22 };
    shakeX  = 7; shakeY = 5;
    hitFX   = { who: defWho, t: 0.5 };
    const rp = colRowToXY(defWho==='player' ? playerPos.col : botPos.col,
                           defWho==='player' ? playerPos.row : botPos.row);
    def.tx = rp.x + (def.tx-ox)*0.1;
    def.ty = rp.y + (def.ty-oy)*0.1;
    await sleep(80);
    def.tx = rp.x; def.ty = rp.y;
    att.tx = ox; att.ty = oy;
    await sleep(170);
  }

  // ── Public: heal ─────────────────────────────────────────────────
  async function animateHeal(isPlayer) {
    const a = isPlayer ? anim.player : anim.bot;
    flashFX = { color: '#0e0', t: 0.22 };
    const cx = a.tx + CELL/2, cy = a.ty + CELL/2;
    for (let i = 0; i < 16; i++) {
      healFX.push({ x:cx, y:cy, vx:(Math.random()-.5)*3, vy:-(1.5+Math.random()*2), life:1 });
    }
    await sleep(420);
  }

  // ── Public: dice roll animation ───────────────────────────────────
  async function animateDiceRoll(result) {
    const numEl   = document.getElementById('gw-result-num');
    const titleEl = document.getElementById('gw-turn-title');
    const metaEl  = document.getElementById('gw-turn-meta');
    const dur     = 900;
    const start   = performance.now();
    await new Promise(resolve => {
      function tick(ts) {
        const p = Math.min((ts-start)/dur, 1);
        if (numEl)   numEl.textContent   = p < 1 ? Math.ceil(Math.random()*6) : result;
        if (titleEl) titleEl.textContent = p < 1 ? 'Rolling…' : 'Player Turn';
        p < 1 ? requestAnimationFrame(tick) : resolve();
      }
      requestAnimationFrame(tick);
    });
    if (metaEl) metaEl.textContent = `Dice: ${result}`;
    const d1 = document.getElementById('gw-p1die');
    const d2 = document.getElementById('gw-p2die');
    if (d1) d1.textContent = `Die ${result}`;
    if (d2) d2.textContent = `Die ${result}`;
    await sleep(200);
  }

  // ── Public: death ─────────────────────────────────────────────────
  async function animateDeath(isPlayer) {
    flashFX = { color: '#f00', t: 1.0 };
    await sleep(700);
  }

  // ── Public: HP update ─────────────────────────────────────────────
  function updateHP(pHP, pMax, bHP, bMax) {
    playerHP = pHP; playerMax = pMax;
    botHP    = bHP; botMax    = bMax;
    const h1 = document.getElementById('gw-p1hp');
    const h2 = document.getElementById('gw-p2hp');
    if (h1) h1.textContent = pHP;
    if (h2) h2.textContent = bHP;
  }

  function triggerFlash(type) { flashFX = { color: type==='red'?'#e00':'#0e0', t:0.22 }; }
  function cameraShake()      { shakeX = 7; shakeY = 5; }
  function sleep(ms)          { return new Promise(r => setTimeout(r, ms)); }

  // ── Public API ────────────────────────────────────────────────────
  return {
    _initialized: false,
    init: async (blocked) => { await init(blocked); ThreeScene._initialized = true; },
    rebuildBoard,
    setPlayerPos, setBotPos,
    animatePlayerMoveTo, animateBotMoveTo,
    animateAttack, animateHeal,
    animateDiceRoll, animateDeath,
    updateHP, triggerFlash, cameraShake,
    // Path-planning
    showReachable, showPath, clearPathUI, setTileClickHandler,
  };
})();
