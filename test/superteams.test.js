import { test } from "node:test";
import assert from "node:assert/strict";
import { sortear, validarInscricao, nivelDaEquipe } from "../lib/superteams.js";
import { NIVEIS } from "../lib/config.js";

const N1 = NIVEIS[1].equipes.map((e) => e.nome);
const N2 = NIVEIS[2].equipes.map((e) => e.nome);
const ins = (nomes, nivel, pessoas) => nomes.map((equipe, i) => ({ equipe, nivel, integrantes: pessoas[i % pessoas.length] }));
const rndFixo = () => 0;

test("nível vem da lista oficial; nome desconhecido é recusado", () => {
  assert.equal(nivelDaEquipe(N1[0]), 1);
  assert.equal(nivelDaEquipe(N2[5]), 2);
  assert.throws(() => validarInscricao({ equipe: "Equipe Fantasma", integrantes: 3 }), /lista/);
  assert.throws(() => validarInscricao({ equipe: N1[0], integrantes: 0 }), /integrantes/);
  assert.throws(() => validarInscricao({ equipe: N1[0], integrantes: 16 }), /integrantes/);
  assert.deepEqual(validarInscricao({ equipe: N2[0], integrantes: "4" }), { equipe: N2[0], nivel: 2, integrantes: 4 });
});

test("toda inscrita aparece exatamente uma vez e os níveis não se misturam", () => {
  const lista = [...ins(N1.slice(0, 11), 1, [3, 5, 2, 4]), ...ins(N2.slice(0, 7), 2, [4, 6])];
  for (let rodada = 0; rodada < 50; rodada++) {
    const r = sortear(lista, 3);
    const todas = r.times.flatMap((t) => t.equipes.map((e) => e.equipe));
    assert.equal(todas.length, lista.length);
    assert.equal(new Set(todas).size, lista.length);
    for (const t of r.times) {
      for (const e of t.equipes) assert.equal(nivelDaEquipe(e.equipe), t.nivel);
      assert.ok(t.nome.startsWith(`Super Team N${t.nivel}-`));
      assert.equal(t.pessoas, t.equipes.reduce((s, e) => s + e.integrantes, 0));
    }
  }
});

test("tamanho dos times: pelo menos o pedido e diferença máxima de 1 equipe", () => {
  for (const [n, k] of [[10, 2], [11, 2], [11, 3], [7, 4], [12, 4], [13, 4], [36, 3], [3, 2]]) {
    const r = sortear(ins(N1.slice(0, n), 1, [3]), k);
    const tam = r.times.map((t) => t.equipes.length);
    assert.equal(r.times.length, Math.max(1, Math.floor(n / k)), `n=${n} k=${k}`);
    assert.ok(Math.max(...tam) - Math.min(...tam) <= 1, `n=${n} k=${k}: ${tam}`);
    if (n >= k) assert.ok(Math.min(...tam) >= k, `n=${n} k=${k}: ${tam}`);
  }
});

test("menos equipes que o tamanho pedido: todas no mesmo time", () => {
  const r = sortear(ins(N1.slice(0, 3), 1, [4]), 4);
  assert.equal(r.times.length, 1);
  assert.equal(r.times[0].equipes.length, 3);
});

test("equilibra o total de pessoas entre os times", () => {
  // 8 equipes, duplas: 8+1, 7+2, 6+3, 5+4 → todos com 9 pessoas.
  const r = sortear(ins(N1.slice(0, 8), 1, [8, 7, 6, 5, 4, 3, 2, 1]), 2, rndFixo);
  assert.deepEqual(r.times.map((t) => t.pessoas), [9, 9, 9, 9]);
  // Caso aleatório: diferença entre o maior e o menor time fica pequena.
  for (let rodada = 0; rodada < 30; rodada++) {
    const s = sortear(ins(N2.slice(0, 12), 2, [2, 6, 3, 5, 4, 4]), 3);
    const p = s.times.map((t) => t.pessoas);
    assert.ok(Math.max(...p) - Math.min(...p) <= 3, String(p));
  }
});

test("aviso quando um nível tem uma só equipe", () => {
  const r = sortear([...ins(N1.slice(0, 4), 1, [3]), ...ins(N2.slice(0, 1), 2, [5])], 2);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /Nível 2/);
  assert.equal(r.times.filter((t) => t.nivel === 2).length, 1);
});

test("Resgate: N1 e N2 misturados, níveis espalhados e pessoas equilibradas", async () => {
  const { MODS, validarInscricao: v } = await import("../lib/superteams.js");
  const R1 = MODS.resgate.equipes[1], R2 = MODS.resgate.equipes[2];
  assert.ok(R1.length > 5 && R2.length > 5);
  assert.equal(v({ equipe: R2[0], integrantes: 3 }, MODS.resgate).nivel, 2);
  assert.throws(() => v({ equipe: N1[0], integrantes: 3 }, MODS.resgate), /lista/); // equipe da Artística não entra no Resgate
  const lista = [...ins(R1.slice(0, 6), 1, [3, 4, 2]), ...ins(R2.slice(0, 6), 2, [4, 3])];
  for (let rodada = 0; rodada < 50; rodada++) {
    const r = sortear(lista, 3, undefined, { misturar: true });
    assert.equal(r.times.length, 4);
    const todas = r.times.flatMap((t) => t.equipes.map((e) => e.equipe));
    assert.equal(new Set(todas).size, lista.length);
    for (const t of r.times) {
      assert.match(t.nome, /^Super Team [A-Z]$/);
      assert.equal(t.nivel, null);
      const n1 = t.equipes.filter((e) => e.nivel === 1).length;
      assert.ok(n1 >= 1 && n1 <= 2, "cada time tem equipes dos dois níveis");
    }
  }
});

test("dividir time: 2 equipes em cada, pessoas equilibradas, no lugar do original", async () => {
  const { dividirTime } = await import("../lib/superteams.js");
  const t = (nome, eqs) => ({ nome, nivel: 2, equipes: eqs.map(([equipe, integrantes]) => ({ equipe, integrantes, nivel: 2 })), pessoas: eqs.reduce((s, e) => s + e[1], 0) });
  const s = { tamanho: 3, times: [t("Super Team N2-A", [["a", 4], ["b", 4], ["c", 3]]), t("Super Team N2-B", [["Modern Times", 4], ["Armadillos", 4], ["Alien Bot", 2], ["Curto circuito", 2]]), t("Super Team N2-C", [["d", 4]])] };
  const r = dividirTime(s, "Super Team N2-B");
  assert.deepEqual(r.times.map((x) => x.nome), ["Super Team N2-A", "Super Team N2-B1", "Super Team N2-B2", "Super Team N2-C"]);
  for (const x of r.times.slice(1, 3)) { assert.equal(x.equipes.length, 2); assert.equal(x.pessoas, 6); }
  assert.throws(() => dividirTime(s, "Super Team N2-A"), /4 equipes/);
  assert.throws(() => dividirTime(s, "Nada"), /não existe/);
});

test("refazer nível: times de 2 ou 3, juntas no mesmo time, pessoas equilibradas", async () => {
  const { sortearNivelFlex } = await import("../lib/superteams.js");
  const pessoas = [4, 4, 3, 4, 4, 2, 2, 4, 4, 4, 4, 4, 3, 4, 4, 4];
  const nomes = N2.slice(0, 16);
  const insc = [...nomes.map((equipe, i) => ({ equipe, nivel: 2, integrantes: pessoas[i] })), { equipe: N1[0], nivel: 1, integrantes: 3 }];
  const juntas = [nomes[3], nomes[9]];
  const times = sortearNivelFlex(insc, 2, { juntas, tentativas: 500 });
  assert.equal(times.length, 6);
  assert.deepEqual(times.map((t) => t.equipes.length).sort(), [2, 2, 3, 3, 3, 3]);
  const todas = times.flatMap((t) => t.equipes.map((e) => e.equipe));
  assert.equal(new Set(todas).size, 16);
  assert.ok(times.some((t) => juntas.every((j) => t.equipes.some((e) => e.equipe === j))));
  for (const t of times) { assert.equal(t.nivel, 2); assert.ok(t.nome.startsWith("Super Team N2-")); }
  assert.throws(() => sortearNivelFlex(insc, 2, { juntas: ["Fantasma"] }), /não está inscrita/);
});

test("sorteio da Artística: nunca passa de 3 equipes por time, juntas respeitadas", async () => {
  const { sortearArtistica } = await import("../lib/superteams.js");
  for (const [n1, n2] of [[24, 16], [13, 4], [5, 7], [1, 2]]) {
    const insc = [...ins(N1.slice(0, n1), 1, [4, 3, 1, 4]), ...ins(N2.slice(0, n2), 2, [4, 2, 4])];
    const juntas = n2 >= 2 ? [N2[0], N2[1]] : [];
    const r = sortearArtistica(insc, 3, { juntas });
    const todas = r.times.flatMap((t) => t.equipes.map((e) => e.equipe));
    assert.equal(new Set(todas).size, n1 + n2);
    for (const t of r.times) {
      assert.ok(t.equipes.length <= 3, `${t.nome} com ${t.equipes.length}`);
      if (n1 > 1 || t.nivel === 2) assert.ok(t.equipes.length >= 2);
      for (const e of t.equipes) assert.equal(nivelDaEquipe(e.equipe), t.nivel);
    }
    if (juntas.length) assert.ok(r.times.some((t) => juntas.every((j) => t.equipes.some((e) => e.equipe === j))));
  }
  assert.throws(() => sortearArtistica(ins([N1[0], N2[0]], 1, [3]).map((x, i) => ({ ...x, nivel: i + 1 })), 3, { juntas: [N1[0], N2[0]] }), /mesmo nível/);
});

test("time com CAV NEO JAZZ recebe a marcação de apresentação no sábado", async () => {
  const { marcarApresentacao } = await import("../lib/superteams.js");
  const r = marcarApresentacao([
    { nome: "A", equipes: [{ equipe: "X" }, { equipe: "CAV NEO JAZZ" }] },
    { nome: "B", equipes: [{ equipe: "Y" }], apresentacao: "velha" },
  ]);
  assert.match(r[0].apresentacao, /sábado/);
  assert.equal(r[1].apresentacao, undefined);
});
