import { ABILITIES, BY_ID, EVOLUTIONS, REGIONS, SPECIES, STAGES, TIPS } from '../data/catalog';
import type { AbilityId } from '../data/catalog';
import { Game } from '../core/game';
import type { Mode } from '../core/types';
import { clamp } from '../core/math';
import type { Input } from '../platform/input';
import type { Storage } from '../platform/storage';
import type { Audio } from '../platform/audio';
import type { Renderer } from '../render/renderer';
import { drawFish } from '../render/fish';
import { icon, evolutionArt } from './icons';
export const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
const modes = { journey: '海域旅程', endless: '无尽生存', practice: '自由练习' };
type Panel = 'none' | 'modes' | 'settings' | 'codex' | 'help' | 'tutorial' | 'practice' | 'records';
/** UI 只负责呈现与派发意图；成长、奖励、战斗与结算均由 Game 校验。 */
export class UI {
  game: Game | null = null;
  panel: Panel = 'none';
  tutorialStep = 0;
  codexId = 'sprat';
  practiceStage = 0;
  practiceAbility: AbilityId = 'surge';
  practiceSkin = 'clown';
  lastScreen = '';
  lastHUD = 0;
  toastTimer = 0;
  private resultDelay = 0;
  private resultRevealed = false;
  onGame = (g: Game | null) => {};
  private resumeScreen: 'playing' | 'paused' = 'playing';
  constructor(
    public root: HTMLElement,
    public store: Storage,
    public input: Input,
    public audio: Audio,
    public renderer: Renderer,
  ) {
    root.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (target) this.action(target.dataset.action!, target.dataset.value);
    });
    root.addEventListener('input', (e) => this.setting(e.target as HTMLInputElement));
    root.addEventListener('change', (e) => this.setting(e.target as HTMLInputElement));
    this.input.onPause = () => this.pause();
    this.input.onDash = () => this.audio.play('dash');
    this.applySettings();
    this.render();
  }
  start(mode: Mode, restore = false) {
    this.clearToast();
    const save = restore ? this.store.load() : null;
    this.game = save
      ? Game.restore(save)
      : new Game(mode, Date.now() & 0x7fffffff, this.practiceStage, this.practiceAbility);
    this.game.practiceSkin = this.practiceSkin;
    this.resultDelay = 0;
    this.resultRevealed = false;
    this.panel = 'none';
    this.onGame(this.game);
    this.input.reset();
    this.audio.unlock();
    if (mode === 'journey' && !restore && !this.store.records.tutorial) {
      this.panel = 'tutorial';
      this.game.screen = 'paused';
      this.tutorialStep = 0;
    }
    if (mode === 'journey' && !restore) this.store.save(this.game.save());
    this.lastScreen = '';
    this.render();
  }
  update(dt: number) {
    this.lastHUD += dt;
    const g = this.game;
    if (g) {
      if (this.resultDelay > 0) {
        this.resultDelay = Math.max(0, this.resultDelay - dt);
        if (this.resultDelay === 0) {
          this.resultRevealed = true;
          this.render();
        }
      }
      // 不同状态切换时只重建一次 DOM，游玩中每 100ms 更新局部文本和进度。
      if (this.lastScreen !== g.screen) {
        this.lastScreen = g.screen;
        this.render();
      }
      if (this.lastHUD > 0.1) {
        this.lastHUD = 0;
        this.hud();
      }
      this.input.enabled = g.screen === 'playing' && this.panel === 'none';
      while (g.events.length) {
        const e = g.events.shift()!;
        if (e.type === 'sound') this.audio.play(e.name || 'click');
        if (e.type === 'toast') this.toast(e.name || '');
        if (e.type === 'save' && g.mode === 'journey' && !g.finished) {
          if (!this.store.save(g.save())) this.toast('浏览器未允许本地存储，本次仍可正常游玩');
        }
        if (e.type === 'end') {
          this.resultDelay = e.name === 'victory' ? 1.8 : 0;
          this.resultRevealed = e.name !== 'victory';
          this.store.record(g.stats, g.discovered, e.name === 'victory', g.mode);
          if (e.name === 'victory' && g.mode === 'journey') this.store.clearSave();
          this.render();
        }
      }
    } else this.input.enabled = false;
  }
  pause(automatic = false) {
    const g = this.game;
    if (!g || g.finished) return;
    if (this.panel !== 'none') {
      if (!automatic && this.panel !== 'tutorial') this.closePanel();
      return;
    }
    if (g.screen === 'playing') {
      g.screen = 'paused';
      this.input.reset();
      this.render();
    } else if (g.screen === 'paused' && !automatic) {
      g.screen = 'playing';
      this.input.reset();
      this.audio.unlock();
      this.render();
    }
  }
  toast(message: string) {
    const el = document.getElementById('toast')!;
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 3800);
  }
  private clearToast() {
    window.clearTimeout(this.toastTimer);
    const element = document.getElementById('toast');
    if (element) {
      element.classList.remove('show');
      element.textContent = '';
    }
  }
  private action(action: string, value?: string) {
    this.audio.unlock();
    if (!['evolve', 'skill', 'interact'].includes(action)) this.audio.play('click');
    if (action === 'modes') {
      this.panel = 'modes';
      this.render();
    } else if (action === 'start') this.start(value as Mode);
    else if (action === 'continue') this.start('journey', true);
    else if (action === 'pause') this.pause();
    else if (action === 'close') this.closePanel();
    else if (
      action === 'settings' ||
      action === 'codex' ||
      action === 'help' ||
      action === 'records'
    )
      this.openPanel(action);
    else if (action === 'species') {
      this.codexId = value!;
      this.render();
    } else if (action === 'tutorial-next') {
      this.tutorialStep++;
      if (this.tutorialStep >= 3) {
        this.store.records.tutorial = true;
        this.store.saveRecords();
        this.panel = 'none';
        if (this.game) this.game.screen = 'playing';
      }
      this.input.reset();
      this.render();
    } else if (action === 'evolve') {
      this.game?.chooseEvolution(value!);
      this.render();
    } else if (action === 'event-growth') {
      this.game?.resolveEvent('growth');
      this.render();
    } else if (action === 'event-evolution') {
      this.game?.resolveEvent('evolution');
      this.render();
    } else if (action === 'event-ability') {
      this.game?.resolveEvent('ability', value as AbilityId);
      this.render();
    } else if (action === 'event-leave') {
      this.game?.resolveEvent('leave');
      this.render();
    } else if (action === 'menu') this.returnMenu();
    else if (action === 'retry') this.start(this.game?.mode || 'journey');
    else if (action === 'practice') {
      this.openPanel('practice');
    } else if (action === 'practice-stage') {
      this.practiceStage = Number(value);
      this.render();
    } else if (action === 'practice-skill') {
      this.practiceAbility = value as AbilityId;
      this.render();
    } else if (action === 'practice-skin') {
      this.practiceSkin = value!;
      this.render();
    } else if (action === 'practice-apply') {
      this.start('practice');
    }
  }
  private openPanel(panel: Panel) {
    if (this.game?.screen === 'playing') {
      this.resumeScreen = 'playing';
      this.game.screen = 'paused';
    } else this.resumeScreen = 'paused';
    this.panel = panel;
    this.input.reset();
    this.render();
  }
  private closePanel() {
    const panel = this.panel;
    this.panel = 'none';
    if (
      this.game &&
      this.resumeScreen === 'playing' &&
      panel !== 'tutorial' &&
      this.game.screen === 'paused'
    )
      this.game.screen = 'playing';
    this.input.reset();
    this.render();
  }
  returnMenu() {
    this.clearToast();
    const g = this.game;
    if (g) {
      if (g.mode === 'journey' && !g.finished) this.store.save(g.save());
      this.store.record(g.stats, g.discovered, false, g.mode);
    }
    this.game = null;
    this.panel = 'none';
    this.input.reset();
    this.onGame(null);
    this.render();
  }
  private setting(el: HTMLInputElement) {
    const key = el.dataset.setting;
    if (!key) return;
    const s = this.store.settings;
    if (['music', 'effects', 'joySize', 'joyOpacity'].includes(key))
      (s as unknown as Record<string, unknown>)[key] = Number(el.value);
    if (key === 'quality') s.quality = el.value as 'high' | 'low';
    if (key === 'mouseFollow' || key === 'reducedMotion') s[key] = el.checked;
    this.store.saveSettings();
    this.applySettings();
    const output = this.root.querySelector(`[data-output="${key}"]`);
    if (output) output.textContent = `${Math.round(Number(el.value) * 100)}%`;
  }
  applySettings() {
    const s = this.store.settings;
    this.audio.volumes(s.music, s.effects);
    this.input.mouseFollow = s.mouseFollow;
    this.input.joyScale = s.joySize;
    this.renderer.quality = s.quality;
    this.renderer.reduced = s.reducedMotion;
    this.renderer.resize();
    document.documentElement.style.setProperty('--joy-scale', String(s.joySize));
    document.documentElement.style.setProperty('--joy-opacity', String(s.joyOpacity));
  }
  render() {
    const g = this.game;
    document.body.classList.toggle('in-game', !!g);
    document.body.classList.toggle(
      'has-overlay',
      this.panel !== 'none' || (!!g && g.screen !== 'playing'),
    );
    if (!g) this.root.innerHTML = this.menu();
    else this.root.innerHTML = this.gameHUD() + this.gameOverlay();
    if (this.panel !== 'none') this.root.insertAdjacentHTML('beforeend', this.panelMarkup());
    this.input.bindTouch(this.root);
    this.drawPreviews();
    if (g) this.hud();
  }
  private menu() {
    const save = this.store.load();
    return `<div class="menu-scene"><div class="menu-shade"></div><div class="menu-caustic"></div><header class="menu-header"><a class="brand" href="#" aria-label="深蓝食界主页">${icon('fish')}<span>深蓝食界<small>一段海洋生长记</small></span></a><div class="header-actions"><button class="text-btn" data-action="codex">${icon('book')}<span>海洋图鉴</span></button><button class="round-btn" aria-label="设置" data-action="settings">${icon('gear')}</button></div></header><section class="menu-hero"><div class="eyebrow"><span></span>潜入蔚蓝，自在生长</div><h1>深蓝食界<span class="title-dot">。</span></h1><p class="hero-subtitle">从一尾小鱼，到一片海的传说。</p><p class="hero-copy">追逐晨光下的鱼群，穿过沉船与海藻。<br>在未知的深蓝里，找到属于你的生长之路。</p><div class="menu-buttons">${save ? `<button class="primary-btn" data-action="continue">${icon('play')}继续海域旅程<span class="btn-end">${REGIONS[save.region].name}</span></button><button class="secondary-btn" data-action="modes">开启新的旅程 ${icon('arrow')}</button>` : `<button class="primary-btn" data-action="modes">开启海域旅程 ${icon('arrow')}</button><p class="button-note">随时暂停 · 自动保存 · 自在探索</p>`}</div><div class="other-modes"><button data-action="start" data-value="endless">${icon('wave')}无尽生存</button><span></span><button data-action="practice">${icon('compass')}自由练习</button></div><button class="how-link" data-action="help">第一次潜水？看看游玩指南 <span>↗</span></button></section><div class="scene-caption"><span class="caption-line"></span><div><small>旅程的起点</small><strong>晨光珊瑚湾</strong><p>阳光所及之处，生命悄然绽放。</p></div></div><footer class="menu-footer"><span>为每一次好奇，留一片海。</span><div><button class="record-link" data-action="records">本地纪录 ↗</button><span>本地最高分 <b>${Math.round(this.store.records.bestScore).toLocaleString()}</b></span><i></i><span>已发现 <b>${this.store.records.discovered.length}</b> / ${SPECIES.length} 种生物</span></div><span class="version">离线可玩 · v1.0</span></footer></div>`;
  }
  private gameHUD() {
    const g = this.game!;
    return `<div id="hud" class="hud"><div class="vitals"><div class="player-tag"><span class="player-seal">${icon('fish')}</span><div><span id="stage-name"></span><small id="growth-label"></small></div></div><div class="meter-row"><span class="meter-heart">${icon('heart')}</span><div class="meter health"><i id="health-bar"></i></div><b id="health-label"></b></div><div class="meter-row growth-row"><span>${icon('fin')}</span><div class="meter growth"><i id="growth-bar"></i></div></div></div><div class="region-hud"><span>${modes[g.mode]} <i>·</i> <span id="game-time">00:00</span></span><strong id="region-name">${REGIONS[g.region].name}</strong></div><div class="hud-tools"><button class="round-btn" data-action="codex" aria-label="生物图鉴">${icon('book')}</button><button class="round-btn" data-action="pause" aria-label="暂停">${icon('pause')}</button></div><div class="objective-box"><span class="objective-dot"></span><p id="objective"></p></div><div class="minimap"><canvas id="minimap" width="180" height="68" aria-label="海域地图"></canvas><span>海域航线</span></div><div class="hud-bottom"><div class="legend"><span><i class="food-dot"></i>可捕食</span><span><i class="danger-dot"></i>危险</span><span><i class="poison-dot"></i>毒性 / 棘刺</span></div><div class="desktop-actions"><div class="dash-status"><kbd>Shift</kbd>${icon('wave')}<span>冲刺</span><div class="mini-meter"><i id="stamina-bar"></i></div></div><button class="ability-status" data-touch="skill"><kbd>E</kbd><span id="ability-symbol"></span><div><span id="ability-name"></span><small id="ability-cooldown"></small></div></button><div class="key-hint"><kbd>W A S D</kbd>游动</div></div><div class="depth-label"><span id="evolution-count">0 项进化</span><span id="score-label">0 分</span></div></div><div class="touch-controls"><div id="joystick" role="application" aria-label="移动摇杆"><span class="joystick-cross"></span><div class="joystick-knob"></div></div><span class="joystick-label">游动</span><div class="touch-right"><button class="touch-interact" data-touch="interact" aria-label="交互">${icon('shell')}<small>交互</small></button><button class="touch-skill" data-touch="skill" aria-label="主动技能"><span id="touch-skill-icon">${icon('wave')}</span><small id="touch-cooldown">技能</small></button><button class="touch-dash" data-touch="dash" aria-label="按住冲刺">${icon('fin')}<small>冲刺</small><span id="touch-stamina"></span></button></div></div><div id="interact-hint" class="interact-hint"></div>${g.mode === 'practice' ? '<button class="practice-toggle" data-action="practice">调整练习 ' + icon('gear') + '</button>' : ''}</div>`;
  }
  private hud() {
    const g = this.game;
    if (!g) return;
    const p = g.player;
    const set = (id: string, text: string) => {
      const e = document.getElementById(id);
      if (e && e.textContent !== text) e.textContent = text;
    };
    const width = (id: string, value: number) => {
      const e = document.getElementById(id);
      if (e) e.style.width = `${clamp(value, 0, 100)}%`;
    };
    set('stage-name', STAGES[p.stage].name);
    set('growth-label', `阶段 ${p.stage + 1} / 5 · ${Math.round(p.size * 2)} cm`);
    set('health-label', `${Math.ceil(p.health)}${p.shield > 0 ? ` +${Math.ceil(p.shield)}` : ''}`);
    width('health-bar', (p.health / p.maxHealth) * 100);
    const next = STAGES[p.stage + 1];
    width(
      'growth-bar',
      next ? ((p.xp - STAGES[p.stage].xp) / (next.xp - STAGES[p.stage].xp)) * 100 : 100,
    );
    width('stamina-bar', p.stamina);
    set('objective', g.objective());
    set('game-time', formatTime(g.stats.elapsed));
    set('region-name', REGIONS[g.region].name);
    const ability = ABILITIES.find((a) => a.id === p.ability)!;
    set('ability-name', ability.name);
    set('ability-cooldown', p.cooldown > 0 ? `${p.cooldown.toFixed(1)} 秒` : '已就绪');
    set('touch-cooldown', p.cooldown > 0 ? `${Math.ceil(p.cooldown)}s` : ability.name);
    const symbol = document.getElementById('ability-symbol');
    if (symbol && symbol.dataset.id !== p.ability) {
      symbol.innerHTML = icon(ability.symbol);
      symbol.dataset.id = p.ability;
      const touch = document.getElementById('touch-skill-icon');
      if (touch) touch.innerHTML = icon(ability.symbol);
    }
    set('evolution-count', `${g.evolutions.length} 项进化`);
    set('score-label', `${Math.round(g.stats.score).toLocaleString()} 分`);
    const interact = document.getElementById('interact-hint');
    if (interact) {
      const s = g.nearby;
      interact.textContent = s
        ? `${s.kind === 'safe' ? '记录安全检查点' : s.kind === 'beacon' ? '点亮海洋信标' : s.kind === 'treasure' ? '开启潮汐秘藏' : '进入下一片海域'} · 按 F 或点交互`
        : '';
      interact.classList.toggle('visible', !!s);
    }
    const b = document.querySelector<HTMLElement>('.touch-interact');
    b?.classList.toggle('available', !!g.nearby);
    const touchStamina = document.getElementById('touch-stamina');
    if (touchStamina) touchStamina.style.setProperty('--stamina', `${p.stamina * 3.6}deg`);
    let diagnostic = document.getElementById('game-diagnostics');
    if (!diagnostic) {
      diagnostic = document.createElement('output');
      diagnostic.id = 'game-diagnostics';
      diagnostic.hidden = true;
      diagnostic.setAttribute('aria-hidden', 'true');
      this.root.append(diagnostic);
    }
    // 隐藏的只读 DOM 快照用于浏览器测试取证，不能写入游戏，也不提供跳关接口。
    diagnostic.textContent = JSON.stringify({
      screen: g.screen,
      mode: g.mode,
      time: g.time,
      region: g.region,
      player: p,
      progress: g.progress,
      stats: g.stats,
      evolutions: g.evolutions,
      target: g.objectiveTarget(),
      nearby: g.nearby,
      spawns: g.spawnHistory,
      fish: g.world.fish
        .filter((f) => f.alive && Math.hypot(f.x - p.x, f.y - p.y) < 1000)
        .map((f) => ({
          uid: f.uid,
          species: f.species,
          x: f.x,
          y: f.y,
          size: f.size,
          angle: f.angle,
          state: f.state,
          timer: f.timer,
          vx: f.vx,
          vy: f.vy,
          hits: f.hits,
          biteUsed: f.biteUsed,
        })),
      camera: this.renderer.camera,
      viewport: { width: innerWidth, height: innerHeight },
    });
    this.minimap();
  }
  private minimap() {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement | null;
    if (!canvas || !this.game) return;
    const c = canvas.getContext('2d')!,
      g = this.game,
      r = REGIONS[g.region];
    c.clearRect(0, 0, 180, 68);
    c.fillStyle = '#0c344780';
    c.beginPath();
    c.roundRect(0, 0, 180, 68, 8);
    c.fill();
    c.strokeStyle = '#a7ded026';
    c.lineWidth = 1;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.moveTo(10, 34);
    c.lineTo(170, 34);
    c.stroke();
    c.setLineDash([]);
    for (const s of g.world.sites.filter((s) => s.region === g.region && s.kind !== 'current')) {
      c.fillStyle = s.kind === 'treasure' ? '#e2c184' : s.used ? '#698e8b' : '#a2d9ce';
      const x = 10 + ((s.x - r.x) / r.width) * 160,
        y = 9 + (s.y / 2200) * 48;
      if (s.kind === 'beacon') {
        c.fillRect(x - 2, y - 2, 4, 4);
      } else {
        c.beginPath();
        c.arc(x, y, s.kind === 'safe' ? 3 : 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = '#ffdbab';
    c.beginPath();
    c.arc(
      10 + ((g.player.x - r.x) / r.width) * 160,
      9 + (g.player.y / 2200) * 48,
      3,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  private gameOverlay() {
    const g = this.game!;
    if (this.panel !== 'none') return '';
    if (g.screen === 'victory' && !this.resultRevealed)
      return '<div class="victory-banner"><span>旅程完成</span><h2>深蓝，为你而闪耀。</h2></div>';
    if (g.screen === 'paused')
      return this.overlay(
        `<div class="pause-illustration">${icon('shell')}</div><div class="eyebrow centered">让海流慢下来</div><h2>在这里，歇一会儿。</h2><p class="muted">${REGIONS[g.region].name} · ${STAGES[g.player.stage].name} · ${formatTime(g.stats.elapsed)}</p><div class="pause-buttons"><button class="primary-btn" data-action="pause">${icon('play')}继续游动</button><div class="two-buttons"><button class="secondary-btn" data-action="settings">${icon('gear')}设置</button><button class="secondary-btn" data-action="help">${icon('compass')}游玩指南</button></div><button class="quiet-btn" data-action="menu">${g.mode === 'journey' ? '保存旅程并返回主菜单' : '结束本次游玩并返回'}</button></div>`,
        'pause-panel',
      );
    if (g.screen === 'evolution')
      return this.overlay(
        `<div class="eyebrow centered">生命，在此刻改变</div><h2>选择你的进化方向</h2><p class="muted">三选一 · 每种进化仅可获得一次 · 选择时海洋已暂停</p><div class="evolution-grid">${g.evolutionOptions
          .map((id) => {
            const e = EVOLUTIONS.find((e) => e.id === id)!;
            return `<button class="evolution-card" data-action="evolve" data-value="${id}">${evolutionArt(e.symbol, e.color)}<small>${e.category}</small><h3>${e.name}</h3><p>${e.desc}</p><span class="choose-evo">选择进化 ${icon('arrow')}</span></button>`;
          })
          .join(
            '',
          )}</div><div class="evolution-inventory">已获得：${g.evolutions.length ? g.evolutions.map((id) => EVOLUTIONS.find((e) => e.id === id)!.name).join(' · ') : '这是旅程中的第一次进化'}</div>`,
        'wide-panel evolution-panel',
      );
    if (g.screen === 'event')
      return this.overlay(
        `<div class="eyebrow centered">一次意外的发现</div><h2>${['海螺的回声', '沉船里的潮汐秘藏', '漂游贝商的交换'][g.pendingSite?.variant || 0]}</h2><p class="muted">选择一份馈赠，或换一种能力继续探索。当前能力：${ABILITIES.find((a) => a.id === g.player.ability)!.name}</p><div class="event-rewards"><button class="reward-card" data-action="event-growth">${evolutionArt('shell', '#ebcf99')}<h3>潮汐馈赠</h3><p>${g.pendingSite?.variant === 2 ? '消耗 200 分海洋印记<br>' : ''}获得 ${160 + g.region * 80} 成长<br>恢复 25 生命</p></button><button class="reward-card" data-action="event-evolution">${evolutionArt('star', '#aacfd3')}<h3>稀有进化</h3><p>额外进行一次<br>三选一进化</p></button></div><div class="ability-options">${ABILITIES.filter(
          (a) => a.id !== g.player.ability,
        )
          .map(
            (a) =>
              `<button data-action="event-ability" data-value="${a.id}">${icon(a.symbol)}<span><b>换为${a.name}</b><small>${a.desc}</small></span></button>`,
          )
          .join('')}</div><button class="quiet-btn" data-action="event-leave">稍后再来</button>`,
        'event-panel',
      );
    if (g.screen === 'victory' || g.screen === 'defeat') return this.results();
    return '';
  }
  private results() {
    const g = this.game!,
      won = g.screen === 'victory';
    return this.overlay(
      `<div class="result-symbol ${won ? 'won' : ''}">${icon(won ? 'flag' : 'shell')}</div><div class="eyebrow centered">${won ? '海流记住了你的名字' : '每段旅程，都留下成长'}</div><h2>${won ? '你已成为深蓝的传说。' : '休息一下，再次出发。'}</h2><p class="muted">${won ? '你从晨光里的小鱼，游到了深蓝裂谷的尽头。' : '这片海仍有许多风景。带着经验，重新潜入蔚蓝。'}</p><div class="result-stats"><div><b>${formatTime(g.stats.elapsed)}</b><span>本局用时</span></div><div><b>${g.stats.eaten}</b><span>捕食数量</span></div><div><b>${g.stats.explored}</b><span>探索发现</span></div><div><b>${g.evolutions.length}</b><span>进化强化</span></div></div><div class="result-growth">${STAGES[g.player.stage].name} <span>·</span> ${Math.round(g.player.size * 2)} cm <span>·</span> ${Math.round(g.stats.score).toLocaleString()} 分 <small>本地纪录</small></div><div class="result-evolutions">${g.evolutions.map((id) => EVOLUTIONS.find((e) => e.id === id)!.name).join(' · ') || '新的成长，还在下一次旅程'}</div><div class="result-buttons"><button class="primary-btn" data-action="retry">${icon('reset')}再次启程</button>${!won && g.mode === 'journey' && this.store.load() ? '<button class="secondary-btn" data-action="continue">从安全检查点继续</button>' : ''}<button class="secondary-btn" data-action="menu">返回主菜单</button></div>`,
      'result-panel',
    );
  }
  private overlay(content: string, cls = '', close = false) {
    return `<div class="overlay"><section class="panel ${cls}" role="dialog" aria-modal="true">${close ? `<button class="panel-close round-btn" data-action="close" aria-label="关闭">${icon('close')}</button>` : ''}${content}</section></div>`;
  }
  private panelMarkup() {
    if (this.panel === 'modes')
      return this.overlay(
        `<div class="eyebrow centered">海洋，总有新的可能</div><h2>今天，向哪片海出发？</h2><p class="muted">选择适合你的节奏，开始一段新的生长。</p><div class="mode-grid"><button class="mode-card journey" data-action="start" data-value="journey"><span class="mode-index">推荐 · 15–25 分钟</span><canvas data-fish="clown" width="240" height="140"></canvas><h3>海域旅程</h3><p>三片海域，一段完整的成长。<br>探索、进化，挑战深海掠食者。</p><span class="mode-start">开启旅程 ${icon('arrow')}</span></button><button class="mode-card endless" data-action="start" data-value="endless"><span class="mode-index">自由探索 · 持续挑战</span><canvas data-fish="ray" width="240" height="140"></canvas><h3>无尽生存</h3><p>跟随变化的潮汐持续生存。<br>刷新属于自己的本地纪录。</p><span class="mode-start">潜入海洋 ${icon('arrow')}</span></button><button class="mode-card practice" data-action="practice"><span class="mode-index">无生命压力 · 随时退出</span><canvas data-fish="butterfly" width="240" height="140"></canvas><h3>自由练习</h3><p>选择鱼体、成长阶段与技能。<br>熟悉每一次转身与捕食。</p><span class="mode-start">自在游动 ${icon('arrow')}</span></button></div>${this.store.load() ? '<p class="small-note">开始新的海域旅程将替换已有检查点；其他模式保留旅程进度。</p>' : ''}`,
        'wide-panel modes-panel',
        true,
      );
    if (this.panel === 'settings') return this.settings();
    if (this.panel === 'records')
      return this.overlay(
        `<div class="eyebrow centered">每一次出发，都有迹可循</div><h2>我的海洋纪录</h2><p class="muted">仅保存在本机浏览器，不包含在线排名。</p><div class="result-stats"><div><b>${Math.round(this.store.records.bestScore).toLocaleString()}</b><span>本地最高分</span></div><div><b>${formatTime(this.store.records.longest)}</b><span>无尽最长生存</span></div><div><b>${Math.round(this.store.records.maxSize * 2)}</b><span>最长体型 / cm</span></div><div><b>${this.store.records.journeys}</b><span>完成旅程</span></div></div><p class="small-note">已发现 ${this.store.records.discovered.length} / ${SPECIES.length} 种海洋生物。继续游动，留下一段新的海洋记忆。</p>`,
        'wide-panel',
        true,
      );
    if (this.panel === 'codex') return this.codex();
    if (this.panel === 'tutorial') return this.tutorial();
    if (this.panel === 'practice') return this.practice();
    return this.help();
  }
  private settings() {
    const s = this.store.settings;
    const slider = (key: string, name: string, value: number, min = 0, max = 1) =>
      `<label class="setting-row"><span>${name}</span><input aria-label="${name}" data-setting="${key}" type="range" min="${min}" max="${max}" step=".05" value="${value}"><output data-output="${key}">${Math.round(value * 100)}%</output></label>`;
    return this.overlay(
      `<div class="eyebrow centered">找到舒服的节奏</div><h2>设置</h2><div class="settings-list"><h3>海洋的声音</h3>${slider('music', '环境音乐', s.music)}${slider('effects', '操作音效', s.effects)}<h3>画面与操作</h3><label class="setting-row"><span>画面质量</span><select data-setting="quality" aria-label="画面质量"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>精致 · 完整环境效果</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>流畅 · 减少背景效果</option></select></label><label class="setting-row"><span>鼠标跟随游动<small>键盘输入时优先使用键盘</small></span><input type="checkbox" data-setting="mouseFollow" ${s.mouseFollow ? 'checked' : ''}></label><label class="setting-row"><span>减少镜头与界面动效</span><input type="checkbox" data-setting="reducedMotion" ${s.reducedMotion ? 'checked' : ''}></label><h3>触屏控制</h3>${slider('joySize', '摇杆大小', s.joySize, 0.8, 1.4)}${slider('joyOpacity', '控制透明度', s.joyOpacity, 0.25, 1)}</div><p class="small-note">设置自动保存在本机浏览器。首次点击后开启声音。</p>`,
      'settings-panel',
      true,
    );
  }
  private codex() {
    const s = BY_ID[this.codexId],
      found = new Set([...this.store.records.discovered, ...(this.game?.discovered || [])]);
    return this.overlay(
      `<div class="codex-header"><div class="eyebrow">认识每一个海洋邻居</div><h2>海洋生物图鉴</h2><p class="muted">${found.size} / ${SPECIES.length} 已发现 · 体型达到普通目标的 1.2 倍，即满足捕食资格。</p></div><div class="codex-layout"><div class="species-list">${SPECIES.map((f) => `<button class="species-item ${f.id === s.id ? 'selected' : ''}" data-action="species" data-value="${f.id}"><canvas data-fish="${f.id}" width="120" height="66"></canvas><span>${f.name}<small>${found.has(f.id) ? '已发现' : '尚未相遇 · 可预览'}</small></span></button>`).join('')}</div><article class="species-detail"><div class="specimen"><span class="specimen-orbit"></span><canvas data-fish="${s.id}" data-large="true" width="600" height="300"></canvas></div><small class="specimen-type">${s.behavior === 'boss' ? '最终掠食者' : s.behavior === 'elite' ? '区域精英' : s.behavior === 'poison' ? '毒性 / 棘刺生物' : s.behavior === 'rare' ? '稀有奖励生物' : '海洋生态'}</small><h3>${s.name}</h3><p>${s.description}</p><div class="species-facts"><span>体长 <b>${s.size * 2} cm</b></span><span>栖息海域 <b>${s.regions.map((n) => REGIONS[n].name).join('、')}</b></span></div><div class="species-warning">${icon(s.behavior === 'poison' ? 'bolt' : 'eye')}<p>${s.warning}</p></div></article></div>`,
      'wide-panel codex-panel',
      true,
    );
  }
  private tutorial() {
    const steps = [
      {
        symbol: 'fin',
        title: '先做一尾自在的小鱼',
        desc: '用 WASD / 方向键，或左侧摇杆游动。朝向随着移动自然转动；停止输入后会慢慢减速。',
        detail: 'Shift / 右侧冲刺：短时间加速，留意体力恢复。',
      },
      {
        symbol: 'fish',
        title: '朝向猎物，靠近就能吃',
        desc: '绿色圆点是可捕食的目标。把鱼嘴朝向它并靠近，即可自动吞噬。成长后，原本危险的鱼也会成为食物。',
        detail: '红色尖角代表危险；紫色棘刺标记代表毒性，吞噬也会受伤。',
      },
      {
        symbol: 'compass',
        title: '跟着海流，去更深的地方',
        desc: '跟随青色方向标寻找海洋信标。靠近后按 F / 点击交互。成长时选择进化，在秘藏里可以更换主动能力。',
        detail: 'E / 右侧技能：使用能力。精英需躲开预警，再面向暴露的头部弱点咬击。',
      },
    ];
    const step = steps[this.tutorialStep];
    return this.overlay(
      `<div class="tutorial-dots">${steps.map((_, i) => `<i class="${i === this.tutorialStep ? 'active' : ''}"></i>`).join('')}</div>${evolutionArt(step.symbol, '#f2ca92')}<div class="eyebrow centered">潜水第一课 · ${this.tutorialStep + 1} / 3</div><h2>${step.title}</h2><p class="tutorial-copy">${step.desc}</p><p class="tutorial-detail">${step.detail}</p><button class="primary-btn" data-action="tutorial-next">${this.tutorialStep === 2 ? '开始我的海域旅程' : '下一步'} ${icon('arrow')}</button>`,
      'tutorial-panel',
    );
  }
  private help() {
    return this.overlay(
      `<div class="eyebrow centered">第一次潜水，也能从容出发</div><h2>海域游玩指南</h2><div class="help-columns"><div><h3>电脑操作</h3><dl class="key-list"><dt><kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd></dt><dd>上下左右游动</dd><dt><kbd>Shift</kbd></dt><dd>按住冲刺，消耗体力</dd><dt><kbd>E</kbd></dt><dd>使用当前主动能力</dd><dt><kbd>F</kbd></dt><dd>信标、秘藏、庇护所与出口交互</dd><dt><kbd>Esc</kbd></dt><dd>暂停 / 继续</dd></dl><h3>手机与平板</h3><p>横屏游玩。左侧摇杆控制游动，右侧冲刺、技能与交互可以同时使用。竖屏和切后台会安全暂停。</p></div><div><h3>看懂海洋的提示</h3><ul class="guide-tips">${TIPS.map((t) => `<li>${t}</li>`).join('')}</ul><h3>精英与最终挑战</h3><p>先完成 HUD 中的信标与鱼群目标，并达到指定成长阶段。橙色轨迹预警冲撞，橙色圆环预警尾扫；水流出现时进入青色安全缺口。攻击结束后，对准头部弱点靠近咬击，每轮仅结算一次。</p><p class="small-note">进化选择、探索事件、图鉴与设置期间，所有游戏计时都停止。正式游玩无饥饿条。</p></div></div>`,
      'wide-panel help-panel',
      true,
    );
  }
  private practice() {
    return this.overlay(
      `<div class="eyebrow centered">在这里，找到游动的感觉</div><h2>自由练习</h2><p class="muted">全部海域开放 · 生命不耗尽 · 可练习精英与最终掠食者</p><div class="practice-layout"><h3>选择成长阶段</h3><div class="stage-options">${STAGES.map((s, i) => `<button class="${i === this.practiceStage ? 'selected' : ''}" data-action="practice-stage" data-value="${i}"><b>${i + 1}</b>${s.name}</button>`).join('')}</div><h3>选择基础鱼体</h3><div class="skin-options">${['clown', 'tang', 'butterfly', 'tuna'].map((id) => `<button class="${id === this.practiceSkin ? 'selected' : ''}" data-action="practice-skin" data-value="${id}"><canvas data-fish="${id}" width="110" height="65"></canvas>${BY_ID[id].name}</button>`).join('')}</div><h3>装备一种能力</h3><div class="practice-abilities">${ABILITIES.map((a) => `<button class="${a.id === this.practiceAbility ? 'selected' : ''}" data-action="practice-skill" data-value="${a.id}">${icon(a.symbol)}<span>${a.name}<small>${a.desc}</small></span></button>`).join('')}</div></div><button class="primary-btn" data-action="practice-apply">开始练习 ${icon('arrow')}</button>`,
      'wide-panel practice-panel',
      true,
    );
  }
  private drawPreviews() {
    this.root.querySelectorAll<HTMLCanvasElement>('canvas[data-fish]').forEach((canvas) => {
      const s = BY_ID[canvas.dataset.fish!],
        c = canvas.getContext('2d');
      if (!s || !c) return;
      const large = canvas.dataset.large === 'true';
      const size = large
        ? s.shape === 'eel'
          ? 120
          : s.shape === 'ray'
            ? 100
            : 145
        : canvas.width > 200
          ? 68
          : 29;
      drawFish(c, s, canvas.width * 0.54, canvas.height * 0.53, size, 0, 1, 60);
    });
  }
}
