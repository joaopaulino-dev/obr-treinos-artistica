// Configuração do evento.
// O dia das reservas é calculado sozinho (lib/dias.js): até HORA_ABERTURA vale o dia de hoje;
// a partir dela, as equipes passam a reservar o dia seguinte.
// A grade de cada nível/dia (equipes por slot, créditos, início e fim) pode ser
// ajustada pela coordenação na própria página; GRADE_PADRAO vale até alguém mudar.
export const FUSO = "America/Fortaleza";
export const HORA_ABERTURA = 18;
export const DURACAO_MIN = 10;
export const GRADE_PADRAO = { porSlot: 1, inicioMin: 8 * 60, fimMin: 18 * 60 };

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
  1: { palco: "Palco de ensaio A", equipes: n1.map((nome, i) => ({ mesa: 1 + i, nome })) },
  2: { palco: "Palco de ensaio B", equipes: n2.map((nome, i) => ({ mesa: 37 + i, nome })) },
};
