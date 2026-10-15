/**
 * Vision.ts - Visual Algorithm Adapter
 *
 * This file is designed to be copied into `Assets/Vision.ts`.
 *
 * Use this only when the design explicitly needs visual algorithms such as
 * Face, Hand, or Body.
 *
 * Provides an AI-friendly, standard API for accessing visual algorithm results.
 * It transforms proprietary APJS data structures into standard formats familiar
 * to LLMs, similar to MediaPipe/Web APIs.
 *
 * Runtime usage rules:
 * - Import `install` and `Vision`, declare `public vision!: Vision` on the Scene
 *   subclass, and assign `this.vision = install(this)` during setup.
 * - Always use explicit types for vision values in generated code.
 * - Coordinate values are normalized screen coordinates and should not be
 *   mirrored unless the design explicitly asks for mirrored interaction.
 * - Never modify this adapter from generated gameplay code; only call it.
 *
 * Implementation Details:
 * - This adapter maps ByteDance APJS 106-point landmark results to semantic parts.
 * - Symbol-alias driven: Export is controlled by `*.symbol-alias.json`.
 */

/**
 * Represents a 2D point in normalized screen coordinates.
 * Origin (0,0) is at the top-left corner of the screen.
 */
export interface Point2D {
    x: number;
    y: number;
}

/**
 * Represents a bounding box in normalized screen coordinates.
 * Origin (0,0) is at the top-left corner of the screen.
 */
export interface BoundingBox {
    x: number;      // X coordinate of the top-left corner (0.0 - 1.0)
    y: number;      // Y coordinate of the top-left corner (0.0 - 1.0)
    width: number;  // Width of the box (0.0 - 1.0)
    height: number; // Height of the box (0.0 - 1.0)
}

type RectLike = { x: number; y: number; width: number; height: number };

/**
 * Represents face rotation (Euler angles) in radians.
 * Uses the common right-handed sign convention:
 * - `yaw`: right is positive, left is negative
 * - `pitch`: up is positive, down is negative
 * - `roll`: clockwise / right-tilt is positive, counterclockwise / left-tilt is negative
 */
export interface FaceRotation {
    pitch: number; // up -> positive
    yaw: number; // right -> positive
    roll: number; // clockwise / right-tilt -> positive
}

/**
 * Vision Adapter singleton.
 *
 * NOTE:
 * - Capabilities are patched onto this object by the namespaces below.
 * - If a capability is removed, the corresponding API will remain as a stub that throws.
 */
export interface Vision {
    installed: boolean;
    isInstalled(): boolean;
    getFaces(): Face.Result[];
    getPets(): Pet.Result[];
    getHands(): Hand.Result[];
    getBodies(): Body.Result[];
    isBodyDetected(): boolean;
    toPixelRect(box: BoundingBox, width: number, height: number): BoundingBox;
}

type VisionRuntime = Vision & {
    Face?: typeof Face;
    Pet?: typeof Pet;
    Hand?: typeof Hand;
    Body?: typeof Body;
};

export const Vision: VisionRuntime = {
    installed: true,
    isInstalled(): boolean {
        return true;
    },
    getFaces(): Face.Result[] {
        throw new Error('[Vision] Face API not available. Ensure Face capability exists in Assets/Vision.ts');
    },
    getPets(): Pet.Result[] {
        throw new Error('[Vision] Pet API not available. Ensure Pet capability exists in Assets/Vision.ts');
    },
    getHands(): Hand.Result[] {
        throw new Error('[Vision] Hand API not available. Ensure Hand capability exists in Assets/Vision.ts');
    },
    getBodies(): Body.Result[] {
        throw new Error('[Vision] Body API not available. Ensure Body capability exists in Assets/Vision.ts');
    },
    isBodyDetected(): boolean {
        throw new Error('[Vision] Body API not available. Ensure Body capability exists in Assets/Vision.ts');
    },
    /**
     * Helper: Converts a normalized bounding box to pixel coordinates.
     */
    toPixelRect(box: BoundingBox, width: number, height: number): BoundingBox {
        return {
            x: box.x * width,
            y: box.y * height,
            width: box.width * width,
            height: box.height * height,
        };
    },
};

export function install(scene: { vision?: Vision }): Vision {
    scene.vision = Vision;
    return Vision;
}

export namespace Face {
    export type ExpressionType =
        | 'Angry'
        | 'Disgust'
        | 'Fear'
        | 'Happy'
        | 'Sad'
        | 'Surprise'
        | 'Neutral'
        | 'Unknown';

    export type Gender = 'Male' | 'Female' | 'Unknown';

    export type FaceActionType =
        | 'BrowJump'
        | 'EyeBlink'
        | 'EyeBlinkLeft'
        | 'EyeBlinkRight'
        | 'HeadPitch'
        | 'HeadYaw'
        | 'MouthAh'
        | 'MouthPout'
        | 'SideNod';

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

    export interface Result {
        id: number;
        box: BoundingBox;
        landmarks: Point2D[];
        rotation: FaceRotation;
        score: number;

        hasAction(action: FaceActionType): boolean;
        getAttr(): Attr | undefined;

        getPart(part: FacePart): PartInfo;
        getAnchor(part: FacePart, anchor?: Anchor): Point2D;
        getBox(part: FacePart): BoundingBox;
    }

    /**
     * Semantic face parts. See Vision.d.ts for descriptions.
     * Indices below follow the ByteDance APJS 106-point convention; if the
     * underlying landmark model changes (e.g. 240 / 280 points), update only
     * the FACE_PART_INDICES table — callers do NOT need to change.
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

    export type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

    export interface PartInfo {
        points: Point2D[];
        center: Point2D;
        box: BoundingBox;
    }

    function range(start: number, endInclusive: number): number[] {
        const out: number[] = [];
        for (let i = start; i <= endInclusive; i++) out.push(i);
        return out;
    }

    /**
     * Index map for the 106-landmark convention.
     *
     * Parts used by this mapping:
     *   0..32   face contour (jawline)
     *   33..37  left eyebrow (main)
     *   38..42  right eyebrow (main)
     *   43..46  nose bridge
     *   43..51  nose (main)
     *   52..57  left eye outline (main)
     *   58..63  right eye outline (main)
     *   64..67  left eyebrow (extra)
     *   68..71  right eyebrow (extra)
     *   72..73  left eye (extra)
     *   74      left pupil
     *   75..76  right eye (extra)
     *   77      right pupil
     *   80..83  nose (extra)
     *   84..103 mouth (including inner mouth)
     * Notes:
     * - Upper lip: 84..90 + 96..100; Lower lip: 91..95 + 101..103
     *
     * `[]` means the part is geometrically derived from base landmarks
     * rather than directly mapped (see computeDerivedPart).
     */
    const FACE_PART_INDICES: { [K in FacePart]: ReadonlyArray<number> } = {
        face:         [],
        faceContour:  range(0, 32),
        leftEyebrow:  range(33, 37).concat(range(64, 67)),
        rightEyebrow: range(38, 42).concat(range(68, 71)),
        noseBridge:   range(43, 46),
        nose:         range(43, 51).concat(range(80, 83)),
        noseTip:      [46],
        leftEye:      range(52, 57).concat(range(72, 73)),
        leftPupil:    [74],
        rightEye:     range(58, 63).concat(range(75, 76)),
        rightPupil:   [77],
        mouth:        range(84, 103),
        upperLip:     range(84, 90).concat(range(96, 100)),
        lowerLip:     range(91, 95).concat(range(101, 103)),
        innerMouth:   range(96, 103),
        forehead:     [],
        leftCheek:    [],
        rightCheek:   [],
        chin:         [16],
    };

    function pickPoints(landmarks: ReadonlyArray<Point2D>, indices: ReadonlyArray<number>): Point2D[] {
        const pts: Point2D[] = [];
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            if (idx >= 0 && idx < landmarks.length) {
                pts.push(landmarks[idx]);
            }
        }
        return pts;
    }

    function computeBox(points: ReadonlyArray<Point2D>): BoundingBox {
        if (points.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
        let minX = points[0].x, maxX = points[0].x;
        let minY = points[0].y, maxY = points[0].y;
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    function computeCenter(points: ReadonlyArray<Point2D>, fallbackBox: BoundingBox): Point2D {
        if (points.length === 0) {
            return { x: fallbackBox.x + fallbackBox.width / 2, y: fallbackBox.y + fallbackBox.height / 2 };
        }
        let sx = 0, sy = 0;
        for (let i = 0; i < points.length; i++) {
            sx += points[i].x;
            sy += points[i].y;
        }
        return { x: sx / points.length, y: sy / points.length };
    }

    function expandBoxAroundCenter(center: Point2D, halfW: number, halfH: number): BoundingBox {
        return {
            x: center.x - halfW,
            y: center.y - halfH,
            width: halfW * 2,
            height: halfH * 2,
        };
    }

    /**
     * Geometrically derive parts that have no direct landmark coverage.
     * Returns null when the part is not derived (caller should use the
     * standard index-based path).
     *
     * Convention: y axis points DOWN (y=1.0 is bottom of screen).
     */
    function computeDerivedPart(
        part: FacePart,
        landmarks: ReadonlyArray<Point2D>,
        faceBox: BoundingBox,
    ): PartInfo | null {
        switch (part) {
            case 'face':
                return {
                    points: [],
                    center: { x: faceBox.x + faceBox.width / 2, y: faceBox.y + faceBox.height / 2 },
                    box: faceBox,
                };
            case 'forehead': {
                const lb = pickPoints(landmarks, FACE_PART_INDICES.leftEyebrow);
                const rb = pickPoints(landmarks, FACE_PART_INDICES.rightEyebrow);
                if (lb.length === 0 || rb.length === 0) return null;
                const lbBox = computeBox(lb);
                const rbBox = computeBox(rb);
                const eyebrowMidX = (lbBox.x + lbBox.width / 2 + rbBox.x + rbBox.width / 2) / 2;
                // y-down: smaller y is higher on screen.
                const eyebrowTopY = Math.min(lbBox.y, rbBox.y);
                const targetY = Math.max(faceBox.y, eyebrowTopY - faceBox.height * 0.30);
                const halfW = (faceBox.width * 0.55) / 2;
                const halfH = Math.max(0, (eyebrowTopY - targetY)) / 2;
                const center: Point2D = { x: eyebrowMidX, y: (eyebrowTopY + targetY) / 2 };
                return {
                    points: [],
                    center,
                    box: expandBoxAroundCenter(center, halfW, Math.max(halfH, faceBox.height * 0.05)),
                };
            }
            case 'leftCheek':
            case 'rightCheek': {
                const isLeft = part === 'leftCheek';
                const eyeIndices = isLeft ? FACE_PART_INDICES.leftEye : FACE_PART_INDICES.rightEye;
                const eyePts = pickPoints(landmarks, eyeIndices);
                if (eyePts.length === 0) return null;
                const eyeBox = computeBox(eyePts);
                // Mouth top as the lower bound of the cheek vertical range.
                const mouthPts = pickPoints(landmarks, FACE_PART_INDICES.mouth);
                const mouthBox = mouthPts.length > 0 ? computeBox(mouthPts) : null;
                const cx = eyeBox.x + eyeBox.width / 2;
                // Cheek center vertically halfway between eye-bottom and mouth-top.
                const eyeBottom = eyeBox.y + eyeBox.height; // y-down: smaller y is higher
                const mouthTop = mouthBox ? (mouthBox.y) : (faceBox.y + faceBox.height * 0.35);
                const cy = (eyeBottom + mouthTop) / 2;
                const halfW = Math.max(faceBox.width * 0.10, eyeBox.width * 0.6);
                const halfH = Math.max(faceBox.height * 0.06, Math.abs(eyeBottom - mouthTop) / 2);
                const center: Point2D = { x: cx, y: cy };
                return {
                    points: [],
                    center,
                    box: expandBoxAroundCenter(center, halfW, halfH),
                };
            }
            default:
                return null;
        }
    }

    function getPartInfoFor(landmarks: ReadonlyArray<Point2D>, faceBox: BoundingBox, part: FacePart): PartInfo {
        const derived = computeDerivedPart(part, landmarks, faceBox);
        if (derived) return derived;

        const indices = FACE_PART_INDICES[part];
        const points = pickPoints(landmarks, indices);

        if (points.length === 0) {
            // Defensive: never throw — fall back to face box.
            return {
                points: [],
                center: { x: faceBox.x + faceBox.width / 2, y: faceBox.y + faceBox.height / 2 },
                box: faceBox,
            };
        }

        const box = computeBox(points);
        const center = computeCenter(points, box);
        return { points, center, box };
    }

    function getAnchorOf(info: PartInfo, anchor: Anchor): Point2D {
        const b = info.box;
        switch (anchor) {
            case 'top':    return { x: b.x + b.width / 2, y: b.y };
            case 'bottom': return { x: b.x + b.width / 2, y: b.y + b.height };
            case 'left':   return { x: b.x,               y: b.y + b.height / 2 };
            case 'right':  return { x: b.x + b.width,     y: b.y + b.height / 2 };
            case 'center':
            default:       return info.center;
        }
    }

    const allowedActionNames = new Set<string>([
        'BrowJump',
        'EyeBlink',
        'EyeBlinkLeft',
        'EyeBlinkRight',
        'HeadPitch',
        'HeadYaw',
        'MouthAh',
        'MouthPout',
        'SideNod',
    ]);

    function toFaceActionCode(action: FaceActionType): number {
        const map: Record<FaceActionType, number> = {
            BrowJump: APJS.FaceAction.BrowJump,
            EyeBlink: APJS.FaceAction.EyeBlink,
            EyeBlinkLeft: APJS.FaceAction.EyeBlinkLeft,
            EyeBlinkRight: APJS.FaceAction.EyeBlinkRight,
            HeadPitch: APJS.FaceAction.HeadPitch,
            HeadYaw: APJS.FaceAction.HeadYaw,
            MouthAh: APJS.FaceAction.MouthAh,
            MouthPout: APJS.FaceAction.MouthPout,
            SideNod: APJS.FaceAction.SideNod,
        };
        const code = map[action];
        return typeof code === 'number' ? code : -1;
    }

    function getExpressionLabel(type: number): ExpressionType {
        switch (type) {
            case 0: return 'Angry';
            case 1: return 'Disgust';
            case 2: return 'Fear';
            case 3: return 'Happy';
            case 4: return 'Sad';
            case 5: return 'Surprise';
            case 6: return 'Neutral';
            default: return 'Unknown';
        }
    }

    function getGenderLabel(gender: number): Gender {
        switch (gender) {
            case 1: return 'Male';
            case 2: return 'Female';
            default: return 'Unknown';
        }
    }

    function convertAttr(attr: APJS.FaceAttributeInterface): Attr {
        const expression: Attr['expression'] = { type: 'Unknown', probs: [], happyScore: 0 };
        const demographics: Attr['demographics'] = { age: 0, gender: 'Unknown', boyProb: 0, attractive: 0 };

        expression.type = getExpressionLabel(attr.expressionType);
        if (attr.expressionProbabilities) {
            expression.probs = Array.from(attr.expressionProbabilities);
        }
        expression.happyScore = attr.happyScore;

        demographics.age = attr.age;
        demographics.gender = getGenderLabel(attr.gender);
        demographics.boyProb = attr.boyProbability;
        demographics.attractive = attr.attractive;

        return {
            expression,
            demographics,
        };
    }

    class FaceResultImpl implements Result {
        private boxCache?: BoundingBox;
        private landmarksCache?: Point2D[];
        private attrLoaded = false;
        private attr?: APJS.FaceAttributeInterface;
        private attrCache?: Attr;

        constructor(private base: APJS.Face106Interface, private index: number, private algoRes: any) {}

        get id(): number {
            return this.base.ID;
        }

        get box(): BoundingBox {
            if (!this.boxCache) {
                const rawRect: RectLike | undefined = this.base.rect as any;
                if (!rawRect) {
                    this.boxCache = { x: 0, y: 0, width: 0, height: 0 };
                } else {
                    this.boxCache = {
                        x: rawRect.x,
                        y: 1.0 - (rawRect.y + rawRect.height),
                        width: rawRect.width,
                        height: rawRect.height,
                    };
                }
            }
            return this.boxCache;
        }

        get landmarks(): Point2D[] {
            if (!this.landmarksCache) {
                const landmarks: Point2D[] = [];
                const rawPoints = this.base.pointsArray;
                if (rawPoints) {
                    for (let j = 0; j + 1 < rawPoints.length; j += 2) {
                        const x = rawPoints[j];
                        const y = rawPoints[j + 1];
                        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                        landmarks.push({ x, y: 1.0 - y });
                    }
                }
                this.landmarksCache = landmarks;
            }
            return this.landmarksCache;
        }

        get rotation(): FaceRotation {
            return { pitch: -this.base.pitch, yaw: -this.base.yaw, roll: -this.base.roll };
        }

        get score(): number {
            return this.base.score;
        }

        hasAction(action: FaceActionType): boolean {
            if (!allowedActionNames.has(action)) return false;
            const code = toFaceActionCode(action);
            if (!Number.isFinite(code) || code < 0) return false;
            return Boolean(this.base.hasAction(code));
        }

        private ensureAttr(): APJS.FaceAttributeInterface | undefined {
            if (this.attrLoaded) return this.attr;
            this.attrLoaded = true;

            if (!this.algoRes) {
                return undefined;
            }

            const count = this.algoRes.getFaceAttributeCount();
            if (this.index >= count) {
                return undefined;
            }

            this.attr = this.algoRes.getFaceAttributeInfo(this.index);
            return this.attr;
        }

        getAttr(): Attr | undefined {
            if (this.attrCache) return this.attrCache;
            const attr = this.ensureAttr();
            if (!attr) return undefined;
            this.attrCache = convertAttr(attr);
            return this.attrCache;
        }

        getPart(part: FacePart): PartInfo {
            return getPartInfoFor(this.landmarks, this.box, part);
        }

        getAnchor(part: FacePart, anchor: Anchor = 'center'): Point2D {
            const info = getPartInfoFor(this.landmarks, this.box, part);
            return getAnchorOf(info, anchor);
        }

        getBox(part: FacePart): BoundingBox {
            return getPartInfoFor(this.landmarks, this.box, part).box;
        }
    }

    export function getResults(): Result[] {
        const results: Result[] = [];
        const algoRes = APJS.AlgorithmManager.getResult();

        if (!algoRes) return results;

        const count = algoRes.getFaceCount();
        if (count <= 0) return results;

        for (let i = 0; i < count; i++) {
            const baseInfo = algoRes.getFaceBaseInfo(i);
            if (baseInfo) {
                results.push(new FaceResultImpl(baseInfo, i, algoRes));
            }
        }

        return results;
    }

}

Vision.getFaces = Face.getResults;
Vision.Face = Face;

export namespace Pet {
    export type PetType = 'Cat' | 'Dog' | 'Human' | 'Others';

    export interface Result {
        id: number;
        type: PetType;
        box: BoundingBox;
        landmarks: Point2D[];
        rotation: FaceRotation;
        score: number;
    }

    function getPetTypeLabel(type: number): PetType {
        switch (type) {
            case 1: return 'Cat';
            case 2: return 'Dog';
            case 3: return 'Human';
            case 99: return 'Others';
            default: return 'Others';
        }
    }

    export function getResults(): Result[] {
        const results: Result[] = [];
        const algoRes = APJS.AlgorithmManager.getResult();
        if (!algoRes) return results;

        const count = algoRes.getFacePetInfoCount();
        if (count <= 0) return results;

        for (let i = 0; i < count; i++) {
            const info = algoRes.getFacePetInfo(i);
            if (info) {
                results.push(convert(info, i));
            }
        }

        return results;
    }

    function convert(info: APJS.FacePetInfoInterface, index: number): Result {
        const rawRect = info.rect;
        const box: BoundingBox = rawRect
            ? {
                x: rawRect.x,
                y: 1.0 - (rawRect.y + rawRect.height),
                width: rawRect.width,
                height: rawRect.height,
            }
            : { x: 0, y: 0, width: 0, height: 0 };

        const landmarks: Point2D[] = [];
        const rawPoints = info.pointsArray;
        if (rawPoints) {
            for (let j = 0; j + 1 < rawPoints.length; j += 2) {
                const x = rawPoints[j];
                const y = rawPoints[j + 1];
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                landmarks.push({ x, y: 1.0 - y });
            }
        }

        return {
            id: index,
            type: getPetTypeLabel(info.facePetType),
            box: box,
            landmarks: landmarks,
            rotation: { pitch: -info.pitch, yaw: -info.yaw, roll: -info.roll },
            score: info.score
        };
    }
}

Vision.getPets = Pet.getResults;
Vision.Pet = Pet;

export namespace Hand {
    export type HandType = 'Left' | 'Right' | 'Unknown';
    export type HandActionType =
        | 'Beg'
        | 'BigV'
        | 'Cabbage'
        | 'DoubleFingerUp'
        | 'Fist'
        | 'Four'
        | 'HandOpen'
        | 'HeartA'
        | 'HeartB'
        | 'HeartC'
        | 'HeartD'
        | 'Holdface'
        | 'IndexFingerUp'
        | 'Namaste'
        | 'OK'
        | 'Phonecall'
        | 'Pistol'
        | 'Pistol2'
        | 'PlamUp'
        | 'Pray'
        | 'Rock'
        | 'Rock2'
        | 'Salute'
        | 'Spread'
        | 'Swear'
        | 'Thanks'
        | 'Three'
        | 'ThumbDown'
        | 'ThumbUp'
        | 'Unknown'
        | 'Undetect'
        | 'Victory';

    const allowedActionNames = new Set<string>([
        'Beg',
        'BigV',
        'Cabbage',
        'DoubleFingerUp',
        'Fist',
        'Four',
        'HandOpen',
        'HeartA',
        'HeartB',
        'HeartC',
        'HeartD',
        'Holdface',
        'IndexFingerUp',
        'Namaste',
        'OK',
        'Phonecall',
        'Pistol',
        'Pistol2',
        'PlamUp',
        'Pray',
        'Rock',
        'Rock2',
        'Salute',
        'Spread',
        'Swear',
        'Thanks',
        'Three',
        'ThumbDown',
        'ThumbUp',
        'Unknown',
        'Undetect',
        'Victory',
    ]);

    export const Keypoint = {
        Wrist: 0,
        ThumbRoot: 1,
        ThumbMcp: 2,
        ThumbIp: 3,
        ThumbTip: 4,
        IndexMcp: 5,
        IndexPip: 6,
        IndexDip: 7,
        IndexTip: 8,
        MiddleMcp: 9,
        MiddlePip: 10,
        MiddleDip: 11,
        MiddleTip: 12,
        RingMcp: 13,
        RingPip: 14,
        RingDip: 15,
        RingTip: 16,
        PinkyMcp: 17,
        PinkyPip: 18,
        PinkyDip: 19,
        PinkyTip: 20,
        PalmCenter: 21,
    } as const;

    export interface Result {
        id: number;
        type: HandType;
        action: HandActionType;
        actionCode: number;
        box: BoundingBox;
        rotation: number;
        keypoints: Point2D[];
    }

    const KEYPOINT_SMOOTHING_MIN_ALPHA = 0.45;
    const KEYPOINT_SMOOTHING_MAX_ALPHA = 0.9;
    const KEYPOINT_SMOOTHING_FAST_DISTANCE = 0.035;
    const previousKeypointsById = new Map<number, Point2D[]>();

    function normalizeHandType(raw: unknown): HandType {
        if (typeof raw !== 'string') return 'Unknown';
        const lower = raw.toLowerCase();
        if (lower.includes('left')) return 'Left';
        if (lower.includes('right')) return 'Right';
        return 'Unknown';
    }

    function getHandType(info: APJS.HandInfo): HandType {
        return normalizeHandType(info.getHandType());
    }

    function toHandAction(value: APJS.HandAction): { action: HandActionType; actionCode: number } {
        const unknownCode = APJS.HandAction.Unknown as number;
        const name = APJS.HandAction[value];
        if (typeof name === 'string' && allowedActionNames.has(name)) {
            return { action: name as HandActionType, actionCode: value as number };
        }
        return { action: 'Unknown', actionCode: unknownCode };
    }

    function convertKeyPointsXYToPoints(keyPointsXY: ArrayLike<number> | undefined | null): Point2D[] {
        const count = Math.floor((keyPointsXY?.length ?? 0) / 2);
        const points: Point2D[] = [];

        for (let i = 0; i < count; i++) {
            points.push({
                x: keyPointsXY![i * 2],
                y: 1 - keyPointsXY![i * 2 + 1],
            });
        }

        return points;
    }

    function clonePoints(points: ReadonlyArray<Point2D>): Point2D[] {
        return points.map(point => ({ x: point.x, y: point.y }));
    }

    function calculateKeypointSmoothingAlpha(previous: Point2D, current: Point2D): number {
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        const speedFactor = Math.min(distance / KEYPOINT_SMOOTHING_FAST_DISTANCE, 1);
        return KEYPOINT_SMOOTHING_MIN_ALPHA +
            (KEYPOINT_SMOOTHING_MAX_ALPHA - KEYPOINT_SMOOTHING_MIN_ALPHA) * speedFactor;
    }

    function smoothKeypoints(id: number, current: Point2D[]): Point2D[] {
        const previous = previousKeypointsById.get(id);
        if (!previous || previous.length !== current.length) {
            const firstFrame = clonePoints(current);
            previousKeypointsById.set(id, firstFrame);
            return firstFrame;
        }

        const smoothed = current.map((point, index) => {
            const last = previous[index];
            //平滑值  目前设为1
            const alpha = 1;

            const deltaX = point.x - last.x;
            const deltaY = point.y - last.y;
            const distance = Math.hypot(deltaX, deltaY);

            const softDeadZone = 0.007;
            let antiShakeTarget = last;
            if (distance > 0) {
                const effectiveDistance = distance - Math.min(distance, softDeadZone) * 0.92;
                const scale = effectiveDistance / distance;
                antiShakeTarget = {
                    x: last.x + deltaX * scale,
                    y: last.y + deltaY * scale,
                };
            }
            return {
                x: last.x + (antiShakeTarget.x - last.x) * alpha,
                y: last.y + (antiShakeTarget.y - last.y) * alpha,
            };
        });

    previousKeypointsById.set(id, clonePoints(smoothed));
    return smoothed;
    }

    export function getResults(): Result[] {
        const results: Result[] = [];
        const algoRes = APJS.AlgorithmManager.getResult();
        if (!algoRes) {
            previousKeypointsById.clear();
            return results;
        }

        const count = algoRes.getHandCount();
        if (count <= 0) {
            previousKeypointsById.clear();
            return results;
        }

        const visibleIds = new Set<number>();

        for (let i = 0; i < count; i++) {
            const info: APJS.HandInfo = algoRes.getHandInfo(i);
            if (!info) continue;
            const id = info.ID ?? i;
            visibleIds.add(id);

            const rawRect: RectLike = info.rect;
            const box: BoundingBox = rawRect
                ? {
                    x: rawRect.x,
                    y: 1.0 - (rawRect.y + rawRect.height),
                    width: rawRect.width,
                    height: rawRect.height,
                }
                : { x: 0, y: 0, width: 0, height: 0 };

            const type = getHandType(info);

            const { action, actionCode } = toHandAction(info.action);

            results.push({
                id,
                type,
                action,
                actionCode: Number.isFinite(actionCode) ? actionCode : -1,
                box,
                rotation: info.rotation ?? 0,
                keypoints: smoothKeypoints(id, convertKeyPointsXYToPoints((info as any).keyPointsXY)),
            });
        }

        previousKeypointsById.forEach((_value, id) => {
            if (!visibleIds.has(id)) {
                previousKeypointsById.delete(id);
            }
        });

        return results;
    }
}

Vision.getHands = Hand.getResults;
Vision.Hand = Hand;

export namespace Body {
    export interface Point3D {
        x: number;
        y: number;
        z: number;
    }

    export interface Result {
        id: number;
        detected: boolean;
    }

    export function getResults(): Result[] {
        const results: Result[] = [];
        const algoRes = APJS.AlgorithmManager.getResult();
        if (!algoRes) return results;

        const count = algoRes.getBodyCount();
        if (count <= 0) return results;

        for (let i = 0; i < count; i++) {
            const info: APJS.BodyInfo = algoRes.getBodyInfo(i);
            if (!info) continue;

            const detected = Boolean(info.detected);

            results.push({
                id: i,
                detected,
            });
        }

        return results;
    }

    export function isDetected(): boolean {
        const algoRes = APJS.AlgorithmManager.getResult();
        if (!algoRes) return false;
        const count = algoRes.getBodyCount();
        for (let i = 0; i < count; i++) {
            const info: APJS.BodyInfo = algoRes.getBodyInfo(i);
            if (info && info.detected) return true;
        }
        return false;
    }
}

Vision.getBodies = Body.getResults;
Vision.isBodyDetected = Body.isDetected;
Vision.Body = Body;

export class StateTracker {
    private activeTime: number = 0;
    private activeFrames: number = 0;

    constructor(private targetTimeMs: number = 0, private targetFrames: number = 0) {}

    public update(isActive: boolean, deltaMs: number = 0): boolean {
        if (isActive) {
            this.activeTime += deltaMs;
            this.activeFrames += 1;
        } else {
            this.activeTime = 0;
            this.activeFrames = 0;
        }

        if (this.targetFrames > 0) return this.activeFrames >= this.targetFrames;
        if (this.targetTimeMs > 0) return this.activeTime >= this.targetTimeMs;
        return isActive;
    }

    public reset(): void {
        this.activeTime = 0;
        this.activeFrames = 0;
    }
}
