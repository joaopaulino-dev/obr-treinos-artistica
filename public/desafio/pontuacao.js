// Desafio Técnico · Resgate (OBR 2026, Etapa Nacional).
// Pontuação convencional do Manual de Regras do Resgate Nacional 2026 (Caderno Verde).
// Arquivo compartilhado: o navegador usa para mostrar a nota ao vivo e o servidor (lib/desafio.js)
// usa o mesmo cálculo para gravar. Mudou a regra? Mude só aqui.

export const TEMPO_ROUND_SEG = 8 * 60; // 8 minutos por round, N1 e N2
export const ARENAS = [1, 2, 3, 4, 5, 6];
export const ROUNDS = [1, 2];
export const VIVAS_MAX = 2; // "Serão exatamente duas Vítimas Vivas e uma Vítima Morta."
export const MULT_VITIMA = 1.3;

// Perigos do trajeto: pontos por superação (cada perigo pontua uma vez por direção).
export const PERIGOS = [
  { id: "gangorra", nome: "Gangorra", pontos: 20 },
  { id: "intersecao", nome: "Interseção ou beco sem saída", pontos: 20 },
  { id: "obstaculo", nome: "Obstáculo desviado", pontos: 20 },
  { id: "rampa", nome: "Ladrilho de rampa (subir ou descer)", pontos: 10 },
  { id: "gap", nome: "Ladrilho com gap(s)", pontos: 10 },
  { id: "lombada", nome: "Ladrilho com lombada(s)", pontos: 10 },
  { id: "passagem", nome: "Passagem", pontos: 0 },
];

export const PONTOS_INICIO = 5; // superar o ladrilho de início
export const CHEGADA_MAX = 60; // ladrilho de chegada: 60 − 5 × falhas de progresso, nunca negativo
export const CHEGADA_POR_FALHA = 5;

// Pontos por ladrilho de um trecho entre checkpoints, conforme a tentativa em que o robô chegou ao checkpoint.
export function pontosPorLadrilho(tentativa) {
  return tentativa === 1 ? 5 : tentativa === 2 ? 3 : tentativa === 3 ? 1 : 0;
}

const int = (v, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const arred = (n) => Math.round(n * 100) / 100;

// Normaliza o que veio do pontuador (limpa campos estranhos e limita valores).
export function normalizarRound(d = {}) {
  const perigos = {};
  for (const p of PERIGOS) perigos[p.id] = int(d.perigos?.[p.id], 0, 99);
  const trechos = (Array.isArray(d.trechos) ? d.trechos : []).slice(0, 40).map((t) => ({
    ladrilhos: int(t?.ladrilhos, 0, 200),
    tentativa: int(t?.tentativa, 1, 99),
    pulado: t?.pulado === true,
  }));
  const vivas = int(d.vivas, 0, VIVAS_MAX);
  return {
    noShow: d.noShow === true,
    perigos,
    inicio: d.inicio === true,
    trechos,
    falhas: int(d.falhas, 0, 999),
    chegada: d.chegada === true,
    vivas,
    morta: d.morta === true && vivas === VIVAS_MAX, // a morta só vale depois de todas as vivas
    tempoSeg: int(d.tempoSeg, 0, 3600),
    obs: String(d.obs || "").slice(0, 500),
  };
}

// Calcula a nota detalhada de um round (entrada normalizada ou não).
export function calcular(dados) {
  const d = normalizarRound(dados);
  if (d.noShow) {
    return { d, perigos: 0, checkpoints: 0, chegada: 0, base: 0, multiplicador: 1, total: 0, itensPerigo: [], itensTrecho: [] };
  }
  const itensPerigo = PERIGOS.map((p) => ({ ...p, qtd: d.perigos[p.id], subtotal: d.perigos[p.id] * p.pontos }));
  const perigos = itensPerigo.reduce((s, i) => s + i.subtotal, 0);
  const itensTrecho = d.trechos.map((t, i) => {
    const porLadrilho = t.pulado ? 0 : pontosPorLadrilho(t.tentativa);
    return { n: i + 1, ...t, porLadrilho, subtotal: porLadrilho * t.ladrilhos };
  });
  const checkpoints = (d.inicio ? PONTOS_INICIO : 0) + itensTrecho.reduce((s, t) => s + t.subtotal, 0);
  const chegada = d.chegada ? Math.max(0, CHEGADA_MAX - CHEGADA_POR_FALHA * d.falhas) : 0;
  const base = perigos + checkpoints + chegada;
  const multiplicador = arred(MULT_VITIMA ** d.vivas * (d.morta ? MULT_VITIMA : 1) * 10000) / 10000;
  const total = arred(base * MULT_VITIMA ** d.vivas * (d.morta ? MULT_VITIMA : 1));
  return { d, perigos, checkpoints, chegada, base, multiplicador, total, itensPerigo, itensTrecho };
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
