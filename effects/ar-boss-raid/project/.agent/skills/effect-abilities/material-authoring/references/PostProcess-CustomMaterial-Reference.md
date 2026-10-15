# PostProcess Custom Material Reference

> Read this before authoring a non-trivial PostProcess custom material. This file is a **full validated example**, not a recipe delta. Use it as the whole starting point for blur, edge detect, distortion, masking, color remap, or other screen-space effects.

## Why this reference exists

PostProcess custom materials are easier to break than ordinary mesh materials because several concerns must all be correct at once:

- JSON header / Pass config
- fullscreen vertex shape
- `_MainTex` sampling
- `u_ScreenParams` texel-size derivation
- final output semantics (edge-only, overlay, invert, thresholded mask, etc.)

If you assemble a PostProcess material from scattered snippets, it is easy to end up with valid-looking shader math on top of a broken pass shape. Start from this whole file, prove it works, then modify only the effect logic. For non-trivial PostProcess authoring, this whole file is the starting point — do not rebuild the skeleton from memory or from recipe fragments.

## Full validated OMTL example

```txt
{
  "Shader": "PostFXReference",
  "RenderQueue": 2000,
  "Pass": [
    {
      "Ausl": "a1",
      "Cull": "Back",
      "DepthTestEnable": "False",
      "DepthWriteEnable": "False",
      "ZTest": "Always",
      "BlendMode": "DISABLED"
    }
  ]
}
---ENDJSON

---BEGIN UIPROPERTY
---END UIPROPERTY

---BEGIN a1

    #version 300 es
    #pragma only_renderers glsl30 metal

    #pragma input attributes
        in vec3 attPosition;
        in vec2 attTexcoord0;
    #pragma end

    #pragma varying varyings
        highp vec2 v_uv;
    #pragma end

    #pragma output targets
        out highp vec4 o_fragColor;
    #pragma end

    #pragma vs attributes varyings
        uniform vec4 u_ScreenParams;
    #pragma end

    #pragma fs varyings targets
        precision highp float;
        uniform vec4 u_ScreenParams;
        precision mediump float;
        uniform sampler2D _MainTex;

        vec4 ApplyPostFX(vec2 uv)
        {
            return texture(_MainTex, uv);
        }
    #pragma end

    void vertex()
    {
        gl_Position = vec4(attPosition.xy, 0.0, 1.0);
        v_uv = attTexcoord0;
    }

    void fragment()
    {
        vec4 color = ApplyPostFX(v_uv);
        o_fragColor = color;
    }

---END a1
```

## What each part is for

### JSON / Pass config

```json
{
  "RenderQueue": 2000,
  "Pass": [
    {
      "Cull": "Back",
      "DepthTestEnable": "False",
      "DepthWriteEnable": "False",
      "ZTest": "Always",
      "BlendMode": "DISABLED"
    }
  ]
}
```

Keep this validated pass shape unless you have a verified reason to change it. Over-simplifying the pass config can produce broken or misleading output even when the fragment logic looks correct.

### Fullscreen vertex shape

```glsl
#pragma input attributes
    in vec3 attPosition;
    in vec2 attTexcoord0;
#pragma end

#pragma varying varyings
    highp vec2 v_uv;
#pragma end

void vertex()
{
    gl_Position = vec4(attPosition.xy, 0.0, 1.0);
    v_uv = attTexcoord0;
}
```

This is the validated fullscreen quad shape for this branch. Keep it unchanged unless you are intentionally switching to a custom post-process mesh.

### Camera input sampling and helper placement

```glsl
#pragma fs varyings targets
    precision highp float;
    uniform vec4 u_ScreenParams;
    precision mediump float;
    uniform sampler2D _MainTex;

    vec4 ApplyPostFX(vec2 uv)
    {
        return texture(_MainTex, uv);
    }
#pragma end
```

- `_MainTex` is the camera output texture.
- `u_ScreenParams` is the validated place to derive pixel/texel scale for neighbor sampling.
- If a helper depends on `_MainTex` or `u_ScreenParams`, keep that helper in this fs block instead of moving it elsewhere.

## Non-negotiable structure constraints

Keep these parts aligned with the validated reference unless you have branch-validated proof that a change is required:

- In `#pragma output targets`, keep `out highp vec4 o_fragColor;`
- If a helper depends on `_MainTex` or `u_ScreenParams`, keep it inside the `#pragma fs varyings targets` block
- After the pragma blocks, keep only the top-level entry points `vertex()` and `fragment()`
- Keep the default fragment output shape:

```glsl
void fragment()
{
    vec4 color = ApplyPostFX(v_uv);
    o_fragColor = color;
}
```

- For the first working version, do not change `vertex()`, `gl_Position`, or `v_uv = attTexcoord0`

## How to extend this reference

Start by changing only `ApplyPostFX(vec2 uv)`.

### 1. Pass-through smoke test

Keep:

```glsl
vec4 ApplyPostFX(vec2 uv)
{
    return texture(_MainTex, uv);
}
```

Use this first to prove the custom material is correctly bound to `PostProcess`.

### 2. Neighbor sampling / texel math

When you need blur, Sobel, emboss, sharpen, or offset distortion:

```glsl
vec2 pixelSize = 1.0 / u_ScreenParams.xy;
```

Prefer this validated pattern before trying `textureSize(_MainTex, 0)`.

### 3. Output semantics

Decide explicitly which output class you want:

- **pass-through** — return sampled source directly
- **overlay** — keep source and mix in the derived effect
- **edge-only / mask-only** — return only the processed result
- **invert / thresholded result** — post-process the final color intentionally

Do not change kernel math and output semantics at the same time unless you are deliberately redesigning the effect.

## Minimal DSL flow

```json
[
  {
    "tool_name": "materialAsset",
    "payload": {
      "operation": "create",
      "assetName": "自定义后处理材质.omtl",
      "omtlContent": "<full OMTL text>"
    },
    "alias": "postMat"
  },
  {
    "tool_name": "materialAsset",
    "payload": {
      "operation": "get_compile_status",
      "guid": "<material-guid-from-postMat>"
    }
  },
  {
    "tool_name": "sceneOps",
    "payload": {
      "ops": [
        {
          "op": "add",
          "type": "PostProcess",
          "id": "自定义后处理",
          "effectType": "Custom",
          "materialGuid": "<material-guid-from-postMat>"
        }
      ]
    }
  },
  {
    "tool_name": "setupGameScript",
    "payload": {
      "resourceBindings": [
        {
          "property": "postProcessMaterial",
          "type": "Material",
          "guid": "<material-guid-from-postMat>"
        },
        {
          "property": "revealTexture",
          "type": "Texture",
          "guid": "<generated-texture-resource-guid>"
        }
      ]
    }
  }
]
```

If the shader is static and does not need runtime texture or finger/touch uniforms, omit the `setupGameScript` resource-binding step. If runtime code writes any material uniforms, call `setupGameScript` with `resourceBindings` after the serialized fields exist, binding the same material GUID used by the PostProcess `op: "add"` call to `GameManager.postProcessMaterial`. Texture entries must use Texture resource GUIDs, not asset file names.

## Verification workflow

1. First run the pass-through version.
2. Confirm the material has no compile error from `compileStatus` / `get_compile_status` before creating or configuring PostProcess.
3. Confirm the material binds through `sceneOps` `type: "PostProcess"` and the preview matches the source camera render.
4. If runtime script drives the material, confirm `GameManager` has serialized material/texture fields and `setupGameScript` has assigned the material and texture resources through `resourceBindings` before previewing. If the fields were added after PostProcess creation, inspect `GameManager.ts`, compile after adding the fields, then retry only the `resourceBindings` call. If the material was regenerated after a compile failure, call PostProcess `op: "modify"` with the existing `componentGuid` and the new `materialGuid`, then rebind `GameManager` through `setupGameScript`.
5. Then replace only `ApplyPostFX()` with your custom logic.
6. Screenshot again and compare the result against the intended output semantics.

## Common failure patterns

- **Looks like the camera render bypassed the effect**
  - Usually the pass config was stripped down too far, or the shader no longer samples `_MainTex`.
- **The math looks right but the result is wrong**
  - Often the output semantics changed: overlay vs edge-only vs pass-through.
- **The effect is invisible**
  - Start from pass-through again, then add only one processing step at a time.
- **The output is washed out / unexpectedly black**
  - Check whether you are returning the processed result alone or mixing it with the source.
- **`#pragma output targets` is empty but `fragment()` still writes `o_fragColor = ...`**
  - Restore the validated output block. Do not rely on an undeclared output target.
- **The shader samples `_MainTex`, but helper placement drifted**
  - Keep `_MainTex` / `u_ScreenParams`-dependent helpers inside the `#pragma fs varyings targets` block instead of moving them into the wrong structural region.
- **You copied only the sampling math, not the validated skeleton**
  - Re-copy the whole reference file, then reapply only the effect logic.

## Recovery after a failed material iteration

If a PostProcess material has already gone through a failed compile cycle and the preview still looks misleading after one clean overwrite plus rebind, stop patching that old asset. The observed recovery path on this branch is to create a brand-new material from this full validated reference, reapply the intended effect logic there, and bind the new material GUID.

If the project also contains an older APJS/script bridge that still writes uniforms into the material, confirm that those uniforms still exist on the current shader before blaming the PostProcess skeleton.

## How this relates to recipes

Use this file as the whole validated base for complex PostProcess authoring. Then read a recipe only for the specific effect delta you want to add, such as Sobel edge detection.
