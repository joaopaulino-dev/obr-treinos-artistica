// POST /api/coordenacao  { senha }  -> confere a senha antes de liberar o modo coordenação
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    if (!senhaConfere(corpo(req).senha)) return res.status(401).json({ erro: "Senha da coordenação incorreta." });
    res.status(200).json({ ok: true });
  } catch (e) {
    responderErro(res, e);
  }
}
