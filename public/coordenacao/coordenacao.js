// Tela única da coordenação: uma senha (guardada em sessionStorage "obr-coord", a mesma que as
// outras páginas leem) e cada parte em um tópico que abre a página em ?coordenacao&embed.
(() => {
  const $ = (id) => document.getElementById(id);
  let senha = "";
  try { senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  async function confere(s) {
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha: s, acao: "entrar" }) });
    if (r.ok) return true;
    let d = {}; try { d = await r.json(); } catch (e) {}
    throw new Error(d.erro || "Falha de conexão.");
  }

  function mostrar(logado) {
    $("login").hidden = logado;
    $("painel").hidden = !logado;
    if (logado) { resumos(); ptCarregar(); }
    else setTimeout(() => $("senha").focus(), 50);
  }

  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const s = $("senha").value;
    try {
      await confere(s);
      senha = s; $("senha").value = "";
      try { sessionStorage.setItem("obr-coord", s); } catch (e) {}
      mostrar(true);
    } catch (e) { toast(e.message, true); }
  });

  $("sair").addEventListener("click", () => {
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
    location.reload();
  });

  // Abre o tópico: carrega a página da coordenação dentro dele na primeira vez.
  document.querySelectorAll("details.co-sec[data-src]").forEach((d) => {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      const corpo = d.querySelector(".co-corpo");
      if (corpo.dataset.pronto) return;
      corpo.dataset.pronto = "1";
      const src = d.dataset.src;
      const f = document.createElement("iframe");
      f.className = "co-frame"; f.src = src; f.title = d.querySelector("summary strong").textContent;
      const acoes = document.createElement("div");
      acoes.className = "co-acoes";
      const rec = document.createElement("button");
      rec.type = "button"; rec.className = "chip-btn"; rec.textContent = "Recarregar";
      rec.addEventListener("click", () => { f.src = src; resumos(); });
      const nova = document.createElement("a");
      nova.className = "chip-btn"; nova.href = src.replace("&embed", ""); nova.target = "_blank"; nova.rel = "noopener"; nova.textContent = "Abrir em tela cheia";
      acoes.append(rec, nova);
      corpo.append(acoes, f);
    });
  });

  // Resumo de cada tópico, a partir das APIs públicas.
  const json = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const pl = (n, s, p) => n + " " + (n === 1 ? s : p);
  const set = (k, txt) => { const el = document.querySelector(`[data-resumo="${k}"]`); if (el) el.textContent = txt; };

  async function resumos() {
    const [n1, n2, st, str, sg] = await Promise.all([
      json("/api/estado?nivel=1"), json("/api/estado?nivel=2"),
      json("/api/superteams"), json("/api/superteams?modalidade=resgate"), json("/api/sugestoes"),
    ]);
    for (const [k, d] of [["n1", n1], ["n2", n2]]) {
      if (!d) { set(k, "Não foi possível carregar"); continue; }
      const vagas = d.grade.nSlots * d.grade.porSlot;
      set(k, `${d.palco} · ${d.rotuloDia}: ${pl(d.reservas.length, "reserva", "reservas")} de ${vagas} vagas`);
    }
    for (const [k, d] of [["st", st], ["str", str]]) {
      if (!d) { set(k, "Não foi possível carregar"); continue; }
      const estado = d.times ? "resultado publicado" : d.aberto ? "inscrições abertas" : "inscrições fechadas";
      set(k, `${pl(d.total, "equipe inscrita", "equipes inscritas")} (N1 ${d.porNivel[1] || 0} · N2 ${d.porNivel[2] || 0}) · ${estado}`);
    }
    if (sg) {
      const l = sg.sugestoes, impl = l.filter((s) => s.implementada).length;
      const pend = l.filter((s) => s.categoria === "sugestao" && !s.implementada).length;
      set("sg", `${pl(l.length, "mensagem", "mensagens")} · ${pl(pend, "sugestão em aberto", "sugestões em aberto")} · ${pl(impl, "implementada", "implementadas")}`);
    } else set("sg", "Não foi possível carregar");
  }

  // Pontuação: um interruptor por modalidade e nível.
  const PT_NOMES = { resgate: "Resgate", artistica: "Artística" };
  async function ptApi(body) {
    const r = await fetch("/api/pontuacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erro || "Falha de conexão.");
    return d;
  }
  function ptResumo(d) {
    const parte = (m) => {
      const l = [1, 2].filter((n) => d[m][n].liberado);
      return PT_NOMES[m] + ": " + (l.length === 2 ? "divulgada" : l.length ? `N${l[0]} divulgada, N${3 - l[0]} em andamento` : "em andamento");
    };
    set("pt", Object.keys(PT_NOMES).map(parte).join(" · "));
  }
  function ptDesenhar(d) {
    ptResumo(d);
    const ul = $("ptLista"); ul.innerHTML = "";
    for (const m of Object.keys(PT_NOMES)) for (const n of [1, 2]) {
      const x = d[m][n];
      const li = document.createElement("li");
      const t = document.createElement("span");
      t.innerHTML = `<strong>${PT_NOMES[m]} · N${n}</strong><br>`;
      t.append(x.temLink ? (x.liberado ? "Divulgada" : "Em andamento") : "Sem link ainda");
      const acoes = document.createElement("span"); acoes.className = "co-acoes";
      if (x.url) { const a = document.createElement("a"); a.className = "chip-btn"; a.href = x.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Abrir"; acoes.append(a); }
      const b = document.createElement("button");
      b.type = "button"; b.className = x.liberado ? "btn" : "btn primary"; b.disabled = !x.temLink;
      b.textContent = x.liberado ? "Ocultar" : "Divulgar";
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          ptDesenhar(await ptApi({ acao: "liberar", modalidade: m, nivel: n, liberado: !x.liberado }));
          toast(`Pontuação ${PT_NOMES[m]} N${n} ${x.liberado ? "ocultada" : "divulgada"}.`);
        } catch (e) { toast(e.message, true); b.disabled = false; }
      });
      acoes.append(b); li.append(t, acoes); ul.append(li);
    }
  }
  function ptCarregar() { ptApi({ acao: "listar" }).then(ptDesenhar).catch(() => set("pt", "Não foi possível carregar")); }

  if (!senha) { mostrar(false); return; }
  confere(senha).then(() => mostrar(true)).catch(() => {
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
    mostrar(false);
  });
  setInterval(() => { if (document.visibilityState === "visible" && !$("painel").hidden) resumos(); }, 60000);
})();
