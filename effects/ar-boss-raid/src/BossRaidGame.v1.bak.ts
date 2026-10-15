/**
 * AR 像素 Boss 战 · 最小可跑链路（步 2）
 *
 * 覆盖：输入 → 准星跟随 → 按住持续开火（250ms 闸门）→ 命中判定 → 掉血 → 血条同步 → 命中音效
 *
 * APJS 硬约束（必须遵守）：
 *   - 无 APJS.Time / setTimeout / setInterval / Promise / Set / Map
 *   - 计时一律用 onUpdate(dt) 累加
 *   - @serializeProperty 字段必须在 onUpdate 里懒初始化，不能在 onStart 直接 getComponent
 *   - 屏幕空间 720x1280，原点左下，Y 向上
 *   - TouchData.position 是归一化坐标，原点左上，用前必须翻 Y
 *
 * 项目宪法口径：
 *   - 开火闸门 250ms（严格 4 发/秒，见 implement-plan / game-design）
 *   - Boss 满血 2400（game-design §4）
 */
@component()
export class BossRaidGame extends APJS.BasicScriptComponent {
  private static readonly MAX_HP: number = 2400;
  private static readonly DAMAGE_PER_HIT: number = 24;
  private static readonly FIRE_INTERVAL: number = 0.25; // 250ms = 严格 4 发/秒
  private static readonly CROSS_OFFSET_Y: number = 120; // 准星抬到手指上方，避免手指遮挡
  private static readonly HP_BAR_FULL_W: number = 500;
  private static readonly HP_BAR_H: number = 90;

  @serializeProperty
  private bossObj: APJS.SceneObject;
  @serializeProperty
  private crossObj: APJS.SceneObject;
  @serializeProperty
  private hpFillObj: APJS.SceneObject;
  @serializeProperty
  private sfxObj: APJS.SceneObject;

  private bossImage: APJS.Image | null = null;
  private crossSt: APJS.ScreenTransform | null = null;
  private hpFillSt: APJS.ScreenTransform | null = null;
  private sfx: APJS.AudioComponent | null = null;

  private ready: boolean = false;
  private hp: number = BossRaidGame.MAX_HP;
  private firing: boolean = false;
  private fireTimer: number = 0;
  private shots: number = 0;

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
    if (!this.bossObj || !this.crossObj || !this.hpFillObj || !this.sfxObj) {
      return;
    }
    this.bossImage = this.bossObj.getComponent('Image') as APJS.Image;
    this.crossSt = this.crossObj.getComponent('ScreenTransform') as APJS.ScreenTransform;
    this.hpFillSt = this.hpFillObj.getComponent('ScreenTransform') as APJS.ScreenTransform;
    this.sfx = this.sfxObj.getComponent('AudioComponent') as APJS.AudioComponent;
    if (!this.bossImage || !this.crossSt || !this.hpFillSt) {
      return;
    }
    this.ready = true;
    this.resetGame();
    console.log('[BOSS] ready maxHp=' + BossRaidGame.MAX_HP);
  }

  private resetGame(): void {
    if (!this.ready) {
      return;
    }
    this.hp = BossRaidGame.MAX_HP;
    this.firing = false;
    this.fireTimer = 0;
    this.shots = 0;
    this.applyHp();
    console.log('[BOSS] reset hp=' + this.hp);
  }

  private handleRecordStart(): void {
    this.resetGame();
  }

  private handleTouch(e: APJS.IEvent): void {
    if (!this.ready) {
      return;
    }
    const t = e.args[0] as APJS.TouchData;
    const sx = t.position.x * 720;
    const sy = (1 - t.position.y) * 1280;
    if (t.phase === APJS.TouchPhase.Began) {
      this.firing = true;
      this.fireTimer = 0;
      this.moveCross(sx, sy);
      console.log('[input] began ' + Math.round(sx) + ',' + Math.round(sy));
    } else if (t.phase === APJS.TouchPhase.Moved) {
      this.moveCross(sx, sy);
    } else if (t.phase === APJS.TouchPhase.Ended || t.phase === APJS.TouchPhase.Canceled) {
      this.firing = false;
      console.log('[input] ended shots=' + this.shots);
    }
  }

  private moveCross(sx: number, sy: number): void {
    if (!this.crossSt) {
      return;
    }
    this.crossSt.anchoredPosition = new APJS.Vector2f(
      sx - 360,
      sy - 640 + BossRaidGame.CROSS_OFFSET_Y
    );
  }

  private fireOneShot(): void {
    if (!this.bossImage || !this.crossSt) {
      return;
    }
    if (this.hp <= 0) {
      return;
    }
    const p = this.crossSt.anchoredPosition;
    const px = p.x + 360;
    const py = p.y + 640;
    const norm = new APJS.Vector2f(px / 720, 1 - py / 1280);
    if (!APJS.TouchUtils.isScreenPointOnImage(norm, this.bossImage)) {
      console.log('[miss] ' + Math.round(px) + ',' + Math.round(py));
      return;
    }
    this.shots = this.shots + 1;
    this.hp = Math.max(0, this.hp - BossRaidGame.DAMAGE_PER_HIT);
    this.applyHp();
    if (this.sfx) {
      this.sfx.play();
    }
    console.log('[命中] shot#' + this.shots + ' hp=' + this.hp + ' [audio]');
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
