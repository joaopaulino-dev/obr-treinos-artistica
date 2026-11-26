// Super Teams: inscrição pública (uma por equipe) e, em ?coordenacao, lista, sorteio, publicação e CSV.
(() => {
  const $ = (id) => document.getElementById(id);
  const MODO_COORD = new URLSearchParams(location.search).has("coordenacao");
  // A mesma página serve a Artística (/superteams, sorteio por nível) e o Resgate (/superteams/resgate, N1 e N2 misturados).
  const RESGATE = location.pathname.startsWith("/superteams/resgate");
  const MOD = RESGATE ? "Resgate" : "Artística";
  const Q = RESGATE ? "?modalidade=resgate" : "";
  const MSG_OK = document.body.dataset.ok || "O sorteio acontece depois das entrevistas; o resultado aparece nesta página.";
  const CHAVE_LOCAL = RESGATE ? "obr-superteams-resgate-enviada" : "obr-superteams-enviada";
  const state = { pub: null, adm: null, senha: "", busy: false };
  try { state.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hora = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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
  if (!RESGATE) {
    document.getElementById("admSorteioHint").textContent = "Separado por nível e equilibrado pelo número de pessoas. Nenhum time passa do máximo: com 3, os times ficam com 2 ou 3 equipes. Sortear fecha as inscrições e despublica o resultado.";
    document.getElementById("admTamanhoL").textContent = "Máximo de equipes por time";
    document.querySelectorAll(".st-juntas").forEach((e) => { e.hidden = false; });
  }
  const admin = (acao, extra) => post("/api/superteams-admin", { senha: state.senha, acao, modalidade: RESGATE ? "resgate" : "", ...extra });

  /* ---------- página pública ---------- */
  function lembrada() { try { return localStorage.getItem(CHAVE_LOCAL) || ""; } catch (e) { return ""; } }

  function preencherEquipes(equipes) {
    const sel = $("stEquipe");
    if (sel.dataset.pronto) return;
    sel.innerHTML = '<option value="">Escolha a sua equipe</option>' + Object.entries(equipes).map(([n, lista]) =>
      `<optgroup label="Nível ${n}">` + [...lista].sort((a, b) => a.localeCompare(b, "pt-BR")).map((e) => `<option>${esc(e)}</option>`).join("") + "</optgroup>").join("");
    sel.dataset.pronto = "1";
    const eq = window.OBR_EQUIPE && window.OBR_EQUIPE.get();
    if (eq && eq.modalidade === MOD && Object.values(equipes).some((l) => l.includes(eq.nome))) sel.value = eq.nome;
  }

  function cardsTimes(times, adm) {
    const div = (t) => adm && t.equipes.length >= 4 ? `<button class="st-x" type="button" data-dividir="${esc(t.nome)}">Dividir em 2</button>` : "";
    if (RESGATE) return times.map((t) => `
        <article class="st-time">
          <header><strong>${esc(t.nome)}</strong><span>${t.pessoas} pessoa${t.pessoas === 1 ? "" : "s"}</span>${div(t)}</header>
          <ul>${t.equipes.map((e) => `<li>${esc(e.equipe)} <span>N${e.nivel} · ${e.integrantes}</span></li>`).join("")}</ul>
        </article>`).join("");
    return [1, 2].map((n) => {
      const doNivel = times.filter((t) => t.nivel === n);
      if (!doNivel.length) return "";
      return `<h3 class="st-nivel">Nível ${n}</h3>` + doNivel.map((t) => `
        <article class="st-time">
          <header><strong>${esc(t.nome)}</strong><span>${t.pessoas} pessoa${t.pessoas === 1 ? "" : "s"}</span>${div(t)}</header>
          <ul>${t.equipes.map((e) => `<li>${esc(e.equipe)} <span>${e.integrantes}</span></li>`).join("")}</ul>
        </article>`).join("");
    }).join("");
  }

  function renderPublico() {
    const d = state.pub;
    if (!d) return;
    preencherEquipes(d.equipes);
    $("stTotal").textContent = d.total
      ? `${d.total} equipe${d.total === 1 ? "" : "s"} já demonstr${d.total === 1 ? "ou" : "aram"} interesse (Nível 1: ${d.porNivel[1] || 0} · Nível 2: ${d.porNivel[2] || 0}).`
      : "Nenhuma equipe inscrita ainda. Seja a primeira!";
    $("stForm").hidden = !d.aberto;
    $("stFechado").hidden = d.aberto;
    const minha = lembrada();
    $("stOk").hidden = !minha;
    if (minha) $("stOk").innerHTML = `<strong>Interesse registrado: ${esc(minha)}.</strong> ${esc(MSG_OK)}`;
    $("stResultado").hidden = !d.times;
    if (d.times) $("stTimes").innerHTML = cardsTimes(d.times);
  }

  async function carregar() {
    try { state.pub = await api("/api/superteams" + Q); renderPublico(); }
    catch (e) { $("stTotal").textContent = "Não foi possível carregar. Verifique a conexão e recarregue a página."; }
  }

  $("stForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (state.busy) return;
    const equipe = $("stEquipe").value, integrantes = Number($("stIntegrantes").value);
    if (!equipe) { toast("Escolha a sua equipe na lista.", true); $("stEquipe").focus(); return; }
    if (!Number.isInteger(integrantes) || integrantes < 1 || integrantes > 15) { toast("Informe quantos integrantes estão presentes (1 a 15).", true); $("stIntegrantes").focus(); return; }
    if (!confirm(`Confirmar o interesse da equipe ${equipe} (${integrantes} integrante${integrantes === 1 ? "" : "s"}) no Super Teams?`)) return;
    state.busy = true; $("stEnviar").disabled = true;
    try {
      state.pub = await post("/api/superteams" + Q, { equipe, integrantes });
      try { localStorage.setItem(CHAVE_LOCAL, equipe); } catch (e) {}
      if (window.OBR_EQUIPE) window.OBR_EQUIPE.set({ modalidade: MOD, nivel: Number(Object.keys(state.pub.equipes).find((n) => state.pub.equipes[n].includes(equipe))) || null, nome: equipe });
      $("stForm").reset();
      renderPublico();
      toast("Interesse registrado. Boa sorte no sorteio!");
      if (state.adm) carregarAdmin();
    } catch (e) {
      toast(e.message, true);
      if (e.status === 409) carregar();
    } finally { state.busy = false; $("stEnviar").disabled = false; }
  });

  /* ---------- coordenação ---------- */
  function renderAdmin() {
    $("admin").hidden = !MODO_COORD;
    const logado = !!state.adm;
    $("adminForm").hidden = logado;
    $("adminTools").hidden = !logado;
    if (!logado) return;
    const d = state.adm;
    const n1 = d.inscritas.filter((i) => i.nivel === 1), n2 = d.inscritas.filter((i) => i.nivel === 2);
    const soma = (l) => l.reduce((s, i) => s + i.integrantes, 0);
    $("admStatus").textContent = `Inscrições ${d.aberto ? "abertas" : "fechadas"} · ${d.inscritas.length} equipe(s): N1 ${n1.length} (${soma(n1)} pessoas) · N2 ${n2.length} (${soma(n2)} pessoas).`;
    $("admAbrir").textContent = d.aberto ? "Fechar inscrições" : "Reabrir inscrições";
    $("admLista").innerHTML = d.inscritas.length
      ? d.inscritas.map((i) => `<tr><td>${esc(i.equipe)}</td><td>N${i.nivel}</td><td>${i.integrantes}</td><td>${hora(i.criadoEm)}</td>
          <td><button class="st-x" type="button" data-remover="${esc(i.equipe)}" aria-label="Remover ${esc(i.equipe)}">Remover</button></td></tr>`).join("")
      : '<tr><td colspan="5" class="hint">Nenhuma inscrição ainda.</td></tr>';
    const s = d.sorteio;
    $("admSortear").textContent = s ? "Sortear de novo" : "Sortear";
    if (s) $("admTamanho").value = s.tamanho;
    $("admAvisos").innerHTML = s && s.avisos && s.avisos.length ? `<div class="aviso" role="note">${s.avisos.map((a) => `<p>${esc(a)}</p>`).join("")}</div>` : "";
    $("admTimes").innerHTML = s ? cardsTimes(s.times, true) : "";
    $("refazerForm").hidden = RESGATE || !s;
    preencherJuntas();
    $("admPubBox").hidden = !s;
    $("admPublicar").textContent = d.publicado ? "Ocultar resultado" : "Publicar resultado";
    $("admPubStatus").textContent = s ? `Sorteado em ${hora(s.feitoEm)} · ${d.publicado ? "visível na página pública" : "ainda não publicado"}` : "";
  }

  async function carregarAdmin() {
    try { state.adm = await admin("listar"); renderAdmin(); }
    catch (e) { if (e.status === 401) sair(); toast(e.message, true); }
  }

  async function executar(fn, sucesso) {
    if (state.busy) return;
    state.busy = true;
    try { state.adm = await fn(); renderAdmin(); toast(sucesso); carregar(); }
    catch (e) { toast(e.message, true); if (e.status === 401) sair(); }
    finally { state.busy = false; }
  }

  function sair() {
    state.adm = null; state.senha = "";
    try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
    renderAdmin();
  }

  $("adminForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const senha = $("senha").value;
    try {
      await admin("entrar", { senha });
      state.senha = senha; $("senha").value = "";
      try { sessionStorage.setItem("obr-coord", senha); } catch (e) {}
      await carregarAdmin();
    } catch (e) { toast(e.message, true); }
  });
  $("adminSair").addEventListener("click", sair);

  $("admAbrir").addEventListener("click", () => {
    const abrir = !state.adm.aberto;
    executar(() => admin("abrir", { aberto: abrir }), abrir ? "Inscrições reabertas." : "Inscrições fechadas.");
  });

  $("admLista").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-remover]");
    if (!b) return;
    const equipe = b.dataset.remover;
    const aviso = state.adm.sorteio ? " O sorteio atual será descartado e precisará ser feito de novo." : "";
    if (!confirm(`Remover a inscrição de ${equipe}?${aviso}`)) return;
    executar(() => admin("remover", { equipe }), `Inscrição de ${equipe} removida.`);
  });

  $("sorteioForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const tamanho = Number($("admTamanho").value);
    const juntas = RESGATE ? [] : [...new Set([$("sorJunta1").value, $("sorJunta2").value].filter(Boolean))];
    if (juntas.length === 1) { toast("Escolha as duas equipes que ficam juntas, ou deixe as duas em branco.", true); return; }
    const msg = state.adm.sorteio
      ? `Sortear de novo com até ${tamanho} equipes por time? O resultado atual será substituído e despublicado.`
      : `Sortear com até ${tamanho} equipes por time? As inscrições serão fechadas.`;
    if (!confirm(msg)) return;
    executar(() => admin("sortear", { tamanho, juntas }), "Sorteio feito. Confira e publique quando quiser.");
  });

  function preencherJuntas() {
    if (!state.adm) return;
    if (!RESGATE) {
      const todas = (n) => state.adm.inscritas.filter((i) => i.nivel === n).map((i) => i.equipe).sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const id of ["sorJunta1", "sorJunta2"]) {
        const sel = $(id), v = sel.value;
        sel.innerHTML = '<option value="">—</option>' + [1, 2].map((n) => `<optgroup label="Nível ${n}">` + todas(n).map((e) => `<option>${esc(e)}</option>`).join("") + "</optgroup>").join("");
        sel.value = v;
      }
    }
    const n = Number($("refNivel").value);
    const nomes = state.adm.inscritas.filter((i) => i.nivel === n).map((i) => i.equipe).sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const id of ["refJunta1", "refJunta2"]) {
      const sel = $(id), v = sel.value;
      sel.innerHTML = '<option value="">—</option>' + nomes.map((e) => `<option>${esc(e)}</option>`).join("");
      if (nomes.includes(v)) sel.value = v;
    }
  }
  $("refNivel").addEventListener("change", preencherJuntas);
  $("refazerForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nivel = Number($("refNivel").value);
    const juntas = [...new Set([$("refJunta1").value, $("refJunta2").value].filter(Boolean))];
    if (juntas.length === 1) { toast("Escolha as duas equipes que ficam juntas, ou deixe as duas em branco.", true); return; }
    const txt = juntas.length ? ` mantendo ${juntas.join(" e ")} juntas` : "";
    if (!confirm(`Refazer o sorteio do Nível ${nivel} com times de 2 ou 3 equipes${txt}? Os times atuais do Nível ${nivel} serão substituídos${state.adm.publicado ? " e o novo resultado aparece direto na página pública" : ""}.`)) return;
    executar(() => admin("refazerNivel", { nivel, juntas }), `Nível ${nivel} sorteado de novo.`);
  });

  $("admTimes").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-dividir]");
    if (!b) return;
    const time = b.dataset.dividir;
    if (!confirm(`Dividir ${time} em 2 times (${time}1 e ${time}2), equilibrando o total de pessoas?`)) return;
    executar(() => admin("dividir", { time }), `${time} dividido em 2.`);
  });

  $("admPublicar").addEventListener("click", () => {
    const pub = !state.adm.publicado;
    executar(() => admin("publicar", { publicado: pub }), pub ? "Resultado publicado na página." : "Resultado ocultado.");
  });

  // CSV para Excel/Sheets em pt-BR: UTF-8 com BOM e separador ";".
  $("admCsv").addEventListener("click", () => {
    const d = state.adm;
    const timeDe = {};
    for (const t of (d.sorteio ? d.sorteio.times : [])) for (const e of t.equipes) timeDe[e.equipe] = t.nome;
    const cel = (v) => /[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const linhas = [["Equipe", "Nível", "Integrantes", "Inscrita em", "Super Team"]]
      .concat([...d.inscritas].sort((a, b) => a.nivel - b.nivel || a.equipe.localeCompare(b.equipe, "pt-BR"))
        .map((i) => [i.equipe, i.nivel, i.integrantes, hora(i.criadoEm), timeDe[i.equipe] || ""]));
    const csv = "﻿" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = RESGATE ? "superteams-resgate-interessadas.csv" : "superteams-interessadas.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  renderAdmin();
  carregar();
  if (MODO_COORD && state.senha) carregarAdmin();
  setInterval(() => {
    if (document.visibilityState !== "visible" || state.busy) return;
    carregar();
    if (state.adm) carregarAdmin();
  }, 30000);
})();
