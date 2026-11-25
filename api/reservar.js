// POST /api/reservar  { nivel, dia, slot, equipe }                 reserva (equipes, com todas as regras)
// POST /api/reservar  { acao: "cancelar", nivel, dia, slot, equipe } a equipe cancela o próprio treino
//   até CANCELA_ATE_MIN minutos antes; o crédito volta e o cancelamento fica registrado com o aparelho.
import { validar, motivoBloqueio, motivoCancelamento, erro } from "../lib/regras.js";
import { comBanco, emTransacao } from "../lib/db.js";
import { agenda, rotulo } from "../lib/dias.js";
import { carregarDia, montarEstado } from "../lib/grade.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";

async function reservar(req, p) {
  const ag = agenda();
  if (p.dia !== ag.ativo) {
    throw erro(409, p.dia === ag.amanha
      ? `As reservas para ${rotulo(ag.amanha)} abrem hoje às ${ag.aberturaHora}h.`
      : `No momento só é possível reservar para ${rotulo(ag.ativo)}.`);
  }
  return comBanco((pool) =>
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
}

async function cancelar(req, p) {
  const ag = agenda();
  if (p.dia !== ag.hoje && p.dia !== ag.amanha) throw erro(409, "Só dá para cancelar treinos de hoje ou de amanhã.");
  return comBanco((pool) =>
    emTransacao(pool, p.nivel, p.dia, async (client) => {
      const atual = await carregarDia(client, p.nivel, p.dia);
      const motivo = motivoCancelamento(atual, p.equipe, p.slot);
      if (motivo) throw erro(409, `Não foi possível cancelar: ${motivo.toLowerCase()}.`);
      const { rows } = await client.query(
        "DELETE FROM reservas WHERE nivel = $1 AND dia = $2 AND slot = $3 AND equipe = $4 RETURNING origem, criado_em",
        [p.nivel, p.dia, p.slot, p.equipe],
      );
      await client.query(
        `INSERT INTO cancelamentos (nivel, dia, slot, equipe, origem, origem_reserva, reservada_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.nivel, p.dia, p.slot, p.equipe, origemDe(req), rows[0]?.origem || null, rows[0]?.criado_em || null],
      );
      return carregarDia(client, p.nivel, p.dia);
    }),
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    const ctx = b.acao === "cancelar" ? await cancelar(req, p) : await reservar(req, p);
    res.status(200).json(montarEstado(ctx));
  } catch (e) {
    responderErro(res, e);
  }
}
