(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $("stage");
  const VB0 = { x: 40, y: 15, w: 1972, h: 1865 }; // mesmo recorte do scripts/preparar-mapa.py
  const LOCAIS = {
    "palco-1": { nome: "Palco de ensaio 1", sub: "Ensaios da Artística Nível 2 · perto da coordenação", link: "/n2", rotulo: "Agendar ensaio N2" },
    "palco-2": { nome: "Palco de ensaio 2", sub: "Ensaios da Artística Nível 1", link: "/n1", rotulo: "Agendar ensaio N1" },
    "palco-principal": { nome: "Palco principal", sub: "Apresentações da Artística" },
    "arena-treino-n1": { nome: "Arena de treino N1", sub: "Treinos do Resgate Nível 1" },
    "arena-treino-n2": { nome: "Arena de treino N2", sub: "Treinos do Resgate Nível 2" },
  };
  const reduzir = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- rotas a partir da entrada (mesma lógica do Guia de Mesas) ---------- */
  const R = {
    ex: 1085, ey: 1786, ymain: 986,
    arenas: [[506, 595, 720, 770], [1100, 595, 1309, 770]],
    X: [194.0, 312.9, 431.8, 550.7, 669.6, 788.5, 907.4, 1026.3, 1145.2, 1264.1, 1383.0, 1501.9, 1620.8, 1739.7, 1858.6],
    r6: [68, 75, 80, 87, 88, 89, 94, 101, 108, 113, 118, 125, 132, 139, 146],
    c7: [37, 36, 35, 34, 33], c8: [32, 31, 30, 29, 28],
    bot: [1059, 1151, 1243, 1335, 1427],
    land: [["perto do Palco de ensaio 2", 313, 1663], ["perto do Palco principal", 670, 1663], ["perto do Palco de ensaio 1", 1383, 1663],
      ["perto da Arena de treino N2", 613, 682], ["perto da Arena de treino N1", 1204, 682], ["perto da Sala da coordenação", 1693, 1365],
      ["em frente à Arena oficial 6", 477, 147], ["em frente à Arena oficial 5", 713, 147], ["em frente à Arena oficial 4", 949, 147],
      ["em frente à Arena oficial 3", 1185, 147], ["em frente à Arena oficial 2", 1421, 147], ["em frente à Arena oficial 1", 1657, 147]],
  };
  const ROTAS_LOCAIS = {
    "palco-principal": { pts: [[1085, 1786], [1085, 1663], [787, 1663]], passos: ["Entre: o Palco principal fica logo à sua esquerda."] },
    "palco-1": { pts: [[1085, 1786], [1085, 1663], [1266, 1663]], passos: ["Entre: o Palco de ensaio 1 fica logo à sua direita, perto da Sala da coordenação."] },
    "palco-2": { pts: [[1085, 1786], [1085, 1500], [491, 1500], [491, 1663], [430, 1663]], passos: [
      "Entre e siga em frente pelo corredor central até passar a última fileira de mesas.",
      "Vire à esquerda e siga até depois do Palco principal.",
      "Desça pelo corredor: o Palco de ensaio 2 fica à sua esquerda."] },
    "arena-treino-n1": { pts: [[1085, 1786], [1085, 986], [1204, 986], [1204, 780]], passos: [
      "Entre e siga em frente pelo corredor central, atravessando a área da Artística.",
      "No corredor largo entre as duas áreas, vire à direita.",
      "A Arena de treino N1 fica logo à frente, entre as mesas do Resgate."] },
    "arena-treino-n2": { pts: [[1085, 1786], [1085, 986], [613, 986], [613, 780]], passos: [
      "Entre e siga em frente pelo corredor central, atravessando a área da Artística.",
      "No corredor largo entre as duas áreas, vire à esquerda.",
      "Suba entre as mesas 87 e 88: a Arena de treino N2 fica logo à frente."] },
  };

  function rotaMesa(t) {
    const { ex, ey, ymain, arenas } = R, pts = [[ex, ey]];
    if (t.y > ymain) {
      const wy = t.y + 46; pts.push([ex, wy]); if (Math.abs(t.x - ex) > 1) pts.push([t.x, wy]); pts.push([t.x, t.y + 36]);
      return { pts };
    }
    if (Math.abs(t.y - (2 * ymain - R.bot[0])) < 2) { pts.push([ex, ymain], [t.x, ymain], [t.x, t.y + 36]); return { pts, frente: true }; }
    const cands = [t.x - 59.45, t.x + 59.45].filter((ax) => !arenas.some(([x1, , x2, y2]) => ax > x1 - 10 && ax < x2 + 10 && t.y < y2 + 40));
    cands.sort((a, b) => Math.abs(a - ex) - Math.abs(b - ex));
    const ax = cands[0];
    pts.push([ex, ymain]); if (Math.abs(ax - ex) > 1) pts.push([ax, ymain]); pts.push([ax, t.y], [t.x + (ax < t.x ? -36 : 36), t.y]);
    return { pts, ax };
  }

  function passosMesa(t, n, r) {
    const lado = t.x < R.ex - 60 ? "esquerda" : t.x > R.ex + 60 ? "direita" : null, s = [];
    if (t.y > R.ymain) {
      s.push("Entre e siga em frente pelo corredor central.");
      if (lado) {
        const i = R.bot.indexOf(t.y), col = lado === "esquerda" ? R.c7 : R.c8, ref = i >= 0 ? col[i] : col[col.length - 1];
        s.push(i >= 0 ? `Na altura da mesa ${ref}, vire à ${lado}.` : `Passe a mesa ${ref} e vire à ${lado}.`);
        s.push(`Siga pela fileira até a mesa ${n}.`);
      } else s.push(`A mesa ${n} fica logo ao lado do corredor, à ${t.x < R.ex ? "esquerda" : "direita"}.`);
      return s;
    }
    s.push("Entre e siga em frente pelo corredor central, atravessando a área da Artística.");
    if (r.frente) {
      s.push(`No corredor largo entre as duas áreas, vire à ${lado || (t.x < R.ex ? "esquerda" : "direita")}.`);
      s.push(`A mesa ${n} fica na primeira fileira, de frente para esse corredor.`);
      return s;
    }
    const ax = r.ax, X = R.X;
    let faixa;
    if (ax < X[0]) faixa = "pela lateral esquerda do salão, depois da mesa 68";
    else if (ax > X[14]) faixa = "pela lateral direita do salão, depois da mesa 146";
    else { const i = Math.round((ax - X[0] - 59.45) / 118.9); faixa = `entre as mesas ${R.r6[i]} e ${R.r6[i + 1]}`; }
    if (Math.abs(ax - R.ex) < 2) s.push(`Continue em frente ${faixa}.`);
    else s.push(`No corredor largo entre as duas áreas, vire à ${ax < R.ex ? "esquerda" : "direita"} e suba ${faixa}.`);
    s.push(`Siga até a mesa ${n}, à ${ax < t.x ? "direita" : "esquerda"} do corredor.`);
    return s;
  }

  function referencia(t) {
    let melhor = null, d = 1e9;
    for (const [txt, x, y] of R.land) { const k = Math.hypot(x - t.x, y - t.y); if (k < d) { d = k; melhor = txt; } }
    return melhor;
  }

  function desenharRota(pts) {
    const ns = "http://www.w3.org/2000/svg";
    const path = document.createElementNS(ns, "path");
    path.setAttribute("class", "rota");
    path.setAttribute("d", "M" + pts.map((p) => p.join(" ")).join(" L"));
    svg.appendChild(path);
    const ponto = document.createElementNS(ns, "circle");
    ponto.setAttribute("class", "rota-ponto"); ponto.setAttribute("cx", pts[0][0]); ponto.setAttribute("cy", pts[0][1]); ponto.setAttribute("r", 12);
    svg.appendChild(ponto);
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = reduzir ? 0 : len;
    if (!reduzir) { path.getBoundingClientRect(); path.style.transition = "stroke-dashoffset 1.1s ease-in-out .25s"; path.style.strokeDashoffset = 0; }
  }

  function enquadrar(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), pad = 150;
    let v = ajustarAspecto({ x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad });
    if (tam().w < 700) v = { ...v, y: v.y + v.h * 0.16, h: v.h * 1.32, x: v.x - v.w * 0.16, w: v.w * 1.32 }; // espaço para o cartão embaixo
    animarPara(ajustarAspecto(v));
  }

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
    svg.querySelectorAll(".pulse, .rota, .rota-ponto").forEach((n) => n.remove());
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
    const mm = id.match(/^mesa-(\d+)$/);
    let rota = null;
    if (mm) { const t = { x, y }; const r = rotaMesa(t); rota = { pts: r.pts, passos: passosMesa(t, Number(mm[1]), r), onde: (y > R.ymain ? "Perto da entrada" : "Fundo do salão") + " · " + referencia(t) }; }
    else if (ROTAS_LOCAIS[id]) rota = ROTAS_LOCAIS[id];
    if (rota) { desenharRota(rota.pts); enquadrar([...rota.pts, [x, y - 60]]); }
    else if (mover) focar(x, y, g.dataset.w ? 700 : 520);
    mostrarInfo(id, rota);
    history.replaceState(null, "", "#" + id);
  }

  function mostrarInfo(id, rota) {
    const info = $("info");
    info.replaceChildren();
    const fechar = document.createElement("button");
    fechar.type = "button"; fechar.className = "info-x"; fechar.setAttribute("aria-label", "Fechar"); fechar.textContent = "×";
    fechar.addEventListener("click", () => { limparDestaque(); history.replaceState(null, "", location.pathname); });
    info.append(fechar);
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
    } else if (id === "entrada") {
      titulo.textContent = "Entrada do salão"; sub.textContent = "Entre o Palco principal e o Palco de ensaio 1";
      info.append(titulo, sub);
    } else return;
    if (rota) {
      if (rota.onde) { const o = document.createElement("p"); o.className = "onde"; o.textContent = rota.onde; info.append(o); }
      const ol = document.createElement("ol"); ol.className = "passos";
      for (const p of rota.passos) { const li = document.createElement("li"); li.textContent = p; ol.append(li); }
      info.append(ol);
    }
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
    if (id && /^(mesa-\d+|palco-(?:1|2|principal)|arena-treino-n[12]|entrada)$/.test(id)) selecionar(id); else verTudo(false);
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
