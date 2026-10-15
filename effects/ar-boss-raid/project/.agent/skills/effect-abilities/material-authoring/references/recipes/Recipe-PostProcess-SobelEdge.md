# Recipe: PostProcess Custom Sobel Edge

> Loaded on demand from `.agent/skills/effect-abilities/material-authoring/材质编写.md`. **Prerequisite**: you've already read the PostProcess section in `SKILL.md`, copied the full validated OMTL from `.agent/skills/effect-abilities/material-authoring/references/PostProcess-CustomMaterial-Reference.md`, are using `sceneOps` with `type: "PostProcess"`, and are treating this recipe only as an effect delta on top of that validated PostProcess skeleton.

## What this produces

- A concrete fullscreen PostProcess custom material that samples `_MainTex`.
- A luminance-based Sobel edge pass suitable for validating that PostProcess custom-material binding works.
- A small scene pattern that makes the edge response easy to see.

## When to use it

Use this recipe when:
- the user explicitly asks for edge detection or visible outlines
- you need a known-good PostProcess custom-material example before designing a different fullscreen effect
- you want to validate the PostProcess pipeline before iterating on blur, distortion, masking, or stylization

## Pass setup

Use the same full-screen pass shape as the validated PostProcess starter. This recipe does **not** redefine the whole shader; it only supplies the Sobel effect delta that you apply on top of the copied reference file:

```json
{
  "Shader": "EdgeDetectPostFX",
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
```

This matters: leaving the pass too minimal can make the output look like the camera render is bypassing the effect. This recipe assumes you keep the validated starter pass shape and only swap in the Sobel fragment logic.

## Material fragment logic

After copying the full validated reference, keep the validated skeleton unchanged and add these Sobel helpers inside the `#pragma fs varyings targets` block. Then replace only the effect logic / helper call site rather than rebuilding the whole shader from scratch:

```glsl
        float Luminance(vec3 color)
        {
            return dot(color, vec3(0.2126, 0.7152, 0.0722));
        }

        float SobelMagnitude(vec2 uv)
        {
            vec2 pixelSize = 1.0 / u_ScreenParams.xy;
            vec2 stepSize = pixelSize;

            float tl = Luminance(texture(_MainTex, uv + vec2(-1.0, 1.0) * stepSize).rgb);
            float t = Luminance(texture(_MainTex, uv + vec2(0.0, 1.0) * stepSize).rgb);
            float tr = Luminance(texture(_MainTex, uv + vec2(1.0, 1.0) * stepSize).rgb);
            float l = Luminance(texture(_MainTex, uv + vec2(-1.0, 0.0) * stepSize).rgb);
            float r = Luminance(texture(_MainTex, uv + vec2(1.0, 0.0) * stepSize).rgb);
            float bl = Luminance(texture(_MainTex, uv + vec2(-1.0, -1.0) * stepSize).rgb);
            float b = Luminance(texture(_MainTex, uv + vec2(0.0, -1.0) * stepSize).rgb);
            float br = Luminance(texture(_MainTex, uv + vec2(1.0, -1.0) * stepSize).rgb);

            float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
            float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
            return length(vec2(gx, gy));
        }

        vec4 ApplyEdgeDetect(vec2 uv)
        {
            float edge = SobelMagnitude(uv) * 2.4;
            edge = smoothstep(0.18, 0.28, edge);

            vec3 edgeColor = vec3(1.0) * edge;
            return vec4(edgeColor, 1.0);
        }
```

Then keep the validated fragment output shape and only switch the effect helper call:

```glsl
void fragment()
{
    vec4 color = ApplyEdgeDetect(v_uv);
    o_fragColor = color;
}
```

Do not rewrite the JSON header, Pass config, fullscreen vertex shape, or `#pragma output targets` from memory while applying this recipe.

## Why this example is useful

- It matches the referenced demo's default direction more closely: source scene goes through Sobel, then the output is a black/white edge pass.
- It uses `u_ScreenParams` to derive the texel size, which was validated on this branch.
- It is simple enough to adapt into overlay, blur, emboss, colored outline, or thresholded mask variants.

## Recommended validation scene

Use a dark camera clear color plus a few high-contrast objects:
- dark blue background
- red sphere on the left
- tall green cube or pillar in the middle
- blue sphere on the right

This makes it easy to see whether the edge overlay is responding to object silhouettes.

## Minimal DSL flow

The example `assetName` below is only a material file name. Do not create a `Materials` folder or pass a folder-qualified path.

```json
[
  {
    "commandType": "find_object",
    "params": { "component_type": "Camera", "global": true },
    "alias": "cam"
  },
  {
    "tool_name": "materialAsset",
    "payload": {
      "operation": "create",
      "assetName": "边缘检测后处理材质.omtl",
      "omtlContent": "<full OMTL text>"
    },
    "alias": "edgeMat"
  },
  {
    "tool_name": "sceneOps",
    "payload": {
      "ops": [
        {
          "op": "add",
          "type": "PostProcess",
          "id": "边缘检测后处理",
          "effectType": "Custom",
          "materialGuid": "<material-guid-from-edgeMat>"
        }
      ]
    }
  }
]
```

## Verification

- `materialAsset.create` should return successfully.
- Check `compileStatus.result.errorMessage` / `compile_error` first.
- If `compiled` is false but there is no `compile_error`, do **not** jump straight to “the branch/project PostProcess compile chain is broken”; verify binding state and screenshot evidence first.
- `sceneOps` PostProcess add/modify should report `success: true` and include `custom._material` and `custom.enabled` in the returned properties.
- A screenshot should show a black background with white edge response rather than preserving the original scene colors.
- If an older material already went through a failed compile cycle and the result still looks misleading after one clean overwrite plus rebinding, create a brand-new material from the validated reference and apply this Sobel delta there instead of continuing to patch the old asset.

## Tuning guide

- If the effect is too weak, increase the Sobel multiplier before changing the kernel size.
- If you want the original scene plus outlines, add a separate overlay mix step explicitly instead of assuming this recipe keeps source colors.
- If the edge becomes too broad, tighten the `smoothstep` window before changing object layout.
- If nothing is visible, first verify the source scene has strong contrast and the material is actually bound to `PostProcess`.
- If the project still has an older APJS/script bridge touching the PostProcess material, verify that it is not still writing uniforms that no longer exist on the current Sobel shader.
