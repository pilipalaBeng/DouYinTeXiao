/**
 * Vision.d.ts - Vision API Surface (Agent-Facing)
 *
 * The base `Scene.vision` handle intentionally does not expose algorithm APIs.
 * Use the typed installation pattern shown below; otherwise algorithm calls fail
 * at compile time.
 *
 * @example
 * ```ts
 * import { Scene } from './Game2D';
 * import { install, Vision, Face } from './Vision';
 *
 * class MainScene extends Scene {
 *   public vision!: Vision;
 *   create(): void {
 *     this.vision = install(this);
 *   }
 *   update(): void {
 *     const faces: Face.Result[] = this.vision.getFaces();
 *     const mainFace: Face.Result | undefined = faces[0];
 *     if (mainFace) {
 *       const mouth = mainFace.getAnchor('mouth', 'center');
 *       if (mainFace.hasAction('MouthAh')) {
 *         // Trigger gameplay feedback.
 *       }
 *     }
 *     faces.some((face: Face.Result) => face.hasAction('EyeBlink'));
 *   }
 * }
 *
 * // Forbidden: missing `public vision!: Vision`, implicit Vision result types,
 * // dynamic member access, or method extraction.
 * // install(this); this.vision.getFaces();
 * // const faces = this.vision.getFaces();
 * // this.vision['getFaces']();
 * // const getAttr = mainFace.getAttr;
 * ```
 *
 * IMPORTANT: EXPORT-TIME SYMBOL ANALYSIS
 * - Declare `public vision!: Vision` on the Scene subclass and assign
 *   `this.vision = install(this)` during setup. Calling `install(this)` alone is invalid.
 * - Explicitly type Vision result objects, arrays, selected items, and callback parameters
 *   (for example `Face.Result`, `Face.Attr`, and `Hand.Result`). Any receiver that calls
 *   `hasAction` or `getAttr` must be explicitly declared as `Face.Result`.
 * - Do not erase Vision result types with `any` or `unknown`.
 * - Use direct member calls; do not use computed access, method destructuring, or extraction.
 * - Use `getAnchor`, `getPart`, and `getBox` instead of landmark magic indices.
 * Primitive values and plain data such as `number`, `boolean`, `Point2D`, and
 * `BoundingBox` do not require explicit annotations. If Vision fails after export,
 * check these symbol-analysis rules first.
 *
 * Coordinates are normalized screen coordinates with top-left at (0,0). Do not apply
 * `1 - x` or mirror x unless the design explicitly requires mirrored interaction.
 * This `.d.ts` is the agent-facing source of truth. Do not access underlying `APJS`
 * fields or modify the `Vision.ts` runtime wrapper from generated gameplay code.
 */

/** A 2D point in normalized screen coordinates (0..1). */
export interface Point2D {
  x: number;
  y: number;
}

/** A bounding box in normalized screen coordinates (0..1), origin is top-left. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Face rotation (Euler angles) in radians.
 * Sign convention:
 * - `yaw`: right is positive, left is negative.
 * - `pitch`: up is positive, down is negative.
 * - `roll`: clockwise / right-tilt is positive; counterclockwise / left-tilt is negative.
 */
export interface FaceRotation {
  pitch: number;
  yaw: number;
  roll: number;
}

export namespace Face {
  /**
   * Semantic face parts.
   *
   * Use these labels with `Result.getPart` / `getAnchor` / `getBox` to
   * locate facial features WITHOUT touching `landmarks[i]` raw indices.
   *
   * Notes:
   * - `left*` / `right*` are from the SUBJECT's perspective.
   * - Some parts (forehead / cheeks / chin) are GEOMETRICALLY DERIVED from base landmarks; their `points` array may be empty but their `center` and `box` are always meaningful.
   * Quick reference (typical effects):
   *   - 'mouth'                                 mustache, lipstick, speech bubble
   *   - 'upperLip' / 'lowerLip' / 'innerMouth'  lip-sync, mouth-open detection
   *   - 'leftEye' / 'rightEye'                  glasses, eye makeup
   *   - 'leftPupil' / 'rightPupil'              gaze tracking, pupil effects
   *   - 'leftEyebrow' / 'rightEyebrow'          eyebrow stickers, expression driving
   *   - 'nose' / 'noseTip' / 'noseBridge'       nose stickers, cartoon nose
   *   - 'forehead'                              headwear, crown (derived part)
   *   - 'leftCheek' / 'rightCheek'              blush, stickers (derived parts)
   *   - 'chin'                                  beard / chin stickers
   *   - 'face' / 'faceContour'                  full-face stickers / face outline
   */
  export type FacePart =
    | 'face'
    | 'faceContour'
    | 'leftEyebrow'
    | 'rightEyebrow'
    | 'leftEye'
    | 'rightEye'
    | 'leftPupil'
    | 'rightPupil'
    | 'nose'
    | 'noseBridge'
    | 'noseTip'
    | 'mouth'
    | 'upperLip'
    | 'lowerLip'
    | 'innerMouth'
    | 'forehead'
    | 'leftCheek'
    | 'rightCheek'
    | 'chin';

  /**
   * Named anchors on a part's bounding box.
   * `center` is the geometric center; the others are mid-points of the
   * corresponding edge of the part's box.
   *
   *   top
   *  +------+
   *  |      |
   * left  right
   *  |      |
   *  +------+
   *  bottom
   *
   * In this framework the screen Y axis points DOWN (y=0.0 is the top).
   */
  export type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

  /**
   * Geometry information for a single face part.
   * All coordinates are normalized (0..1) in the same space as `landmarks`.
   */
  export interface PartInfo {
    /** All landmark points belonging to this part. May be empty for derived parts. */
    points: Point2D[];
    /** Geometric center of `points` (or derived center for synthesized parts). */
    center: Point2D;
    /** Axis-aligned bounding box around the part. Use with `setDisplaySize` for scaling. */
    box: BoundingBox;
  }

  /**
   * Expression label mapped from the underlying engine output.
   * (For stable detection, use `StateTracker` to debounce).
   */
  export type ExpressionType =
    | 'Angry' | 'Disgust' | 'Fear' | 'Happy'
    | 'Sad' | 'Surprise' | 'Neutral' | 'Unknown';

  /** Gender label mapped from the underlying engine output. */
  export type Gender = 'Male' | 'Female' | 'Unknown';

  /**
   * Face Action label mapped from the underlying engine output.
   * Action Details:
   * - EyeBlink: A quick blink event (typically 1 frame, single or both eyes). Drops to false if eyes remain closed. DO NOT debounce.
   * - EyeBlinkLeft/Right: The closed state of the left/right eye. Remains true (multi-frame) as long as the eye is closed.
   *   (e.g., Both blink: all 3 are true. Left blink: EyeBlink & Left are true. Left kept closed: ONLY Left is true).
   * - BrowJump: A quick eyebrow raise event. DO NOT debounce with long duration.
   * - HeadPitch: Up/down head nodding or pitching (lasts for several frames). To distinguish between looking up and looking down, combine with `FaceRotation.pitch`.
   * - HeadYaw: Turning the head left or right around the vertical axis.
   * - SideNod: A complete side-to-side shaking motion. A quick motion often lasting only 2-3 frames.
   * - MouthAh: Distinct wide-open mouth shape ("Ah").
   * - MouthPout: Pouting or puckering lips forward.
   * Note: For left/right head tilting (歪头), use `FaceRotation.roll` instead of an action.
   */
  export type FaceActionType =
    | 'BrowJump' | 'EyeBlink' | 'EyeBlinkLeft' | 'EyeBlinkRight'
    | 'HeadPitch' | 'HeadYaw' | 'MouthAh' | 'MouthPout' | 'SideNod';

  /**
   * Face attributes.
   * Includes expression, happiness score, age, gender, and attractiveness.
   * Reference values for happyScore, range: 0..100, higher values indicate happier faces.
   * - Smile (微笑): ~30 to 50
   * - Laugh (大笑): > 60
   */
  export interface Attr {
    expression: {
      type: ExpressionType;
      probs: number[];
      happyScore: number;
    };
    demographics: {
      /** Predicted age value. Use Math.round(age) when displaying age text. */
      age: number;
      gender: Gender;
      boyProb: number;
      attractive: number;
    };
  }

  /**
   * A single detected face result.
   * All coordinates are normalized (0..1) unless explicitly stated otherwise.
   */
  export interface Result {
    id: number;
    box: BoundingBox;
    /**
     * Raw 106 landmarks (normalized).
     * Prefer `getPart` / `getAnchor` / `getBox` over indexing this array directly: indices are an implicit convention and may change when the underlying landmark model is upgraded.
     */
    landmarks: Point2D[];
    /**
     * Face rotation (Euler angles) in radians.
     * - pitch: Up/down tilt (抬头/低头).
     * - yaw: Left/right turn (左右转头).
     * - roll: Left/right tilt (左右歪头).
     */
    rotation: FaceRotation;
    score: number;
    hasAction(action: FaceActionType): boolean;
    getAttr(): Attr | undefined;
    /**
     * Returns geometry info (points / center / box) of a semantic face part.
     * Recommended for: drawing outlines, custom morphs, multi-point logic.
     */
    getPart(part: FacePart): PartInfo;
    /**
     * Returns a single anchor point of a semantic face part.
     * The anchor parameter defaults to `'center'`.
     * Recommended for: positioning a sticker / sprite that should follow a specific face feature (e.g. mustache below the mouth).
     *   const p = face.getAnchor('mouth', 'top'); // mid-point of mouth's top edge
     */
    getAnchor(part: FacePart, anchor?: Anchor): Point2D;
    /**
     * Returns the bounding box of a semantic face part.
     * Recommended for: scaling an image to follow a part's size, e.g.
     *   const b = face.getBox('mouth');
     *   sprite.setDisplaySize(b.width * SCREEN_W, b.height * SCREEN_H);
     */
    getBox(part: FacePart): BoundingBox;
  }
}

export namespace Pet {
  /** Pet type label mapped from the underlying engine output. */
  export type PetType = 'Cat' | 'Dog' | 'Human' | 'Others';

  /** A single detected pet/face-pet result. */
  export interface Result {
    id: number;
    type: PetType;
    box: BoundingBox;
    landmarks: Point2D[];
    rotation: FaceRotation;
    score: number;
  }
}

export namespace Hand {
  export type HandType = 'Left' | 'Right' | 'Unknown';

  /**
   * Hand Action label mapped from the underlying engine output.
   *
   * Notes:
   * - `Unknown`: the engine returned an unrecognized value (out of enum range) or failed to map.
   * - `Undetect`: no stable gesture is detected for the current frame.
   *
   * - Beg: 作揖 / 拜托（双手拱手或合掌向前）
   * - BigV: 大 V 手势（拇指+食指形成更夸张的 V 形）
   * - Cabbage: 卷心菜手势（拇指和其他4指捏合）
   * - DoubleFingerUp: 双指向上（食指+中指并拢竖起）
   * - Fist: 握拳
   * - Four: 四根手指
   * - HandOpen: 张开手掌（五指张开，掌心对镜头）
   * - HeartA/B/C/D: 比心手势（4 种变体）
   * - Holdface: 托脸 / 捧脸
   * - IndexFingerUp: 食指向上（竖“1”）
   * - Namaste: 合十（双手合掌）
   * - OK: OK 手势（拇指+食指成圈）
   * - Phonecall: 打电话手势（拇指+小指伸出）
   * - Pistol: 手枪手势（单指比枪）
   * - Pistol2: 手枪手势 2（双指比枪等变体）
   * - PlamUp: 手心向上（palm_up）
   * - Pray: 祈祷手势
   * - Rock: 摇滚手势 1（拇指+食指+小指伸出）
   * - Rock2: 摇滚手势 2（食指+小指伸出）
   * - Salute: 敬礼
   * - Spread: 展开 / 讨红包（张开/伸出手掌的动作）
   * - Swear: 发誓手势（食指+中指+无名指伸出）
   * - Thanks: 感谢手势
   * - Three: 三根手指（中指+无名指+小指伸出）
   * - ThumbDown: 倒赞
   * - ThumbUp: 点赞
   * - Victory: 剪刀手（食指+中指伸出形成V形）
   */
  export type HandActionType =
    | 'Beg' | 'BigV' | 'Cabbage' | 'DoubleFingerUp' | 'Fist' | 'Four' | 'HandOpen'
    | 'HeartA' | 'HeartB' | 'HeartC' | 'HeartD' | 'Holdface' | 'IndexFingerUp'
    | 'Namaste' | 'OK' | 'Phonecall' | 'Pistol' | 'Pistol2' | 'PlamUp' | 'Pray'
    | 'Rock' | 'Rock2' | 'Salute' | 'Spread' | 'Swear' | 'Thanks' | 'Three'
    | 'ThumbDown' | 'ThumbUp' | 'Unknown' | 'Undetect' | 'Victory';

  /**
   * Complete hand keypoint indices.
   */
  export const Keypoint: {
    Wrist: 0;
    ThumbRoot: 1;
    ThumbMcp: 2;
    ThumbIp: 3;
    ThumbTip: 4;
    IndexMcp: 5;
    IndexPip: 6;
    IndexDip: 7;
    IndexTip: 8;
    MiddleMcp: 9;
    MiddlePip: 10;
    MiddleDip: 11;
    MiddleTip: 12;
    RingMcp: 13;
    RingPip: 14;
    RingDip: 15;
    RingTip: 16;
    PinkyMcp: 17;
    PinkyPip: 18;
    PinkyDip: 19;
    PinkyTip: 20;
    PalmCenter: 21;
  };

  /** A single detected hand result. */
  export interface Result {
    id: number;
    type: HandType;
    action: HandActionType;
    actionCode: number;
    box: BoundingBox;
    rotation: number;
    keypoints: Point2D[];
  }
}

export namespace Body {
  export interface Result {
    id: number;
    detected: boolean;
  }
}

/** The full Vision entry assigned onto a Scene subclass field by `install(this)`. */
export interface Vision {
  installed: boolean;
  isInstalled(): boolean;
  toPixelRect(box: BoundingBox, width: number, height: number): BoundingBox;
  /** Returns detected faces (may be an empty array). */
  getFaces(): Face.Result[];
  /** Returns detected pets (may be an empty array). */
  getPets(): Pet.Result[];
  /** Returns detected hands (may be an empty array). */
  getHands(): Hand.Result[];
  /** Returns detected bodies (may be an empty array). */
  getBodies(): Body.Result[];
  /** Returns true if any body is detected. */
  isBodyDetected(): boolean;
}

/** Runtime Vision singleton. Usually assigned from `install(this)` to a typed Scene field. */
export declare const Vision: Vision;

/**
 * A generic state tracker for multi-frame or time-based debouncing.
 * Use it for continuous states such as expression scores, rotations, or sustained presence.
 * Do not apply long time-based debouncing to transient face or hand actions; handle them
 * directly or confirm them for at most 1-2 frames, then require a released state before retriggering.
 * @example
 * ```ts
 * private tracker = new StateTracker(300);
 * public vision!: Vision;
 *
 * create(): void {
 *   this.vision = install(this);
 * }
 *
 * // Scene.update delta is in milliseconds. If using Game2D.onUpdate(dt), convert seconds to ms first.
 * update(time: number, delta: number): void {
 *   const faces: Face.Result[] = this.vision.getFaces();
 *   const face: Face.Result | undefined = faces[0];
 *   if (!face) {
 *     this.tracker.reset();
 *     return;
 *   }
 *   const attr: Face.Attr | undefined = face.getAttr();
 *   const isHappy = (attr?.expression.happyScore ?? 0) > 50;
 *   if (this.tracker.update(isHappy, delta)) {...}
 *   // Transient event: handle directly instead of using a long debounce.
 *   if (face.hasAction('EyeBlink')) {...}
 * }
 * ```
 */
export class StateTracker {
  /**
   * @param targetTimeMs Minimum consecutive milliseconds the condition must be true.
   * @param targetFrames Minimum consecutive frames the condition must be true.
   */
  constructor(targetTimeMs?: number, targetFrames?: number);

  /**
   * Updates the tracker with the current frame's condition state.
   * @param isActive Whether the condition is met in the current frame.
   * @param deltaMs Delta time in milliseconds (only needed if targetTimeMs > 0).
   * @returns True if the condition has been consistently met for the target duration/frames.
   */
  update(isActive: boolean, deltaMs?: number): boolean;
  /** Resets the tracker state. */
  reset(): void;
}

/** Installs the Vision entry onto the given Scene and returns the attached entry. */
export declare function install(scene: { vision?: Vision }): Vision;
