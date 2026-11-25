// POST /api/agenda  { senha, acao, nivel, dia, ... }  (acesso limitado de agendamento, N1 e N2)
//   entrar                                confere a senha
//   reservar  { slot, equipe, forcar }    cria uma reserva por uma equipe (forcar ignora créditos e slots seguidos)
// Não move nem remove reservas: isso continua só com a coordenação.
import { validar, motivoBloqueio, erro } from "../lib/regras.js";
import { comBanco, emTransacao } from "../lib/db.js";
import { agenda } from "../lib/dias.js";
import { carregarDia, montarEstado } from "../lib/grade.js";
import { responderErro, corpo, senhaConfere, senhaAgendaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaAgendaConfere(b.senha) && !senhaConfere(b.senha)) throw erro(401, "Senha do agendamento incorreta.");
    if (b.acao === "entrar") return res.status(200).json({ ok: true });
    if (b.acao !== "reservar") throw erro(400, "Ação não permitida no agendamento.");
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    const ag = agenda();
    if (p.dia !== ag.hoje && p.dia !== ag.amanha) throw erro(409, "O agendamento só vale para hoje ou amanhã.");
    const ctx = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        const atual = await carregarDia(client, p.nivel, p.dia);
        const motivo = motivoBloqueio(atual, p.equipe, p.slot, { forcar: b.forcar === true });
        if (motivo) throw erro(409, `Não foi possível reservar: ${motivo.toLowerCase()}.`);
        await client.query(
          "INSERT INTO reservas (nivel, dia, slot, equipe, origem) VALUES ($1, $2, $3, $4, 'agendamento')",
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
