// Desafio Técnico · Resgate: abertura, login, pontuador do juiz e painel do admin.
import {
  PERIGOS, ARENAS, ROUNDS, TEMPO_ROUND_SEG, VIVAS_MAX, PONTOS_INICIO,
  calcular, normalizarRound, ranking, pontosPorLadrilho, mmss,
} from "/desafio/pontuacao.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hora = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ls = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const K = { sessao: "dt-sessao", rascunho: "dt-rascunho", pend: "dt-pendentes", arena: "dt-arena", nivel: "dt-nivel" };
const st = {
  sessao: ls.get(K.sessao),
  equipes: [], rounds: [],
  escolha: { arena: ls.get(K.arena), nivel: ls.get(K.nivel) || 1, equipe: null, round: null },
  r: ls.get(K.rascunho), // round em andamento
  admin: { dados: null, nivel: 1, abertos: new Set(), todos: false },
  visao: null,
};

/* ---------- API ---------- */
async function api(acao, dados = {}) {
  const resp = await fetch("/api/desafio", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acao, token: st.sessao?.token, ...dados }),
  });
  let j = {};
  try { j = await resp.json(); } catch {}
  if (!resp.ok) {
    const e = new Error(j.erro || "Não foi possível falar com o servidor.");
    e.status = resp.status;
    if (resp.status === 401 && acao !== "entrar") sair(e.message);
    throw e;
  }
  return j;
}

let toastT;
function toast(msg, erro = false) {
  const t = $("toast");
  t.textContent = msg; t.classList.toggle("erro", erro); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), erro ? 5000 : 2800);
}

/* ---------- abertura ---------- */
function abertura() {
  const ab = $("abertura");
  let visto = false;
  try { visto = sessionStorage.getItem("dt-abertura") === "1"; } catch {}
  if (visto || new URLSearchParams(location.search).has("sem-abertura")) return Promise.resolve();
  ab.hidden = false;
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => ab.querySelector(".ab-motion")?.beginElement?.());
  return new Promise((ok) => {
    let fechado = false;
    const fechar = () => {
      if (fechado) return; fechado = true;
      try { sessionStorage.setItem("dt-abertura", "1"); } catch {}
      ab.classList.add("saindo");
      setTimeout(() => { ab.hidden = true; document.body.style.overflow = ""; ok(); }, 550);
    };
    ab.addEventListener("click", fechar);
    document.addEventListener("keydown", fechar, { once: true });
    setTimeout(fechar, 6500);
  });
}

/* ---------- sessão ---------- */
function mostrar(visao) {
  st.visao = visao;
  $("login").hidden = visao !== "login";
  $("setup").hidden = visao !== "setup";
  $("pontuar").hidden = visao !== "pontuar";
  $("admin").hidden = visao !== "admin";
  const logado = !!st.sessao;
  $("user").hidden = !logado;
  $("userNome").textContent = logado ? `${st.sessao.nome}${st.sessao.papel === "admin" ? " · admin" : ""}` : "";
  const ehAdmin = st.sessao?.papel === "admin";
  $("abasAdmin").hidden = !ehAdmin || visao === "pontuar";
  for (const b of $("abasAdmin").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.visao === (visao === "admin" ? "admin" : "juiz")));
  window.scrollTo({ top: 0 });
}

function sair(msg) {
  st.sessao = null; ls.set(K.sessao, null);
  pararTimer();
  mostrar("login");
  if (msg) { $("loginErro").textContent = msg; $("loginErro").hidden = false; }
}

$("loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = $("entrar"); btn.disabled = true; $("loginErro").hidden = true;
  try {
    const j = await api("entrar", { login: $("loginUser").value, senha: $("loginSenha").value });
    st.sessao = { token: j.token, nome: j.nome, papel: j.papel, login: j.login };
    ls.set(K.sessao, st.sessao);
    $("loginSenha").value = "";
    await iniciarLogado();
  } catch (e) {
    $("loginErro").textContent = e.message; $("loginErro").hidden = false;
  } finally { btn.disabled = false; }
});
$("sair").addEventListener("click", () => {
  if (st.r && !confirm("Há um round em andamento neste aparelho. Sair mesmo assim? O rascunho fica guardado.")) return;
  sair();
});
$("abasAdmin").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-visao]"); if (!b) return;
  if (b.dataset.visao === "admin") abrirAdmin(); else abrirJuiz();
});

async function iniciarLogado() {
  const querAdmin = st.sessao.papel === "admin" && !st.r && !/^\/?(juiz|pontuar)/.test(location.pathname.replace(/^\/desafio/, ""));
  if (querAdmin) return abrirAdmin();
  return abrirJuiz();
}

/* ---------- juiz: escolha ---------- */
async function carregarEstado() {
  const j = await api("estado");
  st.equipes = j.equipes; st.rounds = j.rounds;
}

async function abrirJuiz() {
  if (st.r) { mostrar("pontuar"); renderPontuar(); retomarTimer(); return; }
  mostrar("setup");
  renderSetup();
  try { await carregarEstado(); } catch (e) { if (e.status !== 401) toast(e.message, true); }
  renderSetup();
  enviarPendentes();
}

function feitos(equipe) {
  return st.rounds.filter((r) => r.equipe === equipe);
}

function renderSetup() {
  const e = st.escolha;
  $("arenas").innerHTML = ARENAS.map((a) => `<button type="button" data-arena="${a}" aria-pressed="${e.arena === a}">${a}</button>`).join("");
  for (const b of $("niveis").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.nivel) === e.nivel));
  const q = norm($("busca").value);
  const lista = st.equipes.filter((t) => t.nivel === e.nivel && (!q || norm(t.nome).includes(q)));
  $("times").innerHTML = lista.length ? lista.map((t) => {
    const fs = feitos(t.nome);
    const badges = ROUNDS.map((n) => {
      const f = fs.find((x) => x.round === n);
      if (!f) return `<span class="dt-badge">R${n}</span>`;
      return f.noShow ? `<span class="dt-badge ns">R${n} no-show</span>` : `<span class="dt-badge ok">R${n} ${fmt(f.pontos)}</span>`;
    }).join("");
    return `<button type="button" class="dt-time" role="option" data-equipe="${esc(t.nome)}" aria-selected="${e.equipe === t.nome}">
      <span><span class="nm">${esc(t.nome)}</span><span class="mesa">Mesa ${t.mesa}</span></span><span class="dt-badges">${badges}</span></button>`;
  }).join("") : `<p class="dt-vazio">${st.equipes.length ? "Nenhum time com esse nome neste nível." : "Carregando times…"}</p>`;

  $("roundCampo").hidden = !e.equipe;
  if (e.equipe) {
    const fs = feitos(e.equipe);
    if (e.round && fs.some((f) => f.round === e.round)) e.round = null;
    if (!e.round) e.round = ROUNDS.find((n) => !fs.some((f) => f.round === n)) || null;
    $("rounds").innerHTML = ROUNDS.map((n) => {
      const f = fs.find((x) => x.round === n);
      const sub = f ? (f.noShow ? "no-show" : `${fmt(f.pontos)} pts`) : "a pontuar";
      return `<button type="button" data-round="${n}" aria-pressed="${e.round === n}" ${f ? "disabled" : ""}>Round ${n}<small>${sub}</small></button>`;
    }).join("");
  }
  const pronto = e.arena && e.equipe && e.round;
  $("iniciar").disabled = !pronto;
  $("noShow").disabled = !pronto;
  const pend = ls.get(K.pend, []);
  $("pendentes").hidden = !pend.length;
  $("pendentes").textContent = `${pend.length} envio(s) pendente(s)`;
}

$("arenas").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-arena]"); if (!b) return;
  st.escolha.arena = Number(b.dataset.arena); ls.set(K.arena, st.escolha.arena); renderSetup();
});
$("niveis").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-nivel]"); if (!b) return;
  const n = Number(b.dataset.nivel);
  if (n !== st.escolha.nivel) { st.escolha.nivel = n; st.escolha.equipe = null; st.escolha.round = null; ls.set(K.nivel, n); }
  renderSetup();
});
$("busca").addEventListener("input", renderSetup);
$("times").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-equipe]"); if (!b) return;
  st.escolha.equipe = b.dataset.equipe; st.escolha.round = null; renderSetup();
  $("roundCampo").scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("rounds").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-round]"); if (!b || b.disabled) return;
  st.escolha.round = Number(b.dataset.round); renderSetup();
});

function novoRound(noShow = false) {
  const e = st.escolha;
  return {
    equipe: e.equipe, nivel: e.nivel, arena: e.arena, round: e.round,
    envio: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    dados: { noShow, perigos: {}, inicio: false, trechos: [], falhas: 0, chegada: false, vivas: 0, morta: false, tempoSeg: 0, obs: "" },
    trecho: { ladrilhos: 0, tentativa: 1 },
    timer: { acumuladoMs: 0, inicioTs: null, alarmou: false },
  };
}

$("iniciar").addEventListener("click", () => {
  st.r = novoRound(); salvarRascunho();
  mostrar("pontuar"); renderPontuar(); atualizarTimer();
});
$("noShow").addEventListener("click", () => {
  const e = st.escolha;
  if (!confirm(`Registrar NO-SHOW de ${e.equipe} no round ${e.round}?\nO round fica com 0 pontos.`)) return;
  const r = novoRound(true);
  enviar(r);
});

/* ---------- juiz: pontuação ---------- */
function salvarRascunho() { ls.set(K.rascunho, st.r); }

const stepper = (key, val, min, max) => `<div class="dt-step" data-step="${key}">
  <button type="button" data-d="-1" aria-label="Diminuir" ${val <= min ? "disabled" : ""}>−</button>
  <output>${val}</output>
  <button type="button" data-d="1" aria-label="Aumentar" ${val >= max ? "disabled" : ""}>+</button></div>`;

function renderPontuar() {
  const r = st.r; if (!r) return;
  const d = r.dados;
  $("pTime").textContent = r.equipe;
  $("pMeta").textContent = `Nível ${r.nivel} · Arena ${r.arena} · Round ${r.round}`;

  $("perigos").innerHTML = PERIGOS.map((p) => `<div class="dt-item">
    <span class="nm">${esc(p.nome)}<small>${p.pontos} pts cada${d.perigos[p.id] ? ` · ${d.perigos[p.id] * p.pontos} pts` : ""}</small></span>
    ${stepper(`perigo:${p.id}`, d.perigos[p.id] || 0, 0, 99)}</div>`).join("");

  $("inicio").checked = d.inicio;
  const t = r.trecho, ppl = pontosPorLadrilho(t.tentativa);
  const ord = (n) => `${n}ª`;
  $("trechoAtual").innerHTML = `
    <div class="dt-trecho-topo"><strong>Trecho ${d.trechos.length + 1}</strong>
      <span class="dt-tent t${Math.min(t.tentativa, 4)}">${ord(t.tentativa)} tentativa · ${ppl} pt${ppl === 1 ? "" : "s"}/ladrilho</span></div>
    <div class="dt-item"><span class="nm">Ladrilhos deste trecho<small>${t.ladrilhos} × ${ppl} = ${t.ladrilhos * ppl} pts ao alcançar o checkpoint</small></span>${stepper("ladrilhos", t.ladrilhos, 0, 200)}</div>
    <div class="dt-trecho-acoes">
      <button class="btn falha" type="button" data-acao="falha">Falha de progresso</button>
      <button class="btn primary" type="button" data-acao="checkpoint" ${t.ladrilhos ? "" : "disabled"}>Checkpoint alcançado</button>
      ${t.tentativa >= 3 ? `<button class="btn full" type="button" data-acao="pular">Pular para o próximo checkpoint (0 pts no trecho)</button>` : ""}
      ${t.tentativa > 1 ? `<button class="btn full" type="button" data-acao="desfazTentativa">Desfazer última falha</button>` : ""}
    </div>`;
  $("trechos").innerHTML = d.trechos.map((x, i) => {
    const p = x.pulado ? 0 : pontosPorLadrilho(x.tentativa);
    return `<li><span class="n">${i + 1}</span><span>${x.ladrilhos} ladrilho${x.ladrilhos === 1 ? "" : "s"} · ${x.pulado ? "pulado" : `${ord(x.tentativa)} tentativa`}</span>
      <span class="pts">${x.ladrilhos * p} pts</span><button class="x" type="button" data-remove="${i}" aria-label="Remover trecho ${i + 1}">×</button></li>`;
  }).join("");

  $("falhasItem").innerHTML = `<span class="nm">Falhas de progresso<small>Cada falha tira 5 pts da chegada (a falha do trecho já soma aqui)</small></span>${stepper("falhas", d.falhas, 0, 999)}`;
  $("chegada").checked = d.chegada;
  $("vivasItem").innerHTML = `<span class="nm">Vítimas vivas na área verde<small>× 1,3 cada (são ${VIVAS_MAX})</small></span>${stepper("vivas", d.vivas, 0, VIVAS_MAX)}`;
  $("morta").disabled = d.vivas < VIVAS_MAX;
  if (d.vivas < VIVAS_MAX) d.morta = false;
  $("morta").checked = d.morta;
  if (document.activeElement !== $("obs")) $("obs").value = d.obs;
  renderTotais();
}

function renderTotais() {
  const c = calcular(st.r.dados);
  $("pTotal").textContent = fmt(c.total);
  $("subPerigos").textContent = `${fmt(c.perigos)} pts`;
  $("subCheckpoints").textContent = `${fmt(c.checkpoints)} pts`;
  $("subChegada").textContent = `${fmt(c.chegada)} pts`;
  $("chegadaVal").textContent = `+${Math.max(0, 60 - 5 * c.d.falhas)}`;
  $("subMult").textContent = `× ${fmt(c.multiplicador)}`;
}

function mudou() { salvarRascunho(); renderPontuar(); }

$("pontuar").addEventListener("click", (ev) => {
  const r = st.r; if (!r) return;
  const d = r.dados;
  const s = ev.target.closest(".dt-step button");
  if (s && !s.disabled) {
    const key = s.closest(".dt-step").dataset.step, delta = Number(s.dataset.d);
    if (key.startsWith("perigo:")) { const id = key.slice(7); d.perigos[id] = Math.max(0, (d.perigos[id] || 0) + delta); }
    else if (key === "ladrilhos") r.trecho.ladrilhos = Math.max(0, r.trecho.ladrilhos + delta);
    else if (key === "falhas") d.falhas = Math.max(0, d.falhas + delta);
    else if (key === "vivas") d.vivas = Math.min(VIVAS_MAX, Math.max(0, d.vivas + delta));
    navigator.vibrate?.(8);
    return mudou();
  }
  const a = ev.target.closest("[data-acao]");
  if (a) {
    const acao = a.dataset.acao;
    if (acao === "falha") { r.trecho.tentativa += 1; d.falhas += 1; navigator.vibrate?.([20, 40, 20]); toast(`Falha registrada · agora é a ${r.trecho.tentativa}ª tentativa`); }
    if (acao === "desfazTentativa" && r.trecho.tentativa > 1) { r.trecho.tentativa -= 1; d.falhas = Math.max(0, d.falhas - 1); }
    if (acao === "checkpoint" || acao === "pular") {
      d.trechos.push({ ladrilhos: r.trecho.ladrilhos, tentativa: r.trecho.tentativa, pulado: acao === "pular" });
      r.trecho = { ladrilhos: 0, tentativa: 1 };
      toast(acao === "pular" ? "Trecho pulado (0 pts)." : `Checkpoint ${d.trechos.length} alcançado.`);
    }
    return mudou();
  }
  const rm = ev.target.closest("[data-remove]");
  if (rm && confirm("Remover este trecho?")) { d.trechos.splice(Number(rm.dataset.remove), 1); mudou(); }
});
$("inicio").addEventListener("change", (ev) => { st.r.dados.inicio = ev.target.checked; mudou(); });
$("chegada").addEventListener("change", (ev) => { st.r.dados.chegada = ev.target.checked; mudou(); });
$("morta").addEventListener("change", (ev) => { st.r.dados.morta = ev.target.checked; mudou(); });
$("obs").addEventListener("input", (ev) => { st.r.dados.obs = ev.target.value; salvarRascunho(); });

$("cancelar").addEventListener("click", () => {
  if (!confirm("Cancelar este round? Nada será enviado e o que foi marcado será perdido.")) return;
  st.r = null; salvarRascunho(); pararTimer(); abrirJuiz();
});

/* ---------- timer ---------- */
let tick = null, audio = null;
const decorridoMs = () => { const t = st.r?.timer; if (!t) return 0; return t.acumuladoMs + (t.inicioTs ? Date.now() - t.inicioTs : 0); };
function pararTimer() { clearInterval(tick); tick = null; }
function retomarTimer() { pararTimer(); atualizarTimer(); if (st.r?.timer.inicioTs) tick = setInterval(atualizarTimer, 250); }
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach((t0) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "square"; o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(.0001, audio.currentTime + t0); g.gain.exponentialRampToValueAtTime(.3, audio.currentTime + t0 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + t0 + .28);
      o.start(audio.currentTime + t0); o.stop(audio.currentTime + t0 + .3);
    });
  } catch {}
}
function atualizarTimer() {
  const r = st.r; if (!r) return;
  const totalMs = TEMPO_ROUND_SEG * 1000;
  let el = decorridoMs();
  if (el >= totalMs && r.timer.inicioTs) {
    r.timer.acumuladoMs = totalMs; r.timer.inicioTs = null; el = totalMs; pararTimer();
    if (!r.timer.alarmou) { r.timer.alarmou = true; beep(); navigator.vibrate?.([300, 150, 300, 150, 500]); $("timer").closest(".dt-barra").classList.add("zerou"); }
    salvarRascunho();
  }
  const resta = Math.max(0, totalMs - el);
  $("relogio").textContent = mmss(Math.ceil(resta / 1000));
  $("tempoBarra").style.transform = `scaleX(${resta / totalMs})`;
  const barra = $("timer").closest(".dt-barra");
  barra.classList.toggle("alerta", resta <= 60000);
  const rodando = !!r.timer.inicioTs, acabou = el >= totalMs;
  $("play").textContent = rodando ? "❚❚" : "▶";
  $("play").setAttribute("aria-label", rodando ? "Pausar o tempo" : "Iniciar o tempo");
  $("play").disabled = acabou;
  $("esgotado").hidden = !acabou;
  r.dados.tempoSeg = Math.round(el / 1000);
}
$("play").addEventListener("click", () => {
  const t = st.r?.timer; if (!t) return;
  if (audio === null) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } // libera o som no iOS
  if (t.inicioTs) { t.acumuladoMs += Date.now() - t.inicioTs; t.inicioTs = null; pararTimer(); }
  else { t.inicioTs = Date.now(); tick = setInterval(atualizarTimer, 250); }
  salvarRascunho(); atualizarTimer();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && st.visao === "pontuar") atualizarTimer(); });

/* ---------- revisão e envio ---------- */
function resumoHTML(c, meta) {
  const d = c.d;
  if (d.noShow) return `<div class="dt-res"><div class="dt-res-ns">NO-SHOW · 0 pontos</div>${meta ? `<p class="dt-res-meta">${meta}</p>` : ""}</div>`;
  const linha = (nome, qtd, pts) => `<tr class="${pts ? "" : "zero"}"><td>${esc(nome)}${qtd !== null ? ` × ${qtd}` : ""}</td><td>${fmt(pts)}</td></tr>`;
  const per = c.itensPerigo.map((p) => linha(p.nome, p.qtd, p.subtotal)).join("");
  const tre = [linha(`Ladrilho de início${d.inicio ? "" : " (não)"}`, null, d.inicio ? PONTOS_INICIO : 0)]
    .concat(c.itensTrecho.map((t) => linha(`Trecho ${t.n}: ${t.ladrilhos} ladr. · ${t.pulado ? "pulado" : `${t.tentativa}ª tent. (${t.porLadrilho}/ladr.)`}`, null, t.subtotal))).join("");
  return `<div class="dt-res">
    <div class="dt-res-sec"><h3>Perigos · ${fmt(c.perigos)} pts</h3><table>${per}</table></div>
    <div class="dt-res-sec"><h3>Checkpoints · ${fmt(c.checkpoints)} pts</h3><table>${tre}</table></div>
    <div class="dt-res-sec"><h3>Chegada · ${fmt(c.chegada)} pts</h3><table>
      <tr class="${d.falhas ? "" : "zero"}"><td>Falhas de progresso</td><td>${d.falhas}</td></tr>
      ${linha(d.chegada ? `Chegada: 60 − 5 × ${d.falhas}` : "Não parou na chegada", null, c.chegada)}</table></div>
    <div class="dt-res-sec"><h3>Resgate · × ${fmt(c.multiplicador)}</h3><table>
      <tr class="${d.vivas ? "" : "zero"}"><td>Vítimas vivas (× 1,3 cada)</td><td>${d.vivas}</td></tr>
      <tr class="${d.morta ? "" : "zero"}"><td>Vítima morta (× 1,3)</td><td>${d.morta ? "sim" : "não"}</td></tr></table></div>
    ${d.obs ? `<p class="dt-res-meta"><b>Obs.:</b> ${esc(d.obs)}</p>` : ""}
    <p class="dt-res-conta">(${fmt(c.perigos)} + ${fmt(c.checkpoints)} + ${fmt(c.chegada)}) × ${fmt(c.multiplicador)} · tempo ${mmss(d.tempoSeg)}</p>
    <div class="dt-res-total"><span>Total</span><strong>${fmt(c.total)}</strong></div>
    ${meta ? `<p class="dt-res-meta">${meta}</p>` : ""}
  </div>`;
}

$("fim").addEventListener("click", () => {
  const r = st.r; if (!r) return;
  if (r.timer.inicioTs) { r.timer.acumuladoMs += Date.now() - r.timer.inicioTs; r.timer.inicioTs = null; pararTimer(); }
  atualizarTimer(); salvarRascunho();
  const aviso = r.trecho.ladrilhos ? `<p class="dt-aviso">Há ${r.trecho.ladrilhos} ladrilho(s) no trecho atual sem checkpoint marcado. Eles não contam pontos. Volte e toque em <b>Checkpoint alcançado</b> se o robô chegou lá.</p>` : "";
  $("revCorpo").innerHTML = `<p class="dt-res-meta"><b>${esc(r.equipe)}</b> · Nível ${r.nivel} · Arena ${r.arena} · Round ${r.round}</p>${aviso}${resumoHTML(calcular(r.dados))}`;
  $("revisao").showModal();
});
$("revisao").addEventListener("close", () => {
  if ($("revisao").returnValue === "enviar" && st.r) enviar(st.r);
});

async function enviar(r) {
  const payload = { equipe: r.equipe, nivel: r.nivel, arena: r.arena, round: r.round, envio: r.envio, dados: normalizarRound(r.dados) };
  try {
    const j = await api("registrar", payload);
    st.rounds = j.rounds;
    toast(r.dados.noShow ? "No-show registrado." : `Round enviado: ${fmt(j.pontos)} pts.`);
    if (st.r && st.r.envio === r.envio) { st.r = null; salvarRascunho(); }
    pararTimer();
    st.escolha.equipe = null; st.escolha.round = null; $("busca").value = "";
    abrirJuiz();
  } catch (e) {
    if (e.status && e.status < 500) { toast(e.message, true); return; }
    // sem internet: guarda e tenta de novo depois
    const pend = ls.get(K.pend, []);
    if (!pend.some((p) => p.envio === payload.envio)) pend.push(payload);
    ls.set(K.pend, pend);
    if (st.r && st.r.envio === r.envio) { st.r = null; salvarRascunho(); }
    pararTimer();
    toast("Sem conexão: o round ficou guardado neste aparelho e será enviado sozinho.", true);
    st.escolha.equipe = null; st.escolha.round = null;
    abrirJuiz();
  }
}

let enviando = false;
async function enviarPendentes() {
  const pend = ls.get(K.pend, []);
  if (!pend.length || enviando || !st.sessao) return;
  enviando = true;
  const restantes = [];
  for (const p of pend) {
    try { const j = await api("registrar", p); st.rounds = j.rounds; }
    catch (e) {
      if (e.status && e.status < 500) toast(`${p.equipe} R${p.round}: ${e.message}`, true);
      else restantes.push(p);
    }
  }
  ls.set(K.pend, restantes);
  enviando = false;
  if (pend.length !== restantes.length) toast(`${pend.length - restantes.length} round(s) pendente(s) enviado(s).`);
  if (st.visao === "setup") renderSetup();
}
window.addEventListener("online", enviarPendentes);
setInterval(enviarPendentes, 30000);

/* ---------- admin ---------- */
let autoAdmin = null;
async function abrirAdmin() {
  mostrar("admin");
  await carregarAdmin();
  clearInterval(autoAdmin);
  autoAdmin = setInterval(() => { if (st.visao === "admin" && !document.hidden) carregarAdmin(true); }, 20000);
}
async function carregarAdmin(silencioso = false) {
  try {
    st.admin.dados = await api("painel");
    renderAdmin();
  } catch (e) { if (!silencioso && e.status !== 401) toast(e.message, true); }
}

function linhasRanking(nivel) {
  const { rounds, equipes } = st.admin.dados;
  return ranking(rounds, equipes, nivel);
}

function cardRound(r, rotulo, melhor) {
  if (!r) return `<div class="dt-card"><div class="dt-card-topo"><strong>${rotulo}</strong></div><p class="vazio">Ainda não pontuado.</p></div>`;
  const c = calcular(r.dados);
  const meta = `Arena ${r.arena} · juiz ${esc(r.juizNome || r.juiz)} · ${hora(r.criadoEm)}`;
  return `<div class="dt-card ${melhor ? "melhor" : ""}">
    <div class="dt-card-topo"><strong>${rotulo}${melhor ? '<span class="dt-tag-melhor">vale</span>' : ""}</strong><span class="tot">${fmt(r.pontos)}</span></div>
    ${resumoHTML(c, meta)}
    <button class="dt-apagar" type="button" data-apagar="${r.id}" data-rot="${esc(r.equipe)} · ${rotulo}">Apagar round</button></div>`;
}

function renderAdmin() {
  const A = st.admin, D = A.dados; if (!D) return;
  const nivel = A.nivel;
  for (const b of $("rkNivel").querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.nivel) === nivel));
  const doNivel = D.rounds.filter((r) => r.nivel === nivel);
  const times = D.equipes.filter((e) => e.nivel === nivel).length;
  const comRound = new Set(doNivel.map((r) => r.equipe)).size;
  $("kpis").innerHTML = [
    [D.rounds.length, "rounds pontuados (N1 + N2)"],
    [doNivel.length, `rounds no Nível ${nivel} (de ${times * 2})`],
    [`${comRound}/${times}`, `times do N${nivel} com nota`],
    [doNivel.filter((r) => r.noShow).length, `no-shows no N${nivel}`],
  ].map(([v, t]) => `<div class="dt-kpi"><b>${v}</b><span>${t}</span></div>`).join("");

  const linhas = linhasRanking(nivel);
  $("expandir").textContent = A.todos ? "Recolher tudo" : "Expandir tudo";
  $("ranking").innerHTML = `<div class="cab"><span>#</span><span>Time</span><span>R1</span><span>R2</span><span>Melhor</span></div>` + linhas.map((l) => {
    const cel = (r) => r ? (r.noShow ? "NS" : `<b>${fmt(r.pontos)}</b>`) : "–";
    const melhorR = l.melhor === null ? null : [l.r1, l.r2].filter(Boolean).sort((a, b) => b.pontos - a.pontos || (a.noShow ? 1e9 : a.tempoSeg) - (b.noShow ? 1e9 : b.tempoSeg))[0];
    const aberto = A.abertos.has(l.equipe);
    return `<details data-equipe="${esc(l.equipe)}" class="${l.posicao && l.posicao <= 3 ? `p${l.posicao}` : ""}" ${aberto ? "open" : ""}>
      <summary><span class="pos">${l.posicao ?? "–"}</span><span class="nm">${esc(l.equipe)}</span>
        <span class="col">${cel(l.r1)}</span><span class="col">${cel(l.r2)}</span>
        <span class="col best">${l.melhor === null ? "–" : fmt(l.melhor)}${l.tempoMelhor !== null ? `<small>${mmss(l.tempoMelhor)}</small>` : ""}</span></summary>
      <div class="dt-det">${cardRound(l.r1, "Round 1", melhorR && melhorR === l.r1)}${cardRound(l.r2, "Round 2", melhorR && melhorR === l.r2)}</div>
    </details>`;
  }).join("");

  const ult = [...D.rounds].sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)).slice(0, 10);
  $("ultimos").innerHTML = ult.length ? ult.map((r) => `<li><span class="h">${hora(r.criadoEm)}</span>
    <span>${esc(r.equipe)} · N${r.nivel} R${r.round} · Arena ${r.arena} · ${esc(r.juizNome || r.juiz)}</span>
    <span class="pt">${r.noShow ? "no-show" : fmt(r.pontos)}</span></li>`).join("") : `<li class="dt-vazio">Nenhum round ainda.</li>`;

  $("juizes").innerHTML = D.juizes.map((j) => `<li><span><b>${esc(j.nome)}</b> <code>${esc(j.login)}</code>${j.papel === "admin" ? " · admin" : ""}</span>
    ${j.fixo ? '<span class="hint">fixo</span>' : `<button class="dt-apagar" type="button" data-rmjuiz="${esc(j.login)}">Remover</button>`}</li>`).join("");
}

$("rkNivel").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-nivel]"); if (!b) return;
  st.admin.nivel = Number(b.dataset.nivel); st.admin.todos = false; st.admin.abertos.clear(); renderAdmin();
});
$("ranking").addEventListener("toggle", (ev) => {
  const d = ev.target; if (!d.dataset?.equipe) return;
  if (d.open) st.admin.abertos.add(d.dataset.equipe); else st.admin.abertos.delete(d.dataset.equipe);
}, true);
$("expandir").addEventListener("click", () => {
  st.admin.todos = !st.admin.todos;
  st.admin.abertos = new Set(st.admin.todos ? st.admin.dados.equipes.filter((e) => e.nivel === st.admin.nivel).map((e) => e.nome) : []);
  renderAdmin();
});
$("atualizar").addEventListener("click", () => carregarAdmin());
$("admin").addEventListener("click", async (ev) => {
  const ap = ev.target.closest("[data-apagar]");
  if (ap) {
    ev.preventDefault();
    if (!confirm(`Apagar ${ap.dataset.rot}? O juiz poderá pontuar este round de novo.`)) return;
    try { await api("apagar", { id: Number(ap.dataset.apagar) }); toast("Round apagado."); carregarAdmin(); } catch (e) { toast(e.message, true); }
    return;
  }
  const rj = ev.target.closest("[data-rmjuiz]");
  if (rj) {
    if (!confirm(`Remover o juiz ${rj.dataset.rmjuiz}? Os rounds que ele pontuou continuam.`)) return;
    try { await api("juizDel", { login: rj.dataset.rmjuiz }); toast("Juiz removido."); carregarAdmin(); } catch (e) { toast(e.message, true); }
    return;
  }
  const bx = ev.target.closest("[data-baixar]");
  if (bx) baixar(bx.dataset.baixar);
});
$("juizForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  try {
    await api("juizAdd", { nome: $("jzNome").value, login: $("jzLogin").value, senha: $("jzSenha").value });
    $("juizForm").reset(); toast("Juiz cadastrado."); carregarAdmin();
  } catch (e) { toast(e.message, true); }
});
$("jzNome").addEventListener("input", () => {
  if ($("jzLogin").dataset.mexeu) return;
  const p = norm($("jzNome").value).replace(/[^a-z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  $("jzLogin").value = p.length ? p[0] + (p.length > 1 ? p[p.length - 1] : "") : "";
});
$("jzLogin").addEventListener("input", () => { $("jzLogin").dataset.mexeu = "1"; });

/* ---------- exportação ---------- */
function linhasRounds() {
  const { rounds } = st.admin.dados;
  return [...rounds].sort((a, b) => a.nivel - b.nivel || a.equipe.localeCompare(b.equipe, "pt-BR") || a.round - b.round).map((r) => {
    const c = calcular(r.dados), d = c.d;
    const o = { "Nível": r.nivel, "Time": r.equipe, "Round": r.round, "Arena": r.arena, "No-show": d.noShow ? "sim" : "não" };
    for (const p of PERIGOS) o[`${p.nome} (qtd)`] = d.perigos[p.id];
    Object.assign(o, {
      "Pontos perigos": c.perigos,
      "Ladrilho de início": d.inicio ? "sim" : "não",
      "Trechos (ladrilhos/tentativa)": d.trechos.map((t, i) => `T${i + 1}: ${t.ladrilhos}L ${t.pulado ? "pulado" : `${t.tentativa}ªt`}`).join(" | "),
      "Pontos checkpoints": c.checkpoints,
      "Falhas de progresso": d.falhas,
      "Chegada": d.chegada ? "sim" : "não",
      "Pontos chegada": c.chegada,
      "Pontos do percurso": c.base,
      "Vítimas vivas": d.vivas,
      "Vítima morta": d.morta ? "sim" : "não",
      "Multiplicador": c.multiplicador,
      "Total": r.pontos,
      "Tempo (s)": d.tempoSeg,
      "Tempo": mmss(d.tempoSeg),
      "Juiz": r.juizNome || r.juiz,
      "Login do juiz": r.juiz,
      "Registrado em": hora(r.criadoEm),
      "Observações": d.obs,
    });
    return o;
  });
}
function linhasRankingExport(nivel) {
  return linhasRanking(nivel).map((l) => ({
    "Posição": l.posicao ?? "", "Time": l.equipe,
    "Round 1": l.r1 ? (l.r1.noShow ? "no-show" : l.r1.pontos) : "",
    "Round 2": l.r2 ? (l.r2.noShow ? "no-show" : l.r2.pontos) : "",
    "Melhor nota": l.melhor ?? "", "Tempo da melhor": l.tempoMelhor !== null ? mmss(l.tempoMelhor) : "",
  }));
}
function salvarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function carregarSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => ok(window.XLSX); s.onerror = () => falha(new Error("Não deu para carregar o gerador de XLSX. Tente CSV."));
    document.head.append(s);
  });
}
async function baixar(tipo) {
  if (!st.admin.dados) return;
  const carimbo = new Date().toLocaleString("sv-SE", { timeZone: "America/Fortaleza" }).slice(0, 16).replace(/[: ]/g, "-");
  const base = `desafio-tecnico-resgate-${carimbo}`;
  if (tipo === "json") {
    const { rounds, equipes } = st.admin.dados;
    const out = {
      geradoEm: new Date().toISOString(),
      ranking: { nivel1: linhasRanking(1).map(semRefs), nivel2: linhasRanking(2).map(semRefs) },
      rounds: rounds.map((r) => ({ ...r, calculo: (({ d, ...c }) => c)(calcular(r.dados)) })),
      equipes,
    };
    return salvarArquivo(JSON.stringify(out, null, 2), `${base}.json`, "application/json");
  }
  const rows = linhasRounds();
  if (tipo === "csv") {
    const cols = Object.keys(rows[0] || { Time: "" });
    const cel = (v) => { const s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cel(r[c])).join(";"))].join("\r\n");
    return salvarArquivo(csv, `${base}.csv`, "text/csv;charset=utf-8");
  }
  try {
    const X = await carregarSheetJS();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(linhasRankingExport(1)), "Ranking N1");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(linhasRankingExport(2)), "Ranking N2");
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.length ? rows : [{ Time: "Nenhum round ainda" }]), "Rounds");
    X.writeFile(wb, `${base}.xlsx`);
  } catch (e) { toast(e.message, true); }
}
const semRefs = (l) => ({ posicao: l.posicao, equipe: l.equipe, round1: l.r1?.pontos ?? null, round1NoShow: !!l.r1?.noShow, round2: l.r2?.pontos ?? null, round2NoShow: !!l.r2?.noShow, melhor: l.melhor, tempoMelhorSeg: l.tempoMelhor });

/* ---------- início ---------- */
(async function () {
  await abertura();
  if (!st.sessao) return mostrar("login");
  try { await iniciarLogado(); } catch (e) { toast(e.message, true); }
})();
