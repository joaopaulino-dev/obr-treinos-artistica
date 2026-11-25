import { test } from "node:test";
import assert from "node:assert/strict";
process.env.VOL_SECRET = "teste";
const { acharVoluntario, emitirToken, lerToken, avaliarPosicao, distanciaM, diaDoEvento, LOCAL } = await import("../lib/voluntarios.js");

test("entrada por primeiro e último nome, sem acento e sem caixa", () => {
  assert.equal(acharVoluntario("joao costa").id, "joao-costa");
  assert.equal(acharVoluntario("  JOÃO   da Silva Costa ").id, "joao-costa");
  assert.throws(() => acharVoluntario("João"), /primeiro e o último/);
  assert.throws(() => acharVoluntario("João Ninguém"), /não encontrado/);
});

test("token assinado; adulterado é recusado", () => {
  const t = emitirToken(acharVoluntario("João Costa"));
  assert.equal(lerToken(t).id, "joao-costa");
  assert.throws(() => lerToken(t.replace("joao-costa", "jp")), /Sessão/);
  assert.throws(() => lerToken("lixo"), /Sessão/);
});

test("check-in só perto do Centro de Convenções", () => {
  assert.deepEqual(avaliarPosicao({ lat: LOCAL.lat, lng: LOCAL.lng, precisao: 20 }), { distancia: 0, precisao: 20 });
  // estacionamento norte (~250 m)
  assert.ok(avaliarPosicao({ lat: -7.1867471, lng: -34.8050975, precisao: 30 }).distancia < 400);
  // centro de João Pessoa (~7 km)
  assert.throws(() => avaliarPosicao({ lat: -7.1195, lng: -34.845, precisao: 30 }), /km do Centro/);
  // GPS impreciso não vira passe livre: folga máxima de 150 m
  assert.throws(() => avaliarPosicao({ lat: -7.1195, lng: -34.845, precisao: 9000 }), /km/);
  assert.throws(() => avaliarPosicao({}), /localização/);
});

test("distância e dias do evento", () => {
  assert.ok(Math.abs(distanciaM(0, 0, 0, 1) - 111195) < 50);
  assert.equal(diaDoEvento(new Date("2026-11-25T15:00:00Z")), "2026-11-25");
  assert.equal(diaDoEvento(new Date("2026-11-29T15:00:00Z")), null);
  assert.equal(diaDoEvento(new Date("2026-11-25T02:00:00Z")), "2026-11-24"); // 23h em Fortaleza
});
