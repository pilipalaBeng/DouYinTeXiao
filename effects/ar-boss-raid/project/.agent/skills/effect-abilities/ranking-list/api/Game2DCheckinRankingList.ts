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

export const CheckinRankingListType = {
    Nation: 0,
    Friend: 1,
} as const;

export type CheckinRankingListType = (typeof CheckinRankingListType)[keyof typeof CheckinRankingListType];

type CheckinRankingScore = {
    score?: number;
    [key: string]: unknown;
};

type CheckinRankingUser = {
    uid?: string | number;
    uidStr?: string;
    name?: string;
    avatar?: unknown;
    avatar_path?: string;
    detail_struct?: CheckinRankingScore | null;
    [key: string]: unknown;
};

export type CheckinRankingListRef = {
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

type CheckinRankingListScript = {
    className?: string;
    name?: string;
    listType?: number;
    scoreUnit?: string;
    sortingOrder?: number;
    constructor?: {
        name?: string;
    };
    ref?: CheckinRankingListRef | null;
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

type CheckinRankingListComponent = {
    path?: string;
    getSceneObject?: () => SceneObjectLike | null;
    getScript?: () => CheckinRankingListScript | null;
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

const isCheckinRankingListScript = (jsScript: CheckinRankingListScript | null | undefined): boolean => {
    if (!jsScript) return false;
    const names = [
        jsScript.className,
        jsScript.name,
        jsScript.constructor?.name,
        jsScript.ref?.className,
        jsScript.ref?.name,
        jsScript.ref?.constructor?.name,
    ];
    return names.some(name =>
        name === 'CheckinRankingList'
        || name === 'CGCheckinRankingList'
    );
};

const isCheckinRankingListComponent = (
    comp: CheckinRankingListComponent | null | undefined
): comp is CheckinRankingListComponent => {
    if (!comp) return false;
    if (isCheckinRankingListScript(comp.getScript?.() ?? null)) {
        return true;
    }
    if (
        typeof comp.path === 'string'
        && (comp.path.endsWith('CheckinRankingList.js'))
    ) {
        return true;
    }
    return false;
};

const getSceneObjectComponents = (sceneObject: SceneObjectLike | null): CheckinRankingListComponent[] => {
    if (!sceneObject) return [];
    const list = toArray<CheckinRankingListComponent>(sceneObject.getComponents?.('JSScriptComponent'));
    const single = sceneObject.getComponent?.('JSScriptComponent') as CheckinRankingListComponent | null | undefined;
    if (single && list.indexOf(single) < 0) {
        list.push(single);
    }
    return list;
};

const findCheckinRankingListComponent = (sceneLike: unknown): CheckinRankingListComponent | null => {
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
            if (isCheckinRankingListComponent(comp)) {
                return comp;
            }
        }
    }
    console.warn(`[CheckinRankingList] findComponent failed: component not found`);
    return null;
};

const setCheckinRankingListObjectEnabled = (sceneLike: unknown, enabled: boolean): boolean => {
    const sceneObject = findCheckinRankingListComponent(sceneLike)?.getSceneObject?.();
    if (!sceneObject) return false;
    sceneObject.enabled = enabled;
    return true;
};

const findCheckinRankingListRef = (sceneLike: unknown): CheckinRankingListRef | null => {
    const comp = findCheckinRankingListComponent(sceneLike);
    if (!comp) return null;
    const script = comp.getScript?.() ?? null;
    if (isCheckinRankingListScript(script)) {
        return script?.ref ?? (script as unknown as CheckinRankingListRef | null);
    }
    return null;
};

const setScriptProperty = (
    sceneLike: unknown,
    propertyName: 'listType' | 'scoreUnit' | 'sortingOrder',
    value: number | string
): boolean => {
    const comp = findCheckinRankingListComponent(sceneLike);
    if (!comp) {
        console.warn(`[CheckinRankingList] ${propertyName} update failed: component not found`);
        return false;
    }
    let didSet = false;
    if (typeof comp.setProperty === 'function') {
        comp.setProperty(propertyName, value);
        didSet = true;
    }
    const ref = findCheckinRankingListRef(sceneLike);
    if (ref && propertyName in ref) {
        (ref as Record<string, unknown>)[propertyName] = value;
        didSet = true;
    }
    if (propertyName === 'listType' && ref && '_listType' in ref) {
        (ref as Record<string, unknown>)._listType = value;
        didSet = true;
    }
    const script = comp.getScript?.() ?? null;
    if (script && propertyName in script) {
        (script as Record<string, unknown>)[propertyName] = value;
        didSet = true;
    }
    if (!didSet) {
        console.warn(`[CheckinRankingList] ${propertyName} update failed: setter not found`);
        return false;
    }
    console.log(`[CheckinRankingList] ${propertyName} set to ${String(value)}`);
    return true;
};

const bringToTop = (sceneLike: unknown): boolean => {
    const didSet = setScriptProperty(sceneLike, 'sortingOrder', TOP_RENDER_ORDER);
    return didSet;
};

const setVisible = (sceneLike: unknown, ref: CheckinRankingListRef | null, visible: boolean): boolean => {
    bringToTop(sceneLike);
    if (ref?.showUI) {
        ref.showUI(visible);
        return true;
    }
    if (ref?._rootEntity) {
        ref._rootEntity.visible = visible;
        return true;
    }
    console.warn(`[CheckinRankingList] ${visible ? 'show' : 'hide'} failed: root entity not found`);
    return false;
};

const hideRankingList = (sceneLike: unknown): boolean => {
    return setVisible(sceneLike, findCheckinRankingListRef(sceneLike), false);
};

export const checkinRankingList: CheckinRankingListAPI = {
    getRef(scene: unknown) {
        return findCheckinRankingListRef(scene);
    },
    setListType(scene: unknown, listType: CheckinRankingListType) {
        return setScriptProperty(scene, 'listType', listType);
    },
    setScoreUnit(scene: unknown, scoreUnit: string) {
        return setScriptProperty(scene, 'scoreUnit', scoreUnit);
    },
    show(scene: unknown) {
        setCheckinRankingListObjectEnabled(scene, true);
        const ref = findCheckinRankingListRef(scene);
        return setVisible(scene, ref, true);
    },
    hide(scene: unknown) {
        setCheckinRankingListObjectEnabled(scene, false);
        return hideRankingList(scene);
    },
};

export function getCheckinRankingListRef(scene: unknown): CheckinRankingListRef | null {
    return checkinRankingList.getRef(scene);
}

export function setCheckinRankingListType(scene: unknown, listType: CheckinRankingListType): boolean {
    return checkinRankingList.setListType(scene, listType);
}

export function setCheckinRankingListScoreUnit(scene: unknown, scoreUnit: string): boolean {
    return checkinRankingList.setScoreUnit(scene, scoreUnit);
}

export function showCheckinRankingList(scene: unknown): boolean {
    return checkinRankingList.show(scene);
}

export function hideCheckinRankingList(scene: unknown): boolean {
    return checkinRankingList.hide(scene);
}
