/**
 * Runtime adapter for built-in check-in leaderboard scenes.
 * Import its helpers from `./Game2DCheckinRankingList`.
 */
export interface CheckinRankingListAPI {
    /** Find the underlying CheckinRankingList script ref if the component exists. */
    getRef(scene: unknown): CheckinRankingListRef | null;
    /** Switch displayed list type. 0 = national, 1 = friend. */
    setListType(scene: unknown, listType: CheckinRankingListType): boolean;
    /** Update score unit text, for example "天". */
    setScoreUnit(scene: unknown, scoreUnit: string): boolean;
    show(scene: unknown): boolean;
    hide(scene: unknown): boolean;
}
export declare const CheckinRankingListType: {
    readonly Nation: 0;
    readonly Friend: 1;
};
export declare type CheckinRankingListType = (typeof CheckinRankingListType)[keyof typeof CheckinRankingListType];
declare type CheckinRankingScore = {
    score?: number;
    [key: string]: unknown;
};
declare type CheckinRankingUser = {
    uid?: string | number;
    uidStr?: string;
    name?: string;
    avatar?: unknown;
    avatar_path?: string;
    detail_struct?: CheckinRankingScore | null;
    [key: string]: unknown;
};
export declare type CheckinRankingListRef = {
    name?: string;
    className?: string;
    scoreUnit?: string;
    listType?: number;
    sortingOrder?: number;
    _listType?: number;
    _nationalRank?: number;
    _friendsRank?: number;
    _nationalListData?: CheckinRankingUser[];
    _friendsListData?: CheckinRankingUser[];
    _selfInfo?: CheckinRankingUser | null;
    _rootEntity?: {
        visible?: boolean;
    } | null;
    showUI?: (visible: boolean) => void;
    constructor?: {
        name?: string;
    };
};
export declare const checkinRankingList: CheckinRankingListAPI;
export declare function getCheckinRankingListRef(scene: unknown): CheckinRankingListRef | null;
export declare function setCheckinRankingListType(scene: unknown, listType: CheckinRankingListType): boolean;
export declare function setCheckinRankingListScoreUnit(scene: unknown, scoreUnit: string): boolean;
export declare function showCheckinRankingList(scene: unknown): boolean;
export declare function hideCheckinRankingList(scene: unknown): boolean;
export {};
