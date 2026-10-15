/**
 * Mandatory runtime adapter for built-in game leaderboard scenes.
 * Import `game2DRankingList` from `./Game2DRankingList` for leaderboard control.
 *
 * If gameplay uses a built-in `GameRankingListJS`, generated scripts must import
 * `game2DRankingList` from `./Game2DRankingList` instead of controlling the
 * ranking-list scene object or component directly.
 *
 * Required flow:
 * - hide in initial setup
 * - hide again on every RecordStart / full reset
 * - setScore with the final comparable result before the first show in settlement
 */
export interface Game2DRankingListAPI {
    /** Find the underlying GameRankingList ref if the component exists. */
    getRef(scene: unknown): RankingListRef | null;
    /** Set the final score before the first settlement-phase show call. */
    setScore(scene: unknown, score: number): boolean;
    show(scene: unknown): boolean;
    hide(scene: unknown): boolean;
}
declare type RankingListRef = {
    name?: string;
    score?: number;
    sortingOrder?: number;
    entity?: {
        visible?: boolean;
    } | null;
};
export declare const game2DRankingList: Game2DRankingListAPI;
export {};
