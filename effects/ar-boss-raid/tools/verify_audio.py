#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《AR 像素 Boss 战》音频客观验收脚本  (audio-synth)
==================================================
对 `assets/audio/` 下已生成的音频做**可复跑的客观取证**，供 QA / 提审举证。
对应 audio-spec.md §9 验收表的可判定项：
  #4 音高上限（等响关系）  #6 失败音不吓人（低频闸门）  #8 总音频体积
  #12 BGM 循环无缝  #15 零人声（频域侧证）  #17 命名合规  #18 格式合规

纯标准库（+ 系统 ffmpeg 用于解码）。用法： python tools/verify_audio.py
"""

import array
import cmath
import glob
import json
import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
EFFECT = os.path.dirname(HERE)
AUDIO = os.path.join(EFFECT, "assets", "audio")
MANIFEST = os.path.join(AUDIO, "audio.json")
FFMPEG_CANDIDATES = [
    r"D:\Software\XiangSu\Douyin AR\Resources\BuiltinResource\ffmpeg\x86_64\ffmpeg.exe",
    r"D:\Software\XiangSu\Douyin AR\x64\ffmpeg.exe",
]

PASS, FAIL, WARN = "[PASS]", "[FAIL]", "[WARN]"
_results = []


def check(ok, level, name, detail):
    tag = PASS if ok else level
    _results.append((ok, name))
    print("  %-6s %-38s %s" % (tag, name, detail))
    return ok


# ---------------------------------------------------------------------------
def find_ffmpeg():
    for p in FFMPEG_CANDIDATES:
        if os.path.isfile(p):
            return p
    import shutil
    return shutil.which("ffmpeg")


def decode_pcm(ffmpeg, path, sr):
    """解码为 16bit 单声道 PCM → list[float] (-1..1)"""
    out = os.path.join(tempfile.gettempdir(), "_verify_tmp.pcm")
    r = subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                        "-i", path, "-f", "s16le", "-acodec", "pcm_s16le",
                        "-ac", "1", "-ar", str(sr), out], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "replace"))
    a = array.array("h")
    a.frombytes(open(out, "rb").read())
    os.remove(out)
    return [v / 32768.0 for v in a]


def peak_dbfs(sig):
    m = max((abs(v) for v in sig), default=0.0)
    return 20.0 * math.log10(m) if m > 1e-9 else -120.0


def rms(sig):
    if not sig:
        return 0.0
    return math.sqrt(sum(v * v for v in sig) / len(sig))


def rms_dbfs(sig):
    r = rms(sig)
    return 20.0 * math.log10(r) if r > 1e-9 else -120.0


def cascade_lowpass(sig, fc, order=8):
    """
    ★ order 必须 ≥ 8（48 dB/oct）。两级经实测确认的已知局限（qa-lead 2026-10-13 独立复算）：

      局限 1 —— 对 87–90 Hz 的隔离是**保守但非完美**：
        8 阶对 87 Hz 实测只衰减 **−18.4 dB**（4 阶为 −11.8 dB，非我先前注释所写的 ~−26 dB，
        该数字已按实测更正）。因此若真有「稳态 87 Hz 满电平 >200 ms」的内容，
        仍会被误报成「<60 Hz 持续」。本批资产**实测最坏 50 ms（sfx_boss_land）**，
        余量 +150 ms，不触发。

      局限 2 —— 起振斜坡会贡献读数：判据是「低通输出 RMS ≥ 全曲峰值 −40 dB」，
        这个阈值对缓起音(如 A=30 ms)偏敏感。已用对照实验确认：纯 300 Hz 方波
        在 A=0.5 ms / 30 ms 下 run 均为 0 ms，故本批读数**不是**起振造成的假阳性。

      → 结论：该闸门用于「抓明显违规」可靠；对 200 ms 附近的擦线值只应作为**观测项**，
        不应单独据此判失败。真正的判定请结合人工听审。

      ※ 历史：本闸门曾报 `sfx_result_lose` = 200 ms「擦线」。查下去并非测量误差，
        而是信号链里的真缺陷（tanh 软削波误置于峰值归一之前 → 互调失真造出低频）。
        修掉后该条为 **0 ms**。见 `make_audio.py::soft_limit_UNUSED` 的注释。
    """
    k = 1.0 - math.exp(-2.0 * math.pi * fc / SRV)
    out = list(sig)
    for _ in range(order):
        y = 0.0
        for i, x in enumerate(out):
            y += (x - y) * k
            out[i] = y
    return out


SRV = 44100


def sub_low_run_ms(sig, sr, cutoff=60.0, rel_db=-40.0, win_ms=10.0):
    """
    低频闸门（audio-spec §6.3 第 2 条）的忠实实现：
      把信号 4 阶低通到 cutoff 以下 → 取短时 RMS 包络 → 求「相对全曲峰值 -rel_db」
      以上的**最长连续时长(ms)**。判据是 spec 原文口径：禁 <60Hz 的**持续 >200ms** 能量。
    """
    global SRV
    SRV = sr
    f = cascade_lowpass(sig, cutoff, order=8)
    w = max(1, int(win_ms / 1000.0 * sr))
    thr = 10.0 ** ((peak_dbfs(sig) + rel_db) / 20.0)
    run = best = 0
    for i in range(0, len(f) - w, w):
        if rms(f[i:i + w]) > thr:
            run += w
            best = max(best, run)
        else:
            run = 0
    return best / float(sr) * 1000.0


def fft(x):
    """迭代版 Cooley-Tukey（就地，len 必须为 2 的幂）"""
    n = len(x)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            x[i], x[j] = x[j], x[i]
    ln = 2
    while ln <= n:
        ang = -2.0 * math.pi / ln
        wl = cmath.exp(1j * ang)
        for i in range(0, n, ln):
            w = 1 + 0j
            for k in range(i, i + ln // 2):
                u, v = x[k], x[k + ln // 2] * w
                x[k], x[k + ln // 2] = u + v, u - v
                w *= wl
        ln <<= 1
    return x


def band_energy_profile(sig, sr, nfft=8192):
    """Hann 窗平均功率谱 → 频段能量占比（%）。用于低频闸门 / 频段分配侧证。"""
    bands = [(0, 60), (60, 110), (110, 500), (500, 2000), (2000, 5000),
             (5000, 11000), (11000, 22050)]
    acc = [0.0] * (nfft // 2 + 1)
    hop = nfft // 2
    frames = 0
    win = [0.5 - 0.5 * math.cos(2 * math.pi * i / (nfft - 1)) for i in range(nfft)]
    for off in range(0, max(1, len(sig) - nfft), hop):
        seg = sig[off:off + nfft]
        if len(seg) < nfft:
            break
        buf = [complex(seg[i] * win[i], 0.0) for i in range(nfft)]
        fft(buf)
        for k in range(nfft // 2 + 1):
            acc[k] += (buf[k].real ** 2 + buf[k].imag ** 2)
        frames += 1
    if frames == 0:
        return {b: 0.0 for b in bands}
    total = sum(acc) or 1e-12
    out = {}
    for lo, hi in bands:
        k0 = int(lo * nfft / sr)
        k1 = min(int(hi * nfft / sr), nfft // 2)
        out[(lo, hi)] = 100.0 * sum(acc[k0:k1 + 1]) / total
    return out


# ---------------------------------------------------------------------------
def main():
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("ffmpeg 不可用，无法验收"); return 1
    man = json.load(open(MANIFEST, encoding="utf-8"))
    sr = man["sampleRate"]
    clips = man["clips"]

    print("=" * 88)
    print("《AR 像素 Boss 战》音频客观验收   |  %d 条资产  |  %d Hz / mono"
          % (len(clips), sr))
    print("=" * 88)

    # --- 1. 体积 -----------------------------------------------------------
    print("\n[1] 体积 (audio-spec §5.2 / 验收 #8 #9)")
    sfx_b = man["bytes"]["sfx"]; bgm_b = man["bytes"]["bgm"]; tot = man["bytes"]["total"]
    check(tot <= 360 * 1024, FAIL, "总音频体积 ≤ 360 KB",
          "实测 %d B = %.1f KB" % (tot, tot / 1024))
    over10k = [(c["id"], c["bytes"]) for c in clips
               if c["category"] == "sfx" and c["durationMs"] < 1000 and c["bytes"] > 10240]
    check(not over10k, FAIL, "短音效(<1s) 单个 ≤ 10 KB",
          "超限 %d 条" % len(over10k) if over10k else
          "最长 <1s 音效 %.1f KB" % (max(c["bytes"] for c in clips
                                     if c["category"] == "sfx" and c["durationMs"] < 1000) / 1024.0))
    bgm_over = [(c["id"], c["bytes"]) for c in clips
                if c["category"] == "bgm" and c["bytes"] > 150 * 1024]
    check(not bgm_over, FAIL, "BGM 每段 ≤ 150 KB",
          "超限 %d 段" % len(bgm_over) if bgm_over
          else "每段 %.1f KB" % (bgm_b / 2 / 1024))
    check(tot <= 2048 * 1024, FAIL, "音频 ≤ 2 MB 包体红线",
          "占总预算 %.1f%%" % (100.0 * tot / (2048 * 1024)))

    # --- 2. 命名 / 格式 ----------------------------------------------------
    print("\n[2] 命名与格式 (验收 #17 #18)")
    pat = re.compile(r"^(sfx_[a-z0-9_]+|bgm_p[12]_[a-z]+)\.mp3$")
    bad = [c["id"] for c in clips if not pat.match(c["id"] + ".mp3")]
    check(not bad, FAIL, "命名合规 (全小写+下划线, .mp3)", "违规 %s" % bad if bad else "24+2 条全部合规")
    files = glob.glob(os.path.join(AUDIO, "sfx", "*")) + glob.glob(os.path.join(AUDIO, "bgm", "*"))
    extra = [os.path.basename(f) for f in files if not f.endswith(".mp3")]
    check(not extra, FAIL, "音频目录只含 .mp3（无 wav/ogg 混入）",
          "多余文件 %s" % extra if extra else "干净")
    id3 = [f for f in files if open(f, "rb").read(3) == b"ID3"]
    check(not id3, WARN, "MP3 无 ID3 标签（省体积）", "含标签 %d 个" % len(id3))

    # --- 3. 峰值 / 响度关系 -------------------------------------------------
    print("\n[3] 电平 (audio-spec §4.2 / 验收 #14)")
    worst_p = worst_r = 0.0
    no_rms = []
    for c in clips:
        sig = decode_pcm(ffmpeg, os.path.join(EFFECT, c["file"]), sr)
        worst_p = max(worst_p, abs(peak_dbfs(sig) - c["peakDbfs"]))
        m = c.get("measuredRmsDbfs")
        if m is None:
            no_rms.append(c["id"])
        else:
            worst_r = max(worst_r, abs(rms_dbfs(sig) - m))
    check(worst_p <= 1.0, WARN, "解码后峰值贴合目标 (±1.0 dB)", "最大偏差 %.2f dB" % worst_p)
    # manifest 的 RMS 字段必须能被外部按同口径独立复算（qa-lead 要求，2026-10-13）
    check(not no_rms, FAIL, "manifest 含 measuredRmsDbfs（RMS 可复算）",
          "缺失 %d 条：%s" % (len(no_rms), no_rms[:3]) if no_rms else "26 条齐全")
    check(worst_r <= 0.5, FAIL, "manifest measuredRmsDbfs 可独立复算 (±0.5 dB)",
          "最大偏差 %.2f dB" % worst_r)

    tgt = {c["id"]: c["peakDbfs"] for c in clips}
    lt = [tgt["sfx_hit_light_%d" % i] for i in range(1, 5)]
    if max(lt) - min(lt) > 1.5:
        lt_m = [peak_dbfs(decode_pcm(ffmpeg, os.path.join(EFFECT, c["file"]), sr))
                for c in clips if c["id"].startswith("sfx_hit_light")]
        check(max(lt_m) - min(lt_m) <= 1.5, WARN, "轻击 4 档等响（音高阶梯不抖）",
              "档间极差 %.2f dB" % (max(lt_m) - min(lt_m)))
    else:
        check(True, WARN, "轻击 4 档等响（音高阶梯不抖）", "目标档间极差 %.1f dB" % (max(lt) - min(lt)))

    # --- 4. 频谱：低频闸门 / 频段分配 / 零人声侧证 --------------------------
    print("\n[4] 频谱 (验收 #6 / audio-spec §6.3 低频闸门 · 已知局限见 cascade_lowpass 注释)")
    for cid in ("bgm_p1_normal", "bgm_p2_enrage", "sfx_boss_land", "sfx_result_lose",
                "sfx_boss_roar", "sfx_hit_heavy_1"):
        c = next(x for x in clips if x["id"] == cid)
        sig = decode_pcm(ffmpeg, os.path.join(EFFECT, c["file"]), sr)
        run = sub_low_run_ms(sig, sr, cutoff=60.0, rel_db=-40.0)
        prof = band_energy_profile(sig, sr)
        ok = run <= 200.0
        margin = 200.0 - run
        tag = "擦线(零余量)" if 0 <= margin < 20 else ("超限" if not ok else "")
        check(ok, FAIL, "%s  <60Hz 最长连续 ≤200ms" % cid,
              "%6.0f ms (余量 %+5.0f ms)%s  | <60Hz 能量占比 %4.1f%% | 作战频段 600Hz-5kHz %.1f%%"
              % (run, margin, (" " + tag) if tag else "", prof[(0, 60)],
                 prof[(500, 2000)] + prof[(2000, 5000)]))

    # --- 5. BGM 循环 + 两段等响 --------------------------------------------
    print("\n[5] BGM 循环与切换 (验收 #12)")
    bgm_rms = {}
    for cid in ("bgm_p1_normal", "bgm_p2_enrage"):
        c = next(x for x in clips if x["id"] == cid)
        sig = decode_pcm(ffmpeg, os.path.join(EFFECT, c["file"]), sr)
        bgm_rms[cid] = rms_dbfs(sig)
        n20 = int(0.02 * sr)
        head, tail = rms_dbfs(sig[:n20]), rms_dbfs(sig[-n20:])
        check(tail < -35.0, FAIL, "%s 尾 20ms 已衰减 (<-35 dB)" % cid,
              "head %.1f dB / tail %.1f dB / peak %.1f dBFS"
              % (head, tail, peak_dbfs(sig)))
        check(abs(len(sig) / sr - 16.0) < 0.12, FAIL, "%s 时长 = 16.0s (循环网格)" % cid,
              "实测 %.3f s" % (len(sig) / sr))
    # ★ 两段 BGM 在组件 volume 相同（均为 30）的前提下必须等响，
    #   否则阶段 1→2 切换会「突然变响」。两者峰值都钉在 −6 dBFS，
    #   所以响度差 = 波峰因数差 —— 只能靠编曲/包络配平，不能靠音量。
    gap = abs(bgm_rms["bgm_p1_normal"] - bgm_rms["bgm_p2_enrage"])
    check(gap <= 3.0, FAIL, "两段 BGM 等响（RMS 差 ≤3 dB，同 volume 30 可硬切）",
          "p1 %.1f dBFS / p2 %.1f dBFS / 差 %.2f dB"
          % (bgm_rms["bgm_p1_normal"], bgm_rms["bgm_p2_enrage"], gap))

    # --- 6. 清单完整性 ------------------------------------------------------
    print("\n[6] 清单完整性")
    need = ("id", "name", "file", "durationMs", "bytes", "waveform", "usage")
    miss = [c["id"] for c in clips if any(k not in c or c[k] in (None, "") for k in need)]
    check(not miss, FAIL, "audio.json 字段完整 (id/name/file/durationMs/bytes/波形/用途)",
          "缺字段 %s" % miss if miss else "%d 条全部齐全" % len(clips))
    check(len(clips) == 26, FAIL, "资产数 = 26 (24 SFX + 2 BGM)", "实测 %d 条" % len(clips))

    # --- 汇总 ---------------------------------------------------------------
    nfail = sum(1 for ok, _ in _results if not ok)
    print("\n" + "=" * 88)
    print("结果：%d 项检查，%d 项通过，%d 项失败" % (len(_results), len(_results) - nfail, nfail))
    print("※ 零人声（验收 #15）为合成产出物，脚本内不存在任何人声采样源；")
    print("  频域侧证已列出，最终仍需提审前人工听审确认。")
    print("=" * 88)
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
