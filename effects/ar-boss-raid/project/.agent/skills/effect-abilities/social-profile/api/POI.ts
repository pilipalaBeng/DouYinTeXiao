/**
 * POI runtime helper for generated gameplay scripts.
 *
 * Use this only when the design explicitly needs real-world location text such
 * as country, province, city, or district. Import `getPoiInfo` from `./POI`.
 *
 * Runtime usage:
 * - Prepare normal text carriers in the scene.
 * - Call `getPoiInfo(scene, callbacks)` and fill only the location fields the
 *   design actually needs.
 * - On completion, keep fetched location text or the scene fallback text.
 * - Never modify this adapter from generated gameplay code; only call it.
 */

export type RequestCallbacks<TResponse> = {
    onSuccess?: (value: TResponse) => void;
    onError?: (error: Error) => void;
};

export type POIType = 'country' | 'province' | 'city' | 'district';

export interface POIInfo {
    country: string;
    province: string;
    city: string;
    district: string;
}

type POIRuntimeAPI = {
    getPoiInfo(scene: unknown, callbacks?: RequestCallbacks<POIInfo>): void;
};

const getPOIRuntimeAPI = (): POIRuntimeAPI | null => {
    const api = APJS?.POI as unknown as POIRuntimeAPI | undefined;
    if (!api || typeof api.getPoiInfo !== 'function') {
        return null;
    }
    return api;
};

/**
 * `POI` exposes the runtime location capability through a stable helper object.
 * Generated game scripts can call `POI.getPoiInfo(...)` without caring where
 * the underlying implementation comes from.
 */
export const POI = {
    getPoiInfo(scene: unknown, callbacks?: RequestCallbacks<POIInfo>): void {
        const api = getPOIRuntimeAPI();
        if (!api) {
            callbacks?.onError?.(new Error('[POI] runtime API is unavailable'));
            return;
        }
        api.getPoiInfo(scene, callbacks);
    },
};

/**
 * Convenience function for the common "fetch once and fill text" flow.
 * This mirrors the static method shape while keeping call sites lightweight.
 */
export function getPoiInfo(scene: unknown, callbacks?: RequestCallbacks<POIInfo>): void {
    POI.getPoiInfo(scene, callbacks);
}
