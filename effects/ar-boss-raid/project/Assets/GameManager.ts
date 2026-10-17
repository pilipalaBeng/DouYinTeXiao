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

/** 出生位置 = **相机视轴正前方**（baseForward），不做任何投影纠偏。
 *  曾有过 aimAtScreenCenter()：按 worldToScreenPoint 的投影把 Boss「纠」到屏幕像素 (360,640)。
 *  但那个投影的像素基准和 720×1280 并不一致（实测返回值远超画面，如 (152049,14588)），
 *  ⇒ 纠偏拿着错误的目标像素下手，把 Boss 稳定推到用户**右侧**（作者反馈：得转头才看得见）。
 *  「用户面前」的可靠定义就是相机 getLookAt() 方向，不要用投影去反推 —— 已整段移除。 */

/** Boss 总血量。血条填充比例 = hp / MAX_HP；阶段阈值也由它派生，不写散魔法数字。 */
const MAX_HP = 2400;

/** 连击（combo）规则：命中 +1；**打空**或**超时**归零。
 *  超时 = 距上次命中超过 COMBO_TIMEOUT_MS。与射击间隔（fireGate 250ms）配合 ——
 *  1.5 秒内续不上下一发就断连。 */
const COMBO_TIMEOUT_MS = 1500;

/** 街机风「连击 HIT」显示（场景对象「连击HIT」）。
 *  ⚠️ 数字与结算面板**同源**：都用 this.combo（当前）/ this.maxCombo（本局峰值），
 *  不存在两套计数。低于 HIT_MIN_COMBO 不显示（单发不算连击）。 */
const HIT_MIN_COMBO = 2;
/** 命中脉冲时长（毫秒）：数字瞬间放大 + 随机抖动，随后按**平方**衰减回常态（比线性更"脆"）。 */
const HIT_PUNCH_MS = 150;
/** 脉冲幅度：最大放大比例 / 最大抖动像素。 */
const HIT_PUNCH_SCALE = 0.3;
const HIT_SHAKE_PX = 5;
/** 连击颜色分档（全部取自 DB16 色板），从高到低匹配 —— 连击越高越"烫"。 */
const HIT_TIERS: { from: number; color: string }[] = [
    { from: 20, color: '#d04648' },   // DB16 红
    { from: 10, color: '#d27d2c' },   // DB16 橙
    { from: 5, color: '#dad45e' },    // DB16 黄
    { from: 2, color: '#deeed6' },    // DB16 白
];
/** HIT 出现动画：时长 + 缩放先冲到的峰值（像弹出来，再回弹到 1.0）。 */
const HIT_IN_MS = 180;
const HIT_IN_OVERSHOOT = 1.15;
/** HIT 消失动画：时长 + 缩到多小（同时淡出），避免「啪一下没了」的硬切。 */
const HIT_OUT_MS = 200;
const HIT_OUT_SCALE = 0.85;
/** 保持显示期间的轻微「呼吸」（幅度 / 角速度）—— 数字静止时会显得死板。 */
const HIT_BREATH_AMP = 0.02;
const HIT_BREATH_SPEED = 6;

/** 结算评级：**全部由真实采集的数据算出**（命中率 / 耗时 / 连击），可复现、可解释。
 *  以前是 `win ? 'B' : 'C'` 的硬编码 —— 打得再好也是 B，等于假数据。
 *  三项各自归一化后加权求和（0~100），再按分数线映射到 S/A/B/C。
 *  要调评级手感只动这一组常量，不要改算法。 */
const GRADE_WEIGHT_ACC = 50;      // 命中率权重（满分项）
const GRADE_WEIGHT_SPEED = 30;    // 速度权重
const GRADE_WEIGHT_COMBO = 20;    // 连击权重
/** 命中率满分线：打护盾核心的射击计入「射击数」但不计入「命中数」（见 resolveArrowHit），
 *  所以命中率天然到不了 100%；以这个值为满分基准，高于它的部分按满分计。 */
const GRADE_ACC_FULL = 0.8;
/** 速度项归零点（秒）：用满这个时长速度分为 0（= 一局时限），击杀越快分越高。 */
const GRADE_SPEED_CEIL = 30;
/** 连击项满分线：达到这个连击数即拿满连击分。 */
const GRADE_COMBO_FULL = 20;
/** 评级分数线（低于 GRADE_B 即 C）。 */
const GRADE_S = 85;
const GRADE_A = 70;
const GRADE_B = 50;

/** Delay Health Bar（延迟血条）：受伤后「延迟条」先停顿多久（毫秒），再以多快追平（每秒收掉的比例）。
 *  观感 = 红条立刻缩短、露出一截黄条，黄条停一下后缓慢收掉 —— 让玩家看清这一下掉了多少血。 */
const HP_DELAY_WAIT_MS = 400;
const HP_DELAY_SPEED = 0.7;

/** 3D Boss 的空间参数，单位：米。
 *  尺寸依据（探针实测）：AR 相机 fov=60°、fovType=Custom(0)，距离 D 处屏幕竖向覆盖 ≈ 1.155×D 米。
 *  当前 BOSS_CORE_SIZE=6.0 + SPAWN_DIST=18.0 → 占屏约 29%
 *  （作者 2026-10-16 要求「推远 2 倍 + 体型放大 1 倍」同步执行，两者同倍 ⇒ 占屏比例不变，但透视线更远）。
 *  若真机出现「糊脸/穿模」，应调小 BOSS_CORE_SIZE，而不是回退距离。
 */
const BOSS_CORE_SIZE = 6.0;
/** 环绕飞行的俯仰上限（弧度）：限制在用户周围「平飞」（±约 28°），不飞到头顶或脚下。 */
const ORBIT_PITCH_MAX = 0.5;
/** 环绕**线速度**（米/秒）。角速度 = BOSS_SPEED / SPAWN_DIST，所以半径越大转得越慢。
 *  0.025 在真机上几乎看不出在动（作者反馈「怪是不动的」）→ 提到 0.1。
 *  18m 半径下 0.1 m/s ≈ 绕一整圈要 19 分钟，加上方向本身随机游走，观感是「缓慢飘移」。 */
const BOSS_SPEED = 5;
/** 投放后先「定在原地」多久（毫秒），让玩家先看清 Boss 在哪，再开始绕飞。
 *  作者要求：不要一上来就飞，避免玩家像抓瞎一样找。
 */
const BORN_HOLD_MS = 2500;
/** 开局投放距离：沿相机视轴前方多少米（= 环绕飞行的恒定半径）。
 *  2 -> 4 -> 6 -> 3 -> 1.5 -> 3 -> 6 -> 9 -> 18
 *  （两次拉近「减半」、两次推远一倍、「再推远一些」、最后「再推远 2 倍」）。
 *  **默认实体不随距离缩放**；本次 9 -> 18 是作者明确要求「推远 2 倍 + 体型放大 1 倍」同时下达的，
 *  两者同倍 ⇒ 占屏比例不变（约 29%），但透视更远、空间感更强。
 */
const SPAWN_DIST = 30.0;

/** 环绕「球心」是否每帧跟随相机位置。
 *  **false（当前）= 世界锚定**：球心钉在**开局那一刻用户站的世界坐标**上，整局不再动。
 *    Boss 因此固定在真实空间里 —— 转头它留在原处、走近它会变大、退远它会变小，
 *    这才是 AR 该有的空间感。
 *  true = 平移跟随：球心每帧跟着相机走，Boss 像黏在身上（作者 2026-10-16 反馈「怪恒定在
 *    屏幕位置上、不在 3D 空间里」，就是它 + ORBIT_FOLLOW_HEADING 一起打开造成的）。
 *  代价：走远之后 Boss 会出视野，得转头去找。 */
const ORBIT_FOLLOW_CAMERA = false;

/** 参考基（前 / 右 / 上）是否每帧跟随相机**当前**朝向。
 *  **false（当前）= 沿用开局朝向**：Boss 钉在「开局朝向」的前方，你转头它**不跟转** ⇒ 有空间感。
 *  true = 朝向跟随：Boss 永远顶在你当前朝向的正前方。
 *    ⚠️ 与 ORBIT_FOLLOW_CAMERA=true 叠加时，Boss 相对相机的位移**两项都恒定**
 *    ⇒ 投影永远落在同一个屏幕像素上，看起来就是「贴在屏幕上」，完全没有 3D 感。
 *    当初打开它，是为了绕开 `Vector3f.cross` 原地修改污染 baseForward 的 bug；
 *    那个 bug 已经在 `updateBasisFromCamera()` 里用 clone 修掉了，这里不再需要它兜底。 */
const ORBIT_FOLLOW_HEADING = false;
/** 投放闸门兜底：等 AR 相机离原点（SLAM 就位）最多等多久，超时则按当前位置投放。
 *  2500 -> 1200：真机实测相机 590~900ms 就位，缩短后玩家几乎无感；
 *  且现在球心每帧跟随相机，即便开局锚点算错也会立刻被纠正（不再需要长等待兜底）。
 */
const SPAWN_WAIT_MS = 1200;

/** 真机空间诊断探针开关。打开后每局在 1.5 / 3.0 / 4.5 秒各打一次：
 *  相机世界坐标、getLookAt、基向量、Boss 世界坐标、投影结果、是否命中。
 *  只在真机上排查「看不见 Boss」「位置偏了」时打开；平时关着，免得刷日志。 */
const DEBUG_SPATIAL_PROBE = false;

/** 「古代像素战弩」贴图的原始像素尺寸。
 *  贴图宽高比 (1.164) 与显示框 sizeDelta 的宽高比 (1.092) 不一致，
 *  Image 是 Fit 模式 ⇒ 宽度撑满、高度居中留边。算枪口时要把这个留边算进去。 */
const GUN_TEX_W = 512;
const GUN_TEX_H = 440;
/** 枪口在**贴图**内的归一化位置：弩箭尖端落在贴图左上角（实测贴图内容 bbox 0~20 / 0~40 px）。 */
const GUN_MUZZLE_NX = 0.02;
const GUN_MUZZLE_NY = 0.045;

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
    /** 战弩基准位：**开局从场景对象读一次**（作者在编辑器里手工摆好的位置），
     *  之后只在此基准上叠加后坐力偏移。
     *  曾经写死过 506/1004 —— 作者在编辑器里怎么拖，一运行就被脚本拉回写死坐标，
     *  看起来像"坐标被锁死"。改为读场景初值后，编辑器里摆哪儿就是哪儿。 */
    private gunBaseX: number = 0;
    private gunBaseY: number = 0;
    private gunBaseAngle: number = 0;
    /** 战弩基准位是否已从场景捕获（只捕获一次，避免被本局自己写过的值污染）。 */
    private gunHomeReady: boolean = false;
    private resultDelay: number = 0;
    private flyingArrows: {sprite: Sprite; startX: number; startY: number; endX: number; endY: number; elapsed: number; duration: number}[] = [];

    // ---- 3D 空间 Boss ----
    private bossSpatial: APJS.SceneObject | null = null;
    private bossImage: APJS.Image | null = null;
    private arCamera: APJS.Camera | null = null;
    private bossPos: APJS.Vector3f = new APJS.Vector3f(0, 1.2, 3.5);
    /** 环绕飞行的球面坐标（相对开局视轴基）：yaw 水平、pitch 俯仰，半径恒为 SPAWN_DIST。 */
    private orbitYaw: number = 0;
    private orbitErrLeft: number = 6;
    /** 主循环异常打印配额：够查清问题，又不会刷屏。 */
    private errQuota: number = 6;
    private orbitPitch: number = 0;
    private orbitYawVel: number = 0;
    private orbitPitchVel: number = 0;
    /** 球心 = 相机（用户）的**当前**位置，每帧同步 ⇒ 用户走动时 Boss 跟着平移，距离恒为 SPAWN_DIST。 */
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
    /** 血条底板（纯色深紫背景板）。结算时要跟着血条一起收起，否则结算画面上会留一条紫条。 */
    private hudPlate!: Sprite;
    private hpFill!: Sprite;
    /** 血条填充比例脏检查缓存：与上传给材质的 _filledRange 保持一致，避免每帧重复写共享材质。 */
    private hpFillRatio: number = -1;
    /** Delay Health Bar 的延迟条（纯色黄）：受伤后缓慢追上即时条，中间露出的黄就是「刚掉的血」。 */
    private hpDelay!: Sprite;
    private hpDelayRatio: number = 1;
    private hpDelayWait: number = 0;
    /** 延迟条的满宽 / 左边界（屏幕坐标，开局从场景读一次）—— 缩放时左边界固定，否则会从中间缩。 */
    private hpDelayFull: number = 0;
    private hpDelayLeft: number = 0;
    private hud!: Text;
    /** HUD 文本脏检查缓存：每帧 setText 会触发一次重排版，只在数字真的变了才写。 */
    private hudText: string = '';
    private hint!: Text;
    private resultCard!: Sprite;
    private resultTitle!: Text;
    private resultStats!: Text;
    /** 全屏彩带序列帧（作者新加的「庆祝彩带」预制件实例：2D 相机 > 屏幕图片）。取不到时为 null，静默降级。 */
    private confettiSeq: Sprite | null = null;
    /** 序列帧播放控制器（首次需要时懒取一次）；用于每次胜利把动画倒回首帧重播。 */
    private confettiCtrl: { stop(): void; play(): void } | null = null;
    /** 街机风连击 HIT 文本（场景对象「连击HIT」）。取不到时为 null，静默降级。 */
    private hitText: Text | null = null;
    /** 连击超时倒计时（毫秒）：归零即断连。 */
    private comboLeft: number = 0;
    /** HIT 脉冲倒计时（毫秒）：>0 时数字放大+抖动，衰减到 0 的那一帧收尾复位。 */
    private hitPunchLeft: number = 0;
    /** 本次脉冲的抖动方向（命中时随机一次、脉冲期间保持不变，避免每帧乱抖）。 */
    private hitShakeX: number = 0;
    private hitShakeY: number = 0;
    /** HIT 文本基准位置：抖动是相对它的临时偏移，不能累积。 */
    private hitBaseX: number = 0;
    private hitBaseY: number = 0;
    /** HIT 脏检查缓存（已写入的数字 / 颜色档）：避免每帧重排版与重复写颜色。 */
    private hitShown: number = -1;
    private hitTierShown: string = '';
    /** HIT 显隐状态机：0=隐藏 1=出现动画 2=保持 3=消失动画。显隐一律走过渡，不硬切。 */
    private hitPhase: number = 0;
    private hitPhaseLeft: number = 0;
    /** 已写入的 HIT 透明度（量化到 0.05），避免每帧重排版。 */
    private hitAlphaShown: number = 1;
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
        this.friendlyTexture = this.optionalTexture('能量核心友好模板');
        this.shield = this.object<Sprite>('护盾覆盖'); this.core = this.object<Sprite>('护盾核心'); this.crosshair = this.object<Sprite>('固定准星');
        this.highlight = this.object<Sprite>('准星命中高亮'); this.gun = this.object<Sprite>('古代战弩'); this.hpFill = this.object<Sprite>('Boss血条填充');
        this.hudPlate = this.object<Sprite>('战斗HUD底板');
        this.hpDelay = this.object<Sprite>('Boss血条延迟');
        // 记下延迟条的满宽与左边界：之后按比例缩放时保持左边界不动（否则会从中间缩，方向感全错）。
        this.hpDelayFull = this.hpDelay.width;
        this.hpDelayLeft = this.hpDelay.x - this.hpDelayFull / 2;
        this.gunBaseTexture = this.gun.getTexture()!;
        this.captureGunHome();
        // 战弩三张动作帧属可选素材：对象缺失或尚未生成时回退到基础帧，避免对 null 取贴图直接崩。
        this.gunDrawTexture = this.optionalTexture('战弩拉弦模板') || this.gunBaseTexture;
        this.gunFireTexture = this.optionalTexture('战弩击发模板') || this.gunBaseTexture;
        this.gunReturnTexture = this.optionalTexture('战弩回位模板') || this.gunBaseTexture;
        this.hud = this.object<Text>('HUD文字'); this.hint = this.object<Text>('开局提示'); this.resultCard = this.object<Sprite>('结算卡');
        this.resultTitle = this.object<Text>('结算标题'); this.resultStats = this.object<Text>('结算战绩');
        // 全屏彩带序列帧（作者新加的「庆祝彩带」预制件实例：2D 相机 > 屏幕图片）。
        // 对象缺失时 object() 会返回 null，后续调用点都做了判空，不影响结算画面。
        this.confettiSeq = this.object<Sprite>('屏幕图片');
        // 街机风连击 HIT：数字与结算面板同源（this.combo / this.maxCombo）。
        // 记下基准位置 —— 抖动是在它之上的临时偏移，不能基于上一帧位置累加。
        this.hitText = this.object<Text>('连击HIT');
        if (this.hitText) { this.hitBaseX = this.hitText.x; this.hitBaseY = this.hitText.y; }
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
        this.updateHpDelay(delta);
        this.updateCombo(delta);
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

    /**
     * 捕获战弩的场景基准位（只做一次）。
     * gun.x / gun.y 是屏幕坐标（左上原点），gun.angle 是角度 —— 都直接来自场景里手工摆的值。
     * 之后 updateGunKick 每帧写的都是「基准位 + 后坐力偏移」，不再覆盖作者摆的位置。
     */
    private captureGunHome(): void {
        if (this.gunHomeReady || !this.gun) return;
        this.gunBaseX = this.gun.x;
        this.gunBaseY = this.gun.y;
        this.gunBaseAngle = this.gun.angle;
        this.gunHomeReady = true;
        console.log(`[gun-home] captured x=${Math.round(this.gunBaseX)} y=${Math.round(this.gunBaseY)} angle=${Math.round(this.gunBaseAngle)}`);
    }

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

    /**
     * 算出战弩枪口的屏幕坐标（左上原点）。
     * 子弹必须**从枪口出来**，所以起点得跟着战弩的实时位置走（含开火后坐力偏移）；
     * 之前写死 (426, 938) 而战弩在别处 ⇒ 子弹从虚空里冒出来，跟枪口对不上。
     * 作者在编辑器里挪战弩 / 改尺寸，这里都会自动跟随，不需要再改数值。
     */
    private gunMuzzle(): {x: number, y: number} {
        const boxW = this.gun.width, boxH = this.gun.height;
        const texAspect = GUN_TEX_W / GUN_TEX_H;
        // Fit：框比贴图「宽」时按高度撑满、左右留边；否则按宽度撑满、上下留边。
        const dispW = boxW > boxH * texAspect ? boxH * texAspect : boxW;
        const dispH = dispW / texAspect;
        const left = this.gun.x - dispW / 2;
        const top = this.gun.y - dispH / 2;
        return {x: left + dispW * GUN_MUZZLE_NX, y: top + dispH * GUN_MUZZLE_NY};
    }

    private spawnArrow(targetX: number, targetY: number): void {
        const muzzle = this.gunMuzzle();
        const startX = muzzle.x, startY = muzzle.y;
        const arrow = this.add.sprite(startX, startY, '弹幕模板');
        const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
        arrow.setDisplaySize(52, 16).setAngle(angle).setVisible(true).setActive(true);
        this.runtimeObjects.push(arrow);
        this.flyingArrows.push({sprite: arrow, startX, startY, endX: targetX, endY: targetY, elapsed: 0, duration: 160});
    }

    /**
     * 振翅序列帧：**只在结算时停**。
     * （中途曾限制成「只在 warmup 播」，那是为了不让振翅帧把「暴怒」贴图刷掉；
     *   暴怒贴图已按作者要求弃用 —— 胸口红球看起来像「被击后怪物变红」——
     *   所以这个限制也随之取消，进入 rage 后 Boss 仍在扇翅膀，不会一动不动。）
     */
    private updateWingAnimation(delta: number): void {
        if (this.phase === 'result' || this.wingTextures.length === 0) return;
        this.wingFrameLeft -= delta;
        if (this.wingFrameLeft > 0) return;
        this.wingFrameLeft += 115;
        this.wingFrameIndex = (this.wingFrameIndex + 1) % this.wingTextures.length;
        this.setBossTexture(this.wingTextures[this.wingFrameIndex]);
    }

    /**
     * 真 3D：Boss 以**开局时用户所在的世界坐标**为球心、以 SPAWN_DIST 为恒定半径在球面上绕飞。
     * 球心与参考基是否跟随相机，由文件头 ORBIT_FOLLOW_CAMERA / ORBIT_FOLLOW_HEADING 决定；
     * 当前两者都关 ⇒ Boss 固定在真实空间里（转头它在原处、走近会变大、退远会变小），
     * 而不是「贴在屏幕上」。每帧把世界坐标投影到屏幕，驱动 2D 跟随物与命中判定。
     */
    private updateBossSpatial(delta: number): void {
        const dt = Math.min(0.05, delta / 1000);
        try {
            if (!this.spawnReady) { this.trySpawnBoss(delta); return; }
            // 球心 / 参考基是否跟随相机，见文件头两个 ORBIT_FOLLOW_* 常量的说明。
            // 当前两者都为 false ⇒ Boss 完全锚定在开局时算出的世界坐标上，具有真实空间感。
            if (ORBIT_FOLLOW_CAMERA && this.arCamTransform) {
                const cp = this.arCamTransform.getWorldPosition();
                this.userOrigin.x = cp.x; this.userOrigin.y = cp.y; this.userOrigin.z = cp.z;
            }
            if (ORBIT_FOLLOW_HEADING) this.updateBasisFromCamera();
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
            if (!aimed) { this.combo = 0; this.comboLeft = 0; return; }
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
        // 连击续期 + 触发击打脉冲（抖动方向每次命中随机一次，脉冲期间保持不变）。
        this.comboLeft = COMBO_TIMEOUT_MS;
        this.hitPunchLeft = HIT_PUNCH_MS;
        this.hitShakeX = (Math.random() * 2 - 1) * HIT_SHAKE_PX;
        this.hitShakeY = (Math.random() * 2 - 1) * HIT_SHAKE_PX;
        this.sound.play(heavy ? '人脸重击音' : '像素命中音');
        this.hitHighlightLeft = 140;
        this.highlight.setVisible(true);
        // 触发延迟条：先停顿 HP_DELAY_WAIT_MS，再缓慢追平（见 updateHpDelay）。
        this.hpDelayWait = HP_DELAY_WAIT_MS;
        const spark = this.add.sprite(this.bossScreenX, this.bossScreenY, '命中星爆模板'); spark.setVisible(true).setActive(true); this.runtimeObjects.push(spark);
        this.time.delayedCall(180, () => { spark.destroy(); this.runtimeObjects = this.runtimeObjects.filter((value: GameObject) => value !== spark); }, [], this);
        if (this.hp <= 0) { this.finish(true); return; }
        // 阶段照常推进（rage 影响绕飞速度与护盾判定），但**不再换「暴怒」贴图**：
        // 那张图胸口是亮红色，作者反馈看起来像「被击后怪物变红」，已按要求去掉。
        // 受击反馈仍由「像素命中音 / 人脸重击音」+「准星命中高亮」+「命中星爆」承担。
        if (this.hp <= MAX_HP * 0.66 && this.phase === 'warmup') this.phase = 'rage';
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
        const text = ` ${this.hp}   ${Math.max(0, Math.ceil(30 - this.elapsed))}s`;
        if (text !== this.hudText) { this.hudText = text; this.hud.setText(text); }
        this.setHpFillAmount();
    }

    /**
     * Delay Health Bar 的延迟条。
     * 即时条（hpFill）由材质 `_filledRange` 立刻跟随血量；这条黄条先停顿 HP_DELAY_WAIT_MS，
     * 再以 HP_DELAY_SPEED/秒 追平 —— 中间露出的那一截黄，就是「这一下掉了多少血」，看清后才收掉。
     * 缩放宽度的同时要同步挪中心点，保持**左边界固定**（否则会从中间往两边缩，方向感全错）。
     */
    private updateHpDelay(delta: number): void {
        if (!this.hpDelay) return;
        const ratio = Math.max(0, Math.min(1, this.hp / MAX_HP));
        if (this.hpDelayRatio <= ratio) {
            // 加血 / 重开：直接跟平，不走延迟。
            this.hpDelayRatio = ratio; this.hpDelayWait = 0;
        } else if (this.hpDelayWait > 0) {
            this.hpDelayWait -= delta;
        } else {
            this.hpDelayRatio = Math.max(ratio, this.hpDelayRatio - HP_DELAY_SPEED * delta / 1000);
        }
        const w = this.hpDelayFull * this.hpDelayRatio;
        this.hpDelay.setDisplaySize(w, this.hpDelay.height);
        this.hpDelay.setPosition(this.hpDelayLeft + w / 2, this.hpDelay.y);
    }

    private finish(win: boolean): void {
        if (this.phase === 'result') return; this.phase = 'result'; this.resultDelay = 450; this.fireHeld = false;
        for (const item of this.runtimeObjects) item.destroy(); this.runtimeObjects = []; this.flyingArrows = [];
        // 结算后 tick 会直接 return、不再走 syncFollowers ⇒ 这里必须显式收起 3D Boss，
        // 否则它会一直飘在结算画面里（enabled 停在最后一次 syncFollowers 的值）。
        if (this.bossSpatial) this.bossSpatial.enabled = false;
        this.crosshair.setVisible(false); this.highlight.setVisible(false); this.gun.setVisible(true); this.hud.setVisible(false); this.hudPlate.setVisible(false); this.hpFill.setVisible(false); this.hpDelay.setVisible(false); this.hint.setVisible(false); this.shield.setVisible(false); this.core.setVisible(false);
        // 结算面板自带连击数，HUD 上的 HIT 实时显示收起。
        if (this.hitText) this.hitText.setVisible(false);
        // 胜利才换「投降」贴图；失败时保持当前振翅帧（不再用「暴怒」红球图）。
        if (win) this.setBossTexture(this.friendlyTexture);
        // 结算卡 / 标题 / 战绩。旧的 UI 静态彩带（场景对象「胜利彩带」）已弃用 ——
        // 作者要求改用全屏「庆祝彩带」序列帧，见 setConfettiSequence()。
        this.resultCard.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false);
        // 全屏彩带序列帧：只在胜利时播，且每次胜利都从头播一遍。
        this.setConfettiSequence(win);
        this.resultTitle.setText(win ? '警报解除！' : '挑战结束');
        // 三项全部来自真实采集的数据，没有任何硬编码：
        //   耗时 = 本局计时 elapsed（开局归零，击杀/超时那一刻停下）
        //   命中率 = 命中数 / 射击数（真实统计，见 fire() 与 hit()）
        //   评级 = gradeResult() 由上述真实数据算出（旧版是 win ? 'B' : 'C' 的假数据）
        const acc = this.shots > 0 ? Math.round(this.hits * 100 / this.shots) : 0;
        this.resultStats.setText(`耗时 ${Math.round(this.elapsed)}s  命中率 ${acc}%\n连击 ${this.maxCombo}  评级 ${this.gradeResult(win)}`);
        if (win) this.sound.play('胜利庆祝音');
    }

    /**
     * 街机风连击 HIT 表现 + 连击超时（每帧调用）。
     * - 超时：距上次命中超过 COMBO_TIMEOUT_MS 即断连（打空同样断，见 fire()）
     * - 显示：combo ≥ HIT_MIN_COMBO 才出现，断连立刻收起
     * - 击爽感：命中瞬间数字放大 + 随机抖动，随后**按平方衰减**回常态
     *   （平方比线性收得更快，打击感更"脆"；末帧 kk≈0 自然复位成 1 倍缩放 / 基准位置）；
     *   颜色按连击分档升温（白 → 黄 → 橙 → 红，全部取自 DB16 色板）
     */
    private updateCombo(delta: number): void {
        // 1) 连击超时：距上次命中超过 COMBO_TIMEOUT_MS 就断连（打空同样断，见 fire()）
        if (this.combo > 0) {
            this.comboLeft = Math.max(0, this.comboLeft - delta);
            if (this.comboLeft <= 0) this.combo = 0;
        }
        // 2) 脉冲倒计时无条件推进：即便 combo 掉到阈值以下，也不会残留满值脉冲。
        const punchBefore = this.hitPunchLeft;
        this.hitPunchLeft = Math.max(0, this.hitPunchLeft - delta);
        const txt = this.hitText;
        if (!txt) return;

        // 3) 显隐状态机：命中 → 弹出；断连 → 淡出缩小离场；淡出途中再次命中 → 弹回来。
        //    所有显隐都走过渡，不做「啪一下出现/消失」的硬切。
        const wantShow = this.combo >= HIT_MIN_COMBO;
        if (wantShow && this.hitPhase === 0) {
            this.hitPhase = 1; this.hitPhaseLeft = HIT_IN_MS; txt.setVisible(true);
        } else if (wantShow && this.hitPhase === 3) {
            this.hitPhase = 1; this.hitPhaseLeft = HIT_IN_MS;
        } else if (!wantShow && (this.hitPhase === 1 || this.hitPhase === 2)) {
            this.hitPhase = 3; this.hitPhaseLeft = HIT_OUT_MS;
        }
        if (this.hitPhase === 0) return;

        // 4) 数字 / 颜色（脏检查，避免每帧重排版）。
        // ⚠️ 消失动画期间必须**冻结**：断连时 combo 已归零，若继续写会闪一下「0 HIT」，
        //    破坏「保持最后一击的数字淡出」的观感（2026-10-17 实测踩到）。
        if (this.hitPhase !== 3) {
            if (this.hitShown !== this.combo) { this.hitShown = this.combo; txt.setText(`${this.combo} HIT`); }
            const color = this.hitColorFor(this.combo);
            if (this.hitTierShown !== color) { this.hitTierShown = color; txt.setColor(color); }
        }

        // 5) 状态机：入场弹性 → 保持呼吸 → 离场淡出
        let base = 1;
        let alpha = 1;
        if (this.hitPhase === 1) {
            this.hitPhaseLeft = Math.max(0, this.hitPhaseLeft - delta);
            const t = 1 - this.hitPhaseLeft / HIT_IN_MS;                      // 0 → 1
            base = t < 0.6
                ? 0.6 + (HIT_IN_OVERSHOOT - 0.6) * (t / 0.6)                   // 0.6 → 1.15（冲过头）
                : HIT_IN_OVERSHOOT - (HIT_IN_OVERSHOOT - 1) * ((t - 0.6) / 0.4);  // 1.15 → 1.0（回弹）
            alpha = Math.min(1, t * 2.5);                                      // 前 40% 时长内淡入
            if (this.hitPhaseLeft <= 0) this.hitPhase = 2;
        } else if (this.hitPhase === 2) {
            base = 1 + HIT_BREATH_AMP * Math.sin(this.elapsed * HIT_BREATH_SPEED);   // 轻微呼吸，别死板
        } else {
            this.hitPhaseLeft = Math.max(0, this.hitPhaseLeft - delta);
            const t = 1 - this.hitPhaseLeft / HIT_OUT_MS;                      // 0 → 1
            base = 1 - (1 - HIT_OUT_SCALE) * t;
            alpha = 1 - t;
            if (this.hitPhaseLeft <= 0) {
                this.hitPhase = 0; this.hitShown = -1; this.hitTierShown = '';
                this.setHitAlpha(1); txt.setVisible(false); return;
            }
        }

        // 6) 命中脉冲叠加：放大 + 抖动（平方衰减，起步猛、收得快）
        let punch = 1;
        let shakeK = 0;
        if (punchBefore > 0) {
            const k = punchBefore / HIT_PUNCH_MS;
            shakeK = k * k;
            punch = 1 + HIT_PUNCH_SCALE * shakeK;
        }
        this.setHitAlpha(alpha);
        const s = base * punch;
        txt.setScale(s, s);
        txt.setPosition(this.hitBaseX + this.hitShakeX * shakeK, this.hitBaseY + this.hitShakeY * shakeK);
    }

    /**
     * 改 HIT 文本整体透明度。
     * ⚠️ `GameObject.setAlpha` 只对 Image 组件生效，Text 对象没有 Image ⇒ 用不了；
     * Text2D 的透明度属性是 `letterAlpha`。量化到 0.05 步长做脏检查，避免每帧重排版。
     */
    private setHitAlpha(a: number): void {
        if (!this.hitText) return;
        const q = Math.round(a * 20) / 20;
        if (q === this.hitAlphaShown) return;
        this.hitAlphaShown = q;
        const comp = this.hitText.getEngineComponent('Text2D') as any;
        if (comp && comp.letterAlpha !== undefined) comp.letterAlpha = q;
    }

    /** 按连击数取 HIT 颜色（DB16 色板，越高越"烫"）。 */
    private hitColorFor(combo: number): string {
        for (const tier of HIT_TIERS) if (combo >= tier.from) return tier.color;
        return HIT_TIERS[HIT_TIERS.length - 1].color;
    }

    /**
     * 结算评级：完全由真实采集的数据算出，可复现、可解释
     * （旧版是 `win ? 'B' : 'C'` 硬编码 —— 打得再好也是 B，等于假数据）。
     * 未击杀一律 C：没打完的局不谈表现（含 30 秒超时、一枪没开）。
     * 分数 = 命中率×50 + 速度×30 + 连击×20；权重与分数线见文件顶部 GRADE_* 常量。
     */
    private gradeResult(win: boolean): string {
        if (!win || this.shots === 0) return 'C';
        const acc = Math.min(1, this.hits / this.shots / GRADE_ACC_FULL);
        const speed = Math.max(0, 1 - this.elapsed / GRADE_SPEED_CEIL);
        const combo = Math.min(1, this.maxCombo / GRADE_COMBO_FULL);
        const score = acc * GRADE_WEIGHT_ACC + speed * GRADE_WEIGHT_SPEED + combo * GRADE_WEIGHT_COMBO;
        if (score >= GRADE_S) return 'S';
        if (score >= GRADE_A) return 'A';
        if (score >= GRADE_B) return 'B';
        return 'C';
    }

    /**
     * 全屏彩带序列帧的开关。显隐与「重播」绑在一起：
     * 引擎的动画纹理会自己无限循环，不重置的话每次胜利看到的都是**上一次播到一半**的进度，
     * 观感像彩带中途接上。所以显示时先倒回首帧再播。
     */
    private setConfettiSequence(show: boolean): void {
        if (!this.confettiSeq) return;
        if (show) this.restartConfettiSequence();
        this.confettiSeq.setVisible(show);
    }

    /** 把彩带序列帧倒回首帧并重新播放（控制器懒取一次，取不到就只静态显示首帧，不报错）。 */
    private restartConfettiSequence(): void {
        if (!this.confettiSeq) return;
        if (!this.confettiCtrl) {
            const tex = this.confettiSeq.getTexture();
            const ctrl = (tex ? tex.getControl() : null) as unknown as { stop?: () => void; play?: () => void } | null;
            if (!ctrl || typeof ctrl.stop !== 'function' || typeof ctrl.play !== 'function') {
                console.warn('[confetti] AnimatedTextureProvider not available; sequence will show its current frame.');
                return;
            }
            this.confettiCtrl = ctrl as { stop(): void; play(): void };
        }
        this.confettiCtrl.stop(); this.confettiCtrl.play();
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
        // 异常打印配额一并归零：否则某一局把配额用光后，后面几局的异常会被永久静默，
        // 表现成「游戏卡住但日志里什么都没有」。
        this.errQuota = 6; this.orbitErrLeft = 6;
        // 不在 reset 内立即投放：此刻 AR 相机多半还没被 SLAM 驱动（世界位置=原点），
        // 锚点会算到错误位置，表现为「Boss 极小」或「跑到相机背后完全看不见」。
        // 改为交给 update 里的投放闸门，等相机就位后再算锚点。
        this.spawnReady = false; this.spawnWait = 0;
        if (this.bossSpatial) this.bossSpatial.enabled = false;
        // 强制下一帧重写一次血条材质 / HUD 文本，避免复用上一局的缓存。
        this.hpFillRatio = -1; this.hudText = '';
        this.hpDelayRatio = 1; this.hpDelayWait = 0;
        this.setBossTexture(this.idleTexture);
        this.crosshair.setVisible(true); this.highlight.setVisible(false); this.gun.setFlipX(false).setPosition(this.gunBaseX, this.gunBaseY).setAngle(this.gunBaseAngle).setTexture(this.gunBaseTexture).setVisible(true); this.shield.setVisible(false); this.core.setVisible(false); this.hudPlate.setVisible(true); this.hpFill.setVisible(true); this.hpDelay.setVisible(true); this.setHpFillAmount(); this.hud.setText(`稳定 ${MAX_HP}   30s`).setVisible(true); this.hint.setText('转动手机对准，按住能量脉冲').setVisible(true);
        this.resultCard.setVisible(false); this.resultTitle.setVisible(false); this.resultStats.setVisible(false);
        this.setConfettiSequence(false);
        // 连击状态归零 + HIT 复位（位置/缩放/透明度必须复原，否则下一局开局是歪的）。
        this.comboLeft = 0; this.hitPunchLeft = 0; this.hitShown = -1; this.hitTierShown = '';
        this.hitPhase = 0; this.hitPhaseLeft = 0;
        this.hitAlphaShown = -1; this.setHitAlpha(1);
        if (this.hitText) this.hitText.setVisible(false).setScale(1, 1).setPosition(this.hitBaseX, this.hitBaseY);
        // 真机空间诊断探针（默认关闭，见 DEBUG_SPATIAL_PROBE）。
        if (DEBUG_SPATIAL_PROBE) {
            this.time.delayedCall(1500, () => this.probeSpatial('t1.5'), [], this);
            this.time.delayedCall(3000, () => this.probeSpatial('t3.0'), [], this);
            this.time.delayedCall(4500, () => this.probeSpatial('t4.5'), [], this);
        }
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
            // 球心初值 = 开局时用户（相机）所在位置。
            // ORBIT_FOLLOW_CAMERA 开启时之后每帧同步；关闭则整局钉死在这里（世界锚定）。
            this.userOrigin.x = camPos.x; this.userOrigin.y = camPos.y; this.userOrigin.z = camPos.z;
            // 开局视轴作为参考基：yaw=pitch=0 即"手机正前方"。
            this.updateBasisFromCamera();
        }
        // 出生即正前方（yaw=pitch=0），随后才开始绕飞。
        this.orbitYaw = 0; this.orbitPitch = 0;
        this.orbitYawVel = 0; this.orbitPitchVel = 0;
        this.placeBossOnOrbit();
        // 出生就停在**相机视轴正前方**（yaw=pitch=0 ⇒ baseForward 方向），
        // 不做任何投影纠偏 —— 原因见文件头「出生位置」那段注释。
        // 先定住不动，让玩家看清 Boss 的位置，再开始绕飞。
        this.bornHoldLeft = BORN_HOLD_MS;
        if (this.bossSpatial) {
            this.bossSpatial.getTransform().setWorldPosition(this.bossPos);
            this.bossSpatial.enabled = true;
        }
        this.projectBoss();
        this.syncFollowers();
    }

    /**
     * 用相机**当前**朝向重算参考基 baseForward / baseRight / baseUp。
     * `spawnBossInSpace()` 开局会调一次；当 ORBIT_FOLLOW_HEADING 开启时每帧再调（朝向跟随）。
     */
    private updateBasisFromCamera(): void {
        if (!this.arCamera) return;
        const look = this.arCamera.getLookAt();
        const len = Math.sqrt(look.x * look.x + look.y * look.y + look.z * look.z);
        // 朝向无效（SLAM 未就绪 / API 返回零向量）时保持上一次的基，别污染后续所有计算。
        if (!isFinite(len) || len < 1e-6) return;
        // ⚠️ APJS 的 Vector3f.cross / normalize 都是**原地修改**（文档：cross "stores the result
        //    in this vector"；normalize "in place"，零向量保持原样）。所以必须在**临时向量**上算。
        //    此前写成 `this.baseForward.cross(refUp).normalize()`，直接把 baseForward 覆盖成了
        //    右向量，并让 baseRight×baseForward = v×v = 零向量，于是：
        //      · Boss 出生在用户右侧 90°（baseForward 已变成右方向）
        //      · baseRight / baseUp 全为 0 ⇒ yaw 与 pitch 偏移全部乘 0 失效（怪既不绕飞也不浮动）
        const fwd = new APJS.Vector3f(look.x / len, look.y / len, look.z / len);
        const refUp = Math.abs(fwd.y) > 0.99
            ? new APJS.Vector3f(0, 0, 1) : new APJS.Vector3f(0, 1, 0);
        const right = fwd.clone().cross(refUp).normalize();
        const up = right.clone().cross(fwd).normalize();
        this.baseForward.x = fwd.x; this.baseForward.y = fwd.y; this.baseForward.z = fwd.z;
        this.baseRight.x = right.x; this.baseRight.y = right.y; this.baseRight.z = right.z;
        this.baseUp.x = up.x; this.baseUp.y = up.y; this.baseUp.z = up.z;
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
