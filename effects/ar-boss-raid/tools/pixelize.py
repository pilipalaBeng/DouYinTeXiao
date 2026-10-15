# -*- coding: utf-8 -*-
"""AR Boss 特效 · 像素化资产流水线（正式工具）

把 AI 生成的"像素风插画"转成符合项目宪法的真像素图：
  逻辑画布降采样 -> DB16 硬量化（无抖动）-> alpha 硬阈值 -> Nearest 整数倍放大 -> 512 边长导出

宪法死参数（AGENTS.md §三）：
  逻辑画布 64x64（大元素 96/128，仅整数倍）/ DB16 固定 16 色 / Nearest 采样 / 导出 512x512 透明 PNG

用法：
  python pixelize.py <输入PNG> <输出PNG> --logical 128 [--median 9] [--mode pad|fit]
  python pixelize.py --batch batch.json

  mode=pad  正方形逻辑画布，内容按比例居中放入并补透明边（Boss / 图标用）
  mode=fit  逻辑画布按目标长宽比，内容铺满（血条等横向构件用，需给 --out-w/--out-h 比例）
"""
import argparse
import io
import json
import os
import sys

from PIL import Image, ImageFilter

# 逻辑画布 -> 导出边长 512 的整数倍关系
EXPORT_EDGE = 512

DB16 = [
    (0x14, 0x0c, 0x1c), (0x44, 0x24, 0x34), (0x30, 0x34, 0x6d), (0x4e, 0x4a, 0x4e),
    (0x85, 0x4c, 0x30), (0x34, 0x65, 0x24), (0xd0, 0x46, 0x48), (0x75, 0x71, 0x61),
    (0x59, 0x7d, 0xce), (0xd2, 0x7d, 0x2c), (0x85, 0x95, 0xa1), (0x6d, 0xaa, 0x2c),
    (0xd2, 0xaa, 0x99), (0x6d, 0xc2, 0xca), (0xda, 0xd4, 0x5e), (0xde, 0xee, 0xd6),
]

_pal = Image.new("P", (1, 1))
_flat = []
for _c in DB16:
    _flat += list(_c)
_flat += [0] * (768 - len(_flat))
_pal.putpalette(_flat)


def quantize_db16(rgb):
    """RGB 图 -> DB16 索引色 -> RGB。禁用抖动，保证硬边平色。"""
    return rgb.convert("RGB").quantize(palette=_pal, dither=Image.Dither.NONE).convert("RGB")


def alpha_bbox(im, cut=8):
    return im.getchannel("A").point(lambda a: 255 if a >= cut else 0).getbbox()


def pixelize(src_path, out_path, logical=128, median=9, mode="pad",
             out_w=1, out_h=1, alpha_cut=128, content_scale=1.0):
    im = Image.open(src_path).convert("RGBA")

    bbox = alpha_bbox(im)
    if bbox:
        im = im.crop(bbox)

    # 1) 降噪：中值滤波只作用在 RGB 上，避免把 alpha 边缘糊掉
    rgb = im.convert("RGB")
    if median and median >= 3:
        rgb = rgb.filter(ImageFilter.MedianFilter(size=median))
    a = im.getchannel("A")

    # 2) 计算逻辑画布尺寸并放内容
    if mode == "pad":
        lw = lh = logical
        w, h = rgb.size
        s = min(lw / w, lh / h) * content_scale
        nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
        canvas = Image.new("RGB", (lw, lh), (0, 0, 0))
        canvas_a = Image.new("L", (lw, lh), 0)
        ox, oy = (lw - nw) // 2, (lh - nh) // 2
        canvas.paste(rgb.resize((nw, nh), Image.Resampling.BOX), (ox, oy))
        canvas_a.paste(a.resize((nw, nh), Image.Resampling.BOX), (ox, oy))
    elif mode == "fit":
        lw, lh = int(round(logical * out_w)), int(round(logical * out_h))
        canvas = rgb.resize((lw, lh), Image.Resampling.BOX)
        canvas_a = a.resize((lw, lh), Image.Resampling.BOX)
    else:
        raise ValueError("mode 必须是 pad 或 fit")

    # 3) DB16 硬量化 + alpha 硬阈值
    # 关键：量化必须只作用于"前景"像素。pad/fit 的合成画布背景是纯黑 (0,0,0)，
    #       若直接把黑底喂给 quantize，PIL 会把它映射到索引 0/最近色并输出 (0,0,0)，
    #       而 (0,0,0) 不在 DB16 内 → 违反宪法 §三「禁止超出 16 色」，
    #       且会在边缘留下半透明黑边（部分管线做插值后变暗色描边）。
    # 做法：先把背景替换成一块 DB16 内的占位色，量化后用 alpha 掩码整体切掉。
    BG_PLACEHOLDER = (0x14, 0x0c, 0x1c)  # DB16 近黑，仅占位，最终会被 alpha 切掉
    src_rgba = canvas.convert("RGBA")
    src_rgba.putalpha(canvas_a)
    flat = Image.new("RGBA", src_rgba.size, BG_PLACEHOLDER + (255,))
    flat.paste(src_rgba, (0, 0), src_rgba)
    q = quantize_db16(flat.convert("RGB")).convert("RGBA")
    a_hard = canvas_a.point(lambda v: 255 if v >= alpha_cut else 0)
    cleared = Image.new("RGBA", q.size, (0, 0, 0, 0))
    cleared.paste(q, (0, 0), a_hard)
    q = cleared

    # 4) 整数倍 Nearest 放大到导出尺寸
    if mode == "pad":
        k = EXPORT_EDGE // lw
        out_size = (lw * k, lh * k)
    else:
        k = EXPORT_EDGE // lw
        out_size = (lw * k, lh * k)
    if k < 1:
        raise ValueError("逻辑画布 %dx%d 超过导出边长 %d，无法整数倍放大" % (lw, lh, EXPORT_EDGE))
    big = q.resize(out_size, Image.Resampling.NEAREST)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    big.save(out_path, format="PNG", optimize=True)

    buf = io.BytesIO()
    big.save(buf, format="PNG", optimize=True)
    colors = len(set(big.getdata()))
    return {
        "src": src_path, "out": out_path,
        "logical": "%dx%d" % (lw, lh), "scale": k, "export": "%dx%d" % out_size,
        "bytes": buf.tell(), "colors": colors,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("dst", nargs="?")
    ap.add_argument("--logical", type=int, default=128)
    ap.add_argument("--median", type=int, default=9)
    ap.add_argument("--mode", default="pad", choices=["pad", "fit"])
    ap.add_argument("--out-w", type=float, default=1)
    ap.add_argument("--out-h", type=float, default=1)
    ap.add_argument("--alpha-cut", type=int, default=128)
    ap.add_argument("--content-scale", type=float, default=1.0)
    ap.add_argument("--batch")
    args = ap.parse_args()

    if args.batch:
        with open(args.batch, "r", encoding="utf-8") as f:
            jobs = json.load(f)
        rows = []
        for j in jobs:
            r = pixelize(j["src"], j["dst"],
                         logical=j.get("logical", 128),
                         median=j.get("median", 9),
                         mode=j.get("mode", "pad"),
                         out_w=j.get("outW", 1), out_h=j.get("outH", 1),
                         alpha_cut=j.get("alphaCut", 128),
                         content_scale=j.get("contentScale", 1.0))
            rows.append(r)
            print("%-22s %-9s x%-2d -> %-10s %6d B  %2d 色"
                  % (os.path.basename(r["out"]), r["logical"], r["scale"], r["export"], r["bytes"], r["colors"]))
        print("\n合计 %d 件，总 %d B (%.1f KB)" % (len(rows), sum(x["bytes"] for x in rows), sum(x["bytes"] for x in rows) / 1024.0))
        return

    r = pixelize(args.src, args.dst, logical=args.logical, median=args.median,
                 mode=args.mode, out_w=args.out_w, out_h=args.out_h,
                 alpha_cut=args.alpha_cut, content_scale=args.content_scale)
    print("%s -> %s | 逻辑 %s x%d -> %s | %d B | %d 色"
          % (r["src"], r["out"], r["logical"], r["scale"], r["export"], r["bytes"], r["colors"]))


if __name__ == "__main__":
    main()
