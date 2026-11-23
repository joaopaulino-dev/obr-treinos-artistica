// POST /api/reservar  { nivel, dia, slot, equipe }
import { validar, motivoBloqueio, erro } from "../lib/regras.js";
import { comBanco, emTransacao, listarReservas } from "../lib/db.js";
import { responderErro, corpo } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const p = validar(corpo(req), { exigeSlot: true, exigeEquipe: true });
    const reservas = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        const atuais = await listarReservas(client, p.nivel, p.dia);
        const motivo = motivoBloqueio(atuais, p.equipe, p.slot, p.limite);
        if (motivo) throw erro(409, `Não foi possível reservar: ${motivo.toLowerCase()}.`);
        await client.query(
          "INSERT INTO reservas (nivel, dia, slot, equipe) VALUES ($1, $2, $3, $4)",
          [p.nivel, p.dia, p.slot, p.equipe],
        );
        return listarReservas(client, p.nivel, p.dia);
      }),
    );
    res.status(200).json({ ok: true, reservas });
  } catch (e) {
    responderErro(res, e);
  }
}
