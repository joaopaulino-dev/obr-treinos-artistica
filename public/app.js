(() => {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/n([12])/);
  const NIVEL = Number(params.get("nivel") || (m && m[1]) || 1);
  const MODO_COORD = params.has("coordenacao");

  const state = {
    cfg: null,           // resposta de /api/estado
    dia: params.get("dia") || "",
    reservas: [],        // [{slot, equipe}]
    equipe: "",
    senha: "",
    admin: false,
    pending: null,       // ação aberta na folha de baixo
    busy: false,
    erroCarga: "",
    gradeSync: "",
  };

  try { state.equipe = localStorage.getItem("obr-equipe-n" + NIVEL) || ""; } catch (e) {}
  try { state.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  const hhmm = (min) => pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  const g = () => state.cfg.grade;
  const ini = (s) => hhmm(s * g().duracaoMin);
  const fim = (s) => hhmm((s + 1) * g().duracaoMin);
  const slotsDoDia = () => { const out = []; for (let s = g().primeiro; s <= g().ultimo; s++) out.push(s); return out; };
  const naquele = (s) => state.reservas.filter((r) => r.slot === s).map((r) => r.equipe);
  const usados = (e) => state.reservas.filter((r) => r.equipe === e).length;
  const limite = (e) => g().creditos + ((state.cfg.extras || {})[e] || 0);

  // Mesma regra do servidor (lib/regras.js), só para mostrar o que está bloqueado.
  function motivo(e, s) {
    const aqui = naquele(s);
    if (aqui.includes(e)) return "Já está neste horário";
    if (aqui.length >= g().porSlot) return "Horário lotado";
    if (usados(e) >= limite(e)) return "Créditos esgotados";
    if (state.reservas.some((r) => r.equipe === e && Math.abs(r.slot - s) === 1)) return "Seguido de outro treino";
    return null;
  }

  /* ---------- API ---------- */
  async function api(caminho, opcoes) {
    const r = await fetch(caminho, opcoes);
    let dados = {};
    try { dados = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(dados.erro || "Falha de conexão."); err.status = r.status; throw err; }
    return dados;
  }
  const post = (caminho, corpo) => api(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const admin = (acao, extra) => post("/api/admin", { senha: state.senha, acao, nivel: NIVEL, dia: state.dia, ...extra });

  function aplicar(d) {
    state.cfg = d; state.dia = d.dia; state.reservas = d.reservas; state.erroCarga = "";
    if (state.equipe && !d.equipes.some((x) => x.nome === state.equipe)) state.equipe = "";
  }

  async function carregar() {
    try {
      const q = new URLSearchParams({ nivel: String(NIVEL) });
      if (state.dia) q.set("dia", state.dia);
      aplicar(await api("/api/estado?" + q));
    } catch (e) {
      state.erroCarga = state.cfg ? "Não foi possível atualizar a grade. Ela pode estar desatualizada." : (e.message || "Não foi possível carregar a grade.");
    }
    render();
  }

  // Roda uma ação que devolve o estado completo e mostra o resultado.
  async function executar(fn, sucesso) {
    if (state.busy) return;
    state.busy = true; renderSheet();
    try {
      aplicar(await fn());
      state.pending = null;
      toast(sucesso);
    } catch (e) {
      toast(e.message, true);
      if (e.status === 401) { sairAdmin(); state.pending = null; }
      if (e.status === 409) { state.pending = null; carregar(); }
    } finally {
      state.busy = false; render();
    }
  }

  /* ---------- render ---------- */
  function el(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function opcao(valor, texto, sel) { const o = el("option", "", texto); o.value = String(valor); if (sel) o.selected = true; return o; }
  function botao(texto, cls, fn) { const b = el("button", "btn " + cls, texto); b.type = "button"; b.disabled = state.busy; b.addEventListener("click", fn); return b; }

  function render() {
    $("banner").textContent = state.erroCarga || (state.cfg ? "" : "Carregando reservas…");
    $("banner").hidden = !$("banner").textContent;
    $("admin").hidden = !MODO_COORD;
    $("adminForm").hidden = state.admin;
    $("adminTools").hidden = !state.admin;
    if (!state.cfg) return;
    const c = state.cfg, gr = g();
    document.title = "Treinos Artística N" + NIVEL + " | OBR 2026";
    $("palco").textContent = c.palco;
    $("lvl").textContent = "Nível " + NIVEL;
    $("creditChip").textContent = gr.creditos + " créditos por equipe";
    $("ruleCredits").textContent = "Cada equipe tem " + gr.creditos + " créditos por dia";
    const total = gr.nSlots * gr.porSlot;
    const ocupadas = state.reservas.filter((r) => r.slot >= gr.primeiro && r.slot <= gr.ultimo).length;
    $("freeChip").textContent = (total - ocupadas) + " de " + total + " vagas livres";
    $("porSlotChip").textContent = "Até " + gr.porSlot + " equipes por slot";

    const dias = $("days");
    dias.hidden = c.dias.length < 2;
    dias.replaceChildren(...c.dias.map((d) => {
      const b = el("button", "", d.rotulo); b.type = "button";
      b.setAttribute("aria-pressed", String(d.id === state.dia));
      b.addEventListener("click", () => { state.dia = d.id; state.pending = null; carregar(); });
      return b;
    }));

    const sel = $("team");
    if (sel.options.length === 1) for (const t of c.equipes) sel.append(opcao(t.nome, "Mesa " + t.mesa + " · " + t.nome));
    sel.value = state.equipe;

    const e = state.equipe;
    $("credits").hidden = !e;
    if (e) {
      const u = usados(e), lim = limite(e);
      $("pips").replaceChildren(...Array.from({ length: Math.max(lim, u) }, (_, k) => el("span", "pip" + (k < u ? " used" : ""))));
      const livres = Math.max(0, lim - u);
      const extra = (c.extras || {})[e];
      $("creditsText").textContent = (livres === 1 ? "1 crédito livre" : livres + " créditos livres") + (extra ? " (inclui " + extra + " extra)" : "");
      const meus = state.reservas.filter((r) => r.equipe === e).map((r) => r.slot).sort((a, b) => a - b).map((s) => ini(s) + " às " + fim(s));
      $("mine").textContent = meus.length ? "Horários da sua equipe: " + meus.join(" · ") : "Sua equipe ainda não reservou nenhum horário neste dia.";
    } else {
      $("mine").textContent = "Escolha a equipe para ver os horários que ela pode reservar.";
    }

    renderGrid();
    if (state.admin) renderAdmin();
    renderSheet();
  }

  function renderGrid() {
    const gr = g(), e = state.equipe;
    $("grid").style.setProperty("--vagas", String(gr.porSlot));
    const linhas = [];
    const head = el("div", "row head");
    head.append(el("div", "", "Horário"));
    for (let k = 1; k <= gr.porSlot; k++) head.append(el("div", "", "Vaga " + k));
    head.append(el("div", "status", "Situação"));
    linhas.push(head);
    for (const s of slotsDoDia()) {
      const aqui = naquele(s);
      const row = el("div", "row" + (s !== gr.primeiro && (s * gr.duracaoMin) % 60 === 0 ? " hour" : ""));
      const t = el("div", "time", ini(s)); t.append(el("small", "", "até " + fim(s))); row.append(t);
      for (let k = 0; k < gr.porSlot; k++) {
        const nome = aqui[k];
        let c;
        if (nome) {
          c = el(state.admin ? "button" : "div", "seat " + (nome === e ? "own" : "taken"), nome);
          if (state.admin) { c.type = "button"; c.dataset.ocupada = String(s); c.dataset.equipe = nome; c.title = "Mover ou liberar"; }
        } else if (state.admin) {
          c = el("button", "seat free", "Livre"); c.type = "button"; c.dataset.livreAdmin = String(s);
        } else if (!e) {
          c = el("button", "seat free", "Livre"); c.type = "button"; c.dataset.reservar = String(s);
        } else {
          const why = motivo(e, s);
          if (why) c = el("div", "seat off", why);
          else { c = el("button", "seat free", "Reservar"); c.type = "button"; c.dataset.reservar = String(s); }
        }
        row.append(c);
      }
      const livres = gr.porSlot - Math.min(gr.porSlot, aqui.length);
      row.append(el("div", "status" + (livres ? "" : " full"), livres ? (livres === 1 ? "1 livre" : livres + " livres") : "Lotado"));
      linhas.push(row);
    }
    $("grid").replaceChildren(...linhas);
  }

  function renderAdmin() {
    const c = state.cfg, gr = g();
    const chave = [state.dia, gr.porSlot, gr.creditosBase, gr.inicioMin, gr.fimMin].join("|");
    if (chave !== state.gradeSync) {
      state.gradeSync = chave;
      $("gPorSlot").value = gr.porSlot;
      $("gCreditos").value = gr.creditosBase ?? "";
      const iniOpts = [], fimOpts = [];
      for (let mnt = 0; mnt < 24 * 60; mnt += gr.duracaoMin) iniOpts.push(opcao(mnt, hhmm(mnt), mnt === gr.inicioMin));
      for (let mnt = gr.duracaoMin; mnt <= 24 * 60; mnt += gr.duracaoMin) fimOpts.push(opcao(mnt, hhmm(mnt), mnt === gr.fimMin));
      $("gInicio").replaceChildren(...iniOpts);
      $("gFim").replaceChildren(...fimOpts);
    }
    $("gCreditos").placeholder = "Automático (" + gr.creditosAuto + ")";
    $("gHint").textContent = "Deixe os créditos em branco para o cálculo automático: " + gr.nSlots + " slots × " + gr.porSlot +
      " equipes ÷ " + c.equipes.length + " equipes = " + gr.creditosAuto + " por equipe. O valor vale para todas as equipes do nível neste dia.";

    const xs = $("xEquipe");
    if (!xs.options.length) {
      for (const t of c.equipes) xs.append(opcao(t.nome, "Mesa " + t.mesa + " · " + t.nome));
      if (state.equipe) xs.value = state.equipe;
      $("xValor").value = (c.extras || {})[xs.value] || 1;
    }
    const com = Object.entries(c.extras || {}).map(([nome, n]) => nome + " (+" + n + ")");
    $("xLista").textContent = com.length ? "Com extras neste dia: " + com.join(" · ") : "Nenhuma equipe com créditos extras neste dia. Use 0 para remover.";
  }

  function renderSheet() {
    const p = state.pending;
    $("sheet").hidden = !p;
    if (!p) return;
    const txt = $("sheetText"), campos = $("sheetFields"), acts = $("sheetActs");
    const main = el("strong"), sub = el("span", "sub");
    txt.replaceChildren(main, sub);
    campos.replaceChildren();
    const voltar = botao("Voltar", "", () => { state.pending = null; renderSheet(); });

    if (p.tipo === "reservar") {
      main.textContent = "Reservar " + ini(p.slot) + " às " + fim(p.slot) + " para " + p.equipe + "?";
      sub.textContent = "Usa 1 crédito do dia. Depois de confirmada, a reserva não pode ser remarcada.";
      acts.replaceChildren(voltar, botao("Confirmar reserva", "primary", () => executar(
        () => post("/api/reservar", { nivel: NIVEL, dia: state.dia, slot: p.slot, equipe: p.equipe }),
        "Reserva confirmada: " + ini(p.slot) + " para " + p.equipe + ". Confira seus horários abaixo.")));
    }

    if (p.tipo === "admin-livre") {
      main.textContent = "Reservar " + ini(p.slot) + " às " + fim(p.slot) + " por uma equipe";
      sub.textContent = "Reserva feita pela coordenação.";
      const sel = el("select"); sel.setAttribute("aria-label", "Equipe");
      for (const t of state.cfg.equipes) sel.append(opcao(t.nome, "Mesa " + t.mesa + " · " + t.nome, t.nome === p.equipe));
      sel.addEventListener("change", () => { p.equipe = sel.value; });
      const lab = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = p.forcar;
      cb.addEventListener("change", () => { p.forcar = cb.checked; });
      lab.append(cb, document.createTextNode("Ignorar créditos e slots seguidos"));
      campos.append(sel, lab);
      acts.replaceChildren(voltar, botao("Reservar", "primary", () => executar(
        () => admin("reservar", { slot: p.slot, equipe: p.equipe, forcar: p.forcar }),
        "Reserva feita: " + ini(p.slot) + " para " + p.equipe + ".")));
    }

    if (p.tipo === "admin-ocupada") {
      main.textContent = p.equipe + " às " + ini(p.slot);
      sub.textContent = "Mover ignora créditos e slots seguidos. Liberar devolve o crédito para a equipe.";
      const sel = el("select"); sel.setAttribute("aria-label", "Mover para");
      sel.append(opcao("", "Mover para…", !p.para));
      for (const s of slotsDoDia()) {
        if (s === p.slot) continue;
        const aqui = naquele(s);
        const livres = g().porSlot - aqui.length;
        const o = opcao(s, ini(s) + (aqui.includes(p.equipe) ? " (já está)" : livres > 0 ? " · " + livres + " livre" + (livres > 1 ? "s" : "") : " · lotado"), p.para === s);
        o.disabled = livres <= 0 || aqui.includes(p.equipe);
        sel.append(o);
      }
      sel.addEventListener("change", () => { p.para = sel.value === "" ? null : Number(sel.value); });
      campos.append(sel);
      acts.replaceChildren(voltar,
        botao("Liberar", "danger", () => { state.pending = { tipo: "admin-liberar", slot: p.slot, equipe: p.equipe }; renderSheet(); }),
        botao("Mover", "primary", () => {
          if (p.para == null) { toast("Escolha o novo horário.", true); return; }
          executar(() => admin("mover", { slot: p.slot, equipe: p.equipe, para: p.para }), p.equipe + " movida para " + ini(p.para) + ".");
        }));
    }

    if (p.tipo === "admin-liberar") {
      main.textContent = "Liberar a vaga de " + p.equipe + " às " + ini(p.slot) + "?";
      sub.textContent = "A equipe recupera 1 crédito e a vaga volta a ficar livre.";
      acts.replaceChildren(voltar, botao("Liberar vaga", "danger", () => executar(
        () => admin("liberar", { slot: p.slot, equipe: p.equipe }), "Vaga liberada.")));
    }
  }

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function sairAdmin() {
    state.admin = false; state.senha = "";
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
  }

  /* ---------- eventos ---------- */
  $("team").addEventListener("change", (ev) => {
    state.equipe = ev.target.value; state.pending = null;
    try { localStorage.setItem("obr-equipe-n" + NIVEL, state.equipe); } catch (e) {}
    render();
  });

  $("grid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b || state.busy || !state.cfg) return;
    const d = b.dataset;
    if (d.reservar !== undefined) {
      if (!state.equipe) { $("team").focus(); toast("Escolha sua equipe antes de reservar."); return; }
      state.pending = { tipo: "reservar", slot: Number(d.reservar), equipe: state.equipe };
    } else if (d.livreAdmin !== undefined) {
      state.pending = { tipo: "admin-livre", slot: Number(d.livreAdmin), equipe: state.equipe || state.cfg.equipes[0].nome, forcar: false };
    } else if (d.ocupada !== undefined) {
      state.pending = { tipo: "admin-ocupada", slot: Number(d.ocupada), equipe: d.equipe, para: null };
    }
    renderSheet();
  });

  $("adminForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = $("senha").value;
    try {
      await post("/api/admin", { senha, acao: "entrar" });
      state.senha = senha; state.admin = true; $("senha").value = "";
      try { sessionStorage.setItem("obr-coord", senha); } catch (e) {}
      render();
    } catch (e) { toast(e.message, true); }
  });

  $("adminSair").addEventListener("click", () => { sairAdmin(); state.pending = null; render(); });

  $("gradeForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const cred = $("gCreditos").value.trim();
    executar(() => admin("grade", {
      porSlot: Number($("gPorSlot").value),
      creditosBase: cred === "" ? null : Number(cred),
      inicioMin: Number($("gInicio").value),
      fimMin: Number($("gFim").value),
    }), "Grade do dia atualizada.");
  });

  $("xEquipe").addEventListener("change", () => { $("xValor").value = (state.cfg.extras || {})[$("xEquipe").value] || 0; });
  $("extraForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const equipe = $("xEquipe").value, extra = Number($("xValor").value);
    executar(() => admin("extra", { equipe, extra }), extra ? equipe + " agora tem +" + extra + " crédito" + (extra > 1 ? "s" : "") + " neste dia." : "Créditos extras removidos de " + equipe + ".");
  });

  async function entrarComSenhaSalva() {
    if (!MODO_COORD || !state.senha) return;
    try { await post("/api/admin", { senha: state.senha, acao: "entrar" }); state.admin = true; render(); } catch (e) { sairAdmin(); }
  }

  render();
  carregar();
  entrarComSenhaSalva();
  setInterval(() => { if (document.visibilityState === "visible" && !state.busy && !state.pending) carregar(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !state.pending) carregar(); });
})();
