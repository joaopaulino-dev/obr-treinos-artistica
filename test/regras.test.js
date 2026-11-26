import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueio, validar } from "../lib/regras.js";
import { resolverGrade, limiteDe } from "../lib/grade.js";
import { agenda, rotulo, somarDias } from "../lib/dias.js";

const r = (slot, equipe) => ({ slot, equipe });
const linha = (o = {}) => ({ por_slot: 1, creditos_base: null, inicio_min: 480, fim_min: 1080, ...o });
const ctx = (reservas = [], { grade = null, extras = {} } = {}) => ({ grade: resolverGrade(1, grade), extras, reservas });
const S = 48; // 08:00 em slots de 10 min

test("grade padrão: 08:00 às 18:00, 60 slots de 10 min, 1 equipe por slot, 1 crédito", () => {
  const g = resolverGrade(1, null);
  assert.equal(g.duracaoMin, 10);
  assert.equal(g.porSlot, 1);
  assert.equal(g.primeiro, 48);
  assert.equal(g.ultimo, 107);
  assert.equal(g.nSlots, 60);
  assert.equal(g.creditosAuto, 1); // floor(60 × 1 ÷ 36)
  assert.equal(g.creditos, 1);
});

test("créditos fixos para todas as equipes e extras por equipe", () => {
  const c = ctx([], { grade: linha({ creditos_base: 2 }), extras: { A: 1 } });
  assert.equal(limiteDe(c, "A"), 3);
  assert.equal(limiteDe(c, "B"), 2);
  assert.equal(resolverGrade(1, linha({ por_slot: 2 })).creditos, 3); // floor(60 × 2 ÷ 36)
});

test("permite reserva válida", () => {
  assert.equal(motivoBloqueio(ctx(), "BEEONIC", S), null);
});

test("bloqueia fora da grade", () => {
  assert.equal(motivoBloqueio(ctx(), "A", S - 1), "Horário fora da grade do dia");
  assert.equal(motivoBloqueio(ctx(), "A", 108), "Horário fora da grade do dia");
});

test("uma equipe por slot; a coordenação pode aumentar", () => {
  assert.equal(motivoBloqueio(ctx([r(S, "A")]), "B", S), "Horário lotado");
  assert.equal(motivoBloqueio(ctx([r(S, "A")]), "B", S, { forcar: true }), "Horário lotado");
  assert.equal(motivoBloqueio(ctx([r(S, "A")], { grade: linha({ por_slot: 2 }) }), "B", S), null);
});

test("bloqueia equipe repetida no mesmo slot, mesmo forçando", () => {
  const dois = { grade: linha({ por_slot: 2 }) };
  assert.equal(motivoBloqueio(ctx([r(S, "A")], dois), "A", S, { forcar: true }), "A equipe já está neste horário");
});

test("bloqueia créditos esgotados, exceto com extras ou forçando", () => {
  const rs = [r(S, "A")];
  assert.equal(motivoBloqueio(ctx(rs), "A", S + 10), "Créditos do dia esgotados");
  assert.equal(motivoBloqueio(ctx(rs, { extras: { A: 1 } }), "A", S + 10), null);
  assert.equal(motivoBloqueio(ctx(rs), "A", S + 10, { forcar: true }), null);
});

test("bloqueia slots seguidos antes e depois, exceto forçando", () => {
  const mais = { extras: { A: 2 } };
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")], mais), "A", S + 6), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")], mais), "A", S + 4), "Não vale reservar dois slots seguidos");
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")], mais), "A", S + 7), null);
  assert.equal(motivoBloqueio(ctx([r(S + 5, "A")], mais), "A", S + 6, { forcar: true }), null);
});

test("valida nível, dia, slot e equipe", () => {
  assert.throws(() => validar({ nivel: 3 }), /Nível inválido/);
  assert.throws(() => validar({ nivel: 1, dia: "2026-02-30" }), /Dia inválido/);
  assert.equal(validar({ nivel: 1, dia: "2026-11-25" }).dia, "2026-11-25");
  assert.throws(() => validar({ nivel: 1, slot: 144 }, { exigeSlot: true }), /Horário inválido/);
  assert.equal(validar({ nivel: 1, slot: 143 }, { exigeSlot: true }).slot, 143);
  assert.throws(() => validar({ nivel: 1, slot: S, equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }), /Equipe não encontrada/);
  assert.equal(validar({ nivel: "2", slot: "60", equipe: "The Tchukas" }, { exigeSlot: true, exigeEquipe: true }).slot, 60);
});

test("dia ativo: até 18h vale hoje, depois vale amanhã (horário de João Pessoa, UTC−3)", () => {
  const manha = agenda(new Date("2026-11-24T10:00:00-03:00"));
  assert.equal(manha.hoje, "2026-11-24");
  assert.equal(manha.ativo, "2026-11-24");
  assert.equal(manha.agoraMin, 600);
  const noite = agenda(new Date("2026-11-24T18:00:00-03:00"));
  assert.equal(noite.ativo, "2026-11-25");
  const virada = agenda(new Date("2026-11-30T23:30:00-03:00"));
  assert.equal(virada.amanha, "2026-12-01");
  assert.equal(rotulo("2026-11-24"), "Ter 24/11");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
});

test("hoje: bloqueia só horários que já terminaram; livre em andamento pode, e forçando sempre", () => {
  const c = { ...ctx(), agoraMin: 605 }; // 10:05
  assert.equal(motivoBloqueio(c, "A", 59), "Esse horário já passou"); // 09:50–10:00
  assert.equal(motivoBloqueio(c, "A", 60), null); // 10:00–10:10, em andamento
  assert.equal(motivoBloqueio({ ...c, agoraMin: 600 }, "A", 59), "Esse horário já passou"); // terminou às 10:00
  assert.equal(motivoBloqueio(c, "A", 59, { forcar: true }), null);
});

test("cancelamento pela equipe: só a própria reserva e até 15 min antes", async () => {
  const { motivoCancelamento } = await import("../lib/regras.js");
  const base = { ...ctx([r(S + 6, "A")]) }; // treino às 09:00
  assert.equal(motivoCancelamento(base, "A", S + 6), null); // outro dia: sempre pode
  assert.equal(motivoCancelamento(base, "B", S + 6), "Essa reserva não existe mais");
  assert.equal(motivoCancelamento({ ...base, agoraMin: 9 * 60 - 15 }, "A", S + 6), null); // 08:45
  assert.match(motivoCancelamento({ ...base, agoraMin: 9 * 60 - 14 }, "A", S + 6), /15 minutos/); // 08:46
  assert.match(motivoCancelamento({ ...base, agoraMin: 9 * 60 + 5 }, "A", S + 6), /15 minutos/); // já começou
});
