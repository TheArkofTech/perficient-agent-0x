from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/advisor-brief-stakeholder-overview.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = 792, 612
INK = HexColor("#142C3D")
MUTED = HexColor("#526473")
ACCENT = HexColor("#176B63")
LIGHT = HexColor("#EAF4F0")
BORDER = HexColor("#DCE4E6")

c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H))
c.setTitle("Advisor Brief | Stakeholder Overview")
c.setAuthor("Advisor Brief")
c.setSubject("A one-page, plain-language overview of the finance research prototype")
c.setFillColor(HexColor("#F7F9F8"))
c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def text(x, y, value, size=11, color=INK, bold=False):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, value)


def paragraph(x, top, width, value, size=11, leading=15, color=MUTED):
    style = ParagraphStyle(
        "copy", fontName="Helvetica", fontSize=size,
        leading=leading, textColor=color,
    )
    p = Paragraph(value, style)
    _, height = p.wrap(width, PAGE_H)
    p.drawOn(c, x, top - height)
    return height


text(44, 573, "STAKEHOLDER OVERVIEW", 9, ACCENT, True)
c.setFillColor(LIGHT)
c.roundRect(640, 559, 108, 25, 12, fill=1, stroke=0)
text(655, 568, "LIVE PROTOTYPE", 8, ACCENT, True)

text(44, 524, "Advisor Brief", 39, INK, True)
text(44, 494, "A clearer starting point for company research.", 17, INK)
paragraph(
    44, 468, 690,
    "Enter a stock symbol to bring market data, company filings and a concise "
    "research brief into one place.",
    size=12, leading=17,
)

c.setStrokeColor(BORDER)
c.setLineWidth(0.8)
c.line(44, 429, 748, 429)
text(44, 404, "A simple workflow", 15, INK, True)

steps = [
    (44, "1", "Choose a company", "Enter a stock symbol, such as AMZN, to start your research."),
    (287, "2", "Gather public data", "See a time-stamped quote and recent SEC company filings."),
    (530, "3", "Review the brief", "Read the main points, then follow the links to the original sources."),
]
for x, number, title, body in steps:
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(BORDER)
    c.roundRect(x, 284, 218, 100, 10, fill=1, stroke=1)
    c.setFillColor(ACCENT)
    c.circle(x + 22, 360, 10, fill=1, stroke=0)
    text(x + 19, 356.5, number, 10, HexColor("#FFFFFF"), True)
    text(x + 40, 356, title, 12, INK, True)
    paragraph(x + 16, 334, 184, body, size=11, leading=15)

for x in (267, 510):
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.4)
    c.line(x, 334, x + 14, 334)
    c.line(x + 10, 338, x + 14, 334)
    c.line(x + 10, 330, x + 14, 334)

text(44, 248, "Why it helps", 15, INK, True)
text(410, 248, "How to use it well", 15, INK, True)

left = [
    ("Less tab switching", "Quotes, filings and a brief in a single view."),
    ("A useful starting point", "Company context and reported risks for discussion."),
    ("Evidence you can inspect", "Source links let you check the original disclosures."),
]
right = [
    ("Check the sources", "Open the original company filings behind the brief."),
    ("Check the timing", "Read quote timestamps and filing dates."),
    ("Keep people in charge", "Research support; people make financial decisions."),
]
for x, items in ((44, left), (410, right)):
    for y, (title, body) in zip((223, 184, 145), items):
        text(x, y, title, 11, INK, True)
        paragraph(x, y - 7, 333, body, size=10, leading=13)

c.setFillColor(HexColor("#FFF3DF"))
c.roundRect(44, 62, 704, 43, 8, fill=1, stroke=0)
c.setFillColor(HexColor("#AA6B15"))
c.circle(62, 83.5, 3.5, fill=1, stroke=0)
text(74, 80, "Current status", 10, INK, True)
text(151, 80, "Live prototype. The complete AI research flow is still under validation.", 10, MUTED)

url = "https://perficient-agent-0x.vercel.app"
text(44, 32, "Try the prototype: perficient-agent-0x.vercel.app", 9, ACCENT)
c.linkURL(url, (44, 28, 309, 43), relative=0, thickness=0)
text(658, 32, "5 October 2026", 9, MUTED)

c.showPage()
c.save()
print(OUTPUT)
