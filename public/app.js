(() => {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const params = new URLSearchParams(location.search);
  const m = location.pathname.match(/n([12])/);
  const NIVEL = Number(params.get("nivel") || (m && m[1]) || 1);
  const MODO_COORD = params.has("coordenacao");
  const MODO_AGENDA = location.pathname.startsWith("/agendar"); // acesso limitado: só cria reservas, N1 e N2
  const AVISO_KEY = "obr-aviso-n" + NIVEL;
  const CANCELA_ATE_MIN = 15; // mesmo valor de lib/config.js
  const CRONOGRAMA = {
    1: "https://obr.robocup.org.br/wp-content/uploads/2026/11/Artistica-Cronograma-N1.pdf",
    2: "https://obr.robocup.org.br/wp-content/uploads/2026/11/Artistica-Cronograma-N2.pdf",
  };
  if (CRONOGRAMA[NIVEL]) { $("linkCronograma").href = CRONOGRAMA[NIVEL]; $("linkCronograma").textContent = "Cronograma N" + NIVEL; }

  const state = {
    cfg: null,           // resposta de /api/estado
    dia: "",             // público: o servidor decide (hoje até 18h, depois amanhã); coordenação escolhe
    reservas: [],        // [{slot, equipe}]
    equipe: "",
    senha: "",
    admin: false,
    agenda: false,       // logado no agendamento limitado
    senhaAgenda: "",
    auditoria: [],       // [{slot, equipe, criadoEm, origem}] (só coordenação)
    cancelamentos: [],   // [{slot, equipe, origem, origemReserva, criadoEm}] (só coordenação)
    soLivres: false,
    verEncerrados: false, // horários que já passaram ficam recolhidos numa linha
    pending: null,       // ação aberta na folha de baixo
    busy: false,
    erroCarga: "",
    gradeSync: "",
  };

  try { state.equipe = localStorage.getItem("obr-equipe-n" + NIVEL) || ""; } catch (e) {}
  if (!state.equipe && window.OBR_EQUIPE) {
    const eq = window.OBR_EQUIPE.get();
    if (eq && eq.modalidade === "Artística" && eq.nivel === NIVEL) state.equipe = eq.nome;
  }
  try { state.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}
  try { state.senhaAgenda = sessionStorage.getItem("obr-agenda") || ""; } catch (e) {}

  const hhmm = (min) => pad(Math.floor(min / 60)) + ":" + pad(min % 60);
  const g = () => state.cfg.grade;
  const ini = (s) => hhmm(s * g().duracaoMin);
  const fim = (s) => hhmm((s + 1) * g().duracaoMin);
  const slotsDoDia = () => { const out = []; for (let s = g().primeiro; s <= g().ultimo; s++) out.push(s); return out; };
  const naquele = (s) => state.reservas.filter((r) => r.slot === s).map((r) => r.equipe);
  const usados = (e) => state.reservas.filter((r) => r.equipe === e).length;
  const limite = (e) => g().creditos + ((state.cfg.extras || {})[e] || 0);
  const comMesa = (e) => e; // nomes das equipes aparecem sem o número da mesa
  const cred = (n) => n + (n === 1 ? " crédito" : " créditos");
  // Encerrado = já terminou; um horário livre em andamento ainda pode ser reservado (lib/regras.js).
  const passou = (s) => state.cfg.agoraMin != null && (s + 1) * g().duracaoMin <= state.cfg.agoraMin;
  // Cancelamento pela própria equipe até CANCELA_ATE_MIN minutos antes do início (lib/regras.js).
  const cancelavel = (s) => state.cfg.agoraMin == null || s * g().duracaoMin - state.cfg.agoraMin >= CANCELA_ATE_MIN;
  // Repescagem (lib/regras.js): quem já treinou tudo pode pegar o horário em andamento ou o próximo, se livres.
  const proximo = () => state.cfg.agoraMin == null ? null : Math.floor(state.cfg.agoraMin / g().duracaoMin) + 1;
  const jaTreinou = (e) => {
    const meus = state.reservas.filter((r) => r.equipe === e);
    return state.cfg.agoraMin != null && meus.length > 0 && meus.every((r) => (r.slot + 1) * g().duracaoMin <= state.cfg.agoraMin);
  };

  // Mesma regra do servidor (lib/regras.js), só para mostrar o que está bloqueado.
  function motivo(e, s) {
    const aqui = naquele(s);
    if (aqui.includes(e)) return "Já está neste horário";
    if (passou(s)) return "Encerrado";
    if (aqui.length >= g().porSlot) return "Ocupado";
    if (usados(e) >= limite(e) && !((s === proximo() || s === proximo() - 1) && jaTreinou(e))) return "Sem créditos";
    if (state.reservas.some((r) => r.equipe === e && Math.abs(r.slot - s) === 1)) return "Seguido de outro ensaio";
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
  const agendaApi = (acao, extra) => post("/api/agenda", { senha: state.senhaAgenda, acao, nivel: NIVEL, dia: state.dia, ...extra });

  function aplicar(d) {
    state.cfg = d; state.dia = d.dia; state.reservas = d.reservas; state.erroCarga = "";
    if (state.equipe && !d.equipes.some((x) => x.nome === state.equipe)) state.equipe = "";
  }

  async function carregarAuditoria() {
    if (!state.admin) return;
    try {
      const d = await admin("auditoria");
      state.auditoria = d.reservas || []; state.cancelamentos = d.cancelamentos || [];
    } catch (e) { state.auditoria = []; state.cancelamentos = []; }
  }

  async function carregar() {
    try {
      const q = new URLSearchParams({ nivel: String(NIVEL) });
      if (state.dia && (state.admin || state.agenda)) q.set("dia", state.dia);
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
      if (e.status === 401) { if (MODO_AGENDA) sairAgenda(); else sairAdmin(); state.pending = null; }
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
    $("agenda").hidden = !MODO_AGENDA;
    $("agendaForm").hidden = state.agenda;
    $("agendaTools").hidden = !state.agenda;
    $("teambar").hidden = MODO_AGENDA;
    $("agN1").classList.toggle("solid", NIVEL === 1);
    $("agN2").classList.toggle("solid", NIVEL === 2);
    if (!state.cfg) return;
    const c = state.cfg, gr = g();
    const palcoNum = c.palco.slice(-1);
    document.title = (MODO_AGENDA ? "Agendamento" : "Ensaios Artística") + " N" + NIVEL + " | OBR 2026";
    $("titulo").textContent = "Nível " + NIVEL + " · " + c.palco;
    $("linkMapa").href = "/mapa#palco-" + palcoNum;
    $("rDur").textContent = "Slots de " + gr.duracaoMin + " min";
    $("rCred").textContent = cred(gr.creditos) + " por equipe";
    $("mDur").textContent = "Cada slot dura " + gr.duracaoMin + " minutos";
    $("mCred").textContent = "cada equipe tem " + cred(gr.creditos) + " por dia";

    const ehHoje = c.dia === c.dias[0].id;
    $("dayInfo").hidden = false;
    $("rAbre").textContent = "Dia seguinte abre às " + c.aberturaHora + "h";
    $("mAbre").textContent = "Só é possível agendar para o dia seguinte após as " + c.aberturaHora + "h do dia vigente.";
    if ((state.admin || state.agenda) && c.dia !== c.diaAtivo) {
      $("dayLabel").textContent = (state.admin ? "Coordenação: " : "Agendamento: ") + (ehHoje ? "hoje, " : "amanhã, ") + c.rotuloDia;
      $("dayHint").textContent = "As equipes estão reservando para " + (c.diaAtivo === c.dias[0].id ? "hoje" : "amanhã") + ".";
    } else {
      $("dayLabel").textContent = "Reservas para " + (ehHoje ? "hoje, " : "amanhã, ") + c.rotuloDia;
      $("dayHint").textContent = ehHoje
        ? "As reservas para amanhã abrem hoje às " + c.aberturaHora + "h."
        : "Abertas desde as " + c.aberturaHora + "h de hoje.";
    }

    const dias = $("days");
    dias.hidden = !(state.admin || state.agenda);
    dias.replaceChildren(...c.dias.map((d) => {
      const b = el("button", "", d.rotulo); b.type = "button";
      b.setAttribute("aria-pressed", String(d.id === state.dia));
      b.addEventListener("click", () => { state.dia = d.id; state.pending = null; carregar(); });
      return b;
    }));

    const sel = $("team");
    if (sel.options.length === 1) for (const t of c.equipes) sel.append(opcao(t.nome, t.nome));
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
      const podeCancelar = !MODO_AGENDA && !state.admin && state.reservas.some((r) => r.equipe === e && cancelavel(r.slot));
      if (podeCancelar) $("mine").append(el("span", "mine-hint", " Imprevisto? Toque no seu horário na grade para cancelar até " + CANCELA_ATE_MIN + " min antes; o crédito volta."));
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
    // Horários encerrados (sempre no começo do dia) viram uma linha só, para a grade abrir perto de agora.
    const encerrados = slotsDoDia().filter(passou);
    const recolher = encerrados.length >= 2;
    if (recolher) {
      const b = el("button", "row fold");
      b.type = "button"; b.dataset.fold = "1"; b.setAttribute("aria-expanded", String(state.verEncerrados));
      b.append(el("span", "fold-t", ini(encerrados[0]) + "–" + fim(encerrados[encerrados.length - 1])),
        el("span", "fold-n", encerrados.length + " horários encerrados"),
        el("span", "fold-a", state.verEncerrados ? "Ocultar" : "Mostrar"));
      linhas.push(b);
    }
    for (const s of slotsDoDia()) {
      if (recolher && !state.verEncerrados && passou(s)) continue;
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
          const podeCancelar = !state.admin && !state.agenda && nome === e && cancelavel(s);
          c = el(state.admin || podeCancelar ? "button" : "div", "seat " + (nome === e ? "own" : "taken"), nome);
          if (state.admin) { c.type = "button"; c.dataset.ocupada = String(s); c.dataset.equipe = nome; c.title = "Mover ou liberar"; }
          else if (podeCancelar) { c.type = "button"; c.dataset.cancelar = String(s); c.title = "Cancelar este treino"; c.append(el("small", "seat-act", "Cancelar")); }
        } else if (state.admin) {
          c = el("button", "seat free", "Livre"); c.type = "button"; c.dataset.livreAdmin = String(s);
        } else if (state.agenda && !passou(s)) {
          c = el("button", "seat free", "Livre"); c.type = "button"; c.dataset.livreAgenda = String(s);
        } else if (passou(s)) {
          c = el("div", "seat off", "Encerrado");
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
      for (const t of c.equipes) xs.append(opcao(t.nome, t.nome));
      if (state.equipe) xs.value = state.equipe;
      $("xValor").value = (c.extras || {})[xs.value] || 1;
    }
    const com = Object.entries(c.extras || {}).map(([nome, n]) => nome + " (+" + n + ")");
    $("xLista").textContent = com.length ? "Com extras neste dia: " + com.join(" · ") : "Nenhuma equipe com créditos extras neste dia. Use 0 para remover.";

    // Aparelhos que reservaram ou cancelaram para mais de uma equipe.
    const porOrigem = {};
    for (const r of state.auditoria.concat(state.cancelamentos)) {
      if (!r.origem || r.origem === "coordenacao" || r.origem === "agendamento") continue;
      (porOrigem[r.origem] = porOrigem[r.origem] || new Set()).add(r.equipe);
    }
    const suspeitos = Object.entries(porOrigem).filter(([, eqs]) => eqs.size > 1);
    $("auditLista").replaceChildren(...(suspeitos.length
      ? suspeitos.map(([o, eqs]) => el("li", "", "Aparelho " + o + ": " + [...eqs].map(comMesa).join(", ")))
      : [el("li", "", "Nenhum caso até agora.")]));

    // Cancelamentos do dia; destaca quando o aparelho que cancelou não é o que reservou.
    $("cancelLista").replaceChildren(...(state.cancelamentos.length
      ? state.cancelamentos.map((x) => {
        const outro = x.origemReserva && x.origemReserva !== "coordenacao" && x.origemReserva !== "agendamento" && x.origem !== x.origemReserva;
        const li = el("li", outro ? "alerta" : "", ini(x.slot) + " · " + x.equipe + " · cancelado " + fmtData(x.criadoEm) + " pelo aparelho " + (x.origem || "?"));
        if (outro) li.append(el("strong", "", " (reservado pelo aparelho " + x.origemReserva + ")"));
        return li;
      })
      : [el("li", "", "Nenhum cancelamento neste dia.")]));
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
      sub.textContent = "Usa 1 crédito do dia. Se precisar, a equipe pode cancelar até " + CANCELA_ATE_MIN + " minutos antes e o crédito volta.";
      txt.append(el("span", "sub warnline", "Somente para a sua equipe. Reservar por outra equipe pode levar à desclassificação."));
      acts.replaceChildren(voltar, botao("Confirmar reserva", "primary", () => executar(
        () => post("/api/reservar", { nivel: NIVEL, dia: state.dia, slot: p.slot, equipe: p.equipe }),
        "Reserva confirmada: " + ini(p.slot) + " para " + p.equipe + ". Confira seus horários acima.")));
    }

    if (p.tipo === "cancelar") {
      main.textContent = "Cancelar o treino de " + comMesa(p.equipe) + " às " + ini(p.slot) + "?";
      sub.textContent = "O horário fica livre para outras equipes e o crédito volta para a sua equipe. Vale até " + CANCELA_ATE_MIN + " minutos antes do início.";
      txt.append(el("span", "sub warnline", "Somente a própria equipe pode cancelar o seu treino. Todo cancelamento fica registrado com o aparelho usado: identificaremos se uma equipe cancelar o treino de outra."));
      acts.replaceChildren(voltar, botao("Cancelar treino", "danger", () => executar(
        () => post("/api/reservar", { acao: "cancelar", nivel: NIVEL, dia: state.dia, slot: p.slot, equipe: p.equipe }),
        "Treino das " + ini(p.slot) + " cancelado. O crédito voltou para " + p.equipe + ".")));
    }

    if (p.tipo === "admin-livre") {
      main.textContent = "Reservar " + ini(p.slot) + "–" + fim(p.slot) + " por uma equipe";
      sub.textContent = "Reserva feita pela coordenação.";
      const sel = el("select"); sel.setAttribute("aria-label", "Equipe");
      for (const t of state.cfg.equipes) sel.append(opcao(t.nome, t.nome, t.nome === p.equipe));
      sel.addEventListener("change", () => { p.equipe = sel.value; });
      const lab = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = p.forcar;
      cb.addEventListener("change", () => { p.forcar = cb.checked; });
      lab.append(cb, document.createTextNode("Ignorar créditos e horários seguidos"));
      campos.append(sel, lab);
      acts.replaceChildren(voltar, botao("Reservar", "primary", () => executar(
        () => admin("reservar", { slot: p.slot, equipe: p.equipe, forcar: p.forcar }),
        "Reserva feita: " + ini(p.slot) + " para " + p.equipe + ".")));
    }

    if (p.tipo === "agenda-livre") {
      main.textContent = "Marcar " + ini(p.slot) + "–" + fim(p.slot) + " para uma equipe";
      sub.textContent = "Reserva feita pelo agendamento. Depois de marcada, só a coordenação consegue mover ou liberar.";
      const sel = el("select"); sel.setAttribute("aria-label", "Equipe");
      sel.append(opcao("", "Escolha a equipe…", !p.equipe));
      for (const t of state.cfg.equipes) sel.append(opcao(t.nome, t.nome, t.nome === p.equipe));
      sel.addEventListener("change", () => { p.equipe = sel.value; });
      const lab = el("label", "check"); const cb = el("input"); cb.type = "checkbox"; cb.checked = p.forcar;
      cb.addEventListener("change", () => { p.forcar = cb.checked; });
      lab.append(cb, document.createTextNode("Ignorar créditos e horários seguidos"));
      campos.append(sel, lab);
      acts.replaceChildren(voltar, botao("Marcar treino", "primary", () => {
        if (!p.equipe) { toast("Escolha a equipe.", true); return; }
        executar(() => agendaApi("reservar", { slot: p.slot, equipe: p.equipe, forcar: p.forcar }),
          "Treino marcado: " + ini(p.slot) + " para " + p.equipe + ".");
      }));
    }

    if (p.tipo === "admin-ocupada") {
      main.textContent = comMesa(p.equipe) + " às " + ini(p.slot);
      const reg = state.auditoria.find((r) => r.slot === p.slot && r.equipe === p.equipe);
      sub.textContent = reg
        ? "Reservada em " + fmtData(reg.criadoEm) + " · " + (reg.origem === "coordenacao" ? "pela coordenação" : reg.origem === "agendamento" ? "pelo agendamento" : reg.origem ? "aparelho " + reg.origem : "origem não registrada")
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

    if (p.tipo === "admin-zerar") {
      const n = state.reservas.length;
      main.textContent = "Zerar " + (n === 1 ? "1 reserva" : n + " reservas") + " do Nível " + NIVEL + " em " + state.cfg.rotuloDia + "?";
      sub.textContent = "Todas as reservas deste nível nesse dia serão apagadas. Não dá para desfazer.";
      acts.replaceChildren(voltar, botao("Zerar reservas", "danger", () => executar(
        () => admin("zerar", { master: p.master }), "Reservas de " + state.cfg.rotuloDia + " zeradas.")));
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

  function sairAgenda() {
    state.agenda = false; state.senhaAgenda = "";
    try { sessionStorage.removeItem("obr-agenda"); } catch (e) {}
  }

  function sairAdmin() {
    state.admin = false; state.senha = ""; state.auditoria = [];
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
  }

  /* ---------- janela de regras ---------- */
  // Aparece uma vez por dia em cada aparelho; depois fica em "Ver regras".
  const dlg = $("regras");
  const hojeLocal = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  const marcarVisto = () => { try { localStorage.setItem(AVISO_KEY, hojeLocal()); } catch (e) {} };
  function abrirRegras() { if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute("open", ""); }
  function fecharRegras() {
    marcarVisto();
    if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
  }
  $("entendi").addEventListener("click", fecharRegras);
  $("verRegras").addEventListener("click", abrirRegras);
  dlg.addEventListener("cancel", marcarVisto);
  let jaViu = false;
  try { jaViu = localStorage.getItem(AVISO_KEY) === hojeLocal(); } catch (e) {}
  if (!jaViu && !MODO_COORD && !MODO_AGENDA) abrirRegras();

  /* ---------- eventos ---------- */
  $("team").addEventListener("change", (ev) => {
    state.equipe = ev.target.value; state.pending = null;
    try { localStorage.setItem("obr-equipe-n" + NIVEL, state.equipe); } catch (e) {}
    if (state.equipe && window.OBR_EQUIPE) window.OBR_EQUIPE.set({ modalidade: "Artística", nivel: NIVEL, nome: state.equipe });
    render();
  });

  $("soLivres").addEventListener("change", (ev) => { state.soLivres = ev.target.checked; render(); });

  $("grid").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b || state.busy || !state.cfg) return;
    const d = b.dataset;
    if (d.fold) { state.verEncerrados = !state.verEncerrados; renderGrid(); return; }
    if (d.cancelar !== undefined) {
      if (!state.equipe) return;
      state.pending = { tipo: "cancelar", slot: Number(d.cancelar), equipe: state.equipe };
    } else if (d.reservar !== undefined) {
      if (!state.equipe) { $("team").focus(); toast("Escolha a sua equipe antes de reservar."); return; }
      state.pending = { tipo: "reservar", slot: Number(d.reservar), equipe: state.equipe };
    } else if (d.livreAgenda !== undefined) {
      state.pending = { tipo: "agenda-livre", slot: Number(d.livreAgenda), equipe: "", forcar: false };
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

  $("zerarForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    state.pending = { tipo: "admin-zerar", master: $("master").value };
    $("master").value = "";
    renderSheet();
  });

  $("agendaForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = $("senhaAgenda").value;
    try {
      await post("/api/agenda", { senha, acao: "entrar" });
      state.senhaAgenda = senha; state.agenda = true; $("senhaAgenda").value = "";
      try { sessionStorage.setItem("obr-agenda", senha); } catch (e) {}
      render();
    } catch (e) { toast(e.message, true); }
  });

  $("agendaSair").addEventListener("click", () => { sairAgenda(); state.pending = null; render(); });

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

  async function entrarAgendaSalva() {
    if (!MODO_AGENDA || !state.senhaAgenda) return;
    try { await post("/api/agenda", { senha: state.senhaAgenda, acao: "entrar" }); state.agenda = true; render(); } catch (e) { sairAgenda(); render(); }
  }

  async function entrarComSenhaSalva() {
    if (!MODO_COORD || !state.senha) return;
    try { await post("/api/admin", { senha: state.senha, acao: "entrar" }); state.admin = true; await carregarAuditoria(); render(); } catch (e) { sairAdmin(); }
  }

  render();
  carregar();
  entrarComSenhaSalva();
  entrarAgendaSalva();
  setInterval(() => { if (document.visibilityState === "visible" && !state.busy && !state.pending) carregar(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !state.pending) carregar(); });
})();
