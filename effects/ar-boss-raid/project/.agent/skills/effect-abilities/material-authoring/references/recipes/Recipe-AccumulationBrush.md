# Recipe: Accumulation Brush (FBO-read soft dab)

> Loaded on demand from `.agent/skills/effect-abilities/material-authoring/材质编写.md`. **Prerequisite**: you've already read the SKILL.md starter template — this file shows only the deltas you apply on top of it.
>
> Pairs with the **Persistent Canvas (CommandBuffer)** section in `skills/BrushStroke/SKILL.md` (the soft-edge upgrade for `CommandBuffer.drawMesh` stamps) and, equivalently, its bake-to-texture alternative / the APJS example `APJS/examples/canvas_painter.json`. This material is the "soft dab" stamped into the canvas RenderTexture — use it when a near-binary disc edge isn't soft enough.

## What this produces

- A soft, feathered (airbrush-like) circular brush dab with **procedural** radial alpha — no texture needed.
- `_Color` (runtime-switchable), `_Hardness` (edge softness), `_Opacity` uniforms.
- **FBO-read programmable blending** so semi-transparent dabs accumulate correctly when stamped repeatedly into the same RenderTexture, instead of erasing the paint underneath them.

## Why hardware blend is wrong here

With hardware `BlendMode: NORMAL`, a semi-transparent dab *reduces* the destination alpha wherever it overlaps. When you bake many overlapping dabs into one canvas texture, each new dab wipes out the previous overlapping one — only the **last dab of a stroke survives**. `LIGHTEN`/max does not fix it. The fix is to read the destination (the FBO / current canvas) in the shader and composite "over" manually.

## Pass config override

The starter uses `"BlendMode": "DISABLED"`, `DepthTest/DepthWrite True`, `RenderQueue 2000`. For an accumulation dab, change to programmable blend, depth off, transparent queue:

```json
"Pass": [{"Ausl":"a1","Cull":"Back","DepthTestEnable":"False","DepthWriteEnable":"False","BlendMode":"Normal_v2"}]
```

and set top-level `"RenderQueue": 3000`.

- `DepthTestEnable/DepthWriteEnable False`: the bake camera runs with `clearType = DONT`, so depth is never cleared — leaving depth on would reject later dabs.
- `BlendMode: "Normal_v2"` selects the engine's programmable-blend path that exposes the destination via `u_FBOTexture` and `ApplyBlendMode`. Mirror whatever `BlendModeOptions[...]` the reference material uses (see "Reference" below).

## UIPROPERTY delta

Replace the starter's albedo block with:

```
    $基础色$
    _Color (颜色, Color) = [1.0, 1.0, 1.0, 1.0]
    _Hardness (硬度, Range(0.0, 1.0)) = 0.35
    _Opacity (透明度, Range(0.0, 1.0)) = 1.0
```

## AUSL deltas

Add the destination-read varying and the blend include. The fragment shader needs **world-space position** (`v_posWS`) because `blend.glsl` projects world-space → FBO lookup; omitting it is a compile error.

Add to `#pragma varying varyings`:

```glsl
highp vec2 v_uv;
highp vec3 v_posWS;
```

Add the blend library include and the FBO/view uniforms near the `#pragma fs` block (the engine defines `DEFINE_BUILTIN_MAT_UNIFORMS`, so the builtin block is skipped and you declare `u_FBOTexture` / `u_View` / `u_Projection` yourself — match the reference material's exact declarations):

```glsl
#include "Packages/core/blend.glsl"
```

```glsl
    #pragma fs varyings targets
        precision mediump float;
        uniform lowp vec4 _Color;
        uniform lowp float _Hardness;
        uniform lowp float _Opacity;
    #pragma end
```

In `vertex()`, also output world-space position alongside the existing `gl_Position` math:

```glsl
    v_posWS = (u_Model * vec4(attPosition, 1.0)).xyz;
```

Replace the `fragment()` body with the procedural soft disc + FBO-read composite (this is the authoritative snippet from the reference effect):

```glsl
void fragment() {
    float d = length(v_uv - 0.5) * 2.0;        // 0 at center -> 1 at rim
    float a = 1.0 - smoothstep(_Hardness, 1.0, d); // radial falloff
    a *= _Opacity * _Color.a;
    o_fragColor = ApplyBlendMode(vec4(_Color.rgb, a));
}
```

`ApplyBlendMode` does a proper "over" composite reading the current canvas, so soft gradients accumulate without erasing.

## Runtime control (color switching)

Use **one shared material** for all dabs. Switch brush color at runtime on swatch tap — already-baked strokes keep their color because they live in the RenderTexture, so switching only affects new dabs:

```typescript
this.dabMaterial.setColor('_Color', this.colors[i]);
this.dabMaterial.setFloat('_Hardness', this.brushHardness);
this.dabMaterial.setFloat('_Opacity', this.brushOpacity);
```

See `APJS/examples/canvas_painter.json` for the full controller (pool, bake-once-then-disable, stroke smoothing, Clear).

## Verification

- `materialAsset.create` returns `warnings: []` and no `compile_error`. Note: custom-material `compiled: false` is **not** authoritative — verify by rendering.
- Bake a single dab → a soft feathered disc (not a hard pixelated circle). If it's a hard disc, `_Hardness` is too high or the radial falloff was dropped.
- Drag a slow stroke, then a second stroke crossing it → the crossover region should show **both** strokes blended, not the first one erased. If the first stroke disappears under the second, you're still on hardware `NORMAL` blend — switch the Pass to `Normal_v2` + `ApplyBlendMode`.
- If the material fails to compile mentioning a missing varying/uniform, confirm `v_posWS` is declared and written, `#include "Packages/core/blend.glsl"` is present, and `u_FBOTexture`/`u_View`/`u_Projection` match the reference material.

## Reference

Adapted from the bundled reference effect `3DDrawBrushAPJS` (`Assets/3DDrawAssets/Materials/BrushRender_Mat.omtl`). When the exact `BlendModeOptions[...]` or builtin-uniform declarations are unclear, open that material as the source of truth — it is read-only inspiration, not a dependency.
