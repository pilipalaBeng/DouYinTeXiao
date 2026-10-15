# Preview 工具接口

通过 `previewTool` 顺序执行 Preview 操作命令。命令不支持 alias / `$ref`，任一命令失败后立即停止后续执行。

## 披露时机

仅在 [preview-tool 的触发边界](./SKILL.md#触发边界) 已满足后，于编写或执行 Preview 命令前阅读本文，用于确定 `previewTool` / `consoleLog` 的命令参数、调用示例、执行模式和录制语义。执行预览录制或行为验证前，必须阅读并遵守本文的[执行原则](#执行原则)和[行为验证停止门禁](#行为验证停止门禁)。何时允许或禁止使用 Preview 工具以 `SKILL.md` 为唯一事实源。

## 命令

| Command                      | Params                                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screenshot`                 | `scale?` (default 0.5)                                                                                          | Capture the current preview image without resetting. Returns image inline.                                                                                                                                                                                                                                                                                                                                                                                   |
| `touch`                      | `x, y` (0–1 normalized)                                                                                         | Simulate tap (touchDown + 50ms + touchUp).                                                                                                                                                                                                                                                                                                                                                                                              |
| `touch_down`                 | `x, y`                                                                                                          | Begin touch without releasing.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `touch_up`                   | `x, y`                                                                                                          | Release touch.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `touch_move`                 | `x, y`                                                                                                          | Move touch position while pressed.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `drag`                       | `x1, y1, x2, y2, steps?, durationMs?`                                                                           | Simulate drag gesture.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `wait`                       | `ms` (max 30000)                                                                                                | Pause between interactions.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `reset_preview`              | `vqrRepairRound?`                                                                                               | Reload scene and reset all runtime state. In Visual Quality Review, a reset performed after a repair must pass the one-based repair round. Values greater than `2` are not executed and return `VQR_REPAIR_ROUND_LIMIT_EXCEEDED`; ordinary Preview resets omit this parameter.                                                                                                                                                             |
| `start_preview_record`       | —                                                                                                               | Start simulated Record and trigger RecordStart behavior. Calling it again restarts Record and may reset gameplay state, so it is forbidden within the same acceptance session. **Saves nothing to disk** — see `record_preview_video_mp4` for that.                                                                                                                                                                                                                                                   |
| `stop_preview_record`        | —                                                                                                               | Stop simulated Record.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `switch_gesture_video`       | `handAction` (canonical `Vision.Hand.HandActionType`)                                                           | Select the configured gesture video, pause it near the start, and return its suggested `captureTimesMs` and duration.                                                |
| `record_preview_video_mp4`   | `durationSeconds?` (0 < d ≤ 60), `path?` (`.mp4` and `.mov` allowed)                                            | **Save the live preview to an MP4/MOV file via VESDK** — the same encode path the in-app Record button uses (with audio). Calls `PreviewManager.startRecording` → wait → `endRecording` → `savingRecording`, then polls for the file. Blocks until the file is written. Does NOT fire RecordStart — pair with `start_preview_record` if your effect gates visuals on it. Returns `{path, durationMs, totalElapsedMs, mimeType}`.          |
| `pause_preview`              | —                                                                                                               | Freeze the preview stream — engine stops ticking, scripts stop receiving Update. The current frame stays on screen so `screenshot` returns it deterministically. Touch events queue until `resume_preview`.                                                                                                                                                                                                                             |
| `resume_preview`             | —                                                                                                               | Resume a previously paused preview.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `seek_to_time`               | `timeMs` (>= 0)                                                                                              | Seek the current video preview to an absolute timestamp in milliseconds. If the preview is paused, it resumes after seek so subsequent `wait` advances time.                    |
| `transport_preview_property` | `sceneObjectGuid`, `componentType`, `property`, `value`                                                         | **Preview only:** push a scalar (or engine-serializable) onto a script field in the running preview via dual-instance (`PreviewSyncer.transportAProperty`). `sceneObjectGuid` is the **SceneObject** editor GUID; `componentType` is the script **class name** (e.g. `DualInstanceCubeProbe`). Does **not** save the project — use `sceneOps` to persist component edits. Requires dual instance ready.                              |

## 当前画面截图

当用户只要求“截取预览图片”“截一张当前预览图”“只截当前画面”或同等含义时：

- 只执行一次 `previewTool`；
- `commands` 中只包含一个 `screenshot`；
- 不重置、不录制、不暂停、不交互；
- 不自动执行视觉质量审查。

```json
{
  "actions": [
    {
      "tool_name": "previewTool",
      "payload": {
        "intention": "仅截取当前预览画面，不重置、录制、暂停或交互",
        "commands": [
          {"commandType": "screenshot", "params": {"scale": 0.5}}
        ]
      }
    }
  ]
}
```

## 执行原则

1. 执行点击开拍验证时，必须先在独立批次执行 `pause_preview` → `screenshot`，等待截图返回并读取交互坐标，再在下一批命令中执行 `resume_preview` → 点击或拖动。禁止根据设计稿或场景配置猜测 Preview 坐标，也禁止在同一批命令中先截图、再使用尚未返回的截图推断坐标并操作。
2. 只有下一步操作依赖当前可见状态、交互坐标或逐步状态变化时，才使用“暂停-检查-操作”循环；已从本次开拍会话截图确认交互位置且只需确认一次确定性后状态时，使用单次触发并截图。
3. 拖动、长按、连击等连续手势必须放在同一批命令中，不能跨批拆分。
4. 使用 `pause_preview` 后必须配对执行 `resume_preview`，任务结束时不得让预览保持冻结。
5. `start_preview_record` / `stop_preview_record` 只模拟录制生命周期，不保存文件。
6. `record_preview_video_mp4` 才会写入视频文件，但不会自动触发 `RecordStart`。
7. 命令按顺序执行并在失败时停止；不要假设失败后的命令已经生效。
8. Visual Quality Review 修复后的 `reset_preview` 必须传 `vqrRepairRound: 1` 或 `2`。不得省略、复用旧轮次或传入大于 `2` 的值来继续复验；超过上限时工具会跳过命令并向模型返回终止警告。

## 行为验证停止门禁

1. 调用前先定义当前验证所需的最小成功证据，例如“点击后分数从 0 变为 1”或“点击后目标位置发生变化”；不要在看到结果后临时扩大验证范围。
2. 同一个用户验收目标最多建立两次开拍行为验证会话。预算从首次执行 `reset_preview` 或 `start_preview_record` 起持续到本轮任务最终回复；期间的视觉检查、行为验证、日志诊断、故障定位和修改后复验均共享这两次预算，不得通过改名、拆分子目标或把“验证”改称“诊断”重新计算。每次准备调用 `reset_preview` 或 `start_preview_record` 前，必须累计本轮任务已经开始的全部会话；已开始两次时禁止再次调用。每次会话开头执行一次 `reset_preview` 并等待重载，再执行一次 `start_preview_record`；此后直到 `stop_preview_record` 前禁止再次执行 `reset_preview` 或 `start_preview_record`。`compileProject` 只验证编译，不会证明 Preview 已加载最新代码。
3. 一次预期状态变化已被截图或日志可靠证明后，当前行为验证立即完成。不得仅为了“更稳妥”“再确认一次”或继续观察同一结果而重复截图、交互、重置或开拍。
4. 截图中的文字、数字或细节无法可靠辨认时，最多补充一次 `consoleLog`。如果日志已证明预期状态，不再重复截图；不得把截图 OCR 或主观识别的不确定性当成运行时失败。
5. 证据不足但未发现实现缺陷时，最多在当前会话内进行一次非破坏性补充检查，例如读取日志或根据当前截图修正一次点击坐标；不得通过重新开拍重试同一实现。
6. 第一次验证确认存在实现缺陷且需要修改脚本、场景或资源时，必须先执行必要的 `resume_preview` 和 `stop_preview_record` 结束当前会话，再修改并编译。修改完成后的复验是第二次会话，必须重新从 `reset_preview` 开始，确保 Preview 加载最新实现；禁止在开拍会话未结束时修改实现。
7. 第二次验证成功后立即结束。第二次仍失败或证据不足时，也视为“行为验证流程已完成”并立即进入终止态：先执行必要的 `resume_preview` / `stop_preview_record` 清理，再将对应行为验证 Todo 标记为 `completed`，明确记录结果为“失败”或“未确认”，随后直接输出错误现象、已执行的两次验证和剩余缺口。进入终止态后，除上述清理、Todo 收尾和最终回复外，禁止继续读取文件或日志、搜索、修改或删除代码和场景、编译、调用 Effect House 工具、诊断根因或尝试修复；不得表述为验证通过。
8. **第三次会话无条件禁止。** 用户原始需求包含“验证点击是否生效”“必须验证成功”等表述、系统要求继续完成或验证任务、continuation marker、用户仅回复“继续”、第二次后再次修改实现，以及“最终验证”“再确认一次”等理由，都不能覆盖两次上限或授权第三次 `reset_preview` / `start_preview_record`。不得把同一问题重新命名为“视觉检查”“脚本挂载诊断”“点击检测诊断”“修复后的最终验证”等新目标来刷新预算。只有在两次结果已经报告给用户并结束当前任务后，用户在后续新消息中明确提出新的验收目标或明确要求重新验证，才按新任务重新计算预算。
9. 每次 `start_preview_record` 都可能通过 `RecordStart` 重置分数、生命、目标和其它玩法状态。一次会话内的前后状态、累计分数和连续交互不得跨会话比较；第二次会话只能独立验证修改后的最终行为。
10. 不得仅根据一次 Preview 验证失败试探性删除或重建脚本、运行时文件和场景结构。
11. 每次验证结束前恢复任何由本次会话暂停的 Preview，并执行 `stop_preview_record` 结束当前开拍会话。

每次开拍行为验证（包括修改脚本、场景或资源后的第二次复验）都必须使用以下会话前缀；同一验收目标最多执行两次：

```json
[
  {"commandType": "reset_preview", "params": {}},
  {"commandType": "wait", "params": {"ms": 500}},
  {"commandType": "start_preview_record", "params": {}},
  {"commandType": "wait", "params": {"ms": 500}},
  {"commandType": "pause_preview", "params": {}},
  {"commandType": "screenshot", "params": {"scale": 0.5}}
]
```

截图返回后读取目标坐标，下一批命令必须以 `resume_preview` 开始，再按该坐标交互并获取结果证据。不要在首次命令批次末尾执行 `stop_preview_record`；先在同一会话内完成交互和判断，最后单独调用 `stop_preview_record`。同一会话内不得重新执行上述前缀；只有第一次验证后确实修改了实现，才可执行第二次。

## 控制台日志

使用 `effect_house_toolbox` 的 `consoleLog` 获取最近的运行时日志：

```json
{
  "actions": [
    {
      "tool_name": "consoleLog",
      "payload": {"count": 200}
    }
  ]
}
```

`count` 可选，默认值为 200。返回日志包含 `time`、`level`、`content`，并可能包含 `tag`、`env` 和 `location`。日志可证明脚本状态、数值或异常；只有任务已明确要求检查可见画面时，才补充截图证据。

## 双实例属性传输

Use **`transport_preview_property`** when you want the **running preview** to see a new serialized field value **without** persisting (iterate with `screenshot` / `consoleLog`).

**Scalar property push** (uniform scale example — matches `DualInstanceCubeProbe.cubeScale`):

```json
[
  { "commandType": "wait", "params": { "ms": 200 } },
  {
    "commandType": "transport_preview_property",
    "params": {
      "sceneObjectGuid": "<cube-scene-object-guid>",
      "componentType": "DualInstanceCubeProbe",
      "property": "cubeScale",
      "value": 2.5
    }
  },
  { "commandType": "wait", "params": { "ms": 100 } },
  { "commandType": "screenshot" }
]
```

## 选择交互模式

Use the **pause-inspect-act loop** when the next action depends on the currently visible state or coordinates, or when one recording session must preserve and compare multiple sequential states. Coordinate-based actions must use coordinates obtained from a paused screenshot in the same recording session. After that inspection, use a single-batch chain when one interaction and its immediate post-state are sufficient, or when a continuous gesture cannot be paused mid-way. Apply the behavior-verification stop gate after every expected transition.

| Style                                                                           | Use when                                                                                                                                                                                                                | Verification surface                                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Pause-inspect-act loop** (multi-batch, pause between every interaction)       | The next target/coordinate depends on the current frame • Multiple score/life/screen states must be compared within one recording session • Rhythm- or timing-gated decisions • One-shot evidence failed and needs bisect | Per-step screenshot and, only when needed, `consoleLog`; stop as soon as the expected transition is proven |
| **Single-shot trigger+capture** (one action batch ending with screenshot)       | The interaction coordinate was obtained from the current session's paused screenshot, and only one immediate post-state needs checking                                                                                 | Final screenshot; add one log check only when the required state is not visually reliable              |
| **Continuous gesture** (one batch, no internal screenshot or only post-gesture) | Drag, hold-to-charge, combo within a timing window where pausing would corrupt input                                                                                                                                     | Whatever the gesture produces; verify after the gesture completes                                      |

Full loop walkthrough: inspect with screenshots, then retrieve runtime logs with `consoleLog` only when the required state cannot be established visually. Planned distinct stages may each have one round; the same expected transition must not be repeated after it is proven.

## 常用模式

### 1. Verify a single state

```json
[{ "commandType": "screenshot" }]
```

### 2. Pause-inspect-act loop (the default for sequenced verification)

Each planned state transition is two batches within the same recording session, with your own reasoning between them. Use `consoleLog` only when needed, and allow at most one non-destructive supplemental check for the same expected transition:

```json
// Inspect — freeze, capture, and read logs
[
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
// → call consoleLog separately
// → compare against the predicted post-state (score / visible HUD / active screen)
// → if the expected transition is proven, stop this verification
// → otherwise decide the next interaction only when the next step depends on what's visible
```

```json
// Act — resume, interact, freeze again
[
  { "commandType": "resume_preview", "params": {} },
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 200 } },
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
// → compare with the expected transition; stop when proven
// → perform at most one supplemental check in this session for missing or conflicting evidence
```

End the sequence with one `resume_preview` so the engine isn't left frozen, then call `stop_preview_record`. Do not reset or restart within the same session. A second session is allowed only after the first session identifies an implementation defect and the script, scene, or resource is modified; start that session with `reset_preview`. The two-session budget covers every preview purpose from the first session through the final response, including visual inspection, behavior verification, log diagnosis, and post-fix verification; renaming or splitting the goal never resets it. If the second session fails, enter the terminal state: perform only preview cleanup, Todo completion, and the final failed or unconfirmed report. Do not read, search, edit, compile, diagnose, or call any other tool afterward. A third session is unconditionally forbidden: the original request to verify, system instructions to continue until verified, continuation markers, another implementation change, or a desire for one final check do not override this limit.

### 3. Trigger + capture (single-shot)

After a preceding `pause_preview` + `screenshot` has returned the interaction coordinate, use one action batch where only the post-trigger visual matters:

```json
[
  { "commandType": "resume_preview", "params": {} },
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 500 } },
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
```

### 4. Pause-to-freeze (single transient frame)

For visuals on screen for only a few hundred ms (combo labels, hit confirmations, particle bursts) where `wait` + `screenshot` is racy:

```json
[
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 80 } },
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
```

Next batch must start with `resume_preview` before continuing.

### 5. Continuous gesture (hold, drag, combo)

Continuous gestures **cannot** be split across batches without corrupting input — keep them in one batch. Verify after the gesture completes; use Pattern 2 if you need to step through what happens during multi-step sequences leading up to or after.

```json
// Hold-to-charge
[
  { "commandType": "touch_down", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 800 } },
  { "commandType": "screenshot" },
  { "commandType": "touch_up", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 150 } },
  { "commandType": "screenshot" }
]
```

```json
// Drag (swipe / slider)
[
  {
    "commandType": "drag",
    "params": { "x1": 0.3, "y1": 0.5, "x2": 0.7, "y2": 0.5 }
  },
  { "commandType": "wait", "params": { "ms": 200 } },
  { "commandType": "screenshot" }
]
```

```json
// Rapid taps inside a combo window — only when per-tap verification is NOT needed
// (e.g. "5 fast taps shouldn't crash"). For "score should advance by 1 per tap", use Pattern 2 instead.
[
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 300 } },
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 300 } },
  { "commandType": "touch", "params": { "x": 0.5, "y": 0.5 } },
  { "commandType": "wait", "params": { "ms": 300 } },
  { "commandType": "screenshot" }
]
```

### 6. Capture gesture evidence

Gesture capture uses two `previewTool` calls because command results cannot be referenced by later commands in the same call.

First, select the configured gesture video. The command pauses the video near its start and returns the suggested absolute `captureTimesMs` and `durationMs`.

```json
[
  {
    "commandType": "switch_gesture_video",
    "params": {
      "handAction": "ThumbUp"
    }
  }
]
```

Then seek to the start, wait to the suggested absolute time, pause, and capture:

```json
[
  { "commandType": "seek_to_time", "params": { "timeMs": 0 } },
  { "commandType": "wait", "params": { "ms": 1067 } },
  { "commandType": "pause_preview" },
  { "commandType": "screenshot" },
  { "commandType": "resume_preview" }
]
```

`captureTimesMs` values are absolute offsets from the video start. For multiple times, use delta waits after the first capture. For `[600, 1200]`, wait `600ms`, capture and resume, then wait another `600ms`.

Do not combine this with manual `touch` / `drag` gestures to simulate the same hand action. Use the canonical `Vision.Hand.HandActionType` value configured for the effect.

### 7. Simulated Record lifecycle

```json
[
  { "commandType": "start_preview_record", "params": {} },
  { "commandType": "wait", "params": { "ms": 300 } },
  { "commandType": "stop_preview_record", "params": {} }
]
```

Calling `start_preview_record` again restarts the effect's RecordStart flow and may reset gameplay state. Never do this inside an active session. For the same task, a second call is allowed only in a new session after an implementation change, and must be preceded by `reset_preview`. Before every `reset_preview` or `start_preview_record`, count all sessions started since the first verification session, regardless of whether they were described as inspection, verification, diagnosis, or retesting; if the count is two, do not call either command.

### 8. Record the preview to an MP4

> **`record_preview_video_mp4` vs `start_preview_record` — different jobs.**
>
> - `start_preview_record` / `stop_preview_record` **simulate** the user tapping TikTok's Record button. They fire `RecordStart` / `RecordEnd` to scripts and toggle the on-screen recording UI. **They do not save any file.**
> - `record_preview_video_mp4` **captures pixels** from the live preview and writes an MP4. It does not change recording-simulation state and does not fire `RecordStart`.
>
> If your effect gates visuals on `RecordStart`, use both together:
>
> ```json
> [
>   { "commandType": "start_preview_record", "params": {} },
>   { "commandType": "wait", "params": { "ms": 200 } },
>   {
>     "commandType": "record_preview_video_mp4",
>     "params": { "durationSeconds": 5 }
>   },
>   { "commandType": "stop_preview_record", "params": {} }
> ]
> ```
>
> Otherwise call `record_preview_video_mp4` alone — it does not depend on the simulated-record state.

**Record a 5-second MP4 of the live preview**:

```json
[
  { "commandType": "wait", "params": { "ms": 300 } },
  {
    "commandType": "record_preview_video_mp4",
    "params": { "durationSeconds": 5 }
  }
]
```

Returns the saved file path plus `durationMs` / `totalElapsedMs`. The command blocks for `durationSeconds` plus VESDK encode + file-flush time (typically a few hundred ms for short clips). Encoding settings (codec, fps, quality, audio) match the in-app Record button — they are not configurable from the DSL. Requires `dual instance` to be ready and the preview to be VE-synced.

### 9. Random-position targets

When spawn positions are non-deterministic, **pause to read where they landed**, then plan the tap from the visible state — don't blind-guess coordinates.

```json
// Inspect spawn
[
  { "commandType": "wait", "params": { "ms": 1500 } },
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
// → read the screenshot to locate the spawned target's screen position
// → convert to normalized [0,1] coordinates for the next touch
```

```json
// Act on the visible position
[
  { "commandType": "resume_preview", "params": {} },
  { "commandType": "touch", "params": { "x": <target.x>, "y": <target.y> } },
  { "commandType": "wait", "params": { "ms": 200 } },
  { "commandType": "pause_preview", "params": {} },
  { "commandType": "screenshot" }
]
// → confirm the target reacted (score increment, target consumed, etc.)
```

For verifying _that the random behavior is actually random_ (range, variance), run with `reset_preview` × 3 and compare via `consoleLog`.

If a spawn location is genuinely unreadable from the screenshot (not visible in the captured frame, hidden by another sprite, color-on-color), fall back to `consoleLog` traces; have the script `console.log` the spawn coordinates so the agent can read them deterministically.
