// GET  /api/superteams                          estado público (aberto, total, lista de equipes, times publicados)
// POST /api/superteams  { equipe, integrantes } demonstra interesse (uma vez por equipe)
import { erro } from "../lib/regras.js";
import { comBanco, emTransacaoChave } from "../lib/db.js";
import { validarInscricao, carregarSuperTeams, estadoPublico } from "../lib/superteams.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const st = await comBanco((pool) => carregarSuperTeams(pool));
      return res.status(200).json(estadoPublico(st));
    }
    if (req.method !== "POST") return res.status(405).json({ erro: "Use GET ou POST." });

    const p = validarInscricao(corpo(req));
    const st = await comBanco((pool) =>
      emTransacaoChave(pool, "superteams", async (client) => {
        const atual = await carregarSuperTeams(client);
        if (!atual.aberto) throw erro(409, "As inscrições para o Super Teams estão encerradas.");
        const r = await client.query(
          "INSERT INTO superteams (equipe, nivel, integrantes, origem) VALUES ($1, $2, $3, $4) ON CONFLICT (equipe) DO NOTHING",
          [p.equipe, p.nivel, p.integrantes, origemDe(req)],
        );
        if (!r.rowCount) throw erro(409, `A equipe ${p.equipe} já demonstrou interesse. Não precisa enviar de novo.`);
        return carregarSuperTeams(client);
      }),
    );
    res.status(200).json({ ...estadoPublico(st), inscrita: p.equipe });
  } catch (e) {
    responderErro(res, e);
  }
}
