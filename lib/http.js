import { timingSafeEqual, createHash } from "node:crypto";

export function responderErro(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  res.status(status).json({ erro: status >= 500 ? "Erro no servidor. Tente de novo em instantes." : e.message });
}

export function senhaConfere(senha, variavel = "ADMIN_PASSWORD") {
  const certa = Buffer.from(process.env[variavel] || "");
  const dada = Buffer.from(String(senha || ""));
  if (!certa.length || dada.length !== certa.length) return false;
  return timingSafeEqual(dada, certa);
}

export function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

// Identificador anônimo do aparelho/rede: hash com sal de IP + navegador. O IP não é guardado.
export function origemDe(req) {
  const h = req.headers || {};
  const ip = String(h["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "";
  const ua = String(h["user-agent"] || "");
  const sal = process.env.HASH_SALT || process.env.ADMIN_PASSWORD || "obr";
  return createHash("sha256").update(`${sal}|${ip}|${ua}`).digest("hex").slice(0, 10);
}
