/**
 * Game2D.ts - A Phaser-like 2D runtime adapter layer
 */

// Basic Event Emitter for internal use
export class EventEmitter {
    private events: {[key: string]: Function[]} = {};

    on(event: string, listener: Function, context?: any) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(listener.bind(context || this));
    }

    emit(event: string, ...args: any[]) {
        if (this.events[event]) {
            this.events[event].forEach(fn => fn(...args));
        }
    }
}

// ----------------------------------------------------------------------------
// Game Objects
// ----------------------------------------------------------------------------

export class GameObject {
    scene: Scene;
    active: boolean = true;
    body: ArcadeBody | null = null;

    protected readonly _transform: APJS.ScreenTransform;
    private _destroyed: boolean = false;
    private _baseWidth: number = 0;
    private _baseHeight: number = 0;
    private _visible: boolean = true;

    get visible(): boolean { return this._visible; }
    set visible(value: boolean) {
        this._visible = value;
        const so = this._transform?.getSceneObject();
        if (so) {
            so.setEnabledInHierarchy(value);
        }
    }

    protected constructor(scene: Scene, transform: APJS.ScreenTransform) {
        this.scene = scene;
        this._transform = transform;
        this._baseWidth = this._transform.sizeDelta.x;
        this._baseHeight = this._transform.sizeDelta.y;

        if (this._transform && this._transform.getSceneObject()) {
            this._visible = this._transform.getSceneObject().enabled;
            this.active = this._transform.getSceneObject().enabled;
        }
    }

    /**
     * Returns the underlying engine SceneObject.
     *
     * Note: This is primarily for adapter/plugin layers (e.g. physics wrappers).
     */
    getSceneObject(): any | null {
        return this._transform.getSceneObject() ?? null;
    }

    /**
     * Returns the underlying SceneObject name.
     *
     * Use this when gameplay routes by authored/runtime object names. Do not
     * build custom id/name/templateId fallback helpers.
     */
    getName(): string {
        const so = this.getSceneObject();
        return so && so.name ? String(so.name) : '';
    }

    /**
     * Gets a component from the underlying engine SceneObject.
     *
     * This intentionally returns `any` to avoid exposing APJS types in the stable API surface.
     */
    getEngineComponent(type: string): any | null {
        const so = this.getSceneObject();
        if (!so) {
            return null;
        }

        const comp = so.getComponent(type) as any;
        if (!comp) {
            const name = so.name ? so.name : 'unknown';
            console.info(`[Game2D] getEngineComponent: Missing component '${type}' on SceneObject '${name}'.`);
            return null;
        }

        return comp;
    }

    /**
     * Requires a component to exist on the underlying engine SceneObject.
     * Throws a descriptive error otherwise.
     */
    requireEngineComponent(type: string): any {
        const comp = this.getEngineComponent(type);
        if (comp) return comp;
        const so = this.getSceneObject();
        const name = so && so.name ? so.name : 'unknown';
        throw new Error(
            `[Game2D] Missing component '${type}' on SceneObject '${name}'. Please pre-attach it in SceneBuilder/scene.json.`
        );
    }

    get x(): number {
        return this._transform.anchoredPosition.x + this.scene.width / 2;
    }
    set x(value: number) {
        const pos = this._transform.anchoredPosition;
        this._transform.anchoredPosition = new APJS.Vector2f(value - this.scene.width / 2, pos.y);
    }

    /**
     * The y coordinate of the Game Object.
     * Coordinate System: Screen Space (Top-Left Origin).
     * - y = 0 is the TOP of the screen.
     * - y increases as you go DOWN.
     * - y decreases as you go UP.
     */
    get y(): number {
        return this.scene.height / 2 - this._transform.anchoredPosition.y;
    }
    set y(value: number) {
        const pos = this._transform.anchoredPosition;
        this._transform.anchoredPosition = new APJS.Vector2f(pos.x, this.scene.height / 2 - value);
    }

    get angle(): number { return -this._transform.rotation; }
    set angle(value: number) { this._transform.rotation = -value; }

    setAngle(value: number): this {
        this.angle = value;
        return this;
    }

    /**
     * Sets the position of the Game Object.
     * @param x The x coordinate.
     * @param y The y coordinate. If not set, it will be set to the same value as x.
     * @param z The z coordinate. Not used in 2D but kept for API compatibility.
     * @param w The w coordinate. Not used in 2D but kept for API compatibility.
     */
    setPosition(x?: number, y?: number, z?: number, w?: number): this {
        if (x === undefined) { return this; }
        this.x = x;
        this.y = (y === undefined) ? x : y;
        return this;
    }

    get scaleX(): number { return this._transform.localScale.x; }
    set scaleX(value: number) {
        this._transform.localScale = new APJS.Vector3f(value, this._transform.localScale.y, 1);
    }

    get scaleY(): number { return this._transform.localScale.y; }
    set scaleY(value: number) {
        this._transform.localScale = new APJS.Vector3f(this._transform.localScale.x, value, 1);
    }

    get alpha(): number {
        const img = this.getEngineComponent("Image") as APJS.Image | null;
        if (img) return img.opacity;
        const txt = this.getEngineComponent("Text") as APJS.Text | null;
        if (txt) return txt.opacity;
        return 1;
    }

    set alpha(value: number) {
        this.setAlpha(value);
    }

    // Phaser 3 behavior:
    // width/height: The "internal" or "frame" size. Setting this usually crops or changes logical bounds (unscaled).
    // displayWidth/displayHeight: The visual size on screen (width * scale). Setting this changes scale.

    get width(): number {
        return this._baseWidth;
    }

    set width(value: number) {
        this._baseWidth = value;
    }

    get height(): number {
        return this._baseHeight;
    }

    set height(value: number) {
        this._baseHeight = value;
    }

    /**
     * The displayed width of the Game Object (width * scale.x).
     * Setting this value will adjust the scale to match the new width.
     */
    get displayWidth(): number {
        return this._transform.sizeDelta.x * this._transform.localScale.x;
    }

    set displayWidth(value: number) {
        const renderW = this._transform.sizeDelta.x || 1;
        this._transform.localScale = new APJS.Vector3f(
            value / renderW,
            this._transform.localScale.y,
            1
        );
    }

    /**
     * The displayed height of the Game Object (height * scale.y).
     * Setting this value will adjust the scale to match the new height.
     */
    get displayHeight(): number {
        return this._transform.sizeDelta.y * this._transform.localScale.y;
    }

    set displayHeight(value: number) {
        const renderH = this._transform.sizeDelta.y || 1;
        this._transform.localScale = new APJS.Vector3f(
            this._transform.localScale.x,
            value / renderH,
            1
        );
    }

    /**
     * Sets the logical size of the Game Object.
     * In Phaser 3, setSize() modifies the logical size (body/frame) and DOES NOT scale the object visually.
     * To stretch the object visually, use setDisplaySize().
     */
    setSize(width: number, height: number): this {
        this._baseWidth = width;
        this._baseHeight = height;
        return this;
    }

    /**
     * Sets the display size of this Game Object by modifying its scale.
     * This is the correct method to use when you want to visually stretch or resize an object.
     * Equivalent to setting displayWidth and displayHeight.
     * Note: setScale(x, y) writes localScale directly and overrides the scale computed here.
     * For flip/pulse/bounce animations with a target pixel size, interpolate with
     * setDisplaySize(animatedW, animatedH) and restore setDisplaySize(baseW, baseH) at the end.
     */
    setDisplaySize(width: number, height: number): this {
        const renderW = this._transform.sizeDelta.x || 1;
        const renderH = this._transform.sizeDelta.y || 1;

        this._transform.localScale = new APJS.Vector3f(
            width / renderW,
            height / renderH,
            1
        );
        return this;
    }

    setOrigin(x: number, y: number): this {
        this._transform.pivot = new APJS.Vector2f(x, 1 - y);
        return this;
    }

    get originX(): number {
        return this._transform.pivot?.x ?? 0.5;
    }

    get originY(): number {
        return this._transform.pivot ? (1 - this._transform.pivot.y) : 0.5;
    }

    setScale(x: number, y: number): this {
        // This intentionally overrides any previous setDisplaySize result.
        this._transform.localScale = new APJS.Vector3f(x, y, 1);
        return this;
    }

    setVisible(value: boolean): this {
        this.visible = value;
        return this;
    }

    setActive(value: boolean): this {
        this.active = value;
        return this;
    }

    setAlpha(value: number): this {
        const img = this.getEngineComponent("Image") as APJS.Image | null;
        if (img) {
            img.opacity = value;
            return this;
        }

        const txt = this.getEngineComponent("Text") as APJS.Text | null;
        if (txt) {
            txt.opacity = value;
            return this;
        }
        return this;
    }

    setDepth(value: number): this {
        const componets = this._transform.getSceneObject().getComponents();
        for (const comp of componets) {
            if (comp instanceof APJS.Renderer) {
                (comp as any).autoSortingOrder = false;
                (comp as any).sortingOrder = value;
            }
        }
        return this;
    }

    getDepth(): number {
        const componets = this._transform.getSceneObject().getComponents();
        for (const comp of componets) {
            if (comp instanceof APJS.Renderer) {
                return (comp as any).sortingOrder;
            }
        }
        return 0;
    }

    bringToTop(): this {
        const list = this.scene.sys.displayList.list;
        let maxDepth = -Infinity;
        for (const go of list) {
            if (go === this) continue;
            const d = go.getDepth();
            if (d > maxDepth) maxDepth = d;
        }

        if (maxDepth === -Infinity) return this;

        if (this.getDepth() <= maxDepth) {
            this.setDepth(maxDepth + 1);
        }

        return this;
    }

    sendToBack(): this {
        const list = this.scene.sys.displayList.list;
        let minDepth = Infinity;
        for (const go of list) {
            if (go === this) continue;
            const d = go.getDepth();
            if (d < minDepth) minDepth = d;
        }

        if (minDepth === Infinity) return this;

        if (this.getDepth() >= minDepth) {
            this.setDepth(minDepth - 1);
        }
        return this;
    }

    destroy() {
        if (this._destroyed) {
            return;
        }

        this._destroyed = true;
        this.active = false;
        const sceneObject = this._transform.getSceneObject();
        if (sceneObject) {
            this.scene.sys.engineScene.removeSceneObject(sceneObject);
        }
        this.scene.sys.displayList.remove(this);
        this.scene.physics.world.remove(this);
    }
}

export class Sprite extends GameObject {
    constructor(scene: Scene, transform: APJS.ScreenTransform) {
        super(scene, transform);
    }

    get flipX(): boolean {
        const img = this.getEngineComponent("Image") as APJS.Image | null;
        return img ? img.flipX : false;
    }

    set flipX(value: boolean) {
        this.setFlipX(value);
    }

    get flipY(): boolean {
        const img = this.getEngineComponent("Image") as APJS.Image | null;
        return img ? img.flipY : false;
    }

    set flipY(value: boolean) {
        this.setFlipY(value);
    }

    setFlipX(value: boolean): this {
        const myImage = this.getEngineComponent("Image") as APJS.Image | null;
        if (!myImage) {
            console.warn(`[Game2D] setFlipX: This object has no Image component.`);
            return this;
        }

        myImage.flipX = value;
        return this;
    }

    setFlipY(value: boolean): this {
        const myImage = this.getEngineComponent("Image") as APJS.Image | null;
        if (!myImage) {
            console.warn(`[Game2D] setFlipY: This object has no Image component.`);
            return this;
        }

        myImage.flipY = value;
        return this;
    }

    setFlip(x: boolean, y: boolean): this {
        const myImage = this.getEngineComponent("Image") as APJS.Image | null;
        if (!myImage) {
            console.warn(`[Game2D] setFlip: This object has no Image component.`);
            return this;
        }

        myImage.flipX = x;
        myImage.flipY = y;
        return this;
    }

    getTexture(): APJS.Texture | null {
        const myImage = this.getEngineComponent("Image") as APJS.Image | null;
        return myImage ? myImage.texture : null;
    }

    /**
     * Sets the texture of this Sprite from a runtime-loaded `APJS.Texture`.
     * It applies the provided texture instance directly to the current object's Image component.
     * @param tex The runtime texture to assign.
     */
    setTexture(tex: APJS.Texture): this {
        const myImage = this.getEngineComponent("Image") as APJS.Image | null;
        if (!myImage) {
            console.warn(`[Game2D] setTexture: This object has no Image component.`);
            return this;
        }

        try {
            myImage.texture = tex;
        } catch (e) {
            console.error(`[Game2D] setTexture: Failed to assign texture. `, e);
        }

        return this;
    }
}

export class Text extends GameObject {
    constructor(scene: Scene, transform: APJS.ScreenTransform) {
        super(scene, transform);
    }

    get text(): string {
        const sceneObj = this._transform.getSceneObject();
        if (!sceneObj) return '';

        const jsComp = sceneObj.getComponent('JSScriptComponent') ?? sceneObj.getComponent('Text');
        if (jsComp) {
            const compAny = jsComp as any;

            if (compAny.input !== undefined) return compAny.input;
            if (compAny.text !== undefined) return compAny.text;

            if (compAny.properties && typeof compAny.properties.get === 'function' && typeof compAny.properties.has === 'function') {
                if (compAny.properties.has('input')) return compAny.properties.get('input');
                if (compAny.properties.has('text')) return compAny.properties.get('text');
            }

            if (compAny['input'] !== undefined) return compAny['input'];
            if (compAny['text'] !== undefined) return compAny['text'];
        }
        return '';
    }

    set text(value: string) {
        this.setText(value);
    }

    /**
     * Sets the text string to be displayed.
     * @param text The text to display.
     */
    setText(text: string): this {
        const sceneObj = this._transform.getSceneObject();
        if (!sceneObj) return this;

        const jsComp = sceneObj.getComponent('JSScriptComponent') ?? sceneObj.getComponent('Text');
        if (jsComp) {
            const compAny = jsComp as any;

            if ('input' in compAny) {
                compAny.input = text;
                return this;
            }

            if ('text' in compAny) {
                compAny.text = text;
                return this;
            }

            if (compAny.properties && typeof compAny.properties.set === 'function' && typeof compAny.properties.has === 'function') {
                if (compAny.properties.has('input')) {
                    compAny.properties.set('input', text);
                    return this;
                }
                if (compAny.properties.has('text')) {
                    compAny.properties.set('text', text);
                    return this;
                }
            }

            compAny['input'] = text;
            compAny['text'] = text;
        }

        return this;
    }

    /**
     * Sets the color of the text.
     * @param color The color string (Hex format, e.g., '#FF0000').
     */
    setColor(color: string): this {
        const sceneObj = this._transform.getSceneObject();

        // Helper to parse hex to APJS.Color
        const hexToColor = (hex: string) => {
            hex = hex.replace(/^#/, '');
            if (hex.length === 3) {
                hex = hex.split('').map(char => char + char).join('');
            }
            if (hex.length === 6) {
                hex += 'FF';
            }
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            const a = parseInt(hex.substring(6, 8), 16) / 255;
            return new APJS.Color(r, g, b, a);
        };

        const colorObj = hexToColor(color);

        const jsComp = sceneObj.getComponent("JSScriptComponent") ?? sceneObj.getComponent("Text");
        if (jsComp) {
            const compAny = jsComp as any;

            if (compAny.color !== undefined) {
                compAny.color = colorObj;
                return this;
            }

            if (compAny.properties && typeof compAny.properties.set === 'function') {
                if (compAny.properties.has('color')) {
                    compAny.properties.set('color', colorObj);
                    return this;
                }
            }

            compAny['color'] = colorObj;
        }

        return this;
    }
}

// ----------------------------------------------------------------------------
// Systems
// ----------------------------------------------------------------------------

export class GameObjectFactory {
    scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    private getSceneObjectComponents(sceneObject: APJS.SceneObject | null): any[] {
        if (!sceneObject) return [];
        const sceneObjectAny = sceneObject as any;
        return typeof sceneObjectAny.getComponents === 'function'
            ? sceneObjectAny.getComponents()
            : [];
    }

    private isBasicScriptComponent(component: any): boolean {
        if (!component) return false;
        if (component instanceof APJS.BasicScriptComponent) {
            return true;
        }
        if (typeof component.isInstanceOf === 'function' && component.isInstanceOf('BasicScriptComponent')) {
            return true;
        }
        return false;
    }

    private removeBasicScriptComponents(sceneObject: APJS.SceneObject): void {
        const components = this.getSceneObjectComponents(sceneObject);
        for (const component of components) {
            if (this.isBasicScriptComponent(component)) {
                sceneObject.removeComponent(component);
            }
        }
    }

    sprite(x: number, y: number, templateId: string): Sprite {
        // In this runtime, we assume 'texture' is the name of a prefab/object in the scene to clone
        let obj: APJS.SceneObject | null = null;

        const template = this.scene.sys.engineScene.findSceneObject(templateId);
        if (template) {
            const clone = template.clone();
            this.removeBasicScriptComponents(clone);
            clone.name = `${templateId}_${Math.random().toString(36).substr(2, 5)}`;
            obj = clone;
        } else {
            console.error(`[Game2D] Prefab '${templateId}' not found in scene. Please check scene.json for a valid 对象 ID.`);
            throw new Error(`Prefab ${templateId} not found`);
        }

        const oriTransform = template.getComponent("ScreenTransform") as APJS.ScreenTransform;
        const transform = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        if (transform) {
            transform.anchoredPosition = new APJS.Vector2f(x - this.scene.width / 2, this.scene.height / 2 - y);
            transform.scale = oriTransform.scale;
            transform.rotation = oriTransform.rotation;
            transform.sizeDelta = oriTransform.sizeDelta;
            const sprite = new Sprite(this.scene, transform);

            sprite.visible = true;
            sprite.active = true;

            this.scene.sys.displayList.add(sprite);
            return sprite;
        } else {
            throw new Error(`Prefab ${templateId} has no ScreenTransform`);
        }
    }

    image(x: number, y: number, templateId: string): Sprite {
        return this.sprite(x, y, templateId); // Treat image as sprite for now
    }

    /**
     * Creates a new Text object.
     *
     * This method creates a new Text object at the specified position.
     * It automatically finds a suitable template from the scene to clone.
     *
     * @param x The x coordinate of the Text object.
     * @param y The y coordinate of the Text object.
     * @param text The text string to display.
     * @param style Optional style configuration.
     *              - template: Explicitly specify the template 对象 ID (e.g., 'ScorePrefab').
     *              - color: Text color (e.g., '#FF0000').
     */
    text(x: number, y: number, text: string, style?: { template?: string; color?: string }): Text {
        let template: APJS.SceneObject | null = null;

        if (style?.template) {
            template = this.scene.sys.engineScene.findSceneObject(style.template);
        }
        if (!template) {
            template = this.scene.sys.engineScene.findSceneObject("TextPrefab");
        }
        if (!template) {
            const allObjects = this.scene.sys.engineScene.getAllSceneObjects();

            for (const so of allObjects) {
                const components = this.getSceneObjectComponents(so);
                const hasScriptLifecycleComponent = components.some(component => this.isBasicScriptComponent(component));
                if (hasScriptLifecycleComponent) {
                    continue;
                }

                if (so.getComponent("Text")) {
                    template = so;
                    break;
                }
            }
        }

        if (!template) {
            throw new Error(`[Game2D] add.text() failed: Could not find a template.
             Strategy:
             1. style.template ('${style?.template}') -> Not Found
             2. "TextPrefab" -> Not Found
             3. Scene Search (getAllSceneObjects) -> No safe Text objects found in the entire scene

             Action Required: Ensure scene.json contains AT LEAST ONE Text object without BasicScriptComponent, or pass style.template explicitly.`);
        }

        const clone = template.clone();
        this.removeBasicScriptComponents(clone);
        const transform = clone.getComponent("ScreenTransform") as APJS.ScreenTransform;
        transform.anchoredPosition = new APJS.Vector2f(x - this.scene.width / 2, this.scene.height / 2 - y);

        const textObj = new Text(this.scene, transform);
        textObj.setText(text);

        textObj.visible = true;
        textObj.active = true;

        if (style?.color) {
            textObj.setColor(style.color);
        }

        this.scene.sys.displayList.add(textObj);
        return textObj;
    }

    // Helper to wrap an existing scene object as a GameObject
    existing(sceneObjectId: string): GameObject | null {
        const obj = this.scene.sys.engineScene.findSceneObject(sceneObjectId);
        if (!obj) {
            console.warn(`[Game2D] Existing object '${sceneObjectId}' not found. Please check scene.json for a valid 对象 ID.`);
            return null;
        }
        const transform = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        if (!transform) {
            console.warn(`[Game2D] Existing object '${sceneObjectId}' has no ScreenTransform.`);
            return null;
        }

        const jsComp = obj.getComponent("JSScriptComponent") ?? obj.getComponent("Text");

        let isText = false;
        if (jsComp) {
            const c = jsComp as any;
            if (c.text !== undefined || c.input !== undefined || (c.properties && (c.properties.has('text') || c.properties.has('input')))) {
                isText = true;
            }
        }

        let go: GameObject;
        if (isText) {
            go = new Text(this.scene, transform);
        } else {
            go = new Sprite(this.scene, transform);
        }

        this.scene.sys.displayList.add(go);
        return go;
    }

    postProcess(sceneObjectId: string): any | null {
        const obj = this.scene.sys.engineScene.findSceneObject(sceneObjectId);
        if (!obj) {
            console.warn(`[Game2D] PostProcess object '${sceneObjectId}' not found. Please check sceneOps id/object name.`);
            return null;
        }
        const component = obj.getComponent("PostProcess");
        if (!component) {
            console.warn(`[Game2D] Object '${sceneObjectId}' has no PostProcess component.`);
            return null;
        }
        return component;
    }
}

export class Pointer {
    readonly id: number;
    scene: Scene;

    // Current position
    x: number = 0;
    y: number = 0;

    // World position (Camera supported)
    worldX: number = 0;
    worldY: number = 0;

    // Previous position (for delta)
    prevPosition: { x: number, y: number } = { x: 0, y: 0 };
    position: { x: number, y: number } = { x: 0, y: 0 };

    // Interaction state
    identifier: number | null = null;
    active: boolean = false;
    isDown: boolean = false;
    wasCanceled: boolean = false;
    force: number = 0;

    // Record of press/release
    downX: number = 0;
    downY: number = 0;
    upX: number = 0;
    upY: number = 0;

    // Timestamps
    downTime: number = 0;
    upTime: number = 0;

    get duration(): number { return this.isDown ? Date.now() - this.downTime : this.upTime - this.downTime; }

    constructor(scene: Scene, id: number) {
        this.scene = scene;
        this.id = id;
    }

    /**
     * Internal update method called by InputManager
     */
    update(x: number, y: number, isDown: boolean) {
        this.prevPosition.x = this.x;
        this.prevPosition.y = this.y;

        this.x = x;
        this.y = y;
        this.position.x = x;
        this.position.y = y;

        this.worldX = x;
        this.worldY = y;

        if (isDown && !this.isDown) {
            this.downX = x;
            this.downY = y;
            this.downTime = Date.now();
        } else if (!isDown && this.isDown) {
            this.upX = x;
            this.upY = y;
            this.upTime = Date.now();
        }

        this.isDown = isDown;
    }
}

export class InputPlugin extends EventEmitter {
    private static readonly MAX_POINTERS = 5;

    scene: Scene;

    // Global properties (Shortcuts to activePointer)
    get x(): number { return this.activePointer.x; }
    get y(): number { return this.activePointer.y; }
    get isDown(): number { return this.activePointer.isDown ? 1 : 0; }
    get pointers(): readonly Pointer[] { return this.pointerPool; }
    get pointersTotal(): number { return this.pointerPool.length; }

    // Pointers
    activePointer: Pointer;
    pointer1: Pointer;
    pointer2?: Pointer;
    pointer3?: Pointer;
    pointer4?: Pointer;
    pointer5?: Pointer;

    private pointerPool: Pointer[] = [];
    private touchIdToPointer: Map<number, Pointer> = new Map();

    constructor(scene: Scene) {
        super();
        this.scene = scene;

        this.pointer1 = new Pointer(scene, 1);
        this.pointerPool.push(this.pointer1);
        this.activePointer = this.pointer1;

        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.Touch, this.onTouch, this);
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordStart, this);
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordEnd, this.onRecordEnd, this);
    }

    addPointer(quantity: number = 1): Pointer[] {
        const available = InputPlugin.MAX_POINTERS - this.pointerPool.length;
        const requested = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
        const count = Math.min(requested, available);
        const added: Pointer[] = [];

        for (let index = 0; index < count; index++) {
            const id = this.pointerPool.length + 1;
            const pointer = new Pointer(this.scene, id);
            this.pointerPool.push(pointer);
            (this as any)[`pointer${id}`] = pointer;
            added.push(pointer);
        }

        return added;
    }

    destroy() {
        const emitter = APJS.EventManager.getGlobalEmitter();
        emitter.off(APJS.EventType.Touch, this.onTouch, this);
        emitter.off(APJS.EventType.RecordStart, this.onRecordStart, this);
        emitter.off(APJS.EventType.RecordEnd, this.onRecordEnd, this);
        this.touchIdToPointer.clear();
        this.pointerPool.forEach(pointer => {
            pointer.identifier = null;
            pointer.active = false;
            pointer.isDown = false;
        });
    }

    /**
     * Emits pointer events ('pointerdown', 'pointermove', 'pointerup') based on touch events.
     * 1. touch.position: Adapted to screen space coordinates. Range: [0, width] / [0, height].
     * 2: The events emitted ('pointerdown', 'pointermove', 'pointerup') use coordinates adapted to the Screen Coordinate System.
     */
    private onTouch(e: any) {
        const touch = e && e.args && e.args[0];
        if (!touch) return;

        const x = touch.position.x * this.scene.width;
        const y = touch.position.y * this.scene.height;
        const touchId = touch.touchId;

        if (touch.phase === APJS.TouchPhase.Began) {
            if (this.touchIdToPointer.has(touchId)) return;

            const pointer = this.pointerPool.find(item => !item.active);
            if (!pointer) {
                console.warn(`[Game2D] Ignored touch '${touchId}': no inactive Pointer is available. Call input.addPointer() before using multi-touch.`);
                return;
            }

            pointer.identifier = touchId;
            pointer.active = true;
            pointer.wasCanceled = false;
            pointer.force = touch.force;
            pointer.update(x, y, true);
            this.touchIdToPointer.set(touchId, pointer);
            this.activePointer = pointer;
            this.emit('pointerdown', pointer);
            return;
        }

        const pointer = this.touchIdToPointer.get(touchId);
        if (!pointer) return;

        pointer.force = touch.force;

        if (touch.phase === APJS.TouchPhase.Moved) {
            pointer.update(x, y, true);
            this.activePointer = pointer;
            this.emit('pointermove', pointer);
        } else if (touch.phase === APJS.TouchPhase.Ended || touch.phase === APJS.TouchPhase.Canceled) {
            pointer.wasCanceled = touch.phase === APJS.TouchPhase.Canceled;
            pointer.update(x, y, false);
            this.activePointer = pointer;
            this.touchIdToPointer.delete(touchId);
            this.emit('pointerup', pointer);
            pointer.identifier = null;
            pointer.active = false;
        }
    }

    // Record start/end
    // Emit RecordStart/ RecordEnd events when record start/end
    private onRecordStart() {
        this.emit('RecordStart', null);
    }

    // Record end/end
    // Emit RecordEnd event when record end/end
    private onRecordEnd() {
        this.emit('RecordEnd', null);
    }
}

export class PhysicsFactory {
    scene: Scene;
    constructor(scene: Scene) {
        this.scene = scene;
    }

    existing(gameObject: GameObject): GameObject {
        this.scene.physics.world.enable(gameObject);
        return gameObject;
    }

    sprite(x: number, y: number, templateId: string): Sprite {
        const sprite = this.scene.add.sprite(x, y, templateId);
        this.scene.physics.world.enable(sprite);
        return sprite;
    }

    overlap(object1: any, object2: any, callback?: Function, processCallback?: Function, callbackContext?: any) {
        this.scene.physics.world.overlaps.push({ type: 'overlap', obj1: object1, obj2: object2, cb: callback, pcb: processCallback, ctx: callbackContext });
    }

    collider(object1: any, object2: any, callback?: Function, processCallback?: Function, callbackContext?: any) {
        this.scene.physics.world.overlaps.push({ type: 'collide', obj1: object1, obj2: object2, cb: callback, pcb: processCallback, ctx: callbackContext });
    }
}

export class Group<T extends GameObject> {
    private children: T[] = [];

    add(obj: T): void {
        this.children.push(obj);
    }

    remove(obj: T): void {
        const idx = this.children.indexOf(obj);
        if (idx >= 0) this.children.splice(idx, 1);
    }

    /**
     * Clears only the group's internal membership list.
     * This does not destroy children, remove them from the scene,
     * or detach their physics bodies.
     */
    clear(): void {
        this.children.length = 0;
    }

    getChildren(): T[] {
        return this.children;
    }
}

export class ArcadePhysics {
    scene: Scene;
    add: PhysicsFactory;
    world: PhysicsWorld;

    constructor(scene: Scene) {
        this.scene = scene;
        this.add = new PhysicsFactory(scene);
        this.world = new PhysicsWorld(scene);
    }
}

export class PhysicsWorld {
    scene: Scene;
    bodies: GameObject[] = [];
    overlaps: any[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    enable(gameObject: GameObject) {
        if (!gameObject.body) {
            gameObject.body = new ArcadeBody(gameObject);
        }
        this.bodies.push(gameObject);
    }

    remove(gameObject: GameObject) {
        const idx = this.bodies.indexOf(gameObject);
        if (idx > -1) {
            this.bodies.splice(idx, 1);
        }
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

    update(dt: number) {
        for (const overlap of this.overlaps) {
            const type = overlap.type ?? 'overlap';
            const list1 = this.resolveObjects(overlap.obj1).slice();
            const list2 = this.resolveObjects(overlap.obj2).slice();

            for (const o1 of list1) {
                if (!o1 || !o1.active) continue;
                if (o1.visible === false) continue;
                if (o1.body && !o1.body.enable) continue;
                for (const o2 of list2) {
                    if (!o2 || !o2.active) continue;
                    if (o2.visible === false) continue;
                    if (o2.body && !o2.body.enable) continue;
                    if (this.checkOverlap(o1, o2)) {
                        const ok = overlap.pcb ? overlap.pcb.call(overlap.ctx, o1, o2) : true;
                        if (!ok) continue;
                        if (type === 'collide') {
                            this.separate(o1, o2);
                        }
                        if (overlap.cb) overlap.cb.call(overlap.ctx, o1, o2);
                    }
                }
            }
        }
    }

    private separate(o1: GameObject, o2: GameObject) {
        const b1 = o1.body;
        const b2 = o2.body;
        const canMove1 = !b1 ? true : (b1.moves && !b1.immovable);
        const canMove2 = !b2 ? true : (b2.moves && !b2.immovable);
        if (!canMove1 && !canMove2) return;

        const r1 = this.getRect(o1);
        const r2 = this.getRect(o2);

        const overlapX = (r1.x < r2.x) ? (r1.x + r1.w - r2.x) : (r2.x + r2.w - r1.x);
        const overlapY = (r1.y < r2.y) ? (r1.y + r1.h - r2.y) : (r2.y + r2.h - r1.y);

        if (overlapX <= 0 || overlapY <= 0) return;

        if (overlapX < overlapY) {
            const push = (r1.x < r2.x) ? -overlapX : overlapX;
            if (canMove1 && canMove2) {
                o1.x += push / 2;
                o2.x -= push / 2;
            } else if (canMove1) {
                o1.x += push;
            } else if (canMove2) {
                o2.x -= push;
            }
        } else {
            const push = (r1.y < r2.y) ? -overlapY : overlapY;
            if (canMove1 && canMove2) {
                o1.y += push / 2;
                o2.y -= push / 2;
            } else if (canMove1) {
                o1.y += push;
            } else if (canMove2) {
                o2.y -= push;
            }
        }
    }

    private checkOverlap(o1: GameObject, o2: GameObject): boolean {
        // Get Rects
        const r1 = this.getRect(o1);
        const r2 = this.getRect(o2);

        const overlap = r1.x < r2.x + r2.w &&
            r1.x + r1.w > r2.x &&
            r1.y < r2.y + r2.h &&
            r1.y + r1.h > r2.y;

        if (overlap) {
            console.log(`[Physics] Collision Detected:
                O1: {x:${r1.x.toFixed(1)}, y:${r1.y.toFixed(1)}, w:${r1.w.toFixed(1)}, h:${r1.h.toFixed(1)}}
                O2: {x:${r2.x.toFixed(1)}, y:${r2.y.toFixed(1)}, w:${r2.w.toFixed(1)}, h:${r2.h.toFixed(1)}}`);
        }

        return overlap;
    }

    private getRect(go: GameObject) {
        const body = go.body;
        const w = body ? body.width : go.width;
        const h = body ? body.height : go.height;
        const ox = body ? body.offsetX : 0;
        const oy = body ? body.offsetY : 0;

        return {
            x: go.x - w * go.originX + ox,
            y: go.y - h * go.originY + oy,
            w: w,
            h: h
        };
    }
}

export class ArcadeBody {
    gameObject: GameObject;
    enable: boolean = true;
    moves: boolean = true;
    immovable: boolean = false;
    offsetX: number = 0;
    offsetY: number = 0;
    width: number;
    height: number;

    constructor(gameObject: GameObject) {
        this.gameObject = gameObject;
        this.width = gameObject.width;
        this.height = gameObject.height;
    }

    setEnable(value: boolean): this {
        this.enable = value;
        return this;
    }

    setMoves(value: boolean): this {
        this.moves = value;
        return this;
    }

    setImmovable(value: boolean): this {
        this.immovable = value;
        return this;
    }

    setSize(width: number, height: number): this {
        this.width = width;
        this.height = height;
        return this;
    }

    setOffset(x: number, y: number): this {
        this.offsetX = x;
        this.offsetY = y;
        return this;
    }
}

export class DisplayList {
    scene: Scene;
    list: GameObject[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    add(go: GameObject) {
        this.list.push(go);
    }

    remove(go: GameObject) {
        const idx = this.list.indexOf(go);
        if (idx > -1) this.list.splice(idx, 1);
    }
}

// ----------------------------------------------------------------------------
// Core
// ----------------------------------------------------------------------------

export class Systems {
    scene: Scene;
    engineScene: APJS.Scene;
    displayList: DisplayList;

    constructor(scene: Scene, engineScene: APJS.Scene) {
        this.scene = scene;
        this.engineScene = engineScene;
        this.displayList = new DisplayList(scene);
    }
}

export class Sound {
    manager: SoundManager;
    scene: Scene;
    private _audio: APJS.AudioComponent | null = null;
    key: string;

    constructor(manager: SoundManager, scene: Scene, templateId: string) {
        this.manager = manager;
        this.scene = scene;
        this.key = templateId;

        const obj = scene.sys.engineScene.findSceneObject(templateId);
        if (obj) {
            this._audio = obj.getComponent("AudioComponent") as APJS.AudioComponent;
            if (!this._audio) {
                console.warn(`[Sound] Object '${templateId}' has no AudioComponent.`);
            }
        } else {
            console.warn(`[Sound] Audio object '${templateId}' not found in scene.`);
        }
    }

    play(config?: any) {
        if (!this._audio) return;

        if (config) {
            if (config.volume !== undefined) this.setVolume(config.volume);
            if (config.loop !== undefined) this.setLoop(config.loop);
        }

        if (this._audio.play) {
            this._audio.play();
        }
    }

    pause() {
        if (this._audio && this._audio.pause) this._audio.pause();
    }

    resume() {
        if (this._audio && this._audio.resume) this._audio.resume();
    }

    stop() {
        if (this._audio && this._audio.stop) this._audio.stop();
    }

    setVolume(value: number) {
        if (this._audio) this._audio.volume = value * 100;
        return this;
    }

    setLoop(loop: boolean) {
        if (this._audio) this._audio.loopCount = loop ? 9999 : 0;
        return this;
    }

    destroy() {
        this.manager.remove(this.key);
        this._audio = null;
    }
}

export class SoundManager {
    scene: Scene;
    private _sounds: Map<string, Sound> = new Map();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    add(templateId: string, config?: any): Sound {
        // Return existing sound if already added
        if (this._sounds.has(templateId)) {
            const sound = this._sounds.get(templateId)!;
            if (config) {
                if (config.volume !== undefined) sound.setVolume(config.volume);
                if (config.loop !== undefined) sound.setLoop(config.loop);
            }
            return sound;
        }

        const sound = new Sound(this, this.scene, templateId);
        if (config) {
            if (config.volume !== undefined) sound.setVolume(config.volume);
            if (config.loop !== undefined) sound.setLoop(config.loop);
        }

        this._sounds.set(templateId, sound);
        return sound;
    }

    play(templateId: string, config?: any) {
        const sound = this.add(templateId, config);
        sound.play();
    }

    remove(templateId: string) {
        this._sounds.delete(templateId);
    }

    stopAll() {
        this._sounds.forEach(sound => sound.stop());
    }
}

export class TimerEvent {
    delay: number;
    callback: Function;
    args: any[];
    scope: any;
    elapsed: number = 0;
    pendingDelete: boolean = false;
    owner: Scene | GameObject | undefined;

    constructor(config: any) {
        this.delay = config.delay;
        this.callback = config.callback;
        this.args = config.args;
        this.scope = config.callbackScope;
        this.owner = config.owner;
    }

    cancel(): this {
        this.pendingDelete = true;
        return this;
    }

    remove(): this {
        return this.cancel();
    }
}

export class Clock {
    scene: Scene;
    now: number = 0;
    events: TimerEvent[] = [];
    private _isUpdating: boolean = false;
    private _pendingInsertion: TimerEvent[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    delayedCall(delay: number, callback: Function, args?: any[], scope?: any, owner?: Scene | GameObject): TimerEvent {
        const event = new TimerEvent({ delay, callback, args, callbackScope: scope, owner });
        if (this._isUpdating) {
            this._pendingInsertion.push(event);
        } else {
            this.events.push(event);
        }
        return event;
    }

    removeEvent(event: TimerEvent): boolean {
        if (!event) return false;
        event.pendingDelete = true;
        if (this._isUpdating) return false;
        const idx = this.events.indexOf(event);
        if (idx > -1) {
            this.events.splice(idx, 1);
            return true;
        }
        return false;
    }

    clear(): void {
        if (this._isUpdating) {
            for (const e of this.events) {
                e.pendingDelete = true;
            }
            this._pendingInsertion.length = 0;
            return;
        }
        this.events.length = 0;
        this._pendingInsertion.length = 0;
    }

    update(time: number, delta: number) {
        this.now = time;
        this._isUpdating = true;
        let error: unknown | null = null;
        try {
            const len = this.events.length;
            for (let i = 0; i < len; i++) {
                const event = this.events[i];
                if (event.pendingDelete) continue;
                if (!this.isOwnerValid(event.owner)) {
                    event.pendingDelete = true;
                    continue;
                }
                event.elapsed += delta;
                if (event.elapsed >= event.delay) {
                    event.callback.apply(event.scope, event.args);
                    event.pendingDelete = true;
                }
            }
        } catch (e) {
            error = e;
        } finally {
            this._isUpdating = false;
        }

        this.compactEvents();
        this.flushPendingInsertion();

        if (error) throw error;
    }

    private compactEvents(): void {
        if (this.events.length === 0) return;
        let write = 0;
        for (let read = 0; read < this.events.length; read++) {
            const e = this.events[read];
            if (e.pendingDelete) continue;
            this.events[write++] = e;
        }
        this.events.length = write;
    }

    private flushPendingInsertion(): void {
        if (this._pendingInsertion.length === 0) return;
        for (const e of this._pendingInsertion) {
            if (e.pendingDelete) continue;
            this.events.push(e);
        }
        this._pendingInsertion.length = 0;
    }

    private isOwnerValid(owner: Scene | GameObject | undefined): boolean {
        if (!owner) return true;
        if (owner instanceof GameObject) return owner.active;
        if (owner instanceof Scene) return owner.active;
        return true;
    }
}

const sceneObjectCache = new WeakMap<Scene, {[sceneObjectId: string]: GameObject | null}>();

function getSceneObjectCache(scene: Scene): {[sceneObjectId: string]: GameObject | null} {
    let cache = sceneObjectCache.get(scene);
    if (!cache) {
        cache = {};
        sceneObjectCache.set(scene, cache);
    }
    return cache;
}

export class Scene {
    sys!: Systems;
    add!: GameObjectFactory;
    input!: InputPlugin;
    physics!: ArcadePhysics;
    matter2d: any = (() => {
        const errorMessage = 'Matter2D is not enabled. Import { install } from "./Matter2D" and call install(this) inside a Scene before using matter2d APIs.';
        const handler: ProxyHandler<any> = {
            get: (_t, prop) => {
                if (typeof prop === 'symbol') return undefined;
                if (prop === 'installed') return false;
                if (prop === 'isInstalled') return () => false;
                return new Proxy(() => { }, handler);
            },
            apply: () => {
                throw new Error(errorMessage);
            },
        };
        return new Proxy(() => { }, handler);
    })();
    sound!: SoundManager;
    vision: VisionHandle = new Proxy({}, {
        get: (_target, prop) => {
            if (typeof prop === 'symbol') return undefined;
            if (prop === 'installed') return false;
            if (prop === 'isInstalled') return () => false;
            return (..._args: any[]) => {
                throw new Error('Vision is not enabled. Import { install } from "./Vision" and call install(this) inside a Scene before using vision APIs.');
            };
        }
    }) as VisionHandle;
    time!: Clock;
    game!: Game2D;
    active: boolean = true;

    constructor() {
    }

    /**
     * Get the current screen width (design resolution).
     * 720 for now.
     */
    get width(): number { return 720; }

    /**
     * Get the current screen height (design resolution).
     * 1280 for now.
     */
    get height(): number { return 1280; }

    boot(game: Game2D, engineScene: APJS.Scene) {
        this.game = game;
        this.active = true;
        sceneObjectCache.set(this, {});
        this.sys = new Systems(this, engineScene);
        this.add = new GameObjectFactory(this);
        this.input = new InputPlugin(this);
        this.physics = new ArcadePhysics(this);
        this.sound = new SoundManager(this);
        this.time = new Clock(this);
    }

    getExisting<T extends GameObject = GameObject>(sceneObjectId: string): T | null {
        const cache = getSceneObjectCache(this);
        if (!(sceneObjectId in cache)) {
            cache[sceneObjectId] = this.add.existing(sceneObjectId);
        }
        return cache[sceneObjectId] as T | null;
    }

    resetSceneDepths(groupDepth: {[groupName: string]: number}) {
        const visitedGroups = new Set<any>();
        const resetChildrenDepth = (children: any[], baseDepth: number) => {
            let depth = baseDepth;
            for (let i = 0; i < children.length; i++) {
                if (!children[i].getComponent("ScreenTransform")) continue;
                this.getExisting(children[i].name)?.setDepth(depth++);
            }
        };

        for (const groupName in groupDepth) {
            const group = this.sys.engineScene.findSceneObject(groupName);
            if (!group) {
                console.warn(`[Game2D] resetSceneDepths: group '${groupName}' not found.`);
                continue;
            }

            const baseDepth = groupDepth[groupName];
            if (visitedGroups.has(group)) continue;
            visitedGroups.add(group);

            const children = typeof group.getChildren === 'function' ? group.getChildren() : [];
            resetChildrenDepth(children, baseDepth);
        }
    }

    init(data?: any) { }
    preload() { }
    create() { }
    update(time: number, delta: number) { }
}

export interface VisionHandle {
    readonly installed: boolean;
    isInstalled(): boolean;
}

// ----------------------------------------------------------------------------
// Game Runner
// ----------------------------------------------------------------------------

const GAME2D_LOG_TAG = '[Game2D]';
const game2DInjectedInitHandlers: Array<() => void> = [];
const game2DInjectedGlobalEventHandlers: Array<(event: unknown) => void> = [];
let game2DDidRunInit = false;

const safeStringifyGame2D = (value: unknown): string => {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return `"stringify_failed:${String(error)}"`;
    }
};

const logGame2D = (message: string, payload?: unknown): void => {
    if (payload === undefined) {
        console.log(`${GAME2D_LOG_TAG} ${message}`);
        return;
    }
    console.log(`${GAME2D_LOG_TAG} ${message} ${safeStringifyGame2D(payload)}`);
};

@component()
export class Game2D extends APJS.BasicScriptComponent {
    private activeScene: Scene | null = null;

    static injectInitHandler(handler: () => void) {
        logGame2D('injectInitHandler.register', {
            didRunInit: game2DDidRunInit,
            queuedCount: game2DInjectedInitHandlers.length,
        });
        if (game2DDidRunInit) {
            logGame2D('injectInitHandler.skipped', {
                reason: 'didRunInit',
            });
            return;
        }
        game2DInjectedInitHandlers.push(handler);
        logGame2D('injectInitHandler.queued', {
            queuedCount: game2DInjectedInitHandlers.length,
        });
    }

    static injectGlobalEventHandler(handler: (event: unknown) => void) {
        game2DInjectedGlobalEventHandlers.push(handler);
    }

    startGame(sceneClass: new () => Scene) {
        if (this.activeScene) {
            this.activeScene.active = false;
            if (this.activeScene.input) this.activeScene.input.destroy();
            if (this.activeScene.time) this.activeScene.time.clear();
        }
        this.activeScene = new sceneClass();
        this.activeScene.boot(this, this.getSceneObject().scene);
        this.activeScene.init();
        this.activeScene.preload();
        this.activeScene.create();
        logGame2D('Scene Started');
    }

    onInit() {
        logGame2D('Game Component Init');
        game2DDidRunInit = true;
        const handlers = [...game2DInjectedInitHandlers];
        game2DInjectedInitHandlers.length = 0;
        for (let index = 0; index < handlers.length; index++) {
            const handler = handlers[index];
            try {
                handler();
                logGame2D('onInit.handler.success', {
                    index,
                    total: handlers.length,
                });
            } catch (error) {
                logGame2D('onInit.handler.failed', {
                    index,
                    total: handlers.length,
                    error: String(error),
                });
                throw error;
            }
        }
    }

    onStart() {
        logGame2D('Game Component Started');
    }

    onUpdate(dt: number) {
        if (this.activeScene) {
            // Update Physics
            this.activeScene.physics.world.update(dt);
            // Update Time
            this.activeScene.time.update(Date.now(), dt * 1000);
            // Update Scene
            this.activeScene.update(Date.now(), dt * 1000);
        }
    }

    onEvent(event: any) {
        for (const handler of game2DInjectedGlobalEventHandlers) {
            handler(event);
        }
    }
}
