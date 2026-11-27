import { test } from "node:test";
import assert from "node:assert/strict";
import { montar, estadoPublico, validarLiberacao } from "../lib/pontuacao.js";

test("validação: modalidade, nível e link obrigatório para liberar", () => {
  assert.throws(() => validarLiberacao({ modalidade: "x", nivel: 1, liberado: true }), /Modalidade/);
  assert.throws(() => validarLiberacao({ modalidade: "resgate", nivel: 3, liberado: true }), /Nível/);
  assert.deepEqual(validarLiberacao({ modalidade: "artistica", nivel: 1, liberado: true }), { modalidade: "artistica", nivel: 1, liberado: true });
  assert.deepEqual(validarLiberacao({ modalidade: "artistica", nivel: "2", liberado: false }), { modalidade: "artistica", nivel: 2, liberado: false });
  assert.deepEqual(validarLiberacao({ modalidade: "resgate", nivel: 1, liberado: true }), { modalidade: "resgate", nivel: 1, liberado: true });
});

test("público só recebe a url do nível divulgado", () => {
  const pub = estadoPublico(montar({ pt_resgate_1: "1", pt_resgate_2: "0", pt_artistica_1: "1" }));
  assert.equal(pub.resgate[1].liberado, true);
  assert.match(pub.resgate[1].url, /d3Zd4m$/);
  assert.deepEqual(pub.resgate[2], { liberado: false });
  assert.match(pub.artistica[1].url, /SSQ7df/);
  assert.deepEqual(pub.artistica[2], { liberado: false });
  assert.deepEqual(estadoPublico(montar({})).resgate[1], { liberado: false });
});
