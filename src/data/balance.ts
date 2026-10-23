/** 集中管理一局节奏与成长边界，调整数值时无需改 UI 或鱼群 AI。 */
export const BALANCE = {
  foodGrowthScale: 0.18,
  edibleRatio: 1.2,
  maxPlayerSize: 148,
  hurtProtectionSeconds: 1.45,
  safeHealingPerSecond: 15,
  foodHealing: 0.35,
  maxParticles: 360,
  targetLocalFood: 42,
  spawnInterval: 7,
  checkpointInterval: 30,
  endlessEventInterval: 90,
  maxEndlessRegularFish: 320,
} as const;
