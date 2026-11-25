// Área dos voluntários (/voluntarios): entrada por primeironomeultimonome + 6 dígitos do CPF, escala, vale almoço
// (um por dia, consumido arrastando o ticket) e check-in com localização no Centro de Convenções.
import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";
import { erro } from "./regras.js";
import { agoraNoFuso, rotulo } from "./dias.js";

// Centro de Convenções de João Pessoa (Poeta Ronaldo Cunha Lima), PB-008 Km 5, Polo Turístico Cabo Branco.
// Coordenada do prédio no OpenStreetMap; o raio cobre o pavilhão e os estacionamentos.
export const LOCAL = {
  nome: "Centro de Convenções de João Pessoa",
  endereco: "Rodovia PB-008, Km 5, s/n · Polo Turístico Cabo Branco, João Pessoa/PB",
  lat: -7.1885011,
  lng: -34.8041167,
  raioM: 400,
};
// Precisão do GPS que ainda aceitamos como folga (celular dentro do pavilhão costuma errar 50–150 m).
const FOLGA_MAX_M = 150;

// Dias do evento com vale almoço e check-in.
export const DIAS_EVENTO = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"];

// Lista de voluntários: fica SÓ na variável de ambiente VOL_LISTA da Vercel (o repositório é público e a
// senha vem do CPF). Formato: JSON [{ id, nome, login, sal, hash, categoria?, admin? }], onde
//   login  primeironomeultimonome, sem acento e minúsculo (se repetir, a senha desempata)
//   hash   scrypt(senha, sal, 32) em hex; senha = 6 primeiros dígitos do CPF
// Gerada por scripts/gerar-vol-lista.mjs a partir da planilha, fora do repositório.
let cache = { fonte: null, voluntarios: [], contatos: null };
function carregarLista() {
  const fonte = process.env.VOL_LISTA || "";
  if (fonte !== cache.fonte) {
    let d = {};
    try { d = fonte ? JSON.parse(fonte) : {}; } catch { d = {}; }
    const vols = Array.isArray(d) ? d : d.voluntarios || [];
    cache = {
      fonte,
      voluntarios: vols.map((v) => ({ ...v, categoria: v.categoria || "Geral", admin: v.admin === true })),
      contatos: Array.isArray(d.contatos) && d.contatos.length ? d.contatos : null,
    };
  }
  return cache;
}
export const listaVoluntarios = () => carregarLista().voluntarios;

function senhaConfereCom(v, senha) {
  const dada = String(senha || "").replace(/\D/g, "");
  if (!dada || dada.length > 20) return false;
  return timingSafeEqual(scryptSync(dada, v.sal, 32), Buffer.from(v.hash, "hex"));
}

// Escala de EXEMPLO por categoria (a oficial entra depois). Vale para todos os dias do evento.
export const HORARIOS_EXEMPLO = true;
const ESCALA = {
  "Artística": [
    { inicio: "07:30", fim: "08:00", atividade: "Chegada e check-in", local: "Entrada principal" },
    { inicio: "08:00", fim: "12:00", atividade: "Apoio aos palcos de ensaio", local: "Palcos de ensaio 1 e 2" },
    { inicio: "12:00", fim: "13:00", atividade: "Almoço", local: "Praça de alimentação" },
    { inicio: "13:00", fim: "17:30", atividade: "Apoio às apresentações", local: "Palco principal" },
  ],
  "Resgate": [
    { inicio: "07:30", fim: "08:00", atividade: "Chegada e check-in", local: "Entrada principal" },
    { inicio: "08:00", fim: "12:00", atividade: "Apoio às arenas", local: "Arenas de Resgate" },
    { inicio: "12:00", fim: "13:00", atividade: "Almoço", local: "Praça de alimentação" },
    { inicio: "13:00", fim: "17:30", atividade: "Apoio às rodadas e filas", local: "Arenas de Resgate" },
  ],
  "Geral": [
    { inicio: "07:30", fim: "08:00", atividade: "Chegada e check-in", local: "Entrada principal" },
    { inicio: "08:00", fim: "12:00", atividade: "Apoio ao evento", local: "Conforme a coordenação" },
    { inicio: "12:00", fim: "13:00", atividade: "Almoço", local: "Praça de alimentação" },
    { inicio: "13:00", fim: "17:30", atividade: "Apoio ao evento", local: "Conforme a coordenação" },
  ],
};

// Janela usada para estimar quantas pessoas estão almoçando agora (vales usados nesse intervalo).
export const JANELA_ALMOCO_MIN = 40;

// Contatos da coordenação: vêm de VOL_LISTA ({ contatos: [{ categoria, nome, telefone }] }, telefone só
// dígitos com DDI). Sem eles, mostramos estes de EXEMPLO.
const CONTATOS_PADRAO = [
  { categoria: "Artística", nome: "Coordenação da Artística (exemplo)", telefone: "5583900000001" },
  { categoria: "Resgate", nome: "Coordenação do Resgate (exemplo)", telefone: "5583900000002" },
];
export function contatos() {
  const c = carregarLista().contatos;
  return { lista: c || CONTATOS_PADRAO, exemplo: !c };
}

export function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

export function acharVoluntario(loginDigitado, senha) {
  const lista = listaVoluntarios();
  if (!lista.length) throw erro(409, "A entrada dos voluntários ainda não foi configurada. Fale com a coordenação.");
  const login = normalizar(loginDigitado).replace(/[^a-z0-9]/g, "");
  if (!login) throw erro(400, "Digite o seu login (primeiro e último nome juntos, ex.: joaocosta).");
  const candidatos = lista.filter((v) => v.login === login);
  if (!candidatos.length) throw erro(404, "Login não encontrado. Use o primeiro e o último nome juntos, sem acento e em minúsculas (ex.: joaocosta).");
  const v = candidatos.find((c) => senhaConfereCom(c, senha));
  if (!v) throw erro(401, "Senha incorreta. Use os 6 primeiros dígitos do seu CPF.");
  return v;
}

export const voluntarioPorId = (id) => listaVoluntarios().find((v) => v.id === id) || null;

// Token sem estado: id + HMAC. O segredo vem da Vercel (VOL_SECRET, HASH_SALT ou ADMIN_PASSWORD).
function segredo() {
  const s = process.env.VOL_SECRET || process.env.HASH_SALT || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("Configure VOL_SECRET, HASH_SALT ou ADMIN_PASSWORD.");
  return s;
}
const assinar = (id) => createHmac("sha256", segredo()).update(`vol3|${id}`).digest("base64url").slice(0, 32);

export function emitirToken(v) {
  return `${v.id}.${assinar(v.id)}`;
}

export function lerToken(token) {
  const [id, sig] = String(token || "").split(".");
  const v = id && voluntarioPorId(id);
  if (!v || !sig) throw erro(401, "Sessão expirada. Entre de novo com o seu nome.");
  const a = Buffer.from(sig), b = Buffer.from(assinar(id));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw erro(401, "Sessão expirada. Entre de novo com o seu nome.");
  return v;
}

// Distância em metros (haversine).
export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Confere se a posição está no evento. Devolve distância e precisão arredondadas (as coordenadas não são guardadas).
export function avaliarPosicao(b) {
  const lat = Number(b.lat), lng = Number(b.lng), precisao = Number(b.precisao);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw erro(400, "Não recebemos a sua localização. Permita o acesso à localização e tente de novo.");
  }
  const prec = Number.isFinite(precisao) && precisao > 0 ? precisao : 0;
  const dist = distanciaM(lat, lng, LOCAL.lat, LOCAL.lng);
  if (dist - Math.min(prec, FOLGA_MAX_M) > LOCAL.raioM) {
    const longe = dist >= 1000 ? `${(dist / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(dist)} m`;
    throw erro(409, `Você está a ${longe} do ${LOCAL.nome}. O check-in só vale quando você chegar ao evento.`);
  }
  return { distancia: Math.round(dist), precisao: Math.round(prec) };
}

export function diaDoEvento(d = new Date()) {
  const { id } = agoraNoFuso(d);
  return DIAS_EVENTO.includes(id) ? id : null;
}

export async function estadoVoluntario(q, v, d = new Date()) {
  const hoje = agoraNoFuso(d).id;
  const [ck, vl, agora] = await Promise.all([
    q.query("SELECT dia::text AS dia, criado_em FROM vol_checkins WHERE voluntario = $1", [v.id]),
    q.query("SELECT dia::text AS dia, usado_em FROM vol_vales WHERE voluntario = $1", [v.id]),
    q.query(`SELECT count(*)::int AS n FROM vol_vales WHERE usado_em > now() - interval '${JANELA_ALMOCO_MIN} minutes'`),
  ]);
  const checkins = Object.fromEntries(ck.rows.map((r) => [r.dia, r.criado_em]));
  const usados = Object.fromEntries(vl.rows.map((r) => [r.dia, r.usado_em]));
  return {
    voluntario: { nome: v.nome, categoria: v.categoria, admin: v.admin },
    almocandoAgora: agora.rows[0]?.n || 0,
    janelaAlmocoMin: JANELA_ALMOCO_MIN,
    hoje,
    eventoHoje: DIAS_EVENTO.includes(hoje),
    local: LOCAL,
    checkinHoje: checkins[hoje] || null,
    vales: DIAS_EVENTO.map((dia) => ({
      dia,
      rotulo: rotulo(dia),
      usadoEm: usados[dia] || null,
      situacao: usados[dia] ? "usado" : dia === hoje ? "disponivel" : dia < hoje ? "expirado" : "futuro",
    })),
    escala: ESCALA[v.categoria] || [],
    escalaExemplo: HORARIOS_EXEMPLO,
    contatos: [...contatos().lista].sort((a, b) => (b.categoria === v.categoria) - (a.categoria === v.categoria)),
    contatosExemplo: contatos().exemplo,
  };
}

// Painel da coordenação: todos os voluntários com check-in e almoço do dia.
export async function painelDoDia(q, dia) {
  const [ck, vl] = await Promise.all([
    q.query("SELECT voluntario, criado_em, distancia_m, precisao_m FROM vol_checkins WHERE dia = $1", [dia]),
    q.query("SELECT voluntario, usado_em FROM vol_vales WHERE dia = $1", [dia]),
  ]);
  const c = Object.fromEntries(ck.rows.map((r) => [r.voluntario, r]));
  const u = Object.fromEntries(vl.rows.map((r) => [r.voluntario, r]));
  return {
    dia,
    dias: DIAS_EVENTO,
    voluntarios: listaVoluntarios()
      .map((v) => ({
        id: v.id, nome: v.nome, categoria: v.categoria,
        checkin: c[v.id] ? { em: c[v.id].criado_em, distancia: c[v.id].distancia_m, precisao: c[v.id].precisao_m } : null,
        vale: u[v.id] ? u[v.id].usado_em : null,
      }))
      // quem já fez check-in ou almoçou primeiro, depois por nome
      .sort((a, b) => (!!(b.checkin || b.vale) - !!(a.checkin || a.vale)) || a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

// Ações do painel (coordenação por senha ou voluntário admin).
export async function acaoPainel(q, acao, b, diaPadrao) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dia || "")) ? b.dia : diaPadrao;
  if (acao === "liberarVale" || acao === "apagarCheckin") {
    const v = voluntarioPorId(String(b.voluntario || ""));
    if (!v) throw erro(400, "Voluntário desconhecido.");
    const tabela = acao === "liberarVale" ? "vol_vales" : "vol_checkins";
    await q.query(`DELETE FROM ${tabela} WHERE voluntario = $1 AND dia = $2`, [v.id, dia]);
  }
  return painelDoDia(q, dia);
}
