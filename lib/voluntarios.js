// Área dos voluntários (/voluntarios): entrada por primeiro e último nome, escala, vale almoço
// (um por dia, consumido arrastando o ticket) e check-in com localização no Centro de Convenções.
import { createHmac, timingSafeEqual } from "node:crypto";
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

export const CATEGORIAS = ["Artística", "Resgate"];

// MVP: lista fixa. A entrada compara só o primeiro e o último nome, sem acento e sem diferenciar maiúsculas.
export const VOLUNTARIOS = [
  { id: "joao-costa", nome: "João Costa", categoria: "Artística" },
  { id: "jp", nome: "João Paulino", categoria: "Artística" },
  { id: "jussara", nome: "Jussara Teste", categoria: "Artística" },
  { id: "carol", nome: "Carol Teste", categoria: "Resgate" },
  { id: "amanda", nome: "Amanda Teste", categoria: "Resgate" },
];

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
};

// Contatos de EXEMPLO (os reais entram depois). Telefone só com dígitos, com DDI.
export const CONTATOS_EXEMPLO = true;
export const CONTATOS = [
  { categoria: "Artística", nome: "Coordenação da Artística (exemplo)", telefone: "5583900000001" },
  { categoria: "Resgate", nome: "Coordenação do Resgate (exemplo)", telefone: "5583900000002" },
  { categoria: "Geral", nome: "Coordenação geral (exemplo)", telefone: "5583900000003" },
];

export function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function pontas(s) {
  const partes = normalizar(s).split(" ").filter(Boolean);
  return partes.length < 2 ? null : `${partes[0]} ${partes[partes.length - 1]}`;
}

export function acharVoluntario(nomeDigitado) {
  const chave = pontas(nomeDigitado);
  if (!chave) throw erro(400, "Digite o primeiro e o último nome.");
  const v = VOLUNTARIOS.find((x) => pontas(x.nome) === chave);
  if (!v) throw erro(404, "Nome não encontrado na lista de voluntários. Confira a grafia ou fale com a coordenação.");
  return v;
}

export const voluntarioPorId = (id) => VOLUNTARIOS.find((v) => v.id === id) || null;

// Token sem estado: id + HMAC. O segredo vem da Vercel (VOL_SECRET, HASH_SALT ou ADMIN_PASSWORD).
function segredo() {
  const s = process.env.VOL_SECRET || process.env.HASH_SALT || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("Configure VOL_SECRET, HASH_SALT ou ADMIN_PASSWORD.");
  return s;
}
const assinar = (id) => createHmac("sha256", segredo()).update(`vol|${id}`).digest("base64url").slice(0, 32);

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
  const [ck, vl] = await Promise.all([
    q.query("SELECT dia::text AS dia, criado_em FROM vol_checkins WHERE voluntario = $1", [v.id]),
    q.query("SELECT dia::text AS dia, usado_em FROM vol_vales WHERE voluntario = $1", [v.id]),
  ]);
  const checkins = Object.fromEntries(ck.rows.map((r) => [r.dia, r.criado_em]));
  const usados = Object.fromEntries(vl.rows.map((r) => [r.dia, r.usado_em]));
  return {
    voluntario: { nome: v.nome, categoria: v.categoria },
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
    contatos: [...CONTATOS].sort((a, b) => (b.categoria === v.categoria) - (a.categoria === v.categoria)),
    contatosExemplo: CONTATOS_EXEMPLO,
  };
}
