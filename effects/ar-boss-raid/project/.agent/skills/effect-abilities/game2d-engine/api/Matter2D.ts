/**
 * Matter2D.ts - Matter-like physics adapter built on APJS 2D physics components
 *
 * Recommended usage:
 * 1) import { install } from './Matter2D'
 * 2) call install(this) inside a Scene before using this.matter2d / GameObject.onCollide / GameObject.onOverlap
 */

import { EventEmitter, GameObject, Group, Scene } from './Game2D';

// ----------------------------------------------------------------------------
// Matter2D (Matter-like wrapper directly on APJS)
//
// Notes:
// - This is NOT Phaser Matter. It is a small, stable API surface built on top of
//   APJS RigidBody2D / Collider2D components.
// - Bodies/colliders must be pre-attached in SceneBuilder.
// - Collision APIs support both pair-based rules and EventManager-backed event listeners.
// ----------------------------------------------------------------------------

export type Matter2DCollisionEventName = 'collisionstart' | 'collisionactive' | 'collisionend';

export type Matter2DVector = {x: number; y: number};

export interface Matter2DScaleColliderOptions {
    /**
     * Which collider shape to sync.
     * - `auto`: sync any collider exposing `size`, `radius`, or `points`
     * - `box`: sync only colliders exposing `size`
     * - `circle`: sync only colliders exposing `radius`
     * - `edge`: sync only colliders exposing `points` without polygon decomposition data
     * - `polygon`: sync only colliders exposing `points` with polygon decomposition data
     */
    type?: 'auto' | 'box' | 'circle' | 'edge' | 'polygon';
    /** Optional APJS-native tangible override while syncing. */
    isTangible?: boolean;
}

export type Matter2DColliderInfo = {
    index: number;
    /** Whether this collider blocks physically. false behaves like overlap/pass-through. */
    isTangible?: boolean;
    enabled?: boolean;
    /** Box-like size, in pixels (if collider exposes `size`). */
    width?: number;
    height?: number;
    /** Circle-like radius, in pixels (if collider exposes `radius`). */
    radius?: number;
    /** Offset in pixels (if collider exposes `offset`). */
    offsetX?: number;
    offsetY?: number;
};

/**
 * Lightweight collider wrapper.
 *
 * This intentionally keeps the "collider" concept explicit (aligned with SceneBuilder),
 * while still living under the Phaser-like `scene.matter2d` entry point.
 */
export class Matter2DCollider {
    readonly gameObject: GameObject;
    readonly index: number;
    private readonly plugin: Matter2DPlugin;

    constructor(plugin: Matter2DPlugin, gameObject: GameObject, index: number) {
        this.plugin = plugin;
        this.gameObject = gameObject;
        this.index = index;
    }

    /** Returns a serializable snapshot for debugging (pixel units, fixed 32px = 1 world unit). */
    getInfo(): Matter2DColliderInfo {
        const list = this.plugin.getColliderInfo(this.gameObject);
        return list[this.index] ?? {index: this.index};
    }

    private getRaw(): any | null {
        const raw = this.plugin.getColliders(this.gameObject);
        return (this.index >= 0 && this.index < raw.length) ? raw[this.index] : null;
    }

    /**
     * Sets whether this collider is tangible.
     */
    setTangible(isTangible: boolean): this {
        const c: any = this.getRaw();
        if (c && c.isTangible !== undefined) {
            c.isTangible = isTangible;
        }
        return this;
    }

    /**
     * Best-effort enable/disable of the collider component.
     * This maps to the inherited `Component.enabled` property in APJS.
     */
    setEnabled(enabled: boolean): this {
        const c: any = this.getRaw();
        if (c && c.enabled !== undefined) {
            c.enabled = enabled;
        }
        return this;
    }

    /** Set box size in pixels. Internally converts using fixed 32px = 1 world unit. No-op for non-box colliders. */
    setSize(width: number, height: number): this {
        const c: any = this.getRaw();
        if (c && c.size !== undefined) {
            c.size = new APJS.Vector2f(width / 32, height / 32);
        }
        return this;
    }

    /** Set collider offset in pixels. Internally converts using fixed 32px = 1 world unit. */
    setOffset(x: number, y: number): this {
        const c: any = this.getRaw();
        if (c && c.offset !== undefined) {
            c.offset = new APJS.Vector2f(x / 32, -y / 32);
        }
        return this;
    }

    /** Set circle radius in pixels. Internally converts using fixed 32px = 1 world unit. No-op for non-circle colliders. */
    setRadius(r: number): this {
        const c: any = this.getRaw();
        if (c && c.radius !== undefined) {
            c.radius = r / 32;
        }
        return this;
    }
}

type Matter2DObjectSource = GameObject | GameObject[] | Group<GameObject>;

type Matter2DCollisionMode = 'collide' | 'overlap';

export type Matter2DCollisionCallbacks = {
    onStart?: (event: Matter2DCollisionEvent) => void;
    onActive?: (event: Matter2DCollisionEvent) => void;
    onEnd?: (event: Matter2DCollisionEvent) => void;
};

export type Matter2DCollisionEvent = {
    gameObjectA: GameObject;
    gameObjectB: GameObject | null;
    collisionInfo?: any;
    bodyA?: Matter2DBody;
    bodyB?: Matter2DBody;
};

export type Matter2DCollisionListenOptions = {
    /**
     * Optional dynamic target filter.
     *
     * When provided, only collisions against these current objects are forwarded. This is
     * resolved on every event, so future clones added into a Group are automatically included.
     */
    targets?: Matter2DObjectSource;
    /**
     * Optional semantic filter after GameObject adaptation.
     *
     * Useful for name/tag/style-based routing when listening to "all collisions" on one object.
     */
    filter?: (event: Matter2DCollisionEvent) => boolean;
};

export type Matter2DCollisionSubscription = {
    off: () => void;
};

class Matter2DInternals {
    static toForceMode(mode: 'force' | 'acceleration' | 'impulse' | 'velocityChange'): any {
        const FM = (APJS as any).ForceMode2D;
        if (FM) {
            if (mode === 'force') return FM.Force;
            if (mode === 'acceleration') return FM.Acceleration;
            if (mode === 'impulse') return FM.Impulse;
            if (mode === 'velocityChange') return FM.VelocityChange;
        }
        if (mode === 'force') return 0;
        if (mode === 'acceleration') return 1;
        if (mode === 'impulse') return 2;
        return 3;
    }

    static isNullGuid(guid: any): boolean {
        if (guid === null || guid === undefined) return true;
        if (typeof guid === 'string') return guid.length === 0 || guid === 'null';
        if (typeof guid.toString === 'function') return guid.toString() === 'null';
        return false;
    }

    static getColliders2D(sceneObject: any): any[] {
        if (!sceneObject || typeof sceneObject.getComponents !== 'function') {
            return [];
        }

        const colliders: any[] = [];
        try {
            const all = sceneObject.getComponents();
            for (const c of all) {
                if (!c) continue;
                const Base = (APJS as any).Collider2D;
                if (Base && c instanceof Base) {
                    colliders.push(c);
                    continue;
                }
                if (typeof (c as any).registerHitEventCallback === 'function') {
                    colliders.push(c);
                }
            }
        } catch {
            // ignore
        }
        return colliders;
    }

    /** Returns whether a collider is tangible (defaults to true when the property is unknown). */
    static isColliderTangible(collider: any): boolean {
        if (!collider) return true;
        const v = (collider as any).isTangible;
        if (v === undefined) return true;
        return !!v;
    }

    /**
     * Determines whether the current `mode` should fire given the (self, other) collider pair.
     *
     * Semantics:
     * - `collide`: only when **both colliders are tangible**.
     * - `overlap`: only when **at least one collider is non-tangible** (sensor/pass-through).
     *
     * When `otherCollider` is unavailable (e.g. EventManager payloads that only expose the other
     * SceneObject), the filter falls back to a best-effort check using `selfCollider` only:
     * - `collide` requires self to be tangible (otherwise it cannot be a tangible collision);
     * - `overlap` cannot be ruled out and is allowed through.
     */
    static modeAllows(mode: Matter2DCollisionMode, selfCollider: any, otherCollider?: any): boolean {
        const a = Matter2DInternals.isColliderTangible(selfCollider);
        if (otherCollider === undefined || otherCollider === null) {
            return mode === 'collide' ? a : true;
        }
        const b = Matter2DInternals.isColliderTangible(otherCollider);
        return mode === 'collide' ? (a && b) : (!a || !b);
    }

}

export class Matter2DBody {
    readonly gameObject: GameObject;
    /** Underlying APJS.RigidBody2D (internal only). */
    private readonly _raw: any;
    /** Collider list (escape hatch). */
    readonly parts: any[];
    /** Primary collider (escape hatch). */
    readonly part: any;

    constructor(gameObject: GameObject) {
        this.gameObject = gameObject;
        this._raw = gameObject.requireEngineComponent('RigidBody2D');
        const so = gameObject.getSceneObject();
        this.parts = so ? Matter2DInternals.getColliders2D(so) : [];
        this.part = this.parts.length > 0 ? this.parts[0] : null;
    }

    /**
     * Linear velocity in screen pixels per second (`+Y` down).
     */
    getVelocity(): Matter2DVector {
        const v: any = (this._raw as any).velocity;
        const vx = typeof v?.x === 'number' ? v.x : 0;
        const vy = typeof v?.y === 'number' ? v.y : 0;
        return {x: vx * 32, y: -vy * 32};
    }

    /**
     * Sets linear velocity in screen pixels per second (`+Y` down).
     */
    setVelocity(velocityPx: Matter2DVector): this {
        (this._raw as any).velocity = new APJS.Vector2f(velocityPx.x / 32, -velocityPx.y / 32);
        return this;
    }

    getAngularVelocity(): number {
        const v: any = (this._raw as any).angularVelocity;
        return typeof v === 'number' ? v : 0;
    }

    setAngularVelocity(value: number): this {
        (this._raw as any).angularVelocity = value;
        return this;
    }

    getStatic(): boolean {
        return !!(this._raw as any).static;
    }

    setStatic(value: boolean): this {
        (this._raw as any).static = value;
        return this;
    }

    getRotation(): number {
        const v: any = (this._raw as any).rotation;
        return typeof v === 'number' ? v : 0;
    }

    /**
     * Sets the rigid body's rotation in radians.
     */
    setRotation(angle: number): this {
        (this._raw as any).rotation = angle;
        return this;
    }

    getAllowGravity(): boolean {
        return !!(this._raw as any).useGravity;
    }

    setAllowGravity(value: boolean): this {
        (this._raw as any).useGravity = value;
        return this;
    }

    getGravityScale(): number {
        const v: any = (this._raw as any).gravityScale;
        return typeof v === 'number' ? v : 0;
    }

    setGravityScale(value: number): this {
        (this._raw as any).gravityScale = value;
        return this;
    }

    getMass(): number {
        const v: any = (this._raw as any).mass;
        return typeof v === 'number' ? v : 0;
    }

    setMass(value: number): this {
        (this._raw as any).mass = value;
        return this;
    }

    getFrictionAir(): number {
        const v: any = (this._raw as any).damping;
        return typeof v === 'number' ? v : 0;
    }

    setFrictionAir(value: number): this {
        (this._raw as any).damping = value;
        return this;
    }

    getAngularDamping(): number {
        const v: any = (this._raw as any).angularDamping;
        return typeof v === 'number' ? v : 0;
    }

    setAngularDamping(value: number): this {
        (this._raw as any).angularDamping = value;
        return this;
    }

    applyForce(forcePx: Matter2DVector, mode: 'force' | 'acceleration' | 'impulse' | 'velocityChange' = 'force'): this {
        const forceVec = new APJS.Vector2f(forcePx.x / 32, -forcePx.y / 32);
        const forceMode = Matter2DInternals.toForceMode(mode);
        const fn = (this._raw as any).addForce;
        if (typeof fn === 'function') {
            fn.call(this._raw, forceVec, forceMode);
        }
        return this;
    }

    getPosition(): {x: number; y: number} {
        const v: any = (this._raw as any).position;
        const w = this.gameObject.scene?.width ?? 0;
        const h = this.gameObject.scene?.height ?? 0;
        const xWorld = typeof v?.x === 'number' ? v.x : 0;
        const yWorld = typeof v?.y === 'number' ? v.y : 0;
        return {x: xWorld * 32 + w / 2, y: h / 2 - yWorld * 32};
    }

    setPosition(xPx: number, yPx: number): this {
        const w = this.gameObject.scene?.width ?? 0;
        const h = this.gameObject.scene?.height ?? 0;
        (this._raw as any).position = new APJS.Vector2f((xPx - w / 2) / 32, (h / 2 - yPx) / 32);
        return this;
    }

    applyTorque(value: number, mode: 'force' | 'acceleration' | 'impulse' | 'velocityChange' = 'force'): this {
        const fn = (this._raw as any).addTorque;
        if (typeof fn === 'function') {
            fn.call(this._raw, value, Matter2DInternals.toForceMode(mode));
        }
        return this;
    }
}

export class Matter2DAdd {
    private scene: Scene;
    private cache: WeakMap<GameObject, Matter2DBody>;

    constructor(scene: Scene, cache?: WeakMap<GameObject, Matter2DBody>) {
        this.scene = scene;
        this.cache = cache ?? new WeakMap();
    }

    sprite(x: number, y: number, templateId: string): Matter2DBody {
        const go = this.scene.add.sprite(x, y, templateId);
        return this.wrap(go);
    }

    existing(gameObject: GameObject): Matter2DBody {
        return this.wrap(gameObject);
    }

    private wrap(go: GameObject): Matter2DBody {
        const cached = this.cache.get(go);
        if (cached) return cached;
        const body = new Matter2DBody(go);
        this.cache.set(go, body);
        body.setPosition(go.x, go.y);
        return body;
    }
}

export class Matter2DWorld extends EventEmitter {
    private scene: Scene;
    private cache: WeakMap<GameObject, Matter2DBody>;

    constructor(scene: Scene, cache?: WeakMap<GameObject, Matter2DBody>) {
        super();
        this.scene = scene;
        this.cache = cache ?? new WeakMap();
    }

    /**
     * Pair-based solid collision rule.
     *
     * Best for static, known pairs or small fixed sets (e.g. player vs boss shield, key vs door).
     */
    addCollider(object1: Matter2DObjectSource, object2: Matter2DObjectSource, callbacks?: Matter2DCollisionCallbacks): void {
        this.register(object1, object2, 'collide', callbacks);
    }

    /**
     * Pair-based overlap rule.
     *
     * Best for static overlap pairs (e.g. player vs one score gate, player vs one button zone).
     */
    addOverlap(object1: Matter2DObjectSource, object2: Matter2DObjectSource, callbacks?: Matter2DCollisionCallbacks): void {
        this.register(object1, object2, 'overlap', callbacks);
    }

    /**
     * Event-style solid collision listener.
     *
     * Best for dynamic-spawn gameplay where object2 is not known up front (e.g. endless runner
     * obstacles, Flappy Bird pipes, bullets vs runtime-spawned enemies).
     */
    onCollide(
        object: Matter2DObjectSource,
        callbacks?: Matter2DCollisionCallbacks,
        options?: Matter2DCollisionListenOptions
    ): Matter2DCollisionSubscription {
        return this.listen(object, 'collide', callbacks, options);
    }

    /**
     * Event-style overlap listener.
     *
     * Best for pickups, score gates, checkpoints, sensors, and other overlap-heavy gameplay where
     * future spawned targets should be observed automatically.
     */
    onOverlap(
        object: Matter2DObjectSource,
        callbacks?: Matter2DCollisionCallbacks,
        options?: Matter2DCollisionListenOptions
    ): Matter2DCollisionSubscription {
        return this.listen(object, 'overlap', callbacks, options);
    }

    private register(object1: Matter2DObjectSource, object2: Matter2DObjectSource, mode: Matter2DCollisionMode, callbacks?: Matter2DCollisionCallbacks) {
        const list1 = this.resolveObjects(object1);
        const list2 = this.resolveObjects(object2);
        const targetGuids = this.collectGuids(list2);

        const emitEvent = (name: Matter2DCollisionEventName, self: GameObject, other: GameObject | null, collisionInfo?: any) => {
            const event: Matter2DCollisionEvent = {
                gameObjectA: self,
                gameObjectB: other,
                collisionInfo,
                bodyA: this.getBody(self),
                bodyB: other ? this.getBody(other) : undefined,
            };
            this.emit(name, event);
            return event;
        };

        const wrapper = {
            enter: (self: GameObject, other: GameObject | null, info?: any) => {
                const e = emitEvent('collisionstart', self, other, info);
                callbacks?.onStart?.(e);
            },
            stay: (self: GameObject, other: GameObject | null, info?: any) => {
                const e = emitEvent('collisionactive', self, other, info);
                callbacks?.onActive?.(e);
            },
            exit: (self: GameObject, other: GameObject | null, info?: any) => {
                const e = emitEvent('collisionend', self, other, info);
                callbacks?.onEnd?.(e);
            },
        };

        for (const o1 of list1) {
            const so1 = o1.getSceneObject();
            if (!so1) continue;
            const colliders1 = Matter2DInternals.getColliders2D(so1);
            for (const c1 of colliders1) {
                if (c1 && (c1 as any).emitCollisionEvent !== undefined) {
                    (c1 as any).emitCollisionEvent = true;
                }
                this.bindCallbacks(o1, c1, targetGuids, mode, wrapper);
            }
        }
    }

    private listen(
        object: Matter2DObjectSource,
        mode: Matter2DCollisionMode,
        callbacks?: Matter2DCollisionCallbacks,
        options?: Matter2DCollisionListenOptions
    ): Matter2DCollisionSubscription {
        const list = this.resolveObjects(object);

        const bindings: Array<{emitter: any; eventType: any; handler: (event: any) => void}> = [];

        const bind = (
            self: GameObject,
            selfCollider: any,
            eventType: any,
            eventName: Matter2DCollisionEventName,
            callback?: (event: Matter2DCollisionEvent) => void
        ) => {
            if (!selfCollider) return;
            const emitterFactory = (APJS as any).EventManager?.getObjectEmitter;
            const collisionEvents = (APJS as any).CollisionEvent2D;
            if (typeof emitterFactory !== 'function' || !collisionEvents) return;

            if ((selfCollider as any).emitCollisionEvent !== undefined) {
                (selfCollider as any).emitCollisionEvent = true;
            }

            const emitter = emitterFactory(selfCollider);
            if (!emitter || typeof emitter.on !== 'function') return;

            const handler = (event: any) => {
                const infos = Array.isArray(event?.args?.[0]) ? event.args[0] : [];
                for (const info of infos) {
                    const otherSo = info?.otherObject ?? null;
                    const otherGuid = otherSo ? this.guidOf(otherSo) : null;
                    const otherGo = otherGuid ? this.findGameObjectByGuid(otherGuid) : null;
                    const otherCollider = (info as any)?.otherCollider;
                    if (!Matter2DInternals.modeAllows(mode, selfCollider, otherCollider)) {
                        continue;
                    }
                    const collisionEvent = this.buildEvent(self, otherGo, info);
                    if (!this.matchesListenOptions(collisionEvent, options)) {
                        continue;
                    }
                    this.emit(eventName, collisionEvent);
                    callback?.(collisionEvent);
                }
            };

            emitter.on(eventType, handler, this);
            bindings.push({emitter, eventType, handler});
        };

        for (const self of list) {
            const so = self.getSceneObject();
            if (!so) continue;
            const colliders = Matter2DInternals.getColliders2D(so);
            const collisionEvents = (APJS as any).CollisionEvent2D;
            if (!collisionEvents) continue;
            for (const collider of colliders) {
                bind(self, collider, collisionEvents.Enter, 'collisionstart', callbacks?.onStart);
                bind(self, collider, collisionEvents.Stay, 'collisionactive', callbacks?.onActive);
                bind(self, collider, collisionEvents.Exit, 'collisionend', callbacks?.onEnd);
            }
        }

        return {
            off: () => {
                for (const binding of bindings) {
                    if (binding.emitter && typeof binding.emitter.off === 'function') {
                        binding.emitter.off(binding.eventType, binding.handler, this);
                    }
                }
            },
        };
    }

    private bindCallbacks(self: GameObject, selfCollider: any, targetGuids: Set<string>, mode: Matter2DCollisionMode, callbacks: {
        enter: (self: GameObject, other: GameObject | null, info?: any) => void;
        stay: (self: GameObject, other: GameObject | null, info?: any) => void;
        exit: (self: GameObject, other: GameObject | null, info?: any) => void;
    }) {
        const bind = (eventType: number, fn: (self: GameObject, other: GameObject | null, info?: any) => void) => {
            if (!fn) return;
            if (!selfCollider || typeof selfCollider.registerHitEventCallback !== 'function') return;
            selfCollider.registerHitEventCallback((_: any, otherCollider: any, collisionInfo: any) => {
                const otherSo = otherCollider && typeof otherCollider.getSceneObject === 'function' ? otherCollider.getSceneObject() : null;
                if (!otherSo) return;
                const guid = this.guidOf(otherSo);
                if (!guid || !targetGuids.has(guid)) return;
                if (!Matter2DInternals.modeAllows(mode, selfCollider, otherCollider)) return;
                const otherGo = this.findGameObjectByGuid(guid);
                fn(self, otherGo, collisionInfo);
            }, eventType);
        };

        bind(0, callbacks.enter);
        bind(1, callbacks.stay);
        bind(2, callbacks.exit);
    }

    private resolveObjects(source: any): GameObject[] {
        if (!source) return [];
        if (Array.isArray(source)) return source;
        if (typeof source.getChildren === 'function') {
            const children = source.getChildren();
            return Array.isArray(children) ? children : [];
        }
        return [source];
    }

    private collectGuids(objects: GameObject[]): Set<string> {
        const set = new Set<string>();
        for (const o of objects) {
            const so = o.getSceneObject();
            if (!so) continue;
            const guid = this.guidOf(so);
            if (guid) set.add(guid);
        }
        return set;
    }

    private guidOf(sceneObject: any): string | null {
        // Runtime clones are explicitly renamed in Game2D.add.sprite(). On some
        // preview runtimes cloned native guids may alias the template/source, so
        // prefer the SceneObject name for wrapper lookup and target filtering.
        if (sceneObject && sceneObject.name) return String(sceneObject.name);
        try {
            const native = sceneObject.getNative ? sceneObject.getNative() : null;
            if (native && native.guid !== undefined) return native.guid.toString();
        } catch {
            // ignore
        }
        return null;
    }

    private findGameObjectByGuid(guid: string): GameObject | null {
        const list = this.scene.sys.displayList.list;
        for (const go of list) {
            const so = (go as any).getSceneObject ? (go as any).getSceneObject() : null;
            if (!so) continue;
            const g = this.guidOf(so);
            if (g === guid) return go;
        }
        return null;
    }

    private buildEvent(self: GameObject, other: GameObject | null, collisionInfo?: any): Matter2DCollisionEvent {
        return {
            gameObjectA: self,
            gameObjectB: other,
            collisionInfo,
            bodyA: this.getBody(self),
            bodyB: other ? this.getBody(other) : undefined,
        };
    }

    private matchesListenOptions(
        event: Matter2DCollisionEvent,
        options?: Matter2DCollisionListenOptions
    ): boolean {
        if (!options) {
            return true;
        }

        if (options.targets !== undefined) {
            const other = event.gameObjectB;
            if (!other) {
                return false;
            }
            const otherSo = other.getSceneObject();
            const otherGuid = otherSo ? this.guidOf(otherSo) : null;
            if (!otherGuid) {
                return false;
            }
            const targetGuids = this.collectGuids(this.resolveObjects(options.targets));
            if (!targetGuids.has(otherGuid)) {
                return false;
            }
        }

        if (options.filter && !options.filter(event)) {
            return false;
        }

        return true;
    }

    private getBody(go: GameObject): Matter2DBody | undefined {
        const cached = this.cache.get(go);
        if (cached) return cached;
        try {
            const so = go.getSceneObject();
            if (!so) return undefined;
            const rb = go.getEngineComponent('RigidBody2D');
            if (!rb) return undefined;
            const body = new Matter2DBody(go);
            this.cache.set(go, body);
            return body;
        } catch {
            return undefined;
        }
    }
}

export class Matter2DPlugin {
    scene: Scene;
    add: Matter2DAdd;
    world: Matter2DWorld;

    constructor(scene: Scene) {
        this.scene = scene;
        const cache = new WeakMap<GameObject, Matter2DBody>();
        this.add = new Matter2DAdd(scene, cache);
        this.world = new Matter2DWorld(scene, cache);
    }

    /**
     * Returns the underlying engine collider components attached to a GameObject.
     * Prefer `colliders()` / `collider()` when possible.
     */
    getColliders(gameObject: GameObject): any[] {
        const so = gameObject.getSceneObject();
        return so ? Matter2DInternals.getColliders2D(so) : [];
    }

    /**
     * Returns lightweight collider wrappers for a GameObject.
     *
     * Notes:
     * - `index` is the collider's position in the engine-provided collider list.
     *   If you add/remove/reorder colliders in the scene, indices may change and scripts should be updated accordingly.
     * - `type` filtering is best-effort (box ~ has `size`, circle ~ has `radius`).
     */
    colliders(gameObject: GameObject, options?: {type?: 'auto' | 'box' | 'circle'}): Matter2DCollider[] {
        const type = options?.type ?? 'auto';
        const raw = this.getColliders(gameObject);
        const out: Matter2DCollider[] = [];
        for (let i = 0; i < raw.length; i++) {
            const c: any = raw[i];
            if (!c) continue;
            const isBox = c.size !== undefined;
            const isCircle = c.radius !== undefined;
            if (type === 'box' && !isBox) continue;
            if (type === 'circle' && !isCircle) continue;
            out.push(new Matter2DCollider(this, gameObject, i));
        }
        return out;
    }

    /** Returns the collider count for a GameObject (engine-provided list length). */
    colliderCount(gameObject: GameObject): number {
        return this.getColliders(gameObject).length;
    }

    /**
     * Convenience: returns one collider wrapper by index (default: 0), or null if missing.
     */
    collider(gameObject: GameObject, index: number = 0): Matter2DCollider | null {
        const raw = this.getColliders(gameObject);
        if (index < 0 || index >= raw.length) return null;
        return new Matter2DCollider(this, gameObject, index);
    }

    /**
     * Convenience: returns one collider wrapper by index (default: 0).
     * Throws if the collider is missing to make index-based assumptions explicit.
     */
    requireCollider(gameObject: GameObject, index: number = 0): Matter2DCollider {
        const c = this.collider(gameObject, index);
        if (c) return c;
        const so = gameObject.getSceneObject?.();
        const name = so && so.name ? String(so.name) : 'unknown';
        const count = this.colliderCount(gameObject);
        throw new Error(`[Matter2D] Missing collider at index=${index} on '${name}' (colliderCount=${count}). Please update the scene or script index assumptions.`);
    }

    /** Returns a serializable snapshot of collider properties (pixel units, fixed 32px = 1 world unit). */
    getColliderInfo(gameObject: GameObject): Matter2DColliderInfo[] {
        const colliders = this.getColliders(gameObject);
        return colliders.map((c, index) => {
            const info: Matter2DColliderInfo = {index};
            if (!c) return info;
            if ((c as any).isTangible !== undefined) info.isTangible = !!(c as any).isTangible;
            if ((c as any).enabled !== undefined) info.enabled = !!(c as any).enabled;
            if ((c as any).size !== undefined) {
                info.width = (c as any).size.x * 32;
                info.height = (c as any).size.y * 32;
            }
            if ((c as any).radius !== undefined) info.radius = (c as any).radius * 32;
            if ((c as any).offset !== undefined) {
                info.offsetX = (c as any).offset.x * 32;
                info.offsetY = -(c as any).offset.y * 32;
            }
            return info;
        });
    }
}

let gameObjectMatter2DSugarInstalled = false;

function installGameObjectMatter2DSugar() {
    if (gameObjectMatter2DSugarInstalled) return;
    gameObjectMatter2DSugarInstalled = true;

    (GameObject as any).prototype.onCollide = function(callbacks: Matter2DCollisionCallbacks, options?: Matter2DCollisionListenOptions): Matter2DCollisionSubscription {
        return this.scene.matter2d.world.onCollide(this, callbacks, options);
    };

    (GameObject as any).prototype.onOverlap = function(callbacks: Matter2DCollisionCallbacks, options?: Matter2DCollisionListenOptions): Matter2DCollisionSubscription {
        return this.scene.matter2d.world.onOverlap(this, callbacks, options);
    };
}

declare module './Game2D' {
    interface GameObject {
        onCollide(callbacks: Matter2DCollisionCallbacks, options?: Matter2DCollisionListenOptions): Matter2DCollisionSubscription;
        onOverlap(callbacks: Matter2DCollisionCallbacks, options?: Matter2DCollisionListenOptions): Matter2DCollisionSubscription;
    }
}

export function install(scene: any): Matter2DPlugin {
    if (scene?.matter2d?.installed === true) {
        return scene.matter2d as Matter2DPlugin;
    }
    installGameObjectMatter2DSugar();
    const plugin = new Matter2DPlugin(scene);
    (plugin as any).installed = true;
    scene.matter2d = plugin;
    return plugin;
}
