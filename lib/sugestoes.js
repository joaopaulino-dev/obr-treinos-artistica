// Sugestões e elogios das equipes (Artística e Resgate), com votos para dar destaque.
// Cada equipe tem VOTOS_POR_EQUIPE votos no total: no máximo 1 por sugestão e nunca na própria.
import { EQUIPES, buscarEquipe, chaveEquipe } from "./equipes.js";
import { erro } from "./regras.js";

export const VOTOS_POR_EQUIPE = 4;
export const PALAVRAS_MAX = 30;
export const TITULO_MAX = 80;
export const CATEGORIAS = ["sugestao", "elogio"];

export const contarPalavras = (txt) => String(txt || "").trim().split(/\s+/).filter(Boolean).length;
const limpar = (txt) => String(txt || "").replace(/\s+/g, " ").trim();

export function equipeOuErro(chave) {
  const e = buscarEquipe(chave);
  if (!e) throw erro(400, "Escolha a sua equipe na lista.");
  return e;
}

export function validarSugestao({ titulo, descricao, categoria, equipe }) {
  const t = limpar(titulo), d = limpar(descricao);
  if (!CATEGORIAS.includes(categoria)) throw erro(400, "Escolha se é uma sugestão ou um elogio.");
  if (t.length < 3 || t.length > TITULO_MAX) throw erro(400, `O título deve ter entre 3 e ${TITULO_MAX} caracteres.`);
  const n = contarPalavras(d);
  if (!n) throw erro(400, "Descreva a sua sugestão em poucas palavras.");
  if (n > PALAVRAS_MAX || d.length > 300) throw erro(400, `A descrição pode ter no máximo ${PALAVRAS_MAX} palavras.`);
  const e = equipeOuErro(equipe);
  return { titulo: t, descricao: d, categoria, modalidade: e.modalidade, equipe: e.nome };
}

export function idValido(id) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n < 1) throw erro(400, "Sugestão inválida.");
  return n;
}

// Sugestões implementadas primeiro; dentro de cada grupo, das mais votadas para as menos (empate: a mais antiga primeiro).
export async function listarSugestoes(q, { incluirOcultas = false } = {}) {
  const [s, v] = await Promise.all([
    q.query(`SELECT id, titulo, descricao, categoria, modalidade, equipe, oculta, implementada, criado_em, origem FROM sugestoes
             ${incluirOcultas ? "" : "WHERE NOT oculta"}`),
    q.query("SELECT sugestao_id, modalidade, equipe FROM sugestoes_votos"),
  ]);
  const votos = {};
  for (const r of v.rows) (votos[r.sugestao_id] = votos[r.sugestao_id] || []).push(chaveEquipe(r.modalidade, r.equipe));
  const nivelDe = (mod, nome) => (EQUIPES.find((e) => e.modalidade === mod && e.nome === nome) || {}).nivel || null;
  return s.rows
    .map((r) => ({
      id: Number(r.id), titulo: r.titulo, descricao: r.descricao, categoria: r.categoria,
      modalidade: r.modalidade, equipe: r.equipe, nivel: nivelDe(r.modalidade, r.equipe),
      autor: chaveEquipe(r.modalidade, r.equipe), oculta: r.oculta, implementada: r.implementada === true, criadoEm: r.criado_em,
      ...(incluirOcultas ? { origem: r.origem || "" } : {}),
      votantes: votos[r.id] || [], votos: (votos[r.id] || []).length,
    }))
    .sort((a, b) => b.implementada - a.implementada || b.votos - a.votos || new Date(a.criadoEm) - new Date(b.criadoEm));
}

// Ordem fixa para busca e lista: Artística N1, Artística N2, Resgate N1, Resgate N2; nomes em ordem alfabética.
const ORDEM_MOD = { "Artística": 0, "Resgate": 1 };
export function listaEquipes() {
  return [...EQUIPES]
    .sort((a, b) => (ORDEM_MOD[a.modalidade] ?? 9) - (ORDEM_MOD[b.modalidade] ?? 9) || a.nivel - b.nivel || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((e) => ({ chave: chaveEquipe(e.modalidade, e.nome), nome: e.nome, modalidade: e.modalidade, nivel: e.nivel }));
}
