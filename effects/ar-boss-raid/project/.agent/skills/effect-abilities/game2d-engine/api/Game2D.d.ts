/**
 * Game2D.d.ts - Public typings for the Phaser-like 2D runtime adapter layer.
 *
 * This file is the recommended reference for gameplay scripting (API surface).
 * Do not use `APJS` directly in gameplay scripts.
 *
 * Key semantics:
 * - Screen space coordinates with top-left origin (x→right, y→down).
 * - Standard resolution is 720x1280 pixels; center point is (360, 640).
 * - Scene.update(time, delta): delta is in milliseconds.
 * - Game2D.onUpdate(dt): dt is in seconds.
 * - width/height affect logical/body sizing; use setDisplaySize/setScale for visual size.
 * - No Atlas / No Sprite Sheet: Current API does not support atlas metadata. Do not use texture-atlases or multi-frame sprites as single textures.
 * - Prefer Scene.update for per-frame animation/interpolation; use time.delayedCall for coarse timers and one-shot phase transitions.
 */

export declare class EventEmitter {
  /**
   * Registers an event listener.
   * @param event Event name (e.g., 'pointerdown', 'RecordStart').
   * @param listener Callback function.
   * @param context Optional `this` binding for the callback.
   */
  on(event: string, listener: Function, context?: any): void;
  /**
   * Emits an event to all registered listeners.
   * @param event Event name.
   * @param args Arguments passed to listeners.
   */
  emit(event: string, ...args: any[]): void;
}

/**
 * Note: This is NOT full Phaser. Treat this as a small, stable API surface.
 */
export declare class GameObject {
  scene: Scene;
  active: boolean;
  body: ArcadeBody | null;
  visible: boolean;
  protected constructor(scene: Scene, internalHandle: never);
  /**
   * Returns the underlying SceneObject name.
   *
   * Use this when gameplay routes by authored/runtime object names. Do not
   * build custom id/name/templateId fallback helpers.
   */
  getName(): string;
  /**
   * X coordinate in screen space (pixels), top-left origin.
   */
  x: number;
  /**
   * Y coordinate in screen space (pixels), top-left origin.
   */
  y: number;
  /**
   * Screen-space rotation in degrees. `0` preserves the asset's authored
   * orientation; positive values rotate clockwise and negative values rotate
   * counterclockwise.
   */
  angle: number;
  setAngle(value: number): this;
  /**
   * Sets screen-space position.
   *
   * Note: for Matter2D static bodies, use this to reposition the object. For
   * dynamic bodies controlled by physics, call `body.setPosition(xPx, yPx)`
   * and other Matter2D body APIs so physics state remains authoritative.
   */
  setPosition(x?: number, y?: number, z?: number, w?: number): this;
  scaleX: number;
  scaleY: number;
  /**
   * Logical/unscaled width.
   *
   * IMPORTANT:
   * - If a physics body exists, overlaps/colliders use `body.width/height` instead of `GameObject.width/height`.
   * - `GameObject.width/height` are used as a fallback only when there is no body.
   * - Changing `GameObject.width/height` does NOT update an existing body; use `body.setSize()` to change collision size.
   */
  width: number;
  /**
   * Logical/unscaled height. See `width` for physics sizing semantics.
   */
  height: number;
  displayWidth: number;
  displayHeight: number;
  readonly originX: number;
  readonly originY: number;
  /**
   * Sets the logical size of this object (does NOT resize visuals).
   */
  setSize(width: number, height: number): this;
  /**
   * Visual resize via scale adjustment. Prefer this over mutating width/height for visuals.
   * Note: later calling setScale(x, y) overwrites the localScale computed here.
   * For flip/pulse/bounce animations with a target pixel size, interpolate with setDisplaySize(animatedW, animatedH)
   * and restore setDisplaySize(baseW, baseH) at the end.
   */
  setDisplaySize(width: number, height: number): this;
  setOrigin(x: number, y: number): this;
  /**
   * Directly sets localScale and overrides any previous setDisplaySize result.
   */
  setScale(x: number, y: number): this;
  /**
   * Shows/hides this object. Hidden objects do not render or participate in physics.
   */
  setVisible(value: boolean): this;
  setActive(value: boolean): this;
  /**
   * Sets visual opacity in [0, 1] for fade transitions.
   * Do not use opacity as lifecycle visibility; finish transitions with setVisible/setActive and restore the sceneSpec baseline opacity before reuse.
   */
  setAlpha(value: number): this;
  setDepth(value: number): this;
  getDepth(): number;
  bringToTop(): this;
  sendToBack(): this;
  /**
   * Destroys this object.
   *
   * IMPORTANT:
   * - This is NOT a cheap operation for pooling. Prefer toggling `active/visible` and reusing objects;
   *   for same-phase UI sets, keep one visibility control unit such as the parent scene group.
   * - This removal affects overlap tracking.
   * - This removes the underlying engine SceneObject; do not use this object after destroy (undefined behavior).
   */
  destroy(): void;
}

/**
 * Sprite wrapper.
 */
export declare class Sprite extends GameObject {
  protected constructor(scene: Scene, internalHandle: never);
  flipX: boolean;
  flipY: boolean;
  setFlipX(value: boolean): this;
  setFlipY(value: boolean): this;
  setFlip(x: boolean, y: boolean): this;
  getTexture(): APJS.Texture | null;
  setTexture(tex: APJS.Texture): this;
}

/**
 * Text wrapper for UI text objects.
 *
 * Prefer setText/setColor over accessing engine components directly.
 */
export declare class Text extends GameObject {
  protected constructor(scene: Scene, internalHandle: never);
  text: string;
  setText(text: string): this;
  /**
   * @param color Hex string like '#RRGGBB' or '#RRGGBBAA'.
   */
  setColor(color: string): this;
}

/**
 * Factory for creating/wrapping objects, similar to Phaser's `this.add`.
 *
 * Note: sprite/image clones an existing scene object by name (templateId).
 * The templateId MUST exist in the scene hierarchy.
 */
export declare class GameObjectFactory {
  scene: Scene;
  constructor(scene: Scene);
  sprite(x: number, y: number, templateId: string): Sprite;
  image(x: number, y: number, templateId: string): Sprite;
  text(x: number, y: number, text: string, style?: { template?: string; color?: string }): Text;
  existing(sceneObjectId: string): GameObject | null;
  postProcess(sceneObjectId: string): APJS.PostProcess | null;
}

/**
 * Pointer data similar to Phaser's Pointer.
 *
 * Coordinates are screen-space pixels within the design resolution.
 */
export declare class Pointer {
  /** Stable Game2D pointer slot id in the range 1..5. */
  readonly id: number;
  scene: Scene;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  prevPosition: { x: number; y: number };
  position: { x: number; y: number };
  /** APJS touch id currently assigned to this slot, or null while inactive. */
  identifier: number | null;
  /** Whether this pointer slot is currently tracking a touch. */
  active: boolean;
  isDown: boolean;
  /** Whether the most recent release was caused by TouchPhase.Canceled. */
  wasCanceled: boolean;
  /** Pressure reported by the underlying platform input API. */
  force: number;
  downX: number;
  downY: number;
  upX: number;
  upY: number;
  downTime: number;
  upTime: number;
  /**
   * Duration of the last press in milliseconds.
   *
   * Note:
   * - Treat Pointer as read-only in gameplay code.
   */
  readonly duration: number;
  constructor(scene: Scene, id: number);
  update(x: number, y: number, isDown: boolean): void;
}

/**
 * Input plugin that emits pointer events ('pointerdown', 'pointermove', 'pointerup')
 * and record lifecycle events ('RecordStart', 'RecordEnd').
 */
export declare class InputPlugin extends EventEmitter {
  scene: Scene;
  /**
   * Shortcut to activePointer.x (pixels in design resolution).
   */
  readonly x: number;
  /**
   * Shortcut to activePointer.y (pixels in design resolution).
   */
  readonly y: number;
  /**
   * Numeric down state (1 or 0). This is intentionally NOT boolean.
   */
  readonly isDown: number;
  activePointer: Pointer;
  pointer1: Pointer;
  pointer2?: Pointer;
  pointer3?: Pointer;
  pointer4?: Pointer;
  pointer5?: Pointer;
  /** Enabled pointer slots. One pointer is enabled by default. */
  readonly pointers: readonly Pointer[];
  readonly pointersTotal: number;
  constructor(scene: Scene);
  /**
   * Enables additional pointer slots for simultaneous multi-touch input.
   *
   * One pointer is enabled by default and up to 5 can be enabled in total.
   * Call this in `create()` when the design requires pinch/rotate, multiple
   * simultaneous controls, or multiple players touching the screen together.
   * To support `N` simultaneous touches, call `addPointer(N - 1)`.
   *
   * @param quantity Number of additional pointer slots to enable, not the
   * total number of simultaneous touches.
   *
   * If not enough pointer slots are enabled, extra touches will be ignored
   * (and a warning will be logged).
   *
   * Note:
   * - Multi-touch gameplay should use the `Pointer` instance passed to
   *   `pointerdown` / `pointermove` / `pointerup` callbacks, and distinguish
   *   touches by stable `Pointer.id`. Annotate callback arguments as `Pointer`
   *   in gameplay code. Avoid relying on `this.input.activePointer` when
   *   multiple touches may be active.
   */
  addPointer(quantity?: number): Pointer[];
  /** Stops global input listeners and releases active touch mappings. */
  destroy(): void;
}

/**
 * Physics factory, similar to Phaser's `this.physics.add`.
 *
 * overlap/collider accept Phaser-like inputs (single object, array, or group).
 */
export declare class Group<T extends GameObject = GameObject> {
  private children: T[];
  add(obj: T): void;
  remove(obj: T): void;
  clear(): void;
  getChildren(): T[];
}

export type PhysicsObjectSource<T extends GameObject = GameObject> =
  | T
  | T[]
  | Group<T>;

export declare class PhysicsFactory {
  scene: Scene;
  constructor(scene: Scene);
  existing(gameObject: GameObject): GameObject;
  sprite(x: number, y: number, templateId: string): Sprite;
  /**
   * Registers a persistent AABB overlap rule.
   *
   * Semantics:
   * - Physics uses body width/height (and body offset) when a body exists; otherwise it falls back to GameObject.width/height as logical size.
   * - displayWidth/displayHeight are visual-only and are not used by overlap/collider checks.
   * - For dynamic collections (spawning/despawning), prefer passing a Group.
   * - Register overlap once in create/setup code; do not call this repeatedly inside Scene.update.
   * - processCallback must explicitly return true to keep the pair; returning false or undefined will skip it.
   *
   * Note (Differences vs Phaser):
   * - This adapter does not support PhysicsGroup/StaticGroup; use Group instead.
   * - This adapter is AABB-only and does not model velocity response.
   */
  overlap(
    object1: PhysicsObjectSource,
    object2: PhysicsObjectSource,
    callback?: (object1: GameObject, object2: GameObject) => void,
    processCallback?: (object1: GameObject, object2: GameObject) => boolean,
    callbackContext?: any
  ): void;
  /**
   * Registers an AABB collider check.
   *
   * Note:
   * - Collider separation is axis-based; it does not apply velocity response.
   * - Treat this as "push apart" logic, not full Arcade Physics.
   */
  collider(
    object1: PhysicsObjectSource,
    object2: PhysicsObjectSource,
    callback?: (object1: GameObject, object2: GameObject) => void,
    processCallback?: (object1: GameObject, object2: GameObject) => boolean,
    callbackContext?: any
  ): void;
}

/**
 * Arcade-like physics container.
 *
 * Note: PhysicsWorld only checks overlaps/colliders; it does not automatically move bodies.
 */
export declare class ArcadePhysics {
  scene: Scene;
  add: PhysicsFactory;
  world: PhysicsWorld;
  constructor(scene: Scene);
}

export declare class PhysicsWorld {
  scene: Scene;
  bodies: GameObject[];
  overlaps: any[];
  constructor(scene: Scene);
  enable(gameObject: GameObject): void;
  remove(gameObject: GameObject): void;
  /**
   * @param dt Delta time in seconds.
   *
   * Note:
   * - The current overlap/collider checks do not rely on dt.
   */
  update(dt: number): void;
}

/**
 * Minimal arcade body used by PhysicsWorld overlap/collider checks.
 *
 * Note: There is no `velocity` field in this framework.
 * Movement must be implemented by updating GameObject.x/y in Scene.update.
 */
export declare class ArcadeBody {
  gameObject: GameObject;
  enable: boolean;
  moves: boolean;
  immovable: boolean;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  constructor(gameObject: GameObject);
  setEnable(value: boolean): this;
  setMoves(value: boolean): this;
  setImmovable(value: boolean): this;
  setSize(width: number, height: number): this;
  setOffset(x: number, y: number): this;
}

export declare class DisplayList {
  scene: Scene;
  list: GameObject[];
  constructor(scene: Scene);
  add(go: GameObject): void;
  remove(go: GameObject): void;
}

export declare class Systems {
  scene: Scene;
  engineScene: APJS.Scene;
  displayList: DisplayList;
  constructor(scene: Scene, engineScene: APJS.Scene);
}

export declare class Sound {
  manager: SoundManager;
  scene: Scene;
  key: string;
  constructor(manager: SoundManager, scene: Scene, templateId: string);
  play(config?: any): void;
  pause(): void;
  resume(): void;
  stop(): void;
  setVolume(value: number): this;
  setLoop(loop: boolean): this;
  destroy(): void;
}

export declare class SoundManager {
  scene: Scene;
  constructor(scene: Scene);
  add(templateId: string, config?: any): Sound;
  play(templateId: string, config?: any): void;
  remove(templateId: string): void;
  stopAll(): void;
}

export declare class TimerEvent {
  delay: number;
  callback: Function;
  args: any[];
  scope: any;
  elapsed: number;
  pendingDelete: boolean;
  owner: Scene | GameObject | undefined;
  constructor(config: any);
  cancel(): this;
  remove(): this;
}

export declare class Clock {
  scene: Scene;
  now: number;
  events: TimerEvent[];
  constructor(scene: Scene);
  /**
   * @param delay Delay in milliseconds.
   */
  delayedCall(
    delay: number,
    callback: Function,
    args?: any[],
    scope?: any,
    owner?: Scene | GameObject
  ): TimerEvent;
  removeEvent(event: TimerEvent): boolean;
  clear(): void;
  update(time: number, delta: number): void;
}

export interface VisionHandle {
  readonly installed: boolean;
  isInstalled(): boolean;
}

export declare class Scene {
  sys: Systems;
  add: GameObjectFactory;
  input: InputPlugin;
  physics: ArcadePhysics;
  /**
   * Matter2D adapter entry.
   *
   * Note:
   * - If Matter2D is not enabled/installed, accessing methods may throw.
   * - Enable via `install(scene)` from `./Matter2D`.
   */
  matter2d: any;
  sound: SoundManager;
  /**
   * Vision adapter entry.
   *
   * Note:
   * - This base handle intentionally exposes only install-state checks.
   * - To use Vision algorithms, import `{ install, Vision }` from `./Vision`,
   *   declare `public vision!: Vision` on the Scene subclass, and assign
   *   `this.vision = install(this)` during setup.
   */
  vision: VisionHandle;
  time: Clock;
  game: Game2D;
  active: boolean;
  constructor();
  /**
   * The fixed design width in pixels.
   */
  readonly width: number;
  /**
   * The fixed design height in pixels.
   */
  readonly height: number;
  boot(game: Game2D, engineScene: APJS.Scene): void;
  getExisting<T extends GameObject = GameObject>(sceneObjectId: string): T | null;
  resetSceneDepths(groupDepth: { [groupName: string]: number }): void;
  init(data?: any): void;
  preload(): void;
  create(): void;
  /**
   * @param time Timestamp in milliseconds.
   * @param delta Delta time in milliseconds.
   */
  update(time: number, delta: number): void;
}

export declare class Game2D extends APJS.BasicScriptComponent {
  static injectInitHandler(handler: () => void): void;
  static injectGlobalEventHandler(handler: (event: unknown) => void): void;
  startGame(sceneClass: new () => Scene): void;
  onInit(): void;
  onStart(): void;
  /**
   * Game loop callback.
   * @param dt Delta time in seconds.
   */
  onUpdate(dt: number): void;
}
