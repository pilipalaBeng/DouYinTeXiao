# Recipe: Shell-Based Fur

> Loaded on demand from `.agent/skills/effect-abilities/material-authoring/材质编写.md`. **Prerequisite**: you've already read the SKILL.md starter template — this recipe replaces the starter entirely since fur needs vertex displacement + instanced rendering.

## What this produces

- A procedural fur material using **shell-based rendering**: the same mesh drawn many times, each "shell" extruded slightly along vertex normals. The fragment shader uses 3D noise to discard pixels, creating the illusion of individual fur strands.
- Controllable via UIPROPERTY: fur color, shell count, strand length, density, and rim light power.
- Requires `"InstanceCount"` in the Pass config — the engine issues an instanced draw call and `gl_InstanceID` (GLSL ES 3.0 built-in) is available in `void vertex()`.

## Pass config

```json
"Pass": [{"Ausl":"a1","InstanceCount":"48","Cull":"Back","DepthTestEnable":"True","DepthWriteEnable":"True","ZTest":"LessEqual","BlendMode":"DISABLED"}]
```

- `"InstanceCount": "48"` — number of shell layers. Must match the `_ShellCount` UIPROPERTY value. Change both together.
- `"RenderQueue": 2000` — opaque queue (set at top level).
- `"BlendMode": "DISABLED"` — transparency handled by `discard`, not alpha blending.
- `"DepthWriteEnable": "True"` — shells write depth so fur occludes correctly.

## UIPROPERTY

```
---BEGIN UIPROPERTY

    $毛发$
    _FurColor (颜色, Color) = [1.000000, 0.517647, 0.258824, 1.000000]
    _ShellCount (毛发壳层数量, Float) = 48.000000
    _ShellLength (长度范围, Range(0.010000, 0.800000)) = 0.280000
    _FurDensity (密度, Range(10.000000, 60.000000)) = 28.000000
    _RimPower (光晕强度, Range(0.500000, 8.000000)) = 2.800000

---END UIPROPERTY
```

| Uniform | Default | Effect |
|---------|---------|--------|
| `_FurColor` | `[1.0, 0.52, 0.26, 1.0]` | Base fur color (warm orange) |
| `_ShellCount` | `48` | Number of shell layers. **Must match `InstanceCount` in Pass JSON.** |
| `_ShellLength` | `0.28` | Maximum strand length in object-space units |
| `_FurDensity` | `28` | Noise grid density — higher = more strands |
| `_RimPower` | `2.8` | Rim light exponent (Fresnel-like edge glow) |

## AUSL — complete inline block

Since the fur vertex shader **must displace vertices** (the starter only transforms them), and the fragment shader **uses `discard` with procedural noise** (the starter samples a texture), the entire shader is replaced. Copy this into `---BEGIN a1 ... ---END a1`:

```glsl
#version 300 es
#pragma only_renderers glsl30 metal
#pragma multi_compile AE_AMAZING_USE_BONES

#pragma input attributes
    in mediump vec3 attPosition;
    in mediump vec3 attNormal;
    #ifdef AE_AMAZING_USE_BONES
        in mediump vec4 attBoneIds;
        in highp vec4 attWeights;
    #endif
#pragma end

#pragma varying varyings
    mediump vec3 v_posWS;
    mediump vec3 v_nDirWS;
    mediump vec3 v_positionOS;
    mediump float v_shellT;
#pragma end

#pragma output targets
    out mediump vec4 o_fragColor;
#pragma end

#pragma global globalBlock
    float hash21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    const vec3 furLightDir = normalize(vec3(0.5, 0.9, 0.6));
    const vec3 furLightColor = vec3(1.0, 0.97, 0.92);
    const vec3 furAmbient = vec3(0.28, 0.30, 0.34);
    const vec3 furRimColor = vec3(1.0, 0.85, 0.72);
#pragma end

#pragma vs attributes varyings globalBlock
    precision highp float;
    #ifdef AE_AMAZING_USE_BONES
        const int MAX_BONES = 100;
        struct BoneMatrix {
            highp mat4 u_Bone[MAX_BONES];
        };
        layout(std140) uniform highp u_PalatteBuffer {
            BoneMatrix boneMatrix;
        };
    #endif
    uniform highp mat4 u_Model;
    uniform highp mat4 u_MVP;
    uniform highp mat4 u_TransposeInvModel;
    #include "Packages/3D/Utilities/VertexTransform.glsl"
    uniform mediump float _ShellLength;
    uniform mediump float _ShellCount;
#pragma end

#pragma fs varyings targets globalBlock
    precision mediump float;
    uniform mediump mat4 u_View;
    uniform lowp vec3 _FurColor;
    uniform mediump float _FurDensity;
    uniform mediump float _RimPower;
#pragma end

void vertex() {
    precision highp float;
    float shellT = float(gl_InstanceID) / max(_ShellCount - 1.0, 1.0);
    vec3 displaced = attPosition + attNormal * shellT * _ShellLength;

#ifdef AE_AMAZING_USE_BONES
    highp mat4 boneTransform = getBoneTransform();
    vec4 bm_pos = get_bm_postiton(boneTransform, displaced);
    v_posWS = get_posWS(bm_pos);
    v_nDirWS = normalize(get_nDirWS(boneTransform, attNormal));
    gl_Position = get_gl_Position(bm_pos);
#else
    v_posWS = get_posWS(displaced);
    v_nDirWS = normalize(get_nDirWS(attNormal));
    gl_Position = get_gl_Position(displaced);
#endif

    v_positionOS = attPosition;
    v_shellT = shellT;
}

void fragment() {
    precision highp float;
    vec3 surfDir = normalize(v_positionOS);
    vec3 noisePos = surfDir * _FurDensity;
    vec3 cellID3 = floor(noisePos);
    vec3 cellUV3 = fract(noisePos);

    float rand = hash21(cellID3.xy + cellID3.z * 31.17);
    vec3 toCenter = cellUV3 - vec3(0.5);
    float dist = length(toCenter.xy);
    float strandRadius = 0.38 + rand * 0.08;
    float inStrand = 1.0 - smoothstep(strandRadius * 0.3, strandRadius, dist);

    float thinning = v_shellT * v_shellT;
    float alive = step(thinning, rand);
    float strandVisible = alive * inStrand;
    if (strandVisible < 0.01) discard;

    // Rim lighting in view space — avoids needing u_WorldSpaceCameraPos
    vec3 viewPos = (u_View * vec4(v_posWS, 1.0)).xyz;
    vec3 V = normalize(-viewPos);
    vec3 N_vs = normalize((u_View * vec4(v_nDirWS, 0.0)).xyz);

    precision mediump float;
    vec3 N = normalize(v_nDirWS);
    vec3 L = furLightDir;

    float ndl = dot(N, L);
    float wrapped = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
    float ao = mix(0.55, 1.0, v_shellT);
    vec3 color = _FurColor * (furAmbient + furLightColor * wrapped) * ao;

    float ndv = clamp(dot(N_vs, V), 0.0, 1.0);
    float rim = pow(1.0 - ndv, _RimPower);
    color += furRimColor * rim * 0.4;

    precision highp float;
    o_fragColor = vec4(color, 1.0);
}
```

## How it works

### Vertex shader — shell extrusion

```glsl
float shellT = float(gl_InstanceID) / max(_ShellCount - 1.0, 1.0);
vec3 displaced = attPosition + attNormal * shellT * _ShellLength;
```

Each instance's `gl_InstanceID` maps to a normalized shell index `[0, 1]`. The vertex is extruded along its normal by `shellT * _ShellLength`. Instance 0 has zero displacement (stays on the surface); instance 47 is fully extruded.

> **Vertex displacement must happen BEFORE `get_gl_Position()` / `get_posWS()`**. The `VertexTransform.glsl` helpers expect the already-displaced position.

### Fragment shader — procedural strands

1. **3D noise grid**: Object-space surface direction × `_FurDensity` creates a stable noise coordinate. `floor()` gives a cell ID; `fract()` gives position within the cell.
2. **Strand cross-section**: Each cell is a cylinder. `hash21(cellID)` gives per-strand randomness. Distance from cell center determines if the fragment is inside the strand.
3. **Shell thinning**: `step(v_shellT², rand)` only shows strands whose random value exceeds the squared shell index. Inner shells (low `v_shellT`) show few strands → dense near surface. Outer shells show many strands → wispy tips.
4. **`discard`**: Fragments not inside any strand are discarded. This replaces alpha blending — depth is still written.

### Lighting

- **Wrapped diffuse**: `(ndl + 0.5) / 1.5` lets light wrap around fur strands (even back-facing normals get some light).
- **Simulated AO**: `mix(0.55, 1.0, v_shellT)` darkens inner shells near the skin.
- **Rim light**: Fresnel-style `pow(1 - N·V, _RimPower)` adds a glow at silhouette edges, computed in **view space** using `u_View` to avoid needing the undeclared `u_WorldSpaceCameraPos` uniform.

## Verification

- `materialAsset.create` returns with no `compile_error`.
- Object renders with visible fur strands from all angles.
- Start with `_ShellLength = 0.1` → short fuzz visible on the surface.
- Increase to `_ShellLength = 0.5` → long visible strands extruding outward.
- Decrease `_FurDensity` to `10` → fewer, thicker strands.
- Increase `_ShellCount` to `80` (and update `InstanceCount`) → smoother strand density gradient, but more GPU load.
- If no fur is visible, check that `InstanceCount` is set and `_ShellCount` matches.
