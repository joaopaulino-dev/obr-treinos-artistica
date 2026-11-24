// POST /api/reservar  { nivel, dia, slot, equipe }  (equipes, com todas as regras)
import { validar, motivoBloqueio, erro } from "../lib/regras.js";
import { comBanco, emTransacao } from "../lib/db.js";
import { agenda, rotulo } from "../lib/dias.js";
import { carregarDia, montarEstado } from "../lib/grade.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const p = validar(corpo(req), { exigeSlot: true, exigeEquipe: true });
    const ag = agenda();
    if (p.dia !== ag.ativo) {
      throw erro(409, p.dia === ag.amanha
        ? `As reservas para ${rotulo(ag.amanha)} abrem hoje às ${ag.aberturaHora}h.`
        : `No momento só é possível reservar para ${rotulo(ag.ativo)}.`);
    }
    const ctx = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        const atual = await carregarDia(client, p.nivel, p.dia);
        const motivo = motivoBloqueio(atual, p.equipe, p.slot);
        if (motivo) throw erro(409, `Não foi possível reservar: ${motivo.toLowerCase()}.`);
        await client.query(
          "INSERT INTO reservas (nivel, dia, slot, equipe, origem) VALUES ($1, $2, $3, $4, $5)",
          [p.nivel, p.dia, p.slot, p.equipe, origemDe(req)],
        );
        return carregarDia(client, p.nivel, p.dia);
      }),
    );
    res.status(200).json(montarEstado(ctx));
  } catch (e) {
    responderErro(res, e);
  }
}
