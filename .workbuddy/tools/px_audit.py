"""一次性像素合规审计：检查 project/Assets 下 PNG 是否符合宪法 §三。"""
import pathlib
import sys
from PIL import Image

DB16 = {
    (0x14, 0x0c, 0x1c), (0x44, 0x24, 0x34), (0x30, 0x34, 0x6d), (0x4e, 0x4a, 0x4e),
    (0x85, 0x4c, 0x30), (0x34, 0x65, 0x24), (0xd0, 0x46, 0x48), (0x75, 0x71, 0x61),
    (0x59, 0x7d, 0xce), (0xd2, 0x7d, 0x2c), (0x85, 0x95, 0xa1), (0x6d, 0xaa, 0x2c),
    (0xd2, 0xaa, 0x99), (0x6d, 0xc2, 0xca), (0xda, 0xd4, 0x5e), (0xde, 0xee, 0xd6),
}


def audit(folder):
    rows = []
    for f in sorted(pathlib.Path(folder).glob('*.png')):
        try:
            im = Image.open(f).convert('RGBA')
        except Exception as exc:  # noqa: BLE001
            rows.append((f.name, 'ERR', str(exc), '', '', ''))
            continue
        cols = im.getcolors(maxcolors=1 << 22) or []
        opaque = [(c, cnt) for cnt, c in cols if c[3] > 0]
        bad = [c for c, _ in opaque if (c[0], c[1], c[2]) not in DB16]
        white = [c for c, _ in opaque if (c[0], c[1], c[2]) == (255, 255, 255)]
        semi = sum(cnt for cnt, c in cols if 0 < c[3] < 255)
        integer8 = im.size[0] % 8 == 0 and im.size[1] % 8 == 0
        rows.append((f.name, f'{im.size[0]}x{im.size[1]}', str(len(cols)),
                     str(len(bad)), f'white={len(white)}', f'semi={semi}',
                     'x8' if integer8 else 'NOT-x8'))
    return rows


if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else 'project/Assets'
    print(f'{"file":36s} {"size":11s} {"cols":>6s} {"bad":>5s} {"white":>7s} {"semi":>9s} int8')
    for r in audit(target):
        print(f'{r[0]:36s} {r[1]:11s} {r[2]:>6s} {r[3]:>5s} {r[4]:>7s} {r[5]:>9s} {r[6]}')
