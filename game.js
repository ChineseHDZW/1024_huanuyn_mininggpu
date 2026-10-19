/* =========================================================
   大肥鱼的狂野矿卡  —  1024 程序员节参赛作品
   纯原生 Canvas 2D，零依赖，双击 index.html 即可运行
   ========================================================= */
(() => {
  'use strict';

  // ---------------- 基础工具 ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
  const rndInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  // ---------------- 画布与缩放 ----------------
  const W = 1280, H = 720;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  let scale = 1, offX = 0, offY = 0, dpr = 1;

  function resize() {
    const cw = window.innerWidth, ch = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    scale = Math.min(cw / W, ch / H);
    offX = (cw - W * scale) / 2;
    offY = (ch - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- 音效（WebAudio 程序化合成，零素材） ----------------
  const AC = { ctx: null, master: null, muted: false, lastShot: 0 };

  function initAudio() {
    if (AC.ctx) { if (AC.ctx.state === 'suspended') AC.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC.ctx = new Ctx();
    AC.master = AC.ctx.createGain();
    AC.master.gain.value = 0.20;
    AC.master.connect(AC.ctx.destination);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!AC.ctx || AC.muted) return;
    const t = AC.ctx.currentTime;
    const o = AC.ctx.createOscillator();
    const g = AC.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol === undefined ? 0.25 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(AC.master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!AC.ctx || AC.muted) return;
    const t = AC.ctx.currentTime;
    const len = Math.max(1, Math.floor(AC.ctx.sampleRate * dur));
    const buf = AC.ctx.createBuffer(1, len, AC.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = AC.ctx.createBufferSource();
    src.buffer = buf;
    const f = AC.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1400;
    const g = AC.ctx.createGain();
    g.gain.value = vol === undefined ? 0.18 : vol;
    src.connect(f); f.connect(g); g.connect(AC.master);
    src.start(t);
  }

  // ---------------- 输入 ----------------
  const keys = Object.create(null);
  const mouse = { x: W / 2, y: H / 2, down: false };

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyR') game.restart();
    if (e.code === 'KeyM') { AC.muted = !AC.muted; }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - offX) / scale,
      y: (clientY - r.top - offY) / scale,
    };
  }
  canvas.addEventListener('mousemove', (e) => {
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    mouse.down = true;
    const p = toLogical(e.clientX, e.clientY);
    mouse.x = p.x; mouse.y = p.y;
    game.click(p.x, p.y);
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  // ---------------- 触控（移动端） ----------------
  const touch = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0, mag: 0 };

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();
    const t = e.changedTouches[0];
    const p = toLogical(t.clientX, t.clientY);
    if (G.state !== 'playing') {
      game.click(p.x, p.y);
      return;
    }
    touch.active = true;
    touch.id = t.identifier;
    touch.ox = p.x; touch.oy = p.y;
    touch.x = p.x; touch.y = p.y;
    touch.dx = 0; touch.dy = 0; touch.mag = 0;
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touch.id) continue;
      const p = toLogical(t.clientX, t.clientY);
      touch.x = p.x; touch.y = p.y;
      const dx = p.x - touch.ox, dy = p.y - touch.oy;
      const len = Math.hypot(dx, dy);
      const dead = 12;
      if (len <= dead) { touch.dx = 0; touch.dy = 0; touch.mag = 0; }
      else {
        touch.mag = Math.min(1, (len - dead) / 64);
        touch.dx = dx / len;
        touch.dy = dy / len;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) {
        touch.active = false; touch.dx = 0; touch.dy = 0; touch.mag = 0;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchcancel', () => {
    touch.active = false; touch.dx = 0; touch.dy = 0; touch.mag = 0;
  }, { passive: false });

  // ---------------- 数据表 ----------------
  // CPU：决定普攻的射速、伤害、弹道数
  const CPUS = [
    { name: '赛扬 G5905',       tag: '亮机专用',       dmg: 12, interval: 0.34,  count: 1, pierce: 0, spread: 0,    cost: 0 },
    { name: '奔腾 G6400',       tag: '办公够用',       dmg: 15, interval: 0.30,  count: 1, pierce: 0, spread: 0,    cost: 55 },
    { name: '酷睿 i3-12100',    tag: '四核起步',       dmg: 18, interval: 0.27,  count: 1, pierce: 1, spread: 0,    cost: 120 },
    { name: '酷睿 i5-12400',    tag: '平民六核',       dmg: 22, interval: 0.24,  count: 1, pierce: 1, spread: 0,    cost: 220 },
    { name: '酷睿 i7-13700K',   tag: '能上高频',       dmg: 27, interval: 0.20,  count: 1, pierce: 1, spread: 0,    cost: 380 },
    { name: '酷睿 i9-14900K',   tag: '电压拉满',       dmg: 24, interval: 0.185, count: 2, pierce: 1, spread: 0.10, cost: 600 },
    { name: '线程撕裂者 7995WX', tag: '核心数就是正义', dmg: 27, interval: 0.15,  count: 3, pierce: 2, spread: 0.14, cost: 900 },
    { name: '至强 Platinum 8380', tag: '服务器退役',    dmg: 30, interval: 0.125, count: 4, pierce: 2, spread: 0.16, cost: 1400 },
  ];

  // 显卡：决定技能
  const GPUS = [
    { name: '核显 UHD 630', tag: '能亮就算赢',         skill: null,      mana: 0,   cd: 0,    cost: 0,    color: '#6b7a90' },
    { name: 'RX 580 8G',    tag: '无敌矿渣，战未来',   skill: 'storm',   mana: 30,  cd: 5.0,  cost: 90,   color: '#ff5a5a' },
    { name: 'GTX 1080 Ti',  tag: '一代神卡，死不退休', skill: 'laser',   mana: 35,  cd: 4.5,  cost: 190,  color: '#7dff9b' },
    { name: 'RTX 3060 12G', tag: '平民之光，显存管够', skill: 'storm',   mana: 36,  cd: 4.6,  cost: 320,  color: '#9fe0ff' },
    { name: 'RTX 3080',     tag: '传奇矿场老将',       skill: 'boost',   mana: 40,  cd: 6.0,  cost: 480,  color: '#ffd166' },
    { name: 'RTX 4070',     tag: '能效比刺客',         skill: 'precise', mana: 42,  cd: 5.2,  cost: 680,  color: '#a5ffb0' },
    { name: 'RTX 4090',     tag: '别叫它显卡，叫灭火器', skill: 'flame',  mana: 60,  cd: 8.0,  cost: 950,  color: '#ff8a3d' },
    { name: 'RTX 5050',     tag: '老黄刀法精准',       skill: 'laser',   mana: 50,  cd: 3.8,  cost: 1300, color: '#9b8cff' },
    { name: 'GTX 690',      tag: '战术核显卡',         skill: 'nuke',    mana: 100, cd: 20.0, cost: 2000, color: '#ff3df0' },
  ];

  // 内存：蓝上限与回蓝
  const RAMS = [
    { name: 'DDR4 8G 2666',   maxMana: 100, regen: 7,  cost: 0 },
    { name: 'DDR4 16G 3200',  maxMana: 145, regen: 10, cost: 65 },
    { name: 'DDR4 32G 3600',  maxMana: 175, regen: 12, cost: 140 },
    { name: 'DDR5 32G 6000',  maxMana: 210, regen: 15, cost: 250 },
    { name: 'DDR5 64G 7200',  maxMana: 270, regen: 19, cost: 420 },
    { name: 'DDR5 128G ECC',  maxMana: 340, regen: 24, cost: 650 },
    { name: 'DDR5 256G ECC',  maxMana: 430, regen: 30, cost: 950 },
  ];

  const SKILL_NAMES = {
    storm: '矿渣风暴', laser: '神卡激光', boost: '风扇全开',
    flame: '灭火器', precise: '精准刀法', nuke: '双芯核弹',
  };

  const ENEMY_TYPES = {
    worm:   { hp: 13, speed: 104, dmg: 9,  r: 17, color: '#6fe3ff', gold: 2,  score: 1 },
    trojan: { hp: 10, speed: 165, dmg: 7,  r: 16, color: '#ff7bd5', gold: 3,  score: 1 },
    leak:   { hp: 40, speed: 64,  dmg: 16, r: 24, color: '#a98cff', gold: 5, score: 2 },
    boss:   { hp: 5000, speed: 104, dmg: 22, r: 58, color: '#ff3b3b', gold: 300, score: 50 },
  };

  // ---------------- 贴图资源 ----------------
  const ASSETS = {};
  function loadAsset(key, src) {
    const img = new Image();
    img.src = src;
    ASSETS[key] = img;
  }
  loadAsset('fish', 'assets/fish_idle.png');
  loadAsset('fishA', 'assets/fish_walkA.png');
  loadAsset('fishB', 'assets/fish_walkB.png');
  loadAsset('fishCast', 'assets/fish_cast.png');
  loadAsset('worm', 'assets/mob_worm.png');
  loadAsset('trojan', 'assets/mob_trojan.png');
  loadAsset('leak', 'assets/mob_leak.png');
  loadAsset('boss', 'assets/mob_boss.png');
  loadAsset('floor', 'assets/tex_floor.png');
  loadAsset('coin', 'assets/item_coin.png');
  loadAsset('gpu_1', 'assets/gpu_rx580.png');
  loadAsset('gpu_2', 'assets/gpu_1080ti.png');
  loadAsset('gpu_3', 'assets/gpu_3060.png');
  loadAsset('gpu_4', 'assets/gpu_3080.png');
  loadAsset('gpu_5', 'assets/gpu_4070.png');
  loadAsset('gpu_6', 'assets/gpu_4090.png');
  loadAsset('gpu_7', 'assets/gpu_5050.png');
  loadAsset('gpu_8', 'assets/gpu_690.png');
  loadAsset('bgMenu', 'assets/bg_menu.png');

  // ---------------- 游戏状态 ----------------
  const G = {
    state: 'menu',          // menu | playing | shop | dead | win
    t: 0,
    fps: 60,

    player: null,
    enemies: [],
    bullets: [],
    ebullets: [],
    pickups: [],
    particles: [],
    texts: [],
    fx: [],

    cam: { x: 0, y: 0 },
    shake: 0,
    flash: 0,
    hitstop: 0,

    wave: 0,
    waveTime: 0,
    WAVE_LEN: 25,
    TOTAL_WAVES: 14,
    spawnAcc: 0,
    bossSpawned: false,

    gold: 0,
    kills: 0,
    skillCasts: 0,
    combo: 0,
    comboTimer: 0,
    damageDealt: 0,
    playTime: 0,

    cpuIdx: 0,
    gpuIdx: 0,
    ramIdx: 0,

    weaponCd: 0,
    skillCd: 0,
    buffs: { rate: 1, speed: 1, timer: 0 },

    uiButtons: [],
    shopCards: [],
    shopChosen: false,

    bestWave: 1,
  };

  function resetGame() {
    G.state = 'playing';
    G.t = 0;
    G.player = {
      x: 0, y: 0, vx: 0, vy: 0,
      hp: 120, maxHp: 120,
      mana: 100, maxMana: 100,
      speed: 235,
      facing: 1,
      walk: 0,
      castTimer: 0,
      invuln: 0,
      hitFlash: 0,
    };
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.ebullets.length = 0;
    G.pickups.length = 0;
    G.particles.length = 0;
    G.texts.length = 0;
    G.fx.length = 0;
    G.cam.x = 0; G.cam.y = 0;
    G.shake = 0; G.flash = 0; G.hitstop = 0;
    G.wave = 0; G.waveTime = 0; G.spawnAcc = 0; G.bossSpawned = false;
    G.gold = 0; G.kills = 0; G.combo = 0; G.comboTimer = 0; G.damageDealt = 0; G.playTime = 0; G.skillCasts = 0;
    G.cpuIdx = 0; G.gpuIdx = 0; G.ramIdx = 0;
    G.weaponCd = 0; G.skillCd = 0;
    G.buffs.rate = 1; G.buffs.speed = 1; G.buffs.timer = 0;
    G.player.maxMana = RAMS[0].maxMana;
    G.player.mana = RAMS[0].maxMana;
    G.shopCards = [];
    G.shopChosen = false;
  }

  // ---------------- 实体工厂 ----------------
  function spawnEnemy(type, x, y, hpMul, dmgMul) {
    const d = ENEMY_TYPES[type];
    G.enemies.push({
      type, x, y,
      hp: d.hp * hpMul, maxHp: d.hp * hpMul,
      speed: d.speed * rnd(1.16, 0.86),
      dmg: d.dmg * dmgMul,
      r: d.r,
      color: d.color,
      gold: d.gold,
      t: rnd(TAU, 0),
      hit: 0,
      isBoss: type === 'boss',
      fireCd: 2.4,
      phase: rnd(TAU, 0),
    });
  }

  function spawnEnemyAround(type) {
    const a = rnd(TAU, 0);
    const r = 520 + rnd(220, 0);
    spawnEnemy(type, G.cam.x + Math.cos(a) * r, G.cam.y + Math.sin(a) * r,
      1 + G.wave * 0.22, 1 + G.wave * 0.09);
  }

  function addParticles(x, y, color, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU, 0), s = rnd(speed, speed * 0.25);
      G.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rnd(1.2, 0.6), maxLife: life, color, r: rnd(3.4, 1.2),
      });
    }
    if (G.particles.length > 420) G.particles.splice(0, G.particles.length - 420);
  }

  function addText(x, y, str, color, size) {
    G.texts.push({ x, y, str, color, size: size || 16, life: 0.75, vy: -46 });
    if (G.texts.length > 70) G.texts.shift();
  }

  function addShake(amt) { G.shake = Math.min(G.shake + amt, 26); }

  // ---------------- 战斗逻辑 ----------------
  function cpu() { return CPUS[G.cpuIdx]; }
  function gpu() { return GPUS[G.gpuIdx]; }
  function ram() { return RAMS[G.ramIdx]; }

  function nearestEnemy(x, y, maxD, exclude) {
    let best = null, bd = maxD * maxD;
    for (const e of G.enemies) {
      if (exclude && exclude.has(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fireBullet(x, y, angle, speed, dmg, pierce, color, r, target, splash) {
    G.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      dmg, pierce, color: color || '#8ef2ff', r: r || 4, life: 1.1,
      hitSet: null, target: target || null, homing: target ? 7.5 : 0,
      splash: splash === undefined ? 62 : splash,
    });
  }

  function autoAttack(dt) {
    const p = G.player;
    G.weaponCd -= dt;
    if (G.weaponCd > 0) return;
    const c = cpu();
    const target = nearestEnemy(p.x, p.y, 900);
    if (!target) return;
    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
    const interval = c.interval * (G.buffs.timer > 0 ? 0.6 : 1);
    G.weaponCd = interval;
    for (let i = 0; i < c.count; i++) {
      const off = (i - (c.count - 1) / 2) * c.spread;
      fireBullet(p.x, p.y - 8, baseAngle + off, 760, c.dmg, c.pierce, '#8ef2ff', 4.2, target);
    }
    // 音效
    const nowT = performance.now();
    if (nowT - AC.lastShot > 45) {
      AC.lastShot = nowT;
      blip(920, 0.045, 'square', 0.055, 420);
    }
    // 后坐反馈
    p.vx -= Math.cos(baseAngle) * 26;
    p.vy -= Math.sin(baseAngle) * 26;
  }

  function castSkill() {
    const g = gpu();
    if (!g.skill) return;
    const p = G.player;
    if (G.skillCd > 0 || p.mana < g.mana) return;
    p.mana -= g.mana;
    G.skillCd = g.cd * (1 - G.ramIdx * 0.055);
    G.skillCasts++;
    p.castTimer = 0.6;
    if (g.skill === 'nuke') { blip(60, 0.7, 'sawtooth', 0.3, 25); noiseBurst(0.6, 0.3, 600); }
    else if (g.skill === 'laser') { blip(1600, 0.22, 'sawtooth', 0.14, 300); }
    else if (g.skill === 'storm') { blip(420, 0.25, 'square', 0.13, 900); }
    else { blip(700, 0.18, 'triangle', 0.13, 1200); }
    const c = cpu();

    if (g.skill === 'storm') {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        fireBullet(p.x, p.y, a, 430, c.dmg * 1.3, 1, g.color, 5);
      }
      addShake(5);
      addParticles(p.x, p.y, g.color, 18, 260, 0.5);
    } else if (g.skill === 'laser') {
      const tgt = nearestEnemy(p.x, p.y, 1400);
      const a = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : 0;
      G.fx.push({ type: 'laser', x: p.x, y: p.y, a, len: 1500, t: 0, life: 0.28, dmg: c.dmg * 1.8, tick: 0, color: g.color });
      addShake(6);
    } else if (g.skill === 'boost') {
      G.buffs.rate = 1; G.buffs.speed = 1.45; G.buffs.timer = 5;
      addText(p.x, p.y - 54, '风扇全开！', g.color, 22);
      addParticles(p.x, p.y, g.color, 24, 300, 0.6);
    } else if (g.skill === 'flame') {
      const a = Math.atan2(mouse.y + G.cam.y - p.y, mouse.x + G.cam.x - p.x);
      G.fx.push({ type: 'flame', x: p.x + Math.cos(a) * 170, y: p.y + Math.sin(a) * 170, r: 0, maxR: 165, t: 0, life: 1.5, dmg: c.dmg * 1.1, tick: 0, color: g.color });
      addShake(8);
    } else if (g.skill === 'precise') {
      const used = new Set();
      for (let i = 0; i < 3; i++) {
        const tgt = nearestEnemy(p.x, p.y, 1600, used);
        if (!tgt) break;
        used.add(tgt);
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        fireBullet(p.x, p.y, a, 1500, c.dmg * 2.6, 3, g.color, 5);
      }
      addShake(4);
    } else if (g.skill === 'nuke') {
      G.flash = 0.55;
      addShake(24);
      for (const e of G.enemies) {
        damageEnemy(e, 320 + G.wave * 40, p.x, p.y, true);
      }
      addParticles(p.x, p.y, g.color, 60, 520, 1.0);
      for (let i = 0; i < 200; i++) {
        addParticles(rnd(1400, -1400) + p.x, rnd(1400, -1400) + p.y, g.color, 1, 200, 0.8);
      }
    }
  }

  function damageEnemy(e, dmg, hx, hy, silent) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hit = 0.12;
    G.damageDealt += dmg;
    if (!silent) {
      const crit = dmg > cpu().dmg * 2.2;
      addText(e.x + rnd(14, -14), e.y - e.r - 4, Math.round(dmg), crit ? '#ffe066' : '#ffffff', crit ? 22 : 15);
    }
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    G.kills++;
    G.combo++;
    G.comboTimer = 2.4;
    const n = e.isBoss ? 80 : 16;
    addParticles(e.x, e.y, e.color, n, e.isBoss ? 520 : 360, e.isBoss ? 1.2 : 0.6);
    if (e.isBoss) { blip(70, 0.9, 'sawtooth', 0.3, 30); noiseBurst(0.8, 0.25, 700); }
    else { blip(rnd(260, 200), 0.09, 'triangle', 0.10, 120); }
    if (e.isBoss) {
      addShake(26); G.flash = 0.4;
      for (let i = 0; i < 12; i++) {
        G.pickups.push({ x: e.x + rnd(90, -90), y: e.y + rnd(90, -90), vx: 0, vy: 0, v: rnd(12, 6), r: 6, life: 12 });
      }
      setTimeout(() => { if (G.state === 'playing') { G.state = 'win'; } }, 900);
    } else {
      G.pickups.push({ x: e.x, y: e.y, vx: 0, vy: 0, v: e.gold, r: 5, life: 10 });
      if (Math.random() < 0.045) {
        G.pickups.push({ x: e.x + rnd(18, -18), y: e.y + rnd(18, -18), vx: 0, vy: 0, v: 0, r: 7, life: 14, heal: 8 });
      }
    }
    if (G.combo > 0 && G.combo % 25 === 0) {
      addText(G.player.x, G.player.y - 70, '连杀 x' + G.combo, '#ffd166', 24);
    }
  }

  // ---------------- 更新 ----------------
  function update(dt) {
    if (G.state !== 'playing') {
      if (G.state === 'shop') { /* 商店暂停世界 */ }
      return;
    }
    G.t += dt;
    G.playTime += dt;

    // 命中停顿
    if (G.hitstop > 0) {
      G.hitstop -= dt;
      dt *= 0.18;
    }

    const p = G.player;

    // ----- 移动 -----
    let ix = 0, iy = 0;
    if (keys.KeyA || keys.ArrowLeft) ix -= 1;
    if (keys.KeyD || keys.ArrowRight) ix += 1;
    if (keys.KeyW || keys.ArrowUp) iy -= 1;
    if (keys.KeyS || keys.ArrowDown) iy += 1;
    let mag = 1;
    if (ix === 0 && iy === 0 && touch.active) {
      ix = touch.dx; iy = touch.dy; mag = touch.mag;
    }
    const len = Math.hypot(ix, iy) || 1;
    const spd = p.speed * G.buffs.speed;
    p.vx += (ix / len) * spd * mag * 14 * dt;
    p.vy += (iy / len) * spd * mag * 14 * dt;
    p.vx *= Math.pow(0.0004, dt);
    p.vy *= Math.pow(0.0004, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (ix !== 0) p.facing = ix > 0 ? 1 : -1;
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (moving) p.walk += dt * 11;

    // ----- 相机 -----
    G.cam.x = lerp(G.cam.x, p.x, 1 - Math.pow(0.0015, dt));
    G.cam.y = lerp(G.cam.y, p.y, 1 - Math.pow(0.0015, dt));

    // ----- 蓝条 -----
    p.mana = Math.min(p.maxMana, p.mana + ram().regen * dt);

    // ----- 技能 CD -----
    if (G.skillCd > 0) G.skillCd -= dt;
    if (p.castTimer > 0) p.castTimer -= dt;
    if (G.buffs.timer > 0) { G.buffs.timer -= dt; if (G.buffs.timer <= 0) G.buffs.speed = 1; }

    // ----- 攻击 -----
    autoAttack(dt);
    castSkill();

    // ----- 波次 -----
    G.waveTime += dt;
    if (G.wave === 0) nextWave();
    if (G.waveTime >= G.WAVE_LEN) {
      G.waveTime = 0;
      if (G.wave < G.TOTAL_WAVES) {
        nextWave();
        openShop();
      } else if (!G.bossSpawned) {
        G.bossSpawned = true;
        const p2 = G.player;
        // Boss 登场清场：小怪当场爆成粒子，专心打 Boss
        let burst = 0;
        for (const e of G.enemies) {
          if (e.isBoss) continue;
          if (burst < 90) addParticles(e.x, e.y, e.color, 5, 240, 0.45);
          burst++;
        }
        G.enemies.length = 0;
        G.gold += 60;
        spawnEnemy('boss', p2.x + 600, p2.y - 300, 1, 1);
        addText(p2.x, p2.y - 90, 'Boss 出现：RTX 690 双芯核弹', '#ff3df0', 30);
        addText(p2.x, p2.y - 56, '清场 +60 矿币', '#ffd166', 18);
        addShake(20);
      }
    }

    // ----- 生成敌人 -----
    if (!G.bossSpawned) {
      const rate = 1.90 + G.wave * 0.62;
      G.spawnAcc += rate * dt;
      while (G.spawnAcc >= 1) {
        G.spawnAcc -= 1;
        if (G.enemies.length > 420) break;
        const roll = Math.random();
        let type = 'worm';
        if (G.wave >= 2 && roll < 0.34) type = 'trojan';
        if (G.wave >= 4 && roll > 0.88) type = 'leak';
        spawnEnemyAround(type);
      }
    }

    updateEnemies(dt);
    updateBullets(dt);
    updateEBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateFx(dt);

    // ----- 玩家受伤 + 敌人软推离（保证主角永远看得见） -----
    for (const e of G.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const minD = e.r + 27;
      if (d < minD) {
        hitPlayer(e.dmg * 0.26);
        const k = (minD - d) * Math.min(1, dt * 10);
        e.x += (dx / d) * k;
        e.y += (dy / d) * k;
      }
    }

    // ----- 衰减 -----
    G.shake = Math.max(0, G.shake - dt * 42);
    G.flash = Math.max(0, G.flash - dt * 1.6);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }

    // ----- 死亡 -----
    if (p.hp <= 0) {
      G.state = 'dead';
      G.bestWave = Math.max(G.bestWave, G.wave);
      addParticles(p.x, p.y, '#8ef2ff', 40, 380, 1.0);
      addShake(20);
    }
  }

  function nextWave() {
    G.wave++;
    G.waveTime = 0;
    addText(G.cam.x, G.cam.y - 250, '第 ' + G.wave + ' 波', '#8ef2ff', 34);
  }

  function hitPlayer(dmg) {
    const p = G.player;
    if (p.invuln > 0) return;
    p.hp -= dmg;
    p.invuln = 0.52;
    p.hitFlash = 0.22;
    noiseBurst(0.16, 0.16, 900);
    blip(150, 0.16, 'sawtooth', 0.13, 70);
    addShake(4);
    addText(p.x, p.y - 46, '-' + Math.round(dmg * 10) / 10, '#ff5a5a', 18);
  }

  function updateEnemies(dt) {
    const p = G.player;
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dead) { G.enemies.splice(i, 1); continue; }
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      e.t += dt * (e.isBoss ? 1.4 : 3.2);
      if (e.hit > 0) e.hit -= dt;
      if (e.isBoss) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 2.2;
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * TAU + e.phase;
            G.ebullets.push({
              x: e.x, y: e.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
              r: 9, dmg: 9, life: 5, color: '#ff3b3b',
            });
          }
          e.phase += 0.4;
        }
      }
    }

    // 敌人之间做轻量分离，避免完全叠成一坨
    const arr = G.enemies;
    const n = arr.length;
    const px0 = p.x, py0 = p.y, lim = 620 * 620;
    for (let i = 0; i < n; i++) {
      const a = arr[i];
      if (a.dead) continue;
      const adx = a.x - px0, ady = a.y - py0;
      if (adx * adx + ady * ady > lim) continue;
      for (let j = i + 1; j < n; j++) {
        const b = arr[j];
        if (b.dead) continue;
        const bdx = b.x - px0, bdy = b.y - py0;
        if (bdx * bdx + bdy * bdy > lim) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = (a.r + b.r) * 0.92;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.28;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  function updateBullets(dt) {
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      if (b.homing > 0 && b.target && !b.target.dead) {
        const ca = Math.atan2(b.vy, b.vx);
        let da = Math.atan2(b.target.y - b.y, b.target.x - b.x) - ca;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const turn = Math.min(Math.abs(da), b.homing * dt) * Math.sign(da);
        const na = ca + turn;
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (b.hitSet && b.hitSet.has(e)) continue;
          if (dist(b.x, b.y, e.x, e.y) < e.r + b.r) {
            damageEnemy(e, b.dmg, b.x, b.y);
            addParticles(b.x, b.y, b.color, 4, 180, 0.3);
            // 溅射：一枪扫一片
            if (b.splash > 0) {
              const s2 = b.splash * b.splash;
              for (const o of G.enemies) {
                if (o === e || o.dead) continue;
                const ddx = o.x - b.x, ddy = o.y - b.y;
                if (ddx * ddx + ddy * ddy < s2) {
                  damageEnemy(o, b.dmg * 0.65, o.x, o.y, true);
                  addParticles(o.x, o.y, b.color, 2, 120, 0.22);
                }
              }
            }
            if (b.pierce > 0) {
              b.pierce--;
              if (!b.hitSet) b.hitSet = new Set();
              b.hitSet.add(e);
            } else { dead = true; break; }
          }
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  }

  function updateEBullets(dt) {
    const p = G.player;
    for (let i = G.ebullets.length - 1; i >= 0; i--) {
      const b = G.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (dist(b.x, b.y, p.x, p.y) < 14 + b.r) {
        hitPlayer(b.dmg);
        G.ebullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0) G.ebullets.splice(i, 1);
    }
  }

  function updatePickups(dt) {
    const p = G.player;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const c = G.pickups[i];
      c.life -= dt;
      const d = dist(c.x, c.y, p.x, p.y);
      if (d < 300) {
        const a = Math.atan2(p.y - c.y, p.x - c.x);
        const pull = 720;
        c.x += Math.cos(a) * pull * dt;
        c.y += Math.sin(a) * pull * dt;
      }
      if (d < 20) {
        if (c.heal) {
          p.hp = Math.min(p.maxHp, p.hp + c.heal);
          blip(760, 0.09, 'sine', 0.09, 1250);
          addText(p.x, p.y - 34, '+' + c.heal + ' HP', '#7dff9b', 15);
        } else {
          G.gold += c.v;
          blip(1280, 0.05, 'sine', 0.07, 1900);
          addText(p.x, p.y - 34, '+' + c.v, '#ffd166', 14);
        }
        G.pickups.splice(i, 1);
        continue;
      }
      if (c.life <= 0) G.pickups.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.pow(0.08, dt);
      q.vy *= Math.pow(0.08, dt);
      q.life -= dt;
      if (q.life <= 0) G.particles.splice(i, 1);
    }
  }

  function updateFx(dt) {
    const p = G.player;
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      f.t += dt;
      if (f.type === 'laser') {
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.05;
          const ex = f.x + Math.cos(f.a) * f.len;
          const ey = f.y + Math.sin(f.a) * f.len;
          for (const e of G.enemies) {
            if (e.dead) continue;
            const d = pointSegDist(e.x, e.y, f.x, f.y, ex, ey);
            if (d < e.r + 10) damageEnemy(e, f.dmg, e.x, e.y);
          }
        }
      } else if (f.type === 'flame') {
        f.r = lerp(f.r, f.maxR, 1 - Math.pow(0.0005, dt));
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.16;
          for (const e of G.enemies) {
            if (e.dead) continue;
            if (dist(e.x, e.y, f.x, f.y) < f.r + e.r) damageEnemy(e, f.dmg, e.x, e.y);
          }
          addParticles(f.x + rnd(f.r, -f.r), f.y + rnd(f.r, -f.r), f.color, 2, 120, 0.4);
        }
      }
      if (f.t >= f.life) G.fx.splice(i, 1);
    }
  }

  function pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // ---------------- 商店 ----------------
  function makeCard(kind) {
    if (kind === 'cpu' && G.cpuIdx < CPUS.length - 1) {
      const n = CPUS[G.cpuIdx + 1];
      return { kind, idx: G.cpuIdx + 1, cost: n.cost, title: 'CPU 升级', name: n.name, tag: n.tag };
    }
    if (kind === 'gpu' && G.gpuIdx < GPUS.length - 1) {
      const n = GPUS[G.gpuIdx + 1];
      return { kind, idx: G.gpuIdx + 1, cost: n.cost, title: '显卡换装', name: n.name, tag: n.tag };
    }
    if (kind === 'ram' && G.ramIdx < RAMS.length - 1) {
      const n = RAMS[G.ramIdx + 1];
      return { kind, idx: G.ramIdx + 1, cost: n.cost, title: '内存升级', name: n.name,
        tag: '+' + (n.maxMana - ram().maxMana) + ' 蓝上限' };
    }
    return null;
  }

  function openShop() {
    const cards = [makeCard('cpu'), makeCard('gpu'), makeCard('ram')].filter(Boolean);
    if (!cards.length) { G.state = 'playing'; return; }
    G.state = 'shop';
    G.shopChosen = false;
    cards.sort(() => Math.random() - 0.5);
    G.shopCards = cards.slice(0, 3);
  }

  // 买完一件后只替换那一张，不重排整排
  function refreshShopSlot(kind) {
    const i = G.shopCards.findIndex((c) => c.kind === kind);
    if (i < 0) return;
    const next = makeCard(kind);
    if (next) G.shopCards[i] = next;
    else G.shopCards.splice(i, 1);
  }

  function buyCard(card) {
    if (G.gold < card.cost) {
      addShake(3);
      G.shopHint = '金币不够，再去割一会儿';
      G.shopHintT = 1.2;
      return;
    }
    G.gold -= card.cost;
    if (card.kind === 'cpu') G.cpuIdx = card.idx;
    if (card.kind === 'gpu') { G.gpuIdx = card.idx; G.skillCd = 0; }
    if (card.kind === 'ram') {
      G.ramIdx = card.idx;
      const old = G.player.maxMana;
      G.player.maxMana = ram().maxMana;
      G.player.mana += Math.max(0, G.player.maxMana - old) * 0.6;
    }
    G.shopChosen = true;
    blip(520, 0.1, 'square', 0.14, 900);
    blip(780, 0.16, 'sine', 0.1, 1200);
    addText(G.player.x, G.player.y - 60, '装上了！', '#7dff9b', 22);
    addParticles(G.player.x, G.player.y, '#7dff9b', 20, 260, 0.6);
    refreshShopSlot(card.kind);
  }

  function continueWave() {
    G.state = 'playing';
    G.waveTime = 0;
  }

  // ---------------- 点击 ----------------
  function click(x, y) {
    initAudio();
    if (G.state === 'menu') { resetGame(); return; }
    if (G.state === 'dead' || G.state === 'win') { resetGame(); return; }
    if (G.state === 'shop') {
      for (const b of G.uiButtons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.action) b.action();
          return;
        }
      }
    }
  }

  // ---------------- 绘制 ----------------
  function draw() {
    const s = scale * dpr;
    ctx.setTransform(s, 0, 0, s, offX * dpr, offY * dpr);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);

    // 相机震动
    let sx = 0, sy = 0;
    if (G.shake > 0.2) {
      sx = rnd(G.shake, -G.shake) * 0.6;
      sy = rnd(G.shake, -G.shake) * 0.6;
    }

    drawBackground(sx, sy);

    ctx.save();
    ctx.translate(-G.cam.x + W / 2 + sx, -G.cam.y + H / 2 + sy);

    drawPickups();
    drawEnemies();
    if (G.state !== 'dead') drawPlayer();
    drawBullets();
    drawEBullets();
    drawFx();
    drawParticles();
    drawTexts();

    ctx.restore();

    drawVignette();
    if (G.state === 'playing') drawHUD();
    if (G.state === 'menu') drawMenu();
    if (G.state === 'shop') drawShop();
    if (G.state === 'dead') drawGameOver();
    if (G.state === 'win') drawWin();

    if (G.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(G.flash, 0, 0.7) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // 竖屏提示
    if (window.innerHeight > window.innerWidth * 1.15) {
      ctx.fillStyle = 'rgba(3,5,12,0.92)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ef2ff';
      ctx.font = 'bold 44px ' + FONT;
      ctx.fillText('横过来玩', W / 2, H / 2 - 20);
      ctx.font = 'bold 20px ' + FONT;
      ctx.fillStyle = 'rgba(190,215,255,0.8)';
      ctx.fillText('触屏：按住屏幕拖动，角色跟着走', W / 2, H / 2 + 40);
    }
  }

  function drawBackground(sx, sy) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 820);
    g.addColorStop(0, '#0b1226');
    g.addColorStop(1, '#04050a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 电路板地面纹理
    const floorImg = ASSETS.floor;
    if (floorImg && floorImg.complete && floorImg.naturalWidth) {
      const size = 480;
      const ox = ((-G.cam.x * 0.55 + sx) % size + size) % size;
      const oy = ((-G.cam.y * 0.55 + sy) % size + size) % size;
      ctx.save();
      ctx.globalAlpha = 0.95;
      for (let x = ox - size; x < W + size; x += size) {
        for (let y = oy - size; y < H + size; y += size) {
          ctx.drawImage(floorImg, x, y, size, size);
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(4,6,16,0.38)';
      ctx.fillRect(0, 0, W, H);
    }

    // 滚动网格
    const step = 90;
    const ox = ((-G.cam.x + sx) % step + step) % step;
    const oy = ((-G.cam.y + sy) % step + step) % step;
    ctx.strokeStyle = 'rgba(70,140,220,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // 更亮的主网格
    const big = step * 4;
    const ox2 = ((-G.cam.x + sx) % big + big) % big;
    const oy2 = ((-G.cam.y + sy) % big + big) % big;
    ctx.strokeStyle = 'rgba(90,180,255,0.16)';
    ctx.beginPath();
    for (let x = ox2; x < W; x += big) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = oy2; y < H; y += big) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ----- 玩家：大肥鱼 Q 版 -----
  function drawPlayer() {
    const p = G.player;
    let img = ASSETS.fish;
    const spdNow = Math.hypot(p.vx, p.vy);
    if (p.castTimer > 0 && ASSETS.fishCast && ASSETS.fishCast.complete) {
      img = ASSETS.fishCast;
    } else if (spdNow > 40) {
      const alt = Math.floor(p.walk / 1.15) % 2 === 0 ? ASSETS.fishA : ASSETS.fishB;
      if (alt && alt.complete && alt.naturalWidth) img = alt;
    }
    if (!(img && img.complete && img.naturalWidth)) { drawPlayerProcedural(); return; }

    ctx.save();
    ctx.translate(p.x, p.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 26, 23, 7, 0, 0, TAU);
    ctx.fill();

    // 主角光环
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 52);
    halo.addColorStop(0, 'rgba(120,235,255,0.28)');
    halo.addColorStop(1, 'rgba(120,235,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 52, 0, TAU); ctx.fill();

    const bob = Math.sin(p.walk) * 1.2;
    const hh = 124;
    const ww = img.width / img.height * hh;

    ctx.save();
    ctx.translate(0, bob);
    if (spdNow > 40) ctx.rotate(Math.sin(p.walk) * 0.04);
    if (p.invuln > 0.02 && Math.floor(p.invuln * 26) % 2 === 0) ctx.globalAlpha = 0.45;
    if (p.hitFlash > 0) ctx.filter = 'brightness(1.8) saturate(0.4)';
    ctx.scale(p.facing, 1);
    ctx.shadowColor = 'rgba(90,200,255,0.45)';
    ctx.shadowBlur = 16;
    ctx.drawImage(img, -ww / 2, 30 - hh, ww, hh);
    ctx.restore();

    // 无敌帧护盾
    if (p.invuln > 0.02) {
      ctx.strokeStyle = 'rgba(140,220,255,' + clamp(p.invuln * 1.6, 0, 1) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -22, 40, 0, TAU); ctx.stroke();
    }
    // 技能就绪提示
    if (gpu().skill && G.skillCd <= 0 && p.mana >= gpu().mana) {
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -22, 44 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayerProcedural() {
    const p = G.player;
    ctx.save();
    ctx.translate(p.x, p.y);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 20, 7, 0, 0, TAU);
    ctx.fill();

    const bob = Math.sin(p.walk) * 1.6;

    // 主角光环，保证在怪堆里也能一眼看见
    const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
    halo.addColorStop(0, 'rgba(120,235,255,0.30)');
    halo.addColorStop(1, 'rgba(120,235,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill();

    ctx.translate(0, bob);
    ctx.scale(1.18, 1.18);

    // 受击闪白
    if (p.hitFlash > 0 && Math.floor(p.hitFlash * 30) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    ctx.save();
    ctx.scale(p.facing, 1);

    // 腿
    const swing = Math.sin(p.walk) * 5;
    ctx.fillStyle = '#22305c';
    ctx.beginPath(); ctx.roundRect(-9 + swing, 10, 7, 14, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(2 - swing, 10, 7, 14, 3); ctx.fill();
    // 鞋
    ctx.fillStyle = '#e9eefc';
    ctx.beginPath(); ctx.roundRect(-10 + swing, 20, 9, 5, 2.5); ctx.fill();
    ctx.beginPath(); ctx.roundRect(1 - swing, 20, 9, 5, 2.5); ctx.fill();

    // 裙子
    ctx.fillStyle = '#1b2a55';
    ctx.beginPath();
    ctx.moveTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(19, 14); ctx.lineTo(-19, 14);
    ctx.closePath(); ctx.fill();
    // 裙子褶
    ctx.strokeStyle = 'rgba(140,180,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-11, 13);
    ctx.moveTo(0, 0); ctx.lineTo(0, 13);
    ctx.moveTo(8, 0); ctx.lineTo(11, 13);
    ctx.stroke();

    // 围裙
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.moveTo(-9, 1); ctx.lineTo(9, 1); ctx.lineTo(11, 13); ctx.lineTo(-11, 13);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,190,240,0.5)';
    ctx.stroke();

    // 上衣
    ctx.fillStyle = '#25346a';
    ctx.beginPath(); ctx.roundRect(-11, -14, 22, 15, 5); ctx.fill();
    // 领结
    ctx.fillStyle = '#3b6fd8';
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(-7, -17); ctx.lineTo(-7, -9); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(7, -17); ctx.lineTo(7, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7fb4ff';
    ctx.beginPath(); ctx.arc(0, -13, 2.6, 0, TAU); ctx.fill();

    // 头发（后层）
    ctx.fillStyle = '#2f5fc4';
    ctx.beginPath();
    ctx.moveTo(-16, -30); ctx.quadraticCurveTo(-26, 4, -19, 20);
    ctx.quadraticCurveTo(-13, 8, -12, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, -30); ctx.quadraticCurveTo(26, 4, 19, 20);
    ctx.quadraticCurveTo(13, 8, 12, -6); ctx.closePath(); ctx.fill();
    // 双马尾
    ctx.fillStyle = '#3a6fd8';
    ctx.beginPath(); ctx.ellipse(-19, 8, 7, 13, 0.25, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(19, 8, 7, 13, -0.25, 0, TAU); ctx.fill();

    // 头
    ctx.fillStyle = '#ffe6d8';
    ctx.beginPath(); ctx.arc(0, -26, 15, 0, TAU); ctx.fill();

    // 刘海
    ctx.fillStyle = '#3f74e0';
    ctx.beginPath();
    ctx.arc(0, -29, 15.2, Math.PI * 1.03, Math.PI * 1.97);
    ctx.lineTo(13, -24);
    ctx.quadraticCurveTo(8, -33, 0, -31);
    ctx.quadraticCurveTo(-8, -33, -13, -24);
    ctx.closePath(); ctx.fill();
    // 呆毛
    ctx.beginPath();
    ctx.moveTo(-2, -43); ctx.quadraticCurveTo(3, -52, 7, -44);
    ctx.quadraticCurveTo(3, -47, -2, -43);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#22355f';
    ctx.beginPath(); ctx.ellipse(-5.5, -24, 2.6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5.5, -24, 2.6, 3.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9fd0ff';
    ctx.beginPath(); ctx.arc(-4.6, -25.4, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6.4, -25.4, 1.1, 0, TAU); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255,150,160,0.35)';
    ctx.beginPath(); ctx.ellipse(-9.5, -20, 3, 1.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9.5, -20, 3, 1.8, 0, 0, TAU); ctx.fill();

    // 头顶的锅
    ctx.fillStyle = '#98a3b3';
    ctx.beginPath();
    ctx.ellipse(0, -44, 17, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#b6c0cd';
    ctx.beginPath();
    ctx.moveTo(-16, -44);
    ctx.quadraticCurveTo(-16, -58, 0, -58);
    ctx.quadraticCurveTo(16, -58, 16, -44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,72,92,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -44);
    ctx.quadraticCurveTo(-16, -58, 0, -58);
    ctx.quadraticCurveTo(16, -58, 16, -44);
    ctx.stroke();
    // 锅盖把手位置的小高光
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-6, -53, 4, 1.8, -0.4, 0, TAU); ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;

    // 无敌帧护盾
    if (G.player.invuln > 0.02) {
      ctx.strokeStyle = 'rgba(140,220,255,' + (G.player.invuln * 1.6) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -10, 30, 0, TAU); ctx.stroke();
    }

    // 技能就绪提示
    if (gpu().skill && G.skillCd <= 0 && G.player.mana >= gpu().mana) {
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -10, 34 + Math.sin(G.t * 6) * 2, 0, TAU); ctx.stroke();
    }

    ctx.restore();
  }

  // ----- 敌人 -----
  function drawEnemies() {
    for (const e of G.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const wob = Math.sin(e.t) * (e.isBoss ? 3 : 2);

      // 影子
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.9, e.r * 0.32, 0, 0, TAU); ctx.fill();

      const flash = e.hit > 0;
      const col = flash ? '#ffffff' : e.color;

      // 有贴图就用贴图
      const artKey = e.isBoss ? 'boss' : e.type;
      const art = ASSETS[artKey];
      if (art && art.complete && art.naturalWidth) {
        const hh = e.r * (e.isBoss ? 3.3 : 2.6);
        const ww = art.width / art.height * hh;
        ctx.save();
        ctx.rotate(Math.sin(e.t * 0.9) * 0.05);
        if (flash) ctx.filter = 'brightness(2.4) saturate(0.2)';
        ctx.drawImage(art, -ww / 2, -hh * 0.5, ww, hh);
        ctx.restore();
        ctx.restore();
        continue;
      }

      if (e.isBoss) {
        // Boss：双芯核弹造型
        ctx.fillStyle = 'rgba(255,60,60,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, e.r + 16 + wob, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1030';
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
        // 两个核心
        for (let i = 0; i < 2; i++) {
          const a = e.phase + i * Math.PI;
          ctx.fillStyle = i ? '#ff3b3b' : '#ff8a3d';
          ctx.beginPath(); ctx.arc(Math.cos(a) * 20, Math.sin(a) * 20, 14, 0, TAU); ctx.fill();
        }
        // 眼睛
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-18, -12, 5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(18, -12, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-17, -12, 2.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(19, -12, 2.4, 0, TAU); ctx.fill();
        // 血条
        const w = 110;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-w / 2, -e.r - 24, w, 8);
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(-w / 2, -e.r - 24, w * (e.hp / e.maxHp), 8);
      } else if (e.type === 'worm') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r, e.r * 0.82 + wob * 0.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(-5, -2, 3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -2, 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, 6); ctx.stroke();
      } else if (e.type === 'trojan') {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      } else {
        // 内存泄漏：一团不规则
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const rr = e.r * (0.82 + Math.sin(e.t * 2 + i) * 0.18);
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(-6, -3, 3.4, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -3, 3.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    for (const b of G.bullets) {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = b.color;
      // 拖尾
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = b.r * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.024, b.y - b.vy * 0.024);
      ctx.stroke();
      // 弹头
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.45, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.72, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawEBullets() {
    for (const b of G.ebullets) {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = b.color;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawPickups() {
    const coinImg = ASSETS.coin;
    for (const c of G.pickups) {
      const pulse = 0.85 + Math.sin(G.t * 8 + c.x) * 0.15;
      ctx.save();
      ctx.globalAlpha = c.life < 2 ? 0.4 + Math.sin(G.t * 14) * 0.3 : 1;
      if (c.heal) {
        // 血包：绿色十字
        ctx.translate(c.x, c.y);
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#7dff9b';
        ctx.fillStyle = '#7dff9b';
        ctx.beginPath(); ctx.roundRect(-3.5, -10, 7, 20, 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(-10, -3.5, 20, 7, 2); ctx.fill();
        ctx.restore();
        continue;
      }
      if (coinImg && coinImg.complete && coinImg.naturalWidth) {
        const hh = 26 * pulse;
        const ww = coinImg.width / coinImg.height * hh;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffcf4d';
        ctx.drawImage(coinImg, c.x - ww / 2, c.y - hh / 2, ww, hh);
      } else {
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#ffd166';
        ctx.fillStyle = '#ffd166';
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-c.r * pulse, -c.r * pulse, c.r * 2 * pulse, c.r * 2 * pulse);
      }
      ctx.restore();
    }
  }

  function drawFx() {
    for (const f of G.fx) {
      if (f.type === 'laser') {
        const k = 1 - f.t / f.life;
        const ex = f.x + Math.cos(f.a) * f.len;
        const ey = f.y + Math.sin(f.a) * f.len;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = f.color;
        ctx.shadowBlur = 24;
        ctx.shadowColor = f.color;
        ctx.lineWidth = 16 * k;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * k;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.restore();
      } else if (f.type === 'flame') {
        const k = 1 - f.t / f.life;
        ctx.save();
        ctx.globalAlpha = 0.35 * k;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8 * k;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawParticles() {
    for (const q of G.particles) {
      const a = clamp(q.life / q.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * a, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of G.texts) {
      const a = clamp(t.life / 0.75, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold ' + t.size + 'px ' + FONT;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(t.str, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      t.y += t.vy * 0.016;
      t.life -= 0.016;
    }
    ctx.globalAlpha = 1;
  }

  // ----- HUD -----
  function drawHUD() {
    const p = G.player;

    // 左下：血条 + 蓝条
    const bx = 30, by = H - 92, bw = 300, bh = 16;
    // 血
    ctx.fillStyle = 'rgba(10,16,30,0.85)';
    ctx.beginPath(); ctx.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
    ctx.fillStyle = '#3a1020';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
    const hpK = clamp(p.hp / p.maxHp, 0, 1);
    const hpG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hpG.addColorStop(0, '#ff4d6d'); hpG.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = hpG;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * hpK, bh, 6); ctx.fill();
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp, bx + bw + 14, by + bh / 2);

    // 蓝
    const my = by + 26;
    ctx.fillStyle = 'rgba(10,16,30,0.85)';
    ctx.beginPath(); ctx.roundRect(bx - 4, my - 4, bw + 8, 16 + 8, 8); ctx.fill();
    ctx.fillStyle = '#0d2440';
    ctx.beginPath(); ctx.roundRect(bx, my, bw, 16, 6); ctx.fill();
    const mk = clamp(p.mana / p.maxMana, 0, 1);
    const mG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    mG.addColorStop(0, '#2ec5ff'); mG.addColorStop(1, '#7dffd4');
    ctx.fillStyle = mG;
    ctx.beginPath(); ctx.roundRect(bx, my, bw * mk, 16, 6); ctx.fill();
    ctx.fillStyle = '#9fdcff';
    ctx.fillText(Math.floor(p.mana) + ' / ' + p.maxMana, bx + bw + 14, my + 8);

    // 左上：波次 / 金币
    ctx.textAlign = 'left';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.fillText('WAVE ' + G.wave + ' / ' + G.TOTAL_WAVES, 34, 46);
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('◈ ' + G.gold, 34, 76);

    // 波次进度条
    const pwid = 200;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(34, 90, pwid, 6, 3); ctx.fill();
    ctx.fillStyle = '#8ef2ff';
    ctx.beginPath(); ctx.roundRect(34, 90, pwid * clamp(G.waveTime / G.WAVE_LEN, 0, 1), 6, 3); ctx.fill();

    // 右上：装备
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('CPU  ' + cpu().name, W - 30, 42);
    ctx.fillStyle = gpu().color;
    ctx.fillText('GPU  ' + gpu().name, W - 30, 66);
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('RAM  ' + ram().name, W - 30, 90);

    // 技能就绪状态
    if (gpu().skill) {
      const ready = G.skillCd <= 0 && p.mana >= gpu().mana;
      ctx.fillStyle = ready ? '#ffd166' : 'rgba(160,180,210,0.5)';
      ctx.font = 'bold 14px ' + FONT;
      const cdTxt = G.skillCd > 0 ? '冷却 ' + G.skillCd.toFixed(1) + 's' : (p.mana < gpu().mana ? '蓝不够' : '技能就绪');
      ctx.fillText(gpu().tag + ' · ' + cdTxt, W - 30, 116);
    }

    // Boss 血条（屏幕空间）
    const boss = G.enemies.find((e) => e.isBoss);
    if (boss) {
      const bw = 560, bx = W / 2 - bw / 2, byy = 76;
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillStyle = '#ff6b6b';
      ctx.fillText('GTX 690 双芯核弹', W / 2, byy - 12);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(bx - 3, byy - 3, bw + 6, 20, 6); ctx.fill();
      ctx.fillStyle = '#2a0a12';
      ctx.beginPath(); ctx.roundRect(bx, byy, bw, 14, 5); ctx.fill();
      const g2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g2.addColorStop(0, '#ff3b3b'); g2.addColorStop(1, '#ff9a3d');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.roundRect(bx, byy, bw * clamp(boss.hp / boss.maxHp, 0, 1), 14, 5); ctx.fill();
    }

    // 触控摇杆
    if (touch.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(142,242,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 54, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(142,242,255,0.12)';
      ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 54, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(142,242,255,0.65)';
      ctx.beginPath();
      ctx.arc(touch.ox + touch.dx * touch.mag * 44, touch.oy + touch.dy * touch.mag * 44, 22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 连杀
    if (G.combo >= 3) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px ' + FONT;
      ctx.fillStyle = 'rgba(255,209,102,' + clamp(G.comboTimer, 0, 1) + ')';
      ctx.fillText('x' + G.combo, W / 2, 70);
    }
  }

  // ----- 菜单 -----
  function drawMenu() {
    const bg = ASSETS.bgMenu;
    if (bg && bg.complete && bg.naturalWidth) {
      const sc = Math.max(W / bg.width, H / bg.height);
      const bw = bg.width * sc, bh = bg.height * sc;
      ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      const gg = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 720);
      gg.addColorStop(0, 'rgba(4,6,16,0.62)');
      gg.addColorStop(1, 'rgba(4,6,16,0.42)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(4,5,10,0.86)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.textAlign = 'center';
    ctx.shadowBlur = 26;
    ctx.shadowColor = 'rgba(120,230,255,0.55)';

    ctx.font = 'bold 62px ' + FONT;
    const g = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
    g.addColorStop(0, '#7dffd4'); g.addColorStop(0.5, '#8ef2ff'); g.addColorStop(1, '#ff8ad8');
    ctx.fillStyle = g;
    ctx.fillText('大肥鱼的狂野矿卡', W / 2, H / 2 - 120);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = 'rgba(190,215,255,0.75)';
    ctx.fillText('1024 程序员节 · 用一张显卡的命，换一整晚的帧数', W / 2, H / 2 - 66);

    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = 'rgba(185,205,235,0.9)';
    ctx.fillText('WASD / 方向键 移动   自动攻击   显卡技能自动释放', W / 2, H / 2 + 20);
    ctx.fillStyle = 'rgba(165,190,225,0.85)';
    ctx.fillText('每波结束可以升级 CPU / 显卡 / 内存', W / 2, H / 2 + 48);

    const blink = 0.78 + Math.sin(performance.now() / 420) * 0.22;
    ctx.fillStyle = 'rgba(142,242,255,' + blink + ')';
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText('点击任意处 / 按 R 开始', W / 2, H / 2 + 130);
    ctx.font = '14px ' + FONT;
    ctx.fillStyle = 'rgba(120,140,170,0.7)';
    ctx.fillText('v0.9 · 1024 程序员节', W / 2, H - 34);
  }

  // ----- 商店 -----
  function drawShop() {
    ctx.fillStyle = 'rgba(3,6,14,0.94)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px ' + FONT;
    ctx.fillStyle = '#8ef2ff';
    ctx.fillText('第 ' + Math.max(1, G.wave - 1) + ' 波结束 · 装机时间', W / 2, 92);
    ctx.font = 'bold 16px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('◈ 金币 ' + G.gold + '   ·   选一件，或者空手走人', W / 2, 128);

    G.uiButtons.length = 0;
    const cards = G.shopCards;
    const cw = 308, chh = 372, gap = 30;
    const totalW = cards.length * cw + (cards.length - 1) * gap;
    let x0 = W / 2 - totalW / 2;

    for (const c of cards) {
      const y0 = 168;
      const hover = mouse.x > x0 && mouse.x < x0 + cw && mouse.y > y0 && mouse.y < y0 + chh;
      const afford = G.gold >= c.cost;
      const col = c.kind === 'cpu' ? '#7dffd4' : c.kind === 'gpu' ? '#ff8ad8' : '#ffd166';

      ctx.save();
      ctx.shadowBlur = hover ? 30 : 12;
      ctx.shadowColor = col;
      ctx.fillStyle = hover ? 'rgba(18,30,54,0.98)' : 'rgba(12,20,38,0.96)';
      ctx.beginPath(); ctx.roundRect(x0, y0, cw, chh, 16); ctx.fill();
      ctx.strokeStyle = afford ? col : 'rgba(120,135,160,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x0, y0, cw, chh, 16); ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillStyle = col;
      ctx.fillText(c.title, x0 + cw / 2, y0 + 34);

      drawShopIcon(c, x0 + cw / 2, y0 + 112, 120);

      ctx.font = 'bold 21px ' + FONT;
      ctx.fillStyle = '#eaf3ff';
      ctx.fillText(c.name, x0 + cw / 2, y0 + 204);

      ctx.font = 'bold 14px ' + FONT;
      ctx.fillStyle = 'rgba(180,205,235,0.85)';
      wrapText(c.tag, x0 + cw / 2, y0 + 232, cw - 44, 21);

      ctx.font = '13px ' + FONT;
      ctx.fillStyle = 'rgba(150,175,210,0.8)';
      let line = '';
      if (c.kind === 'cpu') line = '射速 ' + (1 / CPUS[c.idx].interval).toFixed(1) + '/s · 伤害 ' + CPUS[c.idx].dmg + ' · 弹道 ' + CPUS[c.idx].count;
      if (c.kind === 'gpu') line = '技能：' + (SKILL_NAMES[GPUS[c.idx].skill] || '无') + ' · 蓝耗 ' + GPUS[c.idx].mana;
      if (c.kind === 'ram') line = '蓝上限 ' + RAMS[c.idx].maxMana + ' · 回蓝 ' + RAMS[c.idx].regen + '/s';
      ctx.fillText(line, x0 + cw / 2, y0 + 276);

      ctx.font = 'bold 24px ' + FONT;
      ctx.fillStyle = afford ? '#ffd166' : '#5a6478';
      ctx.fillText('◈ ' + c.cost, x0 + cw / 2, y0 + 326);

      if (!afford) {
        ctx.font = 'bold 13px ' + FONT;
        ctx.fillStyle = 'rgba(255,90,90,0.85)';
        ctx.fillText('金币不够', x0 + cw / 2, y0 + 350);
      }

      G.uiButtons.push({ x: x0, y: y0, w: cw, h: chh, action: () => buyCard(c) });
      x0 += cw + gap;
    }

    const skW = 190, skH = 48, skX = W / 2 - skW / 2, skY = 582;
    const hov = mouse.x > skX && mouse.x < skX + skW && mouse.y > skY && mouse.y < skY + skH;
    ctx.fillStyle = hov ? 'rgba(60,80,110,0.9)' : 'rgba(30,42,64,0.9)';
    ctx.beginPath(); ctx.roundRect(skX, skY, skW, skH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(140,170,210,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(skX, skY, skW, skH, 10); ctx.stroke();
    ctx.fillStyle = '#cfe3ff';
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText('装好，继续战斗', skX + skW / 2, skY + skH / 2 + 1);
    G.uiButtons.push({ x: skX, y: skY, w: skW, h: skH, action: continueWave });

    if (G.shopHintT > 0) {
      G.shopHintT -= 1 / 60;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = 'rgba(255,120,120,0.95)';
      ctx.fillText(G.shopHint, W / 2, 646);
    }
  }

  function drawShopIcon(c, cx, cy, size) {
    if (c.kind === 'gpu') {
      const img = ASSETS['gpu_' + c.idx];
      if (img && img.complete && img.naturalWidth) {
        const hh = size * 0.70;
        const ww = img.width / img.height * hh;
        const k = Math.min(1, (size * 1.12) / ww);
        ctx.drawImage(img, cx - (ww * k) / 2, cy - (hh * k) / 2, ww * k, hh * k);
        return;
      }
      // 没图时画个通用卡
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#2a3550';
      ctx.strokeStyle = '#ff8ad8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-58, -26, 116, 52, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8ad8';
      ctx.beginPath(); ctx.arc(-26, 0, 15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(26, 0, 15, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    if (c.kind === 'cpu') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#243050';
      ctx.strokeStyle = '#7dffd4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-46, -46, 92, 92, 8); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#7dffd4';
      ctx.beginPath(); ctx.roundRect(-32, -32, 64, 64, 4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillStyle = '#cfe3ff';
      ctx.textAlign = 'center';
      ctx.fillText('CPU', 0, 2);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#2a3550';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-66, -26, 132, 52, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 4; i++) ctx.fillRect(-56 + i * 31, -16, 22, 32);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText('RAM', 0, 5);
    ctx.restore();
  }

  function affordabilityStroke(afford, col) {
    return afford ? col : 'rgba(120,135,160,0.5)';
  }

  function wrapText(text, cx, y, maxW, lh) {
    const chars = Array.from(text);
    let line = '', yy = y;
    for (const ch of chars) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, cx, yy);
        line = ch; yy += lh;
      } else line += ch;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  // ----- 结算 -----
  function drawGameOver() {
    ctx.fillStyle = 'rgba(10,4,10,0.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 56px ' + FONT;
    ctx.fillStyle = '#ff5a5a';
    ctx.fillText('蓝屏了', W / 2, H / 2 - 110);
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = 'rgba(210,200,220,0.85)';
    ctx.fillText('你的矿卡烧了，但数据还在硬盘里', W / 2, H / 2 - 60);

    ctx.font = 'bold 20px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    const sec = Math.floor(G.playTime);
    ctx.fillText('坚持 ' + Math.floor(sec / 60) + ' 分 ' + (sec % 60) + ' 秒   ·   第 ' + G.wave + ' 波', W / 2, H / 2 + 10);
    ctx.fillText('击杀 ' + G.kills + '   ·   总伤害 ' + Math.floor(G.damageDealt), W / 2, H / 2 + 48);

    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('点击或按 R 再来一局', W / 2, H / 2 + 130);
  }

  function drawWin() {
    ctx.fillStyle = 'rgba(4,12,16,0.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 54px ' + FONT;
    const g = ctx.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
    g.addColorStop(0, '#7dffd4'); g.addColorStop(1, '#ffd166');
    ctx.fillStyle = g;
    ctx.fillText('矿卡之王', W / 2, H / 2 - 100);
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillStyle = 'rgba(210,235,255,0.9)';
    ctx.fillText('双芯核弹被你打回废品站，这波不亏', W / 2, H / 2 - 50);
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = '#cfe3ff';
    ctx.fillText('用时 ' + Math.floor(G.playTime / 60) + ' 分 ' + Math.floor(G.playTime % 60) + ' 秒   ·   击杀 ' + G.kills, W / 2, H / 2 + 20);
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('点击或按 R 再战一局', W / 2, H / 2 + 110);
  }

  // ---------------- 主循环 ----------------
  let last = performance.now();
  function loop(nowMs) {
    let dt = (nowMs - last) / 1000;
    last = nowMs;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 1 / 30);

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  const game = {
    restart() {
      if (G.state === 'menu') resetGame();
      else resetGame();
    },
    click,
  };

  resetGame();
  G.state = 'menu';
  window.__GAME = G;   // 调试用，正式版无副作用

  // 调试/演示入口：?auto=1 直接开局，?wave=N 跳到第 N 波
  const qs = new URLSearchParams(location.search);
  if (qs.has('auto')) {
    resetGame();
    const w = parseInt(qs.get('wave') || '1', 10);
    if (w > 1) { G.wave = w - 1; nextWave(); }
    if (qs.has('gold')) G.gold = parseInt(qs.get('gold'), 10) || 0;
  }

  requestAnimationFrame(loop);
})();
