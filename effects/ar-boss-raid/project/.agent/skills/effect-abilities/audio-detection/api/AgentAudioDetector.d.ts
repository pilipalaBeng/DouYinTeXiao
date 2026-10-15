/**
 * AgentAudioDetector.d.ts - Audio Detection API Surface (Agent-Facing)
 *
 * Recommended usage:
 * 1) import { createPitchDetector, createVolumeDetector } from `./AgentAudioDetector`
 * 2) call in scene setup; store handles in class fields.
 * 3) read values in `update()` or `onUpdate()`.
 *
 * GAMEPLAY DESIGN RULES:
 * - Source: Microphone-only in generated scripts.
 * - Pitch Output: getPitchHz() returns the fundamental frequency directly in Hz; returns -1 if no valid pitch is detected.
 * - Pitch Mapping: Perceived pitch is logarithmic rather than linear in Hz. For continuous or musical mappings, use log2(pitchHz) or 69 + 12*log2(pitchHz/440); direct Hz thresholds are fine for broad zones.
 * - Pitch Gate: Treat pitch > 0 as valid pitch. Use getVolume() as an optional noise gate for noisy scenes and spoken/voiced interactions.
 * - Voice Pitch: Human voice examples are ~85 Hz (deep male), ~150 Hz (typical male), ~255 Hz (typical female), ~350 Hz (high female/child). Effective detection range is roughly 45 Hz to 650 Hz.
 * - Raw Volume: APJS microphone volume is squared amplitude / energy and is kept internal; reference voice values are roughly 0.05 (soft), 0.10 (medium), 0.15 (loud), and 0.20 (very loud).
 * - Volume Curve: getVolume() uses 10*log10(E), maps the energy-dB window [-16, -7], and applies a gamma=0.7 curve to make soft voices more responsive.
 * - Volume Range: getVolume() returns a more intuitive and sensitive [0, 1] control value. Soft speech ~0.4-0.5, normal speech ~0.65-0.85, shouting clamps to 1.0.
 * - Voice Gate: Unless the user explicitly specifies custom thresholds, voice-triggered interactions MUST trigger at getVolume() >= 0.35 and MUST release at getVolume() <= 0.25. NEVER use a threshold below 0.25 (such as 0.08 or 0.1), because it cannot reliably filter ambient noise.
 * - Continuous Control: For volume bars, fountain height, flame size, note ladders, and similar analog feedback, map getVolume() or getPitchHz() continuously to the visual range. This mode is the most robust.
 * - Threshold Control: For jump/fly/left-right lane decisions, use wide thresholds, hysteresis, and fast visual response. Keep the last target state while pitch is temporarily invalid.
 * - Volume Thresholds: For fly/jump/shout triggers, MUST use getVolume() >= 0.35 to start and getVolume() <= 0.25 to release unless the user explicitly requests custom thresholds. Do not replace this hysteresis pair with a lower single threshold. For flight height, use continuous lift above 0.35 instead of a single all-or-nothing force.
 * - Volume Reference: getVolume() roughly corresponds to microphone loudness like this: 0.00-0.20 ambient noise, 0.20-0.35 soft or distant voice, 0.35-0.55 clear speech trigger zone, 0.55-0.80 loud speech, 0.80-1.00 shout/saturation.
 * - Pitch Thresholds: For three-zone adult voice control without calibration, prefer low <= 180 Hz, middle 180-280 Hz, high >= 280 Hz. These wide zones are easier to play than narrow extremes.
 * - Response Tuning: For lane switching or flying, update the target state from the current frame and use fast visual easing. A per-frame lane interpolation factor around 0.35-0.5 feels responsive; 0.15 feels intentionally slow.
 * - Lifecycle: Automatically initialized during `Game2D.onInit`.
 */

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
   * It maps APJS raw squared-amplitude/energy volume through 10*log10(E),
   * normalizes the energy-dB window [-16, -7], and then applies a
   * gamma = 0.7 curve so that soft voices are more responsive while loud
   * voices are still clamped at 1.0. Use this for normal gameplay thresholds and volume bars.
   * In typical microphone previews:
   *   - soft speech maps to ~0.4-0.5
   *   - normal indoor speech maps to ~0.65-0.85
   *   - loud speech / shouting saturates at 1.0
   * Actual values depend on device gain and distance.
   * Unless the user explicitly requests custom thresholds, threshold-based
   * voice interactions MUST trigger at 0.35 and MUST release at 0.25.
   * NEVER use a threshold below 0.25, such as 0.08 or 0.1, to filter ambient
   * noise. Continuous controls can map the whole value range directly to
   * height, size, speed, or intensity.
   * Returns -1 when no valid result is available yet, meaning there is currently no sound.
   */
  getVolume(): number;
  destroy(): void;
}

export declare const AgentAudioDetector: {
  createPitchDetector(options?: AgentAudioSourceOptions): AgentPitchDetector | null;
  createVolumeDetector(options?: AgentAudioSourceOptions): AgentVolumeDetector | null;
};

export declare function createPitchDetector(
  options?: AgentAudioSourceOptions
): AgentPitchDetector | null;

export declare function createVolumeDetector(
  options?: AgentAudioSourceOptions
): AgentVolumeDetector | null;

export declare function destroyAgentAudioDetectorHandle(
  handle: AgentPitchDetector | AgentVolumeDetector | null | undefined
): void;
