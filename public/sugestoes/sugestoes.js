// Sugestões e elogios: envio, votos (4 por equipe, 1 por sugestão, nunca na própria) e moderação em ?coordenacao.
(() => {
  const $ = (id) => document.getElementById(id);
  const MODO_COORD = new URLSearchParams(location.search).has("coordenacao");
  const state = { dados: null, lista: [], equipe: "", categoria: "sugestao", filtro: "", senha: "", admin: false, busy: false };
  try { state.equipe = localStorage.getItem("obr-sugestoes-equipe") || ""; } catch (e) {}
  if (!state.equipe && window.OBR_EQUIPE) state.equipe = window.OBR_EQUIPE.chave(window.OBR_EQUIPE.get());
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
  /* ---------- busca da equipe ---------- */
  const norm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const equipeAtual = () => state.dados && state.dados.equipes.find((e) => e.chave === state.equipe);
  let opcoes = [], ativa = -1;

  function abrirOpcoes() {
    if (!state.dados) return;
    const q = norm($("sgBusca").value.trim());
    // A lista já vem na ordem: Artística N1, Artística N2, Resgate N1, Resgate N2.
    opcoes = state.dados.equipes.filter((e) => !q || norm(e.nome).includes(q));
    ativa = q && opcoes.length ? 0 : -1;
    const ul = $("sgOpcoes");
    if (!opcoes.length) {
      ul.innerHTML = '<li class="sg-nada" aria-disabled="true">Nenhuma equipe com esse nome.</li>';
    } else {
      let grupo = "";
      ul.innerHTML = opcoes.map((e, i) => {
        const g = e.modalidade + " · Nível " + e.nivel;
        const cab = g !== grupo ? `<li class="sg-grupo" role="presentation">${esc(g)}</li>` : "";
        grupo = g;
        return cab + `<li role="option" id="sgOp${i}" data-i="${i}" aria-selected="${i === ativa}"><span class="n">${esc(e.modalidade.slice(0, 3).toUpperCase())}</span><span>${esc(e.nome)}<span class="t">${esc(g)}</span></span></li>`;
      }).join("");
    }
    ul.hidden = false;
    $("sgBusca").setAttribute("aria-expanded", "true");
  }
  function fecharOpcoes() { $("sgOpcoes").hidden = true; $("sgBusca").setAttribute("aria-expanded", "false"); }
  function marcar(i) {
    ativa = i;
    $("sgOpcoes").querySelectorAll("[role=option]").forEach((li) => li.setAttribute("aria-selected", String(Number(li.dataset.i) === i)));
    const li = $("sgOp" + i); if (li) li.scrollIntoView({ block: "nearest" });
  }
  function escolher(e) {
    state.equipe = e ? e.chave : "";
    try { localStorage.setItem("obr-sugestoes-equipe", state.equipe); } catch (er) {}
    if (e && window.OBR_EQUIPE) window.OBR_EQUIPE.set({ modalidade: e.modalidade, nivel: e.nivel, nome: e.nome });
    $("sgBusca").value = "";
    fecharOpcoes();
    render();
  }

  function renderEquipe() {
    const e = equipeAtual();
    if (state.dados && state.equipe && !e) state.equipe = "";
    $("sgEscolhida").hidden = !e;
    $("sgBuscaBox").hidden = !!e;
    if (e) { $("sgEscNome").textContent = e.nome; $("sgEscInfo").textContent = e.modalidade + " · Nível " + e.nivel; }
  }

  function meusVotos() { return state.equipe ? state.lista.filter((s) => !s.oculta && !s.implementada && s.votantes.includes(state.equipe)).length : 0; }

  function renderVotos() {
    if (!state.equipe) { $("sgVotos").textContent = `Escolha a sua equipe para enviar e votar. Cada equipe tem ${VOTOS()} votos para destacar as sugestões que mais quer ver.`; return; }
    const r = VOTOS() - meusVotos();
    const pips = Array.from({ length: VOTOS() }, (_, k) => `<span class="${k < r ? "" : "usado"}">👍</span>`).join("");
    $("sgVotos").innerHTML = `<span class="sg-pips" aria-hidden="true">${pips}</span> ` + (r > 0
      ? `<span><strong>${r} de ${VOTOS()} votos</strong> disponíveis. Toque em <strong>👍 Votar</strong> nas sugestões que a sua equipe quer ver acontecer.</span>`
      : `<span><strong>Votos esgotados.</strong> Toque em <strong>✓ Votado</strong> numa sugestão para retirar o voto e usar em outra.</span>`);
  }

  function renderLista() {
    const itens = state.lista.filter((s) => !state.filtro || s.categoria === state.filtro);
    if (!itens.length) {
      $("sgLista").innerHTML = `<p class="hint sg-vazio">${state.filtro === "elogio" ? "Nenhum elogio ainda." : state.filtro === "sugestao" ? "Nenhuma sugestão ainda." : "Nada por aqui ainda. Seja a primeira equipe a contribuir!"}</p>`;
      return;
    }
    const semVotos = state.equipe && meusVotos() >= VOTOS();
    // Implementadas vêm primeiro (servidor); o "Top N" conta só as que ainda estão em votação.
    const emVotacao = itens.filter((s) => !s.implementada);
    const card = (s) => {
      const i = s.implementada ? 99 : emVotacao.indexOf(s);
      const minha = s.autor === state.equipe;
      const votei = state.equipe && s.votantes.includes(state.equipe);
      const pop = state.pop === s.id ? " pop" : "";
      const voto = minha
        ? `<span class="sg-votar propria">Sugestão da sua equipe</span>`
        : `<button type="button" class="sg-votar${votei ? " on" : ""}${pop}" data-votar="${s.id}" aria-pressed="${votei ? "true" : "false"}"
             ${semVotos && !votei ? 'data-sem="1"' : ""} title="${votei ? "Toque para retirar o voto" : "Votar nesta sugestão"}"
             aria-label="${votei ? "Retirar voto de" : "Votar em"} ${esc(s.titulo)}">${votei
               ? '<span aria-hidden="true">✓</span> Votado<small>retirar</small>'
               : '<span aria-hidden="true">👍</span> Votar'}</button>`;
      const conta = `<span class="sg-conta"><span aria-hidden="true">👍</span> <b>${s.votos}</b> voto${s.votos === 1 ? "" : "s"}</span>`;
      const adm = state.admin ? `<div class="sg-adm">
          <button type="button" class="chip-btn" data-ocultar="${s.id}" data-oculta="${s.oculta ? "0" : "1"}">${s.oculta ? "Mostrar" : "Ocultar"}</button>
          ${s.categoria === "sugestao" ? `<button type="button" class="chip-btn${s.implementada ? "" : " impl"}" data-implementar="${s.id}" data-valor="${s.implementada ? "0" : "1"}">${s.implementada ? "Desmarcar implementada" : "✓ Marcar como implementada"}</button>` : ""}
          <button type="button" class="chip-btn" data-responder="${s.id}">${s.resposta ? "Editar nota" : "Nota da organização"}</button>
          <button type="button" class="st-x" data-apagar="${s.id}">Apagar</button>
          <span class="hint">${s.origem ? "aparelho " + esc(s.origem) : ""}</span></div>` : "";
      return `<article class="sg-card${s.oculta ? " oculta" : ""}${s.implementada ? " feita" : ""}">
        <div class="sg-corpo">
          <div class="sg-meta"><span class="sg-tag ${s.categoria}">${s.categoria === "elogio" ? "👏 Elogio" : "💡 Sugestão"}</span>${i < 3 && s.votos > 0 && !state.filtro ? `<span class="sg-top">Top ${i + 1}</span>` : ""}${s.implementada ? '<span class="sg-impl">✓ Sugestão implementada</span>' : ""}${s.oculta ? '<span class="sg-top">Oculta</span>' : ""}</div>
          <h3>${esc(s.titulo)}</h3>
          <p>${esc(s.descricao)}</p>
          ${s.resposta ? `<div class="sg-resp"><strong>Nota da organização</strong>${esc(s.resposta)}</div>` : ""}
          <span class="sg-autor">por ${esc(s.equipe)} · ${esc(s.modalidade)}${s.nivel ? " N" + s.nivel : ""}</span>
        </div>
        ${s.implementada ? "" : `<div class="sg-pe">${conta}${voto}</div>`}
        ${adm}
      </article>`;
    };
    // Implementadas ficam compiladas num bloco recolhido (fixadas pela organização continuam soltas no topo).
    const fixadas = itens.filter((s) => s.fixada);
    const feitas = itens.filter((s) => !s.fixada && s.implementada);
    const resto = itens.filter((s) => !s.fixada && !s.implementada);
    const bloco = feitas.length ? `<details class="sg-feitas" id="sgFeitas"${state.feitasAbertas ? " open" : ""}>
        <summary><span class="sg-impl">✓ ${feitas.length} sugest${feitas.length === 1 ? "ão implementada" : "ões implementadas"}</span><span class="sg-feitas-cta" aria-hidden="true"></span></summary>
        <div class="sg-feitas-lista">${feitas.map(card).join("")}</div>
      </details>` : "";
    $("sgLista").innerHTML = fixadas.map(card).join("") + bloco + resto.map(card).join("");
    const det = $("sgFeitas");
    if (det) det.addEventListener("toggle", () => { state.feitasAbertas = det.open; });
    state.pop = null;
  }

  function render() {
    renderEquipe();
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
  $("sgBusca").addEventListener("input", abrirOpcoes);
  $("sgBusca").addEventListener("focus", abrirOpcoes);
  $("sgBusca").addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if ($("sgOpcoes").hidden) abrirOpcoes();
      if (!opcoes.length) return;
      marcar(ativa < 0 ? (ev.key === "ArrowDown" ? 0 : opcoes.length - 1) : (ativa + (ev.key === "ArrowDown" ? 1 : opcoes.length - 1)) % opcoes.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (ativa >= 0 && opcoes[ativa]) escolher(opcoes[ativa]);
      else if (opcoes.length === 1) escolher(opcoes[0]);
    } else if (ev.key === "Escape") fecharOpcoes();
  });
  // pointerdown escolhe antes do blur fechar a lista.
  $("sgOpcoes").addEventListener("pointerdown", (ev) => {
    const li = ev.target.closest("[data-i]"); if (!li) return;
    ev.preventDefault(); escolher(opcoes[Number(li.dataset.i)]);
  });
  $("sgBusca").addEventListener("blur", () => setTimeout(fecharOpcoes, 150));
  $("sgTrocar").addEventListener("click", () => { escolher(null); $("sgBusca").focus(); });

  document.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    state.categoria = b.dataset.cat;
    document.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    $("sgTitulo").placeholder = state.categoria === "elogio" ? "Ex.: Arbitragem muito atenciosa" : "Ex.: Mais tomadas nas mesas";
  }));

  function atualizarContador() {
    const n = palavras($("sgDesc").value);
    $("sgCont").textContent = `${n}/${MAX()} palavras`;
    $("sgCont").classList.toggle("over", n > MAX());
  }
  $("sgDesc").addEventListener("input", atualizarContador);

  $("sgForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!state.equipe) { toast("Escolha a sua equipe no topo da página.", true); $("sgBusca").focus(); return; }
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
      if (!state.equipe) { toast("Escolha a sua equipe no topo da página para votar.", true); $("sgBusca").focus(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      const on = v.getAttribute("aria-pressed") === "true";
      if (!on && v.dataset.sem) { toast(`Sua equipe já usou os ${VOTOS()} votos. Retire um voto para votar em outra.`, true); return; }
      if (!on) state.pop = Number(v.dataset.votar);
      executar(() => post("/api/sugestoes", { acao: on ? "desvotar" : "votar", id: Number(v.dataset.votar), equipe: state.equipe }),
        on ? "Voto retirado. Ele voltou para a sua equipe." : "👍 Voto registrado! Obrigado por participar.");
      return;
    }
    const o = ev.target.closest("[data-ocultar]");
    if (o) { executar(() => admin("ocultar", { id: Number(o.dataset.ocultar), oculta: o.dataset.oculta === "1" }), o.dataset.oculta === "1" ? "Sugestão ocultada." : "Sugestão visível de novo."); return; }
    const im = ev.target.closest("[data-implementar]");
    if (im) { executar(() => admin("implementar", { id: Number(im.dataset.implementar), implementada: im.dataset.valor === "1" }), im.dataset.valor === "1" ? "Marcada como implementada." : "Marcação de implementada removida."); return; }
    const rp = ev.target.closest("[data-responder]");
    if (rp) {
      const atual = (state.lista.find((s) => s.id === Number(rp.dataset.responder)) || {}).resposta || "";
      const resposta = prompt("Nota da organização (até 300 caracteres; deixe vazio para remover):", atual);
      if (resposta !== null) executar(() => admin("responder", { id: Number(rp.dataset.responder), resposta }), resposta.trim() ? "Nota salva." : "Nota removida.");
      return;
    }
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
