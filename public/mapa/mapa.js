(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const VB0 = { x: 40, y: 15, w: 1972, h: 1791 }; // mesmo recorte do scripts/preparar-mapa.py
  const LOCAIS = {
    "palco-a": { nome: "Palco de treino A", sub: "Treinos da Artística Nível 1", link: "/n1", rotulo: "Agendar treino N1" },
    "palco-b": { nome: "Palco de treino B", sub: "Treinos da Artística Nível 2", link: "/n2", rotulo: "Agendar treino N2" },
    "palco-principal": { nome: "Palco principal", sub: "Apresentações da Artística" },
    "arena-treino-n1": { nome: "Arena de treino N1", sub: "Treinos do Resgate Nível 1" },
    "arena-treino-n2": { nome: "Arena de treino N2", sub: "Treinos do Resgate Nível 2" },
  };
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let svg = null, equipes = [], porMesa = {}, vb = { ...VB0 }, anim = 0;

  /* ---------- viewBox: zoom e arrastar ---------- */
  const tam = () => ({ w: stage.clientWidth || 1, h: stage.clientHeight || 1 });
  const upp = () => vb.w / tam().w; // unidades do SVG por pixel

  function ajustarAspecto(v) {
    const { w, h } = tam();
    const alvo = w / h;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    let nw = v.w, nh = v.h;
    if (nw / nh > alvo) nh = nw / alvo; else nw = nh * alvo;
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
  }

  function limitar(v) {
    const cheio = ajustarAspecto(VB0);
    const maxW = cheio.w * 1.15, minW = Math.max(220, tam().w * 0.18);
    let w = Math.min(maxW, Math.max(minW, v.w));
    let h = w * (tam().h / tam().w);
    let cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    cx = Math.min(VB0.x + VB0.w, Math.max(VB0.x, cx));
    cy = Math.min(VB0.y + VB0.h, Math.max(VB0.y, cy));
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  function aplicar(v) {
    vb = limitar(v);
    if (svg) svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }

  function animarPara(alvo) {
    cancelAnimationFrame(anim);
    const fim = limitar(alvo);
    if (reduzir) return aplicar(fim);
    const ini = { ...vb }, t0 = performance.now(), dur = 380;
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      aplicar({ x: ini.x + (fim.x - ini.x) * e, y: ini.y + (fim.y - ini.y) * e, w: ini.w + (fim.w - ini.w) * e, h: ini.h + (fim.h - ini.h) * e });
      if (k < 1) anim = requestAnimationFrame(passo);
    };
    anim = requestAnimationFrame(passo);
  }

  function zoomEm(fator, px, py) {
    const u = upp(), ux = vb.x + px * u, uy = vb.y + py * u;
    const nu = u / fator, { w, h } = tam();
    aplicar({ x: ux - px * nu, y: uy - py * nu, w: w * nu, h: h * nu });
  }

  function verTudo(animar = true) { const v = ajustarAspecto(VB0); animar ? animarPara(v) : aplicar(v); }

  function focar(x, y, largura) {
    const { w, h } = tam();
    const nu = Math.max(largura / Math.min(w, h), 0.35);
    animarPara({ x: x - (w * nu) / 2, y: y - (h * nu) / 2, w: w * nu, h: h * nu });
  }

  /* ---------- ponteiros: arrastar, pinça, toque ---------- */
  const ptrs = new Map();
  let ultimaDist = 0, ultimoMeio = null, movido = 0, alvoToque = null;
  const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".zoom, .info")) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    movido = 0; alvoToque = e.target.closest(".mesa, .local");
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; ultimaDist = Math.hypot(a.x - b.x, a.y - b.y); ultimoMeio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    stage.classList.add("dragging");
  });

  stage.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const antes = ptrs.get(e.pointerId), agora = local(e);
    ptrs.set(e.pointerId, agora);
    cancelAnimationFrame(anim);
    if (ptrs.size === 1) {
      const dx = agora.x - antes.x, dy = agora.y - antes.y, u = upp();
      movido += Math.abs(dx) + Math.abs(dy);
      aplicar({ ...vb, x: vb.x - dx * u, y: vb.y - dy * u });
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      movido += 10;
      if (ultimaDist) zoomEm(dist / ultimaDist, meio.x, meio.y);
      if (ultimoMeio) { const u = upp(); aplicar({ ...vb, x: vb.x - (meio.x - ultimoMeio.x) * u, y: vb.y - (meio.y - ultimoMeio.y) * u }); }
      ultimaDist = dist; ultimoMeio = meio;
    }
  });

  const soltar = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) { ultimaDist = 0; ultimoMeio = null; }
    if (!ptrs.size) {
      stage.classList.remove("dragging");
      if (movido < 8 && alvoToque) selecionar(alvoToque.id, { mover: false });
    }
  };
  stage.addEventListener("pointerup", soltar);
  stage.addEventListener("pointercancel", soltar);

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e);
    zoomEm(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
  }, { passive: false });

  $("zin").addEventListener("click", () => { const { w, h } = tam(); zoomEm(1.5, w / 2, h / 2); });
  $("zout").addEventListener("click", () => { const { w, h } = tam(); zoomEm(1 / 1.5, w / 2, h / 2); });
  $("zfit").addEventListener("click", () => { limparDestaque(); verTudo(); });

  let resizeT;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => aplicar(ajustarAspecto(vb)), 80); });

  /* ---------- destaque e cartão ---------- */
  function limparDestaque() {
    if (!svg) return;
    svg.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
    svg.querySelectorAll(".pulse").forEach((n) => n.remove());
    $("info").hidden = true;
  }

  function selecionar(id, { mover = true } = {}) {
    if (!svg) return;
    const g = svg.getElementById ? svg.getElementById(id) : svg.querySelector("#" + CSS.escape(id));
    if (!g) return;
    limparDestaque();
    g.classList.add("hl");
    const x = Number(g.dataset.x), y = Number(g.dataset.y);
    const raio = g.dataset.w ? Math.max(Number(g.dataset.w), Number(g.dataset.h)) / 2 + 8 : 40;
    const pulso = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pulso.setAttribute("class", "pulse"); pulso.setAttribute("cx", x); pulso.setAttribute("cy", y); pulso.setAttribute("r", raio);
    svg.appendChild(pulso);
    if (mover) focar(x, y, g.dataset.w ? 700 : 520);
    mostrarInfo(id);
    history.replaceState(null, "", "#" + id);
  }

  function mostrarInfo(id) {
    const info = $("info");
    info.replaceChildren();
    const titulo = document.createElement("strong"), sub = document.createElement("span");
    const m = id.match(/^mesa-(\d+)$/);
    if (m) {
      const eq = porMesa[Number(m[1])];
      titulo.textContent = "Mesa " + m[1] + (eq ? " · " + eq.equipe : "");
      sub.textContent = eq ? eq.tipo + " · Nível " + eq.nivel : "";
      info.append(titulo, sub);
    } else if (LOCAIS[id]) {
      const l = LOCAIS[id];
      titulo.textContent = l.nome; sub.textContent = l.sub;
      info.append(titulo, sub);
      if (l.link) {
        const a = document.createElement("a"); a.href = l.link; a.textContent = l.rotulo;
        a.style.cssText = "display:inline-block;margin-top:6px;font-weight:600;color:#7A1C1C";
        info.append(document.createElement("br"), a);
      }
    } else return;
    info.hidden = false;
  }

  /* ---------- busca ---------- */
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = $("q"), lista = $("sugestoes"), caixa = $("busca");
  let resultados = [], ativo = -1;

  function buscar(texto) {
    const t = norm(texto);
    if (!t) return [];
    const num = /^\d+$/.test(t) ? Number(t) : null;
    const pont = (e) => {
      if (num != null) return e.mesa === num ? 0 : String(e.mesa).startsWith(t) ? 1 : 9;
      const n = norm(e.equipe);
      return n.startsWith(t) ? 2 : n.includes(t) ? 3 : 9;
    };
    return equipes.map((e) => [pont(e), e]).filter(([p]) => p < 9).sort((a, b) => a[0] - b[0] || a[1].mesa - b[1].mesa).slice(0, 8).map(([, e]) => e);
  }

  function desenharLista() {
    lista.replaceChildren(...resultados.map((e, i) => {
      const li = document.createElement("li");
      li.id = "op-" + e.mesa; li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === ativo));
      const n = document.createElement("span"); n.className = "n"; n.textContent = e.mesa;
      const d = document.createElement("span"); d.textContent = e.equipe;
      const t = document.createElement("span"); t.className = "t"; t.textContent = e.tipo + " · Nível " + e.nivel;
      d.append(t); li.append(n, d);
      li.addEventListener("pointerdown", (ev) => { ev.preventDefault(); escolher(e); });
      return li;
    }));
    if (!resultados.length && q.value.trim()) {
      const li = document.createElement("li"); li.textContent = "Nenhuma equipe ou mesa encontrada."; li.style.cursor = "default";
      lista.append(li);
    }
    const aberto = !!q.value.trim();
    lista.hidden = !aberto; caixa.setAttribute("aria-expanded", String(aberto));
    q.setAttribute("aria-activedescendant", ativo >= 0 && resultados[ativo] ? "op-" + resultados[ativo].mesa : "");
  }

  function escolher(e) {
    q.value = "Mesa " + e.mesa + " · " + e.equipe;
    resultados = []; ativo = -1; lista.hidden = true; caixa.setAttribute("aria-expanded", "false");
    q.blur();
    selecionar("mesa-" + e.mesa);
  }

  q.addEventListener("input", () => { resultados = buscar(q.value); ativo = resultados.length ? 0 : -1; desenharLista(); });
  q.addEventListener("focus", () => { if (q.value.startsWith("Mesa ")) q.select(); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { ativo = Math.min(resultados.length - 1, ativo + 1); desenharLista(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ativo = Math.max(0, ativo - 1); desenharLista(); e.preventDefault(); }
    else if (e.key === "Enter") { if (resultados[ativo]) escolher(resultados[ativo]); e.preventDefault(); }
    else if (e.key === "Escape") { lista.hidden = true; caixa.setAttribute("aria-expanded", "false"); }
  });
  q.addEventListener("blur", () => setTimeout(() => { lista.hidden = true; caixa.setAttribute("aria-expanded", "false"); }, 120));

  document.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => { q.value = ""; selecionar(b.dataset.ir); }));

  /* ---------- carga ---------- */
  function irParaHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && /^(mesa-\d+|palco-[a-z]+|arena-treino-n[12])$/.test(id)) selecionar(id); else verTudo(false);
  }

  Promise.all([
    fetch("/mapa/mapa.svg").then((r) => r.text()),
    fetch("/mapa/equipes.json").then((r) => r.json()),
  ]).then(([texto, lista]) => {
    equipes = lista;
    for (const e of equipes) porMesa[e.mesa] = e;
    const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
    svg = document.importNode(doc.documentElement, true);
    stage.prepend(svg);
    irParaHash();
  }).catch(() => {
    const p = document.createElement("p"); p.className = "empty";
    p.textContent = "Não foi possível carregar o mapa. Use o botão Baixar PDF.";
    stage.prepend(p);
  });
  addEventListener("hashchange", irParaHash);
})();
