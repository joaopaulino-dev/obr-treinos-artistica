// POST /api/desafio  { acao, token?, ... }  Desafio Técnico · Resgate
//   entrar      { login, senha }                         → token, nome, papel (juiz | admin)
//   estado      { token }                                times do Resgate e rounds já pontuados (resumo)
//   registrar   { token, equipe, nivel, arena, round, dados, envio }   grava um round (no-show = dados.noShow)
//   painel      { token }  admin                         todos os rounds com detalhes + juízes
//   apagar      { token, id }  admin                     apaga um round (para o juiz pontuar de novo)
//   juizAdd     { token, login, nome, senha }  admin     cadastra juiz
//   juizDel     { token, login }  admin                  remove juiz cadastrado na página
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";
import {
  entrar, lerSessao, registrarRound, listarRounds, listarJuizes, adicionarJuiz, normLogin, EQUIPES_RESGATE,
} from "../lib/desafio.js";

const resumo = (r) => ({ id: r.id, equipe: r.equipe, nivel: r.nivel, round: r.round, arena: r.arena, noShow: r.noShow, pontos: r.pontos, juizNome: r.juizNome, criadoEm: r.criadoEm });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    const acao = String(b.acao || "");
    const out = await comBanco(async (pool) => {
      if (acao === "entrar") return entrar(pool, b.login, b.senha);

      const eu = await lerSessao(pool, b.token, !["estado", "registrar"].includes(acao));
      if (acao === "estado") {
        return { eu, equipes: EQUIPES_RESGATE, rounds: (await listarRounds(pool)).map(resumo) };
      }
      if (acao === "registrar") {
        const r = await registrarRound(pool, b, eu, origemDe(req));
        return { ok: true, ...r, rounds: (await listarRounds(pool)).map(resumo) };
      }
      if (acao === "painel") {
        return { eu, equipes: EQUIPES_RESGATE, rounds: await listarRounds(pool), juizes: await listarJuizes(pool) };
      }
      if (acao === "apagar") {
        const id = Number(b.id);
        if (!Number.isInteger(id)) throw erro(400, "Round inválido.");
        const { rowCount } = await pool.query("DELETE FROM dt_rounds WHERE id = $1", [id]);
        if (!rowCount) throw erro(404, "Esse round já tinha sido apagado.");
        return { ok: true };
      }
      if (acao === "juizAdd") {
        await adicionarJuiz(pool, b);
        return { ok: true, juizes: await listarJuizes(pool) };
      }
      if (acao === "juizDel") {
        await pool.query("DELETE FROM dt_juizes WHERE login = $1", [normLogin(b.login)]);
        return { ok: true, juizes: await listarJuizes(pool) };
      }
      throw erro(400, "Ação desconhecida.");
    });
    res.status(200).json(out);
  } catch (e) {
    responderErro(res, e);
  }
}
