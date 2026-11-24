// POST /api/admin  { senha, acao, nivel, dia, ... }  (só a coordenação)
//   entrar                                   confere a senha
//   reservar  { slot, equipe, forcar }       reserva por uma equipe (forcar ignora créditos e slots seguidos)
//   mover     { slot, equipe, para }         muda a reserva de horário (ignora créditos e slots seguidos)
//   liberar   { slot, equipe }               remove a reserva
//   extra     { equipe, extra }              créditos extras de uma equipe no dia (0 remove)
//   grade     { porSlot, creditosBase, inicioMin, fimMin }   ajusta a grade do dia (creditosBase null = automático)
//   auditoria                                devolve as reservas com data/hora e origem (hash do aparelho)
//   zerar     { master }                     apaga todas as reservas do nível no dia (senha digitada de novo)
import { validar, motivoBloqueio, erro, slotValido, inteiro } from "../lib/regras.js";
import { comBanco, emTransacao, listarAuditoria } from "../lib/db.js";
import { carregarDia, montarEstado, resolverGrade } from "../lib/grade.js";
import { DURACAO_MIN } from "../lib/config.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

const ACOES = {
  async reservar(client, b, ctx) {
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    const motivo = motivoBloqueio(ctx, p.equipe, p.slot, { forcar: b.forcar === true });
    if (motivo) throw erro(409, `Não foi possível reservar: ${motivo.toLowerCase()}.`);
    await client.query("INSERT INTO reservas (nivel, dia, slot, equipe, origem) VALUES ($1, $2, $3, $4, 'coordenacao')", [p.nivel, p.dia, p.slot, p.equipe]);
  },

  async mover(client, b, ctx) {
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    const para = slotValido(b.para);
    if (!ctx.reservas.some((r) => r.slot === p.slot && r.equipe === p.equipe)) throw erro(409, "Essa reserva não existe mais.");
    const sem = { ...ctx, reservas: ctx.reservas.filter((r) => !(r.slot === p.slot && r.equipe === p.equipe)) };
    const motivo = motivoBloqueio(sem, p.equipe, para, { forcar: true });
    if (motivo) throw erro(409, `Não foi possível mover: ${motivo.toLowerCase()}.`);
    await client.query("UPDATE reservas SET slot = $5 WHERE nivel = $1 AND dia = $2 AND slot = $3 AND equipe = $4", [p.nivel, p.dia, p.slot, p.equipe, para]);
  },

  async liberar(client, b) {
    const p = validar(b, { exigeSlot: true, exigeEquipe: true });
    await client.query("DELETE FROM reservas WHERE nivel = $1 AND dia = $2 AND slot = $3 AND equipe = $4", [p.nivel, p.dia, p.slot, p.equipe]);
  },

  async extra(client, b) {
    const p = validar(b, { exigeEquipe: true });
    const extra = inteiro(b.extra, 0, 20, "Créditos extras");
    if (extra === 0) {
      await client.query("DELETE FROM creditos_extra WHERE nivel = $1 AND dia = $2 AND equipe = $3", [p.nivel, p.dia, p.equipe]);
    } else {
      await client.query(
        `INSERT INTO creditos_extra (nivel, dia, equipe, extra) VALUES ($1, $2, $3, $4)
         ON CONFLICT (nivel, dia, equipe) DO UPDATE SET extra = EXCLUDED.extra`,
        [p.nivel, p.dia, p.equipe, extra],
      );
    }
  },

  async zerar(client, b) {
    // Usa MASTER_PASSWORD se existir; senão, a própria senha da coordenação (ADMIN_PASSWORD), digitada de novo.
    const variavel = process.env.MASTER_PASSWORD ? "MASTER_PASSWORD" : "ADMIN_PASSWORD";
    if (!senhaConfere(b.master, variavel)) throw erro(403, "Senha incorreta. Nada foi apagado.");
    const p = validar(b);
    await client.query("DELETE FROM reservas WHERE nivel = $1 AND dia = $2", [p.nivel, p.dia]);
  },

  async grade(client, b, ctx) {
    const p = validar(b);
    const porSlot = inteiro(b.porSlot, 1, 10, "Equipes por slot");
    const inicioMin = inteiro(b.inicioMin, 0, 24 * 60 - DURACAO_MIN, "Início");
    const fimMin = inteiro(b.fimMin, DURACAO_MIN, 24 * 60, "Fim");
    if (inicioMin % DURACAO_MIN || fimMin % DURACAO_MIN) throw erro(400, `Início e fim precisam cair em múltiplos de ${DURACAO_MIN} minutos.`);
    if (fimMin <= inicioMin) throw erro(400, "O fim precisa ser depois do início.");
    const creditosBase = b.creditosBase === null || b.creditosBase === "" || b.creditosBase === undefined
      ? null : inteiro(b.creditosBase, 1, 40, "Créditos por equipe");

    const nova = resolverGrade(p.nivel, { por_slot: porSlot, creditos_base: creditosBase, inicio_min: inicioMin, fim_min: fimMin });
    const fora = ctx.reservas.filter((r) => r.slot < nova.primeiro || r.slot > nova.ultimo);
    if (fora.length) {
      const lista = fora.slice(0, 4).map((r) => `${r.equipe} às ${hhmm(r.slot * DURACAO_MIN)}`).join("; ");
      throw erro(409, `Há reservas fora do novo horário (${lista}${fora.length > 4 ? "; …" : ""}). Mova ou libere antes.`);
    }
    const porHorario = {};
    for (const r of ctx.reservas) porHorario[r.slot] = (porHorario[r.slot] || 0) + 1;
    const cheio = Object.entries(porHorario).find(([, n]) => n > porSlot);
    if (cheio) throw erro(409, `O horário das ${hhmm(Number(cheio[0]) * DURACAO_MIN)} já tem ${cheio[1]} equipes. Libere vagas antes de reduzir para ${porSlot}.`);

    await client.query(
      `INSERT INTO grade (nivel, dia, por_slot, creditos_base, inicio_min, fim_min) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nivel, dia) DO UPDATE SET por_slot = EXCLUDED.por_slot, creditos_base = EXCLUDED.creditos_base,
         inicio_min = EXCLUDED.inicio_min, fim_min = EXCLUDED.fim_min`,
      [p.nivel, p.dia, porSlot, creditosBase, inicioMin, fimMin],
    );
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    if (b.acao === "entrar") return res.status(200).json({ ok: true });
    if (b.acao === "auditoria") {
      const p = validar(b);
      const reservas = await comBanco((pool) => listarAuditoria(pool, p.nivel, p.dia));
      return res.status(200).json({ reservas });
    }
    const fn = ACOES[b.acao];
    if (!fn) throw erro(400, "Ação desconhecida.");
    const p = validar(b);
    const ctx = await comBanco((pool) =>
      emTransacao(pool, p.nivel, p.dia, async (client) => {
        await fn(client, b, await carregarDia(client, p.nivel, p.dia));
        return carregarDia(client, p.nivel, p.dia);
      }),
    );
    res.status(200).json(montarEstado(ctx));
  } catch (e) {
    responderErro(res, e);
  }
}
