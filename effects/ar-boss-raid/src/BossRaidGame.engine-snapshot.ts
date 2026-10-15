/**
 * AR 像素 Boss 战 · AR 空间锚定 + 胜负判定 + 命中反馈
 *
 * 玩法：Boss 锚定在真实空间的 3D 位置。玩家转动手机 → DeviceTracker 驱动的 AR 相机
 *       朝向变化 → Boss 在屏幕上相对滑动 → 把它转进屏幕正中的准星即可开火命中。
 *
 * 相机获取：优先按名查找 AR摄像机，失败则扫描带 DeviceTracker 的对象。
 *
 * APJS 硬约束：无 APJS.Time / setTimeout / Promise / Set / Map；计时用 onUpdate(dt) 累加；
 *              @serializeProperty 字段在 onUpdate 里懒初始化。
 *
 * 项目宪法口径：开火闸门 250ms（严格 4 发/秒）；Boss 满血 2400；单发 24；战斗时限 90s
 *
 * 命中判定：bossWorldPos --(camera.worldToViewportPoint)--> 归一化视口坐标（原点左下）
 *           |vp.x-0.5| <= AIM_TOL_X 且 |vp.y-0.5| <= AIM_TOL_Y 且 vp.z > 0 即命中
 */
@component()
export class BossRaidGame extends APJS.BasicScriptComponent {
  private static readonly MAX_HP: number = 2400;
  private static readonly DAMAGE_PER_HIT: number = 24;
  private static readonly FIRE_INTERVAL: number = 0.25;

  /** 准星容差（视口归一化）：Boss 投影落在屏幕中心 ±TOL 内即视为已瞄准 */
  private static readonly AIM_TOL_X: number = 0.17;
  private static readonly AIM_TOL_Y: number = 0.17;

  /**
   * 战斗时限（秒）。超时 Boss 未死即判负。
   * 90s 的来源：2400 血 ÷ 24 伤害 = 100 发命中；开火闸门 250ms → 理论最短 25s，
   * 但 AR 瞄准下会把大量子弹打在准星外，实测命中率仅 34%（fired=294 / hit=100），
   * 60s 版本实测差 3 发未打死（hp=72）。故放宽到 90s，具体数值待真机调优。
   */
  private static readonly BATTLE_LIMIT: number = 90;

  /** 四阶段血线（血量比例） */
  private static readonly PHASE_ENRAGE: number = 0.66;
  private static readonly PHASE_SHIELD: number = 0.33;
  private static readonly PHASE_FAINT: number = 0.15;

  /** 命中泛红持续时间（秒）。命中瞬间最红，之后线性回到无染色。 */
  private static readonly HIT_FLASH_TIME: number = 0.14;

  private static readonly HP_BAR_FULL_W: number = 500;
  private static readonly HP_BAR_H: number = 90;

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

  private bossTf: APJS.Transform | null = null;
  private bossImg: APJS.Image | null = null;
  private cam: APJS.Camera | null = null;
  private camName: string = '?';
  private hpFillSt: APJS.ScreenTransform | null = null;
  private sfx: APJS.AudioComponent | null = null;
  private resultText: APJS.Text | null = null;

  private ready: boolean = false;

  private hp: number = BossRaidGame.MAX_HP;
  private firing: boolean = false;
  private fireTimer: number = 0;
  private shots: number = 0;
  private fired: number = 0;
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
    console.log('[BOSS] onStart');
  }

  onUpdate(dt: number): void {
    if (!this.ready) {
      this.tryInit();
      return;
    }
    this.updateHitFlash(dt);
    if (this.over) {
      return;
    }
    this.battleTimer = this.battleTimer + dt;
    if (this.battleTimer >= BossRaidGame.BATTLE_LIMIT) {
      this.lose();
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
    this.firing = false;
    this.fireTimer = 0;
    this.shots = 0;
    this.fired = 0;
    this.battleTimer = 0;
    this.phase = 0;
    this.over = false;
    this.diagLeft = 3;
    this.hitFlash = 0;
    this.applyBossTint(0);
    this.hideResult();
    this.applyHp();
    console.log('[BOSS] reset hp=' + this.hp + ' limit=' + BossRaidGame.BATTLE_LIMIT + 's');
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
      console.log('[input] began firing');
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

  private fireOneShot(): void {
    if (!this.ready || this.over || this.hp <= 0) {
      return;
    }
    this.fired = this.fired + 1;
    if (!this.isBossOnCrosshair()) {
      if (BossRaidGame.DEBUG_AIM && this.diagLeft > 0) {
        this.diagLeft = this.diagLeft - 1;
        console.log('[diag] ' + this.diagInfo());
      }
      return;
    }
    this.shots = this.shots + 1;
    this.hp = Math.max(0, this.hp - BossRaidGame.DAMAGE_PER_HIT);
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
    // 白色 (1,1,1) = 不染色；k 越大越偏向红，绿蓝通道被压低
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

  private win(): void {
    this.over = true;
    this.firing = false;
    this.hitFlash = 0;
    this.applyBossTint(0);
    this.showResult('胜利！');
    console.log('[WIN] hit=' + this.shots + ' fired=' + this.fired +
      ' time=' + this.f2(this.battleTimer) + 's');
  }

  private lose(): void {
    this.over = true;
    this.firing = false;
    this.hitFlash = 0;
    this.applyBossTint(0);
    this.showResult('败北…');
    console.log('[LOSE] hp=' + this.hp + ' time=' + this.f2(this.battleTimer) + 's');
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
