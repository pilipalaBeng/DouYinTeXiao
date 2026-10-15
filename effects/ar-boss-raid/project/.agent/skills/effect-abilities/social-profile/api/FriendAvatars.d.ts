/**
 * Friend avatars runtime helper for generated gameplay scripts.
 *
 * Use this only when the design explicitly needs multiple friend/following/fan
 * avatar images as runtime image assets, such as 好友头像墙、头像轮播、随机好友头像展示
 * or avatar-driven game elements. Import `getFriendAvatars` and the required
 * types from `./FriendAvatars`.
 *
 * Runtime usage rules:
 * - Show local fallback avatar visuals first. For multi-friend displays, use 5
 *   neutral placeholder variants with dark gray background, light gray bust
 *   silhouette, soft circular head area, and centered white numbers `1` to `5`.
 * - Call `getFriendAvatars(scene, {scene: FriendAvatarScene.Friend, count}, callbacks)`.
 * - Replace displayed placeholders with returned `friend.texture`; use
 *   `friend.nickname` only when the design needs friend names.
 * - Do NOT pass downloaded file paths to Game2D `setTexture(...)`; use the
 *   returned runtime texture directly.
 * - Keep carousel/scrolling/swapping behavior in gameplay code.
 * - Never modify this adapter from generated gameplay code; only call it.
 */
export declare type RequestCallbacks<TResponse> = {
    onSuccess?: (value: TResponse) => void;
    onError?: (error: Error) => void;
};
export interface FriendAvatarInfo {
    nickname: string;
    texture: unknown;
}
export declare const FriendAvatarScene: {
    /** FriendList.js 中 `FRIEND_SCENE.FRIEND = 0`。 */
    readonly Friend: 0;
    /** FriendList.js 中 `FRIEND_SCENE.FOLLOWING = 2`。 */
    readonly Following: 2;
    /** FriendList.js 中 `FRIEND_SCENE.FAN = 3`。 */
    readonly Fan: 3;
};
export declare type FriendAvatarScene = (typeof FriendAvatarScene)[keyof typeof FriendAvatarScene];
export interface FriendAvatarRequestOptions {
    /** 0=好友，2=关注的人，3=粉丝。默认 0。 */
    scene?: FriendAvatarScene;
    /** Desired count. Runtime requests at least 50 then returns at most this count. */
    count?: number;
}
/**
 * `FriendAvatars` exposes friend/following/fan avatar material preparation.
 * It intentionally does not implement carousel/scroll/gameplay behavior.
 */
export declare const FriendAvatars: {
    getFriendAvatars(scene: unknown, options?: FriendAvatarRequestOptions, callbacks?: RequestCallbacks<FriendAvatarInfo[]>): void;
};
export declare function getFriendAvatars(scene: unknown, options?: FriendAvatarRequestOptions, callbacks?: RequestCallbacks<FriendAvatarInfo[]>): void;
