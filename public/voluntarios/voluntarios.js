// Área do voluntário: entrada por nome, check-in com localização, vale almoço (arrastar), escala e contatos.
// Em ?coordenacao: painel com check-ins e vales do dia (ADMIN_PASSWORD).
(() => {
  const $ = (id) => document.getElementById(id);
  const MODO_COORD = new URLSearchParams(location.search).has("coordenacao");
  const CHAVE = "obr-vol-token";
  const FUSO = "America/Fortaleza";
  const st = { token: "", dados: null, busy: false, senha: "", adm: null };
  try { st.token = localStorage.getItem(CHAVE) || ""; } catch (e) {}
  try { st.senha = sessionStorage.getItem("obr-coord") || ""; } catch (e) {}

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso, o) => new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, ...o });
  const hora = (iso) => fmt(iso, { hour: "2-digit", minute: "2-digit" });
  const dataHora = (iso) => fmt(iso, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const agoraMin = () => { const [h, m] = fmt(new Date(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number); return h * 60 + m; };
  const paraMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const fone = (d) => d.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

  let toastTimer;
  function toast(msg, erro) {
    const t = $("toast"); t.textContent = msg; t.className = "toast" + (erro ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  }

  async function post(caminho, corpo) {
    const r = await fetch(caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error(d.erro || "Falha de conexão."); err.status = r.status; err.dados = d; throw err; }
    return d;
  }
  const vol = (acao, extra) => post("/api/voluntarios", { acao, token: st.token, ...extra });

  /* ---------- entrada ---------- */
  function mostrarLogin(msg) {
    $("area").hidden = true; $("sair").hidden = true; $("login").hidden = false;
    $("loginErro").hidden = !msg; $("loginErro").textContent = msg || "";
  }

  function sessaoInvalida(e) {
    if (e.status !== 401) return false;
    try { localStorage.removeItem(CHAVE); } catch (x) {}
    st.token = ""; mostrarLogin(e.message);
    return true;
  }

  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (st.busy) return;
    const nome = $("nome").value.trim();
    const senha = $("senhaVol").value;
    if (!nome) { mostrarLogin("Digite o seu nome."); return; }
    if (!senha) { mostrarLogin("Digite a senha."); return; }
    st.busy = true; $("entrar").disabled = true;
    try {
      const d = await post("/api/voluntarios", { acao: "entrar", nome, senha });
      st.token = d.token;
      try { localStorage.setItem(CHAVE, d.token); } catch (e) {}
      $("senhaVol").value = "";
      st.dados = d; render();
    } catch (e) { mostrarLogin(e.message); }
    finally { st.busy = false; $("entrar").disabled = false; }
  });

  $("sair").addEventListener("click", () => {
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    st.token = ""; st.dados = null; $("nome").value = ""; $("senhaVol").value = ""; mostrarLogin();
  });

  /* ---------- render ---------- */
  function render() {
    const d = st.dados;
    if (!d) return;
    $("login").hidden = true; $("area").hidden = false; $("sair").hidden = false;
    $("olaCat").textContent = d.voluntario.categoria;
    $("olaNome").textContent = `Olá, ${d.voluntario.nome.split(" ")[0]}!`;
    $("olaHoje").textContent = fmt(new Date(), { weekday: "long", day: "2-digit", month: "2-digit" });
    renderCheckin(d); renderVale(d); renderEscala(d); renderContatos(d);
    $("lcTxt").textContent = `${d.local.nome} · ${d.local.endereco}`;
    $("lcMapa").href = `https://www.google.com/maps/search/?api=1&query=${d.local.lat},${d.local.lng}`;
  }

  function renderCheckin(d) {
    const card = $("checkin"), btn = $("ckBtn");
    card.classList.remove("ok", "pendente");
    if (d.checkinHoje) {
      card.classList.add("ok");
      $("ckH").textContent = "Check-in feito";
      $("ckMsg").textContent = `Hoje às ${hora(d.checkinHoje)}. Bom trabalho!`;
      btn.hidden = true;
    } else if (d.eventoHoje) {
      card.classList.add("pendente");
      $("ckH").textContent = "Chegou ao evento?";
      $("ckMsg").textContent = "Faça o check-in assim que entrar. Vamos conferir a sua localização.";
      btn.hidden = false;
    } else {
      $("ckH").textContent = "Check-in";
      $("ckMsg").textContent = "Hoje não é dia de evento. O check-in abre nos dias da OBR.";
      btn.hidden = true;
    }
  }

  $("ckBtn").addEventListener("click", () => {
    if (st.busy) return;
    if (!("geolocation" in navigator)) { toast("Este navegador não informa a localização. Fale com a coordenação.", true); return; }
    const btn = $("ckBtn");
    st.busy = true; btn.disabled = true; btn.textContent = "Pegando a sua localização…";
    const fim = () => { st.busy = false; btn.disabled = false; btn.textContent = "Cheguei · fazer check-in"; };
    navigator.geolocation.getCurrentPosition(async (p) => {
      try {
        st.dados = await vol("checkin", { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy });
        render(); toast("Check-in registrado!");
      } catch (e) { if (!sessaoInvalida(e)) toast(e.message, true); }
      finally { fim(); }
    }, (err) => {
      fim();
      toast(err.code === 1
        ? "Sem permissão de localização. Libere a localização para este site nas configurações do navegador e tente de novo."
        : "Não foi possível pegar a sua localização. Tente de novo em um lugar mais aberto.", true);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });

  /* ---------- vale almoço ---------- */
  const SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  let relogio;

  function renderVale(d) {
    clearInterval(relogio);
    const hoje = d.vales.find((v) => v.dia === d.hoje);
    const topo = (rotulo) => `
      <div class="tkt-top">
        <span class="tkt-kicker">OBR 2026 · Voluntário</span>
        <span class="tkt-titulo">Vale almoço</span>
        <div class="tkt-meta"><span>${esc(d.voluntario.nome)}</span><span>${esc(rotulo)}</span></div>
      </div>`;
    const el = $("ticket");
    if (!hoje) {
      el.innerHTML = `<div class="tkt off">${topo("Fora do evento")}<div class="tkt-bottom"><span class="tkt-off-msg">Os vales valem só nos dias do evento.</span></div></div>`;
    } else if (hoje.situacao === "usado") {
      el.innerHTML = `<div class="tkt usado">${topo(hoje.rotulo)}<span class="tkt-carimbo">USADO</span>
        <div class="tkt-bottom"><div class="tkt-usado"><strong>Consumido às ${hora(hoje.usadoEm)}</strong>
        <span>${dataHora(hoje.usadoEm)} · <span class="tkt-vivo" id="tktVivo"></span></span></div></div></div>`;
      const tick = () => { const v = $("tktVivo"); if (v) v.textContent = "agora " + fmt(new Date(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
      tick(); relogio = setInterval(tick, 1000);
    } else {
      el.innerHTML = `<div class="tkt">${topo(hoje.rotulo)}
        <div class="tkt-bottom"><div class="tkt-track" id="tktTrack">
          <div class="tkt-fill" id="tktFill"></div>
          <div class="tkt-hint"><span>Arraste para usar no caixa</span></div>
          <button class="tkt-knob" type="button" id="tktKnob" aria-label="Usar o vale almoço de hoje">${SETA}</button>
        </div></div></div>`;
      armarArraste();
    }
    const outros = d.vales.filter((v) => v.dia !== d.hoje);
    $("valeDias").innerHTML = outros.map((v) => {
      const txt = v.situacao === "usado" ? `usado às ${hora(v.usadoEm)}` : v.situacao === "expirado" ? "não usado" : "disponível no dia";
      return `<li class="${v.situacao}"><strong>${esc(v.rotulo)}</strong> · ${txt}</li>`;
    }).join("");
  }

  function armarArraste() {
    const track = $("tktTrack"), knob = $("tktKnob"), fill = $("tktFill");
    let x0 = 0, dx = 0, max = 0, arrastando = false;
    const pos = (x) => { knob.style.transform = `translateX(${x}px)`; fill.style.width = `${x + 52}px`; };
    const voltar = () => { track.classList.add("voltando"); pos(0); setTimeout(() => track.classList.remove("voltando"), 260); };

    knob.addEventListener("pointerdown", (e) => {
      if (st.busy) return;
      arrastando = true; x0 = e.clientX; dx = 0; max = track.clientWidth - knob.offsetWidth - 8;
      knob.setPointerCapture(e.pointerId); track.classList.remove("voltando");
    });
    knob.addEventListener("pointermove", (e) => {
      if (!arrastando) return;
      dx = Math.max(0, Math.min(max, e.clientX - x0)); pos(dx);
    });
    const soltar = () => {
      if (!arrastando) return;
      arrastando = false;
      if (dx >= max * 0.85) { pos(max); usarVale(voltar); } else voltar();
    };
    knob.addEventListener("pointerup", soltar);
    knob.addEventListener("pointercancel", soltar);
    // teclado / leitor de tela: confirma com um diálogo
    knob.addEventListener("click", (e) => {
      if (e.detail !== 0) return; // clique de mouse/toque não consome; só Enter/Espaço
      if (confirm("Usar agora o vale almoço de hoje? Mostre a tela no caixa.")) usarVale(voltar);
    });
  }

  async function usarVale(voltar) {
    if (st.busy) return;
    st.busy = true; $("tktTrack")?.classList.add("enviando");
    try {
      st.dados = await vol("vale");
      if (navigator.vibrate) navigator.vibrate(60);
      render(); toast("Vale consumido. Bom almoço!");
    } catch (e) {
      if (sessaoInvalida(e)) return;
      if (e.dados && e.dados.vales) { st.dados = e.dados; render(); }
      else voltar();
      toast(e.message, true);
    } finally { st.busy = false; $("tktTrack")?.classList.remove("enviando"); }
  }

  /* ---------- escala e contatos ---------- */
  function renderEscala(d) {
    $("escExemplo").hidden = !d.escalaExemplo;
    const agora = d.eventoHoje ? agoraMin() : -1;
    $("escala").innerHTML = d.escala.map((t) => {
      const cls = agora >= paraMin(t.inicio) && agora < paraMin(t.fim) ? "agora" : agora >= paraMin(t.fim) ? "passou" : "";
      return `<li class="${cls}"><span class="h">${esc(t.inicio)}–${esc(t.fim)}</span>
        <span class="a"><strong>${esc(t.atividade)}</strong><span>${esc(t.local)}${cls === "agora" ? " · agora" : ""}</span></span></li>`;
    }).join("") || '<li><span class="h">—</span><span class="a">Escala ainda não publicada.</span></li>';
  }

  function renderContatos(d) {
    $("ctExemplo").hidden = !d.contatosExemplo;
    $("contatos").innerHTML = d.contatos.map((c) => `
      <div class="vol-ct${c.categoria === d.voluntario.categoria ? " sua" : ""}">
        <div><strong>${esc(c.nome)}</strong><span class="sub">${esc(c.categoria)} · ${esc(fone(c.telefone))}</span></div>
        <div class="vol-ct-acts">
          <a class="btn primary" href="https://wa.me/${esc(c.telefone)}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn" href="tel:+${esc(c.telefone)}">Ligar</a>
        </div>
      </div>`).join("");
  }

  async function carregar() {
    if (!st.token) { mostrarLogin(); return; }
    try { st.dados = await vol("estado"); render(); }
    catch (e) { if (!sessaoInvalida(e)) { mostrarLogin(); toast(e.message, true); } }
  }

  // Ao voltar para a aba (ex.: depois de um tempo), atualiza escala e estado.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && st.token && st.dados) carregar(); });

  /* ---------- coordenação ---------- */
  const adm = (acao, extra) => post("/api/voluntarios-admin", { senha: st.senha, acao, dia: $("admDia").value || undefined, ...extra });

  function renderAdmin() {
    const d = st.adm;
    if (!d) return;
    const sel = $("admDia");
    if (!sel.dataset.pronto) {
      sel.innerHTML = d.dias.map((x) => `<option value="${x}">${x.split("-").reverse().slice(0, 2).join("/")}</option>`).join("");
      sel.dataset.pronto = "1";
    }
    sel.value = d.dia;
    const ck = d.voluntarios.filter((v) => v.checkin).length, vl = d.voluntarios.filter((v) => v.vale).length;
    $("admResumo").textContent = `${ck} de ${d.voluntarios.length} com check-in · ${vl} vale${vl === 1 ? "" : "s"} usado${vl === 1 ? "" : "s"}.`;
    $("admLista").innerHTML = d.voluntarios.map((v) => `<tr>
      <td>${esc(v.nome)}</td><td>${esc(v.categoria)}</td>
      <td>${v.checkin ? `<span class="ok">${hora(v.checkin.em)}</span><span class="sub">a ${v.checkin.distancia} m (±${v.checkin.precisao} m)</span>
        <button class="linkbtn" data-acao="apagarCheckin" data-id="${esc(v.id)}">apagar</button>` : '<span class="nao">—</span>'}</td>
      <td>${v.vale ? `<span class="ok">${hora(v.vale)}</span>
        <button class="linkbtn" data-acao="liberarVale" data-id="${esc(v.id)}">liberar</button>` : '<span class="nao">—</span>'}</td></tr>`).join("");
  }

  async function admCarregar(acao = "listar", extra) {
    try { st.adm = await adm(acao, extra); $("adminForm").hidden = true; $("adminTools").hidden = false; renderAdmin(); }
    catch (e) {
      if (e.status === 401) { st.senha = ""; try { sessionStorage.removeItem("obr-coord"); } catch (x) {} $("adminForm").hidden = false; $("adminTools").hidden = true; }
      toast(e.message, true);
    }
  }

  if (MODO_COORD) {
    $("admin").hidden = false;
    $("adminForm").addEventListener("submit", (ev) => {
      ev.preventDefault();
      st.senha = $("senha").value;
      try { sessionStorage.setItem("obr-coord", st.senha); } catch (e) {}
      admCarregar();
    });
    $("admDia").addEventListener("change", () => admCarregar());
    $("admAtualizar").addEventListener("click", () => admCarregar());
    $("admLista").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-acao]");
      if (!b) return;
      const nome = st.adm.voluntarios.find((v) => v.id === b.dataset.id)?.nome || "";
      const txt = b.dataset.acao === "liberarVale" ? `Liberar de novo o vale de ${nome} neste dia?` : `Apagar o check-in de ${nome} neste dia?`;
      if (confirm(txt)) admCarregar(b.dataset.acao, { voluntario: b.dataset.id });
    });
    $("adminSair").addEventListener("click", () => {
      st.senha = ""; try { sessionStorage.removeItem("obr-coord"); } catch (e) {}
      $("adminForm").hidden = false; $("adminTools").hidden = true;
    });
    if (st.senha) admCarregar();
  }

  carregar();
})();
