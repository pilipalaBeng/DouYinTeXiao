# -*- coding: utf-8 -*-
"""
统一 Boss 序列帧的"身体尺寸"，而不仅仅是画布尺寸。
做法：
1. 对每张原图，取画面中央 30% 宽度的竖直条（排除左右翅膀），计算该区域非透明像素的高度 -> 身体高度
2. 以所有帧身体高度的中位数为基准，等比缩放每帧，使身体高度一致
3. 再按中心对齐贴到统一 365x312 透明画布上
"""
import os
from PIL import Image

ASSETS = os.path.dirname(os.path.abspath(__file__))
FILES = [
    "Boss待机.png",
    "Boss投降.png",
    "Boss暴怒.png",
    "Boss振翅1.png",
    "Boss振翅2.png",
    "Boss振翅3.png",
    "Boss振翅4.png",
]
CANVAS_W, CANVAS_H = 365, 312

def body_height(im):
    """中央 30% 宽度条带内的非透明像素高度"""
    w, h = im.size
    px = im.convert("RGBA").load()
    x0, x1 = int(w * 0.35), int(w * 0.65)
    ys = []
    for y in range(h):
        for x in range(x0, x1):
            if px[x, y][3] > 10:
                ys.append(y)
                break
    if not ys:
        return h
    return max(ys) - min(ys) + 1

# 第一遍：读当前图(已统一画布)，算身体高度
data = {}
heights = []
for name in FILES:
    p = os.path.join(ASSETS, name)
    im = Image.open(p).convert("RGBA")
    bh = body_height(im)
    data[name] = (im, bh)
    heights.append(bh)
    print(f"{name:<14} 当前{im.size[0]}x{im.size[1]}  身体高度={bh}")

# 中位数基准
heights_sorted = sorted(heights)
target = heights_sorted[len(heights_sorted)//2]
print(f"\n基准身体高度(中位数) = {target}")

# 第二遍：等比缩放 + 中心贴到统一画布
for name, (im, bh) in data.items():
    scale = target / bh
    new_w = max(1, round(im.width * scale))
    new_h = max(1, round(im.height * scale))
    scaled = im.resize((new_w, new_h), Image.NEAREST)  # 像素风用 NEAREST
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    px = (CANVAS_W - new_w) // 2
    py = (CANVAS_H - new_h) // 2
    canvas.paste(scaled, (px, py), scaled)
    out = os.path.join(ASSETS, name)
    canvas.save(out)
    print(f"{name:<14} 缩放系数={scale:.3f} -> {new_w}x{new_h} @ ({px},{py})")

print("\n完成。")
