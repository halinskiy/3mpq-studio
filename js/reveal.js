/* ---------- появление: иероглифы → глич → допечатка (reveal) ----------
   Модуль из дневника (keitaro-web/reveal). Блок с data-rv="знак" скрыт, пока не попадёт в экран, потом один раз собирается:
   на месте текста 1-3 иероглифа, 2-3 кадра глича полосами, перебор латиницы и каны оседает в текст слева направо.
   Карточки собираются из полос, цифры отсчитывают (и с десятыми), кольца оценок дорисовываются.
   Длительности в токенах --rv-*. prefers-reduced-motion: всё видно сразу. */
const RV_TEXT = "h1, h2, h3, .kicker, .lede, .card-line, .feat-title, .feat-line, .foot-title, .stats span, .bar-h span, .total span, .p-meta span, .seg button span:first-child";   // его же рисует снимок перехода
const reveal = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const none = { run() {}, observe() {}, replay() {} };
  if (reduced) { document.documentElement.classList.remove("rv-on"); return none; }
  const rs = getComputedStyle(document.documentElement), ms = (n) => parseFloat(rs.getPropertyValue(n)) || 0;
  const T = { kanji: ms("--rv-kanji"), glitch: ms("--rv-glitch"), settle: ms("--rv-settle"), shape: ms("--rv-shape"), stagger: ms("--rv-stagger"), count: ms("--rv-count"), draw: ms("--rv-draw") };
  const SHAPE = ".card, .feat, .scores, .stage, .gal figure";
  // латиница втрое чаще каны: кана шире, перебор не должен раздувать строку
  const LAT = "abcdefghijklmnopqrstuvwxyzABCDEFGHKLMNPRSTUVXYZ", POOL = LAT + LAT + LAT + "アイウエカキクコサシスセタチツテナノハヒフマミムメヤユラリルロワン";
  const rnd = () => POOL[(Math.random() * POOL.length) | 0];
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const jobs = new Set(); let raf = 0;

  function text(e, delay, K) {
    if (e.children.length || !e.textContent.trim() || !e.getClientRects().length || e.classList.contains("rv-t")) return;
    const str = e.textContent, long = str.length > 64;
    const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const o = document.createElement("span"); o.className = "rv-o"; o.setAttribute("aria-hidden", "true"); o.style.color = cs.color;
    if (e.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) < lh * 1.5) o.style.whiteSpace = "nowrap";
    const n = Math.max(1, Math.min(3, Math.round(str.trim().length / 10)));
    const glyphs = [...K];
    o.dataset.k = Array.from({ length: n }, (_, i) => glyphs[i % glyphs.length]).join("");
    e.classList.add("rv-t"); e.append(o);
    const jit = Array.from(str, () => Math.random());
    jobs.add({ kind: "text", e, o, str, long, jit, t0: performance.now() + delay, phase: 0, last: 0 });
  }
  function scramble(j, k) {
    let out = "";
    for (let i = 0; i < j.str.length; i++) { const ch = j.str[i]; out += /[\s.·,:+&/-]/.test(ch) || (i / j.str.length) * 0.82 + j.jit[i] * 0.18 < k ? ch : rnd(); }
    return out;
  }
  function stepText(j, now) {
    const t = now - j.t0; if (t < 0) return;
    if (j.phase === 0) { j.phase = 1; j.o.className = "rv-o kj"; j.o.textContent = j.o.dataset.k; }
    if (t < T.kanji) return;
    if (j.phase === 1) { j.phase = 2; j.o.className = "rv-o gl"; j.o.textContent = scramble(j, 0); j.last = now; }
    const k = (t - T.kanji - T.glitch) / T.settle;
    if (j.long ? t >= T.kanji + T.glitch : k >= 1) {
      j.o.remove(); j.e.classList.remove("rv-t");
      if (j.long) { j.e.classList.add("rv-fade"); j.e.addEventListener("animationend", () => j.e.classList.remove("rv-fade"), { once: true }); }
      jobs.delete(j); return;
    }
    if (now - j.last > 48) { j.last = now; j.o.textContent = scramble(j, j.long ? 0 : k); }
  }
  // цифры: целые и с одним знаком после запятой (оценки)
  function count(e, delay) {
    const node = [...e.childNodes].find((n) => n.nodeType === 3), v = node && parseFloat(node.data);
    if (!node || isNaN(v)) return;
    const dec = (node.data.split(".")[1] || "").length;
    node.data = (0).toFixed(dec);
    jobs.add({ kind: "num", node, v, dec, t0: performance.now() + delay });
  }
  function stepNum(j, now) {
    const t = (now - j.t0) / T.count; if (t < 0) return;
    j.node.data = (j.v * ease(Math.min(1, t))).toFixed(j.dec);
    if (t >= 1) { j.node.data = j.v.toFixed(j.dec); jobs.delete(j); }
  }
  function tick(now) {
    raf = 0;
    jobs.forEach((j) => (j.kind === "text" ? stepText(j, now) : stepNum(j, now)));
    if (jobs.size) raf = requestAnimationFrame(tick);
  }
  const once = (e, cls) => e.addEventListener("animationend", (ev) => { if (ev.target === e) e.classList.remove(cls); });
  function play(e, cls, delay) { e.style.setProperty("--rv-d", Math.round(delay) + "ms"); e.classList.add(cls); once(e, cls); }

  function run(block) {
    const K = block.dataset.rv || "作";
    block.classList.add("rv-seen");
    const own = (sel) => [...(block.matches(sel) ? [block] : []), ...block.querySelectorAll(sel)];
    const shapeAt = new Map();
    own(SHAPE).forEach((s, i) => { const d = Math.min(i * T.stagger, 420); shapeAt.set(s, d); play(s, "rv-s", d); });
    const base = (e) => { const s = e.closest(SHAPE); return shapeAt.has(s) ? shapeAt.get(s) + T.shape * 0.45 : 0; };
    const order = new Map();
    own(RV_TEXT).forEach((e) => {
      const host = e.closest(SHAPE) || block, i = order.get(host) || 0; order.set(host, i + 1);
      text(e, base(e) + Math.min(i * T.stagger, 360), K);
    });
    own(".stats b, .ring b, .bar-v b").forEach((e) => count(e, base(e) + T.kanji));
    own(".ring .main").forEach((c) => play(c, "rv-line", base(c) + T.kanji));
    own(".track i").forEach((c, i) => play(c, "rv-grow", base(c) + T.kanji + i * T.stagger));
    if (!raf && jobs.size) raf = requestAnimationFrame(tick);
  }

  let io = null;
  const observe = (root = document) => root.querySelectorAll("[data-rv]:not(.rv-seen)").forEach((b) => io && io.observe(b));
  // после фильтра: уже видимый блок пересобирается заново (полосы и допечатка), без скрытия
  const replay = (block) => { block.querySelectorAll(".rv-t").forEach((e) => e.classList.remove("rv-t")); block.querySelectorAll(".rv-o").forEach((o) => o.remove()); run(block); };

  // старт: когда обложка начала уходить и данные пришли (или прошла секунда)
  let coverDelay = null, dataReady = false, started = false;
  function tryStart() {
    if (started || coverDelay == null || !dataReady) return;
    started = true;
    setTimeout(() => {
      io = new IntersectionObserver((list) => list.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); run(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
      observe();
    }, coverDelay);
  }
  addEventListener("cover:leave", (e) => { if (coverDelay == null) { coverDelay = e.detail?.delay || 0; tryStart(); } });
  const ready = () => { dataReady = true; tryStart(); };
  addEventListener("site:data", ready, { once: true });
  setTimeout(ready, 1200);
  return { run, observe, replay };
})();
