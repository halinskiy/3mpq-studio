/* ---------- обложка (модуль из ~/diary/site/public/index.html, адаптирован под портфолио) ----------
   Сцена: DOM-слои с картинками (scene/*.webp), двигаются только transform в одном общем rAF:
   параллакс от курсора (лерп с инерцией) и от перехода (ближние слои уходят сильнее, ветка чуть растёт),
   бесконечный дрейф трёх полос тумана, покачивание ветки, несколько лепестков. Цикл стоит, когда обложки
   не видно (дашборд) и при document.hidden; prefers-reduced-motion: статичная сцена.
   WebGL-канвас поверх рисует только то, что нельзя сделать слоями: 匠心[логотип]遊創 из своей текстуры
   (R чёткие, G размытые), дымку у надписи и глитч перехода. На обложке канвас занимает только полосу дымки,
   дымка считается в FBO в половину css px, в покое канвас обновляется 30 раз в секунду. Дымка проходит
   сквозь знаки и стирает штрихи сухой кистью. На курсор элементы реагируют сами, окна вокруг курсора нет:
   каждый знак по своей дистанции (пружина) расслаивается, как свежая тушь, дымка расходится вихрем по следу
   курсора и затягивается, ветка чуть отклоняется, лепестки сдуваются. Для перехода сцена собирается в шейдере
   из тех же картинок (уменьшенные текстуры) по тем же прямоугольникам, что у DOM-слоёв в этом кадре,
   и рвётся на растянутые строки; дашборд въезжает строками из своего снимка (snapDash).
   Переход: p едет к цели (0 обложка, 1 дашборд) ~0.5 с; новая команда в любой момент разворачивает его
   с текущей точки, ввод не блокируется. Гасится только хвост инерции того же жеста. */
(function cover() {
  const root = document.getElementById("cover"), cv = document.getElementById("coverCanvas"), sceneEl = document.getElementById("scene");
  const page = document.getElementById("page"), motto = document.getElementById("motto"), goBtn = document.getElementById("coverGo");
  const html = document.documentElement, body = document.body;
  const qs = new URLSearchParams(location.search);
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = mq.matches;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const DUR = 520, DUR_FADE = 360;

  let mode = "cover";           // cover | move | page
  let p = 0, target = 0, frozen = false, leaveSent = false;
  let raf = 0, last = 0, gl = null, G = null;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const cur = { x: -1e4, y: -1e4, on: false, sp: 0, t: 0 };   // курсор в css px; on: есть над обложкой
  const WAKE = 16, wake = Array.from({ length: WAKE }, () => [0, 0, 0, 0, 0]);   // след для дымки: x, y (uv, y снизу), vx, vy (uv/с), сила
  let wakeT = 0, wakeX = 0, wakeY = 0;
  const GLY = [];               // знаки и логотип: центр и полуширина в css px, возмущение d и его скорость (пружина)
  const branch = { x: 0, y: 0, vx: 0, vy: 0 };
  const noHover = matchMedia("(hover: none)");
  let autoAt = 0;
  const t0 = performance.now();

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  scrollTo(0, 0);
  page.inert = true;

  /* --- слои сцены. z: глубина для параллакса (0 далеко .. 1 передний план) --- */
  const LAYERS = [
    { n: "sky", z: .04 }, { n: "far", z: .14 },
    { n: "mistA", z: .22, mist: { y: .47, h: .24, o: .5, v: 7 } },
    { n: "mid", z: .3 },
    { n: "mistB", z: .45, mist: { y: .6, h: .3, o: .65, v: 11 } },
    { n: "near", z: .62 },
    { n: "mistC", z: .8, mist: { y: .84, h: .34, o: .75, v: 17 } },
    { n: "fg", z: 1 },
  ];
  const IMGS = LAYERS.filter((l) => !l.mist);
  // куски картинки, где есть тушь (доли x0, y0, x1, y1): пустой прозрачный верх гор и середину ветки
  // не композитим, это почти половина площади слоёв на каждом кадре
  const PIECES = { far: [[0, .24, 1, 1]], mid: [[0, .2, 1, 1]], near: [[0, .19, 1, 1]], fg: [[0, 0, .52, .52], [.65, .6, 1, 1]] };
  const LEAVES = [];
  for (const L of LAYERS) {
    L.els = (L.mist ? [[0, 0, 1, 1]] : PIECES[L.n] || [[0, 0, 1, 1]]).map((pc) => {
      const d = document.createElement("div"); d.className = "ly" + (L.mist ? " mist" : ""); d.pc = pc;
      if (!L.mist) { const im = new Image(); im.alt = ""; im.decoding = "async"; d.append(im); }
      sceneEl.append(d); return d;
    });
    L.el = L.els[0]; L.imgs = L.els.map((d) => d.firstChild).filter(Boolean); L.img = L.imgs[0];
    L.x = L.y = L.s = NaN; L.drift = Math.random() * 1000;
    if (L.n === "near") for (let i = 0; i < 7; i++) { const e = document.createElement("i"); e.className = "leaf"; sceneEl.append(e); LEAVES.push({ e, x: 0, y: -999, vx: 0, vy: 0, r: 0, vr: 0, s: 1, ph: 0 }); }
  }
  let vw = innerWidth, vh = innerHeight, box = null, imgW = 0, theme = "", mistSrc = "";
  const MOON_X = 1127 / 1536, MOON_Y = 183 / 1024;
  function layout() {
    vw = innerWidth; vh = innerHeight;
    const W = Math.max(vw * 1.12, vh * 1.12 * 1.5), H = W / 1.5;
    let top = vh * .46 - H * .5; const lo = vh * 1.05 - H, hi = -vh * .05;
    top = lo <= hi ? clamp(top, lo, hi) : (vh - H) / 2;
    box = { W, H, left: (vw - W) / 2, top };
    for (const L of LAYERS) {
      const st = {};
      if (L.mist) {
        L.th = H * L.mist.h; L.tw = L.th * 2048 / 384;
        L.bx = box.left; L.by = top + H * L.mist.y - L.th / 2; L.bw = W + L.tw; L.bh = L.th;
        st.backgroundSize = `${L.tw}px ${L.th}px`; st.opacity = `calc(var(--cv-mist-o) * ${L.mist.o})`;
      } else {
        // небо сдвигаем так, чтобы луна была в кадре и на узком экране
        L.bx = L.n === "sky" ? clamp(vw * .72 - W * MOON_X, vw - W, 0) : box.left;
        L.by = L.n === "sky" ? Math.min(-vh * .03, Math.max(top, vh * .17 - H * MOON_Y)) : top; L.bw = W; L.bh = H;
      }
      for (const d of L.els) {
        const [x0, y0, x1, y1] = d.pc, ds = d.style;
        ds.left = L.bx + x0 * L.bw + "px"; ds.top = L.by + y0 * L.bh + "px"; ds.width = (x1 - x0) * L.bw + "px"; ds.height = (y1 - y0) * L.bh + "px";
        if (L.mist) { ds.backgroundSize = st.backgroundSize; ds.opacity = st.opacity; continue; }
        ds.transformOrigin = `${(.5 - x0) * L.bw}px ${(.5 - y0) * L.bh}px`;   // масштаб ветки от центра целой картинки
        const is = d.firstChild.style; is.width = L.bw + "px"; is.height = L.bh + "px"; is.marginLeft = -x0 * L.bw + "px"; is.marginTop = -y0 * L.bh + "px";
      }
      L.x = NaN;
    }
    // ветка переднего плана не заслоняет надпись: у куска ветки мягкая маска-эллипс вокруг надписи (в координатах куска)
    const mr = motto.getBoundingClientRect(), fg = LAYERS.find((L) => L.n === "fg");
    for (const d of fg.els) {
      const l = parseFloat(d.style.left), t = parseFloat(d.style.top);
      const cx = mr.left + mr.width / 2 - l, cy = mr.top + mr.height / 2 - t, rx = mr.width * .62 + 40, ry = mr.height * 1.15 + 32;
      d.style.webkitMaskImage = d.style.maskImage = `radial-gradient(${rx.toFixed(0)}px ${ry.toFixed(0)}px at ${cx.toFixed(0)}px ${cy.toFixed(0)}px, transparent 55%, #000 100%)`;
    }
    pickImages();
  }
  function pickImages() {
    const w = box.W * Math.min(devicePixelRatio || 1, 2) > 1700 ? 2560 : 1536;
    const th = body.classList.contains("dark") ? "dark" : "light";
    if (w === imgW && th === theme) return;
    const swap = !!theme; imgW = w; theme = th;
    mistSrc = `assets/scene/mist-${w > 1536 ? 2048 : 1024}.webp`;
    for (const L of LAYERS) if (L.mist) L.el.style.backgroundImage = `url(${mistSrc})`;
    loadTex(5, mistSrc);
    IMGS.forEach((L, i) => {
      const src = `assets/scene/${L.n}-${th}-${w}.webp`;
      if (!swap) { L.imgs.forEach((m) => { m.src = src; }); L.img.decode().then(() => loadTex(i, L.img), () => {}); return; }
      // смена темы или размера: показываем новую картинку, когда она готова, без мигания
      const im = new Image(); im.src = src;
      im.decode().then(() => { L.imgs.forEach((m) => { m.src = src; }); loadTex(i, im); kick(); }, () => {});
    });
  }

  /* --- состояние и визуал перехода --- */
  const fade = () => !G || !G.have || reduced;
  const dur = () => fade() ? DUR_FADE : DUR;
  function apply() {
    const reveal = ss(.15, 1, p);
    page.style.transform = mode === "page" ? "" : `translate3d(0, ${Math.round((1 - reveal) * 24)}px, 0)`;
    page.style.visibility = mode === "cover" && p === 0 ? "hidden" : "";   // под целой обложкой дашборд не рисуем
    root.style.opacity = fade() && mode !== "page" ? String(1 - p) : "";
    root.classList.toggle("gx", !fade() && p > 0 && mode !== "page");
    root.classList.toggle("gone", mode === "page");
    root.style.pointerEvents = mode === "page" || p > .5 ? "none" : "";
  }
  function go(dir) {
    if (frozen) return;
    const t = dir > 0 ? 1 : 0;
    if (t === target) return;
    target = t;
    if (dir < 0 && mode === "page") { scrollTo(0, 0); html.classList.add("cover-on"); root.inert = false; page.inert = true; }
    mode = "move";
    apply(); snapDash(); kick();
  }
  // появление дашборда стартует, когда переход почти закончен: под полосами не должно быть перебора букв
  function leave() { if (p >= .74 && !leaveSent) { leaveSent = true; dispatchEvent(new CustomEvent("cover:leave", { detail: { delay: 0 } })); } }
  function stepTransition(dt) {
    if (frozen || p === target) return;
    const d = dt * 1000 / dur();
    p = target > p ? Math.min(target, p + d) : Math.max(target, p - d);
    leave();
    if (p === 1) {
      mode = "page"; html.classList.remove("cover-on"); root.inert = true; page.inert = false;
      if (G) { G.ghost = 0; snapLater(2500); }   // дальше под переходом виден настоящий дашборд; снимок с настоящим текстом
      if (root.contains(document.activeElement)) document.getElementById("hello").focus?.();
    } else if (p === 0) mode = "cover";
    apply();
  }

  /* --- жесты: направление жеста задаёт цель, разворот срабатывает сразу; хвост инерции того же жеста гасится --- */
  const editable = (t) => t && (t.closest?.("input, textarea, select, [contenteditable]") || t.isContentEditable);
  const sheetOpen = () => body.classList.contains("locked");
  let wLast = 0, wDir = 0, wMag = 0, gestureAtTop = true, tail = 0, tailUntil = 0;
  addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const now = performance.now(), dir = Math.sign(e.deltaY), mag = Math.abs(e.deltaY);
    if (!dir) return;
    // инерция трекпада не меняет направление, идёт без пауз и только затухает; новый свайп снова разгоняет дельту
    const fresh = now - wLast > 200 || dir !== wDir || (mag > 8 && mag > wMag * 1.6);
    wLast = now; wDir = dir; wMag = mag;
    if (fresh) { gestureAtTop = scrollY <= 0; tail = 0; }
    if (mode !== "page") { e.preventDefault(); go(dir); tail = dir; tailUntil = now + 1500; return; }
    // хвост инерции жеста, который открыл дашборд, гасится (новый свайп распознаётся по росту дельты), но не дольше 1,5 с
    if (tail === dir && now < tailUntil) { e.preventDefault(); return; }
    if (sheetOpen()) return;
    if (dir < 0 && scrollY <= 0 && gestureAtTop) { e.preventDefault(); go(-1); tail = -1; }
  }, { passive: false });

  let ty0 = 0, tx0 = 0, tTop = false;
  addEventListener("touchstart", (e) => { const t = e.touches[0]; ty0 = t.clientY; tx0 = t.clientX; tTop = scrollY <= 0; }, { passive: true });
  addEventListener("touchmove", (e) => {
    const t = e.touches[0], dy = ty0 - t.clientY, dx = tx0 - t.clientX;
    const swipe = Math.abs(dy) > 32 && Math.abs(dy) > Math.abs(dx);
    if (mode !== "page") {
      e.preventDefault();
      if (swipe) { go(Math.sign(dy)); ty0 = t.clientY; tx0 = t.clientX; }   // в том же касании можно развернуть назад
      return;
    }
    if (sheetOpen()) return;
    if (tTop && scrollY <= 0 && swipe && dy < 0) { e.preventDefault(); go(-1); ty0 = t.clientY; tx0 = t.clientX; }
  }, { passive: false });

  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || editable(e.target) || sheetOpen()) return;
    const k = e.key, down = ["PageDown", "ArrowDown", " ", "End", "Enter"].includes(k) && !(k === " " && e.shiftKey);
    const up = ["PageUp", "ArrowUp", "Home"].includes(k) || (k === " " && e.shiftKey);
    if (mode !== "page") {
      if (down) { e.preventDefault(); if (k !== "Enter" || e.target === goBtn || e.target === body) go(1); }
      else if (up) { e.preventDefault(); go(-1); }
      return;
    }
    if (scrollY <= 0 && up) { e.preventDefault(); go(-1); }
  });
  goBtn.addEventListener("click", () => go(1));

  /* --- указатель: параллакс, близость к знакам, ветке и лепесткам, след в дымке; на тач то же от касания --- */
  function pointer(x, y, down) {
    const now = performance.now();
    mouse.tx = x / innerWidth * 2 - 1; mouse.ty = y / innerHeight * 2 - 1;
    if (cur.on && !down) cur.sp += (Math.hypot(x - cur.x, y - cur.y) / (Math.max(8, now - cur.t) / 1000) - cur.sp) * .3;
    else cur.sp = 0;
    cur.x = x; cur.y = y; cur.on = true; cur.t = now;
    if (reduced) return;
    // след: точка не чаще раза в 30 мс и не ближе 6 px; скорость задаёт направление вихря
    if (!down && (Math.hypot(x - wakeX, y - wakeY) < 6 || now - wakeT < 30)) return;
    const s = Math.max(16, now - wakeT) / 1000;
    const vx = down ? 0 : clamp((x - wakeX) / vw / s, -2, 2), vy = down ? 0 : clamp((wakeY - y) / vh / s, -2, 2);
    wakeT = now; wakeX = x; wakeY = y;
    const w = wake.pop(); w[0] = x / vw; w[1] = 1 - y / vh; w[2] = vx; w[3] = vy; w[4] = down ? .8 : 1; wake.unshift(w);
  }
  const away = () => { cur.on = false; cur.sp = 0; kick(); };
  root.addEventListener("pointermove", (e) => { pointer(e.clientX, e.clientY, false); kick(); }, { passive: true });
  root.addEventListener("pointerdown", (e) => { pointer(e.clientX, e.clientY, true); kick(); }, { passive: true });
  root.addEventListener("pointerleave", away, { passive: true });
  root.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") away(); }, { passive: true });
  root.addEventListener("pointercancel", away, { passive: true });

  // знаки: цель возмущения по расстоянию от курсора до центра знака; подход быстрый, сборка мягкая с инерцией.
  // Без курсора на тач изредка слегка расслаивается случайный знак.
  function stepGlyphs(dt, T) {
    if (!GLY.length) return;
    if (!reduced && noHover.matches && !cur.on && T > autoAt) {
      autoAt = T + 4 + Math.random() * 5;
      if (T > 32) GLY[Math.floor(Math.random() * GLY.length)].auto = T + .45;
    }
    for (const g of GLY) {
      let t = 0;
      if (!reduced) {
        if (cur.on) t = Math.pow(1 - ss(.12, 1.9, Math.hypot(cur.x - g.x, cur.y - g.y) / (g.hw * 2)), 2.2);
        if (g.auto > T) t = Math.max(t, .3);
      }
      const up = t > g.d, k = up ? 140 : 30, c = up ? 18 : 7;
      g.v += ((t - g.d) * k - g.v * c) * dt; g.d = clamp(g.d + g.v * dt, -.2, 1.15);
    }
  }

  /* --- движение слоёв: только transform, пишем в style только изменившееся --- */
  function placeLayers(T, dt) {
    const e = ss(0, 1, p), mx = reduced ? 0 : mouse.x, my = reduced ? 0 : mouse.y, AX = vw * .04, AY = vh * .025;
    // ветка переднего плана (слева сверху и справа снизу) отклоняется от курсора на несколько px, на пружине
    let bx = 0, by = 0;
    if (cur.on && !reduced) for (const [ax, ay] of [[.16, .14], [.88, .86]]) {
      const dx = vw * ax - cur.x, dy = vh * ay - cur.y, d = Math.hypot(dx, dy) || 1, f = 1 - ss(0, Math.min(vw, vh) * .6, d);
      bx += dx / d * f * 14; by += dy / d * f * 9;
    }
    branch.vx += ((bx - branch.x) * 22 - branch.vx * 6.5) * dt; branch.vy += ((by - branch.y) * 22 - branch.vy * 6.5) * dt;
    branch.x += branch.vx * dt; branch.y += branch.vy * dt;
    for (const L of LAYERS) {
      let x = -mx * L.z * AX, y = -my * L.z * AY - e * L.z * vh * .1, s = 1;
      if (L.mist && !reduced) { L.drift += dt * L.mist.v * box.W / 1600; x -= L.drift % L.tw; }
      if (L.n === "fg") { s = 1 + .06 * e; if (!reduced) { x += Math.sin(T * .45) * 5 + branch.x; y += Math.sin(T * .31 + 1) * 3 + branch.y; } }
      L.cx = x; L.cy = y; L.s = s;
      if (Math.abs(x - L.x) < .01 && Math.abs(y - L.y) < .01 && s === L.ss) continue;
      L.x = x; L.y = y; L.ss = s;
      const tf = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)` + (s !== 1 ? ` scale(${s.toFixed(4)})` : "");
      for (const d of L.els) d.style.transform = tf;
    }
    if (reduced) return;
    for (const f of LEAVES) {
      if (f.y < -20 || f.y > vh + 20) {   // новый лепесток над кадром, со случайной задержкой
        f.x = Math.random() * vw; f.y = -20 - Math.random() * vh * .8; f.vy = 16 + Math.random() * 22; f.vx = 6 + Math.random() * 10;
        f.r = Math.random() * 360; f.vr = (Math.random() - .5) * 120; f.s = .7 + Math.random() * .7; f.ph = Math.random() * 6.3; f.px = f.py = 0;
      }
      const sx = f.x - mx * .7 * AX;
      // рядом с курсором лепесток сдувает в сторону от него (сильнее при быстром движении), потом порыв стихает
      if (cur.on) {
        const dx = sx - cur.x, dy = f.y - cur.y, d = Math.hypot(dx, dy) || 1;
        if (d < 170) { const a = (1 - d / 170) ** 2 * (260 + Math.min(cur.sp, 2400) * .7) * dt; f.px += dx / d * a; f.py += dy / d * a; f.r += a * .8; }
      }
      const damp = Math.exp(-dt * 1.4); f.px *= damp; f.py *= damp;
      f.y += (f.vy + f.py) * dt; f.x += (f.vx + f.px + Math.sin(T * 1.3 + f.ph) * 18) * dt; f.r += f.vr * dt;
      f.e.style.transform = `translate3d(${(f.x - mx * .7 * AX).toFixed(1)}px, ${f.y.toFixed(1)}px, 0) rotate(${f.r.toFixed(0)}deg) scale(${f.s.toFixed(2)})`;
    }
  }

  /* --- WebGL: надпись, дымка, переход ---
     Обложка: канвас только на полосе дымки вокруг надписи. Дымка считается отдельным проходом в FBO
     в половинном css-разрешении (она мягкая), надпись в полном разрешении экрана поверх неё.
     Переход: канвас на весь экран в css-разрешении (сцена всё равно из уменьшенных текстур). */
  const NOISE = `
  float hash2(vec2 p){ vec3 q = fract(vec3(p.xyx)*.1031); q += dot(q, q.yzx+33.33); return fract((q.x+q.y)*q.z); }
  float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
    return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y); }`;
  const VS = "attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }";
  // дымка у надписи: fbm с искривлением, медленно наплывает и дышит. Курсор оставляет след: точки следа
  // закручивают дымку (вихри по обе стороны от направления движения) и расчищают её, сила гаснет ~2.5 с
  const FOG_FS = `precision highp float;
  ${NOISE}
  const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
  float fbm4(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a*n2(p); p = ROT*p + vec2(3.1, 1.7); a *= .5; } return s/.9375; }
  float fbm3(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a*n2(p); p = ROT*p + vec2(1.3, 4.1); a *= .5; } return s/.875; }
  uniform vec2 uView, uFSize; uniform vec4 uFRect; uniform float uT, uDark;
  uniform vec4 uWk[${WAKE}]; uniform float uWs[${WAKE}];
  uniform vec3 uInk, uPaper;
  void main(){
    vec2 uv = uFRect.xy + gl_FragCoord.xy/uFSize*uFRect.zw;
    vec2 q = (uv - uFRect.xy)/uFRect.zw*2. - 1.;
    float m = 1. - smoothstep(.4, 1., length(q));
    if (m <= 0.){ gl_FragColor = vec4(0.); return; }
    float asp = uView.x/uView.y;
    vec2 p = uv*vec2(asp, 1.), disp = vec2(0.);
    float clr = 0.;
    for (int i = 0; i < ${WAKE}; i++){
      float s = uWs[i];
      if (s <= 0.) continue;
      vec2 c = uWk[i].xy*vec2(asp, 1.), d = p - c, vel = uWk[i].zw*vec2(asp, 1.);
      float g = exp(-dot(d, d)/.008);
      if (g < .002) continue;
      float vl = min(length(vel), 1.6), a = sign(d.x*vel.y - d.y*vel.x)*vl*(1. - s)*2.4*g;
      float ca = cos(a), sa = sin(a);
      disp += (vec2(ca*d.x + sa*d.y, -sa*d.x + ca*d.y) - d)*s - vel*.035*g*s;
      clr += g*s;
    }
    vec2 fp = p + disp;
    float T = uT;
    // пряди: шум вытянут по горизонтали, как полосы тумана на свитке; плывут сквозь надпись
    vec2 sp = fp*vec2(1.7, 3.8);
    vec2 w = vec2(fbm3(sp*.7 + vec2(T*.02, T*.006)), fbm3(sp*.7 + vec2(5.2 - T*.012, 1.3 + T*.01)));
    float f = fbm4(sp + w*1.3 + vec2(-T*.045, T*.005));
    float breath = .93 + .07*sin(T*.31);
    float dens = smoothstep(.4, .8, f*breath + .05*sin(T*.19 + fp.x*1.7))*m;
    // курсор не выедает дымку (давало тёмное радиальное пятно), только закручивает её через disp
    vec3 col = mix(mix(uPaper, vec3(1.), .6), mix(uPaper, uInk, .16), uDark);
    col = mix(col, uInk, .07*(1. - f));
    float a = dens*mix(.74, .58, uDark);
    gl_FragColor = vec4(col*a, a);
  }`;
  const FS = `precision highp float;
  ${NOISE}
  uniform vec2 uView, uOrg; uniform float uK, uP, uT, uMotion, uHave, uDark, uGhost, uFragW, uFragH;
  uniform vec4 uTRect, uFRect; uniform vec4 uGl[5]; uniform vec2 uCur;
  uniform vec3 uInk, uAcc, uPaper;
  uniform sampler2D uL0, uL1, uL2, uL3, uL4, uMist, uText, uFog, uFrag, uDash;
  uniform vec4 uR[8]; uniform vec3 uMO;
  uniform vec4 uFr[8]; uniform vec2 uFa[8];
  // сцена из тех же картинок, что DOM-слои (премультиплированная альфа), прямоугольники в uv экрана, y снизу
  vec4 lay(sampler2D t, vec4 r, vec2 uv){ vec2 q = (uv - r.xy)/r.zw; if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) return vec4(0.); return texture2D(t, q); }
  vec4 mist(vec4 r, vec2 uv, float o){ vec2 q = (uv - r.xy)/r.zw; if (q.y < 0. || q.y > 1.) return vec4(0.); return texture2D(uMist, vec2(fract(q.x), q.y))*o; }
  vec3 ov(vec3 c, vec4 l){ return l.rgb + c*(1.-l.a); }
  vec4 ov4(vec4 d, vec3 c, float a){ return vec4(c*a, a) + d*(1.-a); }
  vec4 over(vec4 d, vec4 s){ return s + d*(1.-s.a); }
  float lum(vec3 c){ return dot(c, vec3(.3, .55, .15)); }
  vec3 scene(vec2 uv){
    vec3 c = ov(uPaper, lay(uL0, uR[0], uv));
    c = ov(c, lay(uL1, uR[1], uv)); c = ov(c, mist(uR[2], uv, uMO.x));
    c = ov(c, lay(uL2, uR[3], uv)); c = ov(c, mist(uR[4], uv, uMO.y));
    c = ov(c, lay(uL3, uR[5], uv)); c = ov(c, mist(uR[6], uv, uMO.z));
    return ov(c, lay(uL4, uR[7], uv));
  }
  vec4 fogT(vec2 uv){ vec2 q = (uv - uFRect.xy)/uFRect.zw; if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) return vec4(0.); return texture2D(uFog, q); }
  // возмущение знака в этой точке: свои числа у каждого знака, между знаками плавный переход по x
  float glyphD(vec2 uv){
    float s = 0., w = 0.;
    for (int i = 0; i < 5; i++){ float k = (uv.x - uGl[i].x)/uGl[i].z; float g = exp(-k*k*1.6); s += g*uGl[i].w; w += g; }
    return w > 1e-5 ? s/w : 0.;
  }
  vec2 tuvAt(vec2 px){ return (px/uView - uTRect.xy)/uTRect.zw; }
  // туман подъедает тушь: маска из плотности дымки и мелкого шума, штрихи стираются пятнами и волокнами
  float fogBite(vec2 px, float fa){
    float n = n2(px*.03 + vec2(uT*.05, 0.))*.6 + n2(px*.1 - vec2(uT*.08, uT*.03))*.4;
    return smoothstep(.16, .52, fa*1.7 + (n - .5)*.7);
  }
  // надпись слоем (премультиплированный цвет). Тушь живёт в сцене: дымка проходит сквозь знаки и стирает
  // штрихи сухой кистью (飛白: волоски вдоль штриха). Чем ближе курсор к знаку, тем сильнее он расслаивается,
  // как свежая тушь: светлые слои штриха сползают по плавному течению, тушь растекается в бумагу
  // мягкой каймой, сквозь штрих проступают волокна. Никакого пиксельного шума.
  vec4 inkLayer(vec2 px, float fa){
    vec2 tuv = tuvAt(px);
    if (tuv.x < -.02 || tuv.y < -.02 || tuv.x > 1.02 || tuv.y > 1.02) return vec4(0.);
    float D = glyphD(px/uView)*uMotion, D2 = D*D;
    vec2 aw = px - uCur; float al = length(aw); aw = al > .5 ? aw/al : vec2(0., 1.);
    vec2 fq = px*.05;
    vec2 flow = vec2(n2(fq + vec2(3.1, uT*.3)), n2(fq + vec2(17.3, -uT*.25))) - .5;
    vec2 off = (flow*18. + aw*6.)*D2;
    vec3 t = texture2D(uText, tuv).rgb;
    float l2 = D > .02 ? texture2D(uText, tuvAt(px - off)).g : 0.;          // размытая тень штриха: тушь растекается
    float l3 = D > .02 ? texture2D(uText, tuvAt(px + off*.7 - vec2(0., 2.)*D)).r : 0.;   // тонкий сползший слой мазка
    // направление штриха по градиенту размытой тени; волоски кисти идут вдоль штриха
    vec2 ex = vec2(2./(uView.x*uTRect.z), 0.), ey = vec2(0., 2./(uView.y*uTRect.w));
    vec2 nrm = vec2(texture2D(uText, tuv + ex).g - texture2D(uText, tuv - ex).g, texture2D(uText, tuv + ey).g - texture2D(uText, tuv - ey).g);
    float gl = length(nrm); nrm = gl > 1e-4 ? nrm/gl : vec2(0., 1.);
    // две ориентации волосков (вдоль x и вдоль y), смешанные по нормали: координаты не крутятся, шум не зернит
    float hh = n2(vec2(px.x*.018, px.y*.3) + 7.)*.65 + n2(vec2(px.x*.04, px.y*.55) + 31.)*.35;
    float hv = n2(vec2(px.x*.3, px.y*.018) + 13.)*.65 + n2(vec2(px.x*.55, px.y*.04) + 47.)*.35;
    float hair = mix(hv, hh, smoothstep(.25, .75, abs(nrm.y)));
    float bite = fogBite(px, fa);
    // сухая кисть сильнее у краёв и концов штриха (там размытая тень слабее), середина держит тушь
    float edge = 1. - smoothstep(.5, .95, t.g);
    float dry = clamp(D*.42 + bite*.75, 0., .8)*(.4 + .6*edge);
    float keep = smoothstep(dry*.85 - .16, dry*.85 + .12, hair);
    float ink = t.r*keep*(1. - .55*bite);
    float fib = n2(px*.16 + 5.)*.6 + n2(px*.55)*.4;
    float wash = smoothstep(.03, .6, t.g)*(1. - t.r)*(.25 + .5*fib)*(D*.6 + .04);
    vec2 fp = px*.004;
    float flick = .93 + .07*n2(vec2(fp.x*5., fp.y*8. + uT*.8));
    float band = exp(-pow((fract(px.x/uView.x*.5 - px.y/uView.y*.2 - uT*.07) - .5)*10., 2.));
    // перелив: тушь переходит в тот же синий, что и на дашборде (едва)
    vec3 inkB = mix(uInk, uAcc, .7), shine = mix(uAcc, uPaper, .35);
    vec3 ic = mix(uInk, inkB, .6*smoothstep(.45, .95, n2(px/uView*3. + vec2(uT*.09, -uT*.05))));
    ic = mix(ic, shine, band*.3*t.r);
    vec3 dil = mix(uInk, uPaper, .58);
    vec4 L = ov4(vec4(0.), dil, wash);
    L = ov4(L, mix(uInk, uPaper, .5), l2*D*.3*(.6 + .4*fib)*(1. - ink));
    L = ov4(L, mix(mix(uInk, uPaper, .35), uAcc, .15), l3*D2*.22*(1. - ink));
    return ov4(L, ic, ink*flick);
  }
  vec3 coverC(vec2 px){
    vec2 uv = px/uView;
    vec4 f = fogT(uv);
    return ov(ov(uHave > .5 ? scene(uv) : uPaper, inkLayer(px, f.a)), f);
  }
  // снимок дашборда (2D-канвас в css px, см. snapDash)
  vec3 dashC(vec2 px){ return texture2D(uDash, px/uView).rgb; }
  vec4 bitsAt(vec2 px){   // редкие моноширинные обрывки: даты, знаки, цифры шкал
    vec4 o = vec4(0.);
    for (int i = 0; i < 8; i++){
      vec4 f = uFr[i]; vec2 fa = uFa[i];
      if (fa.y <= 0.) continue;
      vec2 q = px - f.xy;
      if (q.x < -6. || q.y < -3. || q.x > f.z + 6. || q.y > f.w + 3.) continue;
      float tx = q.x < 0. || q.x > f.z || q.y < 0. || q.y > f.w ? 0. : texture2D(uFrag, vec2(q.x/uFragW, (fa.x*16. + 16. - q.y)/uFragH)).r;
      o = ov4(o, mix(uPaper, uAcc, .22), .45*fa.y);
      o = ov4(o, uInk, tx*.8*fa.y);
    }
    return o;
  }
  void main(){
    vec2 px = uOrg + gl_FragCoord.xy/uK;
    float p = uP;
    if (p <= 0.){ vec4 f = fogT(px/uView); gl_FragColor = over(inkLayer(px, f.a), f); return; }
    // переход: картинка рвётся на строки. Строка режется на куски разной длины; кусок либо растягивает один
    // пиксель сцены по горизонтали (с лёгким градиентом к концу куска, как сортировка пикселей), либо сдвигает
    // строку. Куски чаще там, где у сцены край (контраст в якоре). Сверху вниз с разбросом куски переходят
    // на дашборд: строки дашборда въезжают растянутыми. Всё зависит только от p: обратный ход те же кадры назад.
    float e = sin(3.14159*p), beat = floor(p*16.);
    float bd = floor(px.y/32.), hb = hash2(vec2(bd, 1.7));
    float inTxt = step(abs(px.x/uView.x - uTRect.x - uTRect.z*.5), uTRect.z*.42)*step(abs(px.y/uView.y - uTRect.y - uTRect.w*.5), uTRect.w*.36);
    float rh = inTxt > 0. ? (hb < .4 ? 4. : hb < .75 ? 6. : 10.) : hb < .3 ? 2. : hb < .55 ? 3. : hb < .75 ? 5. : hb < .9 ? 8. : 12.;
    float row = floor(px.y/rh), yc = (row + .5)*rh;
    float L = mix(16., 460., pow(hash2(vec2(row, 13.1)), 2.2));
    float x0 = floor((px.x + hash2(vec2(row, 7.3))*L)/L)*L - hash2(vec2(row, 7.3))*L;
    float sg = row*1.37 + floor((px.x - x0)/L + .001) + x0*.013;
    float h1 = hash2(vec2(sg, beat + 1.)), h2 = hash2(vec2(sg, beat + 2.)), h3 = hash2(vec2(sg, 3.3)), h4 = hash2(vec2(sg, 4.4));
    float u = clamp((px.x - x0)/L, 0., 1.);
    float th = mix(.14, .86, clamp((1. - px.y/uView.y)*.76 + hash2(vec2(bd, 5.1))*.2 + (h4 - .5)*.1, 0., 1.));
    float sw = smoothstep(th - .08, th + .08, p);
    bool toDash = hash2(vec2(sg, beat + 9.)) < sw;
    bool mid = sw > .02 && sw < .98;
    vec2 A = vec2(x0 + L*.12*h3, yc), B = vec2(x0 + L, yc);
    vec3 col; float alpha = 1.;
    if (!toDash){
      vec3 cA = coverC(A), cB = coverC(B), cC = coverC(A + vec2(0., 10.));
      float con = abs(lum(cA) - lum(cB)) + abs(lum(cA) - lum(cC));
      float prob = e*(.08 + 2.4*con + .2*inTxt) + (mid ? .7 : 0.);
      if (h1 < prob){
        if (h2 < .6 - .3*inTxt){   // растяжка
          col = mix(cA, cB, u*u*.6);
          float tail = 1. - smoothstep(.55, 1., u)*h3;
          col = mix(coverC(px), col, tail*.94);
        } else {                   // сдвиг строки; на туши расхождение в акцентный синий
          float dx = (h3 - .5)*2.*mix(5., inTxt > 0. ? 26. : 70., h2)*(.4 + .6*e);
          col = coverC(px - vec2(dx, 0.));
          if (inTxt > 0.){
            vec4 f = fogT(px/uView);
            float kA = inkLayer(px - vec2(dx, 0.), f.a).a, kB = inkLayer(px - vec2(dx + 3. + 6.*e, 0.), f.a).a;
            col = mix(col, uAcc, clamp(kB - kA, 0., 1.)*.75);
          }
        }
      } else col = coverC(px);
    } else {
      // дашборд: в момент смены кусок въезжает растянутым от якоря, потом встаёт на место
      float k = smoothstep(th - .08, th + .16, p);
      float sx = mix(A.x + (px.x - A.x)*.18, px.x, k) - (1. - k)*(h3 - .3)*120.;
      // растягиваются только строки с содержимым (текст, плашки): растянутый пустой фон дал бы белые полосы
      vec3 dA = dashC(vec2(A.x, yc)), dP = dashC(px);
      bool bar = mid && h1 < .5 && abs(lum(dA) - lum(dashC(vec2(B.x, yc)))) + abs(lum(dA) - lum(dP)) > .04;
      col = bar ? mix(dashC(vec2(sx, yc)), dashC(vec2(B.x, yc)), u*.4) : k < 1. ? dashC(vec2(sx, px.y)) : dP;
      float fadeOut = 1. - smoothstep(.8, .97, p + (h4 - .5)*.08);
      alpha = bar ? .92*fadeOut + (1. - fadeOut)*.0 : uGhost*fadeOut;
      if (!bar && uGhost < .5) alpha = 0.;
    }
    vec4 o = vec4(col*alpha, alpha);
    vec4 b = bitsAt(px);
    o = over(o, b*e);
    gl_FragColor = o;
  }`;

  /* палитра: читаем вычисленные цвета токенов через пробный элемент (color-mix тоже) */
  const PAL = ["--cv-paper", "--cv-ink", "--accent"];
  const probe = document.createElement("i"); probe.style.display = "none"; root.append(probe);
  const rgb = (c) => { const nums = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith("color(") ? nums.slice(0, 4) : [...nums.slice(0, 3).map((x) => x / 255), nums.length > 3 ? nums[3] : 1]; };
  function readPal() { return PAL.map((name) => { probe.style.color = `var(${name})`; return rgb(getComputedStyle(probe).color).slice(0, 3); }); }
  let pal = readPal(), mistO = 1;
  const readMist = () => { mistO = parseFloat(getComputedStyle(body).getPropertyValue("--cv-mist-o")) || 0; };
  readMist();

  // обрывки для перехода: даты, знаки, цифры шкал (не код). Атлас: строка 16 css px, рисуем в 2x
  const BITS = ["iOS · macOS · Web", "匠 心 · 遊 創", "9.1  8.7  8.4  7.9", "TestFlight", "作 · 遊 · 道", "01 / 38", "Play  Source  Visit", "1440 × 900", "─ 7.0 ─ 8.5 ─ 9.4 ─", "3mpq"];
  function initGL() {
    try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { gl = null; }
    if (!gl || gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 10) { gl = null; return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (fs) => { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, "a"); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(pr, i).name.replace(/\[0\]$/, ""); u[nm] = gl.getUniformLocation(pr, nm); }
      return { pr, u }; };
    const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return t; };
    try {
      const M = prog(FS), F = prog(FOG_FS);
      // текстуры: 0-4 слои, 5 туман-полоса, 6 надпись, 7 дымка (FBO), 8 атлас обрывков, 9 снимок дашборда
      G = { M, F, tex: Array.from({ length: 10 }, tex), ok: [0, 0, 0, 0, 0, 0], have: false, rect: [0, 0, 0, 0], frect: [0, 0, 0, 0], cm: "", fb: gl.createFramebuffer(), fw: 0, fh: 0, last: 0, ghost: 1, snap: "" };
    } catch (e) { console.warn("cover: WebGL shaders failed", e); gl = null; G = null; return false; }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(G.M.pr);
    ["uL0", "uL1", "uL2", "uL3", "uL4", "uMist", "uText", "uFog", "uFrag", "uDash"].forEach((nm, i) => gl.uniform1i(G.M.u[nm], i));
    // атлас обрывков
    const c = document.createElement("canvas"), x = c.getContext("2d"); c.width = 1024; c.height = BITS.length * 32;
    x.font = "500 21px ui-monospace, 'SF Mono', Menlo, Consolas, monospace"; x.fillStyle = "#fff"; x.textBaseline = "middle";
    G.bitW = BITS.map((s, i) => { x.fillText(s, 0, i * 32 + 17); return Math.min(1024, x.measureText(s).width) / 2; });
    gl.bindTexture(gl.TEXTURE_2D, G.tex[8]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    G.fragW = 512; G.fragH = BITS.length * 16;
    return true;
  }
  // текстура сцены для перехода: та же картинка, уменьшенная до 1600 (под искажениями детали не нужны)
  function loadTex(i, src) {
    if (!G) return;
    const put = (im) => {
      if (!G) return;
      const k = Math.min(1, 1600 / im.naturalWidth), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      gl.bindTexture(gl.TEXTURE_2D, G.tex[i]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      G.ok[i] = 1; G.have = G.ok.every(Boolean); kick();
    };
    if (typeof src !== "string") { put(src); return; }
    const im = new Image(); im.src = src; im.decode().then(() => put(im), () => {});
  }

  // канвас: на обложке полоса дымки в разрешении экрана, во время перехода весь экран в css px
  const dprNow = () => Math.min(devicePixelRatio || 1, 2);
  function canvasMode(full) {
    const [fx, fy, fw, fh] = G.frect;
    const k = full ? 1 : dprNow();
    const x = full ? 0 : Math.max(0, Math.floor(fx * vw)), y = full ? 0 : Math.max(0, Math.floor((1 - fy - fh) * vh));
    const w = full ? vw : Math.min(vw, Math.ceil((fx + fw) * vw)) - x, h = full ? vh : Math.min(vh, Math.ceil((1 - fy) * vh)) - y;
    const key = [x, y, w, h, k].join();
    if (key === G.cm) return;
    G.cm = key; G.org = [x, vh - y - h]; G.k = k;
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const st = cv.style; st.left = x + "px"; st.top = y + "px"; st.width = w + "px"; st.height = h + "px";
  }
  function resize() { if (G) G.cm = ""; }

  // Знаки и логотип рисуются в текстуру по своим местам в DOM: R чёткие, G размытая тень (для растекания и направления штриха).
  const LOGO = [...motto.querySelectorAll(".logo path")].map((pth) => new Path2D(pth.getAttribute("d")));
  function drawText() {
    if (!G || !G.fontReady) return;
    const PAD = 64, dpr = dprNow();
    const bx = motto.getBoundingClientRect();
    const W = Math.ceil((bx.width + PAD * 2) * dpr), H = Math.ceil((bx.height + PAD * 2) * dpr);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
    const X = (px) => (px - bx.left + PAD) * dpr, Y = (py) => (py - bx.top + PAD) * dpr;
    const cs = getComputedStyle(motto), font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
    const kj = [...motto.querySelectorAll(".kj")].map((e) => { const b = e.getBoundingClientRect(); return { ch: e.textContent, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; });
    const lr = motto.querySelector(".logo").getBoundingClientRect();
    const all = (ox) => {
      x.font = font; x.textAlign = "center"; x.textBaseline = "alphabetic";
      kj.forEach((g) => { const m = x.measureText(g.ch); x.fillText(g.ch, X(g.cx) + ox, Y(g.cy) + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2); });
      x.save(); x.translate(X(lr.left) + ox, Y(lr.top)); x.scale(lr.width * dpr / 220, lr.height * dpr / 220);
      LOGO.forEach((pth) => x.fill(pth)); x.restore();
    };
    // G: только тень, сами знаки уводим за край
    x.save(); x.shadowColor = "#0f0"; x.shadowBlur = 14 * dpr; x.shadowOffsetX = W + 4000; x.fillStyle = "#0f0";
    all(-(W + 4000)); x.restore();
    x.globalCompositeOperation = "lighter"; x.fillStyle = "#f00"; all(0);
    gl.bindTexture(gl.TEXTURE_2D, G.tex[6]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    G.rect = [(bx.left - PAD) / vw, 1 - (bx.bottom + PAD) / vh, (bx.width + PAD * 2) / vw, (bx.height + PAD * 2) / vh];
    // дымка: эллипс вокруг надписи, шире и выше её; за его пределами канвас не рисуется. FBO дымки в половину css px
    const fw = bx.width * 1.6 + 160, fh = bx.height * 3.4 + 120, fx = bx.left + bx.width / 2, fy = bx.top + bx.height / 2;
    G.frect = [(fx - fw / 2) / vw, 1 - (fy + fh / 2) / vh, fw / vw, fh / vh];
    G.fw = Math.ceil(fw / 2); G.fh = Math.ceil(fh / 2);
    gl.bindTexture(gl.TEXTURE_2D, G.tex[7]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, G.fw, G.fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.tex[7], 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    G.cm = "";
    // знаки слева направо (匠 心 логотип 遊 創); состояние пружин переживает resize
    const pos = [...kj.slice(0, 2), { cx: lr.left + lr.width / 2, cy: lr.top + lr.height / 2 }, ...kj.slice(2)];
    const hw = parseFloat(cs.fontSize) / 2;
    pos.forEach((g, i) => { GLY[i] = Object.assign(GLY[i] || { d: 0, v: 0, auto: 0 }, { x: g.cx, y: g.cy, hw }); });
    root.classList.add("inked");
  }

  // снимок дашборда для перехода: 2D-канвас в css px с фоном, плашками (фон и рамки элементов) и текстом.
  // Строки дашборда в переходе въезжают из этого снимка. Пока блок не появился, на месте его текста те же
  // иероглифы, с которых начнётся появление (как в reveal), иначе настоящие слова. Без сдвига появления.
  function snapDash() {
    if (!G || mode === "page") return;
    const key = [vw, vh, theme, document.querySelectorAll("#page .rv-seen").length, page.childElementCount].join();
    if (key === G.snap) return;
    G.snap = key;
    const c = G.snapC ||= document.createElement("canvas"); c.width = vw; c.height = vh;
    const x = c.getContext("2d"), m = /,\s*([\d.-]+)px/.exec(page.style.transform || ""), ty = m ? +m[1] : 0;
    const css = (v) => { const [r, g, b, a] = rgb(v); return a > .02 ? `rgba(${r * 255},${g * 255},${b * 255},${a})` : ""; };
    x.fillStyle = getComputedStyle(body).backgroundColor; x.fillRect(0, 0, vw, vh);
    const seen = (r) => r.width > 0 && r.height > 0 && r.bottom - ty > 0 && r.top - ty < vh;
    // блоки, которые ещё не появлялись, в снимок не попадают: до reveal на их месте пустой фон, без «готовых» карточек
    const unseen = (e) => html.classList.contains("rv-on") && e.closest("[data-rv]:not(.rv-seen)");
    for (const e of page.querySelectorAll("*")) {
      if (e.closest("svg") || e.matches(".rv-o") || unseen(e)) continue;
      const r = e.getBoundingClientRect(); if (!seen(r)) continue;
      // картинки (обложки карточек, баннер): в снимок как есть, с обрезкой по рамке родителя (object-fit: cover)
      if (e.tagName === "IMG") {
        if (!e.complete || !e.naturalWidth) continue;
        const k = Math.max(r.width / e.naturalWidth, r.height / e.naturalHeight), sw = r.width / k, sh = r.height / k;
        try { x.drawImage(e, (e.naturalWidth - sw) / 2, (e.naturalHeight - sh) / 2, sw, sh, r.left, r.top - ty, r.width, r.height); } catch (er) {}
        continue;
      }
      const cs = getComputedStyle(e), bg = css(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth), bc = bw > 0 && css(cs.borderTopColor);
      if (!bg && !bc) continue;
      x.beginPath(); x.roundRect(r.left + bw / 2, r.top - ty + bw / 2, r.width - bw, r.height - bw, Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.height / 2));
      if (bg) { x.fillStyle = bg; x.fill(); }
      if (bc) { x.strokeStyle = bc; x.lineWidth = bw; x.stroke(); }
    }
    x.textBaseline = "middle";
    const rg = document.createRange(), wk = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let n = wk.nextNode(); n; n = wk.nextNode()) {
      const e = n.parentElement; if (!n.data.trim() || !e || e.closest("svg, .rv-o") || unseen(e)) continue;
      const cs = getComputedStyle(e), blk = e.closest("[data-rv]");
      x.fillStyle = cs.color;
      if (blk && !blk.classList.contains("rv-seen") && e.matches(RV_TEXT) && !e.children.length && html.classList.contains("rv-on")) {
        const r = e.getBoundingClientRect(); if (!seen(r)) continue;
        const fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.4, K = [...(blk.dataset.rv || "日")];
        const k = Array.from({ length: Math.max(1, Math.min(3, Math.round(e.textContent.trim().length / 10))) }, (_, i) => K[i % K.length]).join("");
        x.font = `700 ${fs}px 'Shippori Mincho', 'Hiragino Mincho ProN', serif`; x.letterSpacing = ".12em";
        x.fillText(k, r.left + parseFloat(cs.paddingLeft), r.top - ty + parseFloat(cs.paddingTop) + lh / 2);
        continue;
      }
      x.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; x.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      const up = cs.textTransform === "uppercase";
      for (const w of n.data.matchAll(/\S+/g)) {
        rg.setStart(n, w.index); rg.setEnd(n, w.index + w[0].length);
        const r = rg.getBoundingClientRect(); if (!seen(r)) continue;
        x.fillText(up ? w[0].toUpperCase() : w[0], r.left, r.top - ty + r.height / 2);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, G.tex[9]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  // снимок заранее, в простое: при старте перехода он обычно уже готов
  let snapT = 0;
  const snapLater = (ms = 400) => { clearTimeout(snapT); snapT = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => snapDash()), ms); };
  addEventListener("site:data", () => snapLater(), { once: true });

  // обрывки этого кадра: зависят только от p (обратный ход показывает те же), видны в середине перехода
  const frBuf = new Float32Array(32), faBuf = new Float32Array(16);
  const rh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  function bits(p) {
    const e = Math.sin(Math.PI * p), beat = Math.floor(p * 9);
    frBuf.fill(0); faBuf.fill(0);
    if (!G || e < .35 || vw < 600) return;
    for (let i = 0; i < 6; i++) {
      if (rh(i, beat) > .5) continue;
      const row = Math.floor(rh(i + 7, beat) * BITS.length), w = G.bitW[row] * (.45 + .55 * rh(i + 3, beat));
      frBuf.set([Math.round(24 + rh(i + 1, beat) * (vw - w - 48)), Math.round(24 + rh(i + 2, beat) * (vh - 64)), Math.round(w), 16], i * 4);
      faBuf.set([row, Math.min(1, (e - .35) * 2.5) * .7], i * 2);
    }
  }

  const wkBuf = new Float32Array(WAKE * 4), wsBuf = new Float32Array(WAKE), glBuf = new Float32Array(20), rects = new Float32Array(32);
  function draw(T, full) {
    wake.forEach((w, i) => { wkBuf.set(w.slice(0, 4), i * 4); wsBuf[i] = w[4]; });
    for (let i = 0; i < 5; i++) { const g = GLY[i]; glBuf.set(g ? [g.x / vw, 1 - g.y / vh, g.hw / vw, Math.max(0, g.d)] : [0, 0, 1, 0], i * 4); }
    const [cPaper, cInk, cAcc] = pal, dark = body.classList.contains("dark") ? 1 : 0;
    // 1) дымка в FBO (половина css px), без смешивания
    const F = G.F, fu = F.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fb); gl.viewport(0, 0, G.fw, G.fh); gl.useProgram(F.pr);
    gl.uniform2f(fu.uView, vw, vh); gl.uniform2f(fu.uFSize, G.fw, G.fh); gl.uniform4f(fu.uFRect, ...G.frect); gl.uniform1f(fu.uT, T); gl.uniform1f(fu.uDark, dark);
    gl.uniform4fv(fu.uWk, wkBuf); gl.uniform1fv(fu.uWs, wsBuf); gl.uniform3fv(fu.uInk, cInk); gl.uniform3fv(fu.uPaper, cPaper);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 2) надпись над дымкой (обложка) или весь переход
    canvasMode(full);
    const M = G.M, u = M.u;
    gl.viewport(0, 0, cv.width, cv.height); gl.useProgram(M.pr);
    G.tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(u.uView, vw, vh); gl.uniform2f(u.uOrg, G.org[0], G.org[1]); gl.uniform1f(u.uK, G.k);
    gl.uniform1f(u.uP, full ? p : 0); gl.uniform1f(u.uT, T); gl.uniform1f(u.uHave, G.have ? 1 : 0); gl.uniform1f(u.uDark, dark);
    gl.uniform4f(u.uTRect, ...G.rect); gl.uniform4f(u.uFRect, ...G.frect); gl.uniform1f(u.uMotion, reduced ? 0 : 1);
    gl.uniform4fv(u.uGl, glBuf); gl.uniform2f(u.uCur, cur.x, vh - cur.y);
    gl.uniform3fv(u.uInk, cInk); gl.uniform3fv(u.uAcc, cAcc); gl.uniform3fv(u.uPaper, cPaper);
    if (full) {
      LAYERS.forEach((L, i) => {
        const w = (L.mist ? L.tw : L.bw) * L.s, h = (L.mist ? L.th : L.bh) * L.s;
        const x = L.bx + L.cx + (L.bw - L.bw * L.s) / 2, y = L.by + L.cy + (L.bh - L.bh * L.s) / 2;
        rects.set([x / vw, 1 - (y + h) / vh, w / vw, h / vh], i * 4);
      });
      const mo = LAYERS.filter((L) => L.mist).map((L) => L.mist.o * mistO);
      gl.uniform4fv(u.uR, rects); gl.uniform3f(u.uMO, mo[0], mo[1], mo[2]);
      gl.uniform1f(u.uGhost, G.ghost);
      bits(p); gl.uniform4fv(u.uFr, frBuf); gl.uniform2fv(u.uFa, faBuf); gl.uniform1f(u.uFragW, G.fragW); gl.uniform1f(u.uFragH, G.fragH);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // кадр: сцена (transform слоёв) каждый кадр; канвас каждый кадр, пока что-то движется (курсор, след в дымке,
  // пружины знаков, переход), в покое 30 Гц: дымка плывёт медленно, разницы не видно, а GPU отдыхает
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
    stepTransition(dt);
    if (mode === "page" || document.hidden) { last = 0; return; }
    const T = reduced ? 30 : 30 + (now - t0) / 1000;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.5);   // лерп курсора с инерцией
    mouse.x += (mouse.tx - mouse.x) * k; mouse.y += (mouse.ty - mouse.y) * k;
    stepGlyphs(dt, T);
    placeLayers(T, dt);
    let live = false;
    for (const w of wake) if (w[4] > 0) { w[4] = Math.max(0, w[4] - dt * .4); live = true; }
    if (G && G.fw) {
      const full = p > 0 && !fade();
      live = live || full || (cur.on && now - cur.t < 300) || GLY.some((g) => Math.abs(g.d) > .003 || Math.abs(g.v) > .01);
      if (live || now - G.last > 32) { draw(T, full); G.last = now; }
    }
    const busy = !reduced || p !== target || Math.abs(mouse.tx - mouse.x) > .001;
    if (busy && !frozen) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && mode !== "page" && !document.hidden) raf = requestAnimationFrame(frame); }

  layout();
  if (initGL()) {
    resize();
    IMGS.forEach((L, i) => { if (L.img.complete && L.img.naturalWidth) loadTex(i, L.img); });
    loadTex(5, mistSrc);
    const fam = "700 40px 'Shippori Mincho'";
    const fontLoad = document.fonts ? Promise.race([document.fonts.load(fam, "匠心遊創"), new Promise((r) => setTimeout(r, 3000))]) : Promise.resolve();
    fontLoad.catch(() => {}).then(() => { if (G) { G.fontReady = true; drawText(); kick(); } });
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; G = null; root.classList.remove("inked"); cv.style.display = "none"; apply(); });
  }
  let rz = 0;
  addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { layout(); if (G) { resize(); drawText(); snapLater(); } kick(); }); });
  document.addEventListener("visibilitychange", () => { last = 0; kick(); });
  mq.addEventListener?.("change", () => { reduced = mq.matches; LAYERS.forEach((L) => { L.x = NaN; }); kick(); });
  new MutationObserver(() => { pal = readPal(); readMist(); pickImages(); snapLater(); kick(); }).observe(body, { attributes: true, attributeFilter: ["class"] });

  // проверка и скриншоты: ?nocover (или любой #адрес) сразу открывает контент, ?coverp=0.5 замораживает кадр перехода
  window.__cover = {
    go: () => go(1), back: () => go(-1), get mode() { return mode; }, get p() { return p; }, get ready() { return !!(G && G.have && G.fontReady); },
    freeze(v) { frozen = true; mode = "move"; p = target = v; leave(); page.inert = true; apply(); snapDash(); last = 0; raf = 0; frame(performance.now()); },
    ink(x, y) { pointer(x, y, true); kick(); },
    get glyphs() { return GLY.map((g) => ({ x: g.x, y: g.y, d: +g.d.toFixed(3) })); },
  };
  if (qs.has("nocover") || location.hash.length > 1) { mode = "page"; p = target = 1; leaveSent = true; html.classList.remove("cover-on"); root.inert = true; page.inert = false; dispatchEvent(new CustomEvent("cover:leave", { detail: { delay: 0 } })); }
  else if (qs.get("coverp") != null) { const v = parseFloat(qs.get("coverp")); const w = () => window.__cover.ready ? window.__cover.freeze(v) : setTimeout(w, 50); w(); }
  apply(); kick();
})();
