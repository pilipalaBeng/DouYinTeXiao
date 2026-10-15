/**
 * AgentAudioKeyword.d.ts - Keyword Detection API Surface (Agent-Facing)
 *
 * Recommended usage:
 * 1) call `registerKeywordDetectorInit(...)` before `Game2D.onInit` if non-default
 *    mode is needed.
 * 2) call `createKeywordDetector(...)` in scene setup.
 * 3) bind `onKeywordHit(...)` and set target keywords.
 *
 * IMPORTANT RULES:
 * - Default: Microphone + Chinese word mode.
 * - Flow: Keywords must be registered/set before starting.
 * - Source: Default is microphone.
 * - Lifecycle: Initialized during `Game2D.onInit`.
 */

export type AgentAudioSourceType = number;
export type AgentKeywordType = 'chineseWord' | 'chinesePinyin' | 'englishWord';

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

export interface AgentKeywordDetectionOptions extends AgentAudioSourceOptions {
  keywordType?: AgentKeywordType;
}

export interface AgentKeywordDetector {
  enabled: boolean;
  keywordType: AgentKeywordType;
  start(): void;
  stop(): void;
  isStarted(): boolean;
  setTargetKeywords(keywords: string[]): void;
  getTargetKeywords(): string[];
  onKeywordHit(callback: (keywords: string[]) => void, context?: object): void;
  offKeywordHit(callback: (keywords: string[]) => void, context?: object): void;
  onKeywordMiss(callback: () => void, context?: object): void;
  offKeywordMiss(callback: () => void, context?: object): void;
  destroy(): void;
}

export declare const AgentAudioKeyword: {
  registerKeywordDetectorInit(options?: AgentKeywordDetectionOptions): void;
  createKeywordDetector(options?: AgentKeywordDetectionOptions): AgentKeywordDetector | null;
};

export declare function registerKeywordDetectorInit(
  options?: AgentKeywordDetectionOptions
): void;

export declare function createKeywordDetector(
  options?: AgentKeywordDetectionOptions
): AgentKeywordDetector | null;

export declare function destroyAgentAudioKeywordHandle(
  handle: AgentKeywordDetector | null | undefined
): void;
