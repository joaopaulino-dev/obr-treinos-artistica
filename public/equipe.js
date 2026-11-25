// Equipe lembrada no aparelho, compartilhada entre menu, ensaios, Super Teams e sugestões.
// Guarda { modalidade, nivel, nome } em "obr-minha-equipe". Antes dela cada página tinha a sua
// chave; elas continuam sendo lidas como reserva para quem já tinha escolhido a equipe.
(() => {
  const CHAVE = "obr-minha-equipe";
  const ler = (k) => { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  const gravar = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} };

  function get() {
    try {
      const e = JSON.parse(ler(CHAVE) || "null");
      if (e && e.modalidade && e.nome && (e.nivel === 1 || e.nivel === 2)) return e;
    } catch (er) {}
    const sg = ler("obr-sugestoes-equipe"); // "Modalidade|Nome", sem nível
    if (sg.includes("|")) { const [modalidade, nome] = sg.split("|"); return { modalidade, nome, nivel: null }; }
    for (const n of [1, 2]) { const nome = ler("obr-equipe-n" + n); if (nome) return { modalidade: "Artística", nivel: n, nome }; }
    return null;
  }

  function set(e) {
    if (!e) { gravar(CHAVE, ""); return; }
    gravar(CHAVE, JSON.stringify({ modalidade: e.modalidade, nivel: e.nivel, nome: e.nome }));
    // Mantém as chaves antigas em dia para as páginas abertas em outra aba.
    gravar("obr-sugestoes-equipe", e.modalidade + "|" + e.nome);
    if (e.modalidade === "Artística" && e.nivel) gravar("obr-equipe-n" + e.nivel, e.nome);
  }

  window.OBR_EQUIPE = { get, set, chave: (e) => e ? e.modalidade + "|" + e.nome : "" };
})();
