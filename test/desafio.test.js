import { test } from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { calcular, ranking, normalizarRound, TEMPO_ROUND_SEG } from "../public/desafio/pontuacao.js";

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

test("desafio técnico: soma simples dos itens (quantidade × 40, sim/não 40 ou 60)", () => {
  const c = calcular({ itens: { intersecao: 3, obstaculo: 2, fitaVermelha: true, fitaPrata: true, vitima: true, posse: true, prataComVitima: true }, tempoSeg: 200 });
  assert.equal(c.total, 3 * 40 + 2 * 40 + 40 + 40 + 40 + 40 + 60); // 420
  assert.equal(calcular({ itens: { intersecao: 1, posse: true } }).total, 80);
  assert.equal(calcular({}).total, 0);
  assert.equal(TEMPO_ROUND_SEG, 240);
});

test("normaliza: sim/não só com true, quantidade sem negativo, campos estranhos somem; no-show é zero", () => {
  const d = normalizarRound({ itens: { intersecao: -2, obstaculo: "4", vitima: "sim", xyz: 9 }, perigos: { gangorra: 3 } });
  assert.deepEqual(d.itens, { intersecao: 0, obstaculo: 4, fitaVermelha: false, fitaPrata: false, vitima: false, posse: false, prataComVitima: false });
  assert.equal(d.perigos, undefined);
  assert.equal(calcular({ noShow: true, itens: { intersecao: 5, posse: true } }).total, 0);
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
  const ok = await registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x1", dados: { itens: { intersecao: 2, posse: true } } }, juiz);
  assert.equal(ok.pontos, 120);
  assert.equal((await registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x1", dados: {} }, juiz)).repetido, true);
  await assert.rejects(registrarRound(q, { equipe: t.nome, nivel: 1, round: 1, arena: 3, envio: "x2", dados: {} }, juiz), /já foi pontuado/);
});
