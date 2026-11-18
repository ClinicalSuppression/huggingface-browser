#!/usr/bin/env python3
"""
Generates four distinct variants of the HF Browser application icon,
matching the uniform Quick Scaler / SystemInfo / Crispy Bills / Dupe Check family style:
- Deep-navy rounded squircle background
- Periwinkle inset outline
- Bold off-white "HF" monogram
- 4 distinct purpose glyph strip variations
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIANTS_DIR = os.path.join(ROOT, "assets", "variants")
os.makedirs(VARIANTS_DIR, exist_ok=True)

S = 1024
RX = 225
IX, IW = 17, 7
BG_TOP, BG_BOT = (27, 30, 51), (21, 24, 41)
OUTLINE = (72, 78, 112)
GLYPH = (226, 232, 244)
FONTS = r"C:\Windows\Fonts"
ARIBLK = os.path.join(FONTS, "ariblk.ttf")


def background():
    t = np.linspace(0, 1, S, dtype=np.float32)[:, None, None]
    top = np.array(BG_TOP, np.float32)
    bot = np.array(BG_BOT, np.float32)
    grad = np.repeat((top[None, None, :] * (1 - t) + bot[None, None, :] * t).astype(np.uint8), S, axis=1)
    img = Image.fromarray(grad, "RGB").convert("RGBA")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=RX, fill=255)
    img.putalpha(mask)
    ImageDraw.Draw(img).rounded_rectangle([IX, IX, S - 1 - IX, S - 1 - IX],
                                          radius=RX - IX, outline=OUTLINE, width=IW)
    return img


def draw_monogram():
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    try:
        font = ImageFont.truetype(ARIBLK, 460)
    except Exception:
        font = ImageFont.load_default()

    text = "HF"
    bbox = dm.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    # Center horizontally, place in upper-middle region above glyph strip
    x = (S - tw) // 2
    y = 230 - bbox[1]
    dm.text((x, y), text, font=font, fill=255)

    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    solid = Image.new("RGBA", (S, S), (*GLYPH, 255))
    img.paste(solid, (0, 0), mask)
    return img


# Variant 1: Telemetry Equalizer (Teal to Green bars - SystemInfo family style)
def glyph_variant_1():
    heights, w, gap, y_bot = (60, 108, 150, 168, 88), 70, 38, 908
    total = len(heights) * w + (len(heights) - 1) * gap
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    x = (S - total) // 2
    for h in heights:
        dm.rounded_rectangle([x, y_bot - h, x + w, y_bot], radius=w // 2, fill=255)
        x += w + gap

    xs, xe = (S - total) // 2, (S + total) // 2
    row = np.linspace(0, 1, xe - xs, dtype=np.float32)[:, None]
    teal = np.array((63, 220, 190), np.float32)[None, :]
    green = np.array((70, 223, 156), np.float32)[None, :]
    grad = np.repeat((teal * (1 - row) + green * row).astype(np.uint8)[None, :, :], S, axis=0)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(Image.fromarray(grad, "RGB").convert("RGBA"), (xs, 0))
    img.putalpha(mask)
    return img


# Variant 2: Neural Hub & Network Bridge (Fluent Azure to Cyan connected nodes)
def glyph_variant_2():
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    y_center = 835

    # Connecting data bus bar
    dm.rounded_rectangle([230, y_center - 14, 794, y_center + 14], radius=14, fill=255)

    # 3 Network nodes
    node_xs = [270, 512, 754]
    for nx in node_xs:
        dm.ellipse([nx - 42, y_center - 42, nx + 42, y_center + 42], fill=255)

    xs, xe = 230, 794
    row = np.linspace(0, 1, xe - xs, dtype=np.float32)[:, None]
    blue = np.array((0, 120, 212), np.float32)[None, :]
    cyan = np.array((56, 189, 248), np.float32)[None, :]
    grad = np.repeat((blue * (1 - row) + cyan * row).astype(np.uint8)[None, :, :], S, axis=0)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(Image.fromarray(grad, "RGB").convert("RGBA"), (xs, 0))
    img.putalpha(mask)
    return img


# Variant 3: Reasoning & Accelerator Arc (Electric Magenta/Purple to Cyan pill strip)
def glyph_variant_3():
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    y_top = 805
    y_bot = 875

    # 3 graduated accelerator capsules
    segments = [(230, 360), (395, 629), (664, 794)]
    for sx, ex in segments:
        dm.rounded_rectangle([sx, y_top, ex, y_bot], radius=35, fill=255)

    xs, xe = 230, 794
    row = np.linspace(0, 1, xe - xs, dtype=np.float32)[:, None]
    purple = np.array((168, 85, 247), np.float32)[None, :]
    cyan = np.array((56, 189, 248), np.float32)[None, :]
    grad = np.repeat((purple * (1 - row) + cyan * row).astype(np.uint8)[None, :, :], S, axis=0)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(Image.fromarray(grad, "RGB").convert("RGBA"), (xs, 0))
    img.putalpha(mask)
    return img


# Variant 4: Quantized Tensor Matrix (Gold to Emerald 4-block array)
def glyph_variant_4():
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    y_top = 795
    y_bot = 875
    block_w = 115
    gap = 26
    start_x = (S - (4 * block_w + 3 * gap)) // 2

    for i in range(4):
        bx = start_x + i * (block_w + gap)
        dm.rounded_rectangle([bx, y_top, bx + block_w, y_bot], radius=22, fill=255)

    xs = start_x
    xe = start_x + 4 * block_w + 3 * gap
    row = np.linspace(0, 1, xe - xs, dtype=np.float32)[:, None]
    amber = np.array((251, 191, 36), np.float32)[None, :]
    emerald = np.array((52, 211, 153), np.float32)[None, :]
    grad = np.repeat((amber * (1 - row) + emerald * row).astype(np.uint8)[None, :, :], S, axis=0)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(Image.fromarray(grad, "RGB").convert("RGBA"), (xs, 0))
    img.putalpha(mask)
    return img


def generate_all():
    bg = background()
    mono = draw_monogram()

    variants = [
        ("variant_1_equalizer", glyph_variant_1(), "Variant 1: Equalizer (Teal to Green telemetry bars - matches SystemInfo/QuickScaler signature)"),
        ("variant_2_neural_hub", glyph_variant_2(), "Variant 2: Neural Hub (Fluent Blue to Cyan connected network bus)"),
        ("variant_3_reasoning_arc", glyph_variant_3(), "Variant 3: Reasoning Arc (Electric Purple to Cyan tensor accelerator capsules)"),
        ("variant_4_tensor_matrix", glyph_variant_4(), "Variant 4: Tensor Matrix (Gold to Emerald 4-block quantized array)"),
    ]

    for name, glyph, desc in variants:
        comp = Image.alpha_composite(bg, mono)
        comp = Image.alpha_composite(comp, glyph)

        png_path = os.path.join(VARIANTS_DIR, f"{name}.png")
        comp.save(png_path, "PNG")

        ico_path = os.path.join(VARIANTS_DIR, f"{name}.ico")
        sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        comp.save(ico_path, format="ICO", sizes=sizes)
        print(f"Generated: {png_path} ({desc})")


if __name__ == "__main__":
    generate_all()
