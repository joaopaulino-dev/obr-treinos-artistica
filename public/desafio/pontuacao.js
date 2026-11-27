// Desafio Técnico · Resgate (OBR 2026, Etapa Nacional).
// Regras do Desafio Técnico: pontuação diferente por nível (PDFs da organização, 27/11). Cálculo é só soma, sem multiplicador.
// Arquivo compartilhado: o navegador usa para mostrar a nota ao vivo e o servidor (lib/desafio.js)
// usa o mesmo cálculo para gravar. Mudou a regra? Mude só aqui.

export const TEMPO_ROUND_SEG = 5 * 60; // 5 minutos por round, N1 e N2, contando calibração e execução (regra de 27/11)
export const ARENAS = [1, 2, 3, 4, 5, 6];
export const ROUNDS = [1, 2];

// Itens por nível (PDFs "Resgate - Desafio Técnico 2026 Nível 1/2", 27/11).
// tipo "qtd": o juiz conta quantas vezes (pontos × quantidade); "sim": sim/não (pontos uma vez);
// "opcao": o juiz escolhe uma das opções (vale os pontos da opção; "" = nada marcado).
export const ITENS_POR_NIVEL = {
  1: [
    { id: "intersecao", nome: "Interseção superada corretamente", tipo: "qtd", pontos: 40 },
    { id: "obstaculo", nome: "Obstáculo superado corretamente", tipo: "qtd", pontos: 40 },
    { id: "fitaPrata", nome: "Parou 5 s na fita prata", tipo: "sim", pontos: 40 },
    { id: "vitima", nome: "Identificou a vítima com o sinal indicado ao juiz", tipo: "sim", pontos: 40 },
    { id: "fitaVerde", nome: "Parou 5 s na fita verde (ladrilho final)", tipo: "sim", pontos: 40 },
  ],
  2: [
    { id: "corSorteada", nome: "Cor sorteada no início", tipo: "opcao", info: true, opcoes: [
      { id: "verde", nome: "Verde", pontos: 0 }, { id: "vermelho", nome: "Vermelho", pontos: 0 }] },
    { id: "intersecao", nome: "Interseção superada corretamente", tipo: "qtd", pontos: 30 },
    { id: "obstaculo", nome: "Obstáculo superado corretamente", tipo: "qtd", pontos: 30 },
    { id: "fitaPrata", nome: "Parou 5 s na fita prata", tipo: "sim", pontos: 20 },
    { id: "posse", nome: "Ficou com posse da vítima", tipo: "sim", pontos: 40 },
    { id: "saida", nome: "Saída da sala de resgate", tipo: "opcao", opcoes: [
      { id: "correta", nome: "Saída correta (cor sorteada)", pontos: 100 },
      { id: "incorreta", nome: "Saída incorreta", pontos: 20 }] },
    { id: "ladrilhoFinal", nome: "Parou 5 s no ladrilho final correto", tipo: "sim", pontos: 60 },
    { id: "vitimaFinal", nome: "Levou a vítima ao ladrilho final correto", tipo: "sim", pontos: 40 },
  ],
};
export const itensDo = (nivel) => ITENS_POR_NIVEL[Number(nivel) === 2 ? 2 : 1];
export const pontosMax = (i) => (i.tipo === "opcao" ? Math.max(...i.opcoes.map((o) => o.pontos)) : i.pontos);
const QTD_MAX = 99; // só para evitar erro de toque; a regra não tem limite

const int = (v, min, max) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

// Normaliza o que veio do pontuador (limpa campos estranhos e limita valores).
export function normalizarRound(d = {}, nivel = 1) {
  const itens = {};
  for (const i of itensDo(nivel)) {
    const v = d.itens?.[i.id];
    itens[i.id] = i.tipo === "qtd" ? int(v, 0, QTD_MAX)
      : i.tipo === "opcao" ? (i.opcoes.some((o) => o.id === v) ? v : "")
      : v === true;
  }
  return { noShow: d.noShow === true, itens, tempoSeg: int(d.tempoSeg, 0, 3600) };
}

// Calcula a nota detalhada de um round (entrada normalizada ou não).
export function calcular(dados, nivel = 1) {
  const d = normalizarRound(dados, nivel);
  const itens = itensDo(nivel).map((i) => {
    const v = d.itens[i.id];
    let pts;
    if (i.tipo === "qtd") pts = v * i.pontos;
    else if (i.tipo === "opcao") pts = i.opcoes.find((o) => o.id === v)?.pontos || 0;
    else pts = v ? i.pontos : 0;
    const opcao = i.tipo === "opcao" ? i.opcoes.find((o) => o.id === v) || null : null;
    return { ...i, valor: v, opcao, subtotal: d.noShow ? 0 : pts };
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
