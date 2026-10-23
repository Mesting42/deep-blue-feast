import { ABILITIES, BY_ID, EVOLUTIONS, REGIONS, STAGES } from '../data/catalog';
import type { AbilityId } from '../data/catalog';
import { Random, clamp, distance, lerp, unit } from './math';
import type {
  Cloud,
  Fish,
  GameEvent,
  InputFrame,
  Mode,
  Particle,
  Player,
  RegionProgress,
  SaveData,
  Screen,
  Site,
  Stats,
} from './types';
import {
  collide,
  findOpen,
  generateWorld,
  lineOfSight,
  makeFish,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../world/generation';
import { mouth, mouthContact, relation } from '../systems/predation';
import { movePlayer } from '../systems/movement';
import { createSwimPose } from '../systems/swimming';
import { createSwimRig } from '../systems/fish-rig';
import { findSideEntry, type SpawnView } from '../systems/spawning';
import { updateEcology } from '../systems/ecology';
import {
  championMinimumStage,
  championRequiredHits,
  minimumGrowth,
  updateChampion,
} from '../systems/combat';
import { BALANCE } from '../data/balance';
import { growthForXP, foodGrowth } from '../systems/growth';
import { receiveDamage } from '../systems/health';
import { activateAbility } from '../systems/abilities';
import {
  describeObjective,
  nextObjectiveTarget,
  explorationComplete,
  missionPlan,
} from '../systems/missions';
const emptyProgress = (): RegionProgress => ({
  eaten: 0,
  marks: 0,
  elite: false,
  beacon: false,
  treasure: false,
  escapes: 0,
});
/**
 * 纯游戏状态：不依赖 DOM、音频或存储。所有外部反馈经事件队列输出。
 * update 仅在 playing 下执行，因此暂停可统一冻结 AI、技能、环境和计时。
 */
export class Game {
  screen: Screen = 'playing';
  region = 0;
  time = 0;
  player: Player;
  world: ReturnType<typeof generateWorld>;
  practiceSkin = 'clown';
  progress = [emptyProgress(), emptyProgress(), emptyProgress()];
  stats: Stats = {
    eaten: 0,
    explored: 0,
    damage: 0,
    skillUses: 0,
    score: 0,
    elapsed: 0,
    maxSize: STAGES[0].size,
  };
  evolutions: string[] = [];
  evolutionOptions: string[] = [];
  evolutionQueue = 0;
  discovered = new Set<string>();
  clouds: Cloud[] = [];
  particles: Particle[] = [];
  events: GameEvent[] = [];
  rng: Random;
  nearby: Site | null = null;
  pendingSite: Site | null = null;
  finished = false;
  lastSpecies = '';
  chain = 0;
  chainTime = 0;
  wasChased = false;
  nextSpawn = 4;
  nextSave: number = BALANCE.checkpointInterval;
  nextEndless: number = BALANCE.endlessEventInterval;
  wave = 0;
  healSound = 0;
  skillPulse = 0;
  message = '';
  /** 显示层仅提交观察范围，刷新规则仍由纯逻辑系统决定。 */
  spawnView: SpawnView | null = null;
  /** 最近画外入场记录只用于只读测试取证，有界队列不进入存档。 */
  spawnHistory: {
    uid: number;
    x: number;
    y: number;
    size: number;
    time: number;
    left: number;
    right: number;
  }[] = [];
  constructor(
    public mode: Mode = 'journey',
    public seed = Date.now() & 0x7fffffff,
    practiceStage = 0,
    practiceAbility: AbilityId = 'surge',
  ) {
    this.rng = new Random(seed + 981);
    this.world = generateWorld(seed);
    this.player = {
      x: 360,
      y: 1100,
      vx: 0,
      vy: 0,
      angle: 0,
      pose: { ...createSwimPose(), rig: createSwimRig() },
      size: STAGES[0].size,
      xp: 0,
      stage: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      ability: mode === 'practice' ? practiceAbility : 'surge',
      cooldown: 0,
      invulnerable: 3,
      shield: 0,
      shieldTime: 0,
      surge: 0,
      dashMemory: 0,
      dashLocked: false,
      escapeBoost: 0,
      escapeCooldown: 0,
      lastStand: false,
    };
    if (mode === 'practice') {
      this.player.xp = STAGES[practiceStage].xp;
      this.updateGrowth(false);
    }
    this.discovered.add('sprat');
    this.discovered.add('clown');
  }
  has = (id: string) => this.evolutions.includes(id);
  emit(type: GameEvent['type'], name?: string, value?: string) {
    this.events.push({ type, name, value });
  }
  tell = (message: string) => {
    this.message = message;
    this.emit('toast', message);
  };
  sound = (name: string) => this.emit('sound', name);
  update(dt: number, input: InputFrame) {
    if (this.screen !== 'playing' || this.finished) return;
    dt = Math.min(0.04, Math.max(0, dt));
    this.time += dt;
    this.stats.elapsed += dt;
    const p = this.player,
      prevMouth = mouth(p);
    for (const key of [
      'invulnerable',
      'shieldTime',
      'surge',
      'escapeBoost',
      'escapeCooldown',
      'cooldown',
    ] as const)
      p[key] = Math.max(0, p[key] - dt);
    if (p.shieldTime <= 0) p.shield = 0;
    // 逻辑体型与可见体型一起缓慢接近成长目标，吃一口不会瞬间膨胀。
    const targetSize = growthForXP(p.xp).size;
    p.size =
      Math.abs(targetSize - p.size) < 0.005
        ? targetSize
        : lerp(p.size, targetSize, 1 - Math.exp(-dt * 2.4));
    this.skillPulse = Math.max(0, this.skillPulse - dt);
    this.chainTime = Math.max(0, this.chainTime - dt);
    this.healSound -= dt;
    if (input.skill) this.useAbility();
    movePlayer(p, input, dt, this.has);
    p.x = clamp(
      p.x,
      95,
      this.mode === 'practice'
        ? WORLD_WIDTH - 110
        : REGIONS[this.region].x + REGIONS[this.region].width - 90,
    );
    p.y = clamp(p.y, 240, WORLD_HEIGHT - 150);
    collide(p, this.world.rocks);
    const currentRegion = REGIONS.findIndex((r) => p.x >= r.x && p.x < r.x + r.width);
    if (this.mode === 'practice' && currentRegion >= 0) this.region = currentRegion;
    // 跨海域推进只由出口交互触发，返回旧海域不会重复结算解锁奖励。
    // 画外入场者必须持续游动，大体型宽镜头下出生点可能超过常规 AI 裁剪距离。
    const activeFish = this.world.fish.filter(
      (f) => f.alive && (Math.abs(f.x - p.x) < 1800 || !!f.arrivalTarget),
    );
    updateEcology(activeFish, dt, {
      player: p,
      rocks: this.world.rocks,
      clouds: this.clouds,
      time: this.time,
      has: this.has,
      minX: 0,
      maxX: WORLD_WIDTH,
    });
    let chased = false;
    for (const f of activeFish) {
      if (!f.alive) continue;
      const species = BY_ID[f.species],
        d = distance(p, f),
        special = ['elite', 'boss'].includes(species.behavior);
      if (d < 650) this.discovered.add(f.species);
      if (special) {
        const enabled =
          this.mode !== 'journey' ||
          (explorationComplete(this, f.region) && p.stage >= championMinimumStage(f.region));
        updateChampion(f, dt, {
          player: p,
          rocks: this.world.rocks,
          enabled,
          weakBonus: this.has('weak') ? 1.4 : 0,
          sound: this.sound,
          tell: this.tell,
          damage: (n, source) => this.damage(n, source),
        });
        if (
          enabled &&
          f.state === 'weak' &&
          !f.biteUsed &&
          mouthContact(
            p,
            prevMouth,
            {
              ...f,
              x: f.x + Math.cos(f.angle) * f.size * 0.72,
              y: f.y + Math.sin(f.angle) * f.size * 0.72,
              size: f.size * 0.26,
            },
            this.has('reach') ? 1.28 : 1,
          )
        ) {
          this.biteChampion(f);
        }
        if (enabled && d < 900 && f.state !== 'cruise') chased = true;
      } else {
        if (f.state === 'chase') chased = true;
        const rel = relation(p.size, f);
        if (
          (rel === 'food' || rel === 'poison') &&
          mouthContact(p, prevMouth, f, this.has('reach') ? 1.28 : 1) &&
          lineOfSight(p, f, this.world.rocks)
        )
          this.eat(f);
        else if (
          rel === 'danger' &&
          d < p.size * 0.38 + f.size * 0.6 &&
          lineOfSight(p, f, this.world.rocks)
        )
          this.damage(species.behavior === 'poison' ? 10 : 19, `${species.name}碰撞`);
      }
    }
    if (this.finished) return;
    if (this.wasChased && !chased) {
      this.progress[this.region].escapes++;
      if (this.has('escape') && p.escapeCooldown === 0) {
        p.escapeBoost = 3;
        p.escapeCooldown = 8;
        this.tell('顺流而行 · 成功脱离追击');
      }
    }
    this.wasChased = chased;
    this.nearby = null;
    for (const site of this.world.sites) {
      const d = distance(p, site);
      if (
        site.kind === 'safe' &&
        d < 155 &&
        !activeFish.some((f) => ['chase', 'charge'].includes(f.state) && distance(f, p) < 400)
      ) {
        const before = p.health;
        p.health = Math.min(p.maxHealth, p.health + BALANCE.safeHealingPerSecond * dt);
        p.stamina = Math.min(100, p.stamina + 20 * dt);
        if (p.health > before && this.healSound < 0) {
          this.healSound = 2;
          this.burst(p.x, p.y, '#b0efc5', 5);
        }
      }
      if (site.kind === 'current' && d < 150 && Math.sin(this.time * 0.8 + site.variant) > 0.55) {
        p.vx += Math.cos(site.variant) * 90 * dt;
        p.vy -= 130 * dt;
        if (this.region === 2) this.damage(7, '热泉喷流');
      }
      if (
        site.kind !== 'current' &&
        (!site.used || site.kind === 'safe' || site.kind === 'gate') &&
        d < 130 + p.size * 0.5 &&
        (!this.nearby || d < distance(p, this.nearby))
      )
        this.nearby = site;
    }
    if (input.interact) this.interact();
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.repopulate();
      this.nextSpawn = BALANCE.spawnInterval;
    }
    this.nextSave -= dt;
    if (this.nextSave <= 0) {
      this.emit('save');
      this.nextSave = BALANCE.checkpointInterval;
    }
    if (this.mode === 'endless' && this.time > this.nextEndless) {
      this.wave++;
      this.nextEndless += BALANCE.endlessEventInterval;
      this.endlessEvent();
    }
    for (const cloud of this.clouds) cloud.life -= dt;
    this.clouds = this.clouds.filter((c) => c.life > 0);
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= Math.exp(-dt * 1.4);
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    if (this.time % 1 < dt && Math.hypot(p.vx, p.vy) > 100) this.bubble();
    this.stats.maxSize = Math.max(this.stats.maxSize, p.size);
    if (this.evolutionQueue > 0 && this.screen === 'playing') this.openEvolution();
  }
  private eat(f: Fish) {
    if (!f.alive) return;
    f.alive = false;
    const s = BY_ID[f.species],
      p = this.player;
    if (this.lastSpecies === s.id && this.chainTime > 0) this.chain++;
    else this.chain = 0;
    this.lastSpecies = s.id;
    this.chainTime = 4;
    const value = foodGrowth(s.food, p.dashMemory, this.chain, this.has);
    // 高阶段继续成长转化为分数，体型最高 148，避免无尽模式无限膨胀。
    p.xp += value;
    this.stats.score += Math.round(value * 10);
    this.stats.eaten++;
    this.progress[f.region].eaten++;
    p.health = Math.min(
      p.maxHealth,
      p.health + BALANCE.foodHealing + (this.has('precision') && p.dashMemory > 0 ? 2 : 0),
    );
    if (this.has('stamina')) p.stamina = Math.min(100, p.stamina + 7);
    if (s.behavior === 'rare') {
      p.health = Math.min(p.maxHealth, p.health + 14);
      p.cooldown = Math.max(0, p.cooldown - 3);
      this.sound('treasure');
    }
    if (s.behavior === 'poison') this.damage(this.has('antidote') ? 2 : 8, '毒性目标');
    if (this.has('rare') && ['rare', 'poison'].includes(s.behavior))
      p.cooldown = Math.max(0, p.cooldown - 3);
    this.burst(f.x, f.y, s.color, 9);
    this.floatText(f.x, f.y, `+${Math.round(value)}`, '#e5f5cf');
    this.sound('eat');
    this.updateGrowth();
  }
  private updateGrowth(feedback = true) {
    const p = this.player,
      old = p.stage;
    const growth = growthForXP(p.xp);
    p.stage = growth.stage;
    // 练习选阶段、读取检查点时直接就绪；捕食过程由 update 的体型过渡接管。
    if (!feedback) p.size = growth.size;
    if (p.stage > old && feedback) {
      this.evolutionQueue += p.stage - old;
      this.sound('grow');
      this.tell(`成长 · ${STAGES[p.stage].name}`);
      this.burst(p.x, p.y, '#ffdda0', 25);
      p.health = Math.min(p.maxHealth, p.health + 16);
      if (this.has('molt')) {
        p.shield = Math.max(p.shield, 30);
        p.shieldTime = 10;
      }
    }
  }
  damage(amount: number, source: string) {
    const p = this.player;
    if (
      this.finished ||
      this.screen !== 'playing' ||
      p.invulnerable > 0 ||
      this.mode === 'practice'
    )
      return;
    const hit = receiveDamage(p, amount);
    if (hit.blocked) return;
    const { absorbed, lost } = hit;
    amount = lost;
    this.stats.damage += lost;
    this.sound('hurt');
    this.burst(p.x, p.y, '#f2b5a4', 12);
    this.floatText(
      p.x,
      p.y - 45,
      absorbed > 0 ? `护盾 −${Math.round(absorbed)}` : `−${Math.round(amount)}`,
      '#ffb5a0',
    );
    if (this.has('recoil'))
      for (const f of this.world.fish)
        if (f.alive && distance(f, p) < 240) {
          const n = unit(f.x - p.x, f.y - p.y);
          f.x += n.x * 65;
          f.y += n.y * 65;
          collide(f, this.world.rocks);
        }
    if (this.has('laststand') && !p.lastStand && p.health < 25 && p.health > 0) {
      p.lastStand = true;
      p.shield = Math.max(p.shield, 35);
      p.shieldTime = 5;
      this.tell('深蓝庇护 · 本海域的紧急护盾已触发');
    }
    if (p.health <= 0) this.finish(false, source);
  }
  useAbility() {
    const p = this.player;
    if (this.screen !== 'playing' || !activateAbility(p, this.world.fish, this.clouds, this.has))
      return;
    this.stats.skillUses++;
    this.sound(p.ability);
    this.skillPulse = 1;
    if (p.ability === 'pulse') this.burst(p.x, p.y, '#ddcbff', 25);
  }
  interact() {
    const site = this.nearby;
    if (!site || this.screen !== 'playing') return;
    const p = this.player,
      progress = this.progress[site.region];
    if (site.kind === 'safe') {
      this.emit('save');
      this.tell('珊瑚庇护所 · 已记录安全检查点，停留可恢复生命');
      this.sound('save');
      return;
    }
    if (site.used && site.kind !== 'gate') return;
    if (site.kind === 'beacon') {
      site.used = true;
      progress.marks++;
      progress.beacon = explorationComplete(this, site.region);
      this.stats.explored++;
      p.xp += 45 + site.region * 20;
      this.sound('beacon');
      this.burst(site.x, site.y, '#a0f0e1', 25);
      this.tell(
        `海洋信标 ${progress.marks}/${missionPlan(this.seed, site.region).marks} · 海域记忆已点亮`,
      );
      this.updateGrowth();
      this.emit('save');
      if (progress.marks === 1 && site.region === 0) this.evolutionQueue++;
    } else if (site.kind === 'treasure') {
      this.pendingSite = site;
      this.screen = 'event';
      this.events.push({ type: 'event', site });
    } else if (site.kind === 'gate') {
      if (this.mode === 'practice') {
        this.region = Math.min(2, site.region + 1);
        p.x = REGIONS[this.region].x + 330;
        p.y = 1100;
        p.vx = p.vy = 0;
        this.tell('自由练习 · 海域已开放');
        return;
      }
      if (this.mode === 'journey' && !this.gateReady(site.region)) {
        this.tell(this.objective());
        return;
      }
      if (site.region === 2) {
        this.tell('深渊冠鲸正在遗迹前等待。完成最终挑战即可结束旅程。');
        return;
      }
      site.used = true;
      this.region = Math.max(this.region, site.region + 1);
      p.x = REGIONS[this.region].x + 330;
      p.y = 1100;
      p.vx = 0;
      p.vy = 0;
      p.invulnerable = 5;
      p.lastStand = false;
      p.health = Math.min(p.maxHealth, p.health + 35);
      this.evolutionQueue++;
      this.emit('region');
      this.sound('region');
      this.emit('save');
      this.tell(`抵达 · ${REGIONS[this.region].name}`);
    }
  }
  resolveEvent(choice: 'growth' | 'ability' | 'evolution' | 'leave', ability?: AbilityId) {
    if (this.screen !== 'event' || !this.pendingSite) return;
    const site = this.pendingSite;
    if (choice !== 'leave') {
      if (site.used) return;
      if (site.variant === 2 && choice === 'growth' && this.stats.score < 200) {
        this.tell('漂游贝商需要 200 分海洋印记。可以选择另一份馈赠，或稍后再来。');
        return;
      }
      site.used = true;
      this.progress[site.region].treasure = true;
      this.stats.explored++;
      this.stats.score += 400;
      if (choice === 'growth') {
        if (site.variant === 2) this.stats.score -= 200;
        this.player.xp += 160 + site.region * 80;
        this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
        this.updateGrowth();
        this.tell('潮汐馈赠 · 成长与生命已恢复');
      }
      if (choice === 'ability' && ability) {
        this.player.ability = ability;
        this.player.cooldown = 0;
        this.tell(`已装备${ABILITIES.find((a) => a.id === ability)!.name} · 按 E 或点击技能使用`);
      }
      if (choice === 'evolution') this.evolutionQueue++;
      this.sound('treasure');
      this.emit('save');
    }
    this.pendingSite = null;
    this.screen = 'playing';
  }
  openEvolution() {
    const available = EVOLUTIONS.filter((e) => !this.has(e.id));
    if (!available.length) {
      this.evolutionQueue = 0;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 20);
      return;
    }
    this.evolutionOptions = this.rng
      .shuffle(available)
      .slice(0, 3)
      .map((e) => e.id);
    this.screen = 'evolution';
    this.emit('evolution');
  }
  chooseEvolution(id: string) {
    if (this.screen !== 'evolution' || !this.evolutionOptions.includes(id) || this.has(id)) return;
    this.evolutions.push(id);
    this.evolutionQueue = Math.max(0, this.evolutionQueue - 1);
    this.evolutionOptions = [];
    if (id === 'vital') {
      this.player.maxHealth += 25;
      this.player.health += 25;
    }
    this.screen = 'playing';
    this.sound('evolve');
    this.tell(`进化获得 · ${EVOLUTIONS.find((e) => e.id === id)!.name}`);
    this.emit('save');
  }
  private biteChampion(f: Fish) {
    if (f.biteUsed || !f.alive) return;
    f.biteUsed = true;
    f.hits++;
    const boss = f.species === 'leviathan',
      required = championRequiredHits(f);
    this.burst(
      f.x + Math.cos(f.angle) * f.size * 0.7,
      f.y + Math.sin(f.angle) * f.size * 0.7,
      '#ffe1a1',
      30,
    );
    this.sound('weak');
    this.floatText(f.x, f.y - 70, `破绽 ${f.hits}/${required}`, '#ffdc9d');
    this.stats.score += 250;
    if (f.hits >= required) {
      f.alive = false;
      this.progress[f.region].elite = true;
      this.player.xp += BY_ID[f.species].food * 0.5;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
      this.updateGrowth();
      if (boss && this.mode === 'journey') this.finish(true);
      else {
        this.tell(`${BY_ID[f.species].name}已驱离 · 海域航道恢复平静`);
        this.sound('victory');
        this.emit('save');
      }
    } else {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 5);
      if (boss && f.hits === 3) this.tell('深渊冠鲸进入第二阶段 · 预警时间缩短，留意水流安全缺口');
    }
  }
  gateReady(region = this.region) {
    return (
      this.mode !== 'journey' ||
      (explorationComplete(this, region) &&
        this.progress[region].elite &&
        this.player.xp >= minimumGrowth(region))
    );
  }
  objective() {
    if (this.screen === 'victory') return '旅程已完成 · 深蓝为你而闪耀';
    return describeObjective(this);
  }
  objectiveTarget(): { x: number; y: number; label: string } | null {
    if (this.finished) return null;
    return nextObjectiveTarget(this, this.world.sites, this.world.fish);
  }
  private repopulate() {
    this.world.fish = this.world.fish.filter((f) => f.alive);
    const p = this.player,
      r = REGIONS[this.region],
      local = this.world.fish.filter(
        (f) =>
          f.region === this.region &&
          distance(f, p) < 1600 &&
          f.size * 1.2 < p.size &&
          !['poison', 'elite', 'boss'].includes(BY_ID[f.species].behavior),
      );
    if (local.length >= BALANCE.targetLocalFood) return;
    const available = Object.values(BY_ID).filter(
      (s) =>
        s.regions.includes(this.region) &&
        s.size * 1.2 < p.size &&
        s.behavior !== 'poison' &&
        !['elite', 'boss'].includes(s.behavior),
    );
    const species = this.rng.pick(available.length ? available : [BY_ID.sprat]);
    for (let j = 0; j < 7; j++) {
      this.spawnEnteringFish(species.id, species.size, Math.floor(this.time));
    }
  }
  private spawnEnteringFish(species: string, size: number, school: number) {
    const p = this.player;
    // 无渲染器时也按正常镜头宽度与最大前瞻保守避开可见区域。
    const half = (1550 + p.size * 5.3) / 2 + 320;
    const view = this.spawnView ?? { left: p.x - half, right: p.x + half };
    const entry = findSideEntry(view, REGIONS[this.region], p.y, size, this.world.rocks, this.rng);
    if (!entry) return;
    // 猎食者迁徙的巡游终点避开出生庇护所，保留初始小鱼的恢复空间。
    if (['hunt', 'ambush'].includes(BY_ID[species].behavior)) {
      entry.target.x = Math.max(REGIONS[this.region].x + 1600, entry.target.x);
    }
    const uid = Math.max(0, ...this.world.fish.map((f) => f.uid)) + 1;
    const f = makeFish(uid, species, entry.x, entry.y, this.region, school, this.rng);
    f.size = size;
    f.angle = entry.direction > 0 ? 0 : Math.PI;
    f.pose = createSwimPose(entry.direction);
    f.vx = entry.direction * BY_ID[species].speed * 0.85;
    f.home = { ...entry.target };
    f.arrivalTarget = entry.target;
    this.world.fish.push(f);
    this.spawnHistory.push({ uid, x: f.x, y: f.y, size, time: this.time, ...view });
    if (this.spawnHistory.length > 28) this.spawnHistory.shift();
  }
  private endlessEvent() {
    const p = this.player;
    this.tell(`潮汐 ${this.wave + 1} · ${this.wave % 2 ? '猎食者迁徙' : '金辉鱼群抵达'}`);
    this.sound('region');
    const type = this.wave % 2 ? 'shark' : 'lantern';
    for (let j = 0; j < Math.min(6, 2 + this.wave); j++) {
      this.spawnEnteringFish(type, Math.min(172, BY_ID[type].size + this.wave * 5), 80);
    }
    // 无尽海域限制活跃对象数量，保证长时间运行的时间与内存开销有上界。
    const regular = this.world.fish.filter(
      (f) => !['elite', 'boss'].includes(BY_ID[f.species].behavior),
    );
    if (regular.length > BALANCE.maxEndlessRegularFish)
      for (const f of regular
        .sort((a, b) => distance(b, p) - distance(a, p))
        .slice(0, regular.length - BALANCE.maxEndlessRegularFish))
        f.alive = false;
  }
  finish(won: boolean, source = '') {
    if (this.finished) return;
    this.finished = true;
    this.screen = won ? 'victory' : 'defeat';
    this.player.vx = 0;
    this.player.vy = 0;
    this.clouds = [];
    this.wasChased = false;
    this.sound(won ? 'victory' : 'defeat');
    if (won) {
      this.stats.score += 5000;
      this.burst(this.player.x, this.player.y, '#ffe4a5', 70);
    }
    this.emit('end', won ? 'victory' : 'defeat', source);
  }
  burst(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * Math.PI * 2,
        s = this.rng.range(25, 140),
        life = this.rng.range(0.4, 1.2);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        maxLife: life,
        color,
        size: this.rng.range(2, 5),
        type: 'spark',
      });
    }
    if (this.particles.length > BALANCE.maxParticles)
      this.particles.splice(0, this.particles.length - BALANCE.maxParticles);
  }
  floatText(x: number, y: number, text: string, color: string) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -30,
      life: 1,
      maxLife: 1,
      color,
      size: 15,
      type: 'text',
      text,
    });
  }
  bubble() {
    const p = this.player;
    this.particles.push({
      x: p.x - Math.cos(p.angle) * p.size,
      y: p.y - Math.sin(p.angle) * p.size,
      vx: -p.vx * 0.1,
      vy: -30,
      life: 1,
      maxLife: 1,
      color: '#b9e6e3',
      size: 2 + this.rng.next() * 3,
      type: 'bubble',
    });
  }
  save(): SaveData {
    return {
      version: 1,
      mode: 'journey',
      seed: this.seed,
      region: this.region,
      player: {
        xp: this.player.xp,
        stage: this.player.stage,
        ability: this.player.ability,
        maxHealth: this.player.maxHealth,
      },
      evolutions: [...this.evolutions],
      progress: structuredClone(this.progress),
      stats: { ...this.stats },
      unlocked: [...this.discovered],
      time: this.time,
      usedSites: this.world.sites.filter((s) => s.used).map((s) => s.id),
      evolutionQueue: this.evolutionQueue,
    };
  }
  static restore(save: SaveData) {
    const g = new Game('journey', save.seed);
    g.region = save.region;
    g.time = save.time;
    g.evolutions = [...save.evolutions];
    g.progress = structuredClone(save.progress);
    g.stats = { ...save.stats };
    g.discovered = new Set(save.unlocked);
    g.evolutionQueue = save.evolutionQueue;
    Object.assign(g.player, save.player);
    g.updateGrowth(false);
    // 从本海域固定庇护所恢复，不存追击、攻击、无敌帧或临时奖励状态。
    Object.assign(g.player, {
      x: REGIONS[g.region].x + 330,
      y: 1100,
      health: g.player.maxHealth,
      invulnerable: 5,
      vx: 0,
      vy: 0,
      cooldown: 0,
      shield: 0,
      shieldTime: 0,
    });
    for (const site of g.world.sites) {
      site.used = save.usedSites.includes(site.id);
    }
    for (const f of g.world.fish)
      if (['elite', 'boss'].includes(BY_ID[f.species].behavior) && g.progress[f.region].elite)
        f.alive = false;
    g.tell('已从安全庇护所继续 · 生命恢复，短暂保护已生效');
    return g;
  }
}
