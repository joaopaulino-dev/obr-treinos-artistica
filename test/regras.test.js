import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, validar } from "../lib/regras.js";
import { resolverGrade, limiteDe } from "../lib/grade.js";

const r = (slot, equipe) => ({ slot, equipe });
const ctx = (reservas = [], { linha = null, extras = {} } = {}) => ({ grade: resolverGrade(1, linha), extras, reservas });
const S = 32; // 08:00

test("grade padrão: 08:00 às 18:00, 40 slots, 3 créditos", () => {
  const g = resolverGrade(1, null);
  assert.equal(g.primeiro, 32);
  assert.equal(g.ultimo, 71);
  assert.equal(g.nSlots, 40);
  assert.equal(g.creditos, 3);
  assert.equal(g.creditosBase, null);
});

test("créditos base e extras", () => {
  const c = ctx([], { linha: { por_slot: 3, creditos_base: 5, inicio_min: 480, fim_min: 1080 }, extras: { A: 2 } });
  assert.equal(limiteDe(c, "A"), 7);
  assert.equal(limiteDe(c, "B"), 5);
  const auto4 = resolverGrade(1, { por_slot: 4, creditos_base: null, inicio_min: 480, fim_min: 1080 });
  assert.equal(auto4.creditos, 4); // 40 × 4 ÷ 36
});

test("permite reserva válida", () => {
  assert.equal(motivoBloqueio(ctx(), "BEEONIC", S), null);
});

test("bloqueia fora da grade", () => {
  assert.equal(motivoBloqueio(ctx(), "A", S - 1), "Horário fora da grade do dia");
  assert.equal(motivoBloqueio(ctx(), "A", 72), "Horário fora da grade do dia");
});

test("bloqueia slot lotado e respeita por_slot", () => {
  const rs = [r(S, "A"), r(S, "B"), r(S, "C")];
  assert.equal(motivoBloqueio(ctx(rs), "D", S), "Horário lotado");
  const quatro = ctx(rs, { linha: { por_slot: 4, creditos_base: null, inicio_min: 480, fim_min: 1080 } });
  assert.equal(motivoBloqueio(quatro, "D", S), null);
});

test("bloqueia equipe repetida no mesmo slot, mesmo forçando", () => {
  assert.equal(motivoBloqueio(ctx([r(S, "A")]), "A", S, { forcar: true }), "A equipe já está neste horário");
});

test("bloqueia créditos esgotados, exceto com extras ou forçando", () => {
  const rs = [r(S, "A"), r(S + 10, "A"), r(S + 20, "A")];
  assert.equal(motivoBloqueio(ctx(rs), "A", S + 30), "Créditos do dia esgotados");
  assert.equal(motivoBloqueio(ctx(rs, { extras: { A: 1 } }), "A", S + 30), null);
  assert.equal(motivoBloqueio(ctx(rs), "A", S + 30, { forcar: true }), null);
});

test("bloqueia slots seguidos antes e depois, exceto forçando", () => {
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")]), "A", S + 6), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")]), "A", S + 4), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")]), "A", S + 7), null);
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")]), "A", S + 6, { forcar: true }), null);
});

test("valida nível, dia, slot e equipe", () => {
  assert.throws(() => validar({ nivel: 3 }), /Nível inválido/);
  assert.throws(() => validar({ nivel: 1, dia: "2026-12-01" }), /Dia não liberado/);
  assert.throws(() => validar({ nivel: 1, slot: 96 }, { exigeSlot: true }), /Horário inválido/);
  assert.throws(() => validar({ nivel: 1, slot: S, equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }), /Equipe não encontrada/);
  assert.equal(validar({ nivel: "2", slot: "40", equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }).slot, 40);
});
