#!/usr/bin/env python3
"""Gera public/mapa/mapa.svg e public/mapa/equipes.json a partir de fontes/.

- Cada mesa (círculo + número) vira <g id="mesa-N" class="mesa" data-x data-y>,
  com o centro em coordenadas absolutas do SVG.
- Palcos e arenas de treino viram <g id="..." class="local" data-x data-y data-w data-h>.
- O viewBox é recortado para a área do salão; a legenda vai para o HTML.

Uso: python3 scripts/preparar-mapa.py
"""
import csv
import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE_SVG = RAIZ / "fontes" / "mapa-mesas.svg"
FONTE_CSV = RAIZ / "fontes" / "equipes.csv"
SAIDA_SVG = RAIZ / "public" / "mapa" / "mapa.svg"
SAIDA_JSON = RAIZ / "public" / "mapa" / "equipes.json"

LOCAIS = {
    "Palco de treino A": "palco-a",
    "Palco de treino B": "palco-b",
    "Palco principal": "palco-principal",
}

svg = FONTE_SVG.read_text(encoding="utf-8")

# Deslocamento vertical do grupo que contém mesas e palcos.
m = re.search(r'<g transform="translate\(0,(\d+)\)">', svg)
DY = int(m.group(1)) if m else 0

# 1. Mesas: <circle cx cy r="34" .../><text ...>N</text>
mesas = {}

def trocar_mesa(mt):
    cx, cy, numero = float(mt.group(2)), float(mt.group(3)), int(mt.group(5))
    mesas[numero] = (cx, cy + DY)
    return (f'<g id="mesa-{numero}" class="mesa" data-x="{cx:g}" data-y="{cy + DY:g}">'
            f'{mt.group(1)}{mt.group(4)}</g>')

svg = re.sub(
    r'(<circle cx="([\d.]+)" cy="([\d.]+)" r="34"[^>]*/>)(<text [^>]*>(\d+)</text>)',
    trocar_mesa, svg)

# 2. Palcos: <rect x y width height .../><text ...>Nome</text>
def envolver_local(texto_svg):
    padrao = re.compile(
        r'(<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*/>)(<text [^>]*>([^<]+)</text>)')
    def troca(mt):
        nome = mt.group(7)
        if nome not in LOCAIS:
            return mt.group(0)
        x, y, w, h = (float(mt.group(i)) for i in (2, 3, 4, 5))
        return (f'<g id="{LOCAIS[nome]}" class="local" data-x="{x + w / 2:g}" data-y="{y + h / 2 + DY:g}" '
                f'data-w="{w:g}" data-h="{h:g}">{mt.group(1)}{mt.group(6)}</g>')
    return padrao.sub(troca, texto_svg)

svg = envolver_local(svg)

# 3. Arenas de treino: <rect .../><text>Arena de treino</text><text>N1|N2</text>
def trocar_arena(mt):
    x, y, w, h = (float(mt.group(i)) for i in (2, 3, 4, 5))
    nivel = mt.group(8).lower()
    return (f'<g id="arena-treino-{nivel}" class="local" data-x="{x + w / 2:g}" data-y="{y + h / 2 + DY:g}" '
            f'data-w="{w:g}" data-h="{h:g}">{mt.group(1)}{mt.group(6)}{mt.group(7)}</g>')

svg = re.sub(
    r'(<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*/>)'
    r'(<text [^>]*>Arena de treino</text>)(<text [^>]*>(N[12])</text>)',
    trocar_arena, svg)

# 4. Recorta para o salão (sem a legenda) e deixa o SVG escalável.
svg = re.sub(r'<svg [^>]*>',
             '<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 15 1972 1791" '
             'preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa das mesas da OBR 2026">',
             svg, count=1)
corte = svg.find('<text x="60" y="1866" class="t">Legenda</text>')
if corte != -1:
    svg = svg[:corte] + "</svg>\n"

assert len(mesas) == 152 and sorted(mesas) == list(range(1, 153)), f"esperava 152 mesas, achei {len(mesas)}"
for local in list(LOCAIS.values()) + ["arena-treino-n1", "arena-treino-n2"]:
    assert f'id="{local}"' in svg, f"faltou {local}"

SAIDA_SVG.write_text(svg, encoding="utf-8")

# 5. Equipes com a posição da mesa.
equipes = []
with FONTE_CSV.open(encoding="utf-8") as f:
    for linha in csv.DictReader(f):
        n = int(linha["mesa"])
        equipes.append({"mesa": n, "tipo": linha["tipo"], "nivel": int(linha["nivel"]), "equipe": linha["equipe"]})
assert len(equipes) == 152
SAIDA_JSON.write_text(json.dumps(equipes, ensure_ascii=False, indent=0), encoding="utf-8")

print(f"{SAIDA_SVG.relative_to(RAIZ)}: {len(mesas)} mesas, deslocamento {DY}")
print(f"{SAIDA_JSON.relative_to(RAIZ)}: {len(equipes)} equipes")
