// POST /api/voluntarios-admin  { senha, acao, dia?, voluntario? }  (coordenação, ADMIN_PASSWORD)
//   listar | liberarVale | apagarCheckin   — mesmo painel que os voluntários admin veem em /voluntarios
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { agoraNoFuso } from "../lib/dias.js";
import { acaoPainel } from "../lib/voluntarios.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    if (!["listar", "entrar", "liberarVale", "apagarCheckin"].includes(b.acao)) throw erro(400, "Ação desconhecida.");
    res.status(200).json(await comBanco((pool) => acaoPainel(pool, b.acao, b, agoraNoFuso().id)));
  } catch (e) {
    responderErro(res, e);
  }
}
