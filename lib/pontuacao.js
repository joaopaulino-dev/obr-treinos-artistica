// Pontuação divulgada por nível, liberada pela coordenação.
// Estado em meta: pt_<modalidade>_<nivel> = "1" (divulgada) ou "0".
// A página pública só recebe a url depois de liberada.
import { erro } from "./regras.js";
import { gravarMeta } from "./superteams.js";

export const LINKS = {
  resgate: { 1: "https://olimpo.robocup.org.br/lr/d3Zd4m", 2: "https://olimpo.robocup.org.br/lr/TV1a4S" },
  artistica: { 1: "https://olimpo.robocup.org.br/lr/SSQ7df", 2: "https://olimpo.robocup.org.br/events/data/a351a1bc-7f49-4c6d-a4de-e85475c854a6" },
};
const NOMES = { resgate: "Resgate", artistica: "Artística" };
const chave = (m, n) => `pt_${m}_${n}`;
const CHAVES = Object.keys(LINKS).flatMap((m) => [1, 2].map((n) => chave(m, n)));

export function montar(meta) {
  const out = {};
  for (const m of Object.keys(LINKS)) {
    out[m] = {};
    for (const n of [1, 2]) {
      const url = LINKS[m][n];
      out[m][n] = { liberado: !!url && meta[chave(m, n)] === "1", temLink: !!url, url };
    }
  }
  return out;
}

export async function carregarPontuacao(q) {
  const { rows } = await q.query("SELECT chave, valor FROM meta WHERE chave = ANY($1)", [CHAVES]);
  return montar(Object.fromEntries(rows.map((r) => [r.chave, r.valor])));
}

export function estadoPublico(p) {
  const out = {};
  for (const [m, niveis] of Object.entries(p)) {
    out[m] = {};
    for (const [n, x] of Object.entries(niveis)) out[m][n] = x.liberado ? { liberado: true, url: x.url } : { liberado: false };
  }
  return out;
}

export function validarLiberacao({ modalidade, nivel, liberado }) {
  const m = String(modalidade || "");
  if (!(m in LINKS)) throw erro(400, "Modalidade inválida.");
  const n = Number(nivel);
  if (n !== 1 && n !== 2) throw erro(400, "Nível inválido.");
  const on = liberado === true;
  if (on && !LINKS[m][n]) throw erro(409, `Ainda não há link de pontuação para ${NOMES[m]} N${n}.`);
  return { modalidade: m, nivel: n, liberado: on };
}

export function gravarLiberacao(q, { modalidade, nivel, liberado }) {
  return gravarMeta(q, chave(modalidade, nivel), liberado ? "1" : "0");
}
