import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { calcular, ranking, normalizarRound, pontosPorLadrilho } from "../public/desafio/pontuacao.js";

const h = (senha, sal) => scryptSync(senha, sal, 32).toString("hex");
process.env.DT_SECRET = "teste";
process.env.DT_USUARIOS = JSON.stringify([
  { login: "joaocosta", nome: "João Costa", papel: "juiz", sal: "a1", hash: h("senha-de-teste", "a1") },
  { login: "joaocostaadmin", nome: "João Costa", papel: "admin", sal: "a2", hash: h("senha-de-teste", "a2") },
]);
const { entrar, lerSessao, registrarRound, EQUIPES_RESGATE } = await import("../lib/desafio.js");

// Banco falso: só o necessário para as consultas de lib/desafio.js.
function bancoFalso() {
  const rounds = [];
  return {
    rounds,
    async query(sql, p = []) {
      if (sql.includes("FROM dt_juizes")) return { rows: [] };
      if (sql.startsWith("INSERT INTO dt_rounds")) {
        if (rounds.some((r) => r.equipe === p[0] && r.round === p[2])) return { rows: [] };
        rounds.push({ id: rounds.length + 1, equipe: p[0], round: p[2], pontos: p[6], envio: p[11] });
        return { rows: [{ id: rounds.length }] };
      }
      if (sql.startsWith("SELECT id, envio, pontos FROM dt_rounds")) return { rows: rounds.filter((r) => r.equipe === p[0] && r.round === p[1]) };
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
}

test("pontos por ladrilho seguem a tentativa (5/3/1/0)", () => {
  assert.deepEqual([1, 2, 3, 4, 7].map(pontosPorLadrilho), [5, 3, 1, 0, 0]);
});

test("round completo: perigos + checkpoints + chegada, vezes multiplicadores", () => {
  const c = calcular({
    perigos: { gangorra: 1, intersecao: 2, obstaculo: 1, rampa: 2, gap: 1, lombada: 1, passagem: 3 },
    inicio: true,
    trechos: [{ ladrilhos: 6, tentativa: 1 }, { ladrilhos: 5, tentativa: 2 }, { ladrilhos: 4, tentativa: 3 }, { ladrilhos: 3, tentativa: 4 }, { ladrilhos: 8, tentativa: 3, pulado: true }],
    falhas: 5, chegada: true, vivas: 2, morta: true, tempoSeg: 412,
  });
  assert.equal(c.perigos, 20 + 40 + 20 + 20 + 10 + 10 + 0); // 120
  assert.equal(c.checkpoints, 5 + 30 + 15 + 4 + 0 + 0); // 54
  assert.equal(c.chegada, 35); // 60 − 5 × 5
  assert.equal(c.base, 209);
  assert.equal(c.total, Math.round(209 * 1.3 ** 3 * 100) / 100); // 459.17
});

test("chegada nunca negativa; morta só vale com as 2 vivas; no-show é zero", () => {
  assert.equal(calcular({ chegada: true, falhas: 30 }).chegada, 0);
  assert.equal(calcular({ vivas: 1, morta: true }).d.morta, false);
  assert.equal(calcular({ vivas: 5 }).d.vivas, 2);
  assert.equal(calcular({ noShow: true, perigos: { gangorra: 9 } }).total, 0);
  assert.equal(normalizarRound({ perigos: { gangorra: -3, xyz: 9 } }).perigos.gangorra, 0);
  assert.equal(normalizarRound({ perigos: { xyz: 9 } }).perigos.xyz, undefined);
});

test("ranking: melhor round vale; empate desempata pelo menor tempo", () => {
  const eq = [{ nome: "A", nivel: 1 }, { nome: "B", nivel: 1 }, { nome: "C", nivel: 1 }, { nome: "D", nivel: 2 }];
  const r = [
    { equipe: "A", nivel: 1, round: 1, pontos: 100, tempoSeg: 300 },
    { equipe: "A", nivel: 1, round: 2, pontos: 150, tempoSeg: 470 },
    { equipe: "B", nivel: 1, round: 1, pontos: 150, tempoSeg: 400 },
    { equipe: "B", nivel: 1, round: 2, pontos: 0, noShow: true, tempoSeg: 0 },
    { equipe: "D", nivel: 2, round: 1, pontos: 999, tempoSeg: 10 },
  ];
  const l = ranking(r, eq, 1);
  assert.deepEqual(l.map((x) => [x.equipe, x.posicao, x.melhor]), [["B", 1, 150], ["A", 2, 150], ["C", null, null]]);
});

test("login do juiz e do admin, sessão assinada", async () => {
  const q = bancoFalso();
  const j = await entrar(q, "JoaoCosta", "senha-de-teste");
  assert.equal(j.papel, "juiz");
  const a = await entrar(q, "joaocostaadmin", "senha-de-teste");
  assert.equal(a.papel, "admin");
  await assert.rejects(entrar(q, "joaocosta", "errada"), /incorretos/);
  assert.equal((await lerSessao(q, j.token)).login, "joaocosta");
  await assert.rejects(lerSessao(q, j.token, true), /admin/);
  await assert.rejects(lerSessao(q, j.token.replace(/.$/, "x")), /Sessão/);
  await assert.rejects(lerSessao(q, j.token.replace("juiz.", "admin.")), /Sessão/);
});

test("registrar: só times do Resgate, nível certo, 1 vez por round; reenvio do mesmo aparelho é aceito", async () => {
  const q = bancoFalso();
  const juiz = { login: "joaocosta", nome: "João Costa" };
  const t = EQUIPES_RESGATE.find((e) => e.nivel === 1);
  assert.equal(EQUIPES_RESGATE.length, 80);
  await assert.rejects(registrarRound(q, { equipe: "Alfa Robóticos - Artística", nivel: 1, round: 1, arena: 1, dados: {} }, juiz), /Resgate/);
  await assert.rejects(registrarRound(q, { equipe: t.nome, nivel: 2, round: 1, arena: 1, dados: {} }, juiz), /Nível 1/);
  await assert.rejects(registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 7, dados: {} }, juiz), /arena/);
  const ok = await registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x1", dados: { perigos: { gangorra: 2 } } }, juiz);
  assert.equal(ok.pontos, 40);
  assert.equal((await registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x1", dados: {} }, juiz)).repetido, true);
  await assert.rejects(registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x2", dados: {} }, juiz), /já foi pontuado/);
});
