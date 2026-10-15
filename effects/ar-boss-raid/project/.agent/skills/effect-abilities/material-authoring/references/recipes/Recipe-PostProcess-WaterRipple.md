# Recipe：PostProcess 手部交互水波纹

> 按需从 `skills/material-authoring/SKILL.md` 加载。**前置要求**：已经阅读该 Skill 的 PostProcess 章节，并以 `skills/material-authoring/references/PostProcess-CustomMaterial-Reference.md` 中经过验证的完整 OMTL 为全屏材质骨架。本 Recipe 描述水波纹效果增量、三缓冲反馈和运行时控制流程，不替代完整骨架。

## 最终效果

- 画面始终保留低频、透明的水面折射，不依赖手部输入。
- 指尖静止时，周期性发射向外扩散的同心圆波。
- 指尖滑动时，沿轨迹生成连续波脊，并向轨迹垂直方向扩散。
- 支持双手最多 10 个指尖，也支持触屏输入作为调试入口。
- 波纹衰减后回到中性高度场，不留下雪花状量化残差。
- 重载特效时先清空历史纹理并淡入，避免旧状态导致明暗闪烁。

## 适用场景

适合以下需求：

- 需要基于相机画面的全屏液态折射，而不是网格表面的静态法线扰动。
- 波纹需要真实传播、反射正负波峰并随时间衰减。
- 输入来自手部关键点、触摸或其他运行时坐标。

如果只需要一次性的局部 UV 扭曲，不需要历史状态，不必使用三张 RenderTexture；一个普通 PostProcess Custom 材质即可。

## 核心架构

效果由两份材质、一份 APJS 脚本和三张同尺寸 RenderTexture 组成：

| 资源 | 职责 |
|------|------|
| `WaterRipplePhysics` | 读取当前高度场和上一帧高度场，计算下一帧高度场 |
| `LiquidWaterRipple` | 读取相机 `_MainTex` 和当前高度场，合成折射、高光和低频水面 |
| `WaterRippleController` | 收集指尖、提交物理 Blit、轮换 RT、驱动材质参数 |
| `prevTexture` | 上一帧高度场 |
| `currTexture` | 当前高度场 |
| `nextTexture` | 下一帧写入目标 |

单帧顺序固定为：

```text
输入坐标
  -> 写入 _Point0 ... _Point9
  -> physics(prev, curr) 写入 next
  -> 轮换 prev <- curr, curr <- next, next <- oldPrev
  -> liquid 采样 curr
  -> PostProcess 输出
```

不要用 PostProcess 内部的临时 RT 代替这三张纹理。临时 RT 只在当前命令执行期间有效，无法稳定保存二阶波动方程所需的两帧历史。

## RenderTexture 准备

在编辑态创建三张尺寸、格式和过滤方式一致的 RenderTexture，并绑定到脚本：

- `prevTexture`
- `currTexture`
- `nextTexture`

建议：

- 三张纹理分辨率一致。
- `_SimulationResolution.xy` 必须与模拟使用的逻辑分辨率一致。
- 纹理需要线性采样；高度场边界使用 UV clamp。
- 初始化颜色必须是 `(0.5, 0.5, 0.5, 1.0)`，因为材质按 `sample.r - 0.5` 解码有符号高度。

初始化时先断开 RenderTextureProvider 的 `inputTexture`，再清空三张 RT：

```typescript
private configureRippleTexture(texture: APJS.Texture, neutral: APJS.Color): void {
  const provider = texture.getControl() as APJS.RenderTextureProvider;
  provider.inputTexture = undefined;
  provider.clearType = APJS.CameraClearType.Color;
  provider.clearColor = neutral;
}
```

重载后等待两帧，再将 `_EffectAmount` 从 `0` 逐步提升到 `1`。这能避免历史纹理未清空或绑定尚未稳定时出现整屏明暗跳变。

## 物理材质

物理材质是一个全屏 Blit 材质，不直接绑定 PostProcess。它读取：

- `_MainTex`：当前高度场 `curr`
- `_PrevTex`：上一帧高度场 `prev`
- `_Point0 ... _Point9`：当前点与上一帧点，格式为 `(x, y, prevX, prevY)`

### 高度场推进

将红通道从 `[0, 1]` 解码到 `[-0.5, 0.5]`：

```glsl
highp float H(sampler2D tex, highp vec2 uv) {
    return texture(tex, clamp(uv, vec2(0.0), vec2(1.0))).r - 0.5;
}
```

使用当前邻域和上一帧中心值推进二阶波动：

```glsl
highp vec2 px = 2.0 / max(_SimulationResolution.xy, vec2(1.0));

highp float avg =
    (left + right + bottom + top) * 0.20 +
    (downLeft + downRight + upLeft + upRight) * 0.05;

highp float value =
    (avg * 2.0 - previous) * _Damping +
    Interaction(uv) * _PointerStrength;
```

这里采用 `2px` 传播步长。若使用 `1px` 且波源持续注入，波前容易停留在源点附近，看起来像原地闪烁。

### 量化残差归零

波纹衰减后，低精度 RenderTexture 中可能残留接近零的噪声。后处理对梯度求导会放大这些残差，形成整屏雪花纹。

只对极小值硬归零，不要每帧从所有波幅中减去固定值：

```glsl
value = abs(value) < 0.0040 ? 0.0 : value;
value = clamp(value, -0.40, 0.40);
float packed = value + 0.5;
```

固定减幅会在波前尚未离开源点时将其削掉，导致“不扩散、只闪烁”。

## 输入波源

### 滑动指尖：胶囊 SDF

每个点同时携带当前坐标 `p.xy` 和上一帧坐标 `p.zw`。使用线段距离生成连续轨迹，避免高速移动时出现断点：

```glsl
vec2 pa = (uv - p.zw) * aspect;
vec2 ba = (p.xy - p.zw) * aspect;
float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00000001), 0.0, 1.0);
float strokeDistance = length(pa - ba * h);
```

用窄核心减去较宽外圈，形成带正负变化的波脊：

```glsl
float core = 1.0 - smoothstep(0.0, _PointerRadius * 0.40, strokeDistance);
float outer = 1.0 - smoothstep(0.0, _PointerRadius * 0.85, strokeDistance);
float trail = (core * 1.55 - outer * 0.46) * speedWeight * moving;
```

胶囊轨迹本身沿移动方向连续，波动方程会将能量主要向轨迹两侧传播，因此能形成明显的垂直扩散。

### 静止指尖：离散脉冲

静止指尖不要每帧持续执行正弦推拉。持续振荡会让源点反复变亮变暗，并可能使高度场局部饱和。

使用约 `0.8s` 周期的短脉冲：

```glsl
highp float Pulse(highp float time, highp float phase) {
    highp float cycle = fract(time * 1.25 + phase);
    highp float attack = smoothstep(0.02, 0.10, cycle);
    highp float release = 1.0 - smoothstep(0.10, 0.20, cycle);
    return -attack * release;
}
```

不同指尖传入不同 `phase`，避免十个波源完全同时叠加。点源只在速度接近静止时启用：

```glsl
float stationary = 1.0 - smoothstep(1.0, 4.0, speed);
float emitter = 1.0 - smoothstep(0.0, _PointerRadius * 0.28, pointDistance);
float ringSeed = emitter * Pulse(_Time, phase) * 0.22 * stationary;
```

## 三缓冲控制

每帧将 `curr` 作为 Blit 输入，将 `prev` 单独绑定为材质纹理，输出到 `next`：

```typescript
private stepSimulation(): void {
  this.physicsMaterial.setTexture("_PrevTex", this.prevTexture);
  this.physicsMaterial.setFloat("_Time", this.elapsed);
  this.physicsMaterial.setFloat("_PointerRadius", this.pointerRadius);
  this.physicsMaterial.setFloat("_PointerStrength", this.pointerStrength);
  this.physicsMaterial.setFloat("_Damping", this.damping);

  this.cmd.clearAll();
  this.cmd.blitWithMaterial(
    this.currTexture,
    this.nextTexture,
    this.physicsMaterial,
    0,
    false
  );
  this.getSceneObject().scene.commitCommandBuffer(this.cmd);
}
```

提交后只交换引用，不复制纹理：

```typescript
private rotateTextures(): void {
  const oldPrev = this.prevTexture;
  this.prevTexture = this.currTexture;
  this.currTexture = this.nextTexture;
  this.nextTexture = oldPrev;
}
```

最后将新的 `currTexture` 传给 Liquid 材质：

```typescript
this.liquidMaterial.setTexture("_RippleTex", this.currTexture);
```

## 手部关键点

读取双手时，每只手取五个指尖：

```typescript
const tips = [4, 8, 12, 16, 20];
```

通过 `hand.ID + ":" + tip` 保存每个指尖上一帧的位置。不能只按数组下标缓存，因为双手检测顺序可能变化。

每个点写入一个 `Vector4f`：

```typescript
new APJS.Vector4f(currentX, currentY, previousX, previousY)
```

最多写入 `_Point0 ... _Point9`，并同步 `_PointCount`。检测丢失时使用新的 history 集合替换旧集合，避免手重新进入画面后从旧坐标拉出一条长直线。

材质坐标与手部坐标的 Y 方向需要按当前算法输出确认。触摸坐标通常需要：

```typescript
const y = 1.0 - touch.position.y;
```

如果预览左右相反，再通过脚本的 `mirrorX` 统一处理，不要在多处分别翻转。

## Liquid 后处理材质

Liquid 材质绑定到 Camera 的 `PostProcess.custom`。它读取：

- `_MainTex`：相机输出
- `_RippleTex`：当前高度场
- `_Time`：驱动默认低频水面
- `_EffectAmount`：重载淡入系数

### 波纹法线与曲率

对高度场做 3×3 Sobel，得到波纹法线方向；邻域均值与中心高度的差值用于近似曲率：

```glsl
vec2 grad = vec2(
    (tr + 2.0 * cr + br) - (tl + 2.0 * cl + bl),
    (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)
) * 0.25;

float curve = (cl + cr + tc + bc) * 0.25 - center;
```

使用阈值遮罩隔离真实波纹，防止低幅残差影响整屏：

```glsl
float edgeMask = smoothstep(0.012, 0.040, length(grad));
float bodyMask = smoothstep(0.015, 0.065, abs(center));
float interaction = clamp(max(edgeMask, bodyMask * 0.75), 0.0, 1.0);
```

### 默认透明水面

没有交互波纹时，使用两个低频方向波生成平滑梯度：

```glsl
vec2 AmbientGradient(vec2 uv) {
    vec2 d0 = vec2(2.2, 0.8);
    vec2 d1 = vec2(-1.0, 2.8);
    vec2 g = d0 * cos(dot(uv, d0) + _Time * 0.22) * 0.012;
    g += d1 * cos(dot(uv, d1) - _Time * 0.17 + 1.7) * 0.008;
    return g * _SurfaceStrength;
}
```

将其作为约 `3–4px` 的低频折射偏移。默认水面不要启用色散；色散仅在真实波纹边界使用，否则细小采样误差会呈现彩色雪花。

### 折射合成

交互波纹偏移由梯度和曲率共同决定，再叠加默认水面：

```glsl
vec2 rippleDirection = grad / max(length(grad), 0.001);
vec2 rippleOffset =
    (grad * (0.52 * _Intensity) +
     rippleDirection * curve * (0.16 * _Intensity)) *
    aspect * interaction;

vec2 surfaceOffset = AmbientGradient(uv) * vec2(0.100, 0.070);
vec2 offset = clamp(surfaceOffset + rippleOffset, vec2(-0.055), vec2(0.055));
```

分别用略有差异的偏移采样 RGB，可在波峰边界产生轻微色散。最终使用 `interaction` 控制波纹折射权重，使用 `_SurfaceStrength` 控制默认水面权重。

## 推荐初始参数

| 参数 | 初始值 | 作用 |
|------|--------|------|
| `_PointerRadius` | `0.036` | 轨迹和点源半径 |
| `_PointerStrength` | `0.13` | 每次输入注入的高度 |
| `_Damping` | `0.972` | 波纹衰减速度 |
| `_SurfaceStrength` | `0.75` | 默认透明水面强度 |
| `_Intensity` | `1.0` | 交互波纹折射强度 |
| 高度死区 | `0.004` | 清理量化残差 |
| 传播步长 | `2px` | 波前每帧的空间传播尺度 |

调参顺序：

1. 先关闭真实手部输入，用一个固定点或模拟移动轨迹验证传播。
2. 调整传播步长和 `_Damping`，确认波会离开源点并按预期消失。
3. 调整 `_PointerStrength` 和 `_PointerRadius`，控制波纹边界宽度。
4. 单独调整 Liquid 的折射系数，不要用更高物理强度补偿合成太弱。
5. 关闭模拟输入，恢复真实指尖并检查坐标方向。

## 最小 DSL 流程

下面的 `assetName` 只是材质文件名，不要创建 `Materials` 文件夹，也不要传入带目录的路径：

```json
[
  {
    "tool_name": "materialAsset",
    "payload": {
      "operation": "create",
      "assetName": "水波物理材质.omtl",
      "omtlContent": "<完整物理材质 OMTL>"
    },
    "alias": "physicsMat"
  },
  {
    "tool_name": "materialAsset",
    "payload": {
      "operation": "create",
      "assetName": "液态水波材质.omtl",
      "omtlContent": "<基于验证骨架的完整 Liquid OMTL>"
    },
    "alias": "liquidMat"
  },
  {
    "commandType": "add_component",
    "params": {
      "scene_object_guid": "<camera-guid>",
      "component_type": "PostProcess"
    },
    "alias": "pp"
  },
  {
    "commandType": "configure_post_process_custom",
    "params": {
      "guid": { "$ref": "pp" },
      "material_guid": { "$ref": "liquidMat" }
    }
  }
]
```

随后添加 `WaterRippleController` 脚本组件，并分别绑定两份材质和三张 RenderTexture。物理材质不需要绑定到 PostProcess。

## 验证清单

- 三张 RT 启动时均为中性灰，没有继承编辑态输入纹理。
- 重载后的前两帧不显示历史波纹，随后默认水面平滑淡入。
- 无手部输入时，画面存在低频透明水膜，没有全屏雪花。
- 指尖静止时，一个圆环离开指尖继续向外传播，而不是在原地闪烁。
- 指尖移动时，轨迹连续且波脊向两侧扩散，没有离散圆点。
- 波纹停止后能在预期时间内消失，画面回到默认水面。
- `configure_post_process_custom` 返回 `customConfigured: true`，且 `postProcessList` 包含 `Custom`。
- 运行日志只有初始化信息，没有脚本异常。

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 波纹只在指尖原地闪烁 | 静止源每帧持续振荡，或传播步长过小 | 改为离散短脉冲；将逻辑采样步长提高到 `2px` |
| 滑动时只有断续圆点 | 只传当前坐标，没有上一帧坐标 | 使用 `(current, previous)` 胶囊 SDF |
| 波纹不向轨迹两侧扩散 | 轨迹注入只有单一正值或高度场被过早削弱 | 使用核心减外圈的波脊；检查死区是否只清除极小值 |
| 波纹消失后满屏雪花 | RT 量化残差被 Sobel 放大 | 对 `abs(value) < 0.004` 硬归零；默认水面不要启用色散 |
| 重载时整屏闪亮或闪暗 | 三张 RT 保留旧状态，或首帧立即合成 | 清空为 `0.5`，等待两帧，再淡入 `_EffectAmount` |
| 默认水面完全看不见 | 低频偏移小于一个像素 | 提高 `surfaceOffset`，保持低频连续，不要增加高频噪声 |
| 整屏像毛玻璃而非透明水面 | 默认扰动频率或折射权重过高 | 降低默认水面频率和混合比例，仅增强平滑位移 |
| 手重新出现时拉出长线 | 复用了检测丢失前的历史坐标 | 每帧用当前检测结果重建 point history |
| 波纹速度随设备分辨率变化 | `_SimulationResolution` 与实际模拟分辨率不匹配 | 绑定一致的逻辑分辨率，并由 texel size 计算采样偏移 |

## 实现边界

- 当前方案是屏幕空间高度场，不处理真实三维遮挡和水面深度。
- 三张 RT 会增加显存和每帧一次全屏物理 Blit；移动端应按视觉需求降低模拟分辨率。
- 物理材质依赖两帧历史，不能安全合并为单张纹理原地读写。
- 材质源码修改后应重新绑定 PostProcess Custom，并保存工程后再做最终预览判断。
