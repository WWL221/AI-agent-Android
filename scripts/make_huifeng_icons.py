from PIL import Image
from pathlib import Path

SRC = Path(r"C:\Users\m1888\Desktop\小灰图库\a5f7b9672cb37554a4bfc0d5da89e318_preview_mid.jpg")
ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "public" / "icons"
MIPMAP = ROOT / "android" / "app" / "src" / "main" / "res"

src = Image.open(SRC).convert("RGBA")
w, h = src.size
side = min(w, h)
# 取景框往上移，让画面内容在图标里往下移
top = 200
left = (w - side) // 2
square = src.crop((left, top, left + side, top + side))

def full(size):
    return square.resize((size, size), Image.LANCZOS)

for name, size in [("icon-192.png", 192), ("icon-512.png", 512)]:
    full(size).save(WEB / name)
full(512).save(WEB / "maskable-512.png")

density = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}
for d, scale in density.items():
    mip = MIPMAP / f"mipmap-{d}"
    launcher_size = int(48 * scale)
    fg_size = int(108 * scale)
    full(launcher_size).save(mip / "ic_launcher.png")
    full(launcher_size).save(mip / "ic_launcher_round.png")
    full(fg_size).save(mip / "ic_launcher_foreground.png")

print("icons regenerated with top=200")