import {Game2D, GameObject, Scene, Sprite, Text} from './Game2D';
import {Face, install, Vision} from './Vision';

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
    public vision!: Vision;
    private runtimeObjects: GameObject[] = [];
    private isRecording: boolean = false;
    private phase: 'warmup' | 'rage' | 'shield' | 'window' | 'feign' | 'result' = 'warmup';
    private hp: number = 2400;
    private elapsed: number = 0;
    private fireHeld: boolean = false;
    private fireGate: number = 0;
    private faceGate: number = 0;
    private coreHits: number = 0;
    private shieldRounds: number = 0;
    private windowLeft: number = 0;
    private shots: number = 0;
    private hits: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private gunKickLeft: number = 0;
    private resultDelay: number = 0;
    private boss!: Sprite;
    private badge!: Sprite;
    private avatar!: Sprite;
    private shield!: Sprite;
    private core!: Sprite;
    private crosshair!: Sprite;
    private highlight!: Sprite;
    private gun!: Sprite;
    private hpFill!: Sprite;
    private hud!: Text;
    private hint!: Text;
    private resultCard!: Sprite;
    private resultAvatar!: Sprite;
    private resultTitle!: Text;
    private resultStats!: Text;
    private confetti!: Sprite;
    // 旧场景中保留的真实世界 Boss 节点：只用于修复已有的 AR 空间锚定行为。
    private worldBoss: APJS.SceneObject | null = null;
    private worldBossTransform: APJS.Transform | null = null;
    private worldBossBase: APJS.Vector3f | null = null;
    private arCamera: APJS.Camera | null = null;
    private worldFlightTime: number = 0;

    create(): void {
        this.resetSceneDepths(GroupDepth);
        this.vision = install(this);
        this.boss = this.object<Sprite>('Boss主体'); this.badge = this.object<Sprite>('Boss出战牌'); this.avatar = this.object<Sprite>('Boss头像');
        this.shield = this.object<Sprite>('护盾覆盖'); this.core = this.object<Sprite>('护盾核心'); this.crosshair = this.object<Sprite>('固定准星');
        this.highlight = this.object<Sprite>('准星命中高亮'); this.gun = this.object<Sprite>('像素AK枪'); this.hpFill = this.object<Sprite>('Boss血条填充');
        this.hud = this.object<Text>('HUD文字'); this.hint = this.object<Text>('开局提示'); this.resultCard = this.object<Sprite>('结算卡');
        this.resultAvatar = this.object<Sprite>('结算头像'); this.resultTitle = this.object<Text>('结算标题'); this.resultStats = this.object<Text>('结算战绩'); this.confetti = this.object<Sprite>('胜利彩带');
        this.input.on('pointerdown', this.beginFire, this); this.input.on('pointerup', this.endFire, this);
        this.input.on('RecordStart', this.handleRecordStart, this); this.input.on('RecordEnd', this.handleRecordEnd, this);
        this.bindWorldBoss();
        this.hideLegacySceneObjects();
        // 真机预览若未及时分发 RecordStart，仍保持可玩的本地初态；收到 RecordStart 后会完整重置。
        this.isRecording = true;
        this.resetGame();
    }

    update(time: number, delta: number): void {
        if (!this.isRecording) return;
        if (this.phase === 'result') { this.resultDelay = Math.max(0, this.resultDelay - delta); if (this.resultDelay <= 0) this.showMinimalResult(); return; }
        this.elapsed += delta / 1000; this.fireGate = Math.max(0, this.fireGate - delta); this.faceGate = Math.max(0, this.faceGate - delta);
        this.windowLeft = Math.max(0, this.windowLeft - delta);
        this.gunKickLeft = Math.max(0, this.gunKickLeft - delta);
        this.resultDelay = Math.max(0, this.resultDelay - delta);
        this.updateGunKick();
        this.updateBossPosition(time);
        this.updateWorldBossFlight(delta / 1000);
        this.detectFaceHeavy();
        if (this.fireHeld && this.fireGate <= 0) this.fire();
        if (this.phase === 'window' && this.windowLeft <= 0) this.restoreShield();
        if (this.elapsed >= 30) this.finish(false);
        this.updateHud();
    }

    private object<T extends GameObject>(id: string): T { return this.add.existing(id) as T; }
    private beginFire(): void { if (this.isRecording && this.phase !== 'result') this.fireHeld = true; }
    private endFire(): void { this.fireHeld = false; }
    private handleRecordStart(): void { this.isRecording = true; this.resetGame(); }
    private handleRecordEnd(): void { this.isRecording = false; this.fireHeld = false; this.sound.stopAll(); }

    private bindWorldBoss(): void {
        const scene = this.game.getSceneObject().scene;
        this.worldBoss = scene.findSceneObject('Boss');
        if (this.worldBoss) {
            this.worldBossTransform = this.worldBoss.getTransform();
            this.worldBossBase = this.worldBossTransform.getWorldPosition();
            this.worldBoss.setEnabledInHierarchy(true);
        }
        const roots = scene.getRootSceneObjects();
        for (let i = 0; i < roots.length && !this.arCamera; i++) this.findTrackedCamera(roots[i]);
    }

    private hideLegacySceneObjects(): void {
        const scene = this.game.getSceneObject().scene;
        const oldIds = ['血条', '血条填充', '准星', '音效', '结算', '失败', '胜利'];
        for (let i = 0; i < oldIds.length; i++) {
            const legacy = scene.findSceneObject(oldIds[i]);
            if (legacy && legacy !== this.worldBoss) legacy.setEnabledInHierarchy(false);
        }
    }

    private findTrackedCamera(node: APJS.SceneObject): void {
        if (node.getComponent('DeviceTracker')) {
            const camera = node.getComponent('Camera');
            if (camera) { this.arCamera = camera as APJS.Camera; return; }
        }
        const children = node.getChildren();
        for (let i = 0; i < children.length && !this.arCamera; i++) this.findTrackedCamera(children[i]);
    }

    private updateWorldBossFlight(dt: number): void {
        if (!this.worldBossTransform || !this.worldBossBase) return;
        this.worldFlightTime += dt;
        const speed = this.phase === 'rage' ? 1.6 : 1;
        const dx = Math.sin(this.worldFlightTime * 0.7 * speed) * 0.6;
        const dy = Math.sin(this.worldFlightTime * 1.2 * speed) * 0.9;
        this.worldBossTransform.setWorldPosition(new APJS.Vector3f(this.worldBossBase.x + dx, this.worldBossBase.y + dy, this.worldBossBase.z));
    }

    private isWorldBossOnCrosshair(): boolean {
        if (!this.worldBossTransform || !this.arCamera) return false;
        const viewport = this.arCamera.worldToViewportPoint(this.worldBossTransform.getWorldPosition());
        return viewport.z > 0 && Math.abs(viewport.x - 0.5) <= 0.17 && Math.abs(viewport.y - 0.5) <= 0.17;
    }

    private updateGunKick(): void {
        const recoil = this.gunKickLeft > 0 ? Math.min(1, this.gunKickLeft / 90) : 0;
        this.gun.setPosition(560 + recoil * 18, 1000 + recoil * 14);
        this.gun.setAngle(recoil * 4);
    }

    private updateBossPosition(time: number): void {
        if (this.worldBossTransform) {
            this.boss.setVisible(false); this.badge.setVisible(false); this.avatar.setVisible(false); this.shield.setVisible(false); this.core.setVisible(false); this.highlight.setVisible(this.isWorldBossOnCrosshair());
            return;
        }
        const rage = this.phase === 'rage' ? 1.6 : 1;
        const x = 360 + Math.sin(time * 0.0022 * rage) * 145;
        const y = 500 + Math.cos(time * 0.0016 * rage) * 78;
        this.boss.setPosition(x, y); this.badge.setPosition(x, y - 116); this.avatar.setPosition(x, y - 116); this.shield.setPosition(x, y); this.core.setPosition(x, y);
        const dx = x - 360; const dy = y - 520; const aimed = dx * dx + dy * dy <= 122 * 122;
        this.highlight.setVisible(aimed); this.boss.setDisplaySize(aimed ? 250 : 236, aimed ? 165 : 156);
    }
    private detectFaceHeavy(): void {
        if (this.faceGate > 0) return;
        const faces: Face.Result[] = this.vision.getFaces(); const face: Face.Result | undefined = faces[0];
        if (face && (face.hasAction('EyeBlink') || face.hasAction('MouthAh'))) { this.faceGate = 900; this.hit(160, true); }
    }
    private fire(): void {
        this.fireGate = 250; this.gunKickLeft = 90; this.shots += 1; this.sound.play('像素开火音');
        const aimed = this.worldBossTransform ? this.isWorldBossOnCrosshair() : (() => { const dx = this.boss.x - 360; const dy = this.boss.y - 520; return dx * dx + dy * dy <= 122 * 122; })();
        if (!aimed) { this.combo = 0; return; }
        if (this.phase === 'shield') { this.coreHits += 1; if (this.coreHits >= 3) this.breakShield(); return; }
        this.hit(80, false);
    }
    private hit(amount: number, heavy: boolean): void {
        if (this.phase === 'shield' || this.phase === 'result') return;
        this.hp = Math.max(0, this.hp - amount); this.hits += 1; this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.sound.play(heavy ? '人脸重击音' : '像素命中音');
        const spark = this.add.sprite(this.boss.x, this.boss.y, '命中星爆模板'); spark.setVisible(true).setActive(true); this.runtimeObjects.push(spark);
        this.time.delayedCall(180, () => { spark.destroy(); this.runtimeObjects = this.runtimeObjects.filter((value: GameObject) => value !== spark); }, [], this);
        if (this.hp <= 0) { this.finish(true); return; }
        if (this.hp <= 1584 && this.phase === 'warmup') this.phase = 'rage';
        if (this.hp <= 792 && (this.phase === 'warmup' || this.phase === 'rage')) this.enterShield();
    }
    private enterShield(): void { this.phase = 'shield'; this.coreHits = 0; this.shield.setVisible(true); this.core.setVisible(true); }
    private breakShield(): void { this.phase = 'window'; this.windowLeft = 2000; this.shieldRounds += 1; this.shield.setVisible(false); this.core.setVisible(false); this.sound.play('护盾破裂音'); }
    private restoreShield(): void { if (this.shieldRounds < 3) this.enterShield(); else { this.phase = 'window'; this.windowLeft = 2000; } }
    private updateHud(): void { this.hud.setText(`HP ${this.hp}   ${Math.max(0, Math.ceil(30 - this.elapsed))}s`); this.hpFill.setDisplaySize(Math.max(4, 330 * this.hp / 2400), 45); }
    private finish(win: boolean): void {
        if (this.phase === 'result') return; this.phase = 'result'; this.resultDelay = 450; this.fireHeld = false;
        for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = [];
        this.crosshair.setVisible(false); this.highlight.setVisible(false); this.gun.setVisible(true); this.hud.setVisible(false); this.hpFill.setVisible(false); this.hint.setVisible(false); this.shield.setVisible(false); this.core.setVisible(false);
        this.resultCard.setVisible(false); this.resultAvatar.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(win);
        this.resultTitle.setText(win ? '胜利！' : '挑战失败');
        if (win) this.sound.play('胜利庆祝音');
    }

    private showMinimalResult(): void {
        this.resultDelay = -1;
        this.resultTitle.setVisible(true);
        this.resultStats.setVisible(false);
        this.resultCard.setVisible(false);
        this.resultAvatar.setVisible(false);
    }

    private resetGame() {
        this.time.clear(); this.sound.stopAll(); for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = [];
        this.phase = 'warmup'; this.hp = 2400; this.elapsed = 0; this.fireHeld = false; this.fireGate = 0; this.faceGate = 0; this.coreHits = 0; this.shieldRounds = 0; this.windowLeft = 0; this.shots = 0; this.hits = 0; this.combo = 0; this.maxCombo = 0; this.gunKickLeft = 0; this.resultDelay = 0; this.worldFlightTime = 0;
        this.boss.setPosition(360, 500).setDisplaySize(236, 156).setVisible(true).setActive(true); this.badge.setPosition(360, 384).setVisible(true); this.avatar.setPosition(360, 384).setVisible(true);
        this.crosshair.setVisible(true); this.highlight.setVisible(false); this.gun.setPosition(560, 1000).setAngle(0).setVisible(true); this.shield.setVisible(false); this.core.setVisible(false); this.hpFill.setDisplaySize(330, 45).setVisible(true); this.hud.setText('HP 2400   30s').setVisible(true); this.hint.setVisible(true);
        this.resultCard.setVisible(false); this.resultAvatar.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(false);
    }
}

/**
 * Entry Point
 */
@component()
export class GameManager extends Game2D {
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
