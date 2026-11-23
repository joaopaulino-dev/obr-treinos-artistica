// POST /api/reservar  { nivel, dia, slot, equipe }  (equipes, com todas as regras)
import { validar, motivoBloqueio, erro } from "../lib/regras.js";
import { comBanco, emTransacao } from "../lib/db.js";
import { carregarDia, montarEstado } from "../lib/grade.js";
import { responderErro, corpo } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const p = validar(corpo(req), { exigeSlot: true, exigeEquipe: true });
    const ctx = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        const atual = await carregarDia(client, p.nivel, p.dia);
        const motivo = motivoBloqueio(atual, p.equipe, p.slot);
        if (motivo) throw erro(409, `Não foi possível reservar: ${motivo.toLowerCase()}.`);
        await client.query(
          "INSERT INTO reservas (nivel, dia, slot, equipe) VALUES ($1, $2, $3, $4)",
          [p.nivel, p.dia, p.slot, p.equipe],
        );
        return carregarDia(client, p.nivel, p.dia);
      }),
    );
    res.status(200).json(montarEstado(ctx));
  } catch (e) {
    responderErro(res, e);
  }
}
