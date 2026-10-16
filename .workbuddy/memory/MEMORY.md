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
- **完整流程（照抄）**：`health` → `list_instances`（拿 instance_id，本项目 = `"1"`）→ `get_project_context`（内含 `workspace.skills_root` / `rules`）→ **`update_handoff_context` 逐字登记用户消息链（先做，否则不许改场景）** → 读 `skills_root/general/SceneEditing/SKILL.md` → `edit_by_dsl`。
- **改对象位置/尺寸一律用 `set_component`**（不存在 `update_screen_transform` 之类命令）：
  `{"command_type":"set_component","params":{"guid":"<组件GUID>","properties":{"anchoredPosition":{"x":318,"y":-126.5},"sizeDelta":{"x":192,"y":165}}}}`
  组件 GUID 直接传（`c61`），别用 `{"$ref":..,"component_type":..}` 包字面 GUID。`properties` 是**对象**不是数组。会回显 before/after。
- **ScreenTransform 只写 `anchoredPosition` / `sizeDelta`**，别写派生的 `offsets`。
- **屏幕坐标换算**：`screenX = 360 + anchoredPosition.x`，`screenY = 640 − anchoredPosition.y`（画布 720×1280，锚点 0.5/0.5，PPU 32）。
- **像素素材上屏必须整数倍**：显示尺寸 ÷ 逻辑画布必须为整数（否则半像素）。战弩：逻辑 64×55 → 显示 192×165 = 3×。
- **改贴图没有专用命令**：需 `import_resource` + `set_component{texture}`；**覆盖 `project/Assets/` 源文件不保证编辑器自动重导**。
- 连接器 `xiangsu-mcp-manager` → `ToolSearch` + `DeferExecuteTool` 两步调用。
- **短 id（`s1`/`c5`/`r3`）可直接当 GUID 传参，但不能塞进 `$ref`**；`$ref` 只认同批次内定义的 alias。
- **enum 值必须包成 `{"type":"Enum","data":"Nearest"}`**；`properties` 是**对象不是数组**。
- **`add_builtin_object` 带 `parent` = 先建再 move**；move 失败会留**孤儿对象在根层**。失败会 skip 后续命令，但已执行的不回滚。
- **新子对象插到父的最前面**（renderOrder 按 DFS 编号）→ 后建的在下层；用 `move_scene_object{above_scene_object}` 修正。
- 组件 GUID 用 `get_scene(summary=false)` 一次全取。
- **包体判据实测值**：真·DB16 硬边 128 逻辑帧 = **3.2–3.6 KB/帧**（阈值 26.8 KB）；AI 插画直导 = **73.9 KB/帧**（破线）。→ **必须走像素化流水线**（`tools/pixelize.py`：中值压平 → BOX 降采样 → DB16 硬量化 → Nearest 整数倍放大）。
- **像塑没有用户选图能力**（本版）：Image Picker 场景对象与资源双重不可创建，APJS 无 picker API。
- 验收序列清场用 `reset_preview`；**`start_preview_record` 会触发开拍重置**，不要用它当清场手段。
- **收工必存盘**（2026-10-16 作者指定，**就此推翻此前"不调 `save_project`"的旧约定**）：
  凡改过工程（脚本 / 场景 / 参数）且编译通过，**收工前自己调一次 `save_project` 落盘，不要让作者手动 Ctrl+S。**
  理由：编辑器自带的 `[Backup] Autosave` 是 **10 分钟一次的备份副本**（拷到 `Instances\InstanceN\Backup\<时间戳>_x\`），
  **不写回工程主文件** —— 不存盘 = 编辑器一关改动全丢（作者已踩过：战弩位置反复"变回去"）。
  - 正常走 MCP 工具 `save_project`；连接器不灵时直连网关
    `POST http://127.0.0.1:17320/mcp`，body `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"save_project","arguments":{"instance_id":"1"}}}`（**须绕代理**）。
  - 只读探针 `project_status` 返回 `is_saved` / `is_changed` / `scene_dirty`，可判断是否真有改动。
  - 备用：`tools/xs_autosave.py`（外挂守护，默认 3 秒轮询脏标记自动存）。作者说过"那算了"→ **不主动推他启动**，
    他哪天想全自动再说（双击 `tools/autosave.cmd`）。
