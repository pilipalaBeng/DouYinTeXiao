# DouYinTeXiao 项目长期记忆

## 项目定位
- 抖音**像素风 AR 特效**，目标**上架抖音特效开放平台**（Effect House 提审）。
- 代码/产出目录：`D:\Project\DouYinTeXiao`；生产工具是官方 **Effect House**，本目录只出"制作与提审准备包"。

## 最高规则
- 宪法就是根目录 `AGENTS.md`（单文件版，用户明确要极简、省 token）。
- **规则优先级：合规 > 平台边界 > 像素规格 > 其他。**
- 合规红线与平台边界**不可通过项目内部决议放宽**；像素规格数字改动须在 AGENTS.md「变更记录」追加一行。

## 像素规格死参数（不许随手改）
| 项 | 值 |
|---|---|
| 逻辑画布 | 64×64（大元素 96/128，仅整数倍） |
| 导出 | ×8 → 512×512 PNG 透明 |
| 色板 | DB16 固定 16 色 |
| 采样 | Nearest Neighbor |
| 上限 | 图层≤6 / 粒子≤50 / 包体≤2MB / 帧≤24 |

## 文档纪律（多文档共享数值必守）
- **共享数值必须单一来源 + 每轮全库 grep 残留扫描**。否则"结论对、数字错/依据错"会静默传播（已抓 8 起）。
- 单一来源表：hitstop→`vfx-spec §6.1`；对齐点偏移→`animation-spec §5.2`；包体→`tech-spec §3.2`/§3.2.1；帧数→`AGENTS.md §三`+`animation-spec §9.2`；脚本结构→`implement-plan §2.0.2`。
- **禁止伪证据**：工程未开始不得写"实测"（应为"规划/预期"）；不得给无条件达标断言（须挂 caveat）。
- **口径澄清后要同步到"可执行执行项"**：只改宪法/清单不够，门禁行、验收行也得一起改（否则执行者按错口径误判）。

## 协作约定
- AI 行为：问答先于生成（用途/对象/风格三问齐了才动手）；写盘前确认路径；交付必带合规清单。
- 特效工程包放 `effects/<slug>/`，跨特效复用素材放 `shared/`。
- 配套专家技能：`dy-effect-creator`（该专家已在本项目启用）。

## 像塑 MCP 实操要点（跨特效通用，踩过的坑）
- 连接器 `xiangsu-mcp-manager` → `ToolSearch` + `DeferExecuteTool` 两步调用。
- **短 id（`s1`/`c5`/`r3`）可直接当 GUID 传参，但不能塞进 `$ref`**；`$ref` 只认同批次内定义的 alias。
- **enum 值必须包成 `{"type":"Enum","data":"Nearest"}`**；`properties` 是**对象不是数组**。
- **`add_builtin_object` 带 `parent` = 先建再 move**；move 失败会留**孤儿对象在根层**。失败会 skip 后续命令，但已执行的不回滚。
- **新子对象插到父的最前面**（renderOrder 按 DFS 编号）→ 后建的在下层；用 `move_scene_object{above_scene_object}` 修正。
- 组件 GUID 用 `get_scene(summary=false)` 一次全取。
- **包体判据实测值**：真·DB16 硬边 128 逻辑帧 = **3.2–3.6 KB/帧**（阈值 26.8 KB）；AI 插画直导 = **73.9 KB/帧**（破线）。→ **必须走像素化流水线**（`tools/pixelize.py`：中值压平 → BOX 降采样 → DB16 硬量化 → Nearest 整数倍放大）。
- **像塑没有用户选图能力**（本版）：Image Picker 场景对象与资源双重不可创建，APJS 无 picker API。
- 验收序列清场用 `reset_preview`；**`start_preview_record` 会触发开拍重置**，不要用它当清场手段。
- 本 workflow **不调 `save_project`**，结尾必须提醒用户自行保存工程。
