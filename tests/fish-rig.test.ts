import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game';
import { angleDelta, Random } from '../src/core/math';
import { movePlayer } from '../src/systems/movement';
import { fishSpine, MAX_HEAD_PITCH } from '../src/systems/fish-rig';
import { mouth, mouthContact } from '../src/systems/predation';
import { makeFish } from '../src/world/generation';
const idle = { x: 0, y: 0, dash: false, skill: false, interact: false };
const step = (p: Game['player'], x: number, y: number, frames: number, dash = false) => {
  for (let i = 0; i < frames; i++) movePlayer(p, { ...idle, x, y, dash }, 1 / 60, () => false);
};

test('上下游由鱼头、身体、尾部依次响应，松开后沿关节链回到水平', () => {
  const p = new Game().player;
  step(p, 0, -1, 5);
  const rig = p.pose.rig!;
  assert(rig.headAngle < rig.bodyAngle && rig.bodyAngle < rig.tailAngle);
  assert(Math.abs(rig.headAngle) > 0.35 && Math.abs(rig.tailAngle) < 0.15);
  step(p, 0, -1, 120);
  assert(Math.abs(rig.headAngle + MAX_HEAD_PITCH) < 0.001);
  assert(Math.abs(rig.tailAngle - rig.headAngle) < 0.001);
  step(p, 0, 0, 120);
  assert(Math.abs(rig.headAngle) < 0.001 && Math.abs(rig.tailAngle) < 0.001);
});

test('左右换向形成有界小弧线和 C 形关节差，鱼体中线不整体压成零宽', () => {
  const p = new Game().player;
  step(p, 1, 0, 60);
  const y = p.y;
  let bend = 0,
    minLength = 10;
  for (let i = 0; i < 45; i++) {
    step(p, -1, 0, 1);
    const rig = p.pose.rig!;
    bend = Math.max(bend, Math.abs(angleDelta(rig.tailAngle, rig.headAngle)));
    let length = 0,
      previous = fishSpine(rig, -1);
    for (let j = 1; j <= 40; j++) {
      const point = fishSpine(rig, -1 + j / 20);
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    minLength = Math.min(minLength, length);
  }
  assert(p.vx < -180);
  assert(y - p.y > 8 && y - p.y < 70);
  assert(bend > 0.8);
  assert(minLength > 1.1);
  assert.equal(p.pose.targetFacing, -1);
});

test('快速反复换向可以中途退回当前弧线，最后一次方向在短时间内生效', () => {
  const p = new Game().player;
  step(p, 1, 0, 30);
  for (let round = 0; round < 8; round++) {
    const old = p.pose.rig!.headAngle;
    step(p, round % 2 ? 1 : -1, 0, 5, true);
    assert(Math.abs(angleDelta(old, p.pose.rig!.headAngle)) < 1.5);
    assert(Number.isFinite(p.x + p.y + p.pose.bend));
  }
  step(p, -1, 0, 90);
  assert(!p.pose.rig!.turn);
  assert(Math.abs(angleDelta(p.pose.rig!.headAngle, Math.PI)) < 0.01);
  assert(p.vx < -180);
});

test('小弧线、斜向与冲刺过程的嘴尖始终来自绘制中线，后方目标不误吞', () => {
  const p = new Game('practice', 73, 2).player;
  step(p, 1, 0, 30);
  for (let i = 0; i < 50; i++) {
    step(p, -1, -0.4, 1, true);
    const rig = p.pose.rig!,
      tip = fishSpine(rig, 1),
      m = mouth(p);
    assert(Math.abs(m.x - (p.x + tip.x * p.size)) < 1e-9);
    assert(Math.abs(m.y - (p.y + tip.y * p.size)) < 1e-9);
    const dx = Math.cos(rig.headAngle),
      dy = Math.sin(rig.headAngle);
    const prey = makeFish(1, 'sprat', m.x + dx * 3, m.y + dy * 3, 0, 0, new Random(1));
    assert(mouthContact(p, m, prey));
    prey.x = m.x - dx * p.size * 0.9;
    prey.y = m.y - dy * p.size * 0.9;
    assert(!mouthContact(p, m, prey));
  }
});

test('掉头途中松开按键后停止推进，不强制完成一段旧移动', () => {
  const p = new Game().player;
  step(p, 1, 0, 30);
  step(p, -1, 0, 8);
  step(p, 0, 0, 60);
  const previous = { x: p.x, y: p.y };
  step(p, 0, 0, 30);
  assert(Math.hypot(p.x - previous.x, p.y - previous.y) < 0.03);
  assert(!p.pose.rig!.turn);
});
