#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《AR 像素 Boss 战》音频程序化合成脚本  (audio-synth / 音频主管)
================================================================
纯 Python 标准库合成 8-bit / chiptune 音效与 BGM。
  * 不使用任何外部采样素材
  * 不调用任何 AI 音频生成工具
  * 不下载任何东西
只依赖：wave / array / math / random / subprocess（全部标准库）
MP3 转换依赖系统内已有的 ffmpeg（本机 = 像塑自带 6.1.1，含 libmp3lame）。

依据：effects/ar-boss-raid/audio-spec.md（雷鸣远 v1.4）
产物：
  assets/audio/sfx/*.mp3      24 条音效（ffmpeg 缺失时退化为 .wav）
  assets/audio/bgm/*.mp3       2 段 BGM 无缝循环
  assets/audio/audio.json      清单（id/name/file/durationMs/bytes/波形/用途…）
  assets/SOURCES.md            来源留痕（提审版权凭证；本包零外部素材、零人声）

幂等：重复运行直接覆盖产物，结果确定性可复现（噪声使用固定 seed）。

用法：
  python make_audio.py              # 合成 → WAV → MP3
  python make_audio.py --keep-wav   # 额外在输出目录保留中间 WAV
  python make_audio.py --no-mp3     # 只出 WAV（用于无 ffmpeg 的环境）
  python make_audio.py --check      # 幂等自检：重跑到临时目录，逐条比对字节，不覆盖交付物
  python make_audio.py --sr 22050   # 换采样率重出（默认 44100）
"""

import array
import json
import math
import os
import random
import shutil
import subprocess
import sys
import tempfile
import wave

# ----------------------------------------------------------------------------
# 0. 全局参数
# ----------------------------------------------------------------------------
SR = 44100                 # 采样率 = audio-spec §1.3「首选 44.1 kHz」
# ★ 为什么不用 team-lead 建议的 22050Hz —— 实测（ffmpeg 6.1.1 / libmp3lame）：
#   MP3 编码器延迟恒为 1105 samples，与采样率无关 → 22.05kHz 下 = 50.1ms，44.1kHz 下 = 25.1ms。
#   即 22050Hz 会白白多花 25ms 端到端延迟（本项目头号风险，audio-spec §7.4），
#   且 MPEG-2 LSF 的每帧开销更大（实测同内容 8776B vs 4410 的 8567B），**两头都亏**。
#   体积由码率决定、与采样率无关（audio-spec §5.2 已写明），故 44.1kHz 零体积代价。
#   → 可用 `python make_audio.py --sr 22050` 一行切回 22050Hz（更「8-bit」的音色取向）。
CHANNELS = 1               # 单声道（平台无 pan/3D 空间化 API，立体声纯浪费包体）
BITRATE = "64k"            # SFX 码率（audio-spec §5.1）
BITRATE_BGM = "64k"        # BGM 码率（砍序第 1 条可降 48k，省 -64KB）

HERE = os.path.dirname(os.path.abspath(__file__))
EFFECT = os.path.dirname(HERE)                       # effects/ar-boss-raid
ASSETS = os.path.join(EFFECT, "assets")
AUDIO = os.path.join(ASSETS, "audio")
SFX_DIR = os.path.join(AUDIO, "sfx")
BGM_DIR = os.path.join(AUDIO, "bgm")
MANIFEST = os.path.join(AUDIO, "audio.json")
SOURCES = os.path.join(ASSETS, "SOURCES.md")

FFMPEG_CANDIDATES = [
    r"D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\ffmpeg\x86_64\ffmpeg.exe",
    r"D:\Software\XiangSu\Douyin AR\x64\ffmpeg.exe",
]


# ----------------------------------------------------------------------------
# 1. 采样工具
# ----------------------------------------------------------------------------
def _n(ms):
    """毫秒 → 采样点数"""
    return max(1, int(round(SR * ms / 1000.0)))


def ms_of(n_samples):
    return n_samples * 1000.0 / SR


def mix(layers):
    """多层等长相加（取最长层）"""
    layers = [l for l in layers if l]
    if not layers:
        return []
    n = max(len(l) for l in layers)
    out = [0.0] * n
    for l in layers:
        for i, v in enumerate(l):
            out[i] += v
    return out


def add_into(buf, other, offset=0, gain=1.0):
    """把 other 以 gain 就地叠进 buf，返回 buf（链式友好）"""
    n = len(buf)
    for i, v in enumerate(other):
        j = offset + i
        if 0 <= j < n:
            buf[j] += v * gain
    return buf


def scale(buf, g):
    return [v * g for v in buf]


def rms(buf):
    if not buf:
        return 1e-9
    s = 0.0
    for v in buf:
        s += v * v
    return math.sqrt(s / len(buf)) or 1e-9


def rms_normalize(buf, target=0.25):
    """按 RMS 归一（叠层前把各层拉到同一起跑线），并保证不越 ±1"""
    g = target / rms(buf)
    m = max((abs(v) for v in buf), default=1.0) or 1.0
    if g * m > 2.0:
        g = 2.0 / m
    return scale(buf, g)


def remove_dc(buf):
    """减去直流分量（方波占空比 != 50% 会产生巨大 DC，必须去掉）"""
    if not buf:
        return buf
    m = sum(buf) / len(buf)
    return [v - m for v in buf]


def fade_edges(buf, in_ms=1.5, out_ms=4.0):
    """首尾淡入淡出，杜绝爆音/咔哒"""
    if not buf:
        return buf
    n = len(buf)
    a = min(_n(in_ms), max(1, n // 4))
    b = min(_n(out_ms), max(1, n // 3))
    out = buf[:]
    for i in range(a):
        out[i] *= i / float(a)
    for i in range(b):
        out[n - 1 - i] *= i / float(b)
    return out


def trim_to(buf, dur_ms, fade_in_ms=1.0, fade_out_ms=6.0):
    """
    复合音收尾器：裁/补到 dur_ms，首尾淡入淡出。
    ★ 复合音（多个先后事件拼成）**不用**全局指数包络 —— 否则后段事件会被整体压没；
      每个组件在加入前各自套好自己的包络，这里只做定长与去咔哒。
    """
    n = _n(dur_ms)
    b = (buf + [0.0] * n)[:n]
    return fade_edges(b, fade_in_ms, fade_out_ms)


def normalize_peak(buf, target_dbfs):
    """峰值归一到指定 dBFS（audio-spec §2.3：不统一拉到 0 dBFS，逐条保留 headroom）"""
    if not buf:
        return buf
    m = max((abs(v) for v in buf), default=0.0)
    if m < 1e-9:
        return buf
    return scale(buf, (10.0 ** (target_dbfs / 20.0)) / m)


def soft_limit_UNUSED(buf, ceiling=0.92):
    """
    ⚠️ 已停用（保留仅为记录教训，勿在信号链里调用）。

    它曾作为"防削波安全网"被放在 `emit()` 的峰值归一**之前**，结果 24 条音效里有
    **12 条**被它饱和（原始合成峰值最高到 boss_land 的 **+10.36 dBFS / 3.3×**）。
    tanh 是非线性：多层信号通过它会产生**互调失真**，凭空造出低频分量 ——
    实测 `sfx_result_lose` 的 <60Hz 连续段因此从 0ms 变成 **210ms**（擦过 200ms 判据），
    `boss_surrender` 0→150ms、`boss_roar` 10→160ms。

    正确做法（现行）：**线性峰值归一到目标**（见 `emit()`）—— 无失真、目标即峰值，
    安全网应当是"前置电平设计 + 线性缩放"，而不是事后非线性压缩。
    """
    m = max((abs(v) for v in buf), default=0.0)
    if m <= ceiling:
        return buf
    return [ceiling * math.tanh(v / ceiling) for v in buf]


# ----------------------------------------------------------------------------
# 2. 一阶 IIR 滤波
# ----------------------------------------------------------------------------
def _k(fc):
    fc = max(20.0, min(fc, SR * 0.45))
    return 1.0 - math.exp(-2.0 * math.pi * fc / SR)


def lowpass(buf, fc, order=1):
    out = list(buf)
    k = _k(fc)
    for _ in range(order):
        y = 0.0
        for i, x in enumerate(out):
            y += (x - y) * k
            out[i] = y
    return out


def highpass(buf, fc, order=1):
    out = list(buf)
    k = _k(fc)
    for _ in range(order):
        y = 0.0
        for i, x in enumerate(out):
            y += (x - y) * k
            out[i] = x - y
    return out


def bandpass(buf, lo, hi, order=1):
    return lowpass(highpass(buf, lo, order), hi, order)


# ----------------------------------------------------------------------------
# 3. 振荡器 / 噪声
# ----------------------------------------------------------------------------
def gen_pulse(dur_ms, f0, f1=None, sweep_ms=None, duty=0.5,
              vib_hz=0.0, vib_amt=0.0, trem_hz=0.0, trem_amt=0.0,
              pwm_hz=0.0, pwm_amt=0.0, phase=0.0):
    """
    方波（可变占空比；支持扫频 / 颤音 / 幅度调制 / PWM）。

    ★ 关键：输出为**零均值（AC 耦合）方波** —— 逐样本减掉该占空比的理论直流 `2d-1`。
      占空比 12.5% 的方波原始直流是 -0.75；若只做整体去直流，音符包络的起伏会把
      这个直流变成 2–10 Hz 的次低频能量（实测使 bgm_p1_normal 的 <60Hz 能量占到 47%，
      既违反 audio-spec §6.3「低频闸门」，也让循环点尾部残留 -22.9dB 的嗡嗡声）。
      逐样本零均值后，波形形如 NES 真正的 AC 耦合脉冲输出，根因消除。
    """
    n = _n(dur_ms)
    out = [0.0] * n
    sw = _n(sweep_ms) if sweep_ms else n
    ph = phase
    for i in range(n):
        t = i / float(SR)
        if f1 is None:
            f = f0
        elif i < sw:
            f = f0 + (f1 - f0) * (i / float(sw))
        else:
            f = f1
        if vib_amt:
            f *= 1.0 + vib_amt * math.sin(2.0 * math.pi * vib_hz * t)
        d = duty
        if pwm_amt:
            d = min(0.92, max(0.08, d + pwm_amt * math.sin(2.0 * math.pi * pwm_hz * t)))
        ph += f / SR
        a = 1.0
        if trem_amt:
            a = 1.0 - trem_amt + trem_amt * (0.5 + 0.5 * math.sin(2.0 * math.pi * trem_hz * t))
        raw = 1.0 if (ph - math.floor(ph)) < d else -1.0
        out[i] = (raw - (2.0 * d - 1.0)) * a      # ← 零均值
    return out


def gen_triangle(dur_ms, f0, f1=None, sweep_ms=None):
    n = _n(dur_ms)
    out = [0.0] * n
    sw = _n(sweep_ms) if sweep_ms else n
    ph = 0.0
    for i in range(n):
        if f1 is None:
            f = f0
        elif i < sw:
            f = f0 + (f1 - f0) * (i / float(sw))
        else:
            f = f1
        ph += f / SR
        p = ph - math.floor(ph)
        out[i] = 4.0 * abs(p - 0.5) - 1.0
    return out


def gen_noise(dur_ms, seed=0):
    n = _n(dur_ms)
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


# ----------------------------------------------------------------------------
# 4. 包络
# ----------------------------------------------------------------------------
def env_curve(n, a, tau, fade_out=0):
    """线性起振(a) + 指数衰减(时间常数 tau，单位=采样点)"""
    c = [0.0] * n
    a = max(1, a)
    dec = math.exp(-1.0 / tau) if tau > 0 else 0.0
    v = 0.0
    for i in range(n):
        if i < a:
            c[i] = i / float(a)
        else:
            if i == a:
                v = 1.0
            else:
                v *= dec
            c[i] = v
    if fade_out and fade_out < n:
        for i in range(fade_out):
            c[n - 1 - i] *= i / float(fade_out)
    return c


def apply_env(body, dur_ms, attack_ms, tau_ms, fade_out_ms=3.0):
    """单手势音：裁/补到 dur_ms 后套 A/指数衰减包络"""
    n = _n(dur_ms)
    b = body[:n] + [0.0] * max(0, n - len(body))
    env = env_curve(n, _n(attack_ms), max(1.0, _n(tau_ms)), _n(fade_out_ms))
    return [b[i] * env[i] for i in range(n)]


def apply_env_hold(body, dur_ms, attack_ms, hold_frac=0.6, release_ms=None, fade_out_ms=4.0):
    """
    A(线性起振) + 保持满幅 + R(线性释放到 **严格 0**)。
    用于 BGM 的连奏音型：相比纯指数衰减，它显著提高 RMS（听感更连贯），
    而**音符结束处严格归零** —— 循环点不会留下未衰减的尾巴（指数衰减做不到
    "既连贯又在末尾归零"，除非把 τ 拉长，那必然越界到下一小节）。

    `hold_frac` = 满幅保持占音符时长的比例，是"断奏 ←→ 连奏"的旋钮。
    """
    n = _n(dur_ms)
    b = body[:n] + [0.0] * max(0, n - len(body))
    a = max(1, _n(attack_ms))
    rel = _n(release_ms) if release_ms else max(1, min(_n(45.0), int(n * 0.35)))
    hold_end = max(a + 1, n - rel)
    c = [0.0] * n
    for i in range(n):
        if i < a:
            c[i] = i / float(a)
        elif i < hold_end:
            c[i] = 1.0
        else:
            c[i] = max(0.0, (n - i) / float(n - hold_end))
    if fade_out_ms:
        f = min(_n(fade_out_ms), max(1, n // 4))
        for i in range(f):
            c[n - 1 - i] *= i / float(f)
    return [b[i] * c[i] for i in range(n)]


def pitch_shift(body, ratio):
    """
    离线整体变调（重采样：音高 ×ratio、时长 ÷ratio）
    —— audio-spec §3.2 机制 1 的实现方式：
       只做"基准体"，其余档位由基准体重采样派生 → 各档音色严格一致，仅音高不同；
       重采样后再由 apply_env 套同一包络 → 各档时长与包络形状完全一致。
    """
    if ratio <= 0:
        return list(body)
    L = len(body)
    n_out = max(1, int(L / ratio))
    out = [0.0] * n_out
    for i in range(n_out):
        p = i * ratio
        i0 = int(p)
        if i0 >= L - 1:
            out[i] = body[L - 1]
            continue
        fr = p - i0
        out[i] = body[i0] * (1.0 - fr) + body[i0 + 1] * fr
    return out


# ----------------------------------------------------------------------------
# 5. 音效合成（逐条对齐 audio-spec §2.3）
# ----------------------------------------------------------------------------
SEMI = lambda s: 2.0 ** (s / 12.0)        # 半音 → 倍频比


def sfx_boss_land():
    """三角 sub 110→55Hz 下扫 + **130Hz 体重层** + 方波 220→110Hz + 噪声低通 800Hz。A2 / D600。

    ★ 合规约束（audio-spec §6.3 低频闸门「禁 <60Hz 的持续(>200ms)能量」）：
      55Hz 必须是**瞬时**下扫，不能停在 55Hz 上。故 sub 层单独套一条短包络
      （τ=55ms → 200ms 处已衰减约 26 dB），低频只作「一记闷击」的瞬态。

    ★ 为什么额外加 130Hz 体重层（对 spec §2.3 配方的一处增补，已登记）：
      55Hz 被限成瞬态后，本音在 600ms 里只剩中频与噪声的衰减，峰值/RMS 之比过大
      （实测波峰因数 18.4 dB，RMS 仅 −23.7 dBFS）——「落地咚」会发虚、发飘。
      但补低频不可行：一是**手机外放根本发不出 <100Hz**（本特效的主战场，§4.2），
      二是任何 >60Hz 的稳态低音仍会被闸门保守地误报。故把体重放在 **130Hz**
      （高于判据 1.1 个倍频程，8 阶低通下衰减 >50 dB，闸门零误报；且手机外放可闻）。
    """
    d, sw = 600.0, 120.0
    sub = apply_env(gen_triangle(d, 110.0, 55.0, sw), d, 2.0, 55.0, fade_out_ms=8.0)
    body = apply_env(gen_triangle(d, 132.0, 124.0, d), d, 6.0, 230.0, fade_out_ms=20.0)
    mid = apply_env(gen_pulse(d, 220.0, 110.0, sw, duty=0.5), d, 2.0, 120.0, fade_out_ms=8.0)
    nz = apply_env(lowpass(gen_noise(d, seed=101), 800.0, 1), d, 2.0, 110.0, fade_out_ms=8.0)
    mixed = mix([rms_normalize(sub, 0.30),
                 rms_normalize(body, 0.26),
                 rms_normalize(mid, 0.22),
                 rms_normalize(nz, 0.15)])
    return trim_to(mixed, d, 1.0, 10.0)


def sfx_boss_roar():
    """卡通化咆哮：方波 + PWM 颤音(8Hz ±5%) + 幅度调制(12Hz)；主体 140→90Hz 下滑，
    尾部 200→260Hz 上扬 =「嗯——哇！」。A5ms（防惊吓）/ D1000。禁用 <60Hz 持续低频与失真。"""
    d = 1000.0
    main_ms, tail_ms = 700.0, 300.0
    main = gen_pulse(main_ms, 140.0, 90.0, main_ms * 0.85, duty=0.5,
                     vib_hz=8.0, vib_amt=0.05, trem_hz=12.0, trem_amt=0.30,
                     pwm_hz=6.0, pwm_amt=0.18)
    tail = gen_pulse(tail_ms, 200.0, 260.0, tail_ms, duty=0.5,
                     vib_hz=9.0, vib_amt=0.06, trem_hz=12.0, trem_amt=0.25,
                     pwm_hz=6.0, pwm_amt=0.18)
    body = main + tail
    L = float(len(body))
    body = [body[i] * (1.0 - 0.25 * (i / L)) for i in range(len(body))]
    # τ=700ms：让"嗯——哇！"的尾部上扬完整可闻（不做成前重后无的闷响）
    return apply_env(body, d, 5.0, 700.0, fade_out_ms=25.0)


def _seq(notes, soft_ms=18.0, duty=0.25, gains=None, tail_ms=0.0):
    """把若干 (freq, dur_ms) 顺序铺成一条旋律，每音自带软起包络"""
    total = int(sum(n[1] for n in notes) + tail_ms)
    buf = [0.0] * _n(total)
    off = 0.0
    for idx, (f, dm) in enumerate(notes):
        g = gains[idx] if gains else 1.0
        seg = apply_env(gen_pulse(dm, f, duty=duty), dm, soft_ms, dm / 2.2, fade_out_ms=8.0)
        add_into(buf, seg, _n(off), g)
        off += dm
    return buf


def sfx_boss_surrender():
    """下行三音（A 小调 A4 440 → F4 349 → D4 294），方波占空比 25%，力度逐音递减。
    A20ms（软起，避免"敲"感）。语气 = 可爱 + 无奈，不悲壮、不嘲讽。"""
    body = _seq([(440.00, 260.0), (349.23, 260.0), (293.66, 280.0)],
                soft_ms=20.0, duty=0.25, gains=[1.0, 0.84, 0.68])
    return trim_to(body, 800.0, 1.0, 25.0)


def sfx_boss_taunt():
    """双音上行 900 → 1300Hz 方波（各 100ms）+ 尾部小铃 2kHz 短衰减。A2 / D600。
    只有「提示音」——不念台词（合规：全包零人声）。"""
    d = 600.0
    buf = [0.0] * _n(d)
    add_into(buf, apply_env(gen_pulse(100.0, 900.0, duty=0.25), 100.0, 2.0, 38.0), 0)
    add_into(buf, apply_env(gen_pulse(100.0, 1300.0, duty=0.25), 100.0, 2.0, 38.0), _n(100.0))
    bell = lowpass(mix([rms_normalize(gen_triangle(320.0, 2000.0), 0.20),
                        rms_normalize(gen_pulse(320.0, 2000.0, duty=0.125), 0.12)]), 5200.0, 1)
    add_into(buf, apply_env(bell, 320.0, 1.0, 80.0), _n(200.0), 0.85)
    return trim_to(buf, d, 1.0, 8.0)


def sfx_result_lose():
    """卡通「溜走」滑音：方波 400→150Hz 快速下滑 + 轻微上挑弹性("boing")
    + 尾部两声短促方波（拟「哈哈」，非人声）。A30ms（软起）。
    ★ 不吓人四条：全频落 150–500Hz 中高音区 / 轻快有弹性 / 无长混响与不谐和簇音 / 无突然静音+爆音。"""
    d = 1200.0
    buf = [0.0] * _n(d)
    add_into(buf, apply_env(gen_pulse(460.0, 400.0, 150.0, 400.0, duty=0.25),
                            460.0, 30.0, 200.0), 0, 1.0)
    add_into(buf, apply_env(gen_pulse(460.0, 300.0, 170.0, 420.0, duty=0.125,
                                      vib_hz=6.0, vib_amt=0.09),
                            460.0, 30.0, 200.0), 0, 0.45)
    add_into(buf, apply_env(gen_pulse(120.0, 190.0, duty=0.25), 120.0, 3.0, 45.0), _n(660.0), 0.80)
    add_into(buf, apply_env(gen_pulse(120.0, 165.0, duty=0.25), 120.0, 3.0, 45.0), _n(870.0), 0.65)
    return trim_to(buf, d, 2.0, 30.0)


def sfx_result_win():
    """上行大调（C 大调，与 Boss 的 A 小调形成「解决」感）6 音方波旋律，每音 150ms，
    末音颤音收尾；第 1 拍叠「彩带叮铃」颗粒层（5 个 2.2–4kHz 短颗粒，随机错开）。
    ★ 「叮铃」并入本资产，不新增文件（audio-spec §2.3(c) 定案）。
    ★ 禁用下行「wah-wah-waaah」嘲笑式；禁用真人欢呼/掌声采样。"""
    d = 2000.0
    buf = [0.0] * _n(d)
    for i, f in enumerate([523.25, 587.33, 659.25, 784.00, 880.00, 1046.50]):   # C5 D5 E5 G5 A5 C6
        g = [1.0, 0.95, 0.91, 0.88, 0.85, 0.82][i]
        add_into(buf, apply_env(gen_pulse(150.0, f, duty=0.5), 150.0, 5.0, 60.0), _n(i * 150.0), g)
    # 末音 C6 颤音收尾：900 → 1500ms
    tail = apply_env(gen_pulse(600.0, 1046.50, vib_hz=5.5, vib_amt=0.012, duty=0.5),
                     600.0, 12.0, 320.0, fade_out_ms=120.0)
    add_into(buf, tail, _n(900.0), 0.80)
    # 彩带「叮铃」颗粒层（第 1 拍）
    rng = random.Random(2024)
    for k in range(5):
        f = rng.choice([2200.0, 2640.0, 3200.0, 3960.0])
        off = rng.uniform(0.0, 60.0) + k * 20.0     # 随机错开 20–60ms
        g = apply_env(mix([rms_normalize(gen_triangle(60.0, f), 0.20),
                           rms_normalize(gen_pulse(60.0, f, duty=0.125), 0.12)]),
                      60.0, 1.0, 18.0)
        add_into(buf, g, _n(off), 0.55)
    return trim_to(buf, d, 1.0, 40.0)


def sfx_gun_shoot(variant=1):
    """卡通激光「pew」：噪声脉冲（高通 2kHz）+ 方波短扫 800→400Hz。
    3 变体只微调噪声色与基准音高（±1 半音）。A0.5 / D100。
    ★ 硬约束：时长 ≤ 单发间隔的 1/2（250ms 闸门 → ≤125ms；本音效 100ms 满足），
      否则高射速下开火音会糊成一坨。"""
    d = 100.0
    nz = bandpass(gen_noise(d, seed=700 + variant), 2000.0, 9000.0, order=2)
    base = 800.0 * SEMI([0, 1, -1][variant - 1])
    sw = gen_pulse(d, base, base * 0.5, d * 0.7, duty=0.35 + 0.05 * variant)
    body = mix([rms_normalize(nz, 0.22), rms_normalize(sw, 0.16)])
    return apply_env(body, d, 0.5, d / 3.6, fade_out_ms=3.0)


def sfx_gun_empty():
    """单个高频「咔」（噪声窄带通 1.5–2.2kHz）。A0.3 / D60。干响，无低频。"""
    d = 60.0
    body = mix([rms_normalize(bandpass(gen_noise(d, seed=311), 1500.0, 2200.0, order=2), 0.25),
                rms_normalize(highpass(gen_noise(d, seed=312), 1600.0, 1), 0.10)])
    return apply_env(body, d, 0.3, d / 3.6, fade_out_ms=3.0)


def sfx_gun_reload():
    """3 声机械咔嗒（噪声 + 窄带通 1.5kHz），位于 0 / 300 / 600ms；末声 +3 半音 =「上膛完成」。
    每声 A0.5 / D80。总长 700ms —— 1.0s 读秒剩余 300ms 由「文件已结束」形成听觉留白。"""
    buf = [0.0] * _n(700.0)
    for k, (off, ratio) in enumerate([(0.0, 1.0), (300.0, 1.0), (600.0, SEMI(3))]):
        fc = 1500.0 * ratio
        nz = bandpass(gen_noise(80.0, seed=400 + k), fc * 0.6, fc * 1.8, order=2)
        clk = mix([rms_normalize(nz, 0.25),
                   rms_normalize(highpass(gen_noise(80.0, seed=410 + k), fc * 1.5, 1), 0.08)])
        add_into(buf, apply_env(clk, 80.0, 0.5, 80.0 / 3.6), _n(off), 0.85 if k < 2 else 1.0)
    return trim_to(buf, 700.0, 0.5, 4.0)


def _hit_body_light():
    """轻击基准体：噪声（带通 2–5kHz，70%）叠 方波 600Hz（30%）"""
    body_ms = 140.0 * SEMI(6)                 # 给最高档 (+6 半音) 留足长度
    return mix([rms_normalize(gen_pulse(body_ms, 600.0, duty=0.5), 0.20),
                rms_normalize(bandpass(gen_noise(body_ms, seed=21), 2000.0, 5000.0, 1), 0.30)])


def _hit_body_heavy():
    """重击基准体：方波 300→150Hz 下扫 + 三角 sub 120Hz + 噪声带通 1.5–3kHz"""
    body_ms = 250.0 * SEMI(4)
    return mix([rms_normalize(gen_pulse(body_ms, 300.0, 150.0, 90.0, duty=0.5), 0.26),
                rms_normalize(gen_triangle(body_ms, 120.0), 0.20),
                rms_normalize(bandpass(gen_noise(body_ms, seed=31), 1500.0, 3000.0, 1), 0.16)])


def hit_light(tier):
    """档 1..4 → 0 / +2 / +4 / +6 半音（★ +6 = 1.414× 为硬上限）"""
    body = pitch_shift(_hit_body_light(), SEMI([0, 2, 4, 6][tier - 1]))
    return apply_env(body, 140.0, 0.5, 40.0, fade_out_ms=3.0)      # τ≈40ms（spec 明示）


def hit_heavy(tier):
    """档 1..3 → 0 / +2 / +4 半音（★ +4 = 1.260× 为硬上限）"""
    body = pitch_shift(_hit_body_heavy(), SEMI([0, 2, 4][tier - 1]))
    return apply_env(body, 250.0, 1.0, 250.0 / 3.2, fade_out_ms=4.0)


def sfx_hit_shieldbreak():
    """P0：① 3 个快速噪声脉冲（带通 3–6kHz，各 40ms，间隔 30ms）=「咔啦碎」
    ② 方波上行 400→800Hz（150ms）=「充能」。总 400ms。"""
    buf = [0.0] * _n(400.0)
    for k in range(3):
        nz = bandpass(gen_noise(40.0, seed=500 + k), 3000.0, 6000.0, order=2)
        add_into(buf, apply_env(nz, 40.0, 0.5, 40.0 / 2.6), _n(k * 70.0), 1.0 - 0.12 * k)
    add_into(buf, apply_env(gen_pulse(150.0, 400.0, 800.0, 150.0, duty=0.35),
                            150.0, 1.0, 150.0 / 2.6), _n(170.0), 0.80)
    return trim_to(buf, 400.0, 0.5, 5.0)


def sfx_boss_shieldup():
    """护盾成形「当」：噪声脉冲（带通 1.2–3kHz）+ 三角波 700→350Hz 下扫
    + 高频金属振铃 2.4kHz（衰减 250ms）。A1 / D350。
    双职责：护盾动作音 + 阶段 2→3 听觉提示（对齐 SHIELD_UP f4 / 播放时刻 100ms）。
    合规：用「铃/木琴」式明亮金属，不用「铁砧/枪机」式写实金属。"""
    buf = [0.0] * _n(400.0)
    add_into(buf, apply_env(bandpass(gen_noise(180.0, seed=601), 1200.0, 3000.0, 1),
                            180.0, 1.0, 60.0), 0, 0.85)
    add_into(buf, apply_env(gen_triangle(320.0, 700.0, 350.0, 220.0), 320.0, 1.0, 90.0), 0, 0.95)
    ring = lowpass(mix([rms_normalize(gen_triangle(280.0, 2400.0), 0.20),
                        rms_normalize(gen_pulse(280.0, 2400.0, duty=0.125), 0.12)]), 7000.0, 1)
    add_into(buf, apply_env(ring, 280.0, 1.0, 250.0 / 2.6), _n(20.0), 1.0)
    return trim_to(buf, 400.0, 1.0, 8.0)


def sfx_ui_crosshair():
    """方波 1200Hz 单「嘀」。A1 / D150。刻意用 1200Hz（不用 2–4kHz），温和不刺耳。"""
    return apply_env(gen_pulse(150.0, 1200.0, duty=0.5), 150.0, 1.0, 150.0 / 3.6, 4.0)


def sfx_ui_lock():
    """方波双音上行 1400 → 1800Hz（各 80ms）。A1 / D200。
    ★ 必须与 crosshair 在音程/音色上区分（单嘀 vs 双嘀上行）。"""
    buf = [0.0] * _n(200.0)
    add_into(buf, apply_env(gen_pulse(80.0, 1400.0, duty=0.5), 80.0, 1.0, 80.0 / 2.4), 0)
    add_into(buf, apply_env(gen_pulse(110.0, 1800.0, duty=0.5), 110.0, 1.0, 110.0 / 2.6), _n(80.0))
    return trim_to(buf, 200.0, 1.0, 4.0)


def sfx_ui_click():
    """方波 2000Hz。A0.5 / D50。最轻，不抢任何东西。"""
    return apply_env(gen_pulse(50.0, 2000.0, duty=0.25), 50.0, 0.5, 50.0 / 3.6, 3.0)


def sfx_combo_up():
    """方波 1400Hz 单音 + 短颤音。A2 / D300。只在 combo = 10 / 20 各触发一次。"""
    return apply_env(gen_pulse(300.0, 1400.0, duty=0.5, vib_hz=7.0, vib_amt=0.015),
                     300.0, 2.0, 300.0 / 3.6, 5.0)


# --- SFX 注册表 ------------------------------------------------------------
# (id, 中文名, 生成函数, 目标峰值 dBFS, 波形描述, 用途/触发说明)
SFX_TABLE = [
    ("sfx_boss_land", "Boss 落地咚", sfx_boss_land, -5.0,
     "三角波 sub 110→55Hz 瞬时下扫（τ55ms）+ 130Hz 体重层（τ230ms）+ 方波 220→110Hz + 噪声低通 800Hz",
     "开局 0s，Boss 从画面下方跳入落地帧（SPAWN f5 / 播放时刻 333ms）；"
     "130Hz 层为 §2.3 配方的增补（已登记 spec 偏差）"),
    ("sfx_boss_roar", "Boss 暴怒咆哮", sfx_boss_roar, -8.0,
     "方波 + PWM 颤音 8Hz + 幅度调制 12Hz；140→90Hz 下滑 + 尾部上扬",
     "进入阶段 2（HP 首次 ≤66%）当帧；卡通化咆哮「嗯——哇！」，凶但不恐怖"),
    ("sfx_boss_surrender", "Boss 认输下行三音", sfx_boss_surrender, -9.0,
     "方波（占空比 25%）下行三音 A4→F4→D4，力度递减",
     "HP 归零 → 举手认输演出起手帧；语气可爱+无奈，不悲壮不嘲讽"),
    ("sfx_boss_taunt", "假死识破提示音", sfx_boss_taunt, -11.0,
     "方波双音上行 900→1300Hz + 2kHz 小铃",
     "假死被识破（停火 0.8s 后的反打判定帧）；只发提示音，不念台词"),
    ("sfx_result_lose", "失败结算·溜走滑音", sfx_result_lose, -8.0,
     "方波 400→150Hz 下滑 + 弹性 boing + 两声短促方波",
     "40s 超时未击杀 → Boss 大笑跳走出画；卡通喜剧感，无恐怖元素"),
    ("sfx_result_win", "胜利结算·上行 jingle", sfx_result_win, -6.0,
     "方波上行大调 6 音（C 大调）+ 三角/方波 2.2–4kHz 彩带颗粒层",
     "Boss 认输 → flag_land 牌落地 ≈950ms（played-time）；颗粒层即 animation 要的「叮铃」"),
    ("sfx_gun_shoot_1", "开火音 变体 1", lambda: sfx_gun_shoot(1), -12.0,
     "噪声（高通 2kHz）+ 方波扫频 800→400Hz（100ms ≤ 250ms 闸门的一半=125ms）",
     "按住屏幕开火期间由 250ms 闸门节流，每发触发一条（按下开始 / 抬起停止）"),
    ("sfx_gun_shoot_2", "开火音 变体 2", lambda: sfx_gun_shoot(2), -12.0,
     "同上（基准音高 +1 半音，噪声色变化）",
     "开火池轮转变体 2，规避重复疲劳"),
    ("sfx_gun_shoot_3", "开火音 变体 3", lambda: sfx_gun_shoot(3), -12.0,
     "同上（基准音高 -1 半音，噪声色变化）",
     "开火池轮转变体 3，规避重复疲劳"),
    ("sfx_gun_empty", "空仓干响", sfx_gun_empty, -14.0,
     "噪声窄带通 1.5–2.2kHz",
     "弹匣 = 0 且玩家仍按住开火（去抖 0.25s）；无低频，明确「没子弹了」"),
    ("sfx_gun_reload", "换弹三咔嗒", sfx_gun_reload, -12.0,
     "噪声窄带通 1.5kHz ×3（0/300/600ms，末声 +3 半音）",
     "点击「换弹」按钮帧，对应 1.0s 读秒；末声 = 上膛完成，尾部留白"),
    ("sfx_hit_light_1", "命中·轻击 档 1", lambda: hit_light(1), -9.0,
     "噪声带通 2–5kHz + 方波 600Hz（基准 0 半音）",
     "判定命中且 combo ≤ 9；4 槽轮转音高阶梯 1/4"),
    ("sfx_hit_light_2", "命中·轻击 档 2", lambda: hit_light(2), -9.0,
     "同上（+2 半音，1.122×）",
     "判定命中且 combo ≤ 9；4 槽轮转音高阶梯 2/4"),
    ("sfx_hit_light_3", "命中·轻击 档 3", lambda: hit_light(3), -9.0,
     "同上（+4 半音，1.260×）",
     "判定命中且 combo ≤ 9；4 槽轮转音高阶梯 3/4"),
    ("sfx_hit_light_4", "命中·轻击 档 4（上限）", lambda: hit_light(4), -9.0,
     "同上（+6 半音，1.414×，★硬上限）",
     "判定命中且 combo ≤ 9；4 槽轮转音高阶梯 4/4，不越 1.414× 防啸叫"),
    ("sfx_hit_heavy_1", "命中·重击 档 1", lambda: hit_heavy(1), -8.0,
     "方波 300→150Hz 下扫 + 三角 sub 120Hz + 噪声 1.5–3kHz（基准）",
     "判定命中且 combo ≥ 10；3 槽轮转，打击质感切换点"),
    ("sfx_hit_heavy_2", "命中·重击 档 2", lambda: hit_heavy(2), -8.0,
     "同上（+2 半音，1.122×）",
     "判定命中且 combo ≥ 10；3 槽轮转音高阶梯 2/3"),
    ("sfx_hit_heavy_3", "命中·重击 档 3（上限）", lambda: hit_heavy(3), -8.0,
     "同上（+4 半音，1.260×，★硬上限）",
     "判定命中且 combo ≥ 10；3 槽轮转音高阶梯 3/3"),
    ("sfx_hit_shieldbreak", "破盾碎响", sfx_hit_shieldbreak, -7.0,
     "噪声带通 3–6kHz ×3 脉冲 + 方波上行 400→800Hz",
     "P0 机制：命中护盾核心点且护盾值归零当帧；全包最响 SFX 之一，须 1 秒内被感知"),
    ("sfx_boss_shieldup", "护盾成形「当」", sfx_boss_shieldup, -8.0,
     "噪声带通 1.2–3kHz + 三角波 700→350Hz 下扫 + 2.4kHz 金属振铃",
     "P0：护盾成形帧（SHIELD_UP f4 / 播放时刻 100ms）；兼作阶段 2→3 听觉提示"),
    ("sfx_ui_crosshair", "准星就位「嘀」", sfx_ui_crosshair, -16.0,
     "方波 1200Hz 单音",
     "准星首次就位（进游戏后 1s 内一次）；刻意用 1200Hz，温和不刺耳"),
    ("sfx_ui_lock", "锁定「嘀嘀」", sfx_ui_lock, -14.0,
     "方波双音上行 1400→1800Hz",
     "命中态首次成立（Boss 世界坐标投影落入屏幕正中 0.5±0.17 视口窗且 vp.z>0，"
     "tech-spec §2.7），带 0.4s 去抖；与 crosshair 的音程/音色明确区分"),
    ("sfx_ui_click", "UI 点击", sfx_ui_click, -18.0,
     "方波 2000Hz",
     "结算页 / 出战对象面板任意按钮按下；最轻，不抢任何东西"),
    ("sfx_combo_up", "连击阈值提示", sfx_combo_up, -12.0,
     "方波 1400Hz + 短颤音",
     "combo 恰为 10 或 20 的命中帧（各一次），不是每次连击"),
]

BGM_TABLE = [
    ("bgm_p1_normal", "BGM 常态段", "normal",
     "chiptune 4 声道：方波1 主旋律（12.5% 占空比，八分，**连奏包络 A+保持+释放**）+ 方波2 和声 + 三角波贝斯（四分）+ 噪声鼓",
     "进入 FIGHTING 状态起播，INFINITE 循环；A 小调 120BPM 8 小节 = 16.0s；"
     "与暴怒段等响（RMS 差 0.35dB），同 volume 30 可硬切"),
    ("bgm_p2_enrage", "BGM 暴怒段", "enrage",
     "chiptune 4 声道：方波1 主旋律（50% 占空比，十六分跑动）+ 方波2 十六分琶音 + 三角波八分贝斯 + 十六分军鼓",
     "进入阶段 2 时切换，INFINITE 循环；同调同 BPM 同网格，可任意拍点对齐硬切"),
]


# ----------------------------------------------------------------------------
# 6. BGM 合成（chiptune 4 声道 / A 小调 / 120BPM / 8 小节 / 16.0s 无缝 loop）
# ----------------------------------------------------------------------------
BPM = 120
BEAT_S = 60.0 / BPM                    # 0.5 s
BAR_S = 4 * BEAT_S                     # 2.0 s
SIXTH_MS = BEAT_S / 4.0 * 1000.0       # 125 ms
BARS = 8
SLOTS_PER_BAR = 16
TOTAL_MS = BARS * BAR_S * 1000.0       # 16000 ms

_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
       "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
_PN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_midi(name):
    p, octv = name[:-1], int(name[-1])
    return _PC[p] + (octv + 1) * 12


def midi_name(m):
    return _PN[m % 12] + str(m // 12 - 1)


def m2f(name):
    """音名 → 频率（A4 = 440）"""
    if name is None or name == ".":
        return None
    return 440.0 * (2.0 ** ((note_midi(name) - 69) / 12.0))


def _grid(rows):
    """校验 8 行 × 16 个十六分格"""
    out = [r.split() for r in rows]
    for i, r in enumerate(out):
        assert len(r) == SLOTS_PER_BAR, "bar %d has %d slots" % (i + 1, len(r))
    assert len(out) == BARS
    return out


# ---- 主旋律 ---------------------------------------------------------------
MEL_NORMAL = _grid([
    "A4 .  C5 .  E5 .  C5 .  A4 .  E5 .  C5 .  A4 .",
    "A4 .  .  .  C5 .  .  .  E5 .  .  .  D5 .  C5 .",
    "F4 .  A4 .  C5 .  A4 .  F4 .  C5 .  A4 .  F4 .",
    "F4 .  .  .  A4 .  .  .  C5 .  .  .  B4 .  A4 .",
    "C5 .  E5 .  G5 .  E5 .  C5 .  G5 .  E5 .  C5 .",
    "C5 .  .  .  E5 .  .  .  G5 .  .  .  F5 .  E5 .",
    "G4 .  B4 .  D5 .  B4 .  G4 .  D5 .  B4 .  G4 .",
    "B4 .  D5 .  G5 .  D5 .  B4 .  D5 .  .  .  .  .",
])

MEL_ENRAGE = _grid([
    "A4 A4 C5 A#4 A4 C5 E5 C5 A4 A#4 C5 A4 E5 C5 A4 A#4",
    "C5 C5 E5 D#5 E5 D5 C5 B4 C5 D5 E5 C5 A4 A#4 A4 G4",
    "F4 F4 A4 G#4 A4 C5 F5 C5 A4 C5 F5 A4 C5 A4 F4 G#4",
    "A4 A4 C5 B4 C5 D5 C5 B4 A4 G4 F4 E4 F4 G4 A4 B4",
    "C5 C5 E5 D#5 E5 G5 C6 G5 E5 G5 C6 G5 E5 C5 G4 A4",
    "B4 C5 G5 E5 C5 E5 G5 C6 B5 A5 G5 F5 E5 D5 C5 B4",
    "G4 G4 B4 A#4 B4 D5 G5 D5 B4 D5 G5 B4 D5 B4 G4 A4",
    "B4 D5 F5 D5 B4 G5 F5 D#5 B4 D5 G5 B4 D5 .  .  .",
])

# ---- 和声 / 琶音 ----------------------------------------------------------
HARM_NORMAL = _grid([
    "A4 .  .  .  C5 .  .  .  E5 .  .  .  C5 .  .  .",
    "E5 .  .  .  C5 .  .  .  A4 .  .  .  C5 .  .  .",
    "F4 .  .  .  A4 .  .  .  C5 .  .  .  A4 .  .  .",
    "C5 .  .  .  A4 .  .  .  F4 .  .  .  A4 .  .  .",
    "C5 .  .  .  E5 .  .  .  G5 .  .  .  E5 .  .  .",
    "G5 .  .  .  E5 .  .  .  C5 .  .  .  E5 .  .  .",
    "G4 .  .  .  B4 .  .  .  D5 .  .  .  B4 .  .  .",
    "D5 .  .  .  B4 .  .  .  G4 .  .  .  B4 .  .  .",
])

_H = [
    "A4 C5 E5 A5 E5 C5 A4 C5 A4 C5 E5 A5 E5 C5 A4 C5",
    "F4 A4 C5 F5 C5 A4 F4 A4 F4 A4 C5 F5 C5 A4 F4 A4",
    "C5 E5 G5 C6 G5 E5 C5 E5 C5 E5 G5 C6 G5 E5 C5 E5",
    "G4 B4 D5 G5 D5 B4 G4 B4 G4 B4 D5 G5 D5 B4 G4 B4",
]
HARM_ENRAGE = _grid([_H[0], _H[0], _H[1], _H[1], _H[2], _H[2], _H[3], _H[3]])

# ---- 贝斯 -----------------------------------------------------------------
_ROOTS = ["A2", "A2", "F2", "F2", "C3", "C3", "G2", "G2"]


def _bass_grid(enrage):
    rows = []
    for root in _ROOTS:
        if not enrage:
            rows.append(" ".join([root, ".", ".", ".", root, ".", ".", ".",
                                  root, ".", ".", ".", root, ".", ".", "."]))
        else:
            fifth = midi_name(note_midi(root) + 7)      # 5 度
            rows.append(" ".join([root, ".", root, ".", root, ".", fifth, ".",
                                  root, ".", root, ".", root, ".", fifth, "."]))
    return _grid(rows)


# ---- 鼓 -------------------------------------------------------------------
def _drum_kick():
    d = 95.0
    b = mix([rms_normalize(gen_triangle(d, 115.0, 72.0, 70.0), 0.30),
             rms_normalize(gen_pulse(d, 115.0, 72.0, 70.0, duty=0.5), 0.10)])
    return apply_env(b, d, 0.5, 28.0, fade_out_ms=5.0)


def _drum_snare(seed=1):
    d = 95.0
    b = mix([rms_normalize(bandpass(gen_noise(d, seed=seed), 1400.0, 4200.0, 1), 0.26),
             rms_normalize(gen_triangle(d, 210.0), 0.10)])
    return apply_env(b, d, 0.5, 24.0, fade_out_ms=5.0)


def _drum_hat(seed=2):
    d = 38.0
    return apply_env(highpass(gen_noise(d, seed=seed), 6500.0, order=2), d, 0.3, 11.0, fade_out_ms=4.0)


def _drums(enrage):
    buf = [0.0] * _n(TOTAL_MS)
    k, s, h = _drum_kick(), _drum_snare(), _drum_hat()
    for bar in range(BARS):
        base = bar * BAR_S * 1000.0
        for step in ([0, 8] if not enrage else [0, 6, 8]):
            add_into(buf, k, _n(base + step * SIXTH_MS), 1.0)
        for step in ([4, 12] if not enrage else [4, 12, 14, 15]):
            add_into(buf, s, _n(base + step * SIXTH_MS), 1.0 if step < 14 else 0.70)
        for step in (range(0, 16, 2) if not enrage else range(0, 16)):
            add_into(buf, h, _n(base + step * SIXTH_MS), 0.60 if not enrage else 0.46)
    return buf


# ---- 轨道渲染 --------------------------------------------------------------
def _render_track(grid, wave, duty, gain, max_slots, hold=None):
    """
    音长 = 「到下一个音符的格数」（上限 max_slots）× 125ms。
    → 常态八分/四分（格子里隔位留空自然形成），暴怒十六分（格位全满 → 恒为 1 格）。

    `hold` = None 用指数衰减（断奏，适合暴怒的十六分跑动）；
           = 比例值用 A+保持+释放到零的连奏包络（适合常态的八分旋律）。
    ★ 为什么常态段必须用连奏：实测常态段若用指数衰减，其波峰因数达 **20.3 dB**
      （音乐正常 10–16 dB），RMS 只有 −26.3 dBFS；而暴怒段（十六分密集、50% 占空比）
      为 14.0 dB / −20.0 dBFS。两段峰值都钉在 −6 dBFS ⇒ **切换时 RMS 跳 6.3 dB**，
      阶段 1→2 会「突然变响」——而二者都用组件 volume 30，规范并未规定两段的响度关系。
      改成连奏后常态段 crest 13.8 dB / −19.8 dBFS，与暴怒段差 **0.2 dB**，
      强度差改由规范已定的「密度翻倍 + 占空比 12.5%→50%」承担，不靠音量。
    """
    ev = []
    ev = []
    for bar in range(BARS):
        for step, tok in enumerate(grid[bar]):
            if tok != ".":
                ev.append((bar * SLOTS_PER_BAR + step, tok))
    total_slots = BARS * SLOTS_PER_BAR
    buf = [0.0] * _n(TOTAL_MS)
    for i, (slot, tok) in enumerate(ev):
        nxt = ev[i + 1][0] if i + 1 < len(ev) else total_slots
        slots = max(1, min(nxt - slot, max_slots))
        dur_ms = slots * SIXTH_MS * 0.92            # 留 8% 空隙，杜绝跨格粘连
        f = m2f(tok)
        seg = gen_pulse(dur_ms, f, duty=duty) if wave == "pulse" else gen_triangle(dur_ms, f)
        seg = (apply_env_hold(seg, dur_ms, 8.0, hold) if hold is not None
               else apply_env(seg, dur_ms, 8.0, dur_ms / 3.4, fade_out_ms=5.0))
        add_into(buf, seg, _n(slot * SIXTH_MS), gain)
    return buf


def build_bgm(kind):
    enrage = (kind == "enrage")
    mel = MEL_ENRAGE if enrage else MEL_NORMAL
    harm = HARM_ENRAGE if enrage else HARM_NORMAL

    # 常态段用连奏包络（hold=0.30）与暴怒段等响；暴怒段保持断奏以贴合十六分跑动
    h = None if enrage else 0.30
    t_mel = _render_track(mel, "pulse", 0.50 if enrage else 0.125, 1.00, 4, hold=h)
    t_harm = _render_track(harm, "pulse", 0.50 if enrage else 0.25, 0.34, 3, hold=h)
    t_bass = _render_track(_bass_grid(enrage), "tri", 0.5, 0.60, 4)
    t_drum = _drums(enrage)

    body = mix([t_mel, t_harm, t_bass, t_drum])
    body = remove_dc(body)
    body = lowpass(body, 9000.0, order=1)          # 削掉 >10kHz 噪声毛刺（防刺耳）
    n = _n(TOTAL_MS)
    body = (body + [0.0] * n)[:n]
    # 循环点：首 2ms 淡入 / 尾 6ms 淡出（尾音早已衰减，此处仅消除残余造成的小咔哒）
    body = fade_edges(body, 2.0, 6.0)
    return normalize_peak(body, -6.0)   # 线性峰值归一 = BGM 资产峰值 -6 dBFS（§4.2）


# ----------------------------------------------------------------------------
# 7. 写文件
# ----------------------------------------------------------------------------
def write_wav(path, samples):
    ints = array.array("h")
    for s in samples:
        v = int(round(s * 32767.0))
        ints.append(32767 if v > 32767 else (-32768 if v < -32768 else v))
    with wave.open(path, "wb") as w:
        w.setnchannels(CHANNELS)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(ints.tobytes())


def find_ffmpeg():
    for p in FFMPEG_CANDIDATES:
        if os.path.isfile(p):
            return p
    return shutil.which("ffmpeg")


def to_mp3(ffmpeg, wav_path, mp3_path, bitrate):
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
           "-i", wav_path, "-ac", str(CHANNELS), "-ar", str(SR),
           "-c:a", "libmp3lame", "-b:a", bitrate,
           "-map_metadata", "-1", "-id3v2_version", "0",
           "-write_xing", "1", mp3_path]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg failed:\n" + r.stderr.decode("utf-8", "replace"))


def probe_levels(ffmpeg, path):
    """
    一次 volumedetect 同时取「文件被解码后」的 **峰值** 与 **RMS**（dBFS，负值）。
    volumedetect 的 `max_volume` = 峰值、`mean_volume` = RMS 电平，一次调用两个都给，
    所以补 RMS 字段**不增加任何 ffmpeg 调用开销**。
    ★ 两个值都落在「解码域」 —— 与 `measuredPeakDbfs` 同域，qa-lead 可按同一口径独立复算。
    """
    r = subprocess.run([ffmpeg, "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True)
    peak = rms_db = None
    for line in r.stderr.decode("utf-8", "replace").splitlines():
        if "max_volume:" in line:
            peak = float(line.split("max_volume:")[1].strip().split()[0])
        elif "mean_volume:" in line:
            rms_db = float(line.split("mean_volume:")[1].strip().split()[0])
    return peak, rms_db


# ----------------------------------------------------------------------------
# 8. 主流程
# ----------------------------------------------------------------------------
def main():
    keep_wav = "--keep-wav" in sys.argv
    force_no_mp3 = "--no-mp3" in sys.argv
    check_mode = "--check" in sys.argv
    if "--sr" in sys.argv:
        global SR
        SR = int(sys.argv[sys.argv.index("--sr") + 1])
    ffmpeg = None if force_no_mp3 else find_ffmpeg()
    use_mp3 = bool(ffmpeg)

    if check_mode:
        # 幂等自检：全部重跑到临时目录，**绝不触碰交付物**
        chk_root = os.path.join(tempfile.gettempdir(), "arboss_audio_check")
        shutil.rmtree(chk_root, ignore_errors=True)
        sfx_out = os.path.join(chk_root, "sfx")
        bgm_out = os.path.join(chk_root, "bgm")
        for d in (sfx_out, bgm_out):
            os.makedirs(d, exist_ok=True)
    else:
        sfx_out, bgm_out = SFX_DIR, BGM_DIR
        for d in (SFX_DIR, BGM_DIR):
            os.makedirs(d, exist_ok=True)
    build_dir = os.path.join(tempfile.gettempdir(), "arboss_audio_build")
    os.makedirs(build_dir, exist_ok=True)

    records = []
    print("=" * 82)
    print("《AR 像素 Boss 战》音频程序化合成  |  SR=%dHz / mono / %s"
          % (SR, ("MP3 CBR " + BITRATE) if use_mp3 else "WAV 16-bit（需转 MP3）"))
    print("ffmpeg: %s" % (ffmpeg if use_mp3 else "不可用 → 交付 WAV，包体需人工压 MP3"))
    print("=" * 82)

    def emit(sid, name, samples, target_dbfs, waveform, usage, out_dir, bitrate, category, loop):
        """
        ★ 自校准编码（关键质量步骤）：
          实测发现 MP3（libmp3lame 64kbps mono）对瞬态密集内容存在最多 +2.9 dB 的
          **解码后溢出**（编解码器合成滤波器振铃）—— 源 WAV 峰值精准在目标上，
          解码后却会跑到 -3.1 dBFS，吃掉 audio-spec §4.2 要求的 headroom。

          做法：按目标峰值编码 → volumedetect 实测「解码后」峰值 → 双向阻尼收敛（≤4 轮，
          并保留历次中最贴近目标的一次），使**实际播放时**的峰值落在规格表目标上。

          为什么必须双向：单向（只回落）会让同族的 4 档命中音收敛到 -10.3 / -8.9 这类
          不同电平上，**破坏音高阶梯的等响关系**；双向收敛把每档都钉回目标的 ±0.35 dB。

        ★ 本函数**只做线性峰值归一**，绝不做非线性限幅 ——
          原始合成信号的峰值最高到 +10.4 dBFS（3.3×），若送进 tanh 类软削波会产生
          **互调失真**：多层之间凭空长出低频分量，实测使 `sfx_result_lose` 的
          <60Hz 连续段从 0ms 变成 210ms（擦过 spec §6.3 的 200ms 判据）。
          详见 `soft_limit_UNUSED` 的注释。防削波靠"前置电平设计 + 线性缩放"，
          不靠事后压缩。
        """
        samples = remove_dc(samples)
        if not use_mp3:
            samples = normalize_peak(samples, target_dbfs)
            out_path = os.path.join(out_dir, sid + ".wav")
            write_wav(out_path, samples)
            gain_db, measured = 0.0, target_dbfs
        else:
            out_path = os.path.join(out_dir, sid + ".mp3")
            wav_path = os.path.join(build_dir, sid + ".wav")
            hist, gain_db = [], 0.0
            for _ in range(4):
                write_wav(wav_path, normalize_peak(samples, target_dbfs + gain_db))
                to_mp3(ffmpeg, wav_path, out_path, bitrate)
                p, _ = probe_levels(ffmpeg, out_path)
                if p is None:
                    break
                err = p - target_dbfs
                hist.append((abs(err), gain_db, p))
                if abs(err) <= 0.35:
                    break
                gain_db -= err * 0.9          # 阻尼收敛（溢出量随电平非线性变化）
            if hist:
                hist.sort()
                _a, best_gain, best_peak = hist[0]
                if abs(best_gain - gain_db) > 1e-9:      # 末次不是最优 → 补编一次
                    write_wav(wav_path, normalize_peak(samples, target_dbfs + best_gain))
                    to_mp3(ffmpeg, wav_path, out_path, bitrate)
                gain_db, measured = best_gain, best_peak
            else:
                measured = None
            if keep_wav:
                shutil.copy2(wav_path, os.path.join(out_dir, sid + ".wav"))
        size = os.path.getsize(out_path)
        if use_mp3:
            measured, measured_rms = probe_levels(ffmpeg, out_path)
        else:
            measured = target_dbfs
            measured_rms = 20.0 * math.log10(rms(samples)) if rms(samples) > 0 else None
        rec = {
            "id": sid,
            "name": name,
            "file": "assets/audio/%s/%s%s" % (os.path.basename(out_dir), sid,
                                              ".mp3" if use_mp3 else ".wav"),
            "durationMs": int(round(ms_of(len(samples)))),
            "bytes": size,
            "waveform": waveform,
            "usage": usage,
            "category": category,
            "loop": loop,
            "peakDbfs": target_dbfs,
            "measuredPeakDbfs": round(measured, 1) if measured is not None else None,
            # 解码域 RMS（= ffmpeg volumedetect 的 mean_volume），供 QA 按同一口径独立复算
            "measuredRmsDbfs": round(measured_rms, 1) if measured_rms is not None else None,
            "renderGainDb": round(gain_db, 2),
            "sampleRate": SR,
            "channels": CHANNELS,
            "bitrateKbps": int(bitrate.rstrip("k")) if use_mp3 else None,
            "format": "mp3" if use_mp3 else "wav",
            "source": "procedural-synth (tools/make_audio.py)",
        }
        records.append(rec)
        print("  %-22s %6dms  %8d B   peak %5.1f dB (target %4.1f, calib %+.1f dB)"
              % (sid, rec["durationMs"], size, measured if measured is not None else 0.0,
                 target_dbfs, gain_db))
        return rec

    print("\n-- 音效 SFX (24) --")
    for sid, name, fn, peak, wave, usage in SFX_TABLE:
        emit(sid, name, fn(), peak, wave, usage, sfx_out, BITRATE, "sfx", False)

    print("\n-- 音乐 BGM (2) --")
    for sid, name, kind, wave, usage in BGM_TABLE:
        emit(sid, name, build_bgm(kind), -6.0, wave, usage, bgm_out, BITRATE_BGM, "bgm", True)

    if not keep_wav:
        shutil.rmtree(build_dir, ignore_errors=True)

    if check_mode:
        return report_check(records, chk_root)

    sfx_bytes = sum(r["bytes"] for r in records if r["category"] == "sfx")
    bgm_bytes = sum(r["bytes"] for r in records if r["category"] == "bgm")
    total = sfx_bytes + bgm_bytes

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({
            "generatedBy": "tools/make_audio.py",
            "spec": "audio-spec.md (雷鸣远 v1.4)",
            "content": "procedural chiptune synthesis (no external samples, no AI tools, no vocals)",
            "sampleRate": SR,
            "channels": CHANNELS,
            "format": "mp3" if use_mp3 else "wav",
            "bitrateKbps": ({"sfx": int(BITRATE.rstrip("k")), "bgm": int(BITRATE_BGM.rstrip("k"))}
                            if use_mp3 else None),
            "counts": {"sfx": len(SFX_TABLE), "bgm": len(BGM_TABLE),
                       "total": len(SFX_TABLE) + len(BGM_TABLE)},
            "bytes": {"sfx": sfx_bytes, "bgm": bgm_bytes, "total": total},
            "clips": records,
        }, f, ensure_ascii=False, indent=2)

    write_sources(use_mp3)

    print("\n" + "=" * 82)
    print("音效 %d 条 = %d B  |  BGM %d 段 = %d B  |  合计 %d B = %.1f KB = %.3f MB"
          % (len(SFX_TABLE), sfx_bytes, len(BGM_TABLE), bgm_bytes,
             total, total / 1024.0, total / 1048576.0))
    print("清单: %s" % MANIFEST)
    print("留痕: %s" % SOURCES)
    print("=" * 82)
    return 0


def write_sources(use_mp3):
    lines = [
        "# 音频素材来源留痕（提审版权凭证）",
        "",
        "> 对应 `audio-spec.md` §5.4「素材留痕」与验收项 16「版权留痕完整」。",
        "> 本特效包 **全部音频为程序化合成**，由本仓库脚本 `tools/make_audio.py` 生成。",
        "",
        "## 结论",
        "",
        "1. **零外部素材**：未下载、未引用任何第三方音频文件、采样库或 loop 包。",
        "2. **零 AI 生成**：未调用任何 AI 音频生成工具（含平台 `generate_audio`）。",
        "3. **零人声**：不含任何人声采样、TTS 或真人笑声；拟人声一律由方波合成（验收项 15）。",
        "",
        "## 生成方式",
        "",
        "| 项 | 内容 |",
        "|---|---|",
        "| 生成脚本 | `tools/make_audio.py`（纯 Python 标准库）|",
        "| 合成方法 | 8-bit chiptune：方波（可变占空比）/ 三角波 / 白噪声 + 一阶 IIR 滤波 + A/指数包络 |",
        "| 音高阶梯 | `sfx_hit_light_1..4`、`sfx_hit_heavy_1..3` 由**基准体重采样离线派生**"
        "（0/+2/+4/+6 半音），非逐条生成 |",
        "| 采样率 / 声道 | %d Hz / 单声道 |" % SR,
        "| 编码 | %s |" % ("MP3 CBR 64 kbps（libmp3lame / ffmpeg 6.1.1，剥离 ID3）" if use_mp3
                             else "WAV 16-bit PCM（环境无 ffmpeg；**需转 MP3 以压包体**）"),
        "| 版权 | 原创波形合成；无旋律素材引用，不构成对任何已知作品的复制 |",
        "| 复现 | `python tools/make_audio.py`（噪声固定 seed，结果确定性可复现）|",
        "",
        "## 逐条来源登记",
        "",
        "| 文件 | 来源 | 说明 |",
        "|---|---|---|",
    ]
    for sid, name, _fn, _p, _w, _u in SFX_TABLE:
        lines.append("| `%s.mp3` | 程序化合成 | %s |" % (sid, name))
    for sid, name, _kind, _w, _u in BGM_TABLE:
        lines.append("| `%s.mp3` | 程序化合成 | %s（A 小调 120BPM / 8 小节 / 无缝循环）|" % (sid, name))
    lines += [
        "",
        "**无空项** —— 每条音频均可追溯到 `tools/make_audio.py` 中对应的生成函数。",
        "",
        "—— audio-synth / 音频主管",
    ]
    with open(SOURCES, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def report_check(records, chk_root):
    """幂等自检报告：逐条比对临时目录重跑结果与已交付文件的字节"""
    import hashlib

    def h(p):
        with open(p, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()

    diff = []
    for rec in records:
        sub = "sfx" if rec["category"] == "sfx" else "bgm"
        a = os.path.join(AUDIO, sub, rec["id"] + ".mp3")
        b = os.path.join(chk_root, sub, rec["id"] + ".mp3")
        if not os.path.exists(a):
            diff.append((rec["id"], "交付物缺失"))
        elif h(a) != h(b):
            diff.append((rec["id"], "字节不一致"))
    print("\n" + "=" * 82)
    print("幂等自检：重跑 %d 条并与已交付文件逐条比对 md5" % len(records))
    if diff:
        print("  ✗ 不一致 %d 条：%s" % (len(diff), diff))
        print("  → 重跑产出与交付物不同，请重跑 `python tools/make_audio.py` 覆盖")
        print("=" * 82)
        return 1
    print("  ✓ 全部 %d 条字节完全一致 → 生成过程确定性、幂等" % len(records))
    print("=" * 82)
    return 0


if __name__ == "__main__":
    sys.exit(main())
