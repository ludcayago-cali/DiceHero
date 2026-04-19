/**
 * threeScene.js — 3D rendering layer for Dice Corner Duel
 * Handles: scene, camera, lighting, tiles, characters, dice, animations
 */

const ThreeScene = (() => {

  // ── Constants ──
  const GRID_SIZE   = 10;
  const TILE_SIZE   = 1;
  const TILE_GAP    = 0.04;
  const TILE_H      = 0.12;
  const UNIT        = TILE_SIZE + TILE_GAP;
  const CAM_HEIGHT  = 11;
  const CAM_TILT    = 7;

  // ── State ──
  let renderer, scene, camera, clock;
  let tileGroup, objectGroup, charGroup, fxGroup;
  let playerMesh, botMesh;
  let diceMesh, diceGroup;
  let playerLabel, botLabel;
  let animQueue = [];
  let shakeTime = 0;
  let camBase;
  let healParticles = [];
  let hitFlashTime = 0;
  let flashOverlay;

  // ── Color palette ──
  const C = {
    floor1:    0x3a3250,
    floor2:    0x2c2440,
    floorEdge: 0x1a1528,
    crate:     0x8b5e2a,
    crateTop:  0xa07030,
    bush:      0x2d7a3a,
    bushDark:  0x1e5428,
    player:    0x3a8cff,
    playerAcc: 0xffd700,
    bot:       0xe04444,
    botAcc:    0xff8800,
    gold:      0xc9a84c,
    white:     0xffffff,
  };

  // ── Init ──────────────────────────────────────────────────────────
  function init(blockedMap) {
    // Flash overlay
    flashOverlay = document.createElement('div');
    flashOverlay.id = 'flash-overlay';
    document.body.appendChild(flashOverlay);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setClearColor(0x08060f);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08060f, 0.04);

    // Clock
    clock = new THREE.Clock();

    // Camera — isometric-ish top-down
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    const cx = (GRID_SIZE - 1) * UNIT * 0.5;
    const cz = (GRID_SIZE - 1) * UNIT * 0.5;
    camBase = new THREE.Vector3(cx, CAM_HEIGHT, cz + CAM_TILT);
    camera.position.copy(camBase);
    camera.lookAt(cx, 0, cz);

    // Groups
    tileGroup   = new THREE.Group(); scene.add(tileGroup);
    objectGroup = new THREE.Group(); scene.add(objectGroup);
    charGroup   = new THREE.Group(); scene.add(charGroup);
    fxGroup     = new THREE.Group(); scene.add(fxGroup);

    // Lighting
    setupLighting(cx, cz);

    // Build board
    buildBoard(blockedMap);

    // Build characters
    playerMesh = buildCharacter(C.player, C.playerAcc);
    botMesh    = buildCharacter(C.bot,    C.botAcc);
    charGroup.add(playerMesh);
    charGroup.add(botMesh);

    // Labels
    playerLabel = makeLabel('HERO', '#6af');
    botLabel    = makeLabel('ENEMY', '#f66');
    scene.add(playerLabel);
    scene.add(botLabel);

    // Dice
    diceGroup = new THREE.Group();
    diceMesh  = buildDice();
    diceGroup.add(diceMesh);
    diceGroup.position.set(cx, 3.5, cz - 2);
    diceGroup.visible = false;
    scene.add(diceGroup);

    // Resize
    window.addEventListener('resize', onResize);

    // Start loop
    animate();
  }

  // ── Lighting ──────────────────────────────────────────────────────
  function setupLighting(cx, cz) {
    const ambient = new THREE.AmbientLight(0x2a2050, 0.9);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffe8c0, 1.6);
    dir.position.set(cx - 4, 12, cz - 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far  = 40;
    dir.shadow.camera.left   = -12;
    dir.shadow.camera.right  =  12;
    dir.shadow.camera.top    =  12;
    dir.shadow.camera.bottom = -12;
    dir.shadow.bias = -0.001;
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0x4060ff, 0.35);
    fill.position.set(cx + 6, 5, cz + 6);
    scene.add(fill);

    const rim = new THREE.PointLight(0xff6030, 0.5, 20);
    rim.position.set(cx + 5, 4, cz - 5);
    scene.add(rim);
  }

  // ── Board ─────────────────────────────────────────────────────────
  function buildBoard(blockedMap) {
    tileGroup.clear();
    objectGroup.clear();

    // Ground plane (dark base under board)
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050408, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((GRID_SIZE-1)*UNIT*0.5, -0.02, (GRID_SIZE-1)*UNIT*0.5);
    ground.receiveShadow = true;
    scene.add(ground);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const key = `${col},${row}`;
        const blocked = blockedMap[key];

        // Tile
        const checker = (row + col) % 2 === 0;
        const tileColor = checker ? C.floor1 : C.floor2;
        const tileGeo = new THREE.BoxGeometry(TILE_SIZE - 0.02, TILE_H, TILE_SIZE - 0.02);
        const tileMat = new THREE.MeshStandardMaterial({
          color: tileColor,
          roughness: 0.85,
          metalness: 0.08,
        });
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(col * UNIT, TILE_H / 2, row * UNIT);
        tile.receiveShadow = true;
        tile.castShadow = false;
        tileGroup.add(tile);

        // Edge trim
        const edgeGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_H * 0.3, TILE_SIZE);
        const edgeMat = new THREE.MeshStandardMaterial({ color: C.floorEdge, roughness: 1 });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.set(col * UNIT, TILE_H * 0.15, row * UNIT);
        tileGroup.add(edge);

        // Blocked objects
        if (blocked === 'crate') {
          buildCrate(col, row);
        } else if (blocked === 'bush') {
          buildBush(col, row);
        }
      }
    }

    // Board border walls
    buildBorderWalls();
  }

  function buildBorderWalls() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1228, roughness: 0.9 });
    const wallH = 0.5;
    const span = GRID_SIZE * UNIT;
    const center = (GRID_SIZE - 1) * UNIT * 0.5;
    const wallConfigs = [
      { sx: span + 0.2, sz: 0.2, px: center, pz: -0.5 },
      { sx: span + 0.2, sz: 0.2, px: center, pz: GRID_SIZE * UNIT - 0.5 },
      { sx: 0.2, sz: span, px: -0.5, pz: center },
      { sx: 0.2, sz: span, px: GRID_SIZE * UNIT - 0.5, pz: center },
    ];
    wallConfigs.forEach(({ sx, sz, px, pz }) => {
      const geo = new THREE.BoxGeometry(sx, wallH, sz);
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(px, wallH / 2 + TILE_H, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });
  }

  function buildCrate(col, row) {
    const group = new THREE.Group();
    // Main box
    const geo = new THREE.BoxGeometry(0.72, 0.68, 0.72);
    const mat = new THREE.MeshStandardMaterial({ color: C.crate, roughness: 0.9, metalness: 0.05 });
    const box = new THREE.Mesh(geo, mat);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    // Top cap
    const capGeo = new THREE.BoxGeometry(0.74, 0.06, 0.74);
    const capMat = new THREE.MeshStandardMaterial({ color: C.crateTop, roughness: 0.85 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.37;
    group.add(cap);
    // Wood plank lines (edges)
    [-0.2, 0.2].forEach(offset => {
      const plankGeo = new THREE.BoxGeometry(0.02, 0.7, 0.74);
      const plankMat = new THREE.MeshStandardMaterial({ color: 0x5c3a18, roughness: 1 });
      const p = new THREE.Mesh(plankGeo, plankMat);
      p.position.x = offset;
      group.add(p);
      const p2 = new THREE.Mesh(plankGeo, plankMat);
      p2.rotation.y = Math.PI / 2;
      p2.position.z = offset;
      group.add(p2);
    });
    group.position.set(col * UNIT, TILE_H + 0.34, row * UNIT);
    objectGroup.add(group);
  }

  function buildBush(col, row) {
    const group = new THREE.Group();
    const bushColor = C.bush;
    // Multiple spheres for bushy look
    const configs = [
      { x: 0,    y: 0.3,  z: 0,    r: 0.34 },
      { x: 0.2,  y: 0.22, z: 0.1,  r: 0.26 },
      { x: -0.2, y: 0.2,  z: -0.1, r: 0.24 },
      { x: 0.05, y: 0.45, z: 0.05, r: 0.22 },
    ];
    configs.forEach(({ x, y, z, r }) => {
      const geo = new THREE.SphereGeometry(r, 7, 7);
      const mat = new THREE.MeshStandardMaterial({
        color: (Math.random() > 0.5) ? bushColor : C.bushDark,
        roughness: 0.95, metalness: 0,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.set(x, y, z);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      group.add(sphere);
    });
    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.25, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x3d2200, roughness: 1 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.12;
    group.add(stem);

    group.position.set(col * UNIT, TILE_H, row * UNIT);
    objectGroup.add(group);
  }

  // ── Characters ────────────────────────────────────────────────────
  function buildCharacter(bodyColor, accentColor) {
    const group = new THREE.Group();

    // Body (capsule approximation: cylinder + 2 spheres)
    const bodyGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.5, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.22, 10, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe8c87a, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.82;
    head.castShadow = true;
    group.add(head);

    // Helmet/hat
    const helmGeo = new THREE.ConeGeometry(0.24, 0.22, 8);
    const helmMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.5 });
    const helm = new THREE.Mesh(helmGeo, helmMat);
    helm.position.y = 1.03;
    group.add(helm);

    // Brim
    const brimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10);
    const brimMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.5 });
    const brim = new THREE.Mesh(brimGeo, brimMat);
    brim.position.y = 0.94;
    group.add(brim);

    // Legs (two cylinders)
    [-0.1, 0.1].forEach((dx, i) => {
      const legGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.28, 8);
      const legMat = new THREE.MeshStandardMaterial({ color: i === 0 ? 0x223366 : 0x1e2d5a, roughness: 0.8 });
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(dx, 0.14, 0);
      leg.castShadow = true;
      leg.name = `leg${i}`;
      group.add(leg);
    });

    // Weapon stub
    const wpnGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6);
    const wpnMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });
    const wpn = new THREE.Mesh(wpnGeo, wpnMat);
    wpn.rotation.z = Math.PI / 6;
    wpn.position.set(0.3, 0.55, 0);
    wpn.name = 'weapon';
    group.add(wpn);

    // Shadow circle
    const shadowGeo = new THREE.CircleGeometry(0.28, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const shadowCircle = new THREE.Mesh(shadowGeo, shadowMat);
    shadowCircle.rotation.x = -Math.PI / 2;
    shadowCircle.position.y = TILE_H + 0.01;
    shadowCircle.name = 'shadow';
    group.add(shadowCircle);

    group.userData = {
      idleT:     Math.random() * Math.PI * 2,
      walkT:     0,
      isWalking: false,
      isHit:     false,
      hitT:      0,
      isDead:    false,
    };

    return group;
  }

  // ── Labels (billboard) ────────────────────────────────────────────
  function makeLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Cinzel, serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    return sprite;
  }

  // ── Dice ──────────────────────────────────────────────────────────
  function buildDice() {
    const geo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    // Create face materials (6 faces with dots via canvas)
    const materials = [1,2,3,4,5,6].map(n => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      // White background, rounded
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#ccc';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 124, 124);
      // Dots
      const dots = getDotPositions(n);
      ctx.fillStyle = '#111';
      dots.forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(dx, dy, 10, 0, Math.PI * 2);
        ctx.fill();
      });
      const tex = new THREE.CanvasTexture(canvas);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1 });
    });
    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = true;
    return mesh;
  }

  function getDotPositions(n) {
    const c = 64, m = 32;
    const maps = {
      1: [[c, c]],
      2: [[c - m, c - m], [c + m, c + m]],
      3: [[c - m, c - m], [c, c], [c + m, c + m]],
      4: [[c - m, c - m], [c + m, c - m], [c - m, c + m], [c + m, c + m]],
      5: [[c - m, c - m], [c + m, c - m], [c, c], [c - m, c + m], [c + m, c + m]],
      6: [[c - m, c - m], [c + m, c - m], [c - m, c], [c + m, c], [c - m, c + m], [c + m, c + m]],
    };
    return maps[n] || [];
  }

  // ── Position helpers ──────────────────────────────────────────────
  function tileToWorld(col, row) {
    return new THREE.Vector3(col * UNIT, TILE_H + 0.01, row * UNIT);
  }

  function placeAt(mesh, col, row, yOffset = 0) {
    const pos = tileToWorld(col, row);
    mesh.position.set(pos.x, pos.y + yOffset, pos.z);
  }

  // ── Public API: place characters immediately ──────────────────────
  function setPlayerPos(col, row) {
    placeAt(playerMesh, col, row);
  }

  function setBotPos(col, row) {
    placeAt(botMesh, col, row);
  }

  // ── Animation queue ───────────────────────────────────────────────
  function enqueueAnim(anim) {
    animQueue.push(anim);
  }

  function animMoveTo(mesh, fromCol, fromRow, toCol, toRow, duration = 0.28) {
    return new Promise(resolve => {
      const start = tileToWorld(fromCol, fromRow);
      const end   = tileToWorld(toCol,   toRow);
      const dir = new THREE.Vector3().subVectors(end, start).normalize();
      // Face direction
      if (dir.x !== 0 || dir.z !== 0) {
        mesh.rotation.y = Math.atan2(dir.x, dir.z);
      }
      mesh.userData.isWalking = true;
      const t0 = clock.getElapsedTime();
      function tick() {
        const dt = (clock.getElapsedTime() - t0) / duration;
        const p = Math.min(dt, 1);
        // Ease in-out + arc
        const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
        mesh.position.lerpVectors(start, end, ease);
        mesh.position.y = start.y + Math.sin(p * Math.PI) * 0.25;
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          mesh.position.copy(end);
          mesh.userData.isWalking = false;
          resolve();
        }
      }
      tick();
    });
  }

  async function animatePlayerMoveTo(fromCol, fromRow, toCol, toRow) {
    return animMoveTo(playerMesh, fromCol, fromRow, toCol, toRow);
  }

  async function animateBotMoveTo(fromCol, fromRow, toCol, toRow) {
    return animMoveTo(botMesh, fromCol, fromRow, toCol, toRow);
  }

  // ── Attack animation ──────────────────────────────────────────────
  async function animateAttack(isPlayer) {
    const attacker = isPlayer ? playerMesh : botMesh;
    const defender = isPlayer ? botMesh   : playerMesh;
    const startPos  = attacker.position.clone();
    const targetPos = defender.position.clone();
    const lunge = new THREE.Vector3().lerpVectors(startPos, targetPos, 0.35);

    // Lunge forward
    await tweenPos(attacker, startPos, lunge, 0.12);
    // Flash
    triggerFlash('red');
    cameraShake(0.25);
    // Knockback on defender
    const knockDir = new THREE.Vector3().subVectors(targetPos, startPos).normalize().multiplyScalar(0.15);
    const knocked = targetPos.clone().add(knockDir);
    await Promise.all([
      tweenPos(attacker, lunge, startPos, 0.14),
      tweenPos(defender, targetPos, knocked, 0.08).then(() => tweenPos(defender, knocked, targetPos, 0.1))
    ]);
    defender.userData.isHit = true;
    defender.userData.hitT  = 0.4;
  }

  async function animateHeal(isPlayer) {
    const target = isPlayer ? playerMesh : botMesh;
    triggerFlash('green');
    spawnHealParticles(target.position.clone());
    // Bob up and down
    const base = target.position.clone();
    const up   = base.clone(); up.y += 0.25;
    await tweenPos(target, base, up, 0.2);
    await tweenPos(target, up, base, 0.2);
  }

  function tweenPos(mesh, from, to, duration) {
    return new Promise(resolve => {
      const t0 = clock.getElapsedTime();
      function tick() {
        const p = Math.min((clock.getElapsedTime() - t0) / duration, 1);
        mesh.position.lerpVectors(from, to, p);
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      }
      tick();
    });
  }

  // ── Hit flash (DOM overlay) ───────────────────────────────────────
  function triggerFlash(type) {
    flashOverlay.className = '';
    flashOverlay.style.opacity = '1';
    flashOverlay.classList.add(type === 'red' ? 'flash-red' : 'flash-green');
    setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
  }

  // ── Camera shake ──────────────────────────────────────────────────
  function cameraShake(duration) {
    shakeTime = duration;
  }

  // ── Heal particles ────────────────────────────────────────────────
  function spawnHealParticles(pos) {
    for (let i = 0; i < 18; i++) {
      const geo = new THREE.SphereGeometry(0.045, 5, 5);
      const mat = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true });
      const p   = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      p.position.y += 0.3;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.04,
        0.03 + Math.random() * 0.04,
        (Math.random() - 0.5) * 0.04
      );
      p.userData = { vel, life: 1.0 };
      fxGroup.add(p);
      healParticles.push(p);
    }
  }

  // ── Dice roll animation ───────────────────────────────────────────
  async function animateDiceRoll(result) {
    diceGroup.visible = true;
    const cx = (GRID_SIZE - 1) * UNIT * 0.5;
    const cz = (GRID_SIZE - 1) * UNIT * 0.5;
    diceGroup.position.set(cx, 2.8, cz - 1.5);
    diceMesh.rotation.set(0, 0, 0);

    return new Promise(resolve => {
      const totalTime = 1.2;
      const t0 = clock.getElapsedTime();
      const startY = 2.8;
      function tick() {
        const dt = clock.getElapsedTime() - t0;
        const p  = Math.min(dt / totalTime, 1);
        // Spin + bounce
        diceMesh.rotation.x += 0.18;
        diceMesh.rotation.y += 0.13;
        diceMesh.rotation.z += 0.07;
        const bounce = Math.abs(Math.sin(p * Math.PI * 4)) * (1 - p) * 0.8;
        diceGroup.position.y = startY + bounce;
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          // Snap to face showing result (result 1–6)
          alignDiceToResult(result);
          diceGroup.position.y = startY;
          setTimeout(() => {
            diceGroup.visible = false;
            resolve();
          }, 600);
        }
      }
      tick();
    });
  }

  function alignDiceToResult(n) {
    // Each face is a material index (0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back)
    // We just set a rotation that makes it "look" settled
    const rots = {
      1: [0, 0, 0],
      2: [0, Math.PI / 2, 0],
      3: [-Math.PI / 2, 0, 0],
      4: [Math.PI / 2, 0, 0],
      5: [0, -Math.PI / 2, 0],
      6: [Math.PI, 0, 0],
    };
    const r = rots[n] || [0, 0, 0];
    diceMesh.rotation.set(r[0], r[1], r[2]);
  }

  // ── Death animation ───────────────────────────────────────────────
  async function animateDeath(isPlayer) {
    const mesh = isPlayer ? playerMesh : botMesh;
    mesh.userData.isDead = true;
    const base = mesh.position.clone();
    const fallen = base.clone();
    fallen.y -= 0.3;
    // Fall and fade
    await tweenPos(mesh, base, fallen, 0.4);
    let opacity = 1;
    await new Promise(resolve => {
      const t0 = clock.getElapsedTime();
      function tick() {
        const p = Math.min((clock.getElapsedTime() - t0) / 0.6, 1);
        opacity = 1 - p;
        mesh.traverse(c => {
          if (c.material) c.material.transparent = true, c.material.opacity = opacity;
        });
        mesh.rotation.z = p * Math.PI / 2;
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      }
      tick();
    });
  }

  // ── HP bar update ─────────────────────────────────────────────────
  function updateHP(playerHP, playerMax, botHP, botMax) {
    const pPct = (playerHP / playerMax) * 100;
    const bPct = (botHP   / botMax  ) * 100;
    document.getElementById('player-hp-bar').style.width  = pPct + '%';
    document.getElementById('bot-hp-bar').style.width     = bPct + '%';
    document.getElementById('player-hp-text').textContent = `HP: ${playerHP}/${playerMax}`;
    document.getElementById('bot-hp-text').textContent    = `HP: ${botHP}/${botMax}`;
  }

  // ── Main animate loop ─────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Character animations
    animateChar(playerMesh, elapsed, dt);
    animateChar(botMesh, elapsed, dt);

    // Update labels (billboard)
    updateLabel(playerLabel, playerMesh.position);
    updateLabel(botLabel, botMesh.position);

    // Heal particles
    for (let i = healParticles.length - 1; i >= 0; i--) {
      const p = healParticles[i];
      p.userData.life -= dt * 1.6;
      if (p.userData.life <= 0) {
        fxGroup.remove(p);
        healParticles.splice(i, 1);
        continue;
      }
      p.position.add(p.userData.vel);
      p.userData.vel.y -= 0.002;
      p.material.opacity = p.userData.life;
      p.scale.setScalar(p.userData.life);
    }

    // Camera shake
    if (shakeTime > 0) {
      shakeTime -= dt;
      const s = Math.min(shakeTime, 0.08) * 12;
      camera.position.set(
        camBase.x + (Math.random() - 0.5) * s,
        camBase.y + (Math.random() - 0.5) * s * 0.5,
        camBase.z + (Math.random() - 0.5) * s
      );
    } else {
      camera.position.lerp(camBase, 0.15);
    }

    renderer.render(scene, camera);
  }

  function animateChar(mesh, elapsed, dt) {
    if (!mesh) return;
    const ud = mesh.userData;
    if (ud.isDead) return;

    // Idle bob
    if (!ud.isWalking) {
      ud.idleT += dt * 1.8;
      mesh.position.y = mesh.position.y + (Math.sin(ud.idleT) * 0.006);
      // Subtle weapon sway
      const wpn = mesh.getObjectByName('weapon');
      if (wpn) wpn.rotation.z = Math.PI / 6 + Math.sin(ud.idleT * 0.7) * 0.08;
    }

    // Walk bob legs
    if (ud.isWalking) {
      ud.walkT += dt * 8;
      const leg0 = mesh.getObjectByName('leg0');
      const leg1 = mesh.getObjectByName('leg1');
      if (leg0) leg0.rotation.x =  Math.sin(ud.walkT) * 0.4;
      if (leg1) leg1.rotation.x = -Math.sin(ud.walkT) * 0.4;
    } else {
      const leg0 = mesh.getObjectByName('leg0');
      const leg1 = mesh.getObjectByName('leg1');
      if (leg0) leg0.rotation.x *= 0.85;
      if (leg1) leg1.rotation.x *= 0.85;
    }

    // Hit flash
    if (ud.isHit) {
      ud.hitT -= dt;
      const flash = Math.sin(ud.hitT * 40) > 0;
      mesh.traverse(c => {
        if (c.isMesh && c.name !== 'shadow') {
          c.material.emissive = flash
            ? new THREE.Color(0.8, 0.1, 0.1)
            : new THREE.Color(0, 0, 0);
        }
      });
      if (ud.hitT <= 0) {
        ud.isHit = false;
        mesh.traverse(c => {
          if (c.isMesh) c.material.emissive = new THREE.Color(0, 0, 0);
        });
      }
    }
  }

  function updateLabel(sprite, charPos) {
    sprite.position.set(charPos.x, charPos.y + 1.5, charPos.z);
  }

  // ── Resize ────────────────────────────────────────────────────────
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ── Rebuild board (for restart) ───────────────────────────────────
  function rebuildBoard(blockedMap) {
    buildBoard(blockedMap);
    // Reset characters
    charGroup.clear();
    playerMesh = buildCharacter(C.player, C.playerAcc);
    botMesh    = buildCharacter(C.bot,    C.botAcc);
    charGroup.add(playerMesh);
    charGroup.add(botMesh);
    // Reset labels
    scene.remove(playerLabel);
    scene.remove(botLabel);
    playerLabel = makeLabel('HERO',  '#6af');
    botLabel    = makeLabel('ENEMY', '#f66');
    scene.add(playerLabel);
    scene.add(botLabel);
    // Clear particles
    healParticles.forEach(p => fxGroup.remove(p));
    healParticles = [];
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    init,
    rebuildBoard,
    setPlayerPos,
    setBotPos,
    animatePlayerMoveTo,
    animateBotMoveTo,
    animateAttack,
    animateHeal,
    animateDiceRoll,
    animateDeath,
    updateHP,
    triggerFlash,
    cameraShake,
  };

})();
