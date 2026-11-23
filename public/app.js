(() => {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/n([12])/);
  const NIVEL = Number(params.get("nivel") || (m && m[1]) || 1);
  const MODO_COORD = params.has("coordenacao");

  const state = {
    cfg: null,           // resposta de /api/estado sem as reservas
    dia: params.get("dia") || "",
    reservas: [],        // [{slot, equipe}]
    equipe: "",
    senha: "",
    admin: false,
    pending: null,       // {tipo: "reservar"|"liberar", slot, equipe}
    busy: false,
    erroCarga: "",
  };

  try { state.equipe = localStorage.getItem("obr-equipe-n" + NIVEL) || ""; } catch (e) {}
  try { state.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  const hhmm = (min) => pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  const ini = (i) => hhmm(state.cfg.inicioMin + i * state.cfg.duracaoMin);
  const fim = (i) => hhmm(state.cfg.inicioMin + (i + 1) * state.cfg.duracaoMin);
  const naquele = (i) => state.reservas.filter((r) => r.slot === i).map((r) => r.equipe);
  const usados = (e) => state.reservas.filter((r) => r.equipe === e).length;

  // Mesma regra do servidor (lib/regras.js), só para mostrar o que está bloqueado.
  function motivo(e, i) {
    const aqui = naquele(i);
    if (aqui.length >= state.cfg.porSlot) return "Horário lotado";
    if (aqui.includes(e)) return "Já está neste horário";
    if (usados(e) >= state.cfg.creditos) return "Créditos esgotados";
    if (state.reservas.some((r) => r.equipe === e && Math.abs(r.slot - i) === 1)) return "Seguido de outro treino";
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

  async function carregar() {
    try {
      const q = new URLSearchParams({ nivel: String(NIVEL) });
      if (state.dia) q.set("dia", state.dia);
      const d = await api("/api/estado?" + q);
      state.cfg = d; state.dia = d.dia; state.reservas = d.reservas; state.erroCarga = "";
      if (state.equipe && !d.equipes.some((x) => x.nome === state.equipe)) state.equipe = "";
    } catch (e) {
      state.erroCarga = state.cfg ? "Não foi possível atualizar a grade. Ela pode estar desatualizada." : (e.message || "Não foi possível carregar a grade.");
    }
    render();
  }

  /* ---------- render ---------- */
  function el(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  function render() {
    $("banner").textContent = state.erroCarga || (state.cfg ? "" : "Carregando reservas…");
    $("banner").hidden = !$("banner").textContent;
    $("admin").hidden = !MODO_COORD;
    $("adminForm").hidden = state.admin;
    $("adminOk").hidden = !state.admin;
    if (!state.cfg) return;
    const c = state.cfg;
    document.title = "Treinos Artística N" + NIVEL + " | OBR 2026";
    $("palco").textContent = c.palco;
    $("lvl").textContent = "Nível " + NIVEL;
    $("creditChip").textContent = c.creditos + " créditos por equipe";
    $("ruleCredits").textContent = "Cada equipe tem " + c.creditos + " créditos por dia";
    const total = c.slots * c.porSlot;
    $("freeChip").textContent = (total - state.reservas.length) + " de " + total + " vagas livres";

    const dias = $("days");
    dias.hidden = c.dias.length < 2;
    dias.replaceChildren(...c.dias.map((d) => {
      const b = el("button", "", d.rotulo); b.type = "button";
      b.setAttribute("aria-pressed", String(d.id === state.dia));
      b.addEventListener("click", () => { state.dia = d.id; state.pending = null; carregar(); });
      return b;
    }));

    const sel = $("team");
    if (sel.options.length === 1) {
      for (const t of c.equipes) { const o = el("option", "", "Mesa " + t.mesa + " · " + t.nome); o.value = t.nome; sel.append(o); }
    }
    sel.value = state.equipe;

    const e = state.equipe;
    $("credits").hidden = !e;
    if (e) {
      const u = usados(e);
      $("pips").replaceChildren(...Array.from({ length: c.creditos }, (_, k) => el("span", "pip" + (k < u ? " used" : ""))));
      const livres = Math.max(0, c.creditos - u);
      $("creditsText").textContent = livres === 1 ? "1 crédito livre" : livres + " créditos livres";
      const meus = state.reservas.filter((r) => r.equipe === e).map((r) => r.slot).sort((a, b) => a - b).map((i) => ini(i) + " às " + fim(i));
      $("mine").textContent = meus.length ? "Horários da sua equipe: " + meus.join(" · ") : "Sua equipe ainda não reservou nenhum horário neste dia.";
    } else {
      $("mine").textContent = "Escolha a equipe para ver os horários que ela pode reservar.";
    }

    const linhas = [];
    const head = el("div", "row head");
    ["Horário", "Vaga 1", "Vaga 2", "Vaga 3"].forEach((t) => head.append(el("div", "", t)));
    head.append(el("div", "status", "Situação"));
    linhas.push(head);
    for (let i = 0; i < c.slots; i++) {
      const aqui = naquele(i);
      const row = el("div", "row" + (i && i % 4 === 0 ? " hour" : ""));
      const t = el("div", "time", ini(i)); t.append(el("small", "", "até " + fim(i))); row.append(t);
      for (let k = 0; k < c.porSlot; k++) {
        const nome = aqui[k];
        let s;
        if (nome) {
          s = el(state.admin ? "button" : "div", "seat " + (nome === e ? "own" : "taken"), nome);
          if (state.admin) { s.type = "button"; s.dataset.liberar = String(i); s.dataset.equipe = nome; s.title = "Liberar esta vaga"; }
        } else if (!e) {
          s = el("button", "seat free", "Livre"); s.type = "button"; s.dataset.reservar = String(i);
        } else {
          const why = motivo(e, i);
          if (why) s = el("div", "seat off", why);
          else { s = el("button", "seat free", "Reservar"); s.type = "button"; s.dataset.reservar = String(i); }
        }
        row.append(s);
      }
      const livres = c.porSlot - Math.min(c.porSlot, aqui.length);
      row.append(el("div", "status" + (livres ? "" : " full"), livres ? (livres === 1 ? "1 livre" : livres + " livres") : "Lotado"));
      linhas.push(row);
    }
    $("grid").replaceChildren(...linhas);
    renderSheet();
  }

  function renderSheet() {
    const p = state.pending;
    $("sheet").hidden = !p;
    if (!p) return;
    const main = el("strong");
    const sub = el("span", "sub");
    if (p.tipo === "reservar") {
      main.textContent = "Reservar " + ini(p.slot) + " às " + fim(p.slot) + " para " + p.equipe + "?";
      sub.textContent = "Usa 1 crédito do dia. Depois de confirmada, a reserva não pode ser remarcada.";
      $("sheetGo").className = "btn primary"; $("sheetGo").textContent = "Confirmar reserva";
    } else {
      main.textContent = "Liberar a vaga de " + p.equipe + " às " + ini(p.slot) + "?";
      sub.textContent = "A equipe recupera 1 crédito e a vaga volta a ficar livre.";
      $("sheetGo").className = "btn danger"; $("sheetGo").textContent = "Liberar vaga";
    }
    $("sheetText").replaceChildren(main, sub);
    $("sheetGo").disabled = state.busy; $("sheetBack").disabled = state.busy;
  }

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  /* ---------- eventos ---------- */
  $("team").addEventListener("change", (ev) => {
    state.equipe = ev.target.value; state.pending = null;
    try { localStorage.setItem("obr-equipe-n" + NIVEL, state.equipe); } catch (e) {}
    render();
  });

  $("grid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b || state.busy) return;
    if (b.dataset.reservar !== undefined) {
      if (!state.equipe) { $("team").focus(); toast("Escolha sua equipe antes de reservar."); return; }
      state.pending = { tipo: "reservar", slot: Number(b.dataset.reservar), equipe: state.equipe };
    } else if (b.dataset.liberar !== undefined) {
      state.pending = { tipo: "liberar", slot: Number(b.dataset.liberar), equipe: b.dataset.equipe };
    }
    renderSheet();
  });

  $("sheetBack").addEventListener("click", () => { state.pending = null; renderSheet(); });

  $("sheetGo").addEventListener("click", async () => {
    const p = state.pending; if (!p || state.busy) return;
    state.busy = true; renderSheet();
    try {
      const corpo = { nivel: NIVEL, dia: state.dia, slot: p.slot, equipe: p.equipe };
      if (p.tipo === "reservar") {
        const d = await post("/api/reservar", corpo);
        state.reservas = d.reservas;
        toast("Reserva confirmada: " + ini(p.slot) + " para " + p.equipe + ". Confira seus horários abaixo.");
      } else {
        const d = await post("/api/liberar", { ...corpo, senha: state.senha });
        state.reservas = d.reservas;
        toast("Vaga liberada.");
      }
      state.pending = null;
    } catch (e) {
      toast(e.message, true);
      if (e.status === 409) { state.pending = null; carregar(); }
      if (e.status === 401) { state.admin = false; state.pending = null; }
    } finally {
      state.busy = false; render();
    }
  });

  $("adminForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = $("senha").value;
    try {
      await post("/api/coordenacao", { senha });
      state.senha = senha; state.admin = true;
      try { sessionStorage.setItem("obr-coord", senha); } catch (e) {}
      render();
    } catch (e) { toast(e.message, true); }
  });

  async function entrarComSenhaSalva() {
    if (!MODO_COORD || !state.senha) return;
    try { await post("/api/coordenacao", { senha: state.senha }); state.admin = true; render(); } catch (e) {}
  }

  render();
  carregar();
  entrarComSenhaSalva();
  setInterval(() => { if (document.visibilityState === "visible" && !state.busy && !state.pending) carregar(); }, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") carregar(); });
})();
