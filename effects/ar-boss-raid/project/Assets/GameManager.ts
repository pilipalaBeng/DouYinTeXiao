import {Game2D, GameObject, Scene, Sprite, Text} from './Game2D';
import {Face, install, Vision} from './Vision';

const GroupDepth = {
    // Use scene-builder group names. Game2D will reset all direct children under each group.
    // 背景: 100,
    玩法: 1000,
    UI界面: 3000,
    结算界面: 4000,
} as const;

/** 预览/渲染分辨率（左上原点）。 */
const SCREEN_W = 720;
const SCREEN_H = 1280;
/** 准星中心与命中容差半径，单位像素（左上原点）。 */
const CROSS_X = 360;
const CROSS_Y = 520;
const AIM_RADIUS = 122;

/** 3D Boss 的空间参数，单位：米。
 *  BOSS_MIN/MAX_DIST 是「距开局锚点」的球壳半径；锚点本身在相机视轴前方 SPAWN_DIST 米。
 *  尺寸依据（探针实测）：AR 相机 fov=60°、fovType=Custom(0)，距离 D 处屏幕竖向覆盖 ≈ 1.155×D 米。
 *  故 BOSS_CORE_SIZE=1.5 + SPAWN_DIST=2 → 约占屏高 65%（最近 1.4m 处约 93%，最远 2.6m 处约 50%）。
 *  想整体调大/调小观感，只改 BOSS_CORE_SIZE 即可（场景里该组件默认 size 是 10，脚本会覆盖它）。
 */
const BOSS_CORE_SIZE = 1.5;
const BOSS_MIN_DIST = 0.3;
const BOSS_MAX_DIST = 0.6;
const BOSS_SPEED = 0.05;
/** 开局投放距离：沿相机视轴前方多少米。 */
const SPAWN_DIST = 2;
/** 投放闸门兜底：等 AR 相机离原点（SLAM 就位）最多等多久，超时则按当前位置投放。 */
const SPAWN_WAIT_MS = 2500;

/**
 * Main Scene
 * Grow gameplay behavior in small passes (Phaser-style).
 * Update visual-effect interactions and dynamic behavior in real time.
 *
 * v3：Boss 改为真 3D 空间锚定对象（世界坐标 + AR 相机投影），
 * 转动手机即可在空间中寻找它；准星固定屏幕中心，命中判定基于投影坐标。
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

    // ---- 3D 空间 Boss ----
    private bossSpatial: APJS.SceneObject | null = null;
    private bossImage: APJS.Image | null = null;
    private arCamera: APJS.Camera | null = null;
    /** 开局锚点（固定值）：屏幕中心前方 SPAWN_DIST 米的世界坐标，用于投放与漂移约束。 */
    private spawnOrigin: APJS.Vector3f = new APJS.Vector3f(0, 0, -3);
    private bossPos: APJS.Vector3f = new APJS.Vector3f(0, 1.2, 3.5);
    private bossVel: APJS.Vector3f = new APJS.Vector3f(0.6, 0.25, 0.4);
    private bossScreenX: number = CROSS_X;
    private bossScreenY: number = CROSS_Y;
    private bossOnScreen: boolean = false;
    /** 开局投放闸门：等 AR 相机被 SLAM 就位后再投放，避免锚点算在世界原点。 */
    private spawnReady: boolean = false;
    private spawnWait: number = 0;

    // ---- 2D 资源与跟随物 ----
    private idleTexture: APJS.Texture | null = null;
    private wingTextures: (APJS.Texture | null)[] = [];
    private rageTexture: APJS.Texture | null = null;
    private friendlyTexture: APJS.Texture | null = null;
    private wingFrameIndex: number = 0;
    private wingFrameLeft: number = 0;
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
    private resultTitle!: Text;
    private resultStats!: Text;
    private confetti!: Sprite;
    private hitHighlightLeft: number = 0;

    create(): void {
        this.resetSceneDepths(GroupDepth);
        this.vision = install(this);
        this.initSpatialBoss();
        // 阶段与动画帧贴图仍从 2D 模板对象取纹理，再贴到 3D 本体上。
        this.wingTextures = [
            this.optionalTexture('Boss振翅帧1模板'), this.optionalTexture('Boss振翅帧2模板'),
            this.optionalTexture('Boss振翅帧3模板'), this.optionalTexture('Boss振翅帧4模板'),
        ];
        this.rageTexture = this.optionalTexture('能量核心活跃模板');
        this.friendlyTexture = this.optionalTexture('能量核心友好模板');
        this.shield = this.object<Sprite>('护盾覆盖'); this.core = this.object<Sprite>('护盾核心'); this.crosshair = this.object<Sprite>('固定准星');
        this.highlight = this.object<Sprite>('准星命中高亮'); this.gun = this.object<Sprite>('古代战弩'); this.hpFill = this.object<Sprite>('Boss血条填充');
        this.gunBaseTexture = this.gun.getTexture()!;
        // 战弩三张动作帧属可选素材：对象缺失或尚未生成时回退到基础帧，避免对 null 取贴图直接崩。
        this.gunDrawTexture = this.optionalTexture('战弩拉弦模板') || this.gunBaseTexture;
        this.gunFireTexture = this.optionalTexture('战弩击发模板') || this.gunBaseTexture;
        this.gunReturnTexture = this.optionalTexture('战弩回位模板') || this.gunBaseTexture;
        this.hud = this.object<Text>('HUD文字'); this.hint = this.object<Text>('开局提示'); this.resultCard = this.object<Sprite>('结算卡');
        this.resultTitle = this.object<Text>('结算标题'); this.resultStats = this.object<Text>('结算战绩'); this.confetti = this.object<Sprite>('胜利彩带');
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
        this.updateBossSpatial(delta);
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

    /** 取得 3D Boss 载体与 AR 相机；缺任一项时降级（Boss 不显示、不可命中），不抛错。 */
    private initSpatialBoss(): void {
        const engine = this.sys.engineScene;
        const bossObj = engine.findSceneObject('Boss空间体');
        this.bossSpatial = bossObj;
        this.bossImage = bossObj ? (bossObj.getComponent('Image') as APJS.Image) : null;
        if (this.bossImage) this.bossImage.size = new APJS.Vector2f(BOSS_CORE_SIZE, BOSS_CORE_SIZE);
        const camObj = engine.findSceneObject('AR摄像机');
        this.arCamera = camObj ? (camObj.getComponent('Camera') as APJS.Camera) : null;
        this.idleTexture = this.bossImage ? this.bossImage.texture : null;
        if (!this.bossImage || !this.arCamera) {
            console.warn(`[guard] spatial boss not ready: image=${!!this.bossImage} camera=${!!this.arCamera}`);
        }
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
        if (this.phase === 'result' || this.wingTextures.length === 0) return;
        this.wingFrameLeft -= delta;
        if (this.wingFrameLeft > 0) return;
        this.wingFrameLeft += 115;
        this.wingFrameIndex = (this.wingFrameIndex + 1) % this.wingTextures.length;
        this.setBossTexture(this.wingTextures[this.wingFrameIndex]);
    }

    /**
     * 真 3D：Boss 在世界空间随机漂移，约束在以玩家为球心的球壳内；
     * 每帧把世界坐标投影到屏幕，驱动 2D 跟随物与命中判定。
     */
    private updateBossSpatial(delta: number): void {
        if (!this.spawnReady) { this.trySpawnBoss(delta); return; }
        const dt = Math.min(0.05, delta / 1000);
        const rage = this.phase === 'rage' ? 1.6 : 1;
        this.driftStep(dt, rage);
        if (this.bossSpatial) this.bossSpatial.getTransform().setWorldPosition(this.bossPos);
        this.projectBoss();
        this.syncFollowers();
    }

    /**
     * 投放闸门：AR 相机的世界位置由 DeviceTracker / SLAM 驱动，开局瞬间多半仍在原点，
     * 此时算出的锚点必然错误（探针实测 cam=(0,0,0) → origin=(0,0,-2)）。
     * 因此等相机离开原点后再投放；最多等 SPAWN_WAIT_MS 兜底，避免设备始终为原点时永不出现。
     */
    private trySpawnBoss(delta: number): void {
        this.spawnWait += delta;
        const camObj = this.sys.engineScene.findSceneObject('AR摄像机');
        const cp = camObj ? camObj.getTransform().getWorldPosition() : null;
        const camMoved = !!cp && (Math.abs(cp.x) + Math.abs(cp.y) + Math.abs(cp.z)) > 0.01;
        if (!camMoved && this.spawnWait < SPAWN_WAIT_MS) {
            if (this.bossSpatial) this.bossSpatial.enabled = false;
            return;
        }
        this.spawnBossInSpace();
        this.spawnReady = true;
        console.log(`[probe] spawn fired: camMoved=${camMoved} waited=${Math.round(this.spawnWait)}ms`);
    }

    private driftStep(dt: number, rage: number): void {
        const jitter = 1.2 * dt;
        this.bossVel.x += (Math.random() - 0.5) * jitter;
        this.bossVel.y += (Math.random() - 0.5) * jitter * 0.7;
        this.bossVel.z += (Math.random() - 0.5) * jitter * 0.7;
        const speed = Math.sqrt(this.bossVel.x ** 2 + this.bossVel.y ** 2 + this.bossVel.z ** 2) || 0.0001;
        const scale = Math.max(0.85, Math.min(1.15, BOSS_SPEED * rage / speed));
        this.bossVel.x *= scale; this.bossVel.y *= scale; this.bossVel.z *= scale;
        this.bossPos.x += this.bossVel.x * dt;
        this.bossPos.y += this.bossVel.y * dt;
        this.bossPos.z += this.bossVel.z * dt;
        // 球壳约束以「开局锚点」为球心（固定值）。若以相机为球心会把 Boss 绑在镜头前，失去"转身寻找"的意义。
        const rx = this.bossPos.x - this.spawnOrigin.x, ry = this.bossPos.y - this.spawnOrigin.y, rz = this.bossPos.z - this.spawnOrigin.z;
        const dist = Math.sqrt(rx * rx + ry * ry + rz * rz) || 0.0001;
        if (dist >= BOSS_MIN_DIST && dist <= BOSS_MAX_DIST) return;
        const nx = rx / dist, ny = ry / dist, nz = rz / dist;
        const push = dist > BOSS_MAX_DIST ? 1 : -1;
        const outward = (this.bossVel.x * nx + this.bossVel.y * ny + this.bossVel.z * nz) * push;
        if (outward > 0) {
            this.bossVel.x -= 2 * outward * nx; this.bossVel.y -= 2 * outward * ny; this.bossVel.z -= 2 * outward * nz;
        } else {
            this.bossVel.x += nx * push * 0.5; this.bossVel.y += ny * push * 0.5; this.bossVel.z += nz * push * 0.5;
        }
    }

    /** 真机诊断探针：打印相机、朝向、锚点、Boss 世界坐标与投影结果。定位完毕后应移除。 */
    private probeSpatial(tag: string): void {
        const camObj = this.sys.engineScene.findSceneObject('AR摄像机');
        const cp = camObj ? camObj.getTransform().getWorldPosition() : null;
        const look = this.arCamera ? this.arCamera.getLookAt() : null;
        const len = look ? Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z) : 0;
        const sp = this.arCamera ? this.arCamera.worldToScreenPoint(this.bossPos) : null;
        const n = (v: number): string => (Math.round(v * 100) / 100).toString();
        const p = (v: APJS.Vector3f | null): string => (v ? `(${n(v.x)},${n(v.y)},${n(v.z)})` : 'null');
        const fov = this.arCamera ? n(this.arCamera.fov) : 'n/a';
        const fovType = this.arCamera ? String(this.arCamera.fovType) : 'n/a';
        let dist = 0;
        if (cp) {
            const dx = this.bossPos.x - cp.x, dy = this.bossPos.y - cp.y, dz = this.bossPos.z - cp.z;
            dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        console.log(`[probe ${tag}] dist=${n(dist)}m cam=${p(cp)} look=${p(look)} |look|=${n(len)} origin=${p(this.spawnOrigin)} boss=${p(this.bossPos)} screen=${p(sp)} on=${this.bossOnScreen} size=${BOSS_CORE_SIZE} spawnReady=${this.spawnReady} wait=${Math.round(this.spawnWait)}ms fov=${fov} fovType=${fovType}`);
    }

    /** 世界坐标 → 屏幕像素（worldToScreenPoint 返回左下原点，此处翻转为左上原点）。 */
    private projectBoss(): void {
        if (!this.arCamera) { this.bossOnScreen = false; return; }
        const sp = this.arCamera.worldToScreenPoint(this.bossPos);
        this.bossOnScreen = sp.z > 0.2;
        this.bossScreenX = sp.x;
        this.bossScreenY = SCREEN_H - sp.y;
    }

    private syncFollowers(): void {
        const visible = this.bossOnScreen && this.phase !== 'result';
        this.shield.setPosition(this.bossScreenX, this.bossScreenY);
        this.core.setPosition(this.bossScreenX, this.bossScreenY);
        this.highlight.setPosition(this.bossScreenX, this.bossScreenY);
        this.highlight.setVisible(visible && this.hitHighlightLeft > 0);
        if (this.bossSpatial) this.bossSpatial.enabled = visible;
    }

    private isAimed(): boolean {
        if (!this.bossOnScreen) return false;
        const dx = this.bossScreenX - CROSS_X;
        const dy = this.bossScreenY - CROSS_Y;
        return dx * dx + dy * dy <= AIM_RADIUS * AIM_RADIUS;
    }

    private detectFaceHeavy(): void {
        if (this.faceGate > 0) return;
        const faces: Face.Result[] = this.vision.getFaces(); const face: Face.Result | undefined = faces[0];
        if (face && (face.hasAction('EyeBlink') || face.hasAction('MouthAh'))) { this.faceGate = 900; this.hit(160, true); }
    }

    private fire(): void {
        this.fireGate = 250; this.gunKickLeft = 140; this.gunAnimLeft = 140; this.shots += 1; this.sound.play('像素开火音');
        const aimed = this.isAimed();
        this.spawnArrow(aimed ? this.bossScreenX : CROSS_X, aimed ? this.bossScreenY : CROSS_Y);
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
        if (this.phase === 'shield' || this.phase === 'result' || !this.bossOnScreen) return;
        this.hp = Math.max(0, this.hp - amount); this.hits += 1; this.combo += 1; this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.sound.play(heavy ? '人脸重击音' : '像素命中音');
        this.hitHighlightLeft = 140;
        this.highlight.setVisible(true);
        const spark = this.add.sprite(this.bossScreenX, this.bossScreenY, '命中星爆模板'); spark.setVisible(true).setActive(true); this.runtimeObjects.push(spark);
        this.time.delayedCall(180, () => { spark.destroy(); this.runtimeObjects = this.runtimeObjects.filter((value: GameObject) => value !== spark); }, [], this);
        if (this.hp <= 0) { this.finish(true); return; }
        if (this.hp <= 1584 && this.phase === 'warmup') { this.phase = 'rage'; this.setBossTexture(this.rageTexture); }
        if (this.hp <= 792 && (this.phase === 'warmup' || this.phase === 'rage')) this.enterShield();
    }

    private setBossTexture(texture: APJS.Texture | null): void {
        if (texture && this.bossImage) this.bossImage.texture = texture;
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
        this.setBossTexture(win ? this.friendlyTexture : this.rageTexture);
        this.resultCard.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(win);
        this.resultTitle.setText(win ? '警报解除！' : '挑战结束');
        this.resultStats.setText(`同步率 ${this.shots > 0 ? Math.round(this.hits * 100 / this.shots) : 0}%\n连击 ${this.maxCombo} 评级 ${win ? 'B' : 'C'}`);
        if (win) this.sound.play('胜利庆祝音');
    }

    private showMinimalResult(): void {
        this.resultDelay = -1;
        this.resultTitle.setVisible(true);
        this.resultStats.setVisible(true);
        this.resultCard.setVisible(true);
    }

    private resetGame() {
        this.time.clear(); this.sound.stopAll(); for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = []; this.flyingArrows = [];
        this.phase = 'warmup'; this.hp = 2400; this.elapsed = 0; this.fireHeld = false; this.fireGate = 0; this.faceGate = 0; this.coreHits = 0; this.shieldRounds = 0; this.windowLeft = 0; this.shots = 0; this.hits = 0; this.combo = 0; this.maxCombo = 0; this.gunKickLeft = 0; this.gunAnimLeft = 0; this.resultDelay = 0; this.hitHighlightLeft = 0;
        this.wingFrameIndex = 0; this.wingFrameLeft = 115;
        // 不在 reset 内立即投放：此刻 AR 相机多半还没被 SLAM 驱动（世界位置=原点），
        // 锚点会算到错误位置，表现为「Boss 极小」或「跑到相机背后完全看不见」。
        // 改为交给 update 里的投放闸门，等相机就位后再算锚点。
        this.spawnReady = false; this.spawnWait = 0;
        if (this.bossSpatial) this.bossSpatial.enabled = false;
        this.setBossTexture(this.idleTexture);
        this.crosshair.setVisible(true); this.highlight.setVisible(false); this.gun.setFlipX(false).setPosition(this.gunBaseX, this.gunBaseY).setAngle(this.gunBaseAngle).setTexture(this.gunBaseTexture).setVisible(true); this.shield.setVisible(false); this.core.setVisible(false); this.hpFill.setVisible(true); this.setHpFillAmount(); this.hud.setText('稳定 2400   30s').setVisible(true); this.hint.setText('转动手机对准，按住能量脉冲').setVisible(true);
        this.resultCard.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(false);
        // 真机空间诊断探针：每次开局分三个时间点采样，用于定位「看不见 Boss」。
        this.time.delayedCall(1500, () => this.probeSpatial('t1.5'), [], this);
        this.time.delayedCall(3000, () => this.probeSpatial('t3.0'), [], this);
        this.time.delayedCall(4500, () => this.probeSpatial('t4.5'), [], this);
    }

    /**
     * 每局开局把 Boss 投放到「屏幕中心前方 SPAWN_DIST 米」附近。
     * AR 相机由 DeviceTracker 驱动，其世界位置并不在原点，因此必须用
     * 「相机世界位置 + getLookAt() 朝向」沿视轴前推取锚点，否则 Boss 会落到视野之外。
     * （早前试过 viewportToWorldPoint / screenToWorldPoint，实测与 worldToScreenPoint 基准不一致，已弃用。）
     */
    private spawnBossInSpace(): void {
        const camObj = this.sys.engineScene.findSceneObject('AR摄像机');
        if (this.arCamera && camObj) {
            // AR 相机由 DeviceTracker 驱动，其位置/朝向只能运行时读取：
            // 用相机世界位置 + getLookAt() 朝向（单位向量）沿视轴前推 SPAWN_DIST 米作为开局锚点。
            const camPos = camObj.getTransform().getWorldPosition();
            const look = this.arCamera.getLookAt();
            // 防御：getLookAt 若返回非单位向量，直接乘米数会把锚点甩到很远（表现为"Boss 极小/找不到"）。
            const lookLen = Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z) || 1;
            this.spawnOrigin.x = camPos.x + (look.x / lookLen) * SPAWN_DIST;
            this.spawnOrigin.y = camPos.y + (look.y / lookLen) * SPAWN_DIST;
            this.spawnOrigin.z = camPos.z + (look.z / lookLen) * SPAWN_DIST;
        }
        this.bossPos.x = this.spawnOrigin.x + (Math.random() - 0.5) * 0.6;
        this.bossPos.y = this.spawnOrigin.y + (Math.random() - 0.5) * 0.4;
        this.bossPos.z = this.spawnOrigin.z + (Math.random() - 0.5) * 0.6;
        this.bossVel.x = (Math.random() - 0.5) * BOSS_SPEED * 2;
        this.bossVel.y = (Math.random() - 0.5) * BOSS_SPEED;
        this.bossVel.z = (Math.random() - 0.5) * BOSS_SPEED * 2;
        if (this.bossSpatial) {
            this.bossSpatial.getTransform().setWorldPosition(this.bossPos);
            this.bossSpatial.enabled = true;
        }
        this.projectBoss();
        this.syncFollowers();
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
