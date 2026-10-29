/* ---------- каталог: данные data/projects.json → шапка, баннер, фильтры, карточки, страница проекта (#slug) ----------
   Всё содержимое берётся из одного файла данных. Баннер показывает первый проект с featured: true.
   Страница проекта: оверлей со своим адресом, большой кадр с точками (hotspots), оценки, галерея, ссылки. */
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const CATS = [["all", "All"], ["games", "Games"], ["apps", "Apps & tools"], ["websites", "Websites"]];
  const ONE = { games: "game", apps: "app", websites: "website" };
  // действия: порядок, подпись, значок. Показываются только реальные ссылки из данных
  const ACTS = [["play", "Play", "i-play"], ["appStore", "App Store", "i-apple"], ["testFlight", "TestFlight", "i-flight"], ["download", "Download", "i-download"], ["visit", "Visit", "i-visit"], ["source", "Source", "i-code"]];
  // общий балл как у жюри: дизайн 40%, удобство 30%, креатив 20%, контент 10%
  const W = { design: .4, usability: .3, creativity: .2, content: .1 };
  const SC = [["design", "Design"], ["usability", "Usability"], ["creativity", "Creativity"], ["content", "Content"]];
  const KJ = { games: "遊", apps: "匠", websites: "道" };

  let all = [], cat = "all", lastFocus = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const icon = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  const total = (s) => Object.keys(W).reduce((a, k) => a + (s[k] || 0) * W[k], 0);
  const ext = (u) => /^https?:/.test(u);
  const actions = (p, cls = "btn sec sm", only) => ACTS.filter(([k]) => p.links?.[k] && (!only || only.includes(k)))
    .map(([k, label, ic]) => `<a class="${cls}" href="${esc(p.links[k])}"${ext(p.links[k]) ? ' target="_blank" rel="noopener"' : ""}>${icon(ic)}<span>${label}</span></a>`).join("");
  const pills = (p) => (p.platforms || []).map((x) => `<span class="pill">${esc(x)}</span>`).join("");
  const mainAct = (p) => ACTS.find(([k]) => p.links?.[k]);

  /* ---------- тема: только кнопкой, по умолчанию светлая ---------- */
  const themeBtn = $("theme");
  const syncTheme = () => {
    const d = body.classList.contains("dark");
    themeBtn.setAttribute("aria-pressed", String(d));
    themeBtn.querySelector("use").setAttribute("href", d ? "#i-sun" : "#i-moon");
    themeBtn.querySelector(".sr").textContent = d ? "Light theme" : "Dark theme";
  };
  themeBtn.addEventListener("click", () => {
    body.classList.toggle("dark");
    try { localStorage.setItem("3mpq-theme", body.classList.contains("dark") ? "dark" : "light"); } catch (e) {}
    syncTheme();
  });
  syncTheme();

  /* ---------- шапка: цифры считаются по данным ---------- */
  function renderStats() {
    const n = (c) => all.filter((p) => p.category === c).length;
    $("stats").innerHTML = [["games", "games"], ["apps", "apps & tools"], ["websites", "websites"]]
      .map(([c, t]) => `<li><b>${n(c)}</b><span>${t}</span></li>`).join("");
  }

  /* ---------- баннер: первый featured ---------- */
  function renderFeatured() {
    const p = all.find((x) => x.featured);
    const sec = $("featured");
    if (!p) { sec.remove(); return; }
    const b = p.banner || {};
    const art = b.art || p.cover;
    const m = mainAct(p);
    const tag = b.kicker || `Featured ${ONE[p.category] || "project"}`;
    sec.innerHTML = `<div class="wrap"><article class="feat">
      <div class="feat-art">${art ? `<img src="${esc(art)}" alt="" fetchpriority="high">` : ""}</div>
      <div class="feat-in">
        <p class="kicker">${esc(tag)}</p>
        <h2 class="feat-title">${esc(p.title)}</h2>
        <p class="feat-line">${esc(b.line || p.oneLiner)}</p>
        <div class="pills">${pills(p)}${b.price ? `<span class="pill">${esc(b.price)}</span>` : ""}</div>
        <div class="feat-cta">${m ? actions(p, "btn", [m[0]]) : ""}<a class="btn sec" href="#${esc(p.slug)}">See the case</a></div>
      </div>
      ${(b.shots || []).length ? `<div class="feat-shots" aria-hidden="true">${b.shots.slice(0, 3).map((s) => `<img src="${esc(s)}" alt="" loading="lazy">`).join("")}</div>` : ""}
    </article></div>`;
  }

  /* ---------- фильтры и карточки ---------- */
  function renderFilters() {
    $("filters").innerHTML = CATS.map(([k, t]) => {
      const n = k === "all" ? all.length : all.filter((p) => p.category === k).length;
      return `<button type="button" data-cat="${k}" aria-pressed="${k === cat}"><span>${t}</span><span class="n">${n}</span></button>`;
    }).join("");
  }
  function thumb(p) {
    if (p.cover) return `<div class="thumb${p.coverPortrait ? " portrait" : ""}"><img src="${esc(p.cover)}" alt="" loading="lazy" width="800" height="500"></div>`;
    // честного кадра нет: типографическая обложка (название, значок, знак)
    return `<div class="thumb"><div class="tcover">${p.icon ? `<img src="${esc(p.icon)}" alt="">` : ""}<i>${KJ[p.category] || "作"}</i><b>${esc(p.title)}</b></div></div>`;
  }
  function card(p) {
    return `<article class="card" data-slug="${esc(p.slug)}">
      <a class="card-open" href="#${esc(p.slug)}" aria-label="${esc(p.title)}: open the case"></a>
      ${thumb(p)}
      <div class="card-body">
        <div class="card-row"><h3>${esc(p.title)}</h3>${p.year ? `<span class="yr">${esc(p.year)}</span>` : ""}</div>
        <p class="card-line">${esc(p.oneLiner)}</p>
      </div>
      <div class="card-foot"><div class="pills">${pills(p)}</div><div class="acts">${actions(p)}</div></div>
    </article>`;
  }
  function renderGrid(animate) {
    const list = cat === "all" ? all : all.filter((p) => p.category === cat);
    const g = $("grid");
    g.innerHTML = list.map(card).join("") || `<p class="empty">Nothing here yet.</p>`;
    if (animate && $("work").classList.contains("rv-seen")) reveal.replay(g);
  }
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cat]"); if (!b || b.dataset.cat === cat) return;
    cat = b.dataset.cat;
    $("filters").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderGrid(true);
  });

  /* ---------- страница проекта ---------- */
  const proj = $("proj"), pbody = $("projBody");
  function ring(v, big) {
    const r = big ? 80 : 50, sw = big ? 10 : 8, s = (r + sw / 2) * 2;
    return `<div class="ring"><svg viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle class="bg" cx="${s / 2}" cy="${s / 2}" r="${r}"/><circle class="main" cx="${s / 2}" cy="${s / 2}" r="${r}" pathLength="1" stroke-dasharray="${(v / 10).toFixed(3)} 1"/></svg><b>${v.toFixed(1)}</b></div>`;
  }
  function scores(p) {
    const s = p.scores; if (!s) return "";
    return `<section class="sec" data-rv="評" aria-label="Scores"><div class="wrap"><div class="scores">
      <div class="total">${ring(total(s), true)}<span>Overall / 10</span></div>
      <div class="bars">${SC.map(([k, t]) => `<div class="bar"><p class="bar-h"><span>${t}</span><small>${Math.round(W[k] * 100)}%</small></p><div class="track"><i style="--v:${((s[k] || 0) / 10).toFixed(3)}"></i></div><p class="bar-v"><b>${(s[k] || 0).toFixed(1)}</b> / 10</p></div>`).join("")}</div>
      <p class="score-note">Studio self-assessment on a 10-point jury scale.</p>
    </div></div></section>`;
  }
  function stage(p, frame) {
    if (!frame) return "";
    const hs = (p.hotspots || []).map((h, i) => `<button class="hs" type="button" style="left:${Math.min(94, Math.max(6, h.x))}%;top:${Math.min(92, Math.max(8, h.y))}%" aria-expanded="false" aria-controls="tip" data-i="${i}" aria-label="${i + 1}: ${esc(h.title)}">${i + 1}</button>`).join("");
    const img = `<img src="${esc(frame)}" alt="${esc(p.title)}: main screen" class="frame-img">`;
    const tall = p.frameTall;
    return `<div class="stage${tall ? " tall" : ""}">${tall ? `<div class="frame">${img}${hs}</div>` : img + hs}<div class="tip" id="tip" role="status" hidden></div></div>
      ${(p.hotspots || []).length ? `<ol class="hs-list">${p.hotspots.map((h, i) => `<li data-i="${i}"><span class="num">${i + 1}</span><div><b>${esc(h.title)}</b><p>${esc(h.text)}</p></div></li>`).join("")}</ol>` : ""}`;
  }
  function renderProject(p) {
    const frame = p.frame || p.shots?.[0] || p.cover;
    const gal = (p.shots || []).filter((s) => s !== frame);
    const meta = [[CATS.find(([k]) => k === p.category)?.[1], ""], [p.year, ""], [p.client, "Client "]].filter(([v]) => v)
      .map(([v, pre]) => `<span>${pre ? `${pre}<b>${esc(v)}</b>` : esc(v)}</span>`).join("");
    const i = all.indexOf(p), next = all[(i + 1) % all.length];
    pbody.innerHTML = `
      <section class="sec" data-rv="${KJ[p.category] || "作"}"><div class="wrap">
        <div class="p-head">
          <div class="intro-text"><div class="p-meta">${meta}</div><h2 class="big" id="projTitle">${esc(p.title)}</h2><p class="lede">${esc(p.oneLiner)}</p><div class="pills">${pills(p)}</div></div>
          <div class="contacts">${actions(p, "btn")}</div>
        </div>
        ${stage(p, frame) || `<div class="stage"><div class="thumb">${thumb(p).replace(/^<div class="thumb[^"]*">|<\/div>$/g, "")}</div></div>`}
      </div></section>
      ${scores(p)}
      ${gal.length ? `<section class="sec" data-rv="影" aria-label="Gallery"><div class="wrap"><div class="gal">${gal.map((s) => `<figure${p.shotsTall ? ' class="tall"' : ""}><img src="${esc(s)}" alt="${esc(p.title)}: screen" loading="lazy"></figure>`).join("")}</div></div></section>` : ""}
      <section class="sec" data-rv="道"><div class="wrap"><div class="p-next">
        <a class="btn sec" href="#work" data-close>${icon("i-back")}<span>All work</span></a>
        <a class="btn sec" href="#${esc(next.slug)}"><span>Next: ${esc(next.title)}</span>${icon("i-visit")}</a>
      </div></div></section>`;
    $("projBarTitle").textContent = p.title;
    proj.scrollTop = 0;
    bindHotspots(p);
    reveal.observe(proj);
  }
  function bindHotspots(p) {
    const st = pbody.querySelector(".stage"), tip = pbody.querySelector("#tip");
    if (!st || !tip) return;
    let open = -1;
    const show = (i) => {
      pbody.querySelectorAll(".hs").forEach((b) => b.setAttribute("aria-expanded", String(+b.dataset.i === i)));
      pbody.querySelectorAll(".hs-list li").forEach((li) => li.classList.toggle("on", +li.dataset.i === i));
      open = i;
      if (i < 0) { tip.hidden = true; return; }
      const h = p.hotspots[i], btn = pbody.querySelector(`.hs[data-i="${i}"]`);
      tip.innerHTML = `<p class="kicker">${i + 1} / ${p.hotspots.length}</p><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p>`;
      tip.hidden = false;
      // подсказка рядом с точкой, внутри кадра: справа от точки, если она в левой половине, иначе слева
      const sr = st.getBoundingClientRect(), br = btn.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      const cx = br.left + br.width / 2 - sr.left, cy = br.top + br.height / 2 - sr.top;
      let x = cx < sr.width / 2 ? cx + 32 : cx - 32 - tw;
      x = Math.max(16, Math.min(sr.width - tw - 16, x));
      const y = Math.max(16, Math.min(sr.height - th - 16, cy - th / 2));
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    st.addEventListener("click", (e) => {
      const b = e.target.closest(".hs");
      if (b) { const i = +b.dataset.i; show(i === open ? -1 : i); if (matchMedia("(max-width: 640px)").matches) pbody.querySelector(`.hs-list li[data-i="${i}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
      if (!e.target.closest(".tip")) show(-1);
    });
    proj._hsClose = () => { if (open >= 0) { show(-1); return true; } return false; };
    // первая точка открыта сразу: видно, что кадр интерактивный
    if (p.hotspots?.length && !matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => show(0));
  }
  function openProject(p) {
    if (proj.hidden) lastFocus = document.activeElement;
    renderProject(p);
    proj.hidden = false; body.classList.add("locked");
    document.title = `${p.title} — 3mpq studio`;
    $("projBack").focus({ preventScroll: true });
  }
  function closeProject() {
    if (proj.hidden) return;
    proj.hidden = true; body.classList.remove("locked"); pbody.innerHTML = "";
    document.title = "3mpq studio — games, Mac & iOS tools, websites";
    const slug = lastFocus?.closest?.(".card")?.dataset.slug;
    const back = slug && document.querySelector(`.card[data-slug="${slug}"] .card-open`);
    (back || lastFocus)?.focus?.({ preventScroll: !!back });
    if (back) back.closest(".card").scrollIntoView({ block: "center" });
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const p = all.find((x) => x.slug === h);
    if (p) { openProject(p); return; }
    closeProject();
    if (h === "work") $("work").scrollIntoView();
  }
  // глубина: сколько страниц проектов открыто подряд поверх каталога (в history.state). «Назад» возвращает в каталог
  let depth = 0;
  addEventListener("hashchange", () => {
    const wasOpen = !proj.hidden;
    if (history.state && typeof history.state.d === "number") depth = history.state.d;
    else { depth = all.some((x) => x.slug === decodeURIComponent(location.hash.slice(1))) ? (wasOpen ? depth + 1 : 1) : 0; history.replaceState({ d: depth }, ""); }
    route();
  });
  const leave = () => { if (depth > 0) history.go(-depth); else { history.replaceState({ d: 0 }, "", "#work"); route(); } };
  $("projBack").addEventListener("click", leave);
  pbody.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) { e.preventDefault(); leave(); } });
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || proj.hidden) return;
    if (proj._hsClose && proj._hsClose()) return;
    leave();
  });
  $("toCover").addEventListener("click", () => window.__cover?.back());

  /* ---------- данные ---------- */
  fetch("data/projects.json").then((r) => r.json()).then((d) => {
    all = d.projects || d;
    renderStats(); renderFeatured(); renderFilters(); renderGrid(false);
    dispatchEvent(new CustomEvent("site:data"));
    if (location.hash.length > 1) route();
  }).catch((e) => { console.error("projects.json", e); dispatchEvent(new CustomEvent("site:data")); });
})();
