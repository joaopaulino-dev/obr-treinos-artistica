// Configuração do evento. Para liberar mais dias, acrescente em DIAS.
// A grade de cada nível/dia (equipes por slot, créditos, início e fim) pode ser
// ajustada pela coordenação na própria página; GRADE_PADRAO vale até alguém mudar.
export const DURACAO_MIN = 15;
export const GRADE_PADRAO = { porSlot: 3, inicioMin: 8 * 60, fimMin: 18 * 60 };

export const DIAS = [
  { id: "2026-11-24", rotulo: "Ter 24/11" },
  // { id: "2026-11-25", rotulo: "Qua 25/11" },
  // { id: "2026-11-26", rotulo: "Qui 26/11" },
  // { id: "2026-11-27", rotulo: "Sex 27/11" },
  // { id: "2026-11-28", rotulo: "Sáb 28/11" },
];

const n1 = [
  "Alfa Robóticos - Artística", "APOIOBOT IMAGINARTE", "BEEONIC", "Cariacica Lego", "CARIRITECH - DANCE",
  "CAV NEO JAZZ", "CILM - Labouré", "Cyber Acalanto", "Cyber Divas", "Cyber Panthers", "Cyber Rex", "CZC Tech",
  "DEMOLIDOR", "Digital Dance", "Engenheiros do Espetáculo", "Equipe de Robótica Artística - Maravilha-SC",
  "EXPOARTE ROBOTICS EFAF", "FibraTech", "GAROTAS DA SUCATA", "Millennium Bots", "OKÀN", "PROTOCOLO MATRIX",
  "RASTRO NOTURNO EVO", "ROBOBROS", "Robolokos", "ROBOMAC", "SESI TO Tucuna Vision", "SESI TransformES",
  "SOROBÓTICOS", "Space Bots Explorer", "Squad do Hamtaro", "Stranger Things", "Talentos da Tancredo",
  "TECHTAIS", "The Ducks", "Twister",
];

const n2 = [
  "Alice no país das várias pilhas", "Alien Bot", "Andromeda", "Anjos Robot", "Armadillos", "ATOS E EIXOS",
  "CACTOS", "Curto circuito", "Cyber Olympians", "Cyber Panthers Teens", "Engenheiros do Açaí", "Equipe CEFEsteam",
  "Etnobóticos Íris", "GUERREIRO ALAGOANO: A DANÇA QUE GANHA VIDA", "Imagine Lego", "KYRIOS", "Lovelace",
  "LYMM TECH", "MAMONAS ANIMATRONICS", "MegaRobert - Artística", "Modern Times", "Morpho Jackson",
  "New Atom Art", "o saber", "PantaBots", "Pardoboots Art", "ROBOLIFE", "Robot World Woman", "Robótic Orion",
  "ScriptBot Dance", "SESI Red Hammer", "SESI TO Tucuna Robotics", "Space Bots Middle", "Tamba Tajá Tech",
  "Technocircus", "The Tchukas",
];

export const NIVEIS = {
  1: { palco: "Palco de treino A", equipes: n1.map((nome, i) => ({ mesa: 1 + i, nome })) },
  2: { palco: "Palco de treino B", equipes: n2.map((nome, i) => ({ mesa: 37 + i, nome })) },
};
