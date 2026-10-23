/**
 * 渲染帧率不决定游戏速度。小于一逻辑帧的余量必须保留到下一帧；
 * 仅暂停/重新开始时清空。每帧最多补算 80ms，避免后台回来瞬间推进。
 */
export class FixedStepClock {
  readonly stepSeconds = 1 / 60;
  private accumulator = 0;
  reset() {
    this.accumulator = 0;
  }
  advance(elapsed: number, active: boolean, step: (first: boolean) => void) {
    if (!active) {
      this.reset();
      return;
    }
    this.accumulator += Math.min(0.08, Math.max(0, elapsed));
    let first = true;
    while (this.accumulator + 1e-10 >= this.stepSeconds) {
      step(first);
      first = false;
      this.accumulator -= this.stepSeconds;
    }
  }
}
