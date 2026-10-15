# shared/ — 跨特效复用的公共资源

> 对应 `AGENTS.md §八` 目录约定与 `effects/ar-boss-raid/tech-spec.md §2.3`。
> 本目录放**所有特效共用**的东西，不放单个特效的资产。

## DB16 调色板（唯一合法色板，见 `AGENTS.md §三`）

同时提供了多种格式，按你的工具挑一个用：

| 文件 | 用途 | 谁在用 |
|---|---|---|
| `db16.gpl` | **GIMP / Aseprite / Krita / Photoshop** 通用调色板 | 手绘像素图时加载 |
| `db16.png` | **16×1**，每像素一色的最小色板图（索引取色用） | 脚本、`pixelize.py` 量化时使用 |
| `db16.json` | `{name, hex}[]` 结构化数据 | Python 脚本 `tools/pixelize.py` |
| `db16.css` | CSS 变量 `--db16-*` | 网页/文档里展示色板 |
| `db16_strip_512x32.png` | 512×32 目视色卡（每色 32×32） | 人眼核对、文档插图 |

## 色值表（16 色，禁止超出）

| # | Hex | 名称 | # | Hex | 名称 |
|---|---|---|---|---|---|
| 01 | `#140c1c` | Deep midnight | 09 | `#597dce` | Cornflower |
| 02 | `#442434` | Dark plum | 10 | `#d27d2c` | Orange tan |
| 03 | `#30346d` | Deep navy | 11 | `#8595a1` | Steel gray |
| 04 | `#4e4a4e` | Dark slate | 12 | `#6daa2c` | Foliage |
| 05 | `#854c30` | Brown rust | 13 | `#d2aa99` | Tan skin |
| 06 | `#346524` | Dark olive | 14 | `#6dc2ca` | Sky cyan |
| 07 | `#d04648` | Brick red | 15 | `#dad45e` | Pale gold |
| 08 | `#757161` | Warm gray | 16 | `#deeed6` | Bone white |

## 三条硬约束（不可绕过）

1. **禁止 `#ffffff`** —— 需要"白"时用 `#deeed6`（DB16-16 Bone white）。见 `ar-boss-raid/README.md §三`。
2. **禁止 `#d04648`（Brick red）出现在受击/命中反馈里** —— 会被读成血。去暴力化要求。
3. **新增颜色必须先改 `AGENTS.md`** 并走 §四 变更流程，不能在本目录偷偷加。

## 素材管线

任何 AI 生成或手绘原图，**必须**经 `effects/*/tools/pixelize.py`（中值压平 → BOX 降采样 → DB16 硬量化 → Nearest 整数倍放大）处理后才能进 `effects/*/assets/px/`。

**未经处理的原图一律禁止放进 `project/Assets/`** —— 那是 Effect House 的导入区，进去就可能被打包。
