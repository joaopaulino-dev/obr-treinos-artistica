// POST /api/superteams-admin  { senha, acao, ... }  (só a coordenação)
// { modalidade: "resgate" } age no Super Teams do Resgate; sem ele, no da Artística.
//   entrar                      confere a senha
//   listar                      inscrições, estado e sorteio
//   abrir     { aberto }        abre/fecha as inscrições
//   remover   { equipe }        apaga uma inscrição (e invalida o sorteio, se houver)
//   sortear   { tamanho, juntas } fecha as inscrições, sorteia e despublica (Artística: por nível, no máximo "tamanho" equipes por time)
//   refazerNivel { nivel, juntas } refaz só um nível: times de 2 ou 3 equipes, juntas no mesmo time (mantém o outro nível e a publicação)
//   dividir   { time }          divide um time em dois, equilibrando pessoas (mantém a publicação)
//   publicar  { publicado }     mostra/esconde o resultado na página pública
import { erro, inteiro } from "../lib/regras.js";
import { comBanco, emTransacaoChave } from "../lib/db.js";
import { carregarSuperTeams, gravarMeta, sortear, dividirTime, sortearNivelFlex, sortearArtistica, modDe, TAMANHO_MIN, TAMANHO_MAX } from "../lib/superteams.js";
import { responderErro, corpo, senhaConfere } from "../lib/http.js";

const ACOES = {
  async abrir(client, b, st, mod) {
    await gravarMeta(client, mod.meta + "aberto", b.aberto === true ? "1" : "0");
  },

  async remover(client, b, st, mod) {
    const r = await client.query(`DELETE FROM ${mod.tabela} WHERE equipe = $1`, [String(b.equipe || "")]);
    if (!r.rowCount) throw erro(409, "Essa inscrição não existe mais.");
    await gravarMeta(client, mod.meta + "sorteio", null);
    await gravarMeta(client, mod.meta + "publicado", "0");
  },

  async sortear(client, b, st, mod) {
    const tamanho = inteiro(b.tamanho, TAMANHO_MIN, TAMANHO_MAX, "O tamanho do time");
    if (st.inscritas.length < 2) throw erro(409, "É preciso ter pelo menos 2 equipes inscritas para sortear.");
    await gravarMeta(client, mod.meta + "aberto", "0");
    const juntas = [...new Set((Array.isArray(b.juntas) ? b.juntas : []).map(String).filter(Boolean))];
    // Artística: no máximo "tamanho" equipes por time (sobras não engordam times). Resgate segue o sorteio misturado.
    const sorteio = mod.misturar
      ? sortear(st.inscritas, tamanho, undefined, { misturar: true })
      : sortearArtistica(st.inscritas, tamanho, { juntas });
    await gravarMeta(client, mod.meta + "sorteio", JSON.stringify(sorteio));
    await gravarMeta(client, mod.meta + "publicado", "0");
  },

  async refazerNivel(client, b, st, mod) {
    if (mod.misturar) throw erro(400, "No Resgate os níveis são misturados: use o sorteio normal.");
    if (!st.sorteio) throw erro(409, "Faça o sorteio antes de refazer um nível.");
    const nivel = Number(b.nivel);
    if (nivel !== 1 && nivel !== 2) throw erro(400, "Nível inválido.");
    const juntas = [...new Set((Array.isArray(b.juntas) ? b.juntas : []).map(String).filter(Boolean))];
    const novos = sortearNivelFlex(st.inscritas, nivel, { juntas });
    const times = [...st.sorteio.times.filter((t) => t.nivel !== nivel), ...novos].sort((a, b) => a.nivel - b.nivel);
    const avisos = (st.sorteio.avisos || []).filter((a) => !a.includes(`Nível ${nivel}`));
    await gravarMeta(client, mod.meta + "sorteio", JSON.stringify({ ...st.sorteio, times, avisos, feitoEm: new Date().toISOString() }));
  },

  async dividir(client, b, st, mod) {
    await gravarMeta(client, mod.meta + "sorteio", JSON.stringify(dividirTime(st.sorteio, String(b.time || ""))));
  },

  async publicar(client, b, st, mod) {
    if (b.publicado === true && !st.sorteio) throw erro(409, "Faça o sorteio antes de publicar.");
    await gravarMeta(client, mod.meta + "publicado", b.publicado === true ? "1" : "0");
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  try {
    const b = corpo(req);
    if (!senhaConfere(b.senha)) throw erro(401, "Senha da coordenação incorreta.");
    if (b.acao === "entrar") return res.status(200).json({ ok: true });
    const mod = modDe(b.modalidade);
    if (b.acao === "listar") return res.status(200).json(await comBanco((pool) => carregarSuperTeams(pool, mod)));
    const fn = ACOES[b.acao];
    if (!fn) throw erro(400, "Ação desconhecida.");
    const st = await comBanco((pool) =>
      emTransacaoChave(pool, mod.trava, async (client) => {
        await fn(client, b, await carregarSuperTeams(client, mod), mod);
        return carregarSuperTeams(client, mod);
      }),
    );
    res.status(200).json(st);
  } catch (e) {
    responderErro(res, e);
  }
}
