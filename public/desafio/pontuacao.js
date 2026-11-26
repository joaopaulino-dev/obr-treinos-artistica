// Desafio Técnico · Resgate (OBR 2026, Etapa Nacional).
// Regras do Desafio Técnico passadas pela organização (Carla, 25/11): cálculo é só contagem (soma, sem multiplicador).
// Arquivo compartilhado: o navegador usa para mostrar a nota ao vivo e o servidor (lib/desafio.js)
// usa o mesmo cálculo para gravar. Mudou a regra? Mude só aqui.

export const TEMPO_ROUND_SEG = 4 * 60; // 4 minutos por round, N1 e N2 (provisório: a organização vai definir)
export const ARENAS = [1, 2, 3, 4, 5, 6];
export const ROUNDS = [1, 2];

// tipo "qtd": o juiz conta quantas vezes (pontos × quantidade); tipo "sim": sim/não (pontos uma vez).
export const ITENS = [
  { id: "intersecao", nome: "Interseção", tipo: "qtd", pontos: 40 },
  { id: "obstaculo", nome: "Obstáculo", tipo: "qtd", pontos: 40 },
  { id: "fitaVermelha", nome: "Identificação da fita vermelha", tipo: "sim", pontos: 40 },
  { id: "fitaPrata", nome: "Identificação da fita prata", tipo: "sim", pontos: 40 },
  { id: "vitima", nome: "Identificação de vítima", tipo: "sim", pontos: 40 },
  { id: "posse", nome: "Posse da vítima", tipo: "sim", pontos: 40 },
  { id: "prataComVitima", nome: "Atingiu a fita prata em posse da vítima", tipo: "sim", pontos: 60 },
];
const QTD_MAX = 99; // só para evitar erro de toque; a regra não tem limite

const int = (v, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

// Normaliza o que veio do pontuador (limpa campos estranhos e limita valores).
export function normalizarRound(d = {}) {
  const itens = {};
  for (const i of ITENS) itens[i.id] = i.tipo === "qtd" ? int(d.itens?.[i.id], 0, QTD_MAX) : d.itens?.[i.id] === true;
  return { noShow: d.noShow === true, itens, tempoSeg: int(d.tempoSeg, 0, 3600) };
}

// Calcula a nota detalhada de um round (entrada normalizada ou não).
export function calcular(dados) {
  const d = normalizarRound(dados);
  const itens = ITENS.map((i) => {
    const v = d.itens[i.id];
    const qtd = i.tipo === "qtd" ? v : v ? 1 : 0;
    return { ...i, valor: v, subtotal: d.noShow ? 0 : qtd * i.pontos };
  });
  const total = itens.reduce((s, i) => s + i.subtotal, 0);
  return { d, itens, total };
}

// Ranking de um nível: vale a melhor nota entre os rounds; empate → menor tempo no round da melhor nota.
// rounds: [{ equipe, nivel, round, pontos, tempoSeg, noShow }]; equipes: [{ nome, nivel }]
export function ranking(rounds, equipes, nivel) {
  const porEquipe = new Map(equipes.filter((e) => e.nivel === nivel).map((e) => [e.nome, []]));
  for (const r of rounds) if (r.nivel === nivel && porEquipe.has(r.equipe)) porEquipe.get(r.equipe).push(r);
  const linhas = [...porEquipe].map(([equipe, rs]) => {
    const ordenados = [...rs].sort((a, b) => b.pontos - a.pontos || desempate(a) - desempate(b));
    const melhor = ordenados[0] || null;
    return {
      equipe,
      r1: rs.find((r) => r.round === 1) || null,
      r2: rs.find((r) => r.round === 2) || null,
      melhorRound: melhor,
      melhor: melhor ? melhor.pontos : null,
      tempoMelhor: melhor && !melhor.noShow ? melhor.tempoSeg : null,
      rounds: rs.length,
    };
  });
  linhas.sort((a, b) =>
    (b.melhor ?? -1) - (a.melhor ?? -1) ||
    (a.tempoMelhor ?? 1e9) - (b.tempoMelhor ?? 1e9) ||
    a.equipe.localeCompare(b.equipe, "pt-BR"));
  let pos = 0, anterior = null;
  linhas.forEach((l, i) => {
    if (l.melhor === null) { l.posicao = null; return; }
    const chave = `${l.melhor}|${l.tempoMelhor}`;
    if (chave !== anterior) pos = i + 1;
    anterior = chave;
    l.posicao = pos;
  });
  return linhas;
}
const desempate = (r) => (r.noShow ? 1e9 : r.tempoSeg || 1e9);

export const mmss = (seg) => {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
