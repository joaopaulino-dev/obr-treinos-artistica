// GET /api/estado?nivel=1&dia=2026-11-24
import { SLOTS, POR_SLOT, INICIO_MIN, DURACAO_MIN, DIAS, NIVEIS } from "../lib/config.js";
import { validar } from "../lib/regras.js";
import { comBanco, listarReservas } from "../lib/db.js";
import { responderErro } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ erro: "Use GET." });
  try {
    const p = validar(req.query);
    const reservas = await comBanco((pool) => listarReservas(pool, p.nivel, p.dia));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      nivel: p.nivel,
      palco: NIVEIS[p.nivel].palco,
      dia: p.dia,
      dias: DIAS,
      creditos: p.limite,
      slots: SLOTS,
      porSlot: POR_SLOT,
      inicioMin: INICIO_MIN,
      duracaoMin: DURACAO_MIN,
      equipes: NIVEIS[p.nivel].equipes,
      reservas,
    });
  } catch (e) {
    responderErro(res, e);
  }
}
