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
