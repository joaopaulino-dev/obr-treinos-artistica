import { DURACAO_MIN, GRADE_PADRAO, NIVEIS, DIAS } from "./config.js";
import { listarReservas } from "./db.js";

// Slots são numerados a partir da meia-noite: slot = minuto do dia / DURACAO_MIN (com 10 min, 08:00 = 48).
export function resolverGrade(nivel, linha) {
  const porSlot = linha ? Number(linha.por_slot) : GRADE_PADRAO.porSlot;
  const inicioMin = linha ? Number(linha.inicio_min) : GRADE_PADRAO.inicioMin;
  const fimMin = linha ? Number(linha.fim_min) : GRADE_PADRAO.fimMin;
  const primeiro = inicioMin / DURACAO_MIN;
  const ultimo = fimMin / DURACAO_MIN - 1;
  const nSlots = ultimo - primeiro + 1;
  const creditosAuto = Math.floor((nSlots * porSlot) / NIVEIS[nivel].equipes.length);
  const creditosBase = linha && linha.creditos_base != null ? Number(linha.creditos_base) : null;
  return {
    porSlot, inicioMin, fimMin, duracaoMin: DURACAO_MIN,
    primeiro, ultimo, nSlots,
    creditosAuto, creditosBase, creditos: creditosBase ?? creditosAuto,
  };
}

// Tudo que as regras precisam de um nível/dia: grade, créditos extras e reservas.
export async function carregarDia(q, nivel, dia) {
  const g = await q.query(
    "SELECT por_slot, creditos_base, inicio_min, fim_min FROM grade WHERE nivel = $1 AND dia = $2",
    [nivel, dia],
  );
  const e = await q.query(
    "SELECT equipe, extra FROM creditos_extra WHERE nivel = $1 AND dia = $2 AND extra <> 0",
    [nivel, dia],
  );
  const extras = {};
  for (const r of e.rows) extras[r.equipe] = Number(r.extra);
  return {
    nivel, dia,
    grade: resolverGrade(nivel, g.rows[0]),
    extras,
    reservas: await listarReservas(q, nivel, dia),
  };
}

export function limiteDe(ctx, equipe) {
  return ctx.grade.creditos + (ctx.extras[equipe] || 0);
}

export function montarEstado(ctx) {
  return {
    nivel: ctx.nivel,
    palco: NIVEIS[ctx.nivel].palco,
    dia: ctx.dia,
    dias: DIAS,
    equipes: NIVEIS[ctx.nivel].equipes,
    grade: ctx.grade,
    extras: ctx.extras,
    reservas: ctx.reservas,
  };
}
