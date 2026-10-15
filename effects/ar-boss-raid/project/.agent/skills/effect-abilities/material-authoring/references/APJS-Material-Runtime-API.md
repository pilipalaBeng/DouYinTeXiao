# APJS Material Runtime API

Use this reference when a material effect needs runtime control from script:
color pulse, UV scroll, dissolve progress, texture swap, hand-driven uniforms,
or per-renderer overrides.

This reference is for DYEH Agent generated scripts. Prefer the stable APIs below.
Do not infer extra APJS APIs from TypeScript declarations unless the project
already uses them successfully in `GameManager.ts`.

`renderer.mainMaterial` and `renderer.materials` are shared material references.
Mutating a shared material can affect every renderer using the same material.

## Runtime uniform setters on APJS.Material

Uniform names must match the OMTL/AUSL declaration exactly. Setting a name that
the shader does not declare is allowed by APJS but has no visible effect.

| Shader uniform | APJS setter |
|----------------|-------------|
| `float _Amount;` | `mat.setFloat('_Amount', value)` |
| `int _Mode;` | `mat.setInt('_Mode', value)` |
| `vec2 _Offset;` | `mat.setVector('_Offset', new APJS.Vector2f(x, y))` |
| `vec3 _Direction;` | `mat.setVector('_Direction', new APJS.Vector3f(x, y, z))` |
| `vec4 _Params;` | `mat.setVector('_Params', new APJS.Vector4f(x, y, z, w))` |
| `vec4 _TintColor;` | `mat.setColor('_TintColor', new APJS.Color(r, g, b, a))` |
| `sampler2D _MainTex;` | `mat.setTexture('_MainTex', texture)` |
| `mat4 _Matrix;` | `mat.setMatrix('_Matrix', matrix)` |

Available readbacks include `getFloat`, `getInt`, `getVector`, `getColor`,
`getTexture`, and `getMatrix`.

```ts
private t = 0;
private mat: APJS.Material | null = null;

onUpdate(dt: number) {
    if (!this.mat) return;
    this.t += dt;
    this.mat.setFloat('_DissolveAmount', Math.min(1, this.t));
    this.mat.setColor('_EdgeColor', new APJS.Color(0.2, 0.8, 1.0, 1.0));
}
```

### Coordinate convention: coordinates in `Vision` to material UV

Material UV coordinates use a bottom-left origin: `uv = (0, 0)` is the
lower-left corner. Coordinates in `Vision` are normalized screen
coordinates with a top-left origin, so convert `y` with `1.0 - y` before
passing coordinates into a material uniform.

For example, drive a shader uniform named `_IndexTipUv` from the first detected
hand's index fingertip:

```ts
import { install, Vision } from './Vision';

public vision!: Vision;
public postProcessMaterial!: APJS.Material;

create() {
    install(this);
}

onUpdate() {
    const hands = this.vision.getHands();
    const hand = hands[0];
    if (!hand || !this.postProcessMaterial) {
        return;
    }
    const tip = hand.keypoints[Vision.Hand.Keypoint.IndexTip];
    if (!tip) {
        return;
    }

    this.postProcessMaterial.setVector(
        '_IndexTipUv',
        new APJS.Vector2f(tip.x, 1.0 - tip.y),
    );
}
```

Use `clone()` when you need a deep material copy in memory. Use `instantiate()`
for the normal per-renderer runtime material path.

## Per-renderer overrides with MaterialPropertyBlock

Use `MaterialPropertyBlock` when many renderers share one material but each draw
needs different values. This does not mutate the source material.

```ts
const block = new APJS.MaterialPropertyBlock();
block.setFloat('_Progress', progress);
block.setColor('_TintColor', new APJS.Color(1, 0.4, 0.2, 1));
renderer.properties = block;
```

`MaterialPropertyBlock` supports `setFloat`, `setFloatArray`, `setVector`,
`setVector2Array`, `setVector3Array`, `setVector4Array`, `setColor` through
`setVector(new APJS.Vector4f(...))`, `setTexture`, `setMatrix`, `clear`, and
`removeProperty`.

## Shader macros and passes

Use macros only when the OMTL/AUSL contains matching `#pragma shader_feature`
or `#pragma multi_compile` branches.

```ts
mat.enableMacro('UseNoise', 1);
mat.disableMacro('UseNoise');
const enabled = mat.isMacroEnabled('UseNoise');
```

Pass enablement is per material:

```ts
mat.setPassEnabled(0, true);
const visible = mat.getPassEnabled(0);
```

Changing macros can trigger shader variant rebuilds. Do not toggle macros every
frame for animation; prefer uniforms such as floats or colors.

## Textures
For OMTL optional textures, keep the whole chain aligned:

- UIPROPERTY `Defs` toggle, for example `UseNoise (启用纹理, Defs) = 1`
- `#pragma shader_feature UseNoise`
- `#ifdef UseNoise` around the sampler declaration
- `#ifdef UseNoise` around the texture sampling code
- script writes the same sampler name, for example `_NoiseTex`

## CommandBuffer material usage

When drawing manually, `CommandBuffer.drawMesh` and `blitWithMaterial` accept a
material and optional `MaterialPropertyBlock`.

```ts
const block = new APJS.MaterialPropertyBlock();
block.setFloat('_Strength', strength);

commandBuffer.drawMesh(mesh, matrix, mat, 0, 0, block);
```

```ts
commandBuffer.blitWithMaterial(srcTexture, dstTexture, mat, 0, false, block);
```

Only use this path when the script environment already has valid textures,
meshes, and command buffers. In Agent `GameManager.ts`, runtime creation of new
RenderTextures is not currently a stable public API; prefer pre-created
RenderTexture assets loaded with `APJS.Resources.load`.

## Checklist before generating runtime material script

- The material asset exists or the skill will create it with `materialAsset.create`.
- The script uniform names exactly match the OMTL UIPROPERTY and AUSL uniform names.
- For texture uniforms, the `Defs` macro chain is complete.
- Use `instantiate()` or `MaterialPropertyBlock` when only one renderer should change.
- Do not toggle macros every frame.
- Do not rely on APJS APIs that are only present in `.d.ts` but absent at runtime.
