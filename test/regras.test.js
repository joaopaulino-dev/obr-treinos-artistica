import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, validar } from "../lib/regras.js";
import { creditos } from "../lib/config.js";

const r = (slot, equipe) => ({ slot, equipe });

test("36 equipes em 120 vagas dão 3 créditos", () => {
  assert.equal(creditos(1), 3);
  assert.equal(creditos(2), 3);
});

test("permite reserva válida", () => {
  assert.equal(motivoBloqueio([], "BEEONIC", 0, 3), null);
});

test("bloqueia slot lotado", () => {
  const rs = [r(5, "A"), r(5, "B"), r(5, "C")];
  assert.equal(motivoBloqueio(rs, "D", 5, 3), "Horário lotado");
});

test("bloqueia equipe repetida no mesmo slot", () => {
  assert.equal(motivoBloqueio([r(5, "A")], "A", 5, 3), "A equipe já está neste horário");
});

test("bloqueia créditos esgotados", () => {
  const rs = [r(0, "A"), r(10, "A"), r(20, "A")];
  assert.equal(motivoBloqueio(rs, "A", 30, 3), "Créditos do dia esgotados");
});

test("bloqueia slots seguidos antes e depois", () => {
  assert.equal(motivoBloqueio([r(5, "A")], "A", 6, 3), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio([r(5, "A")], "A", 4, 3), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio([r(5, "A")], "A", 7, 3), null);
});

test("valida nível, dia, slot e equipe", () => {
  assert.throws(() => validar({ nivel: 3 }), /Nível inválido/);
  assert.throws(() => validar({ nivel: 1, dia: "2026-12-01" }), /Dia não liberado/);
  assert.throws(() => validar({ nivel: 1, slot: 40 }, { exigeSlot: true }), /Horário inválido/);
  assert.throws(() => validar({ nivel: 1, slot: 0, equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }), /Equipe não encontrada/);
  assert.equal(validar({ nivel: "2", slot: "3", equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }).equipe, "The Tchukas");
});
