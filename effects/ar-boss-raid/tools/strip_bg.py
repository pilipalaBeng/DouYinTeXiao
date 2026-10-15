# -*- coding: utf-8 -*-
"""把 AI 生图的「伪透明棋盘格背景」抠成真透明，并抹掉右下角水印区。

背景成因：ImageGen 返回 RGB（无 alpha），棋盘格是被"画"上去的近似白色块
  → 两种交替色，约 (227,227,225) 与 (249,251,249)，边界在 x≈32 的整倍数处。
水印：右下角「AI生成 WORKBUDDY」文字，直接切成透明。

用法：python strip_bg.py <in.png> <out.png> [--watermark 170x60]
"""
import argparse
import sys

from PIL import Image


def is_bg(px, tol=14):
    """判断是否棋盘格背景色：接近白/浅灰且三通道接近。"""
    r, g, b = px[0], px[1], px[2]
    if min(r, g, b) < 205:            # 明显不是白/浅灰
        return False
    if max(r, g, b) - min(r, g, b) > tol:  # 有色偏，是内容
        return False
    return True


def is_near_black(px, cut=14):
    """判断是否"近黑噪点"：JPEG 压缩后由柔和描边崩解出的 (0~cut) 级暗噪声。

    为什么需要：AI 生图的 1px 描边本是柔和深灰，经 PNG→JPEG 往返后崩解成
    (4,4,2)/(5,5,3) 这类近黑噪点，散落在轮廓外围。中值滤波只能压掉一部分，
    残留的会被 DB16 量化映射成 (0,0,0) —— 而 (0,0,0) 不在 DB16 内，直接违反宪法 §三。
    真正的描边色是 DB16 的 #140c1c = (20,12,28)，亮度显著高于 cut，可安全区分。
    """
    r, g, b = px[0], px[1], px[2]
    return r <= cut and g <= cut and b <= cut


def strip(src, dst, wm_w=170, wm_h=60):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()

    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if is_bg(c) or is_near_black(c):
                continue
            op[x, y] = (c[0], c[1], c[2], 255)

    # 抹掉右下角水印（连同其外围残留）
    for y in range(h - wm_h, h):
        for x in range(w - wm_w, w):
            op[x, y] = (0, 0, 0, 0)

    # 清理残余：去掉极小的离散噪点（保留主体连通区）
    out = _drop_specks(out)

    out.save(dst, format="PNG", optimize=True)
    bb = out.getchannel("A").getbbox()
    print("%s -> %s | size=%dx%d | bbox=%s" % (src, dst, w, h, bb))
    return out


def _drop_specks(im, keep_threshold=24):
    """按行块清理：丢弃面积过小的孤立色块（棋盘格边缘残留）。"""
    w, h = im.size
    px = im.load()
    # 简单方案：用一个整数格网统计局部不透明密度，密度过低的格子整格清空
    cell = 8
    for gy in range(0, h, cell):
        for gx in range(0, w, cell):
            n = 0
            for y in range(gy, min(gy + cell, h)):
                for x in range(gx, min(gx + cell, w)):
                    if px[x, y][3] > 0:
                        n += 1
            if n < keep_threshold:
                for y in range(gy, min(gy + cell, h)):
                    for x in range(gx, min(gx + cell, w)):
                        px[x, y] = (0, 0, 0, 0)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--watermark", default="170x60")
    args = ap.parse_args()
    wm_w, wm_h = (int(v) for v in args.watermark.lower().split("x"))
    strip(args.src, args.dst, wm_w, wm_h)


if __name__ == "__main__":
    main()
