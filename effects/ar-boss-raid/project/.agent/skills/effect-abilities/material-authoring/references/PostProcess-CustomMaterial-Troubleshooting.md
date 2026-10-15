# PostProcess Custom Material Troubleshooting

> Loaded on demand from `.agent/skills/effect-abilities/material-authoring/材质编写.md`. Read this only when a PostProcess custom material is bound but the result is wrong, invisible, or misleading.

## Triage order

Check problems in this order:

1. **Material command result triage**
   - Inspect `compileStatus.result.errorMessage` / `compile_error` first.
   - Do not look for an import-file failure path; `materialAsset.create` creates a built-in Unlit material, renames it, overwrites its OMTL, then reports compile status.
   - Treat `compiled:false` only as a broad “not confirmed successful” signal. By itself it is not enough to conclude that the current branch/project PostProcess compile chain is broken.
2. **PostProcess binding state**
   - Confirm `Custom` is present in `postProcessList`.
   - Confirm `sceneOps` PostProcess add/modify returned `success: true` and set the intended material GUID.
3. **Shader skeleton integrity**
   - Compare the current OMTL against `PostProcess-CustomMaterial-Reference.md`.
4. **Old material / old script contamination**
   - If this asset already failed compile earlier and still behaves wrongly after one clean overwrite plus rebind, prefer a fresh material.
   - If the project still has an APJS/script bridge, confirm it is not writing removed uniforms.
5. **Preview output semantics**
   - Distinguish pass-through vs overlay vs edge-only before blaming the binding path.

## Structural failures

### `#pragma output targets` is empty but `fragment()` still writes `o_fragColor = ...`

This drifted away from the validated skeleton.

**Fix:** restore the validated output block and keep:

```glsl
#pragma output targets
    out highp vec4 o_fragColor;
#pragma end
```

### Helpers were moved out of the validated fs region

If a helper depends on `_MainTex` or `u_ScreenParams`, it must stay aligned with the validated reference structure.

**Fix:** move `_MainTex` / `u_ScreenParams`-dependent helpers back to the same structural region shown in `PostProcess-CustomMaterial-Reference.md` and keep only `vertex()` / `fragment()` as the entry functions.

### Only the sampling math was copied, not the whole skeleton

This is a common source of “looks valid, does nothing.”

**Fix:** rebuild the `omtlContent` payload from the full validated reference text, then reapply only the effect logic. Do not copy the reference into `Assets/` as a draft file.

## Material state failures

### Old material still behaves strangely after compile failure

Observed behavior on this branch: a PostProcess material can remain misleading after a failed compile cycle even if it can later be rebound.

**Fix:** stop patching the old asset. Create a **brand-new** material from `PostProcess-CustomMaterial-Reference.md`, reapply the intended effect logic there, and bind the new material GUID.

### Result still looks wrong after a clean rebind

If rebinding the same old material does not restore the expected output, do not keep iterating on that asset forever.

**Fix:** use the same fresh-material recovery path above.

## Project contamination failures

### An older APJS/script bridge is still touching the material

A stale script may keep writing uniforms that no longer exist on the current shader, which creates misleading validation signals.

**Fix:** inspect the project for an older PostProcess script bridge before blaming the skeleton. If the script writes uniforms removed from the current material, remove that interference or update the script.

### No visible effect even though binding succeeded

Do not immediately conclude the DSL path is broken.

**Fix:** first verify:
- `compileStatus.result.errorMessage` / `compile_error` is empty
- `Custom` is present in `postProcessList`
- the current OMTL still matches the validated reference skeleton
- the preview semantics are what you intended

## Output semantics failures

### The scene colors are still visible when you expected black/white edges only

That is usually an output-semantics mismatch, not a binding failure.

**Fix:** confirm whether your effect returns:
- pass-through
- overlay
- edge-only / mask-only
- invert / thresholded result

Change output semantics intentionally; do not change kernel math and output class at the same time unless you are redesigning the effect.

## Fast recovery recipe

When in doubt:

1. Start from `PostProcess-CustomMaterial-Reference.md`
2. Keep the pass-through version first
3. Bind it through `sceneOps` `type: "PostProcess"` with `op: "add"` or `op: "modify"`
4. Confirm preview matches camera output
5. Apply one effect delta (for example `Recipe-PostProcess-SobelEdge.md`)
6. If the material already failed earlier and the result remains suspicious, create a fresh material asset instead of patching the old one
