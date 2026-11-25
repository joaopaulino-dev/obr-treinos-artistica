// POST /api/sugestoes-admin  { senha, acao, ... }  (só a coordenação)
//   entrar | listar (inclui ocultas) | ocultar { id, oculta } | apagar { id }
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { idValido, listarSugestoes } from "../lib/sugestoes.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    if (b.acao === "entrar") return res.status(200).json({ ok: true });
    const lista = await comBanco(async (pool) => {
      if (b.acao === "ocultar") {
        await pool.query("UPDATE sugestoes SET oculta = $2 WHERE id = $1", [idValido(b.id), b.oculta === true]);
      } else if (b.acao === "apagar") {
        await pool.query("DELETE FROM sugestoes WHERE id = $1", [idValido(b.id)]);
      } else if (b.acao !== "listar") {
        throw erro(400, "Ação desconhecida.");
      }
      return listarSugestoes(pool, { incluirOcultas: true });
    });
    res.status(200).json({ sugestoes: lista });
  } catch (e) {
    responderErro(res, e);
  }
}
