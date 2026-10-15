/**
 * Detector-only audio entry for generated gameplay scripts.
 *
 * Use this only when the design explicitly needs pitch detection or volume
 * detection feedback (e.g.,声控互动、唱歌/发声挑战). Import the helpers from
 * `./AgentAudioDetector` and create the detector during scene setup.
 *
 * IMPORTANT:
 * - Implementation: Wraps `APJS.AudioDetectionModule` with singleton handles.
 * - Constraints: Only supports default microphone source in this version.
 * - Maintenance: This file is a provided runtime adapter; keep gameplay logic
 *   in separate scripts.
 *
 * GAMEPLAY DESIGN:
 * - Continuous controls are the safest choice: map getVolume() directly, but
 *   use log2(getPitchHz()) for perceived-pitch or musical position mappings.
 * - Threshold controls MUST use hysteresis unless the user explicitly requests
 *   custom thresholds: start at getVolume() >= 0.35 and release at
 *   getVolume() <= 0.25. NEVER use a threshold below 0.25, such as 0.08 or 0.1,
 *   because it cannot reliably filter ambient noise.
 * - getVolume() reference: 0.00-0.20 ambient noise, 0.20-0.35 soft or distant
 *   voice, 0.35-0.55 clear speech trigger zone, 0.55-0.80 loud speech,
 *   0.80-1.00 shout/saturation.
 * - Three-zone pitch control for adult voices works best with wide defaults:
 *   low <= 180 Hz, middle 180-280 Hz, high >= 280 Hz. Keep the last target
 *   state while pitch is temporarily invalid.
 * - Fast interaction matters for lane switching and flying. Update the target
 *   state from the current frame and use a visual easing factor around 0.35-0.5.
 */

import {Game2D} from './Game2D';

export type AgentAudioSourceType = number;

type AudioSourceNodeLike = {
    getSourceNode?: () => unknown;
};

export interface AgentAudioComponentLike {
    getAudioClipPlayer?: () => AudioSourceNodeLike | null;
}

export interface AgentAudioSourceOptions {
    sourceType?: AgentAudioSourceType;
    audioComponent?: AgentAudioComponentLike | null;
}

export interface AgentPitchDetector {
    enabled: boolean;
    /**
     * Returns the detected fundamental pitch directly in Hz (physical frequency).
     * Returns -1 when no valid pitched voice/sound is detected yet.
     * Treat pitch as detected when the returned value is greater than 0.
     * For pitch-driven gameplay, compare Hz directly against wide thresholds.
     * For continuous or musical mapping, use log2(pitchHz) or convert to MIDI
     * with 69 + 12*log2(pitchHz/440); do not linearly normalize Hz.
     * Human voice reference values are approximately:
     *   ~85 Hz (deep male), ~150 Hz (typical male),
     *   ~255 Hz (typical female), ~350 Hz (high female / child).
     * The underlying detector's effective range is roughly 45 Hz to 650 Hz.
     * Recommended three-zone control for adult voices: low <= 180 Hz,
     * middle 180-280 Hz, high >= 280 Hz.
     */
    getPitchHz(): number;
    destroy(): void;
}

export interface AgentVolumeDetector {
    enabled: boolean;
    /**
     * Returns perceived microphone loudness normalized to [0, 1].
     * APJS raw volume is squared amplitude / energy. This converts it with
     * 10*log10(E), normalizes the energy-dB window [-16, -7], and applies a
     * gamma curve to produce a more responsive gameplay control value.
     * In typical microphone previews, normal speech often falls around
     * 0.4 to 0.8 after this mapping, depending on device gain and distance.
     * Unless the user explicitly requests custom thresholds, voice-triggered
     * interactions MUST trigger at 0.35 and MUST release at 0.25. NEVER use a
     * threshold below 0.25, such as 0.08 or 0.1, to filter ambient noise.
     * Returns -1 when no valid result is available yet.
     */
    getVolume(): number;
    destroy(): void;
}

type RuntimeDetector = {
    enabled: boolean;
    getResult(): number;
    destroy(): void;
};

type DetectorBuilderLike<TRuntimeHandle extends RuntimeDetector> = {
    setDetectorSource?: (
        type: AgentAudioSourceType,
        audioComponent: AgentAudioComponentLike | null,
    ) => DetectorBuilderLike<TRuntimeHandle>;
    build?: () => TRuntimeHandle | null;
};

type DetectorDestroyable =
    | AgentPitchDetector
    | AgentVolumeDetector
    | null
    | undefined;

let sharedPitchHandle: RuntimeDetector | null = null;
let sharedVolumeHandle: RuntimeDetector | null = null;
let sharedPitchWrapper: AgentPitchDetector | null = null;
let sharedVolumeWrapper: AgentVolumeDetector | null = null;

// APJS volume is squared amplitude / energy, so its dB conversion uses
// 10 * log10(E). The default window follows APJS's microphone reference:
// roughly 0.025 energy at the floor and 0.20 at saturation.
const MIN_VOICE_ENERGY_DB = -16;
const MAX_VOICE_ENERGY_DB = -7;
const VOLUME_CURVE_GAMMA = 0.7;

const isDefaultMicrophoneOptions = (options?: AgentAudioSourceOptions): boolean => {
    return !options?.audioComponent
        && (options?.sourceType === undefined || options.sourceType === APJS.AudioSourceType.Microphone);
};

const buildDetector = (detectionTypeName: 'Pitch' | 'Volume'): RuntimeDetector | null => {
    const detectionType = APJS.AudioDetectionType?.[detectionTypeName];
    const builder = APJS.AudioDetectionModule?.getOrCreateAudioDetectionBuilder?.(detectionType) as DetectorBuilderLike<RuntimeDetector> | null;
    if (!builder) {
        console.warn('[AgentAudioDetector] buildDetector failed', detectionTypeName);
        return null;
    }
    builder.setDetectorSource?.(APJS.AudioSourceType.Microphone, null);
    return builder.build?.() ?? null;
};

const toPerceivedVolume = (rawEnergy: number): number => {
    if (rawEnergy <= 0) {
        return 0;
    }
    const energyDb = 10 * Math.log10(rawEnergy);
    const linear = (energyDb - MIN_VOICE_ENERGY_DB)
        / (MAX_VOICE_ENERGY_DB - MIN_VOICE_ENERGY_DB);
    const clamped = Math.min(1, Math.max(0, linear));
    // Apply a gamma < 1 to boost the low end (soft voices become more responsive)
    // while keeping the high end clamped at 1.
    return Math.pow(clamped, VOLUME_CURVE_GAMMA);
};

const getRawVolume = (): number => {
    if (!sharedVolumeWrapper?.enabled) {
        return -1;
    }
    return sharedVolumeHandle?.getResult() ?? -1;
};

Game2D.injectInitHandler(() => {
    sharedPitchHandle = buildDetector('Pitch');
    sharedVolumeHandle = buildDetector('Volume');
});

export const AgentAudioDetector = {
    createPitchDetector(options?: AgentAudioSourceOptions): AgentPitchDetector | null {
        if (!isDefaultMicrophoneOptions(options)) {
            console.warn('[AgentAudioDetector] createPitchDetector only supports default microphone source');
            return null;
        }
        if (!sharedPitchWrapper) {
            sharedPitchWrapper = {
                enabled: true,
                /**
                 * 直接返回检测到的基频，单位为 Hz。
                 * 尚无有效音高时返回 -1；音高大于 0 即表示检测到有效音高。
                 * 宽区间判断可直接比较 Hz；连续听感或音乐映射应使用 log2(pitchHz)，
                 * 或转为 MIDI 音符值 69 + 12*log2(pitchHz/440)，不要线性归一化 Hz。
                 * 常见人声参考：~85 Hz（低音男声）、~150 Hz（普通男声）、
                 * ~255 Hz（普通女声）、~350 Hz（高音女声/儿童）。
                 * 底层检测器的有效范围约为 45 Hz ~ 650 Hz。
                 * 面向成人自然发声的三段控制推荐：低音 <= 180 Hz，
                 * 中音 180~280 Hz，高音 >= 280 Hz。
                 */
                getPitchHz(): number {
                    if (!sharedPitchWrapper?.enabled) {
                        return -1;
                    }
                    const pitchHz = sharedPitchHandle?.getResult() ?? -1;
                    return pitchHz > 0 ? pitchHz : -1;
                },
                destroy(): void {
                    if (sharedPitchWrapper) {
                        sharedPitchWrapper.enabled = false;
                    }
                },
            };
        }
        sharedPitchWrapper.enabled = true;
        return sharedPitchWrapper;
    },

    createVolumeDetector(options?: AgentAudioSourceOptions): AgentVolumeDetector | null {
        if (!isDefaultMicrophoneOptions(options)) {
            console.warn('[AgentAudioDetector] createVolumeDetector only supports default microphone source');
            return null;
        }
        if (!sharedVolumeWrapper) {
            sharedVolumeWrapper = {
                enabled: true,
                /**
                 * 返回更符合直觉的 [0, 1] 人声响度。
                 * APJS 返回振幅平方/能量，内部使用 10*log10(E) 转换到
                 * 能量 dB 范围 [-16, -7]（原始值约 0.025~0.20），
                 * 再叠加一层 gamma=0.7 曲线，让小音量段更敏感。
                 * 常见麦克风预览中：轻声说话约 0.4~0.5，普通说话约 0.65~0.85，
                 * 大声说话或喊叫会封顶到 1.0，具体取决于设备增益与距离。
                 * 正常声控玩法、阈值判断和音量条都使用这个接口。
                 * 连续型玩法可直接映射完整数值范围到高度、大小、速度或强度。
                 * 除非用户明确指定自定义阈值，阈值型玩法必须在 >= 0.35 时触发，
                 * 在 <= 0.25 时释放；不得使用低于 0.25 的阈值（如 0.08 或 0.1）过滤环境噪声。
                 * 参考区间：0.00~0.20 环境底噪，0.20~0.35 轻声或远距离说话，
                 * 0.35~0.55 清晰说话触发区，0.55~0.80 大声说话，0.80~1.00 喊声/饱和。
                 * 尚无有效结果时返回 -1，代表当前没有声音。
                 */
                getVolume(): number {
                    const volume = getRawVolume();
                    return volume >= 0 ? toPerceivedVolume(volume) : -1;
                },
                destroy(): void {
                    if (sharedVolumeWrapper) {
                        sharedVolumeWrapper.enabled = false;
                    }
                },
            };
        }
        sharedVolumeWrapper.enabled = true;
        return sharedVolumeWrapper;
    },
};

/**
 * Create a pitch detector for detector-style gameplay such as singing, shouting,
 * or pitch meter interactions.
 */
export function createPitchDetector(options?: AgentAudioSourceOptions): AgentPitchDetector | null {
    return AgentAudioDetector.createPitchDetector(options);
}

/**
 * Create a volume detector for detector-style gameplay such as loudness bars,
 * voice intensity, or shout power interactions.
 */
export function createVolumeDetector(options?: AgentAudioSourceOptions): AgentVolumeDetector | null {
    return AgentAudioDetector.createVolumeDetector(options);
}

export function destroyAgentAudioDetectorHandle(handle: DetectorDestroyable): void {
    try {
        handle?.destroy();
    } catch (error) {
        console.warn('[AgentAudioDetector] destroyAgentAudioDetectorHandle failed', error);
    }
}
