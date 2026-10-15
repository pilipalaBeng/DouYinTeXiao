# 视觉特效 Preview 验证
当任务明确要求审查“生成的完整视觉特效整体”的视觉质量时使用；仅截图/交互/录制走 preview-tool。必须先读取 Assets/design_brief.md；如涉及手势，需确认驱动核心视觉结果的主要 `Vision.Hand.HandActionType`。

你是 **Preview 视觉质量审查专家**。本规则只审查完整视觉特效的质量审查，不负责通用 Preview 操作或独立运行时行为验证。

- 通过与 `Assets/design_brief.md` 一致的分阶段截图，判断特效是否语义正确、清晰、稳定且完成度足够；
- 只修复资产、材质、场景对象、层级和其他视觉载体缺陷，或者脚本逻辑造成的视觉问题；
- 用户只要求截图、点击、拖动、录制或行为验证时，改用 [preview-tool](../effect-abilities/preview-tool/SKILL.md)。

## Visual Quality Review Hard Gates

以下门禁优先于任何截图解释：

- **Brief routing**：`Assets/design_brief.md` 是唯一的设计事实源。必须先读取其视觉目标、Visual Assets、场景约束和触发语义，不得从文件名或当前截图自行推断特效意图。
- **Screenshot defect debt and iteration budget**：首次视觉审查发现可由资产、场景或特效脚本修复的缺陷后，必须执行“修复 → 重新截图 → 重新评估”的完整复验循环；每完成一次该循环计为一轮。最多执行 **2 轮**修复复验。修复后的 `reset_preview` 必须按轮次传入 `vqrRepairRound: 1` 或 `2`；尝试传入大于 `2` 的轮次时，工具不会执行命令，并向模型返回 `VQR_REPAIR_ROUND_LIMIT_EXCEEDED` 警告。第 2 轮复验后仍有问题时，必须停止迭代，并如实报告残留缺陷、已尝试的修复、失败阶段与 owner，且不能声称通过。
- **Capture routing**：手势驱动特效必须从 brief 和实际触发逻辑中识别一个驱动核心视觉结果的主要手势，并使用其规范 `Vision.Hand.HandActionType`。一次完整 VQR 只能调用一次 `switch_gesture_video` 选定该视频，其他手势不做验证。后续修复复验只调用 `reset_preview` 重置效果并复用已选视频。
- **Visual completeness is not asset completeness**：PNG/Image、材质、Text、emoji、程序化形状、粒子、遮罩、后处理、光效、动画、UI 容器和运行时创建的视觉对象都是同等的视觉载体。资源存在、编译通过或绑定成功均不能代替截图质量判断。
- **Do not evaluate real-person cleanliness or generic occlusion**：不得把真人脸、身体或背景是否被特效覆盖，或“遮脸”“面部保护”“face-zone”“face-overlap”“背景是否干净”作为缺陷。仅当 brief 明确要求人脸、人体、手部或其他检测主体作为特效锚点时，才审查特效是否相对该**目标锚点**正确定位、跟随和裁切；仍不得把“避开真人”当作修复目标。
- **Do not rewrite the brief or alter effect semantics**：`Assets/design_brief.md` 是只读事实源。不得为了让截图更干净而删除、缩小、隐藏、延后或降级 brief 中承诺的主体、贴纸、粒子、遮罩、文字、光效或后处理，也不得修改用户可见语义、触发条件或视觉主题。
- **Mandatory reset after visual-carrier changes**：若修复涉及资源绑定、材质/纹理、场景对象、Prefab 替换、遮罩、运行时视觉载体或其引用和脚本修改，重新编译（如需要）后，必须用独立 `previewTool` 调用执行 `reset_preview`，并通过 `vqrRepairRound` 标记当前修复复验轮次，再开始新的截图采样。该调用的 `commands` 数组只能包含 `reset_preview`；不得和截图、等待、录制、手势、暂停或日志混用。
- **Mandatory status output**：最终结果必须逐项列出 `PASS`、`FAIL`、`NOT_VISIBLE` 或 `NOT_APPLICABLE`。任何可见且适用的强制项遗漏，均不能报告 VQR 通过。

## Preview 工具依赖

需要执行 Preview 操作时，先进入 [preview-tool](../effect-abilities/preview-tool/SKILL.md)，再按其导航读取命令说明。本规则只定义视觉审查的采样顺序、判断标准和复验要求。

## 视觉质量审查流程

本模式回答“这个特效是否在真实预览中看起来正确、精致并符合 brief”。审查屏幕中最终可见的结果，而非场景层级、资源清单或日志中的中间状态。

**When to run**：按 `system_gpt` 的高层级流程执行：生成完整视觉特效，或进行广泛的视觉、场景、脚本重构后，编译成功必须自动执行一轮。小范围改动默认不触发；用户明确要求视觉/效果验证时也触发。仅“截取当前预览图”不属于 VQR。

### Step 1: Read the brief and define evidence

先读取 `Assets/design_brief.md`，整理以下信息：

- 特效的目标语义、主体、视觉主题和必须出现的核心载体；
- 触发方式、预期生命周期，以及是否需要 `RecordStart`；
- 特效是否依赖人脸、人体、手部、物体或屏幕空间锚点；
- 当前效果使用的输入类型，以及驱动核心视觉结果的唯一主要手势及其规范 `Vision.Hand.HandActionType`；单手未明确主要手势时使用 `HandOpen`，核心触发依赖双手时使用 `DoubleHand`；

### Step 2: Capture staged evidence

**默认采样**：对非手势特效，用最少的 `wait`、`pause_preview`、`screenshot`、`resume_preview` 覆盖 Step 1 定义的阶段。仅在 brief 明确以 `RecordStart` 为生命周期起点时才先执行 `start_preview_record`。每次截图前暂停，截图后立即恢复；结束时不得让预览保持冻结。

```json
[
  { "commandType": "wait", "params": { "ms": 300 } },
  { "commandType": "pause_preview" },
  { "commandType": "screenshot" },
  { "commandType": "resume_preview" },
  { "commandType": "wait", "params": { "ms": 700 } },
  { "commandType": "pause_preview" },
  { "commandType": "screenshot" },
  { "commandType": "resume_preview" }
]
```

**手势采样**：对手势驱动特效，一次完整 VQR 只能成功选定并复用一个手势视频。切换命令会暂停所选视频，并返回建议的绝对 `captureTimesMs` 和 `durationMs`；获取结果后再发起第二次 `previewTool` 调用执行截图序列，后续截图及最多两轮修复复验均复用该视频。

```json
[
  {
    "commandType": "switch_gesture_video",
    "params": { "handAction": "<primary canonical Vision.Hand.HandActionType>" }
  }
]
```
默认使用返回的建议时间。根据 brief 需要补充其他阶段时，可以增删时间点，但所有时间必须小于返回的 `durationMs`。截图序列只在第一张图前执行一次 `seek_to_time(0)`，随后先 `wait` 到第一张图的绝对时间；后续截图使用相邻目标时间的差值继续 `wait`：

```json
[
  { "commandType": "seek_to_time", "params": { "timeMs": 0 } },
  { "commandType": "wait", "params": { "ms": 1067 } },
  { "commandType": "pause_preview" },
  { "commandType": "screenshot" },
  { "commandType": "resume_preview" },
  { "commandType": "wait", "params": { "ms": 533 } },
  { "commandType": "pause_preview" },
  { "commandType": "screenshot" },
  { "commandType": "resume_preview" }
]
```

**Evidence validity**：每张截图必须包含可评估的特效载体或明确的“特效应当未出现”的默认/重置状态。空白、近空白、只有相机背景、或只有与 brief 无关的占位图，都不是有效的特效可见证据。

### Step 3: Assess screenshots against the effect checklist

先为每个阶段写 1-3 句总体判断：画面是否像统一、完整的视觉特效，主体是否明确，视觉重心、层级、动势和完成度是否符合 brief。不得只罗列检查项而省略总体判断。

逐项检查：

- **Effect visibility and lifecycle**：默认、触发、峰值、收束和重置阶段是否符合 brief；不应出现应有特效缺失、错误阶段常驻、上一轮残影/粒子残留或重置后旧状态。
- **Primary effect semantic match**：核心效果是否读作 brief 指定的视觉语义，而不是通用贴纸、错误物件或无意义装饰。主体、关键辅助元素和主题色/形状语言必须相互支持。
- **Anchor and tracking quality**：仅当 brief 依赖检测目标或指定锚点时检查。特效应贴合正确部位/对象，跟随过程中不明显漂移、跳变、反向、比例失真或因遮罩顺序而断裂。静态或纯屏幕空间特效标记 `NOT_APPLICABLE`。
- **Composition, scale and layer order**：核心特效在预期区域有清晰主次，不被自身装饰、边框或无关元素压住；尺寸、留白和深度关系符合设计，不以放大背景面板或堆叠装饰掩盖构图问题。
- **Mask, edge and material quality**：抠图/遮罩边缘、羽化、透明度、贴图裁切、UV、材质采样、后处理边界和粒子形状应稳定且刻意。检查硬边、黑边、锯齿、穿帮、拉伸、闪烁、色块、错误混合模式和未裁切的矩形底图。
- **Motion, timing and feedback**：动画、粒子、形变、光效和转场应支持特效主题，触发有可感知的响应，持续和收束不突兀。不得用静止或随机抖动代替应有的动势。
- **Contrast and camera integration**：特效在亮、暗、复杂相机背景上仍可辨认，必要时使用轮廓、阴影、颜色分离、透明度或局部背板。不得以评价真人脸或背景美观为由判定失败。
- **Text readability**：仅当 brief 含用户可见文字时检查。文字在预览尺寸下必须不裁切、不过小、对最差背景区域有足够对比度，且风格与特效统一；没有文字时标记 `NOT_APPLICABLE`。
- **Visual carrier and placeholder quality**：Text、emoji、程序化形状、粒子或临时素材也必须有明确的尺寸、配色、层级和节奏。无 PNG 不可降低标准；占位素材不得像调试图元或未处理默认控件。
- **Asset completeness when applicable**：仅在 brief 要求 PNG/Image/材质资源时检查缺失、破损、错误绑定或明显错误的替代物；不得处罚刻意采用程序化或纯材质实现的特效。

对每个 `FAIL`，注明截图阶段、屏幕大致位置、可见症状和影响，避免只写“效果不好”。

### Mandatory VQR status output

结果必须按以下顺序输出，状态必须含阶段与简短理由：

| Mandatory gate | Required evidence |
| --- | --- |
| 特效可见性与截图有效性（Effect visibility / screenshot validity） | 首项；逐阶段确认截图有可审查的特效载体，或明确说明默认/重置态为何应为空 |
| 特效生命周期与重置（Effect lifecycle / reset cleanliness） | 确认触发、持续/峰值、收束和重置的已捕获阶段|
| 主特效语义匹配（Primary effect semantic match） | 必须拆分为 `主体/主题身份匹配`、`关键视觉元素可区分`、`视觉语言与 brief 一致性` 三项 |
| 锚定与跟随质量（Anchor / tracking quality） | 仅对检测或锚定特效评分；静态或纯屏幕空间效果用 `NOT_APPLICABLE` |
| 构图、尺度与层级（Composition / scale / layer order） | 核心主体、辅助元素和背景的主次关系 |
| 遮罩、边缘与材质质量（Mask / edge / material quality） | 裁切、透明、混合、贴图、UV、后处理和粒子边缘 |
| 动效节奏与反馈（Motion / timing / feedback quality） | 已捕获的动态阶段；静态设计可用 `NOT_APPLICABLE` |
| 相机背景对比与融合（Contrast / camera integration） | 只评特效是否可见和自然融合，不评真人遮挡或背景美观 |
| 文案可读性（Text readability） | 有用户可见文字时必须评分；没有文字时 `NOT_APPLICABLE` |
| 视觉载体与资源完整性（Visual carrier / asset completeness） | 按 brief 判断，不因无 PNG 降级 |
| 真人遮挡不在范围（Real-person occlusion out of scope） | 明确说明未将遮脸、遮身或背景干净程度作为缺陷；检测锚点准确性仍按适用项评分 |
| 非删除修复门禁（Non-removal repair gate） | 说明计划内特效元素被保留，修复通过重绑、重绘、重排、改样式或调层完成 |

`主特效语义匹配（Primary effect semantic match）` 不得只写一行总 PASS。必须分别给出：

- `主体/主题身份匹配（Subject / theme identity）`
- `关键视觉元素可区分（Key visual element distinguishability）`
- `视觉语言与 brief 一致性（Visual language consistency with brief）`

### Step 4: Route defects, fix visual carriers, and re-review

每轮修复后的独立重置必须显式传入当前轮次：

```json
[
  {
    "commandType": "reset_preview",
    "params": { "vqrRepairRound": 1 }
  }
]
```

第二轮将 `vqrRepairRound` 设为 `2`。不得省略或复用较小轮次来绕过上限；若继续请求第 `3` 轮或更大轮次，`previewTool` 将跳过该命令并向模型返回 `VQR_REPAIR_ROUND_LIMIT_EXCEEDED`，收到警告后必须停止修复并如实上报。

| Defect kind | Owner | Fix via |
| --- | --- | --- |
| 布局、尺度、层级、颜色、对比度或文本可读性 | Scene layer | 用 `sceneOps` 调整位置、缩放、锚点、深度、颜色、描边、阴影、透明度和分组 |
| PNG、贴纸、粒子贴图或主体语义错误 | Asset + Scene layer | 重生成语义正确的资源，再替换场景绑定 |
| 遮罩、裁切、材质或后处理边缘质量 | Material/Scene layer | 修正材质参数、资源绑定、遮罩对象、透明度或层级；需要时重新生成材质资源 |
| 跟随不稳、检测结果或锚点使用错误、手势未触发、生命周期、状态机、显示/隐藏、动画错误 | Script owner | 修复特效脚本，编译后执行独立 `reset_preview` 并重新捕获失败阶段 |
| 资源已修但新预览仍显示旧画面 | Scene/resource refresh | 重新编译（如需要），独立 `reset_preview` 后复拍；仍失败时报告资源刷新或引用问题 |
