// Super Teams: inscrição de interesse (uma por equipe) e sorteio.
// Artística: sorteio separado por nível; tabela superteams; meta st_aberto, st_sorteio (JSON), st_publicado.
// Resgate: N1 e N2 misturados nos mesmos times; tabela superteams_resgate; meta str_*.
import { randomInt } from "node:crypto";
import { NIVEIS } from "./config.js";
import { EQUIPES } from "./equipes.js";
import { erro, inteiro } from "./regras.js";

const doResgate = (n) => EQUIPES.filter((e) => e.modalidade === "Resgate" && e.nivel === n).map((e) => e.nome);
export const MODS = {
  artistica: {
    id: "artistica", modalidade: "Artística", tabela: "superteams", meta: "st_", trava: "superteams", misturar: false,
    equipes: Object.fromEntries(Object.entries(NIVEIS).map(([n, c]) => [n, c.equipes.map((e) => e.nome)])),
  },
  resgate: {
    id: "resgate", modalidade: "Resgate", tabela: "superteams_resgate", meta: "str_", trava: "superteams-resgate", misturar: true,
    equipes: { 1: doResgate(1), 2: doResgate(2) },
  },
};
export const modDe = (v) => (v === "resgate" ? MODS.resgate : MODS.artistica);

export const INTEGRANTES_MAX = 15;
export const TAMANHO_MIN = 2;
export const TAMANHO_MAX = 6;

export function nivelDaEquipe(nome, m = MODS.artistica) {
  for (const [n, lista] of Object.entries(m.equipes)) {
    if (lista.includes(nome)) return Number(n);
  }
  return null;
}

// Valida { equipe, integrantes } vindos do formulário público.
export function validarInscricao({ equipe, integrantes }, m = MODS.artistica) {
  const nome = String(equipe || "");
  const nivel = nivelDaEquipe(nome, m);
  if (!nivel) throw erro(400, "Escolha a sua equipe na lista.");
  return { equipe: nome, nivel, integrantes: inteiro(integrantes, 1, INTEGRANTES_MAX, "O número de integrantes") };
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Sorteio equilibrando o total de pessoas entre os times.
// Separado por nível (Artística) ou com N1 e N2 misturados (misturar: true, Resgate),
// quando os níveis também são espalhados entre os times.
// inscritas: [{ equipe, nivel, integrantes }]; tamanho: equipes por time.
// Times com t = floor(n / tamanho); as que sobram entram uma em cada time (nenhuma fica sozinha).
// rnd(n) devolve um inteiro em [0, n) (injetável nos testes).
export function sortear(inscritas, tamanho, rnd = randomInt, { misturar = false } = {}) {
  const times = [];
  const avisos = [];
  const grupos = misturar ? [null] : [1, 2];
  for (const nivel of grupos) {
    const lista = nivel == null ? [...inscritas] : inscritas.filter((i) => i.nivel === nivel);
    const n = lista.length;
    if (!n) continue;
    if (n === 1) avisos.push(nivel == null ? `Só uma equipe inscrita (${lista[0].equipe}): ela ficou sem par.` : `Só uma equipe inscrita no Nível ${nivel} (${lista[0].equipe}): ela ficou sem par.`);

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
      nome: nivel == null ? `Super Team ${LETRAS[k] || k + 1}` : `Super Team N${nivel}-${LETRAS[k] || k + 1}`,
      nivel,
      equipes: [],
      pessoas: 0,
    }));
    for (const insc of fila) {
      const cheios = grupo.filter((g) => g.equipes.length > base).length;
      const vagos = grupo.filter((g) => g.equipes.length < base || (g.equipes.length === base && cheios < maiores));
      // Misturando níveis: primeiro o time com menos equipes do mesmo nível, depois o com menos pessoas.
      const mesmo = (g) => g.equipes.filter((e) => e.nivel === insc.nivel).length;
      const poucos = misturar ? Math.min(...vagos.map(mesmo)) : 0;
      const candidatos = misturar ? vagos.filter((g) => mesmo(g) === poucos) : vagos;
      const menor = Math.min(...candidatos.map((g) => g.pessoas));
      const empatados = candidatos.filter((g) => g.pessoas === menor);
      const alvo = empatados[rnd(empatados.length)];
      alvo.equipes.push({ equipe: insc.equipe, integrantes: insc.integrantes, nivel: insc.nivel });
      alvo.pessoas += insc.integrantes;
    }
    times.push(...grupo);
  }
  return { tamanho, feitoEm: new Date().toISOString(), times, avisos };
}

// Sorteio de um nível com no máximo "max" equipes por time (3 → times de 2 ou 3, o máximo possível de 3),
// equilibrando pessoas; "juntas" (lista de nomes) ficam sempre no mesmo time.
// Várias tentativas aleatórias; fica a de menor diferença entre o maior e o menor time.
export function sortearNivelFlex(inscritas, nivel, { max = 3, juntas = [], tentativas = 4000, rnd = randomInt } = {}) {
  const lista = inscritas.filter((i) => i.nivel === nivel);
  const n = lista.length;
  if (n < 2) throw erro(409, `É preciso ter pelo menos 2 equipes inscritas no Nível ${nivel}.`);
  for (const j of juntas) if (!lista.some((i) => i.equipe === j)) throw erro(409, `${j} não está inscrita no Nível ${nivel}.`);
  if (juntas.length > max) throw erro(400, `No máximo ${max} equipes juntas.`);
  // Nenhum time passa de "max" equipes; os tamanhos diferem em no máximo 1.
  const t = Math.ceil(n / max), base = Math.floor(n / t), maiores = n % t;
  const bloco = lista.filter((i) => juntas.includes(i.equipe));
  const resto = lista.filter((i) => !juntas.includes(i.equipe));
  const embaralhar = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let melhor = null;
  for (let k = 0; k < tentativas; k++) {
    const caps = embaralhar([...Array(maiores).fill(base + 1), ...Array(t - maiores).fill(base)]);
    const g = caps.map((cap) => ({ cap, equipes: [], pessoas: 0 }));
    if (bloco.length) {
      const cabe = g.filter((x) => x.cap >= bloco.length);
      const alvo = cabe[rnd(cabe.length)];
      for (const e of bloco) { alvo.equipes.push(e); alvo.pessoas += e.integrantes; }
    }
    const fila = embaralhar([...resto]).sort((a, b) => b.integrantes - a.integrantes);
    for (const e of fila) {
      const vagos = g.filter((x) => x.equipes.length < x.cap);
      const menor = Math.min(...vagos.map((x) => x.pessoas));
      const emp = vagos.filter((x) => x.pessoas === menor);
      const alvo = emp[rnd(emp.length)];
      alvo.equipes.push(e); alvo.pessoas += e.integrantes;
    }
    const ps = g.map((x) => x.pessoas);
    const media = ps.reduce((a, b) => a + b, 0) / ps.length;
    const nota = [Math.max(...ps) - Math.min(...ps), ps.reduce((a, p) => a + (p - media) ** 2, 0)];
    if (!melhor || nota[0] < melhor.nota[0] || (nota[0] === melhor.nota[0] && nota[1] < melhor.nota[1])) melhor = { nota, g };
  }
  return melhor.g
    .sort((a, b) => b.equipes.length - a.equipes.length || b.pessoas - a.pessoas)
    .map((x, k) => ({
      nome: `Super Team N${nivel}-${LETRAS[k] || k + 1}`,
      nivel,
      equipes: x.equipes.map((e) => ({ equipe: e.equipe, integrantes: e.integrantes, nivel })),
      pessoas: x.pessoas,
    }));
}

// Sorteio da Artística: cada nível separado, nenhum time com mais de "max" equipes.
export function sortearArtistica(inscritas, max, { juntas = [], rnd = randomInt } = {}) {
  const times = [], avisos = [];
  const nivelJuntas = juntas.length ? (inscritas.find((i) => i.equipe === juntas[0]) || {}).nivel : null;
  if (juntas.length && juntas.some((j) => (inscritas.find((i) => i.equipe === j) || {}).nivel !== nivelJuntas)) {
    throw erro(409, "As equipes que ficam juntas precisam estar inscritas e no mesmo nível.");
  }
  for (const nivel of [1, 2]) {
    const lista = inscritas.filter((i) => i.nivel === nivel);
    if (!lista.length) continue;
    if (lista.length === 1) {
      avisos.push(`Só uma equipe inscrita no Nível ${nivel} (${lista[0].equipe}): ela ficou sem par.`);
      times.push({ nome: `Super Team N${nivel}-A`, nivel, equipes: [{ equipe: lista[0].equipe, integrantes: lista[0].integrantes, nivel }], pessoas: lista[0].integrantes });
      continue;
    }
    times.push(...sortearNivelFlex(inscritas, nivel, { max, juntas: nivel === nivelJuntas ? juntas : [], rnd }));
  }
  return { tamanho: max, feitoEm: new Date().toISOString(), times, avisos };
}

// Divide um time do sorteio em dois (equipes meio a meio, menor diferença de pessoas).
// Os novos times ficam no lugar do original, com o nome + "1" e "2" (ex.: Super Team N2-B1 / N2-B2).
export function dividirTime(sorteio, nome) {
  const i = (sorteio && sorteio.times || []).findIndex((t) => t.nome === nome);
  if (i < 0) throw erro(409, "Esse time não existe no sorteio atual.");
  const t = sorteio.times[i], eq = t.equipes, n = eq.length;
  if (n < 4) throw erro(409, "Só dá para dividir um time com 4 equipes ou mais (2 em cada).");
  const metade = Math.floor(n / 2), total = t.pessoas;
  let melhor = null;
  for (let mask = 0; mask < 1 << n; mask++) {
    if (!(mask & 1)) continue; // a primeira equipe fica sempre no primeiro grupo (evita repetir)
    let qtd = 0, pes = 0;
    for (let k = 0; k < n; k++) if (mask & (1 << k)) { qtd++; pes += eq[k].integrantes; }
    if (qtd !== metade && qtd !== n - metade) continue;
    const dif = Math.abs(total - 2 * pes);
    if (!melhor || dif < melhor.dif) melhor = { dif, mask };
  }
  const grupo = (dentro, sufixo) => {
    const equipes = eq.filter((_, k) => !!(melhor.mask & (1 << k)) === dentro);
    return { ...t, nome: t.nome + sufixo, equipes, pessoas: equipes.reduce((s, e) => s + e.integrantes, 0) };
  };
  const times = [...sorteio.times];
  times.splice(i, 1, grupo(true, "1"), grupo(false, "2"));
  return { ...sorteio, times };
}

// Lê inscrições e estado do banco.
export async function carregarSuperTeams(q, mod = MODS.artistica) {
  const k = (s) => mod.meta + s;
  const [ins, meta] = await Promise.all([
    q.query(`SELECT equipe, nivel, integrantes, criado_em, origem FROM ${mod.tabela} ORDER BY criado_em`),
    q.query("SELECT chave, valor FROM meta WHERE chave = ANY($1)", [[k("aberto"), k("sorteio"), k("publicado")]]),
  ]);
  const m = Object.fromEntries(meta.rows.map((r) => [r.chave, r.valor]));
  let sorteio = null;
  try { sorteio = m[k("sorteio")] ? JSON.parse(m[k("sorteio")]) : null; } catch { sorteio = null; }
  if (sorteio && mod.id === "artistica") sorteio = { ...sorteio, times: marcarApresentacao(sorteio.times) };
  return {
    aberto: m[k("aberto")] !== "0",
    publicado: m[k("publicado")] === "1" && !!sorteio,
    sorteio,
    inscritas: ins.rows.map((r) => ({
      equipe: r.equipe, nivel: Number(r.nivel), integrantes: Number(r.integrantes),
      criadoEm: r.criado_em, origem: r.origem || "",
    })),
  };
}

// Dia de apresentação dos Super Teams da Artística, por nível (recalculado a cada leitura).
export const APRESENTACAO_POR_NIVEL = { 1: "Apresenta no sábado, 28/11", 2: "Apresenta no domingo, 29/11" };

export function marcarApresentacao(times) {
  return times.map((t) => {
    const { apresentacao, ...resto } = t;
    const dia = APRESENTACAO_POR_NIVEL[t.nivel];
    return dia ? { ...resto, apresentacao: dia } : resto;
  });
}

export async function gravarMeta(q, chave, valor) {
  if (valor == null) return q.query("DELETE FROM meta WHERE chave = $1", [chave]);
  return q.query(
    "INSERT INTO meta (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
    [chave, String(valor)],
  );
}

// O que a página pública pode ver: total por nível e, se publicado, os times.
export function estadoPublico(st, mod = MODS.artistica) {
  const porNivel = { 1: 0, 2: 0 };
  for (const i of st.inscritas) porNivel[i.nivel] = (porNivel[i.nivel] || 0) + 1;
  return {
    aberto: st.aberto,
    total: st.inscritas.length,
    inscritas: st.inscritas.map((i) => i.equipe), // nomes, para o menu mostrar "interesse registrado"
    porNivel,
    modalidade: mod.id,
    misturado: mod.misturar,
    equipes: mod.equipes,
    times: st.publicado ? st.sorteio.times : null,
  };
}
