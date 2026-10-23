import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/platform/input';
/** 最小 DOM 输入夹具只检验 pointerId 与事件路由；真实布局在浏览器中验证。 */
class ElementFixture extends EventTarget {
  style = { transform: '' };
  classList = { add: () => {}, remove: () => {} };
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 126, height: 126 };
  }
  setPointerCapture(_id: number) {}
  matches() {
    return false;
  }
}
function pointer(type: string, pointerId: number, x = 63, y = 63) {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
  });
}
test('摇杆与冲刺、技能使用不同 pointerId，可同时输入；取消指针后安全释放', () => {
  const win = new EventTarget();
  Object.assign(globalThis, { window: win, document: { querySelector: () => null } });
  const zone = new ElementFixture(),
    knob = new ElementFixture(),
    dash = new ElementFixture(),
    skill = new ElementFixture(),
    interact = new ElementFixture();
  const root = {
    querySelectorAll: () => [new ElementFixture(), skill],
    querySelector: (s: string) =>
      s === '#joystick'
        ? zone
        : s === '.joystick-knob'
          ? knob
          : s.includes('dash')
            ? dash
            : s.includes('skill')
              ? skill
              : interact,
  };
  const input = new Input();
  input.enabled = true;
  input.bindTouch(root as unknown as HTMLElement);
  zone.dispatchEvent(pointer('pointerdown', 1, 100, 63));
  dash.dispatchEvent(pointer('pointerdown', 2));
  skill.dispatchEvent(pointer('pointerdown', 3));
  let frame = input.frame({ x: 0, y: 0 });
  assert(frame.x > 0.8);
  assert.equal(frame.y, 0);
  assert(frame.dash);
  assert(frame.skill);
  assert(!input.frame({ x: 0, y: 0 }).skill);
  win.dispatchEvent(pointer('pointercancel', 2));
  frame = input.frame({ x: 0, y: 0 });
  assert(!frame.dash);
  assert(frame.x > 0.8);
  win.dispatchEvent(pointer('pointercancel', 1));
  frame = input.frame({ x: 0, y: 0 });
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0);
  zone.dispatchEvent(pointer('pointerdown', 4, 63, 20));
  input.reset();
  assert.deepEqual(input.frame({ x: 0, y: 0 }), {
    x: 0,
    y: 0,
    dash: false,
    skill: false,
    interact: false,
  });
});
test('键盘优先于鼠标，E/F 使用单次边沿，不会在按住时无限释放技能', () => {
  const win = new EventTarget();
  Object.assign(globalThis, { window: win, document: { querySelector: () => null } });
  const input = new Input();
  input.enabled = true;
  input.mouseFollow = true;
  input.pointer = { x: 300, y: 0, active: true };
  const key = (type: string, value: string) =>
    win.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { key: value, repeat: false }),
    );
  key('keydown', 'a');
  key('keydown', 'e');
  key('keydown', 'f');
  const first = input.frame({ x: 0, y: 0 });
  assert.equal(first.x, -1);
  assert(first.skill && first.interact);
  const second = input.frame({ x: 0, y: 0 });
  assert(!second.skill && !second.interact);
  key('keyup', 'a');
  assert.equal(input.frame({ x: 0, y: 0 }).x, 1);
  win.dispatchEvent(new Event('blur'));
  assert.equal(input.frame({ x: 0, y: 0 }).x, 0);
});
