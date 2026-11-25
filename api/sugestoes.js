// GET  /api/sugestoes                                              sugestões visíveis + lista de equipes
// POST /api/sugestoes  { acao: "criar", titulo, descricao, categoria, equipe }
// POST /api/sugestoes  { acao: "votar" | "desvotar", id, equipe }  (equipe = "Modalidade|Nome")
import { erro } from "../lib/regras.js";
import { comBanco, emTransacaoChave } from "../lib/db.js";
import { validarSugestao, equipeOuErro, idValido, listarSugestoes, listaEquipes, VOTOS_POR_EQUIPE, PALAVRAS_MAX } from "../lib/sugestoes.js";
import { responderErro, corpo, origemDe } from "../lib/http.js";

const resposta = (sugestoes) => ({ sugestoes, equipes: listaEquipes(), votosPorEquipe: VOTOS_POR_EQUIPE, palavrasMax: PALAVRAS_MAX });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return res.status(200).json(resposta(await comBanco((pool) => listarSugestoes(pool))));
    if (req.method !== "POST") return res.status(405).json({ erro: "Use GET ou POST." });
    const b = corpo(req);

    if (b.acao === "criar") {
      const s = validarSugestao(b);
      const lista = await comBanco(async (pool) => {
        await pool.query(
          "INSERT INTO sugestoes (titulo, descricao, categoria, modalidade, equipe, origem) VALUES ($1, $2, $3, $4, $5, $6)",
          [s.titulo, s.descricao, s.categoria, s.modalidade, s.equipe, origemDe(req)],
        );
        return listarSugestoes(pool);
      });
      return res.status(200).json(resposta(lista));
    }

    if (b.acao === "votar" || b.acao === "desvotar") {
      const id = idValido(b.id);
      const e = equipeOuErro(b.equipe);
      const lista = await comBanco((pool) =>
        emTransacaoChave(pool, `voto:${e.modalidade}|${e.nome}`, async (client) => {
          if (b.acao === "desvotar") {
            await client.query("DELETE FROM sugestoes_votos WHERE sugestao_id = $1 AND modalidade = $2 AND equipe = $3", [id, e.modalidade, e.nome]);
            return listarSugestoes(client);
          }
          const s = await client.query("SELECT modalidade, equipe, oculta FROM sugestoes WHERE id = $1", [id]);
          if (!s.rows.length || s.rows[0].oculta) throw erro(409, "Essa sugestão não está mais disponível.");
          if (s.rows[0].modalidade === e.modalidade && s.rows[0].equipe === e.nome) throw erro(409, "A equipe não pode votar na própria sugestão.");
          const usados = await client.query(
            // Votos em sugestões ocultas pela coordenação não contam no limite da equipe.
            `SELECT v.sugestao_id FROM sugestoes_votos v JOIN sugestoes s ON s.id = v.sugestao_id
             WHERE v.modalidade = $1 AND v.equipe = $2 AND NOT s.oculta`, [e.modalidade, e.nome]);
          const jaVotou = usados.rows.some((r) => Number(r.sugestao_id) === id);
          if (!jaVotou && usados.rows.length >= VOTOS_POR_EQUIPE) {
            throw erro(409, `Sua equipe já usou os ${VOTOS_POR_EQUIPE} votos. Retire um voto para votar em outra.`);
          }
          await client.query(
            "INSERT INTO sugestoes_votos (sugestao_id, modalidade, equipe) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, e.modalidade, e.nome]);
          return listarSugestoes(client);
        }),
      );
      return res.status(200).json(resposta(lista));
    }

    throw erro(400, "Ação desconhecida.");
  } catch (e) {
    responderErro(res, e);
  }
}
