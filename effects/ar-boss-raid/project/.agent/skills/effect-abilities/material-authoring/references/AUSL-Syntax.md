# AUSL Language Reference

> Loaded on demand from `.agent/skills/effect-abilities/material-authoring/材质编写.md`. Consult when you need to write AUSL that goes beyond what the starter + recipes demonstrate — most materials don't need it.

**What AUSL is**: GLSL ES 3.0+ with a pragma layer that packs vertex and fragment code into a single file. No added syntax beyond the pragmas below. Anything valid in GLSL ES 3.0 is valid inside the stage code.

## Single-line pragmas

| Pragma | Purpose | Notes |
|--------|---------|-------|
| `#pragma only_renderers glsl30 metal` | Restrict which renderers compile this shader | Always use this exact form for materials |
| `#pragma exclude_renderers <r>` | Skip a specific renderer | Rarely needed |
| `#pragma require <cap>` | Require a hardware ability (e.g. `framebufferfetch`) | Use only when shader actually depends on the cap |
| `#pragma multi_compile <A> <B> ...` | Dynamic macros — toggleable at runtime. Macros on **one line are mutually exclusive**. Macros from **different lines combine** — each extra line multiplies variant count. Dynamic macros **must start with `AE_`**. | Prefer `shader_feature` — `multi_compile` explodes the variant set |
| `#pragma shader_feature <MACRO>` | Static macro driven by UIPROPERTY `Defs` toggle. No runtime variants. | Use for every `Defs` in UIPROPERTY |

Variant cost: two lines `#pragma multi_compile AE_A` and `#pragma multi_compile AE_B` produce **4 variants** (∅, A, B, A+B). For N independent toggles it's 2^N — keep `multi_compile` lines to ≤ 2 unless you truly need runtime switching. Cold-start compile time scales with variant count.

## Block pragmas (always paired with `#pragma end`)

| Block | Contents | Arguments after the tag |
|-------|----------|--------------------------|
| `#pragma input <name>` | Vertex attributes (`in vec3 attPosition;`) | One name — identifier for this block |
| `#pragma varying <name>` | Vertex→fragment varyings. **No `in`/`out` prefix — bare declarations.** | One name |
| `#pragma output <name>` | Fragment render targets (`out vec4 o_fragColor;`) | One name |
| `#pragma global <name>` | Shared structs/consts used by vs+fs (optional; argument may be omitted) | One optional name |
| `#pragma vs <input> <varying> [global]` | Vertex stage — uniforms, `#include`s, helpers. First two args are the input/varying block names; optional third is a global block name. | 2 or 3 names |
| `#pragma fs <varying> <output>` | Fragment stage — uniforms, `#include`s, helpers | 2 names |

Names are free-form identifiers — the starter uses `attributes` / `varyings` / `targets`, but you can pick any names as long as they match between the producer block and the consumer (`vs`/`fs`).

## Entry points

| Function | Stage | Required |
|----------|-------|----------|
| `void vertex()` | Vertex main | Yes for graphics passes |
| `void fragment()` | Fragment main | Yes for graphics passes |
| `void compute()` | Compute main | Only when writing a compute shader — **not used by materials** |

Names are fixed — the preprocessor hunts for exactly these identifiers.

## GLSL built-in variables available in AUSL

AUSL is GLSL ES 3.0 — all standard built-ins work. These are commonly needed for advanced materials:

| Variable | Stage | Meaning | Usage |
|----------|-------|---------|-------|
| `gl_InstanceID` | vertex | Instance index when `InstanceCount` > 0 in Pass config | `float shellT = float(gl_InstanceID) / (count - 1.0);` |
| `discard` | fragment | Discard the current fragment (hard cutout) | `if (alpha < 0.5) discard;` |

`discard` requires no special declaration — it's a GLSL keyword. `gl_InstanceID` requires `"InstanceCount"` set in the Pass JSON (see `.agent/skills/effect-abilities/material-authoring/references/recipes/Recipe-FurShell.md` for a complete example).

## `#include` placement

`#include "<path>"` directives MUST live inside a `#pragma vs` or `#pragma fs` block — not at top level, not between blocks. Each stage needs its own include set because they see different uniform / varying environments.

Path form: always relative, always starting with `Packages/...`. The engine rewrites `Packages/` → `<OrionShaderLibrary_root>/` at load, and reverses on save. The segment immediately after `Packages/` must be a real OrionShaderLibrary subdirectory — `3D/`, `core/`, or `common/`. **Do not invent npm-style prefixes** like `Packages/@amazing/orion-shader-library/...` — these do not exist on disk and the include silently expands to nothing (symptom: `'getBoneTransform' : no matching overloaded function found`).

## Other hard rules

- **`#version` MUST be the first non-empty line** of the AUSL block. It pins the GLSL ES version; anything before it is a compile error.
- **Comments**: only `//` single-line. `/* ... */` blocks are not supported.
- **Conditional compilation**: use `#ifdef <MACRO>` / `#ifndef` / `#else` / `#endif`. Do not use `#if <MACRO>` as a toggle check — not supported.

## Comprehensive example (adapted from engine docs — reference only)

This example shows `#pragma global`, a 3-arg `#pragma vs`, `multi_compile` with mutually-exclusive modes, and `shader_feature` combined with `#ifdef`. The starter template + recipes cover most real use — reach for `global` / multi-mode only when those tools are actually needed.

```glsl
#version 300 es
#pragma only_renderers glsl30 metal
#pragma multi_compile AE_MODE_A AE_MODE_B
#pragma shader_feature USE_FADE

#pragma global shared_defs
struct LightParams { vec3 pos; vec3 dir; float intensity; };
const int LIGHT_COUNT = 4;
#pragma end

#pragma input attributes
in vec3 attPosition;
in vec2 attTexcoord0;
#pragma end

#pragma varying varyings
vec2 v_uv;
#pragma end

#pragma output targets
out vec4 o_fragColor;
#pragma end

#pragma vs attributes varyings shared_defs
uniform highp mat4 u_MVP;
#ifdef AE_MODE_A
#include "Packages/core/common.glsl"
#endif
#pragma end

#pragma fs varyings targets
uniform lowp sampler2D _MainTex;
const float fade = 0.5;
#pragma end

void vertex() {
    gl_Position = u_MVP * vec4(attPosition, 1.0);
    v_uv = attTexcoord0;
}

void fragment() {
    vec4 color = texture(_MainTex, v_uv);
#ifdef USE_FADE
    color *= fade;
#endif
    o_fragColor = color;
}
```
