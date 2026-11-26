// GET  /api/pontuacao                                             estado público (url só quando divulgada)
// POST /api/pontuacao { senha, acao: "listar" }                   estado completo (coordenação)
// POST /api/pontuacao { senha, acao: "liberar", modalidade, nivel, liberado }
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { carregarPontuacao, estadoPublico, validarLiberacao, gravarLiberacao } from "../lib/pontuacao.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return res.status(200).json(estadoPublico(await comBanco((pool) => carregarPontuacao(pool))));
    if (req.method !== "POST") return res.status(405).json({ erro: "Use GET ou POST." });
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    if (b.acao === "listar") return res.status(200).json(await comBanco((pool) => carregarPontuacao(pool)));
    if (b.acao !== "liberar") throw erro(400, "Ação desconhecida.");
    const p = validarLiberacao(b);
    const st = await comBanco(async (pool) => { await gravarLiberacao(pool, p); return carregarPontuacao(pool); });
    res.status(200).json(st);
  } catch (e) {
    responderErro(res, e);
  }
}
