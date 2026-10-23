import type { InputFrame } from '../core/types';
/**
 * 键盘、鼠标跟随和触屏最终输出同一输入帧。pointerId 分别记录摇杆和冲刺，
 * 第二根手指不会抢走移动指针；失焦、暂停与 pointercancel 均清空按住状态。
 */
export class Input {
  keys = new Set<string>();
  joystick = { x: 0, y: 0 };
  pointer = { x: 0, y: 0, active: false };
  private joyId: number | null = null;
  private dashId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private skillEdge = false;
  private interactEdge = false;
  private dashStarted = false;
  mouseFollow = false;
  joyScale = 1;
  enabled = false;
  onPause = () => {};
  onDash = () => {};
  constructor() {
    window.addEventListener('keydown', (e) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Shift', 'Escape'].includes(
          e.key,
        ) &&
        this.enabled
      )
        e.preventDefault();
      if ((e.target as HTMLElement)?.matches?.('input,select,textarea')) return;
      if (e.key === 'Escape' && !e.repeat) {
        this.onPause();
        return;
      }
      if (!this.enabled) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'e' && !e.repeat) this.skillEdge = true;
      if (e.key.toLowerCase() === 'f' && !e.repeat) this.interactEdge = true;
      if (e.key === 'Shift' && !e.repeat) this.onDash();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
        this.pointer.active = true;
      }
    });
    window.addEventListener('pointerup', (e) => this.release(e.pointerId));
    window.addEventListener('pointercancel', (e) => this.release(e.pointerId));
  }
  bindTouch(root: HTMLElement) {
    const zone = root.querySelector<HTMLElement>('#joystick'),
      knob = root.querySelector<HTMLElement>('.joystick-knob');
    if (zone && knob) {
      zone.addEventListener('pointerdown', (e) => {
        if (!this.enabled || this.joyId !== null) return;
        e.preventDefault();
        this.joyId = e.pointerId;
        const rect = zone.getBoundingClientRect();
        this.joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        zone.setPointerCapture(e.pointerId);
        this.moveJoy(e, knob);
        zone.classList.add('active');
      });
      zone.addEventListener('pointermove', (e) => {
        if (e.pointerId === this.joyId) {
          e.preventDefault();
          this.moveJoy(e, knob);
        }
      });
      const end = (e: PointerEvent) => {
        if (e.pointerId === this.joyId) {
          knob.style.transform = 'translate(0,0)';
          zone.classList.remove('active');
          this.release(e.pointerId);
        }
      };
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
      zone.addEventListener('lostpointercapture', end);
    }
    root.querySelector<HTMLElement>('[data-touch="dash"]')?.addEventListener('pointerdown', (e) => {
      if (this.enabled) {
        e.preventDefault();
        this.dashId = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        this.onDash();
      }
    });
    // 桌面 HUD 与触屏各有一个技能入口；隐藏节点也在 DOM 中，必须逐个绑定。
    root.querySelectorAll<HTMLElement>('[data-touch="skill"]').forEach((button) =>
      button.addEventListener('pointerdown', (e) => {
        if (this.enabled) {
          e.preventDefault();
          this.skillEdge = true;
        }
      }),
    );
    root
      .querySelector<HTMLElement>('[data-touch="interact"]')
      ?.addEventListener('pointerdown', (e) => {
        if (this.enabled) {
          e.preventDefault();
          this.interactEdge = true;
        }
      });
  }
  private moveJoy(e: PointerEvent, knob: HTMLElement) {
    const max = 43 * this.joyScale,
      dx = e.clientX - this.joyOrigin.x,
      dy = e.clientY - this.joyOrigin.y,
      l = Math.hypot(dx, dy),
      k = l > max ? max / l : 1;
    this.joystick = { x: (dx * k) / max, y: (dy * k) / max };
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  }
  private release(id: number) {
    if (this.joyId === id) {
      this.joyId = null;
      this.joystick = { x: 0, y: 0 };
    }
    if (this.dashId === id) this.dashId = null;
  }
  frame(playerScreen: { x: number; y: number }): InputFrame {
    let x =
      Number(this.keys.has('d') || this.keys.has('arrowright')) -
      Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let y =
      Number(this.keys.has('s') || this.keys.has('arrowdown')) -
      Number(this.keys.has('w') || this.keys.has('arrowup'));
    if (this.joyId !== null) {
      x = this.joystick.x;
      y = this.joystick.y;
    } else if (this.mouseFollow && this.pointer.active && x === 0 && y === 0) {
      const dx = this.pointer.x - playerScreen.x,
        dy = this.pointer.y - playerScreen.y,
        n = Math.hypot(dx, dy);
      if (n > 25) {
        x = dx / n;
        y = dy / n;
      }
    }
    const f = {
      x,
      y,
      dash: this.keys.has('shift') || this.dashId !== null,
      skill: this.skillEdge,
      interact: this.interactEdge,
    };
    this.skillEdge = false;
    this.interactEdge = false;
    return f;
  }
  reset() {
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
    this.joyId = null;
    this.dashId = null;
    this.skillEdge = false;
    this.interactEdge = false;
    this.pointer.active = false;
    const knob = document.querySelector<HTMLElement>('.joystick-knob');
    if (knob) knob.style.transform = 'translate(0,0)';
  }
}
