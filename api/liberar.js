// POST /api/liberar  { nivel, dia, slot, equipe, senha }  (só a coordenação)
import { validar, erro } from "../lib/regras.js";
import { comBanco, emTransacao, listarReservas } from "../lib/db.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    const reservas = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        await client.query(
          "DELETE FROM reservas WHERE nivel = $1 AND dia = $2 AND slot = $3 AND equipe = $4",
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
