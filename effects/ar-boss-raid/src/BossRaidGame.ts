/**
 * AR 像素 Boss 战 · AR 空间锚定 + 弹药/换弹 + 连击 + 胜负判定
 *
 * 玩法：Boss 锚定在真实空间的 3D 位置。玩家转动手机 → DeviceTracker 驱动的 AR 相机
 *       朝向变化 → Boss 在屏幕上相对滑动 → 把它转进屏幕正中的准星，按住屏幕开火命中。
 *
 * 数值口径（★ 单一来源 game-design-doc.md §五，改数请先改那里，勿在此处就地改）：
 *   血量 2400 / 普通命中 80 / 核心命中 120 / 开火闸门 250ms（严格 4 发·秒⁻¹）
 *   弹匣 12 / 换弹 1.0s / 单局时限 40s / 阶段血线 66% · 33% · 15%
 *
 * 相机获取：优先按名查找「AR摄像机」，失败则扫描带 DeviceTracker 的对象。
 *
 * APJS 硬约束：无 APJS.Time / setTimeout / Promise / Set / Map；计时一律 onUpdate(dt) 累加；
 *              @serializeProperty 字段在 onUpdate 里懒初始化。
 *
 * 命中判定：bossWorldPos --(camera.worldToViewportPoint)--> 归一化视口坐标（原点左下）
 *           |vp.x-0.5| <= AIM_TOL_X 且 |vp.y-0.5| <= AIM_TOL_Y 且 vp.z > 0 即命中
 *
 * 验证开关（debugEnd）：平时为 0，仅预览验证时经 interact_by_dsl.transport_preview_property 注入。
 * 飞行参数（flyAmp / flySpeed / flySway / flySwaySpeed）：默认即正式值，可直接在检视面板调。
 */
@component()
export class BossRaidGame extends APJS.BasicScriptComponent {
  private static readonly MAX_HP: number = 2400;

  /** 普通命中伤害（非护盾期）。30 发 × 80 = 2400，纯射 ≈7.5s */
  private static readonly DMG_NORMAL: number = 80;

  /** 核心点命中伤害（非护盾期），鼓励打核心点、制造操作分层 */
  private static readonly DMG_CORE: number = 120;

  /** 开火闸门：250ms = 严格 4 发/秒 */
  private static readonly FIRE_INTERVAL: number = 0.25;

  /** 准星容差（视口归一化）：Boss 投影落在屏幕中心 ±TOL 内即视为已瞄准 */
  private static readonly AIM_TOL_X: number = 0.17;
  private static readonly AIM_TOL_Y: number = 0.17;

  private static readonly BATTLE_LIMIT: number = 40;

  /** 弹匣容量 / 换弹时长 */
  private static readonly MAG_SIZE: number = 12;
  private static readonly RELOAD_TIME: number = 1.0;

  /** 四阶段血线（血量比例） */
  private static readonly PHASE_ENRAGE: number = 0.66;
  private static readonly PHASE_SHIELD: number = 0.33;
  private static readonly PHASE_FAINT: number = 0.15;

  /** 命中泛红持续时间（秒）。命中瞬间最红，之后线性回到无染色。 */
  private static readonly HIT_FLASH_TIME: number = 0.14;

  private static readonly HP_BAR_FULL_W: number = 500;
  private static readonly HP_BAR_H: number = 90;

  /** 连击播报步长：每累计 N 连打一次日志（后续接连击音效 / UI） */
  private static readonly COMBO_STEP: number = 5;

  /** 瞄准诊断开关：排查命中判定时置 true，会打印投影数值 */
  private static readonly DEBUG_AIM: boolean = false;

  @serializeProperty
  private bossObj: APJS.SceneObject;
  @serializeProperty
  private crossObj: APJS.SceneObject;
  @serializeProperty
  private hpFillObj: APJS.SceneObject;
  @serializeProperty
  private sfxObj: APJS.SceneObject;
  @serializeProperty
  private resultObj: APJS.SceneObject;

  /** 【调试】强制结算：0=不干预、1=立即胜利、2=立即失败。正式值 0。 */
  @serializeProperty
  private debugEnd: number = 0;

  /**
   * 飞行振幅（世界单位）：Boss 在基准点上叠加 sin 上下浮沉的幅度。
   * 0 = 静止悬浮。实测已证明 3D Transform 可被脚本驱动（AR 追踪不覆写）。
   * 1.2 取「轻量漂浮」档：起伏可见但不脱出屏内瞄准范围。
   */
  @serializeProperty
  private flyAmp: number = 1.2;

  /** 飞行角速度（弧度/秒）。1.2 rad/s → 周期约 5.2s，缓慢从容的悬停手感。 */
  @serializeProperty
  private flySpeed: number = 1.2;

  /** 飞行横向漂移幅度（世界单位）。0 = 只上下浮沉，不做左右移动。 */
  @serializeProperty
  private flySway: number = 0.6;

  /** 飞行漂移角速度（弧度/秒）。与浮沉不同频，合成柔和的 8 字轨迹。 */
  @serializeProperty
  private flySwaySpeed: number = 0.7;

  private bossTf: APJS.Transform | null = null;
  private bossBasePos: APJS.Vector3f | null = null;
  private flyT: number = 0;
  /** 【临时诊断】每秒打印一次 Boss 的 wp/vp，用于排查"看不见 Boss" */
  private diagT: number = 0;
  private bossImg: APJS.Image | null = null;
  private cam: APJS.Camera | null = null;
  private camName: string = '?';
  private hpFillSt: APJS.ScreenTransform | null = null;
  private sfx: APJS.AudioComponent | null = null;
  private resultText: APJS.Text | null = null;

  private ready: boolean = false;

  private hp: number = BossRaidGame.MAX_HP;
  private ammo: number = BossRaidGame.MAG_SIZE;
  private reloading: boolean = false;
  private reloadTimer: number = 0;

  private firing: boolean = false;
  private fireTimer: number = 0;

  private shots: number = 0;
  private fired: number = 0;
  private combo: number = 0;
  private maxCombo: number = 0;

  private battleTimer: number = 0;
  private phase: number = 0;
  private over: boolean = false;
  private diagLeft: number = 3;
  private hitFlash: number = 0;

  private onTouchCb: (e: APJS.IEvent) => void;
  private onRecordCb: (e: APJS.IEvent) => void;

  onStart(): void {
    this.onTouchCb = (e: APJS.IEvent) => { this.handleTouch(e); };
    this.onRecordCb = (e: APJS.IEvent) => { this.handleRecordStart(); };
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.Touch, this.onTouchCb, this);
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordCb, this);
    console.log('[BOSS] onStart dmg=' + BossRaidGame.DMG_NORMAL +
      ' mag=' + BossRaidGame.MAG_SIZE +
      ' limit=' + BossRaidGame.BATTLE_LIMIT + 's');
  }

  onUpdate(dt: number): void {
    if (!this.ready) {
      this.tryInit();
      return;
    }
    this.updateHitFlash(dt);
    if (this.debugEnd === 1) {
      this.debugEnd = 0;
      this.win();
      return;
    }
    if (this.debugEnd === 2) {
      this.debugEnd = 0;
      this.lose();
      return;
    }
    this.updateFly(dt);
    if (this.over) {
      return;
    }
    this.battleTimer = this.battleTimer + dt;
    if (this.battleTimer >= BossRaidGame.BATTLE_LIMIT) {
      this.lose();
      return;
    }
    if (this.reloading) {
      this.updateReload(dt);
      return;
    }
    if (!this.firing) {
      return;
    }
    this.fireTimer = this.fireTimer - dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = this.fireTimer + BossRaidGame.FIRE_INTERVAL;
      this.fireOneShot();
    }
  }

  private tryInit(): void {
    if (!this.bossObj || !this.hpFillObj || !this.sfxObj) {
      return;
    }
    this.bossTf = this.bossObj.getTransform();
    this.bossBasePos = this.bossTf.getWorldPosition();
    this.bossImg = this.bossObj.getComponent('Image') as APJS.Image;
    this.hpFillSt = this.hpFillObj.getComponent('ScreenTransform') as APJS.ScreenTransform;
    this.sfx = this.sfxObj.getComponent('AudioComponent') as APJS.AudioComponent;
    if (this.resultObj) {
      this.resultText = this.resultObj.getComponent('Text') as APJS.Text;
      this.resultObj.setEnabledInHierarchy(false);
    }
    if (!this.cam) {
      this.tryResolveCamera();
    }
    if (!this.bossTf || !this.hpFillSt || !this.cam) {
      return;
    }
    this.ready = true;
    this.resetGame();
    console.log('[BOSS] ready maxHp=' + BossRaidGame.MAX_HP + ' cam=' + this.camName +
      ' img=' + (this.bossImg ? 'yes' : 'no') +
      ' result=' + (this.resultText ? 'yes' : 'no'));
  }

  private tryResolveCamera(): void {
    const sc = this.getSceneObject().scene;
    const byName = sc.findSceneObject('AR摄像机');
    if (byName) {
      const c = byName.getComponent('Camera');
      if (c) {
        this.cam = c as APJS.Camera;
        this.camName = 'byname:' + byName.name;
        return;
      }
    }
    const roots = sc.getRootSceneObjects();
    for (let i = 0; i < roots.length; i++) {
      if (this.scanArCamera(roots[i])) {
        return;
      }
    }
  }

  private scanArCamera(obj: APJS.SceneObject): boolean {
    if (obj.getComponent('DeviceTracker')) {
      const c = obj.getComponent('Camera');
      if (c) {
        this.cam = c as APJS.Camera;
        this.camName = 'scan:' + obj.name;
        return true;
      }
    }
    const kids = obj.getChildren();
    for (let i = 0; i < kids.length; i++) {
      if (this.scanArCamera(kids[i])) {
        return true;
      }
    }
    return false;
  }

  private resetGame(): void {
    if (!this.ready) {
      return;
    }
    this.hp = BossRaidGame.MAX_HP;
    this.ammo = BossRaidGame.MAG_SIZE;
    this.reloading = false;
    this.reloadTimer = 0;
    this.firing = false;
    this.fireTimer = 0;
    this.shots = 0;
    this.fired = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.battleTimer = 0;
    this.phase = 0;
    this.over = false;
    this.diagLeft = 3;
    this.hitFlash = 0;
    this.flyT = 0;
    this.applyBossTint(0);
    this.hideResult();
    this.setCrosshairVisible(true);
    this.applyHp();
    console.log('[BOSS] reset hp=' + this.hp + ' ammo=' + this.ammo +
      ' limit=' + BossRaidGame.BATTLE_LIMIT + 's');
  }

  private handleRecordStart(): void {
    this.resetGame();
  }

  private handleTouch(e: APJS.IEvent): void {
    if (!this.ready || this.over) {
      return;
    }
    const t = e.args[0] as APJS.TouchData;
    if (t.phase === APJS.TouchPhase.Began) {
      this.firing = true;
      this.fireTimer = 0;
      if (this.ammo <= 0 && !this.reloading) {
        this.beginReload();
      }
      console.log('[input] began firing ammo=' + this.ammo);
    } else if (t.phase === APJS.TouchPhase.Ended || t.phase === APJS.TouchPhase.Canceled) {
      this.firing = false;
      console.log('[input] ended fired=' + this.fired + ' hit=' + this.shots);
    }
  }

  private isBossOnCrosshair(): boolean {
    if (!this.bossTf || !this.cam) {
      return false;
    }
    const wp = this.bossTf.getWorldPosition();
    const vp = this.cam.worldToViewportPoint(wp);
    if (vp.z <= 0) {
      return false;
    }
    const dx = Math.abs(vp.x - 0.5);
    const dy = Math.abs(vp.y - 0.5);
    return dx <= BossRaidGame.AIM_TOL_X && dy <= BossRaidGame.AIM_TOL_Y;
  }

  private beginReload(): void {
    if (this.reloading || this.over) {
      return;
    }
    this.reloading = true;
    this.reloadTimer = BossRaidGame.RELOAD_TIME;
    console.log('[reload] start');
  }

  private updateReload(dt: number): void {
    this.reloadTimer = this.reloadTimer - dt;
    if (this.reloadTimer > 0) {
      return;
    }
    this.reloading = false;
    this.reloadTimer = 0;
    this.ammo = BossRaidGame.MAG_SIZE;
    console.log('[reload] done ammo=' + this.ammo);
  }

  private fireOneShot(): void {
    if (!this.ready || this.over || this.hp <= 0 || this.reloading) {
      return;
    }
    if (this.ammo <= 0) {
      this.beginReload();
      return;
    }
    this.ammo = this.ammo - 1;
    this.fired = this.fired + 1;
    if (!this.isBossOnCrosshair()) {
      this.breakCombo();
      if (BossRaidGame.DEBUG_AIM && this.diagLeft > 0) {
        this.diagLeft = this.diagLeft - 1;
        console.log('[diag] ' + this.diagInfo());
      }
      return;
    }
    this.applyHit();
  }

  private applyHit(): void {
    this.shots = this.shots + 1;
    this.combo = this.combo + 1;
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    if (this.combo % BossRaidGame.COMBO_STEP === 0) {
      console.log('[combo] ' + this.combo);
    }
    this.hp = Math.max(0, this.hp - BossRaidGame.DMG_NORMAL);
    this.hitFlash = BossRaidGame.HIT_FLASH_TIME;
    this.applyHp();
    if (this.sfx) {
      this.sfx.play();
    }
    if (this.hp <= 0) {
      this.win();
      return;
    }
    this.checkPhase();
  }

  private breakCombo(): void {
    if (this.combo > 0) {
      this.combo = 0;
    }
  }

  /**
   * Boss 飞行：在基准世界坐标上叠加 sin 上下浮沉 + 异频横向漂移，合成柔和的 8 字悬停轨迹。
   * 实测依据（2026-10-14）：write→readback 的 y 值恒等（d=0），且预览中对象确实位移
   *   → 3D 世界锚定对象的 Transform 可被脚本驱动，AR 追踪不覆写。
   * flyAmp 与 flySway 同时为 0 时直接 return，零开销。
   */
  private updateFly(dt: number): void {
    if (!this.bossTf || !this.bossBasePos) {
      return;
    }
    if (this.flyAmp === 0 && this.flySway === 0) {
      return;
    }
    this.flyT = this.flyT + dt;
    const base = this.bossBasePos;
    const dy = Math.sin(this.flyT * this.flySpeed) * this.flyAmp;
    const dx = Math.sin(this.flyT * this.flySwaySpeed) * this.flySway;
    this.bossTf.setWorldPosition(new APJS.Vector3f(base.x + dx, base.y + dy, base.z));
    this.diagT = this.diagT + dt;
    if (this.diagT >= 1) {
      this.diagT = 0;
      console.log('[DIAG] ' + this.diagInfo());
    }
  }

  /** 命中泛红：k=1 最红，线性衰减回无染色（白色即不染色） */
  private updateHitFlash(dt: number): void {
    if (this.hitFlash <= 0) {
      return;
    }
    this.hitFlash = this.hitFlash - dt;
    if (this.hitFlash < 0) {
      this.hitFlash = 0;
    }
    this.applyBossTint(this.hitFlash / BossRaidGame.HIT_FLASH_TIME);
  }

  private applyBossTint(k: number): void {
    if (!this.bossImg) {
      return;
    }
    this.bossImg.color = new APJS.Color(1, 1 - 0.74 * k, 1 - 0.72 * k, 1);
  }

  /** 四阶段血线切换：暴怒 66% / 护盾 33% / 假死 15% */
  private checkPhase(): void {
    const r = this.hp / BossRaidGame.MAX_HP;
    if (this.phase < 1 && r <= BossRaidGame.PHASE_ENRAGE) {
      this.phase = 1;
      console.log('[phase] 1 暴怒 hp=' + this.hp + ' r=' + this.f2(r));
    } else if (this.phase < 2 && r <= BossRaidGame.PHASE_SHIELD) {
      this.phase = 2;
      console.log('[phase] 2 护盾 hp=' + this.hp + ' r=' + this.f2(r));
    } else if (this.phase < 3 && r <= BossRaidGame.PHASE_FAINT) {
      this.phase = 3;
      console.log('[phase] 3 假死 hp=' + this.hp + ' r=' + this.f2(r));
    }
  }

  private accuracy(): number {
    if (this.fired <= 0) {
      return 0;
    }
    return this.shots / this.fired;
  }

  private win(): void {
    this.over = true;
    this.firing = false;
    this.reloading = false;
    this.hitFlash = 0;
    this.applyBossTint(0);
    this.setCrosshairVisible(false);
    this.showResult('胜利！');
    console.log('[WIN] hit=' + this.shots + ' fired=' + this.fired +
      ' acc=' + this.f2(this.accuracy() * 100) + '%' +
      ' maxCombo=' + this.maxCombo +
      ' time=' + this.f2(this.battleTimer) + 's');
  }

  private lose(): void {
    this.over = true;
    this.firing = false;
    this.reloading = false;
    this.hitFlash = 0;
    this.applyBossTint(0);
    this.setCrosshairVisible(false);
    this.showResult('失败！');
    console.log('[LOSE] hp=' + this.hp + ' fired=' + this.fired + ' hit=' + this.shots +
      ' acc=' + this.f2(this.accuracy() * 100) + '%' +
      ' time=' + this.f2(this.battleTimer) + 's');
  }

  private showResult(msg: string): void {
    if (this.resultText) {
      this.resultText.text = msg;
    }
    if (this.resultObj) {
      this.resultObj.setEnabledInHierarchy(true);
    }
  }

  private hideResult(): void {
    if (this.resultObj) {
      this.resultObj.setEnabledInHierarchy(false);
    }
  }

  /** 准星显隐：结算后隐藏，防止占用 UI 污染画面；重开（resetGame）时恢复 */
  private setCrosshairVisible(on: boolean): void {
    if (this.crossObj) {
      this.crossObj.setEnabledInHierarchy(on);
    }
  }

  /** 诊断输出：把世界坐标 → 视口投影的真实数值打出来，用于定位瞄准判定偏差 */
  private diagInfo(): string {
    if (!this.bossTf || !this.cam) {
      return 'noTfOrCam';
    }
    const wp = this.bossTf.getWorldPosition();
    const vp = this.cam.worldToViewportPoint(wp);
    return 'cam=' + this.camName +
      ' wp=(' + this.f3(wp.x) + ',' + this.f3(wp.y) + ',' + this.f3(wp.z) + ')' +
      ' vp=(' + this.f3(vp.x) + ',' + this.f3(vp.y) + ',' + this.f3(vp.z) + ')';
  }

  private f2(v: number): string {
    return Math.round(v * 100) / 100 + '';
  }

  private f3(v: number): string {
    return Math.round(v * 1000) / 1000 + '';
  }

  private applyHp(): void {
    if (!this.hpFillSt) {
      return;
    }
    const r = this.hp / BossRaidGame.MAX_HP;
    this.hpFillSt.sizeDelta = new APJS.Vector2f(BossRaidGame.HP_BAR_FULL_W * r, BossRaidGame.HP_BAR_H);
  }

  onDestroy(): void {
    const em = APJS.EventManager.getGlobalEmitter();
    if (this.onTouchCb) {
      em.off(APJS.EventType.Touch, this.onTouchCb, this);
    }
    if (this.onRecordCb) {
      em.off(APJS.EventType.RecordStart, this.onRecordCb, this);
    }
  }
}
