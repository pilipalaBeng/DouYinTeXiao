import {Game2D, GameObject, Scene} from './Game2D';

const GroupDepth = {
    // Use scene-builder group names. Game2D will reset all direct children under each group.
    // 背景: 100,
    玩法: 1000,
    UI界面: 3000,
    结算界面: 4000,
} as const;

/**
 * Main Scene
 * Grow gameplay behavior in small passes (Phaser-style).
 * Update visual-effect interactions and dynamic behavior in real time.
 */
class MainScene extends Scene {
    // Register gameplay-spawned objects here so resetGame can hide/reuse them.
    private runtimeObjects: GameObject[] = [];
    // Tracks whether recording has started. Use it for gameplay gating only; visual effects should not require recording by default.
    private isRecording: boolean = false;

    create() {
        // 1. Reset group children depths before gameplay setup.
        this.resetSceneDepths(GroupDepth);

        // 2. Setup Input
        this.input.on('pointerdown', this.handleInput, this);

        // 3. Listen for Game Lifecycle Events
        // RecordStart resets gameplay state. Do not treat it as a required start signal for visual-only effects.
        this.input.on('RecordStart', this.handleRecordStart, this);
        // RecordEnd stops gameplay progression by default. Visual-only effects may keep rendering unless explicitly asked to stop.
        this.input.on('RecordEnd', this.handleRecordEnd, this);
    }

    update(time: number, delta: number) {
        // Add per-frame behavior in small passes.
        // const dt = delta / 1000;
        // Keep this gameplay gate for generated games. Remove or skip it for visual-effect scripts that should run before recording.
        if (!this.isRecording) return;
    }

    private handleInput(pointer: any) {
        // Add interaction behavior in small passes.
        // Keep this gameplay gate for generated games. Remove or skip it for visual-effect interactions that should respond before recording.
        if (!this.isRecording) return;
    }

    private handleRecordStart() {
        this.isRecording = true;
        this.resetGame();
    }

    private handleRecordEnd() {
        this.isRecording = false;
    }

    private resetGame() {
        this.time.clear();
        this.sound.stopAll();

        for (const obj of this.runtimeObjects) obj.destroy();
        this.runtimeObjects = [];

        // Update this reset path whenever you add runtime state:
        // - Reset score/phase/state variables
        // - Reset textures remembered during initialization
        // - Register newly spawned objects with this.runtimeObjects.push(obj)
        // - Restore positions/UI and reset cooldowns
        console.log("Game Reset Triggered");
    }
}

/**
 * Entry Point
 */
@component()
export class {{componentName}} extends Game2D {
    /**
     * Expose variables to the 脚本参数面板.
     * Use @label('xxx') and @serializeProperty() to allow users to tweak values.
     */
    // Example: Game Speed
    // @label("游戏速度")
    // @serializeProperty()
    // gameSpeed: number = 1.0;

    // Example: Array of Points (e.g. Waypoints)
    // @label("路径点")
    // @serializeProperty()
    // points: APJS.Vector2f[] = [];

    onInit() {
        super.onInit();
        // Initialize audio detectors or other runtime resources that must be created in onInit here.
    }

    onStart() {
        this.startGame(MainScene);
    }
}
