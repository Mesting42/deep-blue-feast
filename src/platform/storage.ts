import { ABILITIES, EVOLUTIONS, SPECIES } from '../data/catalog';
import type { SaveData, Stats } from '../core/types';
const PREFIX = 'deep-blue-feast:v1:';
export interface Settings {
  music: number;
  effects: number;
  quality: 'high' | 'low';
  mouseFollow: boolean;
  joySize: number;
  joyOpacity: number;
  reducedMotion: boolean;
}
export interface Records {
  bestScore: number;
  longest: number;
  maxSize: number;
  journeys: number;
  discovered: string[];
  tutorial: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  music: 0.3,
  effects: 0.6,
  quality: 'high',
  mouseFollow: false,
  joySize: 1,
  joyOpacity: 0.8,
  reducedMotion: false,
};
const DEFAULT_RECORDS: Records = {
  bestScore: 0,
  longest: 0,
  maxSize: 20,
  journeys: 0,
  discovered: [],
  tutorial: false,
};
function read(key: string): unknown {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
const num = (n: unknown, lo = 0, hi = 1e9): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
/** 存档只接收已知结构，未知版本、缺字段与 NaN 全部安全回退，避免恢复时白屏。 */
export function validateSave(v: unknown): v is SaveData {
  if (
    !object(v) ||
    v.version !== 1 ||
    v.mode !== 'journey' ||
    !num(v.seed, 0, 0x7fffffff) ||
    !num(v.region, 0, 2) ||
    !Number.isInteger(v.region) ||
    !num(v.time)
  )
    return false;
  if (!object(v.player)) return false;
  const player = v.player;
  if (
    !num(player.xp) ||
    !num(player.stage, 0, 4) ||
    !ABILITIES.some((a) => a.id === player.ability) ||
    !num(player.maxHealth, 100, 125)
  )
    return false;
  if (
    !Array.isArray(v.evolutions) ||
    v.evolutions.length > EVOLUTIONS.length ||
    new Set(v.evolutions).size !== v.evolutions.length ||
    !v.evolutions.every((id) => EVOLUTIONS.some((e) => e.id === id))
  )
    return false;
  if (
    !Array.isArray(v.progress) ||
    v.progress.length !== 3 ||
    !v.progress.every(
      (p) =>
        object(p) &&
        num(p.eaten) &&
        num(p.marks, 0, 3) &&
        Number.isInteger(p.marks) &&
        typeof p.elite === 'boolean' &&
        typeof p.beacon === 'boolean' &&
        typeof p.treasure === 'boolean' &&
        num(p.escapes),
    )
  )
    return false;
  if (
    !object(v.stats) ||
    !['eaten', 'explored', 'damage', 'skillUses', 'score', 'elapsed', 'maxSize'].every((k) =>
      num((v.stats as Record<string, unknown>)[k]),
    )
  )
    return false;
  return (
    Array.isArray(v.unlocked) &&
    v.unlocked.every((id) => SPECIES.some((s) => s.id === id)) &&
    Array.isArray(v.usedSites) &&
    v.usedSites.every(
      (id) => typeof id === 'string' && /^(mark|treasure|gate)-\d(-\d)?$/.test(id),
    ) &&
    num(v.evolutionQueue, 0, 30)
  );
}
export class Storage {
  settings: Settings = { ...DEFAULT_SETTINGS };
  records: Records = { ...DEFAULT_RECORDS };
  available = true;
  constructor() {
    const s = read('settings');
    if (object(s)) {
      for (const k of ['music', 'effects', 'joyOpacity'] as const)
        if (num(s[k], 0, 1)) this.settings[k] = s[k] as number;
      if (num(s.joySize, 0.8, 1.4)) this.settings.joySize = s.joySize;
      for (const k of ['mouseFollow', 'reducedMotion'] as const)
        if (typeof s[k] === 'boolean') this.settings[k] = s[k] as boolean;
      if (s.quality === 'high' || s.quality === 'low') this.settings.quality = s.quality;
    }
    const r = read('records');
    if (object(r)) {
      for (const k of ['bestScore', 'longest', 'maxSize', 'journeys'] as const)
        if (num(r[k])) this.records[k] = r[k] as number;
      if (typeof r.tutorial === 'boolean') this.records.tutorial = r.tutorial;
      if (Array.isArray(r.discovered))
        this.records.discovered = r.discovered.filter(
          (id): id is string => typeof id === 'string' && SPECIES.some((s) => s.id === id),
        );
    }
  }
  load() {
    const v = read('journey');
    return validateSave(v) ? v : null;
  }
  save(v: SaveData) {
    this.available = write('journey', v);
    return this.available;
  }
  clearSave() {
    try {
      localStorage.removeItem(PREFIX + 'journey');
    } catch {}
  }
  saveSettings() {
    this.available = write('settings', this.settings);
  }
  saveRecords() {
    this.available = write('records', this.records);
  }
  record(stats: Stats, discovered: Iterable<string>, won: boolean, mode: string) {
    this.records.bestScore = Math.max(this.records.bestScore, stats.score);
    if (mode === 'endless') this.records.longest = Math.max(this.records.longest, stats.elapsed);
    this.records.maxSize = Math.max(this.records.maxSize, stats.maxSize);
    if (won && mode === 'journey') this.records.journeys++;
    this.records.discovered = [...new Set([...this.records.discovered, ...discovered])];
    this.saveRecords();
  }
}
