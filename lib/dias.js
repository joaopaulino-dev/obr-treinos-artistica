import { FUSO, HORA_ABERTURA } from "./config.js";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Data (YYYY-MM-DD) e minuto do dia no fuso do evento.
export function agoraNoFuso(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { id: `${o.year}-${o.month}-${o.day}`, min: Number(o.hour) * 60 + Number(o.minute) };
}

export function somarDias(id, n) {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function rotulo(id) {
  const [y, m, d] = id.split("-").map(Number);
  const dia = SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function dataValida(id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(id))) return false;
  const [y, m, d] = id.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Até HORA_ABERTURA as equipes reservam o dia de hoje; depois, o dia seguinte.
export function agenda(d = new Date()) {
  const { id: hoje, min } = agoraNoFuso(d);
  const amanha = somarDias(hoje, 1);
  return { hoje, amanha, ativo: min >= HORA_ABERTURA * 60 ? amanha : hoje, agoraMin: min, aberturaHora: HORA_ABERTURA };
}
