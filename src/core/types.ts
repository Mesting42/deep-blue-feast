import type { AbilityId } from '../data/catalog';
import type { Vec } from './math';
export type Mode = 'journey' | 'endless' | 'practice';
export type Screen = 'menu' | 'playing' | 'paused' | 'evolution' | 'event' | 'victory' | 'defeat';
export interface InputFrame {
  x: number;
  y: number;
  dash: boolean;
  skill: boolean;
  interact: boolean;
}
export interface Body extends Vec {
  vx: number;
  vy: number;
  angle: number;
  size: number;
  /** 游泳姿态独立于行进角度；可选以兼容特殊掠食者的攻击朝向。 */
  pose?: SwimPose;
}
export interface SwimPose {
  /** 轻量鱼用于侧身宽度；主角用于身体朝向诊断，不参与整体缩放。 */
  facing: number;
  targetFacing: number;
  pitch: number;
  bend: number;
  /** 主角使用关节中线；普通鱼可继续使用轻量姿态。 */
  rig?: SwimRig;
}
export interface SwimRig {
  /** 世界方向角按头、身体、尾部依次跟随，不直接镜像鱼体。 */
  headAngle: number;
  bodyAngle: number;
  tailAngle: number;
  turn?: {
    from: number;
    to: number;
    startYaw: number;
    endYaw: number;
    progress: number;
  };
}
export interface Player extends Body {
  pose: SwimPose;
  xp: number;
  stage: number;
  health: number;
  maxHealth: number;
  stamina: number;
  ability: AbilityId;
  cooldown: number;
  invulnerable: number;
  shield: number;
  shieldTime: number;
  surge: number;
  dashMemory: number;
  dashLocked: boolean;
  escapeBoost: number;
  escapeCooldown: number;
  lastStand: boolean;
}
export interface Fish extends Body {
  /** 补充鱼群从画外游向此处，抵达后恢复常规生态行为。 */
  arrivalTarget?: Vec;
  uid: number;
  species: string;
  home: Vec;
  school: number;
  phase: number;
  alive: boolean;
  state:
    'cruise' | 'flee' | 'chase' | 'windup' | 'charge' | 'weak' | 'sweep' | 'current' | 'retreat';
  timer: number;
  stun: number;
  hits: number;
  attack: number;
  target: Vec;
  biteUsed: boolean;
  region: number;
}
export interface Rock extends Vec {
  rx: number;
  ry: number;
  region: number;
  kind: 'rock' | 'pillar' | 'wreck';
}
export interface Site extends Vec {
  id: string;
  region: number;
  kind: 'safe' | 'beacon' | 'treasure' | 'gate' | 'current';
  used: boolean;
  variant: number;
}
export interface Particle extends Vec {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'bubble' | 'spark' | 'ring' | 'text';
  text?: string;
}
export interface Cloud extends Vec {
  radius: number;
  life: number;
}
export interface RegionProgress {
  eaten: number;
  marks: number;
  elite: boolean;
  beacon: boolean;
  treasure: boolean;
  escapes: number;
}
export interface Stats {
  eaten: number;
  explored: number;
  damage: number;
  skillUses: number;
  score: number;
  elapsed: number;
  maxSize: number;
}
export interface GameEvent {
  type: 'sound' | 'toast' | 'evolution' | 'event' | 'region' | 'end' | 'save';
  name?: string;
  value?: string;
  site?: Site;
}
export interface SaveData {
  version: 1;
  mode: 'journey';
  seed: number;
  region: number;
  player: Pick<Player, 'xp' | 'stage' | 'ability' | 'maxHealth'>;
  evolutions: string[];
  progress: RegionProgress[];
  stats: Stats;
  unlocked: string[];
  time: number;
  usedSites: string[];
  evolutionQueue: number;
}
