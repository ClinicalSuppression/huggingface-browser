import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIANTS_DIR = os.path.join(ROOT, "assets", "variants")

v1 = Image.open(os.path.join(VARIANTS_DIR, "variant_1_equalizer.png"))
v2 = Image.open(os.path.join(VARIANTS_DIR, "variant_2_neural_hub.png"))
v3 = Image.open(os.path.join(VARIANTS_DIR, "variant_3_reasoning_arc.png"))
v4 = Image.open(os.path.join(VARIANTS_DIR, "variant_4_tensor_matrix.png"))

# Create 4-up showcase image at 2048 x 640
thumb_size = 420
pad = 60
w = (thumb_size * 4) + (pad * 5)
h = thumb_size + (pad * 2) + 60

showcase = Image.new("RGBA", (w, h), (15, 23, 42, 255)) # slate-900 background
draw = ImageDraw.Draw(showcase)

variants = [
    (v1, "1. Equalizer", "Teal->Green telemetry"),
    (v2, "2. Neural Hub", "Blue->Cyan network"),
    (v3, "3. Reasoning Arc", "Purple->Cyan accelerator"),
    (v4, "4. Tensor Matrix", "Gold->Emerald 4-block"),
]

for idx, (img, title, subtitle) in enumerate(variants):
    thumb = img.resize((thumb_size, thumb_size), Image.Resampling.LANCZOS)
    x = pad + idx * (thumb_size + pad)
    y = pad
    showcase.paste(thumb, (x, y), thumb)
    # text below
    draw.text((x + thumb_size // 2, y + thumb_size + 16), title, fill=(255, 255, 255), anchor="mt")
    draw.text((x + thumb_size // 2, y + thumb_size + 42), subtitle, fill=(148, 163, 184), anchor="mt")

showcase_path = os.path.join(VARIANTS_DIR, "showcase_all_variants.png")
showcase.save(showcase_path, "PNG")
print(f"Showcase generated at: {showcase_path}")
