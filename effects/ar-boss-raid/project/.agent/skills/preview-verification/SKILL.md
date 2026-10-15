---
name: preview-verification
description: 对生成的完整游戏或视觉特效整体执行视觉质量审查，并根据审查目标加载对应规则。仅当明确要求视觉验证时使用本 Skill；普通截图和交互操作使用 preview-tool。
---

# Preview 视觉验证

本 Skill 只负责视觉质量审查，不负责通用 Preview 操作或独立的运行时行为验证。

## 路由

执行视觉质量审查前，先判断审查目标是生成的完整游戏还是生成的视觉特效整体，并且只完整读取命中的规则文件：

- **完整游戏**：任务明确要求审查生成游戏的整体视觉质量时，读取 [game_preview_verfication.md](./references/game_preview_verfication.md)，并严格按其中流程执行。
- **视觉特效整体**：任务明确要求审查生成视觉特效的整体视觉质量时，读取 [effect_preview_verfication.md](./references/effect_preview_verfication.md)，并严格按其中流程执行。
- **类型未明**：存在 `Assets/design_brief_ui.md` 或 `Assets/design_brief_gamelogic.md` 时按游戏路由，否则按特效路由。
- **仅 Preview 操作**：用户只要求截图、点击、拖动、录制或行为验证时，不进入视觉质量审查，改用 [preview-tool](../effect-abilities/preview-tool/SKILL.md)。

不得同时加载游戏与视觉特效规则。无法确定审查目标时，先根据当前任务描述和 `Assets/` 下的 Brief 判定；仍无法判定时再向用户确认。
