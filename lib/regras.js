import { SLOTS, POR_SLOT, DIAS, NIVEIS, creditos } from "./config.js";

// reservas: [{ slot, equipe }] do nível e dia em questão.
// Devolve o motivo do bloqueio, ou null se a reserva é permitida.
export function motivoBloqueio(reservas, equipe, slot, limite) {
  const naquele = reservas.filter((r) => r.slot === slot);
  if (naquele.length >= POR_SLOT) return "Horário lotado";
  if (naquele.some((r) => r.equipe === equipe)) return "A equipe já está neste horário";
  const usados = reservas.filter((r) => r.equipe === equipe).length;
  if (usados >= limite) return "Créditos do dia esgotados";
  const vizinho = reservas.some((r) => r.equipe === equipe && Math.abs(r.slot - slot) === 1);
  if (vizinho) return "Não vale reservar dois slots seguidos";
  return null;
}

// Valida e normaliza os parâmetros comuns. Lança erro com status 400.
export function validar({ nivel, dia, slot, equipe }, { exigeSlot = false, exigeEquipe = false } = {}) {
  const n = Number(nivel);
  if (!NIVEIS[n]) throw erro(400, "Nível inválido.");
  const d = dia ? String(dia) : DIAS[0].id;
  if (!DIAS.some((x) => x.id === d)) throw erro(400, "Dia não liberado para reservas.");
  const out = { nivel: n, dia: d, limite: creditos(n) };
  if (exigeSlot) {
    const s = Number(slot);
    if (!Number.isInteger(s) || s < 0 || s >= SLOTS) throw erro(400, "Horário inválido.");
    out.slot = s;
  }
  if (exigeEquipe) {
    const e = String(equipe || "");
    if (!NIVEIS[n].equipes.some((x) => x.nome === e)) throw erro(400, "Equipe não encontrada neste nível.");
    out.equipe = e;
  }
  return out;
}

export function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}
