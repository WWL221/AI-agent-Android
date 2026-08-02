from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (23, 24, 22, 255)
PANEL = (32, 33, 31, 255)
LINE = (49, 50, 46, 255)
ACCENT = (242, 111, 69, 255)
MINT = (67, 198, 162, 255)
AMBER = (227, 182, 79, 255)


def draw_mark(draw, size, padded=False):
    scale = size / 512
    pad = int(48 * scale)
    if padded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(88 * scale), fill=BG)
        x0, y0, x1, y1 = pad, pad, size - pad, size - pad
    else:
        draw.rounded_rectangle(
            (pad, pad, size - pad, size - pad),
            radius=int(48 * scale),
            fill=PANEL,
            outline=LINE,
            width=max(2, int(3 * scale)),
        )
        x0, y0, x1, y1 = int(96 * scale), int(96 * scale), int(416 * scale), int(416 * scale)

    width = max(6, int(34 * scale))
    caret = [
        (x0 + int(34 * scale), y0 + int(80 * scale)),
        (x0 + int(118 * scale), y0 + int(160 * scale)),
        (x0 + int(34 * scale), y0 + int(240 * scale)),
    ]
    draw.line(caret, fill=ACCENT, width=width, joint="curve")
    draw.line(
        [
            (x0 + int(176 * scale), y0 + int(66 * scale)),
            (x0 + int(176 * scale), y0 + int(254 * scale)),
        ],
        fill=MINT,
        width=max(4, int(18 * scale)),
    )
    dot_radius = max(4, int(14 * scale))
    draw.ellipse(
        (
            x1 - int(86 * scale) - dot_radius,
            y0 + int(60 * scale) - dot_radius,
            x1 - int(86 * scale) + dot_radius,
            y0 + int(60 * scale) + dot_radius,
        ),
        fill=AMBER,
    )


for name, size, padded in [
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("maskable-512.png", 512, True),
]:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw_mark(draw, size, padded=padded)
    image.save(OUT / name)
    print(f"wrote {OUT / name}")
