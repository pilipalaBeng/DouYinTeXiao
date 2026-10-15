/**
 * Check-in runtime helper for generated gameplay scripts.
 *
 * Use this only when the design explicitly needs check-in, submission-count,
 * streak, or effect participation data. Import the required helpers from
 * `./Checkin`.
 *
 * Available APIs:
 * - `getCheckinData(scene, options?, callbacks?)`
 * - `formatCheckinDayText(data)`
 *
 * Runtime rules:
 * - Default to `userSubmissionDays` for “打卡第 x 天”; never fake or mutate it.
 * - Initialize default check-in day copy as `打卡第1天`; failed/incomplete fetches
 *   should keep the day at `1`, not fall back to `0`.
 * - Replace placeholders with fetched values or fallback defaults when requests
 *   complete; do not leave loading placeholders on screen.
 * - Use other fields only when the user/design explicitly asks for them.
 * - Never modify this adapter from generated gameplay code; only call it.
 */

export type RequestCallbacks<TResponse> = {
    onSuccess?: (value: TResponse) => void;
    onError?: (error: Error) => void;
};

export interface CheckinData {
    effectSubmissionUsers: number;
    effectSubmissionTimes: number;
    userSubmissionTimes: number;
    userSubmissionDays: number;
    userConsecutiveSubmissionDays: number;
}

export interface CheckinRequestOptions {
    subType?: number;
    fallback?: Partial<CheckinData>;
}

type CheckinRuntimeAPI = {
    getCheckinData(
        scene: unknown,
        options?: CheckinRequestOptions,
        callbacks?: RequestCallbacks<CheckinData>
    ): void;
};

const DEFAULT_CHECKIN_DATA: CheckinData = {
    effectSubmissionUsers: 1,
    effectSubmissionTimes: 1,
    userSubmissionTimes: 1,
    userSubmissionDays: 1,
    userConsecutiveSubmissionDays: 1,
};

const withFallback = (fallback?: Partial<CheckinData>): CheckinData => ({
    ...DEFAULT_CHECKIN_DATA,
    ...(fallback ?? {}),
});

const normalizeCheckinDayValue = (value: unknown): number => {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 1) {
        return 1;
    }
    return normalized;
};

const getCheckinRuntimeAPI = (): CheckinRuntimeAPI | null => {
    const api = APJS?.Checkin as unknown as CheckinRuntimeAPI | undefined;
    if (!api || typeof api.getCheckinData !== 'function') {
        return null;
    }
    return api;
};

/**
 * `Checkin` groups the common runtime calls for submission/check-in data.
 * It keeps default fallback handling close to the bridge so gameplay code can
 * stay focused on UI updates and state transitions.
 */
export const Checkin = {
    getCheckinData(
        scene: unknown,
        options?: CheckinRequestOptions,
        callbacks?: RequestCallbacks<CheckinData>
    ): void {
        const api = getCheckinRuntimeAPI();
        if (!api) {
            console.log('[Checkin] getCheckinData skipped: runtime API unavailable');
            callbacks?.onSuccess?.(withFallback(options?.fallback));
            return;
        }
        api.getCheckinData(scene, options, callbacks);
    },

    formatCheckinDayText(data: Pick<CheckinData, 'userSubmissionDays'>): string {
        return `打卡第${normalizeCheckinDayValue(data.userSubmissionDays)}天`;
    },
};

/**
 * Convenience exports keep generated code terse and readable.
 */
export function getCheckinData(
    scene: unknown,
    options?: CheckinRequestOptions,
    callbacks?: RequestCallbacks<CheckinData>
): void {
    Checkin.getCheckinData(scene, options, callbacks);
}

export function formatCheckinDayText(data: Pick<CheckinData, 'userSubmissionDays'>): string {
    return Checkin.formatCheckinDayText(data);
}
