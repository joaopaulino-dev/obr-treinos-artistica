// Sugestões e elogios: envio, votos (4 por equipe, 1 por sugestão, nunca na própria) e moderação em ?coordenacao.
(() => {
  const $ = (id) => document.getElementById(id);
  const MODO_COORD = new URLSearchParams(location.search).has("coordenacao");
  const state = { dados: null, lista: [], equipe: "", categoria: "sugestao", filtro: "", senha: "", admin: false, busy: false };
  try { state.equipe = localStorage.getItem("obr-sugestoes-equipe") || ""; } catch (e) {}
  try { state.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const palavras = (t) => t.trim().split(/\s+/).filter(Boolean).length;
  const MAX = () => (state.dados && state.dados.palavrasMax) || 30;
  const VOTOS = () => (state.dados && state.dados.votosPorEquipe) || 4;

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }
  async function api(caminho, opcoes) {
    const r = await fetch(caminho, opcoes);
    let dados = {};
    try { dados = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(dados.erro || "Falha de conexão."); err.status = r.status; throw err; }
    return dados;
  }
  const post = (caminho, corpo) => api(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const admin = (acao, extra) => post("/api/sugestoes-admin", { senha: state.senha, acao, ...extra });

  /* ---------- render ---------- */
  function preencherEquipes() {
    const sel = $("sgEquipe");
    if (sel.dataset.pronto || !state.dados) return;
    const grupos = {};
    for (const e of state.dados.equipes) (grupos[e.modalidade + " · Nível " + e.nivel] = grupos[e.modalidade + " · Nível " + e.nivel] || []).push(e);
    sel.innerHTML = '<option value="">Escolha a sua equipe</option>' + Object.entries(grupos).map(([g, l]) =>
      `<optgroup label="${esc(g)}">` + l.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((e) => `<option value="${esc(e.chave)}">${esc(e.nome)}</option>`).join("") + "</optgroup>").join("");
    sel.dataset.pronto = "1";
    if (!state.dados.equipes.some((e) => e.chave === state.equipe)) state.equipe = "";
    sel.value = state.equipe;
  }

  function meusVotos() { return state.equipe ? state.lista.filter((s) => !s.oculta && s.votantes.includes(state.equipe)).length : 0; }

  function renderVotos() {
    if (!state.equipe) { $("sgVotos").textContent = `Escolha a sua equipe para enviar e votar. Cada equipe tem ${VOTOS()} votos para destacar as sugestões que mais quer ver.`; return; }
    const r = VOTOS() - meusVotos();
    $("sgVotos").textContent = r > 0 ? `Sua equipe tem ${r} de ${VOTOS()} votos disponíveis.` : `Sua equipe já usou os ${VOTOS()} votos. Toque num voto dado para retirá-lo e votar em outra.`;
  }

  function renderLista() {
    const itens = state.lista.filter((s) => !state.filtro || s.categoria === state.filtro);
    if (!itens.length) {
      $("sgLista").innerHTML = `<p class="hint sg-vazio">${state.filtro === "elogio" ? "Nenhum elogio ainda." : state.filtro === "sugestao" ? "Nenhuma sugestão ainda." : "Nada por aqui ainda. Seja a primeira equipe a contribuir!"}</p>`;
      return;
    }
    const semVotos = state.equipe && meusVotos() >= VOTOS();
    $("sgLista").innerHTML = itens.map((s, i) => {
      const minha = s.autor === state.equipe;
      const votei = state.equipe && s.votantes.includes(state.equipe);
      const voto = minha
        ? `<span class="sg-voto propria" title="Sugestão da sua equipe"><b>${s.votos}</b><small>voto${s.votos === 1 ? "" : "s"}</small></span>`
        : `<button type="button" class="sg-voto${votei ? " on" : ""}" data-votar="${s.id}" aria-pressed="${votei ? "true" : "false"}"
             ${semVotos && !votei ? 'data-sem="1"' : ""} aria-label="${votei ? "Retirar voto" : "Votar"} em ${esc(s.titulo)}">
             <span aria-hidden="true">▲</span><b>${s.votos}</b><small>${votei ? "votado" : "votar"}</small></button>`;
      const adm = state.admin ? `<div class="sg-adm">
          <button type="button" class="chip-btn" data-ocultar="${s.id}" data-oculta="${s.oculta ? "0" : "1"}">${s.oculta ? "Mostrar" : "Ocultar"}</button>
          <button type="button" class="st-x" data-apagar="${s.id}">Apagar</button>
          <span class="hint">${s.origem ? "aparelho " + esc(s.origem) : ""}</span></div>` : "";
      return `<article class="sg-card${s.oculta ? " oculta" : ""}">
        ${voto}
        <div class="sg-corpo">
          <div class="sg-meta"><span class="sg-tag ${s.categoria}">${s.categoria === "elogio" ? "👏 Elogio" : "💡 Sugestão"}</span>${i < 3 && s.votos > 0 && !state.filtro ? `<span class="sg-top">Top ${i + 1}</span>` : ""}${s.oculta ? '<span class="sg-top">Oculta</span>' : ""}</div>
          <h3>${esc(s.titulo)}</h3>
          <p>${esc(s.descricao)}</p>
          <span class="sg-autor">por ${esc(s.equipe)} · ${esc(s.modalidade)}${s.nivel ? " N" + s.nivel : ""}</span>
          ${adm}
        </div>
      </article>`;
    }).join("");
  }

  function render() {
    preencherEquipes();
    renderVotos();
    renderLista();
    $("admin").hidden = !MODO_COORD;
    $("adminForm").hidden = state.admin;
    $("adminTools").hidden = !state.admin;
  }

  function aplicar(d) { state.dados = { ...(state.dados || {}), ...d }; }

  async function carregar() {
    try {
      if (state.admin) {
        const [pub, adm] = await Promise.all([api("/api/sugestoes"), admin("listar")]);
        aplicar(pub); state.lista = adm.sugestoes;
      } else {
        const d = await api("/api/sugestoes"); aplicar(d); state.lista = d.sugestoes;
      }
    } catch (e) {
      if (e.status === 401) { sairAdmin(); return carregar(); }
      if (!state.dados) $("sgLista").innerHTML = '<p class="hint">Não foi possível carregar. Verifique a conexão e recarregue a página.</p>';
    }
    render();
  }

  async function executar(fn, sucesso) {
    if (state.busy) return;
    state.busy = true;
    try {
      const d = await fn();
      if (state.admin) await carregar(); else { aplicar(d); state.lista = d.sugestoes; render(); }
      if (sucesso) toast(sucesso);
    } catch (e) {
      toast(e.message, true);
      if (e.status === 409) carregar();
    } finally { state.busy = false; }
  }

  /* ---------- eventos ---------- */
  $("sgEquipe").addEventListener("change", (ev) => {
    state.equipe = ev.target.value;
    try { localStorage.setItem("obr-sugestoes-equipe", state.equipe); } catch (e) {}
    render();
  });

  document.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    state.categoria = b.dataset.cat;
    document.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $("sgTitulo").placeholder = state.categoria === "elogio" ? "Ex.: Equipe de arbitragem muito atenciosa" : "Ex.: Mais tomadas perto das mesas";
  }));

  function atualizarContador() {
    const n = palavras($("sgDesc").value);
    $("sgCont").textContent = `${n}/${MAX()} palavras`;
    $("sgCont").classList.toggle("over", n > MAX());
  }
  $("sgDesc").addEventListener("input", atualizarContador);

  $("sgForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!state.equipe) { toast("Escolha a sua equipe no topo da página.", true); $("sgEquipe").focus(); return; }
    const titulo = $("sgTitulo").value.trim(), descricao = $("sgDesc").value.trim();
    if (titulo.length < 3) { toast("Escreva um título.", true); $("sgTitulo").focus(); return; }
    const n = palavras(descricao);
    if (!n) { toast("Escreva a descrição.", true); $("sgDesc").focus(); return; }
    if (n > MAX()) { toast(`A descrição pode ter no máximo ${MAX()} palavras.`, true); $("sgDesc").focus(); return; }
    $("sgEnviar").disabled = true;
    executar(async () => {
      const d = await post("/api/sugestoes", { acao: "criar", titulo, descricao, categoria: state.categoria, equipe: state.equipe });
      $("sgForm").reset(); atualizarContador();
      return d;
    }, state.categoria === "elogio" ? "Elogio publicado. Obrigado!" : "Sugestão publicada. Obrigado!")
      .finally(() => { $("sgEnviar").disabled = false; });
  });

  document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => {
    state.filtro = b.dataset.filtro;
    document.querySelectorAll("[data-filtro]").forEach((x) => { const on = x === b; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; });
    renderLista();
  }));

  $("sgLista").addEventListener("click", (ev) => {
    const v = ev.target.closest("[data-votar]");
    if (v) {
      if (!state.equipe) { toast("Escolha a sua equipe no topo da página para votar.", true); $("sgEquipe").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const on = v.getAttribute("aria-pressed") === "true";
      if (!on && v.dataset.sem) { toast(`Sua equipe já usou os ${VOTOS()} votos. Retire um voto para votar em outra.`, true); return; }
      executar(() => post("/api/sugestoes", { acao: on ? "desvotar" : "votar", id: Number(v.dataset.votar), equipe: state.equipe }), on ? "Voto retirado." : "Voto registrado.");
      return;
    }
    const o = ev.target.closest("[data-ocultar]");
    if (o) { executar(() => admin("ocultar", { id: Number(o.dataset.ocultar), oculta: o.dataset.oculta === "1" }), o.dataset.oculta === "1" ? "Sugestão ocultada." : "Sugestão visível de novo."); return; }
    const a = ev.target.closest("[data-apagar]");
    if (a && confirm("Apagar esta sugestão e os votos dela? Não dá para desfazer.")) executar(() => admin("apagar", { id: Number(a.dataset.apagar) }), "Sugestão apagada.");
  });

  function sairAdmin() {
    state.admin = false; state.senha = "";
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
  }
  $("adminForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = $("senha").value;
    try {
      await post("/api/sugestoes-admin", { senha, acao: "entrar" });
      state.senha = senha; state.admin = true; $("senha").value = "";
      try { sessionStorage.setItem("obr-coord", senha); } catch (e) {}
      carregar();
    } catch (e) { toast(e.message, true); }
  });
  $("adminSair").addEventListener("click", () => { sairAdmin(); carregar(); });

  render();
  (async () => {
    if (MODO_COORD && state.senha) {
      try { await post("/api/sugestoes-admin", { senha: state.senha, acao: "entrar" }); state.admin = true; } catch (e) { sairAdmin(); }
    }
    carregar();
  })();
  setInterval(() => { if (document.visibilityState === "visible" && !state.busy) carregar(); }, 30000);
})();
