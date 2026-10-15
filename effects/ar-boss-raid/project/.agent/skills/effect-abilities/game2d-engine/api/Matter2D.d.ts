/**
 * Matter2D.d.ts - optional Matter2D API surface.
 *
 * Recommended usage:
 * 1) import { install } from './Matter2D'
 * 2) call `install(this)` inside a Scene `create()` or `init()`
 * 3) access via `this.matter2d` or `gameObject.onCollide(...)`
 *
 * IMPORTANT RULES:
 * - Facts: Scene Builder is the source of truth for colliders.
 * - GUID/Index: Follow `../物理系统.md` for collider guid/index/order and SceneBuilder authoring rules.
 * - Static Objects: For static bodies (ground/walls), use `setStatic(true)`.
 */

import { EventEmitter, GameObject, PhysicsObjectSource, Scene } from './Game2D';

export declare function install(scene: any): Matter2DPlugin;

//
// Matter2D (Matter-like wrapper on the engine's 2D physics components)
//

export interface Matter2DVector {
  x: number;
  y: number;
}

/**
 * Force application modes.
 *
 * | Mode | Behavior | Uses mass? | Typical use |
 * | --- | --- | --- | --- |
 * | `force` | Continuous, applied each step | Yes | Wind, thrust |
 * | `acceleration` | Continuous, applied each step | No | Uniform movement |
 * | `impulse` | One-shot, instant | Yes | Jump, hit, explosion |
 * | `velocityChange` | One-shot, instant | No | Teleport-like push |
 */
export type Matter2DForceMode =
  | 'force'
  | 'acceleration'
  | 'impulse'
  | 'velocityChange';

/**
 * Matter2D units:
 * - Use screen pixels for collider geometry and body motion (`+Y` down), like Phaser.
 */

export type Matter2DCollisionEventName =
  | 'collisionstart'
  | 'collisionactive'
  | 'collisionend';

export interface Matter2DCollisionEvent {
  /**
   * The source/listened object for this callback.
   *
   * In pair-based APIs this is the object from the first argument. In event-style
   * APIs this is the listened object passed to `world.onCollide/onOverlap`.
   */
  gameObjectA: GameObject;
  /**
   * The other object involved in this callback, if it could be resolved.
   *
   * Use this for collision routing. Route either by object reference
   * (`event.gameObjectB === wall`) or by authored/runtime name
   * (`event.gameObjectB?.getName() === 'wall'`).
   */
  gameObjectB: GameObject | null;
  /** Raw collision payload from the underlying collider callback. */
  collisionInfo?: any;
  /** Best-effort body wrappers if created via matter2d.add.* */
  bodyA?: Matter2DBody;
  bodyB?: Matter2DBody;
}

export interface Matter2DCollisionCallbacks {
  /**
   * Fired once on the first contact frame.
   */
  onStart?: (event: Matter2DCollisionEvent) => void;

  /**
   * Fired every frame while still overlapping.
   *
   * For score gates / sensors with extra conditions, prefer `onActive`
   * (plus an "already triggered" flag) over only `onStart`, to avoid missed triggers.
   */
  onActive?: (event: Matter2DCollisionEvent) => void;

  /**
   * Fired once when the overlap ends. Typically used to reset state.
   */
  onEnd?: (event: Matter2DCollisionEvent) => void;
}

export interface Matter2DCollisionListenOptions {
  /**
   * Optional dynamic target filter. Resolved on every event, so new children added
   * into a Group are automatically included.
   */
  targets?: PhysicsObjectSource;
  /**
   * Optional semantic filter after GameObject adaptation.
   */
  filter?: (event: Matter2DCollisionEvent) => boolean;
}

export interface Matter2DCollisionSubscription {
  off(): void;
}

export declare class Matter2DBody {
  readonly gameObject: GameObject;
  readonly parts: any[];
  readonly part: any;
  getVelocity(): Matter2DVector;
  setVelocity(velocityPx: Matter2DVector): this;
  getAngularVelocity(): number;
  setAngularVelocity(value: number): this;

  /**
   * `static: true` means the body is not simulated (ground/walls). It does not move, but can still
   * block and collide/overlap with dynamic bodies. In this state, `gameObject.setPosition(...)`
   * can be used to place/reposition the object.
   *
   * `static: false` means physics owns the transform (gravity/forces/contacts may move it).
   * Use forces/velocity for motion and `body.setPosition(...)` only to reposition/teleport it;
   * do not concurrently drive the same transform through `gameObject.setPosition(...)`.
   *
   * Treat this as a per-object, per-gameplay-phase state switch. For drag/aim interactions,
   * set static before driving `gameObject` position, then call `setStatic(false)` before applying
   * gravity/impulse to release the object back to simulation.
   */
  getStatic(): boolean;
  setStatic(value: boolean): this;

  /** Returns the rigid body's rotation in radians. */
  getRotation(): number;
  /** Sets the rigid body's rotation in radians. */
  setRotation(angle: number): this;

  /**
   * Whether the body is affected by gravity (engine: `useGravity`).
   *
   * Guideline: choose ONE motion control model (recommended: physics-driven):
   * - Physics-driven (Recommended): enable gravity (`setAllowGravity(true)`), tune `gravityScale`,
   *   and use `applyForce(..., 'impulse')` / `applyForce(..., 'force')` at event points. Avoid forcing
   *   velocity every frame unless you intentionally want kinematic-like constant motion.
   * - Kinematic/manual: disable gravity (`setAllowGravity(false)` or `setGravityScale(0)`) and then
   *   compute motion yourself (integrate v/position, or set velocity each frame).
   *
   * `true` means gravity affects this body.
   * `false` means gravity does not affect this body.
   */
  getAllowGravity(): boolean;
  setAllowGravity(value: boolean): this;

  /** Gravity multiplier (1 = default world gravity). */
  getGravityScale(): number;
  setGravityScale(value: number): this;

  /**
   * Mass of the body.
   *
   * Affects how `applyForce(..., mode)` changes velocity in mass-dependent modes
   * (e.g. `mode: 'force'` and `mode: 'impulse'`).
   */
  getMass(): number;
  setMass(value: number): this;

  /**
   * Angular damping. Higher values make the body stop rotating faster.
   */
  getAngularDamping(): number;
  setAngularDamping(value: number): this;

  /**
   * Matter-like naming alias for linear damping.
   */
  getFrictionAir(): number;
  setFrictionAir(value: number): this;

  /**
   * Applies force/impulse using screen pixel units (`+Y` down).
   */
  applyForce(forcePx: Matter2DVector, mode?: Matter2DForceMode): this;

  /**
   * Gets current position in screen pixels (top-left origin, `+Y` down).
   */
  getPosition(): Matter2DVector;

  /**
   * Sets position in screen pixels (top-left origin, `+Y` down).
   *
   * Note: for dynamic bodies this acts like a teleport.
   */
  setPosition(xPx: number, yPx: number): this;

  /**
   * Applies torque to the rigidbody. Use `mode: 'impulse'` for an instant angular kick.
   * Positive/negative torque follows the engine's angular direction convention.
   */
  applyTorque(value: number, mode?: Matter2DForceMode): this;
}

export interface Matter2DColliderInfo {
  index: number;
  /**
   * Whether this collider blocks physically.
   *
   * Important: a blocking/separating contact requires BOTH colliders in the contact to have
   * `isTangible === true`. If either side is non-tangible (`false`), the interaction is treated
   * as overlap/pass-through (no blocking).
   */
  isTangible?: boolean;
  /** Inherited from the underlying component when available. */
  enabled?: boolean;
  /** Box-like size, in pixels (if collider exposes `size`). */
  width?: number;
  height?: number;
  /** Circle radius, in pixels (if collider exposes `radius`). */
  radius?: number;
  /** Collider offset, in pixels (if collider exposes `offset`). */
  offsetX?: number;
  offsetY?: number;
}

export declare class Matter2DCollider {
  readonly gameObject: GameObject;
  readonly index: number;
  getInfo(): Matter2DColliderInfo;
  /**
   * Sets whether this collider is tangible.
   *
   * Note: blocking/separation happens only when BOTH colliders in a contact are tangible.
   */
  setTangible(isTangible: boolean): this;
  /**
   * Enable/disable the collider component.
   *
   * Rendering visibility is independent: object or parent-group visibility changes do not stop
   * physics or contact callbacks. Call `setEnabled(false)` when the collider must leave gameplay.
   * For pooled objects, disable gameplay participation before reuse.
   * Use this only when gameplay explicitly needs a visible object whose collider
   * is temporarily disabled. To remove a reusable object from gameplay, prefer
   * `gameObject.setVisible(false)` and reset/re-enable it explicitly when reused.
   */
  setEnabled(enabled: boolean): this;
  setSize(width: number, height: number): this;
  setOffset(x: number, y: number): this;
  setRadius(r: number): this;
}

export declare class Matter2DAdd {
  constructor(scene: Scene);
  sprite(x: number, y: number, templateId: string): Matter2DBody;
  existing(gameObject: GameObject): Matter2DBody;
}

export declare class Matter2DWorld extends EventEmitter {
  constructor(scene: Scene);
  /**
   * Registers a collision rule for a specific pair of object sets.
   *
   * Best for static, known pairs or small fixed sets.
   *
   * Note: this registers callbacks/filters. Physical blocking still depends on collider setup:
   * a blocking contact requires BOTH colliders to be tangible (`isTangible: true`).
   */
  addCollider(
    object1: PhysicsObjectSource,
    object2: PhysicsObjectSource,
    callbacks?: Matter2DCollisionCallbacks
  ): void;
  /**
   * Registers an overlap rule for a specific pair of object sets.
   * Best for static overlap pairs. Requires non-tangible colliders (isTangible=false).
   *
   * Note: overlap/pass-through occurs when either side has non-tangible colliders.
   */
  addOverlap(
    object1: PhysicsObjectSource,
    object2: PhysicsObjectSource,
    callbacks?: Matter2DCollisionCallbacks
  ): void;
  /**
   * Event-style collision listener.
   *
   * Best for player-centric or dynamic-spawn gameplay (e.g. runtime-cloned pipes, enemies, bullets).
   * In callbacks, use `event.gameObjectB` for the contacted object. Route either
   * by object reference (`event.gameObjectB === wall`) or by authored/runtime
   * name (`event.gameObjectB?.getName() === 'wall'`). Do not build custom id
   * fallback helpers.
   */
  onCollide(
    object: PhysicsObjectSource,
    callbacks?: Matter2DCollisionCallbacks,
    options?: Matter2DCollisionListenOptions
  ): Matter2DCollisionSubscription;
  /**
   * Event-style overlap listener.
   *
   * Best for pickups, score gates, checkpoints, sensors, and other overlap-heavy gameplay.
   * In callbacks, use `event.gameObjectB` for the contacted object. Route either
   * by object reference / `Map<GameObject, State>` or by
   * `event.gameObjectB?.getName()`. Avoid ad-hoc id/name extraction.
   */
  onOverlap(
    object: PhysicsObjectSource,
    callbacks?: Matter2DCollisionCallbacks,
    options?: Matter2DCollisionListenOptions
  ): Matter2DCollisionSubscription;
  on(
    event: Matter2DCollisionEventName,
    listener: (event: Matter2DCollisionEvent) => void,
    context?: any
  ): void;
}

export declare class Matter2DPlugin {
  scene: Scene;
  add: Matter2DAdd;
  world: Matter2DWorld;
  /**
   * Returns lightweight collider wrappers for a GameObject.
   *
   * Note:
   * - `index` is the collider's position in the engine-provided collider list and may change if the scene collider order changes.
   */
  colliders(gameObject: GameObject, options?: { type?: 'auto' | 'box' | 'circle' }): Matter2DCollider[];
  colliderCount(gameObject: GameObject): number;
  collider(gameObject: GameObject, index?: number): Matter2DCollider | null;
  requireCollider(gameObject: GameObject, index?: number): Matter2DCollider;
  getColliderInfo(gameObject: GameObject): Matter2DColliderInfo[];
}

declare module './Game2D' {
  interface GameObject {
    /**
     * Object-level sugar for `scene.matter2d.world.onCollide(this, ...)`.
     */
    onCollide(
      callbacks: Matter2DCollisionCallbacks,
      options?: Matter2DCollisionListenOptions
    ): Matter2DCollisionSubscription;
    /**
     * Object-level sugar for `scene.matter2d.world.onOverlap(this, ...)`.
     */
    onOverlap(
      callbacks: Matter2DCollisionCallbacks,
      options?: Matter2DCollisionListenOptions
    ): Matter2DCollisionSubscription;
  }
}
