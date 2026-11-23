import { timingSafeEqual } from "node:crypto";

export function responderErro(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  res.status(status).json({ erro: status >= 500 ? "Erro no servidor. Tente de novo em instantes." : e.message });
}

export function senhaConfere(senha) {
  const certa = Buffer.from(process.env.ADMIN_PASSWORD || "");
  const dada = Buffer.from(String(senha || ""));
  if (!certa.length || dada.length !== certa.length) return false;
  return timingSafeEqual(dada, certa);
}

export function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
