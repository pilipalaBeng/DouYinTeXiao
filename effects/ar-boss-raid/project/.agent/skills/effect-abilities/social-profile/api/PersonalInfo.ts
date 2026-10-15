/**
 * Personal info runtime helper for generated gameplay scripts.
 *
 * Use this only when the design explicitly needs personal, friend, follower,
 * or fan profile information/avatar content. Import `getPersonalInfo` and
 * `PersonalTargetType` from `./PersonalInfo`.
 *
 * Runtime usage:
 * - Import `getPersonalInfo` and `PersonalTargetType` from this adapter.
 * - Show the scene-builder fallback avatar first; replace it with
 *   `avatarTexture` only after `getPersonalInfo(...)` succeeds.
 * - For one placeholder avatar, use a neutral placeholder-avatar style: dark
 *   gray background, light gray bust silhouette, soft circular head area, and
 *   a centered large white number `1`.
 * - Fill only the requested text fields and never hardcode fake profile strings
 *   or fake avatar URLs.
 * - Never modify this adapter from generated gameplay code; only call it.
 */

export type RequestCallbacks<TResponse> = {
    onSuccess?: (value: TResponse) => void;
    onError?: (error: Error) => void;
};

export type PersonalAvatarTexture = unknown;

export const PersonalTargetType = {
    Self: 0,
    Friend: 1,
    Follower: 2,
    Fan: 3,
} as const;

export type PersonalTargetType = (typeof PersonalTargetType)[keyof typeof PersonalTargetType];

export type PersonalTextField =
    | 'nickname'
    | 'gender'
    | 'age'
    | 'zodiac'
    | 'birthday'
    | 'constellation'
    | 'profile'
    | 'city'
    | 'school'
    | 'uid'
    | 'obfuscatedUid';

type RawPersonalInfo = {
    avatar?: string | null;
    user_name?: string | null;
    gender?: string | number | null;
    age?: string | number | null;
    cn_zodiac?: string | null;
    birthday?: string | null;
    zodiac?: string | null;
    desc?: string | null;
    city?: string | null;
    school_name?: string | null;
    uid?: string | number | null;
    [key: string]: unknown;
};

export interface PersonalInfoData {
    nickname: string;
    gender: string;
    age: string;
    zodiac: string;
    birthday: string;
    constellation: string;
    profile: string;
    city: string;
    school: string;
    avatarUrl: string;
    avatarTexture: PersonalAvatarTexture | null;
    uid: string;
    obfuscatedUid: string;
    raw: RawPersonalInfo;
}

export interface PersonalInfoRequestOptions {
    targetType?: PersonalTargetType;
    intimacy?: number;
    appId?: number;
}

type PersonalInfoRuntimeAPI = {
    getPersonalInfo(
        scene: unknown,
        options?: PersonalInfoRequestOptions,
        callbacks?: RequestCallbacks<PersonalInfoData>
    ): void;
};

const getPersonalInfoRuntimeAPI = (): PersonalInfoRuntimeAPI | null => {
    const api = APJS?.PersonalInfo as unknown as PersonalInfoRuntimeAPI | undefined;
    if (!api || typeof api.getPersonalInfo !== 'function') {
        return null;
    }
    return api;
};

/**
 * `PersonalInfo` groups profile-text fields and avatar texture preparation in a
 * single call. The wrapper mirrors the runtime entry while presenting
 * generated scripts with a stable import path and data model.
 */
export const PersonalInfo = {
    getPersonalInfo(
        scene: unknown,
        options?: PersonalInfoRequestOptions,
        callbacks?: RequestCallbacks<PersonalInfoData>
    ): void {
        const api = getPersonalInfoRuntimeAPI();
        if (!api) {
            callbacks?.onError?.(new Error('[PersonalInfo] runtime API is unavailable'));
            return;
        }
        api.getPersonalInfo(scene, options, callbacks);
    },
};

/**
 * Convenience exports keep common call sites short and explicit.
 */
export function getPersonalInfo(
    scene: unknown,
    options?: PersonalInfoRequestOptions,
    callbacks?: RequestCallbacks<PersonalInfoData>
): void {
    PersonalInfo.getPersonalInfo(scene, options, callbacks);
}
