# 音频素材来源留痕（提审版权凭证）

> 对应 `audio-spec.md` §5.4「素材留痕」与验收项 16「版权留痕完整」。
> 本特效包 **全部音频为程序化合成**，由本仓库脚本 `tools/make_audio.py` 生成。

## 结论

1. **零外部素材**：未下载、未引用任何第三方音频文件、采样库或 loop 包。
2. **零 AI 生成**：未调用任何 AI 音频生成工具（含平台 `generate_audio`）。
3. **零人声**：不含任何人声采样、TTS 或真人笑声；拟人声一律由方波合成（验收项 15）。

## 生成方式

| 项 | 内容 |
|---|---|
| 生成脚本 | `tools/make_audio.py`（纯 Python 标准库）|
| 合成方法 | 8-bit chiptune：方波（可变占空比）/ 三角波 / 白噪声 + 一阶 IIR 滤波 + A/指数包络 |
| 音高阶梯 | `sfx_hit_light_1..4`、`sfx_hit_heavy_1..3` 由**基准体重采样离线派生**（0/+2/+4/+6 半音），非逐条生成 |
| 采样率 / 声道 | 44100 Hz / 单声道 |
| 编码 | MP3 CBR 64 kbps（libmp3lame / ffmpeg 6.1.1，剥离 ID3） |
| 版权 | 原创波形合成；无旋律素材引用，不构成对任何已知作品的复制 |
| 复现 | `python tools/make_audio.py`（噪声固定 seed，结果确定性可复现）|

## 逐条来源登记

| 文件 | 来源 | 说明 |
|---|---|---|
| `sfx_boss_land.mp3` | 程序化合成 | Boss 落地咚 |
| `sfx_boss_roar.mp3` | 程序化合成 | Boss 暴怒咆哮 |
| `sfx_boss_surrender.mp3` | 程序化合成 | Boss 认输下行三音 |
| `sfx_boss_taunt.mp3` | 程序化合成 | 假死识破提示音 |
| `sfx_result_lose.mp3` | 程序化合成 | 失败结算·溜走滑音 |
| `sfx_result_win.mp3` | 程序化合成 | 胜利结算·上行 jingle |
| `sfx_gun_shoot_1.mp3` | 程序化合成 | 开火音 变体 1 |
| `sfx_gun_shoot_2.mp3` | 程序化合成 | 开火音 变体 2 |
| `sfx_gun_shoot_3.mp3` | 程序化合成 | 开火音 变体 3 |
| `sfx_gun_empty.mp3` | 程序化合成 | 空仓干响 |
| `sfx_gun_reload.mp3` | 程序化合成 | 换弹三咔嗒 |
| `sfx_hit_light_1.mp3` | 程序化合成 | 命中·轻击 档 1 |
| `sfx_hit_light_2.mp3` | 程序化合成 | 命中·轻击 档 2 |
| `sfx_hit_light_3.mp3` | 程序化合成 | 命中·轻击 档 3 |
| `sfx_hit_light_4.mp3` | 程序化合成 | 命中·轻击 档 4（上限） |
| `sfx_hit_heavy_1.mp3` | 程序化合成 | 命中·重击 档 1 |
| `sfx_hit_heavy_2.mp3` | 程序化合成 | 命中·重击 档 2 |
| `sfx_hit_heavy_3.mp3` | 程序化合成 | 命中·重击 档 3（上限） |
| `sfx_hit_shieldbreak.mp3` | 程序化合成 | 破盾碎响 |
| `sfx_boss_shieldup.mp3` | 程序化合成 | 护盾成形「当」 |
| `sfx_ui_crosshair.mp3` | 程序化合成 | 准星就位「嘀」 |
| `sfx_ui_lock.mp3` | 程序化合成 | 锁定「嘀嘀」 |
| `sfx_ui_click.mp3` | 程序化合成 | UI 点击 |
| `sfx_combo_up.mp3` | 程序化合成 | 连击阈值提示 |
| `bgm_p1_normal.mp3` | 程序化合成 | BGM 常态段（A 小调 120BPM / 8 小节 / 无缝循环）|
| `bgm_p2_enrage.mp3` | 程序化合成 | BGM 暴怒段（A 小调 120BPM / 8 小节 / 无缝循环）|

**无空项** —— 每条音频均可追溯到 `tools/make_audio.py` 中对应的生成函数。

—— audio-synth / 音频主管
