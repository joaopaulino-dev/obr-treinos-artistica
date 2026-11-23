(() => {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/n([12])/);
  const NIVEL = Number(params.get("nivel") || (m && m[1]) || 1);
  const MODO_COORD = params.has("coordenacao");
  const AVISO_KEY = "obr-aviso-n" + NIVEL;

  const state = {
    cfg: null,           // resposta de /api/estado
    dia: params.get("dia") || "",
    reservas: [],        // [{slot, equipe}]
    equipe: "",
    senha: "",
    admin: false,
    auditoria: [],       // [{slot, equipe, criadoEm, origem}] (só coordenação)
    soLivres: false,
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
  const mesaDe = (e) => { const t = state.cfg && state.cfg.equipes.find((x) => x.nome === e); return t ? t.mesa : null; };
  const comMesa = (e) => { const n = mesaDe(e); return n ? "Mesa " + n + " · " + e : e; };
  const cred = (n) => n + (n === 1 ? " crédito" : " créditos");

  // Mesma regra do servidor (lib/regras.js), só para mostrar o que está bloqueado.
  function motivo(e, s) {
    const aqui = naquele(s);
    if (aqui.includes(e)) return "Já está neste horário";
    if (aqui.length >= g().porSlot) return "Ocupado";
    if (usados(e) >= limite(e)) return "Sem créditos";
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

  async function carregarAuditoria() {
    if (!state.admin) return;
    try { state.auditoria = (await admin("auditoria")).reservas || []; } catch (e) { state.auditoria = []; }
  }

  async function carregar() {
    try {
      const q = new URLSearchParams({ nivel: String(NIVEL) });
      if (state.dia) q.set("dia", state.dia);
      aplicar(await api("/api/estado?" + q));
      await carregarAuditoria();
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
      await carregarAuditoria();
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
    $("banner").textContent = state.erroCarga || (state.cfg ? "" : "Carregando horários…");
    $("banner").hidden = !$("banner").textContent;
    $("admin").hidden = !MODO_COORD;
    $("adminForm").hidden = state.admin;
    $("adminTools").hidden = !state.admin;
    if (!state.cfg) return;
    const c = state.cfg, gr = g();
    const palcoLetra = c.palco.slice(-1);
    document.title = "Treinos Artística N" + NIVEL + " | OBR 2026";
    $("titulo").textContent = "Nível " + NIVEL + " · " + c.palco;
    $("linkMapa").href = "/mapa#palco-" + palcoLetra.toLowerCase();
    $("rDur").textContent = "Slots de " + gr.duracaoMin + " min";
    $("rCred").textContent = cred(gr.creditos) + " por equipe";
    $("mDur").textContent = "Cada slot dura " + gr.duracaoMin + " minutos";
    $("mCred").textContent = "cada equipe tem " + cred(gr.creditos) + " por dia";

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
      $("creditsText").textContent = livres ? (livres === 1 ? "1 livre" : livres + " livres") : "Sem créditos";
      const meus = state.reservas.filter((r) => r.equipe === e).map((r) => r.slot).sort((a, b) => a - b).map((s) => ini(s) + "–" + fim(s));
      $("mine").textContent = meus.length ? "Seus horários: " + meus.join(" · ") : "Sua equipe ainda não tem horário neste dia.";
    } else {
      $("mine").textContent = "Escolha a sua equipe para ver os horários disponíveis.";
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
    for (let k = 1; k <= gr.porSlot; k++) head.append(el("div", "", gr.porSlot === 1 ? "Equipe" : "Vaga " + k));
    head.append(el("div", "status", "Situação"));
    linhas.push(head);
    let mostradas = 0;
    for (const s of slotsDoDia()) {
      const aqui = naquele(s);
      const livres = gr.porSlot - Math.min(gr.porSlot, aqui.length);
      if (state.soLivres && !livres) continue;
      mostradas++;
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
      row.append(el("div", "status" + (livres ? "" : " full"), livres ? (gr.porSlot === 1 ? "Livre" : livres === 1 ? "1 livre" : livres + " livres") : "Ocupado"));
      linhas.push(row);
    }
    if (!mostradas) linhas.push(el("div", "empty", "Nenhum horário livre neste dia."));
    $("grid").replaceChildren(...linhas);
  }

  const fmtData = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" }); };

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
      " ÷ " + c.equipes.length + " equipes = " + gr.creditosAuto + " por equipe. O valor vale para todas as equipes do nível neste dia.";

    const xs = $("xEquipe");
    if (!xs.options.length) {
      for (const t of c.equipes) xs.append(opcao(t.nome, "Mesa " + t.mesa + " · " + t.nome));
      if (state.equipe) xs.value = state.equipe;
      $("xValor").value = (c.extras || {})[xs.value] || 1;
    }
    const com = Object.entries(c.extras || {}).map(([nome, n]) => nome + " (+" + n + ")");
    $("xLista").textContent = com.length ? "Com extras neste dia: " + com.join(" · ") : "Nenhuma equipe com créditos extras neste dia. Use 0 para remover.";

    // Aparelhos que reservaram para mais de uma equipe.
    const porOrigem = {};
    for (const r of state.auditoria) {
      if (!r.origem || r.origem === "coordenacao") continue;
      (porOrigem[r.origem] = porOrigem[r.origem] || new Set()).add(r.equipe);
    }
    const suspeitos = Object.entries(porOrigem).filter(([, eqs]) => eqs.size > 1);
    $("auditLista").replaceChildren(...(suspeitos.length
      ? suspeitos.map(([o, eqs]) => el("li", "", "Aparelho " + o + ": " + [...eqs].map(comMesa).join(", ")))
      : [el("li", "", "Nenhum caso até agora.")]));
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
      main.textContent = "Reservar " + ini(p.slot) + "–" + fim(p.slot) + " para " + comMesa(p.equipe) + "?";
      sub.textContent = "Usa 1 crédito do dia e não pode ser remarcada.";
      txt.append(el("span", "sub warnline", "Somente para a sua equipe. Reservar por outra equipe pode levar à desclassificação."));
      acts.replaceChildren(voltar, botao("Confirmar reserva", "primary", () => executar(
        () => post("/api/reservar", { nivel: NIVEL, dia: state.dia, slot: p.slot, equipe: p.equipe }),
        "Reserva confirmada: " + ini(p.slot) + " para " + p.equipe + ". Confira seus horários acima.")));
    }

    if (p.tipo === "admin-livre") {
      main.textContent = "Reservar " + ini(p.slot) + "–" + fim(p.slot) + " por uma equipe";
      sub.textContent = "Reserva feita pela coordenação.";
      const sel = el("select"); sel.setAttribute("aria-label", "Equipe");
      for (const t of state.cfg.equipes) sel.append(opcao(t.nome, "Mesa " + t.mesa + " · " + t.nome, t.nome === p.equipe));
      sel.addEventListener("change", () => { p.equipe = sel.value; });
      const lab = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = p.forcar;
      cb.addEventListener("change", () => { p.forcar = cb.checked; });
      lab.append(cb, document.createTextNode("Ignorar créditos e horários seguidos"));
      campos.append(sel, lab);
      acts.replaceChildren(voltar, botao("Reservar", "primary", () => executar(
        () => admin("reservar", { slot: p.slot, equipe: p.equipe, forcar: p.forcar }),
        "Reserva feita: " + ini(p.slot) + " para " + p.equipe + ".")));
    }

    if (p.tipo === "admin-ocupada") {
      main.textContent = comMesa(p.equipe) + " às " + ini(p.slot);
      const reg = state.auditoria.find((r) => r.slot === p.slot && r.equipe === p.equipe);
      sub.textContent = reg
        ? "Reservada em " + fmtData(reg.criadoEm) + " · " + (reg.origem === "coordenacao" ? "pela coordenação" : reg.origem ? "aparelho " + reg.origem : "origem não registrada")
        : "Mover ignora créditos e horários seguidos. Liberar devolve o crédito.";
      const sel = el("select"); sel.setAttribute("aria-label", "Mover para");
      sel.append(opcao("", "Mover para…", p.para == null));
      for (const s of slotsDoDia()) {
        if (s === p.slot) continue;
        const aqui = naquele(s);
        const livres = g().porSlot - aqui.length;
        const o = opcao(s, ini(s) + (aqui.includes(p.equipe) ? " (já está)" : livres > 0 ? " · livre" : " · ocupado"), p.para === s);
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
      main.textContent = "Liberar o horário de " + p.equipe + " às " + ini(p.slot) + "?";
      sub.textContent = "A equipe recupera 1 crédito e o horário volta a ficar livre.";
      acts.replaceChildren(voltar, botao("Liberar horário", "danger", () => executar(
        () => admin("liberar", { slot: p.slot, equipe: p.equipe }), "Horário liberado.")));
    }
  }

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function sairAdmin() {
    state.admin = false; state.senha = ""; state.auditoria = [];
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
  }

  /* ---------- janela de regras ---------- */
  const dlg = $("regras");
  function abrirRegras() { if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", ""); }
  function fecharRegras() {
    try { sessionStorage.setItem(AVISO_KEY, "1"); } catch (e) {}
    if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
  }
  $("entendi").addEventListener("click", fecharRegras);
  $("verRegras").addEventListener("click", abrirRegras);
  dlg.addEventListener("cancel", () => { try { sessionStorage.setItem(AVISO_KEY, "1"); } catch (e) {} });
  let jaViu = false;
  try { jaViu = sessionStorage.getItem(AVISO_KEY) === "1"; } catch (e) {}
  if (!jaViu && !MODO_COORD) abrirRegras();

  /* ---------- eventos ---------- */
  $("team").addEventListener("change", (ev) => {
    state.equipe = ev.target.value; state.pending = null;
    try { localStorage.setItem("obr-equipe-n" + NIVEL, state.equipe); } catch (e) {}
    render();
  });

  $("soLivres").addEventListener("change", (ev) => { state.soLivres = ev.target.checked; render(); });

  $("grid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b || state.busy || !state.cfg) return;
    const d = b.dataset;
    if (d.reservar !== undefined) {
      if (!state.equipe) { $("team").focus(); toast("Escolha a sua equipe antes de reservar."); return; }
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
      await carregarAuditoria();
      render();
    } catch (e) { toast(e.message, true); }
  });

  $("adminSair").addEventListener("click", () => { sairAdmin(); state.pending = null; render(); });

  $("gradeForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const c = $("gCreditos").value.trim();
    executar(() => admin("grade", {
      porSlot: Number($("gPorSlot").value),
      creditosBase: c === "" ? null : Number(c),
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
    try { await post("/api/admin", { senha: state.senha, acao: "entrar" }); state.admin = true; await carregarAuditoria(); render(); } catch (e) { sairAdmin(); }
  }

  render();
  carregar();
  entrarComSenhaSalva();
  setInterval(() => { if (document.visibilityState === "visible" && !state.busy && !state.pending) carregar(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !state.pending) carregar(); });
})();
