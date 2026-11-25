import { test } from "node:test";
import assert from "node:assert/strict";
import { validarSugestao, contarPalavras, idValido } from "../lib/sugestoes.js";
import { EQUIPES, buscarEquipe } from "../lib/equipes.js";

const art = "Artística|BEEONIC";
const resgate = EQUIPES.find((e) => e.modalidade === "Resgate");
const base = { titulo: "Mais tomadas", descricao: "Poucas tomadas perto das mesas", categoria: "sugestao", equipe: art };

test("lista de equipes: 152, Artística e Resgate, sem nome repetido na mesma modalidade", () => {
  assert.equal(EQUIPES.length, 152);
  assert.equal(EQUIPES.filter((e) => e.modalidade === "Artística").length, 72);
  assert.equal(EQUIPES.filter((e) => e.modalidade === "Resgate").length, 80);
  const chaves = EQUIPES.map((e) => e.modalidade + "|" + e.nome);
  assert.equal(new Set(chaves).size, chaves.length);
  assert.equal(buscarEquipe(art).nome, "BEEONIC");
  assert.equal(buscarEquipe("BEEONIC"), null);
});

test("descrição: até 30 palavras", () => {
  const p = (n) => Array.from({ length: n }, (_, i) => "p" + i).join(" ");
  assert.equal(contarPalavras("  uma   duas\ntrês "), 3);
  assert.equal(validarSugestao({ ...base, descricao: p(30) }).descricao.split(" ").length, 30);
  assert.throws(() => validarSugestao({ ...base, descricao: p(31) }), /30 palavras/);
  assert.throws(() => validarSugestao({ ...base, descricao: "   " }), /Descreva/);
});

test("valida título, categoria e equipe; aceita equipe do Resgate", () => {
  assert.throws(() => validarSugestao({ ...base, titulo: "ab" }), /título/);
  assert.throws(() => validarSugestao({ ...base, titulo: "x".repeat(81) }), /título/);
  assert.throws(() => validarSugestao({ ...base, categoria: "reclamacao" }), /sugestão ou um elogio/);
  assert.throws(() => validarSugestao({ ...base, equipe: "Artística|Fantasma" }), /equipe/);
  const r = validarSugestao({ ...base, categoria: "elogio", equipe: "Resgate|" + resgate.nome, titulo: "  Ótima   arbitragem " });
  assert.deepEqual([r.modalidade, r.equipe, r.titulo, r.categoria], ["Resgate", resgate.nome, "Ótima arbitragem", "elogio"]);
});

test("id da sugestão precisa ser inteiro positivo", () => {
  assert.equal(idValido("7"), 7);
  assert.throws(() => idValido("abc"), /inválida/);
  assert.throws(() => idValido(0), /inválida/);
});
