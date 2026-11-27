// Desafio Técnico · Resgate: logins dos juízes/admin, sessão e gravação dos rounds.
// O cálculo da nota fica em public/desafio/pontuacao.js (o mesmo arquivo roda no navegador).
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "node:crypto";
import { erro } from "./regras.js";
import { EQUIPES } from "./equipes.js";
import { calcular, normalizarRound, ARENAS, ROUNDS } from "../public/desafio/pontuacao.js";

export const EQUIPES_RESGATE = EQUIPES.filter((e) => e.modalidade === "Resgate").map((e) => ({ nome: e.nome, nivel: e.nivel, mesa: e.mesa }));
const RESGATE_POR_NOME = new Map(EQUIPES_RESGATE.map((e) => [e.nome, e]));

// Usuários fixos: SÓ na variável DT_USUARIOS da Vercel (o repositório é público).
// JSON [{ login, nome, papel: "admin" | "juiz", sal, hash }], hash = scrypt(senha, sal, 32) em hex.
// Gerada por scripts/gerar-dt-usuarios.mjs. Os demais juízes o admin cadastra na própria página (tabela dt_juizes).
let cache = { fonte: null, lista: [], invalida: false };
export function usuariosFixos() {
  const fonte = process.env.DT_USUARIOS || "";
  if (fonte !== cache.fonte) {
    let txt = fonte.trim(), lista = [], invalida = false;
    if (/^['"].*['"]$/s.test(txt)) txt = txt.slice(1, -1).trim();
    if (txt) { try { lista = JSON.parse(txt); } catch { invalida = true; } }
    cache = { fonte, invalida, lista: Array.isArray(lista) ? lista.map((u) => ({ ...u, login: normLogin(u.login), papel: u.papel === "admin" ? "admin" : "juiz" })) : [] };
  }
  return cache;
}

export const normLogin = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9._-]/g, "");

function confere(u, senha) {
  const dada = String(senha || "");
  if (!dada || dada.length > 200 || !u?.sal || !u?.hash) return false;
  const h = Buffer.from(u.hash, "hex");
  const c = scryptSync(dada, u.sal, h.length || 32);
  return c.length === h.length && timingSafeEqual(c, h);
}

export function gerarHash(senha) {
  const sal = randomBytes(12).toString("hex");
  return { sal, hash: scryptSync(String(senha), sal, 32).toString("hex") };
}

async function juizDoBanco(q, login) {
  const { rows } = await q.query("SELECT login, nome, sal, hash FROM dt_juizes WHERE login = $1", [login]);
  return rows[0] ? { ...rows[0], papel: "juiz" } : null;
}

async function acharUsuario(q, login) {
  const l = normLogin(login);
  if (!l) return null;
  return usuariosFixos().lista.find((u) => u.login === l) || (await juizDoBanco(q, l));
}

export async function entrar(q, login, senha) {
  const fixos = usuariosFixos();
  if (fixos.invalida) throw erro(409, "A lista de usuários (DT_USUARIOS) está inválida na Vercel. Cole de novo o conteúdo gerado.");
  if (!normLogin(login)) throw erro(400, "Digite o seu login.");
  const u = await acharUsuario(q, login);
  if (!u || !confere(u, senha)) throw erro(401, "Login ou senha incorretos.");
  return { token: emitirToken(u), login: u.login, nome: u.nome || u.login, papel: u.papel };
}

// Sessão sem estado: papel.login.assinatura. Conferida a cada chamada (juiz removido perde o acesso).
function segredo() {
  const s = process.env.DT_SECRET || process.env.HASH_SALT || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("Configure DT_SECRET, HASH_SALT ou ADMIN_PASSWORD.");
  return s;
}
const assinar = (papel, login, hash) => createHmac("sha256", segredo()).update(`dt1|${papel}|${login}|${String(hash).slice(0, 16)}`).digest("base64url").slice(0, 32);
export const emitirToken = (u) => `${u.papel}.${u.login}.${assinar(u.papel, u.login, u.hash)}`;

export async function lerSessao(q, token, exigeAdmin = false) {
  const [papel, login, sig] = String(token || "").split(".");
  const u = login ? await acharUsuario(q, login) : null;
  const ok = u && sig && u.papel === papel && (() => {
    const a = Buffer.from(sig), b = Buffer.from(assinar(u.papel, u.login, u.hash));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  if (!ok) throw erro(401, "Sessão expirada. Entre de novo.");
  if (exigeAdmin && u.papel !== "admin") throw erro(403, "Só o admin pode fazer isso.");
  return { login: u.login, nome: u.nome || u.login, papel: u.papel };
}

// Valida e grava um round. Um registro por equipe e round; para refazer, o admin apaga antes.
export async function registrarRound(q, b, juiz, origem) {
  const equipe = RESGATE_POR_NOME.get(String(b.equipe || ""));
  if (!equipe) throw erro(400, "Escolha um time do Resgate.");
  const nivel = Number(b.nivel);
  if (nivel !== equipe.nivel) throw erro(400, `${equipe.nome} é do Nível ${equipe.nivel}.`);
  const round = Number(b.round);
  if (!ROUNDS.includes(round)) throw erro(400, "Round inválido.");
  const arena = Number(b.arena);
  if (!ARENAS.includes(arena)) throw erro(400, "Escolha a arena.");
  const dados = normalizarRound(b.dados, nivel);
  const r = calcular(dados, nivel);
  const { rows } = await q.query(
    `INSERT INTO dt_rounds (equipe, nivel, round, arena, no_show, dados, pontos, tempo_seg, juiz, juiz_nome, origem, envio)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (equipe, round) DO NOTHING RETURNING id`,
    [equipe.nome, nivel, round, arena, dados.noShow, JSON.stringify(dados), r.total, dados.tempoSeg, juiz.login, juiz.nome, origem, String(b.envio || "").slice(0, 64) || null],
  );
  if (!rows.length) {
    // Reenvio do mesmo aparelho (internet caiu depois de gravar) não é erro.
    const { rows: ja } = await q.query("SELECT id, envio, pontos FROM dt_rounds WHERE equipe = $1 AND round = $2", [equipe.nome, round]);
    if (ja[0] && b.envio && ja[0].envio === String(b.envio)) return { id: Number(ja[0].id), pontos: Number(ja[0].pontos), repetido: true };
    throw erro(409, `O round ${round} de ${equipe.nome} já foi pontuado. Peça ao admin para apagar se precisar refazer.`);
  }
  return { id: Number(rows[0].id), pontos: r.total };
}

export async function listarRounds(q) {
  const { rows } = await q.query(
    "SELECT id, equipe, nivel, round, arena, no_show, dados, pontos, tempo_seg, juiz, juiz_nome, criado_em FROM dt_rounds ORDER BY criado_em",
  );
  return rows.map((r) => ({
    id: Number(r.id), equipe: r.equipe, nivel: Number(r.nivel), round: Number(r.round), arena: Number(r.arena),
    noShow: r.no_show, dados: r.dados, pontos: Number(r.pontos), tempoSeg: Number(r.tempo_seg),
    juiz: r.juiz, juizNome: r.juiz_nome, criadoEm: r.criado_em,
  }));
}

export async function listarJuizes(q) {
  const { rows } = await q.query("SELECT login, nome, criado_em FROM dt_juizes ORDER BY nome");
  const fixos = usuariosFixos().lista.map((u) => ({ login: u.login, nome: u.nome || u.login, papel: u.papel, fixo: true }));
  return [...fixos, ...rows.map((r) => ({ login: r.login, nome: r.nome, papel: "juiz", fixo: false, criadoEm: r.criado_em }))];
}

export async function adicionarJuiz(q, b) {
  const login = normLogin(b.login);
  const nome = String(b.nome || "").trim().slice(0, 60);
  const senha = String(b.senha || "");
  if (login.length < 3 || login.length > 40) throw erro(400, "Login precisa ter de 3 a 40 letras ou números, sem espaço.");
  if (!nome) throw erro(400, "Informe o nome do juiz.");
  if (senha.length < 4 || senha.length > 100) throw erro(400, "A senha precisa ter pelo menos 4 caracteres.");
  if (usuariosFixos().lista.some((u) => u.login === login)) throw erro(409, "Esse login já existe.");
  const { sal, hash } = gerarHash(senha);
  const { rowCount } = await q.query(
    "INSERT INTO dt_juizes (login, nome, sal, hash) VALUES ($1, $2, $3, $4) ON CONFLICT (login) DO NOTHING",
    [login, nome, sal, hash],
  );
  if (!rowCount) throw erro(409, "Esse login já existe.");
}
