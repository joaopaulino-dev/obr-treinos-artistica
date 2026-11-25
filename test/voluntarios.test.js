import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";

const h = (senha, sal) => scryptSync(senha, sal, 32).toString("hex");
process.env.VOL_SECRET = "teste";
process.env.VOL_LISTA = JSON.stringify({
  voluntarios: [
    { id: "joao-a", nome: "João Costa", login: "joaocosta", sal: "s1", hash: h("111111", "s1"), categoria: "Artística", admin: true },
    { id: "joao-b", nome: "João Lima", login: "joaolima", sal: "s2", hash: h("222222", "s2"), categoria: "Resgate" },
    { id: "dino", nome: "Dino Fotógrafo", login: "dinofotografo", sal: "s3", hash: h("000000", "s3") },
  ],
  contatos: [{ categoria: "Resgate", nome: "Fulana", telefone: "5583900000009" }],
});
const { acharVoluntario, emitirToken, lerToken, avaliarPosicao, distanciaM, diaDoEvento, LOCAL, contatos, voluntarioPorId } = await import("../lib/voluntarios.js");

test("login = primeironomeultimonome; senha = 6 dígitos do CPF", () => {
  assert.equal(acharVoluntario("joaocosta", "111111").id, "joao-a");
  assert.equal(acharVoluntario("JoãoLima", "222222").id, "joao-b");
  assert.equal(acharVoluntario(" joao costa ", "111.111").id, "joao-a");
  assert.equal(acharVoluntario("dinofotografo", "000000").id, "dino");
  assert.throws(() => acharVoluntario("joaocosta", "222222"), /Senha incorreta/);
  assert.throws(() => acharVoluntario("joao", "111111"), /Login não encontrado/);
  assert.throws(() => acharVoluntario("", "123456"), /login/);
});

test("categoria padrão, admin e contatos vêm da VOL_LISTA", () => {
  assert.equal(voluntarioPorId("dino").categoria, "Geral");
  assert.equal(voluntarioPorId("dino").admin, false);
  assert.equal(voluntarioPorId("joao-a").admin, true);
  assert.deepEqual(contatos(), { lista: [{ categoria: "Resgate", nome: "Fulana", telefone: "5583900000009" }], exemplo: false });
});

test("token assinado; adulterado é recusado", () => {
  const t = emitirToken(acharVoluntario("joaocosta", "111111"));
  assert.equal(lerToken(t).id, "joao-a");
  assert.throws(() => lerToken(t.replace("joao-a", "joao-b")), /Sessão/);
  assert.throws(() => lerToken("lixo"), /Sessão/);
});

test("check-in só perto do Centro de Convenções", () => {
  assert.deepEqual(avaliarPosicao({ lat: LOCAL.lat, lng: LOCAL.lng, precisao: 20 }), { distancia: 0, precisao: 20 });
  assert.ok(avaliarPosicao({ lat: -7.1867471, lng: -34.8050975, precisao: 30 }).distancia < 400);
  assert.throws(() => avaliarPosicao({ lat: -7.1195, lng: -34.845, precisao: 30 }), /km do Centro/);
  assert.throws(() => avaliarPosicao({ lat: -7.1195, lng: -34.845, precisao: 9000 }), /km/);
  assert.throws(() => avaliarPosicao({}), /localização/);
});

test("distância e dias do evento", () => {
  assert.ok(Math.abs(distanciaM(0, 0, 0, 1) - 111195) < 50);
  assert.equal(diaDoEvento(new Date("2026-11-25T15:00:00Z")), "2026-11-25");
  assert.equal(diaDoEvento(new Date("2026-11-29T15:00:00Z")), null);
  assert.equal(diaDoEvento(new Date("2026-11-25T02:00:00Z")), "2026-11-24");
});
