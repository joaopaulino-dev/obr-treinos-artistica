import { DIAS, NIVEIS, DURACAO_MIN } from "./config.js";
import { limiteDe } from "./grade.js";

const SLOT_MAX = (24 * 60) / DURACAO_MIN - 1; // 95

// ctx: { grade, extras, reservas: [{ slot, equipe }] } de um nível/dia.
// forcar = coordenação ignorando créditos e slots seguidos (lotação continua valendo).
// Devolve o motivo do bloqueio, ou null se a reserva é permitida.
export function motivoBloqueio(ctx, equipe, slot, { forcar = false } = {}) {
  const { grade, reservas } = ctx;
  if (slot < grade.primeiro || slot > grade.ultimo) return "Horário fora da grade do dia";
  const naquele = reservas.filter((r) => r.slot === slot);
  if (naquele.some((r) => r.equipe === equipe)) return "A equipe já está neste horário";
  if (naquele.length >= grade.porSlot) return "Horário lotado";
  if (forcar) return null;
  const usados = reservas.filter((r) => r.equipe === equipe).length;
  if (usados >= limiteDe(ctx, equipe)) return "Créditos do dia esgotados";
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
  const out = { nivel: n, dia: d };
  if (exigeSlot) out.slot = slotValido(slot);
  if (exigeEquipe) {
    const e = String(equipe || "");
    if (!NIVEIS[n].equipes.some((x) => x.nome === e)) throw erro(400, "Equipe não encontrada neste nível.");
    out.equipe = e;
  }
  return out;
}

export function slotValido(slot) {
  const s = Number(slot);
  if (!Number.isInteger(s) || s < 0 || s > SLOT_MAX) throw erro(400, "Horário inválido.");
  return s;
}

export function inteiro(valor, min, max, rotulo) {
  const v = Number(valor);
  if (!Number.isInteger(v) || v < min || v > max) throw erro(400, `${rotulo} deve ser um número entre ${min} e ${max}.`);
  return v;
}

export function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}
