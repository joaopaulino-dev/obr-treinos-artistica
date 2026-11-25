// POST /api/voluntarios  { acao, ... }
//   entrar   { nome, senha }               nome + senha dos voluntários → token + estado
//   estado   { token }                     escala, vales, check-in de hoje, contatos
//   checkin  { token, lat, lng, precisao } check-in do dia, só perto do Centro de Convenções
//   vale     { token }                     consome o vale almoço de hoje (uma vez)
//   painel   { token, dia?, op?, voluntario? }  só voluntário admin: check-ins e almoços do dia
//            op = liberarVale | apagarCheckin
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { acharVoluntario, emitirToken, lerToken, avaliarPosicao, diaDoEvento, estadoVoluntario, acaoPainel } from "../lib/voluntarios.js";
import { agoraNoFuso } from "../lib/dias.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    const acao = String(b.acao || "");

    if (acao === "entrar") {
      const v = acharVoluntario(b.nome, b.senha);
      const estado = await comBanco((pool) => estadoVoluntario(pool, v));
      return res.status(200).json({ token: emitirToken(v), ...estado });
    }

    const v = lerToken(b.token);
    if (acao === "estado") {
      return res.status(200).json(await comBanco((pool) => estadoVoluntario(pool, v)));
    }

    if (acao === "checkin") {
      const dia = diaDoEvento();
      if (!dia) throw erro(409, "Hoje não é dia de evento. O check-in abre nos dias da OBR.");
      const pos = avaliarPosicao(b);
      const estado = await comBanco(async (pool) => {
        await pool.query(
          "INSERT INTO vol_checkins (voluntario, dia, distancia_m, precisao_m, origem) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (voluntario, dia) DO NOTHING",
          [v.id, dia, pos.distancia, pos.precisao, origemDe(req)],
        );
        return estadoVoluntario(pool, v);
      });
      return res.status(200).json(estado);
    }

    if (acao === "vale") {
      const dia = diaDoEvento();
      if (!dia) throw erro(409, "Hoje não é dia de evento, então não há vale almoço.");
      const estado = await comBanco(async (pool) => {
        const r = await pool.query(
          "INSERT INTO vol_vales (voluntario, dia, origem) VALUES ($1, $2, $3) ON CONFLICT (voluntario, dia) DO NOTHING",
          [v.id, dia, origemDe(req)],
        );
        const e = await estadoVoluntario(pool, v);
        if (!r.rowCount) {
          const err = erro(409, "O vale de hoje já foi usado.");
          err.estado = e;
          throw err;
        }
        return e;
      });
      return res.status(200).json(estado);
    }

    if (acao === "painel") {
      if (!v.admin) throw erro(403, "Só a coordenação vê o painel.");
      const op = ["liberarVale", "apagarCheckin"].includes(b.op) ? b.op : "listar";
      return res.status(200).json(await comBanco((pool) => acaoPainel(pool, op, b, agoraNoFuso().id)));
    }

    throw erro(400, "Ação desconhecida.");
  } catch (e) {
    if (e.estado) return res.status(e.status).json({ erro: e.message, ...e.estado });
    responderErro(res, e);
  }
}
