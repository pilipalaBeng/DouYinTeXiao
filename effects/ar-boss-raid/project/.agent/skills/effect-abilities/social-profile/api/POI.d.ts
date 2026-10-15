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
export declare type RequestCallbacks<TResponse> = {
    onSuccess?: (value: TResponse) => void;
    onError?: (error: Error) => void;
};
export declare type POIType = 'country' | 'province' | 'city' | 'district';
export interface POIInfo {
    country: string;
    province: string;
    city: string;
    district: string;
}
/**
 * `POI` exposes the runtime location capability through a stable helper object.
 * Generated game scripts can call `POI.getPoiInfo(...)` without caring where
 * the underlying implementation comes from.
 */
export declare const POI: {
    getPoiInfo(scene: unknown, callbacks?: RequestCallbacks<POIInfo>): void;
};
/**
 * Convenience function for the common "fetch once and fill text" flow.
 * This mirrors the static method shape while keeping call sites lightweight.
 */
export declare function getPoiInfo(scene: unknown, callbacks?: RequestCallbacks<POIInfo>): void;
