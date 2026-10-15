# -*- coding: utf-8 -*-
"""AR Boss 特效 · 6 个预设像素头像程序化生成器

用途：为「开局头像选择器（6 选 1）」产出头像素材。

★ 两个逻辑网格（art-model-director 裁定，原因见下）★
  _64 网格（64x64 -> x8  -> 512）：**选择器专用**。显示 ~128px = 颗粒 2，五官辨识度最好。
  _16 网格（16x16 -> x32 -> 512）：**Boss 头顶出战牌专用**。与相框 `boss_head_frame_a` 孔径对齐
                                   （孔径 16 逻辑 px）；孔径显示 64px = 颗粒 4，
                                   64 网格头像进孔径会变颗粒 1，同一块牌子里「脸比框细 4 倍」，
                                   故战牌只能用 16 网格。
  两套都产出，互不影响；调用方按用途取用。
  （历史备注：team-lead 已裁定删除 avatar_placeholder / _locked —— 预设 6 选 1 是必经前置，
    头像永远有合法值，无「未选/锁定」中间态，故本资产不涉及占位头像。）

  命名：team-lead 裁定头像类统一**全小写** `avatar_01_16.png` / `avatar_01_64.png`，不加例外。
        命名规范的**管辖范围**（team-lead 定）：只管**运行时资产**（进包体、引擎内有 GUID 的）；
        `assets/raw/` 是中间源，不入包，不受命名规范管辖。
        故本脚本三处产物的合规状态：
          assets/px/avatars/*.png     运行时  -> 受管辖，全小写 snake_case ✓
          assets/raw/avatars/*_source.png  逻辑源（「源」非「派生」）-> 不受管辖
          assets/raw/avatars/_compare.png  派生（对照图）-> 不受管辖，仍按 `_` 前缀约定命名

与 tools/pixelize.py 的区别：
  pixelize.py 处理「外部素材」（降采样 + 量化 + 放大）；
  本脚本是「纯程序化绘制」——直接在逻辑画布上用 DB16 的 RGB 值画，
  不读任何外部图片，因此不需要中值滤波/量化，只保留「整数倍 Nearest 放大」。
  16 网格版是**手工重绘**（不是 NN 降采样——16px 下机械降采样会把眼睛/嘴糊掉）。

项目宪法（AGENTS.md §三）死参数：
  DB16 固定 16 色（不得超色板）/ Nearest 整数倍放大 / 导出 512x512 透明 PNG / 图层 <=6

64 网格绘制结构（每个头像最多 6 层，自下而上）：
  L1 肩/衣   L2 后发   L3 脸/耳/颈   L4 前发/帽/兜帽   L5 五官(眉/眼/嘴)   L6 配饰(眼镜/胡须/闪光)
  最后统一加 1px #140c1c 外描边（与全项目同源）；16 网格同理，用字符地图手工排布。

用法：
  python make_avatars.py            # 生成两套网格 + 对照图 + MANIFEST.md5 + 校验
  python make_avatars.py --check    # 只校验已导出的 PNG（不重新生成）
"""

import argparse
import json
import os
import sys
from collections import Counter

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# ---------------------------------------------------------------- 常量 / 路径
LOGICAL = 64          # 主逻辑画布边长（选择器专用）
SCALE = 8             # 主网格整数倍放大 -> 512
EXPORT = LOGICAL * SCALE        # = 512

SMALL = 16            # 战牌专用逻辑画布边长
SMALL_SCALE = EXPORT // SMALL   # = 32

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_PX = os.path.join(ROOT, "assets", "px", "avatars")     # 512 导出
DIR_RAW = os.path.join(ROOT, "assets", "raw", "avatars")   # 逻辑版源
MANIFEST = os.path.join(DIR_PX, "avatars.json")

# ---------------------------------------------------------------- DB16 色板
DB16 = [
    (0x14, 0x0c, 0x1c), (0x44, 0x24, 0x34), (0x30, 0x34, 0x6d), (0x4e, 0x4a, 0x4e),
    (0x85, 0x4c, 0x30), (0x34, 0x65, 0x24), (0xd0, 0x46, 0x48), (0x75, 0x71, 0x61),
    (0x59, 0x7d, 0xce), (0xd2, 0x7d, 0x2c), (0x85, 0x95, 0xa1), (0x6d, 0xaa, 0x2c),
    (0xd2, 0xaa, 0x99), (0x6d, 0xc2, 0xca), (0xda, 0xd4, 0x5e), (0xde, 0xee, 0xd6),
]
DB16_SET = set(DB16)

HEX = {
    "BLK": "#140c1c", "PUR": "#442434", "NVY": "#30346d", "GRY": "#4e4a4e",
    "BRN": "#854c30", "DGR": "#346524", "RED": "#d04648", "OLV": "#757161",
    "BLU": "#597dce", "ORG": "#d27d2c", "SIL": "#8595a1", "GRN": "#6daa2c",
    "SKN": "#d2aa99", "CYN": "#6dc2ca", "GLD": "#dad45e", "WHT": "#deeed6",
}
RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in HEX.items()}
HEX_BY_RGB = {v: k for k, v in RGB.items()}
HEX_BY_RGB[(0, 0, 0)] = "(0,0,0)"  # 兜底，正常不会出现


def OPAQUE(key):
    """RGB 名 -> RGBA 元组（不透明）"""
    r, g, b = RGB[key]
    return (r, g, b, 255)


# ---------------------------------------------------------------- 绘图原语
def canvas():
    return Image.new("RGBA", (LOGICAL, LOGICAL), (0, 0, 0, 0))


def box(d, x0, y0, x1, y1, key):
    """整数像素矩形（坐标含端点）。"""
    d.rectangle([x0, y0, x1, y1], fill=OPAQUE(key))


def rows(d, spans, key):
    """按 (y, x0, x1) 行表逐行填充，用来画圆润的头形。"""
    for y, x0, x1 in spans:
        if x1 >= x0:
            d.rectangle([x0, y, x1, y], fill=OPAQUE(key))


def mirror_x(x):
    """64 宽画布的左右镜像：像素 i <-> 63-i"""
    return LOGICAL - 1 - x


def sym_box(d, x0, y0, x1, y1, key):
    """左右对称地画两块（用于耳朵、眉、眼等成对元素）。"""
    box(d, x0, y0, x1, y1, key)
    box(d, mirror_x(x1), y0, mirror_x(x0), y1, key)


def poly(d, pts, key):
    d.polygon(pts, fill=OPAQUE(key))


# ---------------------------------------------------------------- 通用部件
# 脸形：一张 64 画布内的圆润方脸，位于 y16→y52（前发会盖住 y16 以上部分）
FACE_SPANS = [
    (16, 24, 39), (17, 21, 42), (18, 19, 44),
    *[(y, 17, 46) for y in range(19, 48)],
    (48, 18, 45), (49, 19, 44), (50, 21, 42), (51, 23, 40), (52, 26, 37),
]

EYE_Y0, EYE_Y1 = 30, 33          # 眼睛竖向范围（4px 高 -> 用 3 或 4 行）
EYE_L = (22, 24)                 # 左眼 x 范围（右眼镜像）
BROW_Y = 27                      # 眉毛基线


def draw_shoulders(d, coat, shade=None):
    """L1 肩/衣：领口 + 肩线，做小一点，避免抢头部。"""
    rows(d, [(55, 17, 46), (56, 13, 50), (57, 11, 52), (58, 11, 52), (59, 12, 51)], coat)
    if shade:
        box(d, 27, 55, 36, 56, shade)          # 领口阴影
        box(d, 11, 58, 12, 59, shade)
        box(d, 51, 58, 52, 59, shade)


def draw_head(d, skin="SKN", shadow=None):
    """L3 脸 + 耳 + 颈。"""
    rows(d, FACE_SPANS, skin)
    sym_box(d, 14, 30, 16, 36, skin)           # 耳
    if shadow:
        sym_box(d, 14, 30, 15, 31, shadow)     # 耳上阴影
    box(d, 27, 52, 37, 54, skin)               # 颈
    if shadow:
        box(d, 27, 52, 37, 52, shadow)         # 下巴/颈阴影


def draw_eyes(d, style, iris="BLK", sclera=None, y0=None, y1=None):
    """L5 眼。style: block | calm | angry | glow"""
    y0 = EYE_Y0 if y0 is None else y0
    y1 = EYE_Y1 if y1 is None else y1
    lx0, lx1 = EYE_L
    rx0, rx1 = mirror_x(lx1), mirror_x(lx0)
    if style == "block":                        # 3x4 实心暗块，最硬朗
        box(d, lx0, y0, lx1, y1, iris)
        box(d, rx0, y0, rx1, y1, iris)
    elif style == "calm":                       # 眼白 + 2x2 虹膜，冷静
        box(d, lx0, y0, lx1, y1, sclera or "WHT")
        box(d, rx0, y0, rx1, y1, sclera or "WHT")
        box(d, lx0 + 1, y0 + 1, lx0 + 2, y0 + 2, iris)
        box(d, rx1 - 2, y0 + 1, rx1 - 1, y0 + 2, iris)
    elif style == "angry":                      # 上宽下窄，压眉感
        box(d, lx0, y0, lx1, y1, iris)
        box(d, rx0, y0, rx1, y1, iris)
        box(d, lx0, y0, lx1, y0, "BLK")
        box(d, rx0, y0, rx1, y0, "BLK")
    elif style == "glow":                       # 兜帽内发光眼，无眼白
        box(d, lx0, y0, lx1, y1, iris)
        box(d, rx0, y0, rx1, y1, iris)
        box(d, lx0, y0 + 1, lx1, y0 + 1, "BLK")
        box(d, rx0, y0 + 1, rx1, y0 + 1, "BLK")


def draw_brows(d, style, color="BLK"):
    """L5 眉。style: flat | angry | arch"""
    if style == "flat":
        sym_box(d, EYE_L[0] - 2, BROW_Y, EYE_L[1] + 1, BROW_Y, color)
    elif style == "angry":                      # 内低外高
        box(d, 20, BROW_Y, 25, BROW_Y, color)
        box(d, 23, BROW_Y - 1, 25, BROW_Y - 1, color)
        box(d, mirror_x(25), BROW_Y, mirror_x(20), BROW_Y, color)
        box(d, mirror_x(25), BROW_Y - 1, mirror_x(23), BROW_Y - 1, color)
    elif style == "arch":                       # 外低内高，温和/年老
        box(d, 21, BROW_Y + 1, 25, BROW_Y + 1, color)
        box(d, 23, BROW_Y, 25, BROW_Y, color)
        box(d, mirror_x(25), BROW_Y + 1, mirror_x(21), BROW_Y + 1, color)
        box(d, mirror_x(25), BROW_Y, mirror_x(23), BROW_Y, color)


def draw_mouth(d, style, color="BLK"):
    """L5 嘴。style: line | smile | smirk | grim | open"""
    if style == "line":
        box(d, 28, 44, 35, 44, color)
    elif style == "smile":
        box(d, 27, 43, 36, 43, color)
        box(d, 29, 44, 34, 44, color)
    elif style == "smirk":
        box(d, 28, 44, 36, 44, color)
        box(d, 34, 43, 36, 43, color)
    elif style == "grim":
        box(d, 27, 45, 36, 45, color)
        box(d, 28, 44, 29, 44, color)
        box(d, 34, 44, 35, 44, color)
    elif style == "open":
        box(d, 29, 43, 34, 46, color)


# ---------------------------------------------------------------- 6 个头像
def avatar01(d):
    """热血红发 · 火焰红"""
    draw_shoulders(d, "NVY", shade="BLK")
    draw_head(d, "SKN", shadow="BRN")
    # L4 前发：红色刺猬头，左右不对称以增强动感
    poly(d, [(15, 26), (12, 26), (18, 16), (19, 22)], "RED")
    poly(d, [(20, 20), (18, 8), (24, 16), (26, 20)], "RED")
    poly(d, [(27, 20), (31, 6), (34, 15), (36, 20)], "RED")
    poly(d, [(38, 20), (44, 9), (45, 18), (48, 22)], "RED")
    poly(d, [(45, 22), (51, 27), (48, 30), (46, 26)], "RED")
    box(d, 16, 18, 47, 24, "RED")               # 发团主体
    box(d, 16, 24, 20, 28, "RED")               # 左鬓角
    box(d, 43, 24, 47, 28, "RED")
    box(d, 16, 25, 47, 26, "PUR")               # 发根阴影
    box(d, 20, 24, 43, 25, "RED")               # 刘海下缘
    box(d, 26, 22, 32, 24, "RED")               # 额前挑染
    # L6 配饰：金色头带 + 眉间痣
    box(d, 16, 27, 47, 28, "GLD")
    box(d, 30, 26, 33, 29, "RED")
    draw_brows(d, "angry")
    draw_eyes(d, "angry")
    draw_mouth(d, "smirk")


def avatar02(d):
    """冷静蓝发 · 冰蓝学长"""
    draw_shoulders(d, "GRY", shade="BLK")
    draw_head(d, "SKN", shadow="BRN")
    # L4 前发：蓝色「圆锅盖」——轮廓圆润无尖角，与 A1 的刺猬头拉开剪影
    rows(d, [(9, 26, 37), (10, 23, 40), (11, 21, 42), (12, 19, 44),
             (13, 18, 45), (14, 17, 46), (15, 17, 46), (16, 16, 47),
             (17, 16, 47)], "BLU")
    box(d, 16, 17, 47, 24, "BLU")               # 发团主体（实心，避免透出肤色）
    box(d, 15, 24, 18, 40, "BLU")               # 左长鬓（垂到脸颊）
    box(d, 45, 24, 48, 40, "BLU")               # 右长鬓
    box(d, 15, 24, 48, 24, "NVY")               # 刘海下沿阴影
    box(d, 15, 25, 48, 25, "BLU")
    box(d, 29, 26, 34, 26, "BLU")               # 中央刘海小尖
    box(d, 31, 11, 32, 21, "NVY")               # 中分缝
    # L6 配饰：黑框眼镜
    box(d, 20, 29, 27, 29, "BLK")
    box(d, 20, 34, 27, 34, "BLK")
    box(d, 20, 29, 20, 34, "BLK")
    box(d, 27, 29, 27, 34, "BLK")
    box(d, 36, 29, 43, 29, "BLK")
    box(d, 36, 34, 43, 34, "BLK")
    box(d, 36, 29, 36, 34, "BLK")
    box(d, 43, 29, 43, 34, "BLK")
    box(d, 28, 31, 35, 31, "BLK")               # 鼻梁
    box(d, 17, 31, 19, 31, "BLK")               # 镜腿
    box(d, 44, 31, 46, 31, "BLK")
    draw_eyes(d, "calm", iris="BLU", sclera="WHT", y0=30, y1=33)
    draw_brows(d, "flat", color="NVY")
    draw_mouth(d, "line")


def avatar03(d):
    """绿帽小子 · 丛林探险"""
    draw_shoulders(d, "DGR", shade="BLK")
    draw_head(d, "SKN", shadow="BRN")
    # L4 前发（帽下露出的绿发）
    box(d, 16, 20, 47, 24, "DGR")
    box(d, 16, 24, 20, 27, "DGR")
    box(d, 43, 24, 47, 27, "DGR")
    # L4 绿帽：帽顶 + 帽檐
    poly(d, [(20, 14), (44, 14), (46, 20), (18, 20)], "GRN")
    rows(d, [(10, 24, 39), (11, 21, 42), (12, 19, 44), (13, 18, 45)], "GRN")
    box(d, 18, 18, 45, 20, "GRN")
    box(d, 22, 8, 41, 10, "GRN")                # 帽顶小揪
    box(d, 28, 10, 35, 10, "DGR")
    box(d, 12, 21, 51, 22, "DGR")               # 帽檐（深色出挑）
    box(d, 12, 22, 51, 22, "DGR")
    box(d, 18, 19, 45, 19, "DGR")               # 帽顶与檐的接缝阴影
    box(d, 31, 19, 33, 21, "GLD")               # 帽子正面小徽章
    draw_brows(d, "flat")
    draw_eyes(d, "block")
    draw_mouth(d, "smile")


def avatar04(d):
    """金发骑士 · 黄金少年"""
    draw_shoulders(d, "RED", shade="PUR")
    draw_head(d, "SKN", shadow="BRN")
    # L2 后发：垂到肩的金色长发（先画，脸会盖住中央）
    box(d, 14, 22, 17, 51, "GLD")
    box(d, 46, 22, 49, 51, "GLD")
    # L4 前发：金色圆顶 + 中央分缝 + 尖发梢（实心，无破洞）
    rows(d, [(7, 27, 36), (8, 24, 39), (9, 22, 41), (10, 20, 43),
             (11, 19, 44), (12, 18, 45), (13, 18, 45), (14, 17, 46),
             (15, 17, 46), (16, 16, 47), (17, 16, 47)], "GLD")
    box(d, 16, 17, 47, 24, "GLD")               # 发团主体（实心，封住顶部）
    box(d, 31, 8, 32, 20, "ORG")                # 中缝
    box(d, 17, 24, 26, 24, "ORG")               # 刘海下沿阴影（仅两侧，中间留亮）
    box(d, 37, 24, 46, 24, "ORG")
    box(d, 16, 25, 47, 25, "GLD")
    box(d, 28, 26, 35, 28, "GLD")               # 中央刘海小尖
    poly(d, [(16, 25), (16, 32), (20, 32), (21, 25)], "GLD")   # 左侧发梢
    poly(d, [(47, 25), (47, 32), (43, 32), (42, 25)], "GLD")
    draw_brows(d, "arch", color="BRN")
    draw_eyes(d, "block")
    box(d, 24, 32, 25, 32, "WHT")               # 眼内高光
    box(d, mirror_x(25), 32, mirror_x(24), 32, "WHT")
    draw_mouth(d, "smile")


def avatar05(d):
    """银灰老者 · 白须智者"""
    draw_shoulders(d, "PUR", shade="BLK")
    draw_head(d, "SKN", shadow="BRN")
    # L4 前发：银灰短发 + 鬓角
    box(d, 15, 17, 48, 22, "SIL")
    poly(d, [(15, 22), (15, 32), (18, 32), (19, 22)], "SIL")
    poly(d, [(48, 22), (48, 32), (45, 32), (44, 22)], "SIL")
    box(d, 15, 22, 48, 23, "GRY")               # 发根阴影（花白）
    box(d, 22, 17, 33, 18, "GRY")
    box(d, 26, 15, 37, 16, "SIL")
    # L5 皱纹：额头一道 + 眼下眼袋，避免多条平行线糊成一条
    box(d, 25, 25, 38, 25, "GRY")
    sym_box(d, 21, 34, 26, 34, "GRY")
    draw_brows(d, "arch", color="SIL")
    draw_eyes(d, "block", y0=30, y1=32)
    # L6 配饰：大胡子 + 八字须
    box(d, 21, 41, 42, 42, "WHT")               # 八字须
    box(d, 20, 42, 43, 56, "WHT")               # 胡子主体
    poly(d, [(20, 56), (31, 56), (26, 58), (24, 56)], "WHT")
    poly(d, [(43, 56), (32, 56), (37, 58), (39, 56)], "WHT")
    box(d, 24, 43, 39, 44, "GRY")               # 胡须阴影
    box(d, 31, 45, 32, 52, "GRY")               # 中缝
    rows(d, [(45, 25, 38), (46, 24, 39), (47, 23, 40), (48, 22, 41),
             (49, 22, 41), (50, 22, 41), (51, 23, 40), (52, 25, 38)], "WHT")
    box(d, 28, 44, 35, 44, "BLK")               # 藏在须间的嘴
    draw_brows(d, "arch", color="SIL")


def avatar06(d):
    """暗紫神秘 · 影中术士"""
    draw_shoulders(d, "NVY", shade="BLK")
    # L2 兜帽外轮廓：圆帽顶 + 外扩垂坠的帽身（剪影与 A5 的方正造型区分）
    rows(d, [(6, 30, 33), (7, 28, 35), (8, 26, 37), (9, 24, 39), (10, 23, 40),
             (11, 22, 41), (12, 21, 42), (13, 20, 43), (14, 20, 43)], "PUR")
    rows(d, [*[(y, 18, 45) for y in range(15, 31)],
             *[(y, 17, 46) for y in range(31, 49)],
             *[(y, 16, 47) for y in range(49, 55)]], "PUR")
    # L3 帽内暗部（脸部凹槽）
    poly(d, [(32, 15), (44, 29), (44, 52), (20, 52), (20, 29)], "NVY")
    # L3 脸（被暗部压住的肤色，范围偏小）
    rows(d, [(22, 25, 38), (23, 23, 40), *[(y, 22, 41) for y in range(24, 46)],
             (46, 23, 40), (47, 25, 38)], "SKN")
    box(d, 22, 30, 23, 34, "BRN")               # 颊侧阴影
    box(d, 40, 30, 41, 34, "BRN")
    # L4 兜帽前沿（压在脸上方，形成阴影）
    poly(d, [(32, 16), (46, 30), (43, 30), (32, 21), (21, 30), (18, 30)], "PUR")
    box(d, 20, 21, 43, 22, "BLK")               # 帽檐投影
    box(d, 16, 55, 47, 55, "BLK")               # 帽底与肩的分隔（不与肩共用描边）
    # L6 发光的眼睛（无眼白，术士感）
    sym_box(d, 24, 31, 27, 33, "CYN")
    box(d, 25, 32, 26, 32, "BLK")
    box(d, mirror_x(26), 32, mirror_x(25), 32, "BLK")
    box(d, 28, 45, 35, 45, "BLK")               # 冷峻的嘴
    box(d, 17, 58, 46, 59, "PUR")               # 衣摆暗纹


BUILDERS = [
    ("avatar_01", "热血红发", "红色刺猬头 + 金头带的暴躁少年，一眼热血", "RED", avatar01),
    ("avatar_02", "冷静蓝发", "蓝色中分 + 黑框眼镜的文气学长，沉着冷静", "BLU", avatar02),
    ("avatar_03", "绿帽小子", "绿头帽 + 帽徽的丛林探险家，活泼跳脱", "GRN", avatar03),
    ("avatar_04", "金发骑士", "金色偏分长发 + 红披肩，自信阳光", "GLD", avatar04),
    ("avatar_05", "白须智者", "银灰短发 + 大胡子的长者，严肃而沧桑", "SIL", avatar05),
    ("avatar_06", "暗影术士", "紫色兜帽遮面 + 青色发光眼，神秘阴冷", "PUR", avatar06),
]


# ---------------------------------------------------------------- 16x16 网格（战牌专用）
# 手工重绘，不是 NN 降采样：16px 下机械降采样会把眼睛/嘴糊掉。
# 字符图例（'.' = 透明）；保持与 64 网格同一套主色与识别线索（发型/配件/眼型），确保「同一个人」。
LEGEND = {
    ".": None,
    "k": "BLK", "p": "PUR", "n": "NVY", "g": "GRY", "b": "BRN", "d": "DGR",
    "r": "RED", "o": "OLV", "u": "BLU", "O": "ORG", "s": "SIL", "G": "GRN",
    "S": "SKN", "c": "CYN", "y": "GLD", "w": "WHT",
}

MAPS = {
    # 热血红发：4 尖刺 + 金头带 + 方眼 + 短嘴
    "avatar_01": [
        "................",
        "...r..r..r..r...",
        "..rrrrrrrrrrrr..",
        "..rrrrrrrrrrrr..",
        "..yyyyyyyyyyyy..",
        "..rrSSSSSSSSrr..",
        "..SSSSSSSSSSSS..",
        "..SSSSSSSSSSSS..",
        "..SSkkSSSSkkSS..",
        "..SSkkSSSSkkSS..",
        "..SSSSSSSSSSSS..",
        "..SSSSkkkkSSSS..",
        "...SSSSSSSSSS...",
        "..nnnnnnnnnnnn..",
        "..nnnnnnnnnnnn..",
        "................",
    ],
    # 冷静蓝发：圆锅盖（无尖角）+ 黑框眼镜 + 蓝虹膜
    # 注意：镜框各行左右必须保 1px 肤色（col2/col13），否则描边会把镜框行灌成黑带
    "avatar_02": [
        "................",
        "....uuuuuuuu....",
        "..uuuuuuuuuuuu..",
        "..uuuuuuuuuuuu..",
        "..uuuuuuuuuuuu..",
        "..uuSSSSSSSSuu..",
        "..SSSSSSSSSSSS..",
        "..SkkkkSSkkkkS..",
        "..SkwwkkkkwwkS..",
        "..SkuukSSkuukS..",
        "..SkkkkSSkkkkS..",
        "..SSSSSSSSSSSS..",
        "..SSSSkkkkSSSS..",
        "...SSSSSSSSSS...",
        "..gggggggggggg..",
        "................",
    ],
    # 绿帽小子：绿帽 + 宽帽檐 + 黄帽徽 + 微笑
    "avatar_03": [
        "................",
        ".....GGGGGG.....",
        "...GGGGGGGGGG...",
        "..GGGGGyyGGGGG..",
        "..GGGGGGGGGGGG..",
        ".dddddddddddddd.",
        "..GGSSSSSSSSGG..",
        "..SSSSSSSSSSSS..",
        "..SSkkSSSSkkSS..",
        "..SSkkSSSSkkSS..",
        "..SSSSSSSSSSSS..",
        "..SSSSkkkkSSSS..",
        "...SSSSSSSSSS...",
        "..dddddddddddd..",
        "..dddddddddddd..",
        "................",
    ],
    # 金发骑士：金色长发（两侧垂落）+ 红肩
    "avatar_04": [
        "................",
        "....yyyyyyyy....",
        "..yyyyyyyyyyyy..",
        "..yyyyyyyyyyyy..",
        "..yyyyyyyyyyyy..",
        ".yySSSSSSSSSSyy.",
        ".yySSSSSSSSSSyy.",
        ".yySSSSSSSSSSyy.",
        ".yykkSSSSSSkkyy.",
        ".yykkSSSSSSkkyy.",
        ".yySSSSSSSSSSyy.",
        ".yySSSkkkkSSSyy.",
        ".yySSSSSSSSSSyy.",
        "..yySSSSSSSSyy..",
        "..rrrrrrrrrrrr..",
        "................",
    ],
    # 白须智者：银灰发 + 大白胡 + 藏须间的嘴
    "avatar_05": [
        "................",
        "..ssssssssssss..",
        "..ssssssssssss..",
        "..ssssssssssss..",
        "..gggggggggggg..",
        "..SSSSSSSSSSSS..",
        "..SSSSSSSSSSSS..",
        "..SSSSSSSSSSSS..",
        "..SSkkSSSSkkSS..",
        "..SSkkSSSSkkSS..",
        "..wwwwwwwwwwww..",
        ".wwwwwwkkwwwwww.",
        ".wwwwwwwwwwwwww.",
        "..wwwwwwwwwwww..",
        "..pppppppppppp..",
        "................",
    ],
    # 暗影术士：紫兜帽 + 帽内暗部 + 帽檐投影 + 青色发光眼
    "avatar_06": [
        "................",
        ".....pppppp.....",
        "...pppppppppp...",
        "..pppppppppppp..",
        "..pppppppppppp..",
        "..pppppppppppp..",
        "..ppnnnnnnnnpp..",
        "..pnkkkkkkkknp..",
        "..pnSSSSSSSSnp..",
        "..pnSccSSccSnp..",
        "..pnSccSSccSnp..",
        "..pnSSSSSSSSnp..",
        "..pnSSkkkkSSnp..",
        "..pnSSSSSSSSnp..",
        "..pnnnnnnnnnnp..",
        "................",
    ],
}


def render_map(rows):
    """按字符地图在 16x16 逻辑画布上绘制，并加 1px 外描边。"""
    assert len(rows) == SMALL, "地图行数 %d != %d" % (len(rows), SMALL)
    img = Image.new("RGBA", (SMALL, SMALL), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        assert len(row) == SMALL, "第 %d 行长度 %d != %d: %r" % (y, len(row), SMALL, row)
        for x, ch in enumerate(row):
            assert ch in LEGEND, "第 %d 行第 %d 列出现未知色字符 %r" % (y, x, ch)
            key = LEGEND[ch]
            if key:
                px[x, y] = OPAQUE(key)
    return add_outline(img, "BLK")


# ---------------------------------------------------------------- 描边 / 放大
def add_outline(img, key="BLK"):
    """给整个不透明剪影加 1px 外描边（在剪影外侧，不覆盖内容）。"""
    a = img.getchannel("A")
    grown = a.filter(ImageFilter.MaxFilter(3))     # 3x3 膨胀
    ring = ImageChops.subtract(grown, a)           # 膨胀 - 原始 = 外环
    layer = Image.new("RGBA", img.size, OPAQUE(key)[:3] + (0,))
    layer.putalpha(ring)
    return Image.alpha_composite(layer, img)       # 外环垫在底下


def render(build):
    c = canvas()
    d = ImageDraw.Draw(c)
    build(d)
    return add_outline(c)


def upscale(img):
    """Nearest 整数倍放大，保持硬像素块。"""
    return img.resize((EXPORT, EXPORT), Image.Resampling.NEAREST)


# ---------------------------------------------------------------- 校验
def check_one(path, expect_opaque_palette=True):
    im = Image.open(path)
    problems = []
    if im.size != (EXPORT, EXPORT):
        problems.append("尺寸 %s != %d" % (im.size, EXPORT))
    if im.mode != "RGBA":
        problems.append("模式 %s != RGBA" % im.mode)
    px = list(im.getdata())
    opaque = [p for p in px if p[3] > 0]
    trans = len(px) - len(opaque)
    bad = Counter(p[:3] for p in opaque if p[:3] not in DB16_SET)
    if trans == 0:
        problems.append("没有透明像素")
    if expect_opaque_palette and bad:
        top = bad.most_common(3)
        problems.append("有 %d 种越界颜色，如 %s" % (len(bad), top))
    colors = Counter(p[:3] for p in opaque)
    return problems, trans, colors


def build_compare():
    """生成 64/16 双网格并排对照图（供人工核「同一张脸」，非运行时资产）。

    上排 = 64 网格（选择器显示 128px）；下排 = 16 网格（战牌显示 64px）。
    两排都归一化到同一格尺寸便于比脸；下排按真实显示倍率还原，颗粒比上排粗 2 倍（可见）。
    输出到 raw/（非运行时目录），不污染 px 包体。
    文件名 `_compare.png` 沿用本项目「`_` 前缀 = 派生/非运行时」约定（同 `assets/px/_sheet.png`）。
    """
    from PIL import ImageFont  # Pillow 自带默认字体，不引外部字体文件
    cell, label_w = 256, 210
    cols = len(BUILDERS)
    sheet = Image.new("RGB", (cell * cols + label_w, cell * 2), (24, 24, 32))
    for i, (aid, name, *_rest) in enumerate(BUILDERS):
        x = label_w + i * cell
        top = Image.open(os.path.join(DIR_PX, "%s_64.png" % aid)).convert("RGBA")
        top = top.resize((128, 128), Image.Resampling.NEAREST).resize((cell, cell), Image.Resampling.NEAREST)
        bot = Image.open(os.path.join(DIR_PX, "%s_16.png" % aid)).convert("RGBA")
        bot = bot.resize((64, 64), Image.Resampling.NEAREST).resize((cell, cell), Image.Resampling.NEAREST)
        sheet.paste(top, (x, 0), top)
        sheet.paste(bot, (x, cell), bot)

    d = ImageDraw.Draw(sheet)
    for i in range(1, cols + 1):
        xx = label_w + i * cell
        d.line([(xx, 0), (xx, cell * 2)], fill=(58, 58, 70), width=1)
    d.line([(0, cell), (cell * cols + label_w, cell)], fill=(240, 200, 80), width=3)
    try:
        font = ImageFont.load_default(size=22)
        font_s = ImageFont.load_default(size=17)
    except TypeError:
        font = font_s = ImageFont.load_default()
    d.text((14, cell // 2 - 46), "64 grid x8", fill=(220, 230, 240), font=font)
    d.text((14, cell // 2 - 20), "-> selector", fill=(150, 200, 255), font=font_s)
    d.text((14, cell // 2 - 2), "display 128px", fill=(140, 150, 165), font=font_s)
    d.text((14, cell + cell // 2 - 46), "16 grid x32", fill=(220, 230, 240), font=font)
    d.text((14, cell + cell // 2 - 20), "-> boss banner", fill=(150, 220, 160), font=font_s)
    d.text((14, cell + cell // 2 - 2), "display 64px", fill=(140, 150, 165), font=font_s)

    out = os.path.join(DIR_RAW, "_compare.png")
    sheet.save(out, format="PNG", optimize=True)
    print("  对照图 -> %s  (%dx%d)" % (out, sheet.width, sheet.height))
    return out


def write_md5_manifest():
    """写出口径无关的 per-file 校验清单 px/avatars/MANIFEST.md5。

    为什么需要它：把 `md5sum *.png | md5sum` 那个「合并值」当回归锚点是错的——
    它哈希的是 md5sum 的输出文本，**内含绝对路径**，换个路径前缀值就变，无法复现/审计。
    正确做法是 per-file 清单：任何人都能 `cd assets/px/avatars && md5sum -c MANIFEST.md5` 验证。
    格式 = md5sum 原生格式（<hash><两空格><filename>），只收 12 张运行时 PNG。
    """
    import hashlib
    files = sorted(f for f in os.listdir(DIR_PX) if f.startswith("avatar_") and f.endswith(".png"))
    lines = []
    for name in files:
        with open(os.path.join(DIR_PX, name), "rb") as fh:
            digest = hashlib.md5(fh.read()).hexdigest()
        lines.append("%s  %s" % (digest, name))
    out = os.path.join(DIR_PX, "MANIFEST.md5")
    with open(out, "w", encoding="ascii", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")
    print("  校验清单 -> %s  (%d 行，`cd assets/px/avatars && md5sum -c MANIFEST.md5`)" % (out, len(lines)))
    return out


# ---------------------------------------------------------------- 主流程
def dominant(color_counter, limit=5):
    out = []
    for rgb, n in color_counter.most_common(limit):
        out.append({"hex": "#%02x%02x%02x" % rgb, "name": HEX_BY_RGB.get(rgb, "?"), "px": n})
    return out


def generate():
    os.makedirs(DIR_PX, exist_ok=True)
    os.makedirs(DIR_RAW, exist_ok=True)
    manifest = []
    print("== 生成 6 个预设像素头像（两套网格）==")
    for aid, name, brief, main, build in BUILDERS:
        # --- 64 网格：选择器专用 ---
        logical = render(build)                    # 64x64，已含描边
        big = upscale(logical)                     # 512x512
        f_px = "%s_64.png" % aid
        f_raw = "%s_64x_source.png" % aid
        big.save(os.path.join(DIR_PX, f_px), format="PNG", optimize=True)
        logical.save(os.path.join(DIR_RAW, f_raw), format="PNG", optimize=True)
        colors = Counter(p[:3] for p in logical.getdata() if p[3] > 0)

        # --- 16 网格：战牌专用（手工重绘，与相框 boss_head_frame_a 孔径对齐：孔径 16 逻辑 px） ---
        small = render_map(MAPS[aid])               # 16x16，已含描边
        small_big = small.resize((EXPORT, EXPORT), Image.Resampling.NEAREST)   # x32 = 512
        f_sml = "%s_16.png" % aid
        f_sml_raw = "%s_16x_source.png" % aid
        small_big.save(os.path.join(DIR_PX, f_sml), format="PNG", optimize=True)
        small.save(os.path.join(DIR_RAW, f_sml_raw), format="PNG", optimize=True)
        colors16 = Counter(p[:3] for p in small.getdata() if p[3] > 0)

        manifest.append({
            "id": aid, "name": name, "brief": brief,
            "mainColor": HEX[main],
            # 选择器专用（64 网格）
            "file": f_px, "source64": f_raw,
            "dominantColors": dominant(colors, 5), "colorCount": len(colors),
            "logical": "%dx%d" % (LOGICAL, LOGICAL), "scale": SCALE,
            # 战牌专用（16 网格）
            "file16": f_sml, "source16": f_sml_raw,
            "dominantColors16": dominant(colors16, 5), "colorCount16": len(colors16),
            "logical16": "%dx%d" % (SMALL, SMALL), "scale16": SMALL_SCALE,
            # 公共
            "export": "%dx%d" % (EXPORT, EXPORT),
        })
        print("  %-9s %-6s %-6s | 64 色数=%2d -> %s | 16 色数=%2d -> %s"
              % (aid, name, HEX[main], len(colors), f_px, len(colors16), f_sml))

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({
            "palette": "DB16",
            "export": EXPORT,
            "grids": {
                "64": {"logical": LOGICAL, "scale": SCALE, "usedBy": "开局头像选择器"},
                "16": {"logical": SMALL, "scale": SMALL_SCALE, "usedBy": "Boss 头顶出战牌（与相框 boss_head_frame_a 孔径对齐，孔径 16 逻辑 px）"},
            },
            "avatars": manifest,
        }, f, ensure_ascii=False, indent=2)
    print("  清单 -> %s" % MANIFEST)
    build_compare()
    write_md5_manifest()
    return manifest


def validate():
    print("\n== DB16 硬校验（扫描 512 导出 PNG，两套网格）==")
    ok = True
    for aid, name, _b, _m, _f in BUILDERS:
        for tag_grid, suffix in (("64", "64"), ("16", "16")):
            path = os.path.join(DIR_PX, "%s_%s.png" % (aid, suffix))
            if not os.path.exists(path):
                print("  [缺失] %s" % path)
                ok = False
                continue
            problems, trans, colors = check_one(path)
            tag = "PASS" if not problems else "FAIL"
            if problems:
                ok = False
            print("  [%s] %s %s (%s 网格)  不透明色=%d 透明像素=%d  色数=%d"
                  % (tag, aid, name, tag_grid, sum(colors.values()), trans, len(colors)))
            for p in problems:
                print("        ! %s" % p)
    print("== 校验结果：%s ==" % ("全部通过" if ok else "存在失败项"))
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不生成")
    args = ap.parse_args()
    if not args.check:
        generate()
    ok = validate()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
