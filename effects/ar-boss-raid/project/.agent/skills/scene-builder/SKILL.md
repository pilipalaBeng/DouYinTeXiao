---
name: scene-builder
description: 场景组装器。用于在游戏场景中添加、移动、缩放或修改对象（初始状态/静态属性）。任何场景布局或对象属性变更都必须使用。
---

# 场景组装器

你是 **技术美术**。游戏根据只读的 `Assets/design_brief_ui.md` 与 `Assets/design_brief_gamelogic.md` 组装场景，不修改任何游戏 Brief，也不读取主 Brief 补充执行细节；非游戏视觉特效没有这两个文件时读取 `Assets/design_brief.md`。使用 `effect_house_toolbox`（sceneOps）处理用户添加、修改或删除场景对象的请求。

在进行任何 UI 放置、对象定位、缩放或 Text/Image 组合前，先读取 `ui-layout`。2D 游戏读取 `.agent/skills/ui-layout/references/game-ui-layout.md`；非游戏视觉特效仅在 brief 明确要求用户可见 UI 时读取 `.agent/skills/ui-layout/references/visual-effect-ui-layout.md`。

---

## 工作流总览
按以下四步执行，每一步有对应的规则和产出：
1. **分析设计** → 读懂 brief、设定图，判断需要哪些内置能力
2. **执行组装** → 用 sceneOps 添加/修改/删除场景对象
3. **布局校验** → 按 Runtime Visibility Plan 检查关键阶段同时可见对象的重叠、叠层与间距
4. **验证交付** → 资产完整性、场景-代码同步、最终自检

---

## 一、第 1 步：分析设计
游戏读取 `Assets/design_brief_ui.md`，识别视觉资产、素材生产结果、设定图代表性状态构图、Scene Layout Plan、文字视觉规格、静态图层和视觉资产 key；读取 `Assets/design_brief_gamelogic.md`，识别对象 ID、创建方式、真实初始显隐、状态、事件、物理、音频和动态反馈。非游戏视觉特效读取 `Assets/design_brief.md`。

- UI Brief 定义对象的静态位置、尺寸、容器和视觉资产 key；gamelogic Brief 定义同一对象的身份、初始显隐和运行时职责。两份文档通过逐字一致的对象 ID 汇合。
- 游戏的视觉资产 key 逐字复用 UI Brief，对象 ID、初始显隐、事件和音频 key 逐字复用 gamelogic Brief；非游戏视觉特效逐字复用主 Brief。
- 设定图代表性状态构图摘要只用于理解已选状态的视觉比例、空间关系、层级和文字容量；场景对象的真实初始 `visible` 必须来自 gamelogic Brief。设定图不是初始显隐或状态触发事实源。
- Scene Layout Plan 按 `对象 ID / 视觉资产 key / 对象类型 / Position Mode / 初始位置与尺寸 / Alpha / 文字/容器规格 / Scene Group / 布局约束` 创建最终场景实例。

### 1.1 标识符规则
- `对象 ID` 是运行时实例标识，来自 gamelogic Brief；`sceneOps.id` 和脚本绑定必须逐字使用它。
- `视觉资产 key` 是图片资源标识，来自 UI Brief；只用于 `textureKey`，不得当作对象 ID。
- `Scene Group` 只用于 `groupId`；不得与对象 ID、guid 或视觉资产 key 混用。
- `textContainerId` 只能填写真实 Image 容器对象 ID 或 `none`。

### 1.2 设定图参考
- Root handoff 会将已确认设定图作为当前模型请求中的图片直接提供；放置前观察该图，用于理解代表性状态的构图、视觉比例、文字容量和风格。设定图不得用于推断新机制、改变真实初始显隐或覆盖视觉资产 key、对象 ID。
- 默认不要读取 `.agent/setting-image/setting_reference.md`。只有当设定图本身无法可靠判断某个元素的视觉语义、视觉资产 key 对应关系、局部朝向或与相邻 UI 的关系时，才按需读取直接相关段落。它只用于解释设定图，不得覆盖两份执行 Brief 或 `Assets/visual_asset_final.md`。
- 首次构造 `sceneOps` 前读取 `Assets/visual_asset_final.md`；每个 Image 直接以其中的最终尺寸和宽高比作为布局起点，在所属区域内完成等比尺寸、中心点位置和间距计算。普通素材保持等比；任何 Image 经等比缩放后若超过固定合同或品类Reference规定的硬尺寸上限（如结果面板测试类≤478×600px、挑战类≤348×410px、绿色区按钮高≤174px），必须按比例缩小到上限内，禁止在超限基础上继续放大或拉伸变形。`hud_bar` 使用后处理阶段已规范的固定宽度 `640px`、高度不超过 `122px`，场景采用 `left=40`、`top=148` 和该文件记录的规范后尺寸，栏内文字与图标位于 `x=48~672` 的内容安全区。
- 存在结果面板时，必须严格遵守 `game-ui-layout.md` 4.2节排版规则：先扣除边框/装饰得到contentSafeRect，再按 `groupHeight = 角色高度 + 标题高度 + 字段高度 + 正文高度 + 字段间距` 和 `startY = contentSafeRect.top + (contentSafeRect.height - groupHeight)/2` 重新计算所有内部元素坐标，不得直接使用Brief中目测的y值；结果角色完整外接矩形必须位于面板边界内，不得浮到面板边框外。
- 同一 `Scene Group` 内按 `sceneOps.ops` 顺序创建对象，后创建的对象位于先创建对象之上。结果复合单元必须严格按“结果面板 Image → 后景特效 Image → 结果角色 Image → 前景特效 Image → 结果 Text → 边界装饰 Image”创建；边界装饰不得遮挡角色或文字。
- Brief 的 `生成尺寸（宽×高）` 是上游目标主体比例和请求尺寸框；透明边距裁剪后，主体按实际比例 contain 到该尺寸框，Scene 不得再用原 Brief 矩形或物理 PNG 像素覆盖 `visual_asset_final.md`。

### 1.3 内置能力支持
根据玩法需求判断是否启用已注册能力。默认按需启用，不启用则跳过。
- 所有游戏都是单次运行体验：没有 retry/restart，也没有下一轮流程。
- 如果场景构建需要已选中的注册能力，先阅读对应详情文档，再执行 `sceneOps`；不得根据关键词在 Scene Builder 内自行添加 Brief 未规划的排行榜、POI、打卡、个人资料或好友头像。
- 若 gamelogic Brief 包含 `Physics2D Plan` 或选择 True Physics / Matter2D，读取 `.agent/skills/effect-abilities/game2d-engine/物理系统.md` 的场景构建章节，并以最终 `sceneSpec.objects[].physics2d` 为碰撞体事实源。
- 完成布局所需资料读取后，单独调用一次 `sceneSpec` 并等待返回；下一次模型调用直接结合其中提供的已确认设定图执行 `sceneOps`，不要在两者之间继续读取无关资料。

## 二、第 2 步：执行组装（场景操作工具）

使用 `effect_house_toolbox` 工具，并设置 `tool_name: "sceneOps"`。

### 2.1 Payload Schema

payload 必须包含 `actions` 数组。每个 action 指定一个 `tool_name` 和对应的 `payload`。

**Action 结构：**

```json
{
  "actions": [
    {
      "tool_name": "sceneOps",
      "payload": {
        "ops": [ ... ] // Array of scene operations
      }
    }
  ]
}
```
### 2.2 通用字段定义
位于 `payload.ops` 内的每个操作对象：
- **`op`**（必填）：`add` | `modify` | `remove`
- **`target`**（可选）：`object` | `group`，默认 `object`。
- **`id`**（`target: "object"` 时必填）：按 1.1 的对象 ID 规则填写。`target: "group"` 时省略。
- **`type`**（对象 add/modify 必填）：普通对象使用 `Image` | `Text` | `Audio`；专项能力文档明确提供已注册 `kind` 时使用 `General`，已注册后处理使用 `PostProcess`。group 操作省略。
- **`groupId`**（必填）：游戏逐字使用 UI Brief `Scene Layout Plan` 的 `Scene Group`，非游戏视觉特效根据主 Brief 确定。优先使用 `背景` | `玩法` | `UI界面` | `结算界面` | `音频`；阶段整体需要独立显隐时可使用稳定、简短且职责唯一的中文分组名。
  - 每个 add/modify/remove 对象操作都传入非空 `groupId`；`modify` 仅在目标 group 不同时移动父层，`remove` 仍以 `id`/`guid` 定位。
  - 同一职责必须复用同一 `groupId`。
  - 所有 group 都是全屏父节点，位置仍使用现有世界坐标字段（`x`/`y`/`left`/`top`/...）。
- **`visible`**（可选）：控制对象或 group 的编辑态初始显隐。`target: "group"` 仅支持 `op: "modify"`，且必须同时提供 `groupId` 与 `visible`。生命周期显隐使用 `visible`，不得用 alpha 或材质效果代替；同一批阶段性 UI 优先按独立 group 整组设置，不再对子对象重复设置。
- **`positionMode`**（设置 Image/Text 位置时必填）：`absolute` | `pinned` | `relative`

### 2.3 布局模式
每个对象选择一种：
- **Absolute**：`positionMode: "absolute"` 搭配对象最终外接矩形中心点 `x`、`y`（add 时使用最终 `width`、`height`）。屏幕为 `720x1280`、坐标轴原点在左上；Brief 给出 `left/top/width/height` 时，换算为 `x=left+width/2`、`y=top+height/2`。
- **Pinned (UI)**：`positionMode: "pinned"` 搭配一个水平边（`left` 或 `right`）和一个垂直边（`top` 或 `bottom`）（add 时使用 `width`、`height`）。
- **Relative**：`positionMode: "relative"` 搭配 `dx`、`dy`（相对当前位置的偏移）。
- Absolute 直接表达位置。Pinned 表达相对屏幕边缘的位置。

### 2.4 组件属性

#### Image
- `textureKey`：不带扩展名的文件名
- `drawMode`（可选）：`Normal` 正常 \| `Tiled` 平铺 \| `Filled` 填充 \| `Ellipse` 椭圆
- `alpha`（可选）：`0～1` 的实例不透明度；游戏 Image 按 UI Brief 的 `Scene Layout Plan.Alpha` 写入 `sceneOps.alpha`，未声明时为 `1`。非游戏视觉特效按主 Brief；物理对象按物理系统合同。

> PNG 的透明背景和通孔保留素材结构；Image 整体透明度始终沿用 Brief 的 Alpha，显隐由 `visible` 控制。

#### Text
- `content`：文字内容
- `fontSize`：字号
- `color`（可选）：十六进制颜色
- `textContainerId`（可选）：游戏中位于 Image 底板、按钮、卡片、HUD、面板或气泡上的 Text 必须填写真实 Image 对象 ID；UI Brief 标记为 `none` 的独立文字在 `sceneOps` 中省略此字段
- `shadow`（可选）：仅使用 `{enabled, color, alpha, distance, angle, feather}`；按 `ui-layout` 与游戏 UI Reference 设置投影
- `stroke`（可选）：按 `ui-layout` 与游戏 UI Reference 设置描边；能力保持可用
- `boxDimension`（可选）：`dynamic` 宽高随内容调整，独立短标签优先使用；`fixedWidth` 固定宽度、高度随内容调整，用于多行正文；`fixedSize` 固定宽高，仅用于严格容器文字区
- `lineBreakType`（可选）：`autoLineBreak` 自动换行 \| `cutOff` 截断 \| `clamp` 省略号截断
- `lineSpacing`（可选）：行间距，以行高为单位（如 0.3 表示增加字号 30% 的间距）
> **约束**：文本框自适应只调整 Text 对象宽高，不改变 `fontSize`；不要将 `fixedSize + cutOff` 作为短标签默认方案。游戏 Text 按 UI Brief 已记录的文字层级与精确字号执行：标题 `36px~46px`、一级正文 `28px~30px`、二级或辅助说明 `25px`、临时提示 `28px`，重要数字、分数、倒计时和关键状态不小于 `30px`。
> **投影语义**：亮色或中亮实体底板上的深色文字允许不加投影；UI Brief 已规划或场景已有的合规投影保持不变。暗色底板和无实体底板的独立文字按 `ui-layout` 与游戏 UI Reference 配置必要投影。

#### Audio
- `clip`：不带 .mp3 的文件名
- `isBgm`：布尔值，是否背景音乐
- gamelogic Brief 中由脚本调用的每个音频 clip，在对应 MP3 落盘后创建同名 Audio 对象。

#### General
仅用于专项能力文档明确提供的已注册场景对象。具体的 `general.kind`、`general.properties` 字段、枚举值和变换结构，由 `docs/` 下对应能力文档定义。只传入文档明确说明的参数，不得将矩形、道路、车道线等普通图形猜测为 `General kind`。
- Loki GAN 预设不得猜测 `general.kind`。先使用 `GAN` 能力和 `ganEffect` 查询候选，再通过 `sceneOps` 新增 `General` 对象：`id` 使用返回的 `name`，`general.kind` 使用已验证的 `ganKey`。

### 2.5 能力不足
`sceneOps` 或能力文档不支持 Brief 中的实现时，先在已确认设计内改用合法的 `Image`、`Text`、`Audio` 或已注册专项能力；仍无法实现则返回包含失败对象、缺失能力和影响范围的结构化阻塞，不修改 Brief、不新增设计素材、不触发设定图或视觉方向刷新。

### 2.6 使用示例

**场景 1：构建场景（添加对象）**

```json
{
  "actions": [
    {
      "tool_name": "sceneOps",
      "payload": {
        "ops": [
          {
            "op": "add",
            "type": "Image",
            "id": "主角本体",
            "groupId": "玩法",
            "positionMode": "absolute",
            "x": 360,
            "y": 900,
            "width": 100,
            "height": 100,
            "textureKey": "主角待机"
          },
          {
            "op": "add",
            "type": "Text",
            "id": "分数文本",
            "groupId": "UI界面",
            "positionMode": "pinned",
            "left": 20,
            "top": 110,
            "width": 200,
            "height": 50,
            "content": "分数 0",
            "fontSize": 30
          }
        ]
      }
    }
  ]
}
```

**场景 2：更新场景（修改/删除）**

```json
{
  "actions": [
    {
      "tool_name": "sceneOps",
      "payload": {
        "ops": [
          {
            "op": "modify",
            "type": "Text",
            "id": "分数文本",
            "groupId": "UI界面",
            "color": "#FF0000" // Only include changed properties
          },
          {
            "op": "remove",
            "type": "Image",
            "id": "未使用图标",
            "groupId": "玩法"
          }
        ]
      }
    }
  ]
}
```

## 三、第 3 步：布局组装与校验

### 3.1 静态与动态边界
- **初始状态（编辑阶段）**：使用 `sceneOps` 设置静态属性（初始文本、起始位置），不得在脚本中硬编码
- **运行时行为（游玩阶段）**：脚本只用于随时间变化或响应事件的逻辑
- **场景-代码同步（强制）**：通过 sceneOps 更改对象大小、位置、布局或文本后，必须扫描活跃游戏脚本，更新所有共享同一预期基线的值；有意独立的值保持不动。场景参数与脚本值对齐后，更改才算完成

### 3.2 全局布局规则
- **标识符规则**：按 1.1 区分对象 ID、视觉资产 key、Scene Group 和 `textContainerId`。
- **布局与安全区**：通用容器、文字与图文组合遵循 `ui-layout`；2D/AR 固定区域、HUD、视觉资产和游戏布局遵循游戏 UI Reference；非游戏画面特效 UI 遵循画面特效 UI Reference。
  - 边界型危险带（顶部尖刺带、底部危险边界等）可作为非重要边缘元素贴边放置
  - 但不得遮挡信息栏、结算面板、按钮或可读 Text，需控制展示层级
  - 游戏 Brief 若包含纯环境背景 PNG，或将不参与碰撞、移动边界、操作范围和信息表达的大面积装饰放入背景层，停止组装并报告对应 Brief 冲突。玩法必需的道路、平台和通道按玩法对象处理。
- **固定区域落位**：直接执行 UI Brief `Scene Layout Plan` 中已规划的蓝色主内容区、绿色常驻交互区和红色非重要交互区域，不重新解释固定布局图。
- **空间不足处理**：只调整未锁定的非核心视觉或使用 UI Brief 已规划的备用文案；不得删减对象、改变阶段可见集合、跨区挤压核心主体或把文字塞进剩余缝隙。
- **复合 UI**：按 `Scene Layout Plan.布局约束` 识别成员、容器、安全区和层级；同一复合单元的成员使用 UI Brief 指定的同一 `Scene Group`。存在结果面板时，不按文档行序或资产生成顺序创建，必须按 `结果面板 → 后景特效 → 当前结果角色或插画 → 前景特效 → 结果文字 → 边界装饰` 创建；边界装饰不得遮挡角色或文字。创建后检查 display list：面板索引必须小于角色索引，角色索引必须小于文字索引。
- **Strict Layout 几何层**：`asset_owned_strict` 的几何 PNG 与 companion art 使用相同位置、显示尺寸和 origin，不用目测偏移修正；以 `.layout.json`、`Assets/visual_asset_final.md` 和场景最终 `displayWidth/displayHeight` 校验缩放。
- **Script-owned Discrete 布局**：`script_owned_discrete` 只创建单格槽、墙块、地块、棋子和反馈等必要原子模板，完整离散布局由脚本生成，不在场景中预铺完整格阵。
- **禁止运行时图集**：不得把图集、序列图、sprite sheet、atlas 或多角色/等级/状态拼图作为 runtime template；没有明确 frame API 与 metadata 时必须拆成单体 PNG。

### 3.3 操作参数说明
- `op: add`（Image/Text）：包含最终 `width` 和 `height`。
- `op: modify`：除非调整大小，否则省略 `width` 和 `height`。
- Image 完成 `sceneOps` 后，必须通过 `sceneSpec` 验证实际 `width/height` 与 UI Brief 的最终尺寸一致；不得接受默认 `10×10`。任一 Image 的实际尺寸不一致时，场景组装未完成，必须修复场景写入后再交付。
- `sceneOps` 后必须用最新 `sceneSpec.objects[].id` 核对对象 ID 闭合；不得用视觉资产 key、PNG 文件名或相近语义名替代缺失对象 ID。
- 位置使用一种模式：绝对定位 / 锚定 / 相对定位
- 场景初始 `visible` 必须严格等于 Runtime Visibility Plan 的 `Initial Visibility`。`RecordStart` 前展示已定义的首屏可见集合；不得显示只属于后续题目、已选状态、过程进度、结果揭示或结束状态的对象。运行时 `active` 由脚本设置。
- 同一批阶段性对象由 Runtime Visibility Plan 指定一个独立 `Scene Group` 时，使用 `target: "group"` 整组设置初始 `visible`；单个独立对象才使用对象级显隐，同一阶段不得通过父 group 隐藏后再显示其子对象。
- 每个可读 Text 及其绑定容器的完整外接矩形位于 UI Brief 指定区域和固定布局主安全矩形内；临时提示位于非红色的主要交互区域。未锁定组需要避让时整体在所属区域内移动。
- 输出首个 `sceneOps` 前，对全部测一测输入布局进行统一验算：蓝色主内容区只能有一个从 `top=148` 起排且 `textContainerId=none` 的独立大标题。题号、进度、轮次或阶段提示作为第二个顶部独立 Text 时停止组装并报告 Brief 冲突；确需显示的题号必须绑定当前题目或上下文容器。无底板操作提示必须完整位于蓝色主内容区并具有阶段性显隐合同。其余内容按固定 `16px` 净间距连续排列，不得因经过 `y=270` 重新起排。
- UI Brief 任一锁定数值不满足上述等式时停止组装并报告对象 ID、`actualTop`、`expectedTop` 和 `expectedCenterY`；未锁定对象按现有规则在允许区域内调整。UI Brief 通过后，才将其 `absolute x/y` 作为最终中心点传入 `sceneOps`。

### 3.4 资产使用可追踪性（关键）
`Assets/` 中每个 PNG 和 MP3 都必须有可追踪的场景用途：可见场景对象、屏幕外运行时模板、音频对象，或明确记录其有意未使用的原因。不得让生成资产在没有场景级使用决策的情况下消失。
- **音频闭环**：逐一对照 gamelogic Brief 音频表、`Assets/audio_asset_generation_manifest.json` 和最终 `sceneSpec`，确认脚本调用的 clip 均有同名 Audio 对象。
- **阶段性 UI 不是运行时模板**：结算面板、帮助卡和与其 `textContainerId` 绑定的文字必须按最终显示时的 `720x1280` 像素位置创建，编辑态初始只设置为不可见；脚本按阶段成组切换显隐、更新状态和文案，不要把这类真实 UI 放到屏外再移回。
- **状态变体模板**：对运行时纹理替换使用的每个 `state_variant`，按 gamelogic Brief 对象表中的模板对象 ID 创建一个屏幕外 Image 模板；脚本引用的对象 ID 必须在最终 `sceneSpec` 中真实存在。
- **动态文字模板**：按 UI Brief 创建屏幕外 Text 模板并完整写入颜色、投影、描边、字号和文本框模式；正常、警告、成功或错误样式变体使用同位置互斥 Text 对象，并按 Runtime Visibility Plan 设置初始显隐。
- **用生成资产和 gamelogic 对象表对照最终 `ops` 数组二次检查，确保没有资产或状态变体模板被意外遗忘。**
- **克隆策略**：需要由脚本生成或克隆的玩法资产（例如敌人、子弹、弹幕、障碍、收集物、道具和特效），场景中只创建 **一个** 屏幕外模板；不要同时创建同素材的首屏副本，即使设定图或 brief 中出现了该对象。可见实例由脚本在需要时从模板生成。

### 3.5 离屏模板对象

- 离屏模板初始放在可视区域外，并通过 `sceneOps` 设置为不可见；脚本初始化时再使用 `setActive(false)`，模板只作为 clone source，不承载可读信息。
- 阶段性 UI 不是离屏模板：未来会显示的结果面板、帮助卡和绑定文字必须放在 UI Brief 的最终安全位置，通过显隐切换。

### 3.6 分阶段布局校验
输出 `sceneOps` 前，按 gamelogic Brief 的 Runtime Visibility Plan 检查首屏、游戏中、结果揭示或当前玩法实际存在的其它关键阶段。每个阶段只检查该阶段会同时可见的对象；互斥对象和离屏模板不参与彼此可见布局校验。
**校验依据**：在 `sceneOps` 执行前后各进行一次数值验算。逐项计算所有对象的 `left/right/top/bottom`，并检查：测一测首个非绿色内容单元 `top=148`；后续单元 `top=上一单元 bottom+适用最小净间距`；独立模块不重叠；纯文字容器高度等于文字块、内边距和已记录结构高度之和；同一绿色交互组成员最终高度和 `centerY` 一致。未锁定对象不满足时按允许范围调整；锁定数值或 Brief 合同冲突时停止组装并报告。每个阶段枚举完整的同时可见对象集合，对其中每一对独立模块计算水平/垂直间距；同一按钮组、选项组、拖入目标组中的成员也必须逐对验算，不得因同属一个交互组而跳过检查。跨阶段常驻对象必须在每个适用阶段重新参与验算。

- 重叠分类、允许叠层、最小间距和冲突处理遵循游戏 UI Reference，不在此重复维护数值。
- 校验时使用最终外接矩形、锁定状态、`Scene Layout Plan.布局约束`、层级、文字安全区、图标安全区、点击区域和主体识别区域。
- 冲突时保持固定坐标和锁定对象不动，只调整未锁定对象的等比尺寸、位置或内部排版；不得改变 Runtime Visibility Plan，仍无法解决时报告冲突。
- Scene Builder 以 `visual_asset_final.md` 完成首次布局；`sceneOps` 的比例校正只承担防御性兜底。工具返回后使用 `sceneSpec` 返回的实际 `x/y/width/height` 校验每个 Image；尺寸仍为默认 `10×10` 或与 UI Brief 不一致时必须先修复，再计算外接矩形、区域归属和间距。
- 执行 `sceneOps` 后再次校验所有关键阶段。结果阶段必须先检查 UI Brief 是否声明结果角色或插画为必需结果主体；若必需但缺少独立视觉资产、对象 ID、Layer 行、Scene Layout Plan 行或 Runtime Visibility Plan 显隐合同，停止组装并报告结构化阻塞，不得以结果卡片、徽章或文字替代。存在结果角色时，确认其位于 UI Brief 规划的结果区域；存在结果面板时，还须确认结果角色完整位于面板内容安全区并显示在面板之上。结果角色与全部文字属于同一内容组；未命中候选隐藏且共用同一结果角色区。
- 执行 `sceneOps` 后读取 `sceneSpec`，逐个核对游戏 Text 的 `textContainerId` 和 `color`；容器文字必须保留 UI Brief 的真实容器 ID，浅色容器不得出现浅色文字，深色容器不得出现深色文字。发现偏差时用 `sceneOps` 修正，不能因调用成功就视为组装完成。

**结果阶段额外检查**：
- 存在结果面板时，当前命中的结果角色完整位于结果面板内容安全区，并显示在面板上方；没有面板时，整个结果内容组完整位于 UI Brief 规划的结果区域。
- 存在结果角色时，结果角色和所有文字块属于同一个内容组。
- 存在结果面板时，整个内容组在面板内容安全区内水平、垂直居中。
- 未命中的结果候选保持隐藏，但共用相同结果图像槽位。
- 任一条件失败且根因属于 Brief 合同缺失时，停止组装并报告结构化阻塞；不得自行修改 Brief 或只移动单个对象掩盖问题。

### 3.7 结果面板文字槽位识别与自检
结果文字需要放在面板图片上且 Brief 未提供明确 `textSafeRect` 时，必须先识别文字槽位再放置文字，不得直接按面板中心猜位置。
结果面板采用“顶部结果图像 + 下方文字字段”时，先读取面板内容安全区，计算角色与全部文字块的总高度和组间距，再计算 startY 并依次落位。不得沿用未经整组验算的独立坐标。

执行规则：
1. 对结果面板先识别并映射全部占位：
   - 边界装饰区：顶部徽章、耳朵、角花、贴边图标、边框和底部装饰；允许突出面板边界，但不属于内容组。
   - 结果角色区：位于面板内容安全区内，结果角色完整外接矩形必须完整落入该区，不得突出面板边界。
   - 标题区、关键词区和正文区：均位于结果角色区下方，彼此不相交，且避开所有边界装饰区。
   - 未提供明确安全区时，先从面板完整外接矩形扣除边框、圆角和边界装饰，再划分角色区及各文字区；不得直接以面板中心猜测。
2. 放置结果内容时：
   - 结果角色只能放入结果角色区。
   - 标题和单行关键词分别在自身槽位居中。
   - 正文使用正文区，`fixedWidth + autoLineBreak`、左对齐、顶部对齐，并完整位于正文区内。
   - 结果角色、标题、关键词、正文、徽章和装饰的最终外接矩形不得相交；正文超过正文区且无法通过已规划备用文案或未锁定布局调整解决时，停止组装并报告结构化阻塞，不得溢出面板或自行修改 Brief。
3. 输出 sceneOps 前必须自检：
   - 文字是否在识别到的槽位内；
   - 是否与图标/边框/分隔线/装饰重叠；
   - 是否因放在视觉中心而偏离真实承载区。
4. 若自检失败：
   - 先换到次优干净槽位；
   - 再缩短文案或调整对齐；
   - 仍失败则不要把该图片当文字容器，改用独立文字或重新布局。
   - 判断相交是否冲突时，只有独立模块之间的非预期相交才判定为冲突；同一复合构图单元仍须保护文字安全区、点击区域和主体识别区域。

### 3.8 HUD 文本数量校验

HUD 中一个指标只能有一个 Text 对象。标签、数值、单位必须合并到同一个 Text 中，用换行表示多行，如 `得分\n0`。禁止创建 `得分标签` + `得分文本` 这类拆分对象。输出 sceneOps 前检查：HUD 指标 Text 数量不得超过指标数量，超过则必须合并。

## 四、第 4 步：验证交付

- **资产完整性审计**：执行 `sceneOps` 前，明确用 design brief 中的资产列表交叉检查你的 `ops` 数组，防止意外遗漏。如果任何资产被有意排除，确保已记录。
- 确保 `effect_house_toolbox` 调用返回成功。
- 确保所有引用的 textures 和 audio clips 都存在于 `Assets/`。首轮场景组装只能在真实 PNG 生成完成且 `Assets/visual_asset_final.md` 已存在后开始；不得以透明占位图、asset-board 棋盘格或尚未完成的后台任务作为资产完成依据。
- 创建绑定容器的居中 Text 时，忽略 Brief 中与 `textSafeRect` 冲突的任意文字中心；使用映射后的 `textSafeRect` 作为 Text 最终矩形，并强制 `boxDimension=fixedSize`、水平居中、垂直居中。
- 输入阶段按人脸软避让进行构图质量检查，不执行固定人脸矩形零相交测试；允许玩法对象局部进入额头、头发或脸部边缘区域，只有大面积持续遮挡人脸主体、同时遮挡主要五官，或避让导致布局明显失衡时才判定失败。
- 对所有按钮对象执行绿色区域完整包含测试，不区分常驻或阶段性。按钮、绑定文字或点击热区任一部分越界时先调整未锁定布局；若根因是锁定值或 Brief 合同冲突，则停止组装并报告。
- 结果阶段跳过人脸软避让检查；结果面板及其成员仅检查固定区域、文字容量、层级、重叠和可读性。
