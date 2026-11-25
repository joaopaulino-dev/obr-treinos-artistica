// Super Teams da Artística: inscrição de interesse (uma por equipe) e sorteio por nível.
// Estado guardado na tabela meta: st_aberto, st_sorteio (JSON), st_publicado.
import { randomInt } from "node:crypto";
import { NIVEIS } from "./config.js";
import { erro, inteiro } from "./regras.js";

export const INTEGRANTES_MAX = 15;
export const TAMANHO_MIN = 2;
export const TAMANHO_MAX = 6;

export function nivelDaEquipe(nome) {
  for (const [n, cfg] of Object.entries(NIVEIS)) {
    if (cfg.equipes.some((e) => e.nome === nome)) return Number(n);
  }
  return null;
}

// Valida { equipe, integrantes } vindos do formulário público.
export function validarInscricao({ equipe, integrantes }) {
  const nome = String(equipe || "");
  const nivel = nivelDaEquipe(nome);
  if (!nivel) throw erro(400, "Escolha a sua equipe na lista.");
  return { equipe: nome, nivel, integrantes: inteiro(integrantes, 1, INTEGRANTES_MAX, "O número de integrantes") };
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Sorteio separado por nível, equilibrando o total de pessoas entre os times.
// inscritas: [{ equipe, nivel, integrantes }]; tamanho: equipes por time.
// Times com t = floor(n / tamanho); as que sobram entram uma em cada time (nenhuma fica sozinha).
// rnd(n) devolve um inteiro em [0, n) (injetável nos testes).
export function sortear(inscritas, tamanho, rnd = randomInt) {
  const times = [];
  const avisos = [];
  for (const nivel of Object.keys(NIVEIS).map(Number)) {
    const lista = inscritas.filter((i) => i.nivel === nivel);
    const n = lista.length;
    if (!n) continue;
    if (n === 1) avisos.push(`Só uma equipe inscrita no Nível ${nivel} (${lista[0].equipe}): ela ficou sem par.`);

    // Fisher–Yates para o desempate ser aleatório; depois as maiores equipes primeiro.
    const fila = [...lista];
    for (let i = fila.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [fila[i], fila[j]] = [fila[j], fila[i]];
    }
    fila.sort((a, b) => b.integrantes - a.integrantes);

    const t = Math.max(1, Math.floor(n / tamanho));
    const base = Math.floor(n / t);
    const maiores = n % t; // quantos times ficam com base + 1 equipes
    const grupo = Array.from({ length: t }, (_, k) => ({
      nome: `Super Team N${nivel}-${LETRAS[k] || k + 1}`,
      nivel,
      equipes: [],
      pessoas: 0,
    }));
    for (const insc of fila) {
      const cheios = grupo.filter((g) => g.equipes.length > base).length;
      const vagos = grupo.filter((g) => g.equipes.length < base || (g.equipes.length === base && cheios < maiores));
      const menor = Math.min(...vagos.map((g) => g.pessoas));
      const empatados = vagos.filter((g) => g.pessoas === menor);
      const alvo = empatados[rnd(empatados.length)];
      alvo.equipes.push({ equipe: insc.equipe, integrantes: insc.integrantes });
      alvo.pessoas += insc.integrantes;
    }
    times.push(...grupo);
  }
  return { tamanho, feitoEm: new Date().toISOString(), times, avisos };
}

// Lê inscrições e estado do banco.
export async function carregarSuperTeams(q) {
  const [ins, meta] = await Promise.all([
    q.query("SELECT equipe, nivel, integrantes, criado_em, origem FROM superteams ORDER BY criado_em"),
    q.query("SELECT chave, valor FROM meta WHERE chave IN ('st_aberto', 'st_sorteio', 'st_publicado')"),
  ]);
  const m = Object.fromEntries(meta.rows.map((r) => [r.chave, r.valor]));
  let sorteio = null;
  try { sorteio = m.st_sorteio ? JSON.parse(m.st_sorteio) : null; } catch { sorteio = null; }
  return {
    aberto: m.st_aberto !== "0",
    publicado: m.st_publicado === "1" && !!sorteio,
    sorteio,
    inscritas: ins.rows.map((r) => ({
      equipe: r.equipe, nivel: Number(r.nivel), integrantes: Number(r.integrantes),
      criadoEm: r.criado_em, origem: r.origem || "",
    })),
  };
}

export async function gravarMeta(q, chave, valor) {
  if (valor == null) return q.query("DELETE FROM meta WHERE chave = $1", [chave]);
  return q.query(
    "INSERT INTO meta (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
    [chave, String(valor)],
  );
}

// O que a página pública pode ver: total por nível e, se publicado, os times.
export function estadoPublico(st) {
  const porNivel = { 1: 0, 2: 0 };
  for (const i of st.inscritas) porNivel[i.nivel] = (porNivel[i.nivel] || 0) + 1;
  return {
    aberto: st.aberto,
    total: st.inscritas.length,
    porNivel,
    equipes: Object.fromEntries(Object.entries(NIVEIS).map(([n, c]) => [n, c.equipes.map((e) => e.nome)])),
    times: st.publicado ? st.sorteio.times : null,
  };
}
