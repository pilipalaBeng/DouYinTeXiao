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

/** Boss 总血量。血条填充比例 = hp / MAX_HP；阶段阈值也由它派生，不写散魔法数字。 */
const MAX_HP = 2400;

/** 3D Boss 的空间参数，单位：米。
 *  尺寸依据（探针实测）：AR 相机 fov=60°、fovType=Custom(0)，距离 D 处屏幕竖向覆盖 ≈ 1.155×D 米。
 *  当前 BOSS_CORE_SIZE=3.0 + SPAWN_DIST=1.5 → 占屏约 173%，**已超过满屏**（会顶到脸、甚至穿进相机）。
 *  若真机出现「糊脸/穿模」，应调小 BOSS_CORE_SIZE，而不是回退距离。
 */
const BOSS_CORE_SIZE = 3.0;
/** 环绕飞行的俯仰上限（弧度）：限制在用户周围「平飞」（±约 28°），不飞到头顶或脚下。 */
const ORBIT_PITCH_MAX = 0.5;
const BOSS_SPEED = 0.025;
/** 投放后先「定在原地」多久（毫秒），让玩家先看清 Boss 在哪，再开始绕飞。
 *  作者要求：不要一上来就飞，避免玩家像抓瞎一样找。
 */
const BORN_HOLD_MS = 2500;
/** 开局投放距离：沿相机视轴前方多少米（= 环绕飞行的恒定半径）。
 *  2 -> 4 -> 6 -> 3 -> 1.5（作者两次要求拉近，均为「减半」）。**实体恒为 3.0，不随距离缩放**。
 */
const SPAWN_DIST = 1.5;
/** 投放闸门兜底：等 AR 相机离原点（SLAM 就位）最多等多久，超时则按当前位置投放。
 *  2500 -> 1200：真机实测相机 590~900ms 就位，缩短后玩家几乎无感；
 *  且现在球心每帧跟随相机，即便开局锚点算错也会立刻被纠正（不再需要长等待兜底）。
 */
const SPAWN_WAIT_MS = 1200;

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
    private hp: number = MAX_HP;
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
    /** 环绕飞行的球面坐标（相对开局视轴基）：yaw 水平、pitch 俯仰，半径恒为 SPAWN_DIST。 */
    private orbitYaw: number = 0;
    private orbitErrLeft: number = 6;
    /** 主循环异常打印配额：够查清问题，又不会刷屏。 */
    private errQuota: number = 6;
    private orbitPitch: number = 0;
    private orbitYawVel: number = 0;
    private orbitPitchVel: number = 0;
    /** 球心 = 开局时相机（用户）所在位置，整局固定不变。 */
    private userOrigin: APJS.Vector3f = new APJS.Vector3f(0, 0, 0);
    /** 开局视轴方向，作为 yaw=0 / pitch=0 的参考基，保证初始位置正好在手机正前方。 */
    private baseForward: APJS.Vector3f = new APJS.Vector3f(0, 0, -1);
    private baseRight: APJS.Vector3f = new APJS.Vector3f(1, 0, 0);
    private baseUp: APJS.Vector3f = new APJS.Vector3f(0, 1, 0);
    private bossScreenX: number = CROSS_X;
    private bossScreenY: number = CROSS_Y;
    private bossOnScreen: boolean = false;
    /** 开局投放闸门：等 AR 相机被 SLAM 就位后再投放，避免锚点算在世界原点。 */
    private spawnReady: boolean = false;
    private spawnWait: number = 0;
    /** 投放后「定住不动」的倒计时（毫秒）；归零后才开始绕飞。 */
    private bornHoldLeft: number = 0;
    /** AR 相机 Transform 缓存（billboard 每帧都要用，避免每帧做场景查找）。 */
    private arCamTransform: APJS.Transform | null = null;

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
    /** 血条填充比例脏检查缓存：与上传给材质的 _filledRange 保持一致，避免每帧重复写共享材质。 */
    private hpFillRatio: number = -1;
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
        try {
            this.tick(time, delta);
        } catch (e) {
            // 主循环未捕获异常在此收口，用独立配额打印。
            // （此前与其它探针共用配额，被耗尽后异常被静默吞掉 —— 这正是
            //   「游戏冻结却在日志里看不到任何报错」的隐蔽之处。）
            if (this.errQuota > 0) {
                this.errQuota -= 1;
                const err = e as Error;
                const st = (err.stack || '').split('\n').map((s: string) => s.trim()).slice(1, 4).join(' || ');
                console.warn(`[tick-err] ${err.message} | ${st}`);
            }
        }
    }

    private tick(time: number, delta: number): void {
        if (!this.isRecording) return;
        if (this.phase === 'result') { this.resultDelay = Math.max(0, this.resultDelay - delta); if (this.resultDelay <= 0) this.showMinimalResult(); return; }
        // 限幅：单帧步进不超过 0.1s。否则引擎首帧/卡顿后给出的超大 delta 会让 elapsed 瞬间越过 30s，
        // 直接触发 finish() 进入结算态（表现为"开局就弹结算卡、HUD 停在 30s"）。
        this.elapsed += Math.min(0.1, delta / 1000); this.fireGate = Math.max(0, this.fireGate - delta); this.faceGate = Math.max(0, this.faceGate - delta);
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
        this.arCamTransform = camObj ? camObj.getTransform() : null;
        this.idleTexture = this.bossImage ? this.bossImage.texture : null;
        if (!this.bossImage || !this.arCamera) {
            console.warn(`[guard] spatial boss not ready: image=${!!this.bossImage} camera=${!!this.arCamera}`);
        }
    }

    // 开火只受「是否已进入结算」约束。不再叠加 isRecording：该标志由录制事件驱动、
    // 一旦收到 RecordEnd 就永久为 false，会让"按屏幕毫无反应"（表现为开火失效）。
    private beginFire(): void { if (this.phase !== 'result') this.fireHeld = true; }
    private endFire(): void { this.fireHeld = false; }
    private handleRecordStart(): void { this.isRecording = true; this.resetGame(); }
    // 录制结束只收火、停音效，不再把整局冻结（冻结会导致后续任何输入都无响应）。
    private handleRecordEnd(): void { this.fireHeld = false; this.sound.stopAll(); }

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
     * 真 3D：Boss 以「开局时用户所在位置」为球心、以 SPAWN_DIST 为**恒定半径**在球面上绕飞。
     * 半径不变 ⇒ 与用户的距离始终固定（不再是原来的球壳内忽远忽近）。
     * 每帧把世界坐标投影到屏幕，驱动 2D 跟随物与命中判定。
     */
    private updateBossSpatial(delta: number): void {
        const dt = Math.min(0.05, delta / 1000);
        try {
            if (!this.spawnReady) { this.trySpawnBoss(delta); return; }
            // 球心每帧跟随相机的**当前**位置 —— 这才是「围着用户转」。
            // 若球心固定为开局那一刻的位置，玩家一走动（相机平移），
            // Boss 到他的距离就不再等于半径，表现为「忽远忽近」。
            if (this.arCamTransform) {
                const cp = this.arCamTransform.getWorldPosition();
                this.userOrigin.x = cp.x; this.userOrigin.y = cp.y; this.userOrigin.z = cp.z;
            }
            // 投放后先定住 BORN_HOLD_MS，让玩家先看清 Boss 在哪，再开始绕飞。
            if (this.bornHoldLeft > 0) {
                this.bornHoldLeft = Math.max(0, this.bornHoldLeft - delta);
                this.placeBossOnOrbit();
            } else {
                this.orbitStep(dt);
            }
            if (this.bossSpatial) {
                this.bossSpatial.getTransform().setWorldPosition(this.bossPos);
                this.billboardBoss();
            }
            this.projectBoss();
            this.syncFollowers();
        } catch (e) {
            if (this.orbitErrLeft > 0) {
                this.orbitErrLeft -= 1;
                const err = e as Error;
                const st = (err.stack || '').split('\n').map((s: string) => s.trim()).slice(1, 4).join(' || ');
                console.log(`[orbit-err] msg=${err.message} | bossPos=${!!this.bossPos} userOrigin=${!!this.userOrigin} baseForward=${!!this.baseForward} baseRight=${!!this.baseRight} baseUp=${!!this.baseUp} | stack=${st}`);
            }
        }
    }

    /**
     * Billboard（广告牌）：每帧让 Boss 平面正对相机。
     * 3D Image 本质是一张薄片，玩家绕到侧面就会看到它"压成一条线"；持续转向相机之后，
     * 任何角度看过去都是一张正脸，视觉上就当成有体积的怪物了。
     * 注意 Quaternionf.lookAt 对齐的是物体 **+Z** 轴，所以 forward 取「Boss → 相机」方向。
     */
    private billboardBoss(): void {
        if (!this.bossSpatial || !this.arCamTransform) return;
        const cp = this.arCamTransform.getWorldPosition();
        const forward = new APJS.Vector3f(cp.x - this.bossPos.x, cp.y - this.bossPos.y, cp.z - this.bossPos.z);
        this.bossSpatial.getTransform().setWorldRotation(APJS.Quaternionf.lookAt(forward, new APJS.Vector3f(0, 1, 0)));
    }

    /**
     * 投放闸门：AR 相机的世界位置由 DeviceTracker / SLAM 驱动，开局瞬间多半仍在原点，
     * 此时算出的锚点必然错误（探针实测 cam=(0,0,0) → origin=(0,0,-2)）。
     * 因此等相机离开原点后再投放；最多等 SPAWN_WAIT_MS 兜底，避免设备始终为原点时永不出现。
     */
    private trySpawnBoss(delta: number): void {
        this.spawnWait += delta;
        const cp = this.arCamTransform ? this.arCamTransform.getWorldPosition() : null;
        const camMoved = !!cp && (Math.abs(cp.x) + Math.abs(cp.y) + Math.abs(cp.z)) > 0.01;
        if (!camMoved && this.spawnWait < SPAWN_WAIT_MS) {
            if (this.bossSpatial) this.bossSpatial.enabled = false;
            return;
        }
        this.spawnBossInSpace();
        this.spawnReady = true;
        console.log(`[probe] spawn fired: camMoved=${camMoved} waited=${Math.round(this.spawnWait)}ms`);
    }

    /**
     * 球面环绕推进：角速度大小恒为 v/R（线速度由 BOSS_SPEED 控制），方向缓慢随机游走。
     * pitch 撞到上下限即反弹，保证始终绕着用户「平飞」。
     */
    private orbitStep(dt: number): void {
        const omega = (BOSS_SPEED * (this.phase === 'rage' ? 1.6 : 1)) / Math.max(0.5, SPAWN_DIST);
        this.orbitYawVel += (Math.random() - 0.5) * omega * dt * 2;
        this.orbitPitchVel += (Math.random() - 0.5) * omega * dt * 2;
        const mag = Math.sqrt(this.orbitYawVel ** 2 + this.orbitPitchVel ** 2) || 0.0001;
        const s = omega / mag;
        this.orbitYawVel *= s; this.orbitPitchVel *= s;
        this.orbitYaw += this.orbitYawVel * dt;
        this.orbitPitch += this.orbitPitchVel * dt;
        if (this.orbitPitch > ORBIT_PITCH_MAX) { this.orbitPitch = ORBIT_PITCH_MAX; this.orbitPitchVel = -Math.abs(this.orbitPitchVel); }
        if (this.orbitPitch < -ORBIT_PITCH_MAX) { this.orbitPitch = -ORBIT_PITCH_MAX; this.orbitPitchVel = Math.abs(this.orbitPitchVel); }
        this.placeBossOnOrbit();
    }

    /**
     * 把 (yaw, pitch) 映射到世界坐标：球心恒为 userOrigin，半径恒为 SPAWN_DIST。
     * yaw=pitch=0 时方向 = baseForward（开局视轴）⇒ 出生就停在手机正前方。
     */
    private placeBossOnOrbit(): void {
        const cp = Math.cos(this.orbitPitch), sp = Math.sin(this.orbitPitch);
        const cy = Math.cos(this.orbitYaw), sy = Math.sin(this.orbitYaw);
        const f = this.baseForward, r = this.baseRight, u = this.baseUp;
        const kf = cp * cy, kr = sy * cp;
        const nx = this.userOrigin.x + (f.x * kf + r.x * kr + u.x * sp) * SPAWN_DIST;
        const ny = this.userOrigin.y + (f.y * kf + r.y * kr + u.y * sp) * SPAWN_DIST;
        const nz = this.userOrigin.z + (f.z * kf + r.z * kr + u.z * sp) * SPAWN_DIST;
        this.bossPos.x = nx; this.bossPos.y = ny; this.bossPos.z = nz;
    }

    /**
     * 出生校准：把 Boss 从「视轴方向」微调到正对屏幕准星。
     * 视轴方向的投影落在屏幕几何中心 (360, 640)，而准星在 (360, 520) —— 相差 120px，
     * 命中容差 AIM_RADIUS 只有 122px，余量几乎为零，稍微一动就会脱靶。
     * 这里不依赖 worldToScreenPoint 的 Y 轴方向假设（不同端可能相反）：
     * 对 pitch 做「正负试探」，取投影更接近准星的那一组。
     */
    private aimAtCrosshair(): void {
        if (!this.arCamera) return;
        const fovHalfRad = Math.max(0.05, Math.min(1.2, (this.arCamera.fov / 2) * Math.PI / 180));
        this.orbitYaw = 0; this.orbitPitch = 0;
        this.placeBossOnOrbit();
        this.projectBoss();
        const baseY = this.bossScreenY;
        if (!isFinite(baseY)) return;
        const need = CROSS_Y - baseY;
        if (Math.abs(need) < 6) return;
        const angle = Math.min(ORBIT_PITCH_MAX, Math.atan(Math.abs(need) / (SCREEN_H / 2) * Math.tan(fovHalfRad)));
        let best = 0; let bestD = Math.abs(need);
        for (const sign of [1, -1]) {
            this.orbitPitch = sign * angle;
            this.placeBossOnOrbit();
            this.projectBoss();
            const d = Math.abs(this.bossScreenY - CROSS_Y);
            if (d < bestD) { bestD = d; best = sign * angle; }
        }
        this.orbitYaw = 0; this.orbitPitch = best;
        this.placeBossOnOrbit();
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
        console.log(`[probe ${tag}] dist=${n(dist)}m yaw=${n(this.orbitYaw)} pitch=${n(this.orbitPitch)} cam=${p(cp)} look=${p(look)} origin=${p(this.userOrigin)} boss=${p(this.bossPos)} raw=${p(sp)} screen=(${Math.round(this.bossScreenX)},${Math.round(this.bossScreenY)}) cross=(${CROSS_X},${CROSS_Y}) aimed=${this.isAimed()} on=${this.bossOnScreen} size=${BOSS_CORE_SIZE} spawnReady=${this.spawnReady} fov=${fov}`);
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
        // 人脸追踪在部分环境（PC 预览、未授权、追踪器初始化失败）可能不可用。
        // 必须隔离：它的异常会中断整个 tick，进而冻结 HUD 与开火。
        try {
            const faces: Face.Result[] = this.vision.getFaces(); const face: Face.Result | undefined = faces[0];
            if (face && (face.hasAction('EyeBlink') || face.hasAction('MouthAh'))) { this.faceGate = 900; this.hit(160, true); }
        } catch (e) {
            if (this.errQuota > 0) { this.errQuota -= 1; console.warn(`[face-err] vision=${!!this.vision} ${(e as Error).message}`); }
        }
    }

    private fire(): void {
        try {
            this.fireGate = 250; this.gunKickLeft = 140; this.gunAnimLeft = 140; this.shots += 1; this.sound.play('像素开火音');
            const aimed = this.isAimed();
            this.spawnArrow(aimed ? this.bossScreenX : CROSS_X, aimed ? this.bossScreenY : CROSS_Y);
            if (this.shots <= 3) console.log(`[fire] #${this.shots} aimed=${aimed} boss=(${Math.round(this.bossScreenX)},${Math.round(this.bossScreenY)}) cross=(${CROSS_X},${CROSS_Y}) on=${this.bossOnScreen} phase=${this.phase} hp=${this.hp}`);
            if (!aimed) { this.combo = 0; return; }
            const hitShieldCore = this.phase === 'shield';
            this.time.delayedCall(160, () => this.resolveArrowHit(hitShieldCore), [], this);
        } catch (e) {
            const err = e as Error;
            console.log(`[fire-err] msg=${err.message} shots=${this.shots} sound=${!!this.sound} gun=${!!this.gun} crosshair=${!!this.crosshair} hl=${!!this.highlight}`);
        }
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
        if (this.hp <= MAX_HP * 0.66 && this.phase === 'warmup') { this.phase = 'rage'; this.setBossTexture(this.rageTexture); }
        if (this.hp <= MAX_HP * 0.33 && (this.phase === 'warmup' || this.phase === 'rage')) this.enterShield();
    }

    private setBossTexture(texture: APJS.Texture | null): void {
        if (texture && this.bossImage) this.bossImage.texture = texture;
    }

    private enterShield(): void { this.phase = 'shield'; this.coreHits = 0; this.shield.setVisible(true); this.core.setVisible(true); }
    private breakShield(): void { this.phase = 'window'; this.windowLeft = 2000; this.shieldRounds += 1; this.shield.setVisible(false); this.core.setVisible(false); this.sound.play('护盾破裂音'); }
    private restoreShield(): void { if (this.shieldRounds < 3) this.enterShield(); else { this.phase = 'window'; this.windowLeft = 2000; } }

    /**
     * 血条填充：Boss血条填充 的 Image DrawMode 已在场景里配为 Filled（横向 / startPoint=0），
     * 运行时唯一能驱动它的接口是 setMaterialProperty("_filledRange", ratio)。
     * （早期写成 image.fillAmount = ratio —— APJS.Image 并没有 fillAmount 这个属性，
     *   赋值只是落到 JS 对象的临时字段上，渲染端完全不买账，血条永远是满的。）
     * 带脏检查：_filledRange 写的是与战斗HUD底板共享的材质，没必要每帧重复写。
     */
    private setHpFillAmount(): void {
        const ratio = Math.max(0, Math.min(1, this.hp / MAX_HP));
        if (ratio === this.hpFillRatio) return;
        this.hpFillRatio = ratio;
        const image = this.hpFill.getEngineComponent('Image') as APJS.Image | null;
        if (image) image.setMaterialProperty('_filledRange', ratio);
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
        this.phase = 'warmup'; this.hp = MAX_HP; this.elapsed = 0; this.fireHeld = false; this.fireGate = 0; this.faceGate = 0; this.coreHits = 0; this.shieldRounds = 0; this.windowLeft = 0; this.shots = 0; this.hits = 0; this.combo = 0; this.maxCombo = 0; this.gunKickLeft = 0; this.gunAnimLeft = 0; this.resultDelay = 0; this.hitHighlightLeft = 0;
        this.wingFrameIndex = 0; this.wingFrameLeft = 115;
        // 不在 reset 内立即投放：此刻 AR 相机多半还没被 SLAM 驱动（世界位置=原点），
        // 锚点会算到错误位置，表现为「Boss 极小」或「跑到相机背后完全看不见」。
        // 改为交给 update 里的投放闸门，等相机就位后再算锚点。
        this.spawnReady = false; this.spawnWait = 0;
        if (this.bossSpatial) this.bossSpatial.enabled = false;
        // 强制下一帧重写一次血条材质，避免复用上一局的缓存比例。
        this.hpFillRatio = -1;
        this.setBossTexture(this.idleTexture);
        this.crosshair.setVisible(true); this.highlight.setVisible(false); this.gun.setFlipX(false).setPosition(this.gunBaseX, this.gunBaseY).setAngle(this.gunBaseAngle).setTexture(this.gunBaseTexture).setVisible(true); this.shield.setVisible(false); this.core.setVisible(false); this.hpFill.setVisible(true); this.setHpFillAmount(); this.hud.setText(`稳定 ${MAX_HP}   30s`).setVisible(true); this.hint.setText('转动手机对准，按住能量脉冲').setVisible(true);
        this.resultCard.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false); this.confetti.setVisible(false);
        // 真机空间诊断探针：每次开局分时间点采样，用于定位「看不见 Boss」。
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
        if (this.arCamera && this.arCamTransform) {
            // AR 相机由 DeviceTracker 驱动，其位置/朝向只能运行时读取。
            const camPos = this.arCamTransform.getWorldPosition();
            const look = this.arCamera.getLookAt();
            // 防御：getLookAt 若返回非单位向量，直接乘米数会把锚点甩到很远。
            const lookLen = Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z) || 1;
            // 球心 = 开局时用户（相机）所在位置。整局不变 ⇒ 与用户的距离恒定。
            this.userOrigin.x = camPos.x; this.userOrigin.y = camPos.y; this.userOrigin.z = camPos.z;
            // 开局视轴作为参考基：yaw=pitch=0 即"手机正前方"。
            this.baseForward.x = look.x / lookLen;
            this.baseForward.y = look.y / lookLen;
            this.baseForward.z = look.z / lookLen;
            // 与世界上方向构造正交基；手机近乎朝天/朝地时叉乘会退化，换一个参考轴。
            const refUp = Math.abs(this.baseForward.y) > 0.99
                ? new APJS.Vector3f(0, 0, 1) : new APJS.Vector3f(0, 1, 0);
            const right = this.baseForward.cross(refUp).normalize();
            this.baseRight.x = right.x; this.baseRight.y = right.y; this.baseRight.z = right.z;
            const up = this.baseRight.cross(this.baseForward).normalize();
            this.baseUp.x = up.x; this.baseUp.y = up.y; this.baseUp.z = up.z;
            // 沿用旧字段语义：spawnOrigin 仍保留为"出生点"（= 球心 + 视轴 × 半径）。
            this.spawnOrigin.x = camPos.x + this.baseForward.x * SPAWN_DIST;
            this.spawnOrigin.y = camPos.y + this.baseForward.y * SPAWN_DIST;
            this.spawnOrigin.z = camPos.z + this.baseForward.z * SPAWN_DIST;
        }
        // 出生即正前方（yaw=pitch=0），随后才开始绕飞。
        this.orbitYaw = 0; this.orbitPitch = 0;
        this.orbitYawVel = 0; this.orbitPitchVel = 0;
        this.placeBossOnOrbit();
        // 微调到正对屏幕准星，让玩家一睁眼就看见它、且能直接打中。
        this.aimAtCrosshair();
        // 先定住不动，让玩家看清 Boss 的位置，再开始绕飞。
        this.bornHoldLeft = BORN_HOLD_MS;
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
