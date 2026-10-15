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

type RankingListRef = {
    name?: string;
    score?: number;
    sortingOrder?: number;
    entity?: {
        visible?: boolean;
    } | null;
};

type RankingListScript = {
    className?: string;
    name?: string;
    score?: number;
    sortingOrder?: number;
    constructor?: { name?: string };
    ref?: RankingListRef | null;
};

type SceneLike = {
    sys?: { engineScene?: SceneLike | null };
    entities?: unknown;
    scene?: SceneLike | null;
    getAllSceneObjects?: () => SceneObjectLike[];
    getSceneObject?: () => SceneObjectLike | null;
    findSceneObject?: (id: string) => SceneObjectLike | null;
};

type SceneObjectLike = {
    enabled: boolean;
    scene?: SceneLike | null;
    getComponents?: (type?: string) => unknown[];
    getComponent?: (type?: string) => unknown;
};

type RankingListComponent = {
    path?: string;
    getSceneObject?: () => SceneObjectLike | null;
    getScript?: () => RankingListScript | null;
    setProperty?: (name: string, value: unknown) => void;
};

const TOP_RENDER_ORDER = 100000;

const toArray = <T>(list: unknown): T[] => {
    if (!list) return [];
    if (Array.isArray(list)) return list as T[];
    const indexed = list as { size?: () => number; get?: (i: number) => T } | null;
    const size = typeof indexed?.size === 'function' ? indexed.size() : 0;
    if (typeof indexed?.get !== 'function' || size <= 0) return [];
    const out: T[] = [];
    for (let i = 0; i < size; i++) out.push(indexed.get(i));
    return out;
};

const resolveEngineScene = (sceneLike: unknown): SceneLike | null => {
    if (!sceneLike || typeof sceneLike !== 'object') return null;
    const carrier = sceneLike as SceneLike;
    if (carrier.sys?.engineScene) return carrier.sys.engineScene;
    if (typeof carrier.getAllSceneObjects === 'function' || carrier.entities !== undefined) return carrier;
    const sceneFromComponent = carrier.getSceneObject?.()?.scene;
    if (sceneFromComponent) return sceneFromComponent;
    if (carrier.scene) return carrier.scene;
    return null;
};

const isGameRankingListScript = (jsScript: RankingListScript | null | undefined): boolean => {
    if (!jsScript) return false;
    const names = [
        jsScript.className,
        jsScript.name,
        jsScript.constructor?.name,
        jsScript.ref?.name,
    ];
    return names.some(name =>
        name === 'GameRankingList'
        || name === 'CGGameRankingList'
        || name === 'CGGroupGameRankingList'
    );
};

const isGameRankingListComponent = (comp: RankingListComponent | null | undefined): comp is RankingListComponent => {
    if (!comp) return false;
    if (isGameRankingListScript(comp.getScript?.() ?? null)) {
        return true;
    }
    if (typeof comp.path === 'string' && comp.path.endsWith('GameRankingList.js')) {
        return true;
    }
    return false;
};

const getSceneObjectComponents = (sceneObject: SceneObjectLike | null): RankingListComponent[] => {
    if (!sceneObject) return [];
    const list = toArray<RankingListComponent>(sceneObject.getComponents?.('JSScriptComponent'));
    const single = sceneObject.getComponent?.('JSScriptComponent') as RankingListComponent | null | undefined;
    if (single && list.indexOf(single) < 0) {
        list.push(single);
    }
    return list;
};

const findGameRankingListComponent = (sceneLike: unknown): RankingListComponent | null => {
    const engineScene = resolveEngineScene(sceneLike);
    if (!engineScene) return null;

    const sceneObjects =
        typeof engineScene.getAllSceneObjects === 'function'
            ? engineScene.getAllSceneObjects()
            : toArray<SceneObjectLike>(engineScene.entities);
    for (const sceneObject of sceneObjects) {
        if (!sceneObject) continue;
        const comps = getSceneObjectComponents(sceneObject);
        for (const comp of comps) {
            if (isGameRankingListComponent(comp)) {
                return comp;
            }
        }
    }
    return null;
};

const setGameRankingListObjectEnabled = (sceneLike: unknown, enabled: boolean): boolean => {
    const sceneObject = findGameRankingListComponent(sceneLike)?.getSceneObject?.();
    if (!sceneObject) return false;
    sceneObject.enabled = enabled;
    return true;
};

const findGameRankingListRef = (sceneLike: unknown): RankingListRef | null => {
    const comp = findGameRankingListComponent(sceneLike);
    if (!comp) return null;
    const script = comp.getScript?.() ?? null;
    if (isGameRankingListScript(script)) {
        return script?.ref ?? null;
    }
    return null;
};

const setScriptProperty = (
    sceneLike: unknown,
    propertyName: 'score' | 'sortingOrder',
    value: number
): boolean => {
    const comp = findGameRankingListComponent(sceneLike);
    if (!comp) {
        console.warn(`[Game2DRankingList] ${propertyName} update failed: component not found`);
        return false;
    }
    let didSet = false;
    if (typeof comp.setProperty === 'function') {
        comp.setProperty(propertyName, value);
        didSet = true;
    }
    const ref = findGameRankingListRef(sceneLike);
    if (ref && propertyName in ref) {
        (ref as Record<string, unknown>)[propertyName] = value;
        didSet = true;
    }
    const script = comp.getScript?.() ?? null;
    if (script && propertyName in script) {
        (script as Record<string, unknown>)[propertyName] = value;
        didSet = true;
    }
    if (!didSet) {
        console.warn(`[Game2DRankingList] ${propertyName} update failed: setter not found`);
        return false;
    }
    console.log(`[Game2DRankingList] ${propertyName} set to ${String(value)}`);
    return true;
};

const bringToTop = (sceneLike: unknown): boolean => {
    const didSet = setScriptProperty(sceneLike, 'sortingOrder', TOP_RENDER_ORDER);
    return didSet;
};

const setRankingListVisible = (sceneLike: unknown, ref: RankingListRef | null, visible: boolean): boolean => {
    bringToTop(sceneLike);
    if (ref?.entity) {
        ref.entity.visible = visible;
        return true;
    }
    console.warn(`[Game2DRankingList] ${visible ? 'show' : 'hide'} failed: ref.entity not found`);
    return false;
};

const hideRankingList = (sceneLike: unknown): boolean => {
    return setRankingListVisible(sceneLike, findGameRankingListRef(sceneLike), false);
};

export const game2DRankingList: Game2DRankingListAPI = {
    getRef(scene: unknown) {
        return findGameRankingListRef(scene);
    },
    setScore(scene: unknown, score: number) {
        return setScriptProperty(scene, 'score', score);
    },
    show(scene: unknown) {
        setGameRankingListObjectEnabled(scene, true);
        const ref = findGameRankingListRef(scene);
        return setRankingListVisible(scene, ref, true);
    },
    hide(scene: unknown) {
        setGameRankingListObjectEnabled(scene, false);
        return hideRankingList(scene);
    },
};
