// POST /api/voluntarios-admin  { senha, acao, ... }  (só a coordenação, ADMIN_PASSWORD)
//   listar        { dia? }               voluntários com check-in e vale do dia (padrão: hoje)
//   liberarVale   { voluntario, dia }    devolve um vale consumido por engano
//   apagarCheckin { voluntario, dia }    apaga um check-in
import { erro } from "../lib/regras.js";
import { comBanco } from "../lib/db.js";
import { dataValida, agoraNoFuso } from "../lib/dias.js";
import { VOLUNTARIOS, DIAS_EVENTO, voluntarioPorId } from "../lib/voluntarios.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

function alvo(b) {
  const v = voluntarioPorId(String(b.voluntario || ""));
  if (!v) throw erro(400, "Voluntário desconhecido.");
  if (!dataValida(b.dia)) throw erro(400, "Dia inválido.");
  return [v.id, b.dia];
}

async function listar(pool, dia) {
  const [ck, vl] = await Promise.all([
    pool.query("SELECT voluntario, criado_em, distancia_m, precisao_m FROM vol_checkins WHERE dia = $1", [dia]),
    pool.query("SELECT voluntario, usado_em FROM vol_vales WHERE dia = $1", [dia]),
  ]);
  const c = Object.fromEntries(ck.rows.map((r) => [r.voluntario, r]));
  const u = Object.fromEntries(vl.rows.map((r) => [r.voluntario, r]));
  return {
    dia,
    dias: DIAS_EVENTO,
    voluntarios: VOLUNTARIOS.map((v) => ({
      id: v.id, nome: v.nome, categoria: v.categoria,
      checkin: c[v.id] ? { em: c[v.id].criado_em, distancia: c[v.id].distancia_m, precisao: c[v.id].precisao_m } : null,
      vale: u[v.id] ? u[v.id].usado_em : null,
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    const dia = b.dia && dataValida(b.dia) ? b.dia : agoraNoFuso().id;
    const out = await comBanco(async (pool) => {
      if (b.acao === "liberarVale") await pool.query("DELETE FROM vol_vales WHERE voluntario = $1 AND dia = $2", alvo(b));
      else if (b.acao === "apagarCheckin") await pool.query("DELETE FROM vol_checkins WHERE voluntario = $1 AND dia = $2", alvo(b));
      else if (b.acao !== "listar" && b.acao !== "entrar") throw erro(400, "Ação desconhecida.");
      return listar(pool, dia);
    });
    res.status(200).json(out);
  } catch (e) {
    responderErro(res, e);
  }
}
