---
name: asset-manager
description: 资源管理器。用于在工程中查询、添加、修改资源（初始状态/静态属性）。RenderTexture、相机纹理、分割算法等能力以资源的形式暴露。

---

# Asset 操作指南

Asset 是可复用的工程资源，例如 Materials、Textures、RenderTextures、Meshes、VFX 资源、JSON 资源和脚本资源。场景对象、组件、脚本和材质通过 GUID 引用资源。

## 支持能力

此指南仅用于 DYEH Agent 已暴露的资源操作：

| 能力 | 工具 |
|---|---|
| 查询内置资源类型、描述、可写属性提示和错误提示 | `effect_house_toolbox` `builtinResource.queryResourceKnowledge` |
| 创建内置工程资源 | `effect_house_toolbox` `builtinResource.add_builtin_resource` |
| 修改已有资源的可写属性 | `effect_house_toolbox` `builtinResource.set_resource_properties` |
| 创建手写 OMTL/AUSL 材质资源 | `effect_house_toolbox` `materialAsset.create` |
| 重写已有手写 OMTL/AUSL 材质源码 | `effect_house_toolbox` `materialAsset.edit` |
| 读取手写材质源码 | `effect_house_toolbox` `materialAsset.read` |
| 检查手写材质编译状态 | `effect_house_toolbox` `materialAsset.get_compile_status` |

## 知识查询

创建或修改内置资源前，先查询本地资源知识：

```json
{
  "tool_name": "builtinResource",
  "payload": {
    "operation": "queryResourceKnowledge",
    "query": "render texture"
  }
}
```

对于已知资源类型，直接查询：

```json
{
  "tool_name": "builtinResource",
  "payload": {
    "operation": "queryResourceKnowledge",
    "resource_type": "Unlit"
  }
}
```
规则：

- 不要根据自然语言或编辑器菜单猜测发明 `resource_type` 值。
- 如果查询结果没有返回所需资源类型，停止并要求更新 schema。
- 如果查询结果没有返回所需可写属性，检查创建出的资源输出。如果属性仍然不存在，停止并要求 schema/工具支持，不要猜测其它属性名。

## 资源创建

使用 `builtinResource.add_builtin_resource` 创建内置工程资源：

```json
{
  "tool_name": "builtinResource",
  "payload": {
    "operation": "add_builtin_resource",
    "resource_type": "Unlit",
    "name": "无光照材质"
  }
}
```

`resource_type` 必须是 `queryResourceKnowledge` 返回的 display name，或 `resource_creation_templates*.json` 中列出的名称。编辑器命令会先把该 display name 解析为内部 Resource 菜单配置，再创建资源。

常见资源类型：

| 资源类型 | 分类 | 典型用途 |
|---|---|---|
| `Standard PBR` | Material | 需要 albedo、roughness、metallic、normal 或 emissive 行为的受光 3D mesh |
| `Unlit` | Material | 平面颜色、纹理显示、类 UI mesh 和简单效果表面 |
| `Render Texture` | Texture | 离屏 buffer、持久纹理反馈，或明确需要可写/可渲染纹理的工作流 |
| `Depth Render Texture` | Texture | 明确需要深度数据的效果 |
| `Render Group Input Texture` | Texture | 仅用于明确需要 Render Group input 的工作流 |
| `Empty Material Graph` | MaterialGraph | 明确要求节点式材质创作时使用 |
| `Physics Material` | MaterialGraph | 碰撞体 friction/restitution 工作流，不是视觉材质槽位 |
| `Quad` | Mesh | 用于材质预览或效果几何体的简单平面 mesh |

创建资源只会返回资源 GUID。除非具体操作明确说明会赋值，否则它不会把资源分配到场景对象、组件、脚本字段或材质槽位。

视觉特效工作流新增资源时，`name` 或 `assetName` 必须逐字使用 `Assets/design_brief.md` 中确定的中文资源名称。该规则只约束资源面板中的可见名称；Shader 名、uniform、TypeScript 文件名、类名和序列化字段名继续使用各自要求的 ASCII 标识符。

## 固定内置资源引用

部分内置资源已经以稳定 GUID 注册，不需要调用 `builtinResource.add_builtin_resource`。当组件、脚本字段、材质纹理槽位或资源属性需要这类资源时，直接通过拥有该字段的组件/资源操作分配固定 GUID。

使用目标字段的序列化资源类型。对于组件/编辑器赋值，通常是 `ResourceData` 风格的 GUID 引用：

```ts
new Resource.ResourceData({guid: '<fixed-guid>'})
```

对于 Agent 命令 payload，使用所属工具的资源值格式：

```json
{"type": "Texture", "data": {"guid": "<fixed-guid>"}}
```

不要为这些固定资源调用 `add_builtin_resource`：

| 资源 | 类型 | 固定 GUID | 典型用途 |
|---|---|---|---|
| `Default_Camera_Input` | Texture | `00000000-0000-0000-0000-00000000004b` | 原始相机纹理输入。 |
| `Default_Morph_OutputV2` | Texture | `00000000-0000-0000-0000-000000001302` | 包含美妆、滤镜、形变效果的相机输出。 |
| `Default_Final_Render_Output` | RenderTexture | `00000000-0000-0000-0000-000000000009` | 用于 render graph/effect-node 风格输入的最终渲染输出纹理。 |
| `Default_Face_Mask_OutputV2` | Texture | `00000000-0000-0000-0000-000000001544` | 仅包含美妆、滤镜效果的相机输出。 |

规则：
- 大多数情况使用Default_Morph_OutputV2或Default_Face_Mask_OutputV2获取相机输出纹理，仅在局部GAN合成中使用Default_Camera_Input。
- 对于材质 OMTL 默认值，可以直接在 `UIPROPERTY` 中声明确实需要使用的内置纹理默认值。示例：`[CameraInput] _CameraTex (omtl_texture, 2D) = "Default_Camera_Input"`。
- 对于组件/脚本/资源属性赋值，使用所属赋值操作中的固定 GUID，不要创建重复的工程资源。
- 如果目标组件拒绝该 GUID 或序列化类型，停止并检查目标字段 schema 或组件工作流。不要为这些固定引用退回到 `add_builtin_resource`。

## 分割纹理

当用户需求需要区域、身体部位、主体或语义区域隔离时，优先使用内置 Segmentation Texture 资源。不要用静态纹理、噪声、颜色阈值或手写近似 mask 替代分割算法。

触发映射：

| 用户意图 | 资源类型 |
|---|---|
| 天空分割、换天空、仅作用于天空的天气/云层/大气效果 | `Sky` |
| 人像、人物、人体主体、改变/虚化背景时保留人物 | `Portrait` |
| 主体/显著前景，且用户并非特指人像 | `Subject` |
| 头发、染发、头发发光、仅作用于头发的造型、发区效果 | `Hair` |
| 地面、地板、脚下效果、地面阴影、地面交互 | `Ground` |
| 脸部、仅作用于脸部的装饰、妆容区域 | `Face` |
| 手部、仅作用于手部的装饰或手部区域效果 | `Hand` |
| 衣服/穿搭区域效果 | `Clothing` |
| 皮肤、眼睛、嘴唇、牙齿、宠物、建筑区域效果 | `Skin` / `Eye` / `Lip` / `Teeth` / `Pet` / `Building` |

## 资源属性

使用 `builtinResource.set_resource_properties` 修改可写资源属性：

```json
{
  "tool_name": "builtinResource",
  "payload": {
    "operation": "set_resource_properties",
    "guid": "<material-guid>",
    "properties": {
      "_AlbedoColor": {"r": 1, "g": 0, "b": 0, "a": 1}
    }
  }
}
```

绑定材质纹理资源也走 `builtinResource.set_resource_properties`。

```json
{
  "tool_name": "builtinResource",
  "payload": {
    "operation": "set_resource_properties",
    "guid": "<material-guid>",
    "properties": [
      {
        "property": "MaskTexture",
        "value": {"type": "boolean", "data": true}
      },
      {
        "property": "_MaskTex",
        "value": {"type": "texture", "data": {"guid": "<texture-guid>"}}
      }
    ]
  }
}
```

规则：

- 从 `queryResourceKnowledge`、schema 文件或创建资源的输出中确认属性名。
- 资源引用使用 `{guid: "<asset-guid>"}`。
- 颜色值使用 `{r,g,b,a}`。
- 不要写入 readonly 属性。
- 如果属性因缺失或 readonly 被拒绝，停止，并根据返回的错误/schema 输出判断工作流是否需要不同资源类型或缺失的工具支持。

## 自定义材质资源

使用 `materialAsset.create` 创建 OMTL 材质文件。
修改已有手写材质时，使用 `materialAsset.edit` 并传入已有材质 `guid`。`edit` 不接受 `assetName`，不会创建新的材质资源。

对于静态纹理输入：

- `Default_Camera_Input` 等内置默认纹理可以直接在 OMTL `UIPROPERTY` 中声明。
- 生成图片、mask、噪声纹理和 RenderTexture 应在编辑态通过 `builtinResource.set_resource_properties` 绑定。
- 运行时 `setTexture` 只用于效果运行过程中确实会变化的纹理引用。

## 分配资源

创建或更新资源后，通过拥有目标字段的工具完成绑定：

| 目标 | 工具路径 |
|---|---|
| Custom PostProcess 材质 | `sceneOps` `type: "PostProcess"`，使用 `op: "add"` 或 `op: "modify"` 并提供 `materialGuid` |
| 运行时脚本序列化 Material/Texture 字段 | `setupGameScript` 的 `resourceBindings` 参数 |
| 普通场景对象/组件资源字段 | 使用该组件所属的 SceneOps 或组件工作流 |

始终把赋值视为独立于创建的步骤。如果资源已成功创建但目标仍使用旧资源，显式调用所属赋值操作。
