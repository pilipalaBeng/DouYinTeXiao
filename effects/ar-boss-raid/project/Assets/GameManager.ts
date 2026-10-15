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
    private gunBaseX: number = 506;
    private gunBaseY: number = 1004;
    private gunBaseAngle: number = 0;
    private resultDelay: number = 0;
    private flyingArrows: {sprite: Sprite; startX: number; startY: number; endX: number; endY: number; elapsed: number; duration: number}[] = [];
    private boss!: Sprite;
    private idleTexture!: APJS.Texture;
    private wingTemplates: Sprite[] = [];
    private wingFrameIndex: number = 0;
    private wingFrameLeft: number = 0;
    private rageTemplate!: Sprite;
    private friendlyTemplate!: Sprite;
    private badge!: Sprite;
    private avatar!: Sprite;
    private shield!: Sprite;
    private core!: Sprite;
    private crosshair!: Sprite;
    private highlight!: Sprite;
    private gun!: Sprite;
    private gunBaseTexture!: APJS.Texture;
    private gunDrawTexture!: APJS.Texture;
    private gunFireTexture!: APJS.Texture;
    private gunReturnTexture!: APJS.Texture;
    private gunAnimLeft: number = 0;
    private hpFill!: Sprite;
    private hud!: Text;
    private hint!: Text;
    private resultCard!: Sprite;
    private resultAvatar!: Sprite;
    private resultTitle!: Text;
    private resultStats!: Text;
    private confetti!: Sprite;
    private hitHighlightLeft: number = 0;
    private bossWorld = { yaw: 0, pitch: 0, distance: 0.5, time: 0 };
    private faceSmooth = { x: 0.5, y: 0.5 };
    private faceHasRef: boolean = false;
    private readonly FOV_PX: number = 700;
    private readonly PARALLAX_MAX: number = 220;

    create(): void {
        this.resetSceneDepths(GroupDepth);
        this.vision = install(this);
        this.boss = this.object<Sprite>('Boss主体'); this.idleTexture = this.boss.getTexture()!;
        this.wingTemplates = [
            this.object<Sprite>('Boss振翅帧1模板'), this.object<Sprite>('Boss振翅帧2模板'),
            this.object<Sprite>('Boss振翅帧3模板'), this.object<Sprite>('Boss振翅帧4模板'),
        ];
        this.rageTemplate = this.object<Sprite>('能量核心活跃模板'); this.friendlyTemplate = this.object<Sprite>('能量核心友好模板'); this.badge = this.object<Sprite>('Boss出战牌'); this.avatar = this.object<Sprite>('Boss头像');
        this.shield = this.object<Sprite>('护盾覆盖'); this.core = this.object<Sprite>('护盾核心'); this.crosshair = this.object<Sprite>('固定准星');
        this.highlight = this.object<Sprite>('准星命中高亮'); this.gun = this.object<Sprite>('古代战弩'); this.hpFill = this.object<Sprite>('Boss血条填充');
        this.gunBaseTexture = this.gun.getTexture()!;
        // 战弩三张动作帧属可选素材：对象缺失或尚未生成时回退到基础帧，避免对 null 取贴图直接崩。
        this.gunDrawTexture = this.optionalTexture('战弩拉弦模板') || this.gunBaseTexture;
        this.gunFireTexture = this.optionalTexture('战弩击发模板') || this.gunBaseTexture;
        this.gunReturnTexture = this.optionalTexture('战弩回位模板') || this.gunBaseTexture;
        this.hud = this.object<Text>('HUD文字'); this.hint = this.object<Text>('开局提示'); this.resultCard = this.object<Sprite>('结算卡');
        this.resultAvatar = this.object<Sprite>('结算头像'); this.resultTitle = this.object<Text>('结算标题'); this.resultStats = this.object<Text>('结算战绩'); this.confetti = this.object<Sprite>('胜利彩带');
        this.input.on('pointerdown', this.beginFire, this); this.input.on('pointerup', this.endFire, this);
        this.input.on('RecordStart', this.handleRecordStart, this); this.input.on('RecordEnd', this.handleRecordEnd, this);
        // 旧场景对象不参与当前 2D 能量挑战。
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
        this.gunAnimLeft = Math.max(0, this.gunAnimLeft - delta);
        this.hitHighlightLeft = Math.max(0, this.hitHighlightLeft - delta);
        this.resultDelay = Math.max(0, this.resultDelay - delta);
        this.updateGunKick();
        this.updateFlyingArrows(delta);
        this.updateWingAnimation(delta);
        this.updateBoss3D(time, delta);
        this.detectFaceHeavy();
        if (this.fireHeld && this.fireGate <= 0) this.fire();
        if (this.phase === 'window' && this.windowLeft <= 0) this.restoreShield();
        if (this.elapsed >= 30) this.finish(false);
        this.updateHud();
    }

    private object<T extends GameObject>(id: string): T { return this.add.existing(id) as T; }

    /** 可选素材读取：对象不存在时返回 null，交给调用方回退，不抛错。 */
    private optionalTexture(id: string): APJS.Texture | null {
        const sprite = this.object<Sprite>(id);
        return sprite ? sprite.getTexture() : null;
    }

    private beginFire(): void { if (this.isRecording && this.phase !== 'result') this.fireHeld = true; }
    private endFire(): void { this.fireHeld = false; }
    private handleRecordStart(): void { this.isRecording = true; this.resetGame(); }
    private handleRecordEnd(): void { this.isRecording = false; this.fireHeld = false; this.sound.stopAll(); }

    private updateGunKick(): void {
        const recoil = this.gunKickLeft > 0 ? Math.min(1, this.gunKickLeft / 90) : 0;
        this.gun.setFlipX(false);
        this.gun.setPosition(this.gunBaseX + recoil * 12, this.gunBaseY + recoil * 10);
        this.gun.setAngle(this.gunBaseAngle + recoil * 1.5);
        if (this.gunAnimLeft > 90) this.gun.setTexture(this.gunDrawTexture);
        else if (this.gunAnimLeft > 40) this.gun.setTexture(this.gunFireTexture);
        else if (this.gunAnimLeft > 0) this.gun.setTexture(this.gunReturnTexture);
        else this.gun.setTexture(this.gunBaseTexture);
    }

    private updateFlyingArrows(delta: number): void {
        const active: typeof this.flyingArrows = [];
        for (const arrow of this.flyingArrows) {
            arrow.elapsed += delta;
            const progress = Math.min(1, arrow.elapsed / arrow.duration);
            arrow.sprite.setPosition(
                arrow.startX + (arrow.endX - arrow.startX) * progress,
                arrow.startY + (arrow.endY - arrow.startY) * progress,
            );
            if (progress < 1) active.push(arrow);
            else arrow.sprite.destroy();
        }
        this.flyingArrows = active;
    }

    private spawnArrow(targetX: number, targetY: number): void {
        const startX = 426;
        const startY = 938;
        const arrow = this.add.sprite(startX, startY, '弹幕模板');
        const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
        arrow.setDisplaySize(52, 16).setAngle(angle).setVisible(true).setActive(true);
        this.runtimeObjects.push(arrow);
        this.flyingArrows.push({sprite: arrow, startX, startY, endX: targetX, endY: targetY, elapsed: 0, duration: 160});
    }

    private updateWingAnimation(delta: number): void {
        if (this.phase === 'result') return;
        this.wingFrameLeft -= delta;
        if (this.wingFrameLeft > 0) return;
        this.wingFrameLeft += 115;
        this.wingFrameIndex = (this.wingFrameIndex + 1) % this.wingTemplates.length;
        const texture = this.wingTemplates[this.wingFrameIndex].getTexture();
        if (texture) this.boss.setTexture(texture);
    }

    private updateBoss3D(time: number, delta: number): void {
        const rage = this.phase === 'rage' ? 1.7 : 1;
        this.bossWorld.time += delta * 0.001 * rage;
        this.bossWorld.yaw = Math.sin(this.bossWorld.time * 0.7) * 0.55 + Math.sin(this.bossWorld.time * 1.3) * 0.15;
        this.bossWorld.pitch = Math.sin(this.bossWorld.time * 0.9 + 1.0) * 0.35 + Math.cos(this.bossWorld.time * 1.1) * 0.1;
        this.bossWorld.distance = 0.35 + 0.35 * (Math.sin(this.bossWorld.time * 0.4) + 1);
        const faces: Face.Result[] = this.vision.getFaces();
        const face: Face.Result | undefined = faces[0];
        if (face) {
            const cx = face.box.x + face.box.width * 0.5;
            const cy = face.box.y + face.box.height * 0.5;
            const k = 1 - Math.exp(-delta * 0.004);
            this.faceSmooth.x += (cx - this.faceSmooth.x) * k;
            this.faceSmooth.y += (cy - this.faceSmooth.y) * k;
            this.faceHasRef = true;
        } else if (!this.faceHasRef) {
            this.faceSmooth.x = 0.5;
            this.faceSmooth.y = 0.5;
        }
        const z = this.bossWorld.distance;
        const fov = (0.4 + 0.6 * z) * this.FOV_PX;
        const parallaxX = (this.faceSmooth.x - 0.5) * this.PARALLAX_MAX * z;
        const parallaxY = (this.faceSmooth.y - 0.5) * this.PARALLAX_MAX * z;
        let x = 360 + this.bossWorld.yaw * fov + parallaxX;
        let y = 520 - this.bossWorld.pitch * fov + parallaxY;
        x = Math.max(130, Math.min(590, x));
        y = Math.max(320, Math.min(780, y));
        this.boss.setPosition(x, y); this.badge.setPosition(x, y - 104); this.avatar.setPosition(x, y - 104); this.shield.setPosition(x, y); this.core.setPosition(x, y);
        const dx = x - 360; const dy = y - 520; const aimed = dx * dx + dy * dy <= 122 * 122;
        this.highlight.setVisible(this.hitHighlightLeft > 0);
        const aimScale = aimed ? 1.06 : 1;
        const distScale = 0.65 + 0.55 * z;
        this.boss.setDisplaySize(236 * distScale * aimScale, 126 * distScale * aimScale);
    }
    private detectFaceHeavy(): void {
        if (this.faceGate > 0) return;
        const faces: Face.Result[] = this.vision.getFaces(); const face: Face.Result | undefined = faces[0];
        if (face && (face.hasAction('EyeBlink') || face.hasAction('MouthAh'))) { this.faceGate = 900; this.hit(160, true); }
    }
    private fire(): void {
        this.fireGate = 250; this.gunKickLeft = 140; this.gunAnimLeft = 140; this.shots += 1; this.sound.play('像素开火音');
        const dx = this.boss.x - 360; const dy = this.boss.y - 520;
        const aimed = dx * dx + dy * dy <= 122 * 122;
        this.spawnArrow(aimed ? this.boss.x : 360, aimed ? this.boss.y : 520);
        if (!aimed) { this.combo = 0; return; }
        const hitShieldCore = this.phase === 'shield';
        this.time.delayedCall(160, () => this.resolveArrowHit(hitShieldCore), [], this);
    }

    private resolveArrowHit(hitShieldCore: boolean): void {
        if (this.phase === 'result') return;
        if (hitShieldCore && this.phase === 'shield') {
            this.coreHits += 1;
            if (this.coreHits >= 3) this.breakShield();
            return;
        }
        if (!hitShieldCore && this.phase !== 'shield') this.hit(80, false);
    }
    private hit(amount: number, heavy: boolean): void {
        if (this.phase === 'shield' || this.phase === 'result') return;
        this.hp = Math.max(0, this.hp - amount); this.hits += 1; this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.sound.play(heavy ? '人脸重击音' : '像素命中音');
        this.hitHighlightLeft = 140;
        this.highlight.setVisible(true);
        const spark = this.add.sprite(this.boss.x, this.boss.y, '命中星爆模板'); spark.setVisible(true).setActive(true); this.runtimeObjects.push(spark);
        this.time.delayedCall(180, () => { spark.destroy(); this.runtimeObjects = this.runtimeObjects.filter((value: GameObject) => value !== spark); }, [], this);
        if (this.hp <= 0) { this.finish(true); return; }
        if (this.hp <= 1584 && this.phase === 'warmup') { this.phase = 'rage'; this.applyBossTexture(this.rageTemplate); }
        if (this.hp <= 792 && (this.phase === 'warmup' || this.phase === 'rage')) this.enterShield();
    }
    private applyBossTexture(template: Sprite): void {
        const texture = template.getTexture();
        if (texture) this.boss.setTexture(texture);
    }

    private enterShield(): void { this.phase = 'shield'; this.coreHits = 0; this.shield.setVisible(true); this.core.setVisible(true); }
    private breakShield(): void { this.phase = 'window'; this.windowLeft = 2000; this.shieldRounds += 1; this.shield.setVisible(false); this.core.setVisible(false); this.sound.play('护盾破裂音'); }
    private restoreShield(): void { if (this.shieldRounds < 3) this.enterShield(); else { this.phase = 'window'; this.windowLeft = 2000; } }
    private setHpFillAmount(): void {
        const ratio = Math.max(0, Math.min(1, this.hp / 2400));
        const image = this.hpFill.getEngineComponent('Image') as {fillAmount: number} | null;
        if (image) image.fillAmount = ratio;
    }

    private updateHud(): void {
        this.hud.setText(`稳定 ${this.hp}   ${Math.max(0, Math.ceil(30 - this.elapsed))}s`);
        this.setHpFillAmount();
    }
    private finish(win: boolean): void {
        if (this.phase === 'result') return; this.phase = 'result'; this.resultDelay = 450; this.fireHeld = false;
        for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = []; this.flyingArrows = [];
        this.crosshair.setVisible(false); this.highlight.setVisible(false); this.gun.setVisible(true); this.hud.setVisible(false); this.hpFill.setVisible(false); this.hint.setVisible(false); this.shield.setVisible(false); this.core.setVisible(false);
        this.applyBossTexture(win ? this.friendlyTemplate : this.rageTemplate);
        this.boss.setVisible(true).setActive(true);
        this.resultCard.setVisible(false); this.resultAvatar.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(win);
        this.resultTitle.setText(win ? '警报解除！' : '挑战结束');
        this.resultStats.setText(`同步率 ${this.shots > 0 ? Math.round(this.hits * 100 / this.shots) : 0}%\n连击 ${this.maxCombo} 评级 ${win ? 'B' : 'C'}`);
        if (win) this.sound.play('胜利庆祝音');
    }

    private showMinimalResult(): void {
        this.resultDelay = -1;
        this.resultTitle.setVisible(true);
        this.resultStats.setVisible(true);
        this.resultCard.setVisible(true);
        this.resultAvatar.setVisible(false);
    }

    private resetGame() {
        this.time.clear(); this.sound.stopAll(); for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = []; this.flyingArrows = [];
        this.phase = 'warmup'; this.hp = 2400; this.elapsed = 0; this.fireHeld = false; this.fireGate = 0; this.faceGate = 0; this.coreHits = 0; this.shieldRounds = 0; this.windowLeft = 0; this.shots = 0; this.hits = 0; this.combo = 0; this.maxCombo = 0; this.gunKickLeft = 0; this.gunAnimLeft = 0; this.resultDelay = 0; this.hitHighlightLeft = 0;
        this.bossWorld = { yaw: 0, pitch: 0, distance: 0.5, time: 0 };
        this.faceSmooth = { x: 0.5, y: 0.5 }; this.faceHasRef = false;
        this.boss.setTexture(this.idleTexture).setPosition(360, 500).setDisplaySize(236, 126).setVisible(true).setActive(true); this.wingFrameIndex = 0; this.wingFrameLeft = 115; this.badge.setPosition(360, 396).setVisible(true); this.avatar.setPosition(360, 396).setVisible(true);
        this.crosshair.setVisible(true); this.highlight.setVisible(false); this.gun.setFlipX(false).setPosition(this.gunBaseX, this.gunBaseY).setAngle(this.gunBaseAngle).setTexture(this.gunBaseTexture).setVisible(true); this.shield.setVisible(false); this.core.setVisible(false); this.hpFill.setVisible(true); this.setHpFillAmount(); this.hud.setText('稳定 2400   30s').setVisible(true); this.hint.setText('转动手机对准，按住能量脉冲').setVisible(true);
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
