#!/usr/bin/env python3
"""Gera divulgacao/qr-codes-A4.pdf: folha A4 com o logo da OBR 2026 e QR codes do portal.

Requer reportlab (4.0.9 roda no Python 3.9 do macOS).
Uso: python3 scripts/gerar-qr-a4.py
"""
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "divulgacao" / "qr-codes-A4.pdf"
LOGO = RAIZ / "public" / "assets" / "logo-obr-2026-vinho.png"
SITE = "https://obr-treinos-artistica.vercel.app"

VINHO = HexColor("#7A1C1C")
VINHO_ESCURO = HexColor("#561111")
VINHO_CLARO = HexColor("#F6E8E6")
TINTA = HexColor("#261A1C")
CINZA = HexColor("#6D5E60")
LINHA = HexColor("#E8DEDC")
ALERTA = HexColor("#B42318")
ALERTA_FUNDO = HexColor("#FDECEA")

CARTOES = [
    ("Agendar ensaio", "Nível 1 · Palco de ensaio A", "/n1"),
    ("Agendar ensaio", "Nível 2 · Palco de ensaio B", "/n2"),
    ("Mapa das mesas", "Busca da equipe e caminho a partir da entrada", "/mapa"),
    ("Cronograma", "Artística N1 e N2 · Etapa Nacional", "/materiais#artistica"),
    ("Material e informações", "Manuais e regras · Artística e Resgate", "/materiais"),
    ("Portal completo", "Todas as opções em um só lugar", "/"),
]


def qr(c, url, x, y, tamanho):
    w = QrCodeWidget(url, barLevel="M", barBorder=0)
    x1, y1, x2, y2 = w.getBounds()
    d = Drawing(tamanho, tamanho, transform=[tamanho / (x2 - x1), 0, 0, tamanho / (y2 - y1), 0, 0])
    w.barFillColor = TINTA
    d.add(w)
    renderPDF.draw(d, c, x, y)


def centro(c, texto, x, y, fonte, tam, cor):
    c.setFont(fonte, tam)
    c.setFillColor(cor)
    c.drawCentredString(x, y, texto)


def main():
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    W, H = A4
    c = canvas.Canvas(str(SAIDA), pagesize=A4)
    c.setTitle("OBR 2026 · QR codes da Artística")
    c.setAuthor("Coordenação da Artística")

    # Faixa superior e logo
    c.setFillColor(VINHO)
    c.rect(0, H - 14, W, 14, stroke=0, fill=1)
    logo = ImageReader(str(LOGO))
    lw, lh = logo.getSize()
    largura = 230
    altura = largura * lh / lw
    c.drawImage(logo, (W - largura) / 2, H - 36 - altura, largura, altura, mask="auto")
    topo = H - 36 - altura

    centro(c, "ETAPA NACIONAL · JOÃO PESSOA/PB · 23 A 29 DE NOVEMBRO", W / 2, topo - 22, "Helvetica-Bold", 9.5, CINZA)
    centro(c, "Robótica Artística: ensaios, mapa e materiais", W / 2, topo - 50, "Helvetica-Bold", 19, TINTA)
    centro(c, "Aponte a câmera do celular para o QR code", W / 2, topo - 69, "Helvetica", 11.5, CINZA)

    # Grade 2 × 3 de cartões
    margem, gap = 40, 16
    rodape = 118
    area_topo = topo - 88
    cw = (W - 2 * margem - gap) / 2
    ch = (area_topo - rodape - 2 * gap) / 3
    q = min(cw - 70, ch - 62)
    for i, (titulo, sub, caminho) in enumerate(CARTOES):
        col, lin = i % 2, i // 2
        x = margem + col * (cw + gap)
        y = area_topo - (lin + 1) * ch - lin * gap
        destaque = caminho in ("/n1", "/n2")
        c.setFillColor(VINHO_CLARO if destaque else white)
        c.setStrokeColor(VINHO if destaque else LINHA)
        c.setLineWidth(1.4 if destaque else 1)
        c.roundRect(x, y, cw, ch, 12, stroke=1, fill=1)
        qx = x + (cw - q) / 2
        qy = y + ch - 14 - q
        c.setFillColor(white)
        c.roundRect(qx - 6, qy - 6, q + 12, q + 12, 6, stroke=0, fill=1)
        qr(c, SITE + caminho, qx, qy, q)
        centro(c, titulo, x + cw / 2, y + 30, "Helvetica-Bold", 13.5, VINHO_ESCURO if destaque else TINTA)
        centro(c, sub, x + cw / 2, y + 14, "Helvetica", 9.5, CINZA)

    # Rodapé: aviso e endereço
    bx, by, bw, bh = margem, 50, W - 2 * margem, 54
    c.setFillColor(ALERTA_FUNDO)
    c.setStrokeColor(ALERTA)
    c.setLineWidth(1)
    c.roundRect(bx, by, bw, bh, 10, stroke=1, fill=1)
    c.setFillColor(ALERTA)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawCentredString(W / 2, by + 34, "Reserve somente para a sua equipe: reservas por outra equipe podem resultar em desclassificação.")
    c.setFont("Helvetica", 9.5)
    c.setFillColor(TINTA)
    c.drawCentredString(W / 2, by + 16, "Ensaios de 10 minutos, 1 equipe por horário. O agendamento do dia seguinte abre às 18h do dia vigente.")
    centro(c, SITE.replace("https://", ""), W / 2, 30, "Helvetica-Bold", 10.5, VINHO)
    c.setFillColor(VINHO)
    c.rect(0, 0, W, 10, stroke=0, fill=1)

    c.showPage()
    c.save()
    print(SAIDA.relative_to(RAIZ))


if __name__ == "__main__":
    main()
