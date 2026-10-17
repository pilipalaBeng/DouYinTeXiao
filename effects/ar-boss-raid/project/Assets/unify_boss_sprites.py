# -*- coding: utf-8 -*-
"""
统一 Boss 序列帧尺寸：
1. 对每张 PNG 计算 alpha 非透明区域的包围盒(bbox)
2. 以所有帧中最大 bbox 宽高 + 边距作为统一画布
3. 每张图按【底部居中】对齐粘贴到统一画布（脚部落点一致，翅膀扇动不会上下抽搐）
4. 原图备份到 Assets/_boss_original_backup/
"""
import os, shutil
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
BACKUP = os.path.join(ASSETS, "_boss_original_backup")
MARGIN = 24  # 统一画布四周留的透明边距

os.makedirs(BACKUP, exist_ok=True)

def alpha_bbox(im):
    """返回 (l,t,r,b) 非透明像素包围盒；若全透明返回整图 bbox。"""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    alpha = im.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        return (0, 0, im.width, im.height)
    return bbox

# 第一遍：读取所有图，备份，算 bbox
crops = {}
max_w = max_h = 0
print(f"{'文件':<14} {'原图WxH':<12} {'bbox WxH':<12} {'bbox位置(l,t,r,b)'}")
for name in FILES:
    p = os.path.join(ASSETS, name)
    im = Image.open(p).convert("RGBA")
    # 备份原图（仅第一次）
    bak = os.path.join(BACKUP, name)
    if not os.path.exists(bak):
        shutil.copy2(p, bak)
    bbox = alpha_bbox(im)
    l, t, r, b = bbox
    cw, ch = r - l, b - t
    crops[name] = (im, bbox, cw, ch)
    max_w = max(max_w, cw)
    max_h = max(max_h, ch)
    print(f"{name:<14} {im.width}x{im.height:<7} {cw}x{ch:<8} {bbox}")

# 统一画布尺寸
canvas_w = max_w + MARGIN * 2
canvas_h = max_h + MARGIN * 2
print(f"\n统一画布: {canvas_w} x {canvas_h}  (边距={MARGIN})")
print(f"对齐方式: 中心对齐（与引擎 pivot=0.5/0.5 + Center 对齐匹配，身体中心像素一致）\n")

# 第二遍：重绘
for name, (im, bbox, cw, ch) in crops.items():
    l, t, r, b = bbox
    sprite = im.crop(bbox)  # 裁到内容紧贴
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    # 中心对齐：内容中心 = 画布中心
    paste_x = (canvas_w - cw) // 2
    paste_y = (canvas_h - ch) // 2
    canvas.paste(sprite, (paste_x, paste_y), sprite)
    out = os.path.join(ASSETS, name)
    canvas.save(out)
    print(f"写入 {name}: 内容 {cw}x{ch} @ ({paste_x},{paste_y}) -> 画布 {canvas_w}x{canvas_h}")

print("\n完成。原图备份在:", BACKUP)
