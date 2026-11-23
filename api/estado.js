// GET /api/estado?nivel=1&dia=2026-11-24
import { validar } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { carregarDia, montarEstado } from "../lib/grade.js";
import { responderErro } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ erro: "Use GET." });
  try {
    const p = validar(req.query);
    const ctx = await comBanco((pool) => carregarDia(pool, p.nivel, p.dia));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(montarEstado(ctx));
  } catch (e) {
    responderErro(res, e);
  }
}
