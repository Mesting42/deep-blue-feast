import { BY_ID, REGIONS, STAGES } from '../data/catalog';
import type { Game } from '../core/game';
import { angleDelta, clamp, distance, lerp } from '../core/math';
import type { Fish, Rock, Site } from '../core/types';
import { championRequiredHits } from '../systems/combat';
import { relation } from '../systems/predation';
import { drawFish } from './fish';
const TAU = Math.PI * 2;
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** 相机按视口短边与成长调整，宽高比极端时保证最少的前方观察距离。 */
export class Renderer {
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;
  camera = { x: 700, y: 1100, zoom: 1 };
  game: Game | null = null;
  quality: 'high' | 'low' = 'high';
  reduced = false;
  menuTime = 0;
  lastRegion = 0;
  regionBlend = 0;
  private backdrops: HTMLImageElement[] = [];
  private backdropMix = [1, 0, 0];
  private celebration = 0;
  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (const name of ['coral', 'kelp', 'rift']) {
      const im = new Image();
      im.src = `/${name}.webp`;
      this.backdrops.push(im);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }
  setGame(game: Game | null) {
    this.celebration = 0;
    this.game = game;
    if (game) {
      this.camera.x = game.player.x + 180;
      this.camera.y = game.player.y;
      this.camera.zoom = 1;
    }
  }
  render(dt: number) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.game) {
      this.menuTime += dt;
      this.menuWater();
      return;
    }
    const g = this.game,
      p = g.player,
      aspect = this.w / this.h;
    if (g.screen === 'victory') this.celebration += dt;
    const targetZoom = this.w / (1550 + p.size * 5.3);
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    this.camera.zoom = lerp(this.camera.zoom, targetZoom, k);
    const lead = 150 + Math.min(160, Math.abs(p.vx) * 0.38);
    this.camera.x = lerp(this.camera.x, p.x + Math.cos(p.angle) * lead, k);
    this.camera.y = lerp(this.camera.y, p.y + Math.sin(p.angle) * 65, k);
    const halfH = this.h / (this.camera.zoom * 2);
    this.camera.y = clamp(this.camera.y, halfH + 120, 2200 - halfH + 130);
    for (let i = 0; i < 3; i++)
      this.backdropMix[i] = lerp(
        this.backdropMix[i],
        i === g.region ? 1 : 0,
        1 - Math.exp(-dt * 0.9),
      );
    this.background(g);
    c.save();
    c.translate(this.w / 2, this.h / 2);
    c.scale(this.camera.zoom, this.camera.zoom);
    c.translate(-this.camera.x, -this.camera.y);
    const left = this.camera.x - this.w / this.camera.zoom / 2 - 250,
      right = this.camera.x + this.w / this.camera.zoom / 2 + 250;
    this.scenery(g, left, right);
    for (const cloud of g.clouds) {
      c.save();
      c.globalAlpha = Math.min(0.65, cloud.life * 0.25);
      const gr = c.createRadialGradient(cloud.x, cloud.y, 20, cloud.x, cloud.y, cloud.radius);
      gr.addColorStop(0, '#342448');
      gr.addColorStop(0.8, '#443858');
      gr.addColorStop(1, '#44385800');
      c.fillStyle = gr;
      c.beginPath();
      c.arc(cloud.x, cloud.y, cloud.radius, 0, TAU);
      c.fill();
      c.setLineDash([10, 12]);
      c.strokeStyle = '#b2a6d1';
      c.stroke();
      c.restore();
    }
    for (const site of g.world.sites) if (site.x > left && site.x < right) this.site(site, g);
    for (const f of g.world.fish)
      if (f.alive && f.x > left && f.x < right && Math.abs(f.y - this.camera.y) < halfH + 250)
        this.fish(f, g);
    c.save();
    if (p.invulnerable > 0 && g.time % 0.18 < 0.075) c.globalAlpha = 0.68;
    drawFish(
      c,
      g.mode === 'practice'
        ? { ...BY_ID[g.practiceSkin], player: true, stage: p.stage }
        : {
            shape: 'butterfly',
            color: '#f4b371',
            accent: '#fce2b4',
            player: true,
            stage: p.stage,
            maturity: clamp((p.size - STAGES[0].size) / (STAGES[4].size - STAGES[0].size), 0, 1),
          },
      p.x,
      p.y,
      p.size,
      p.angle,
      g.time,
      Math.hypot(p.vx, p.vy),
      1,
      p.pose,
    );
    c.restore();
    c.save();
    c.fillStyle = '#ffe1a6';
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(p.x, p.y - p.size * 0.75 - 13);
    c.lineTo(p.x - 5, p.y - p.size * 0.75 - 20);
    c.lineTo(p.x + 5, p.y - p.size * 0.75 - 20);
    c.closePath();
    c.fill();
    c.restore();
    if (p.shield > 0) {
      c.save();
      c.strokeStyle = '#b8f4d5';
      c.lineWidth = 3;
      c.globalAlpha = 0.65;
      c.beginPath();
      c.ellipse(p.x, p.y, p.size * 1.32, p.size * 0.95, 0, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (g.skillPulse > 0 && p.ability === 'pulse') {
      c.save();
      c.strokeStyle = '#d9caf4';
      c.globalAlpha = g.skillPulse;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(p.x, p.y, (1 - g.skillPulse) * 260, 0, TAU);
      c.stroke();
      c.restore();
    }
    for (const q of g.particles) {
      c.save();
      c.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
      if (q.type === 'text') {
        c.font = `600 ${q.size}px "Microsoft YaHei",sans-serif`;
        c.textAlign = 'center';
        c.fillStyle = q.color;
        c.fillText(q.text || '', q.x, q.y);
      } else {
        c.beginPath();
        c.arc(q.x, q.y, q.size, 0, TAU);
        if (q.type === 'bubble') {
          c.strokeStyle = q.color;
          c.lineWidth = 1;
          c.stroke();
        } else {
          c.fillStyle = q.color;
          c.fill();
        }
      }
      c.restore();
    }
    if (g.screen === 'victory') {
      c.save();
      for (let i = 0; i < 54; i++) {
        const a = hash(i + 20) * TAU,
          speed = 70 + hash(i + 80) * 120;
        const travel = this.celebration * speed;
        c.globalAlpha = Math.max(0, 1 - this.celebration / 3);
        c.fillStyle = i % 2 ? '#f6d89f' : '#bbe9da';
        c.beginPath();
        c.arc(
          p.x + Math.cos(a) * travel,
          p.y + Math.sin(a) * travel - this.celebration * 30,
          3 + hash(i) * 3,
          0,
          TAU,
        );
        c.fill();
      }
      c.restore();
    }
    this.foreground(g, left, right);
    c.restore();
    this.direction(g);
    this.vignette();
  }
  private background(g: Game) {
    const c = this.ctx,
      zone = REGIONS[Math.min(2, Math.max(0, Math.floor(g.player.x / 4200)))];
    const gradient = c.createLinearGradient(0, 0, 0, this.h);
    gradient.addColorStop(0, zone.top);
    gradient.addColorStop(0.5, zone.mid);
    gradient.addColorStop(1, zone.bottom);
    c.fillStyle = gradient;
    c.fillRect(0, 0, this.w, this.h);
    // 原创环境插画仅是远景，不含鱼类、任务或实体障碍。平移与淡入负责海域过渡。
    for (let i = 0; i < 3; i++) {
      const im = this.backdrops[i],
        mix = this.backdropMix[i];
      if (!im.complete || !im.naturalWidth || mix < 0.01) continue;
      const scale = Math.max(this.w / im.naturalWidth, this.h / im.naturalHeight) * 1.13;
      const dw = im.naturalWidth * scale,
        dh = im.naturalHeight * scale;
      const dx = (this.w - dw) / 2 - Math.sin(this.camera.x * 0.00032) * this.w * 0.027;
      const dy = (this.h - dh) / 2 - (this.camera.y - 1100) * 0.045;
      c.save();
      c.globalAlpha = mix * 0.85;
      c.drawImage(im, dx, dy, dw, dh);
      c.fillStyle = '#073b5026';
      c.fillRect(0, 0, this.w, this.h);
      c.restore();
    }
    // 远景岩壁采用独立视差，三个海域分别形成珊瑚礁、海藻林与遗迹的轮廓。
    const r = g.region;
    for (let layer = 0; layer < 3; layer++) {
      c.save();
      c.globalAlpha = 0.015 + layer * 0.012;
      c.fillStyle = layer % 2 ? '#a3e5cf' : '#022f4c';
      const scroll = this.camera.x * (0.06 + layer * 0.09),
        step = 250 + layer * 80,
        offset = scroll % step;
      c.beginPath();
      c.moveTo(-step, this.h);
      for (let i = -1; i < this.w / step + 2; i++) {
        const x = i * step - offset,
          y = this.h * (0.48 + hash(i + Math.floor(scroll / step) + layer * 16) * 0.42);
        c.bezierCurveTo(x - step * 0.4, y + 90, x - step * 0.18, y - 80, x, y);
        c.bezierCurveTo(
          x + step * 0.2,
          y + 70,
          x + step * 0.3,
          this.h * 0.9,
          x + step * 0.6,
          this.h,
        );
      }
      c.lineTo(this.w + step, this.h);
      c.closePath();
      c.fill();
      c.restore();
    }
    if (this.quality === 'high') {
      c.save();
      c.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const x = (i * 0.23 + 0.07) * this.w + Math.sin(g.time * 0.1 + i) * 20;
        const gr = c.createLinearGradient(x, 0, x + 160, this.h);
        gr.addColorStop(0, '#d1ffe10a');
        gr.addColorStop(1, '#a1eee000');
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(x - 30, -30);
        c.lineTo(x + 45, -30);
        c.lineTo(x + 250, this.h);
        c.lineTo(x + 80, this.h);
        c.fill();
      }
      c.restore();
    }
    if (r === 1)
      for (let i = 0; i < 16; i++)
        this.kelp(
          c,
          (i * 137 - this.camera.x * 0.2) % (this.w + 200),
          this.h + 50,
          180 + hash(i) * 280,
          g.time + i,
          '#123d48',
          0.25,
        );
    if (r === 2) {
      c.save();
      c.globalAlpha = 0.18;
      c.strokeStyle = '#91d1d9';
      c.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const x =
          (((i * 310 - this.camera.x * 0.12) % (this.w + 400)) + this.w + 400) % (this.w + 400);
        c.strokeRect(x, this.h * 0.48, 72, this.h * 0.65);
        c.beginPath();
        c.moveTo(x - 8, this.h * 0.48);
        c.lineTo(x + 80, this.h * 0.48);
        c.stroke();
      }
      c.restore();
    }
    // 远处鱼仅为低对比剪影，不参与捕食，不绘制食物标记。
    c.save();
    c.globalAlpha = 0.1;
    for (let i = 0; i < 14; i++) {
      const x =
        (((i * 163 + g.time * (i % 2 ? 8 : -6) - this.camera.x * 0.1) % (this.w + 150)) +
          this.w +
          150) %
        (this.w + 150);
      drawFish(
        c,
        { shape: i % 4 ? 'minnow' : 'ray', color: '#00263b', accent: '#123f51' },
        x,
        this.h * (0.2 + hash(i) * 0.65),
        i % 4 ? 12 : 38,
        i % 2 ? 0 : Math.PI,
        g.time + i,
        30,
      );
    }
    c.restore();
    for (let i = 0; i < (this.quality === 'high' ? 65 : 22); i++) {
      const x =
          (((hash(i) * this.w - this.camera.x * 0.15 + Math.sin(i + g.time * 0.12) * 15) % this.w) +
            this.w) %
          this.w,
        y =
          (((hash(i + 90) * this.h - g.time * (2 + hash(i + 2) * 5) - this.camera.y * 0.12) %
            this.h) +
            this.h) %
          this.h;
      c.fillStyle = `rgba(194,242,231,${0.08 + hash(i + 20) * 0.15})`;
      c.beginPath();
      c.arc(x, y, hash(i + 3) * 1.5 + 0.4, 0, TAU);
      c.fill();
    }
  }
  private scenery(g: Game, left: number, right: number) {
    const c = this.ctx;
    // 沙地采用不规则坡面，远处珊瑚层对比低于实体岩石，避免遮挡危险。
    const sand = c.createLinearGradient(0, 1740, 0, 2200);
    sand.addColorStop(0, REGIONS[g.region].sand + '45');
    sand.addColorStop(1, REGIONS[g.region].sand);
    c.beginPath();
    c.moveTo(left, 2200);
    for (let x = left; x <= right + 80; x += 70)
      c.lineTo(x, 1930 + Math.sin(x * 0.003) * 55 + Math.sin(x * 0.011) * 12);
    c.lineTo(right + 80, 2300);
    c.closePath();
    c.fillStyle = sand;
    c.fill();
    const a = Math.floor(left / 180),
      b = Math.ceil(right / 180);
    for (let i = a; i < b; i++) {
      const x = i * 180 + hash(i) * 90,
        y = 1690 + hash(i + 30) * 250,
        region = clamp(Math.floor(x / 4200), 0, 2);
      if (region === 0) {
        this.coral(
          c,
          x,
          y,
          55 + hash(i + 3) * 70,
          g.time + i,
          i % 3 === 0 ? '#da9c9b' : '#68aba5',
          0.43,
        );
        if (i % 2 === 0) this.fan(c, x + 70, y + 20, 80, '#c8b7d6', 0.25);
      } else if (region === 1) {
        this.kelp(c, x, y, 180 + hash(i + 7) * 220, g.time + i, '#5b9e86', 0.65);
        this.kelp(c, x + 55, y + 90, 100 + hash(i + 1) * 190, g.time + i + 1, '#77ae8e', 0.55);
      } else {
        this.coral(c, x, y, 60 + hash(i + 3) * 70, g.time + i, '#77bebf', 0.5);
        if (i % 3 === 0) {
          c.fillStyle = '#81e4d7';
          c.globalAlpha = 0.55;
          c.beginPath();
          c.arc(x, y - 110, 6, 0, TAU);
          c.fill();
          c.globalAlpha = 1;
        }
      }
    }
    for (const rock of g.world.rocks)
      if (rock.x + rock.rx > left && rock.x - rock.rx < right) this.rock(rock, g.time);
  }
  private rock(o: Rock, time: number) {
    const c = this.ctx;
    c.save();
    c.translate(o.x, o.y);
    if (o.kind === 'wreck') {
      c.rotate(-0.08);
      c.fillStyle = '#4e615c';
      c.beginPath();
      c.moveTo(-o.rx, -o.ry * 0.5);
      c.lineTo(o.rx, -o.ry * 0.4);
      c.lineTo(o.rx * 0.7, o.ry);
      c.lineTo(-o.rx * 0.6, o.ry * 0.7);
      c.closePath();
      c.fill();
      c.strokeStyle = '#9b9d79';
      c.lineWidth = 6;
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const x = -o.rx + (i * o.rx) / 4;
        c.beginPath();
        c.moveTo(x, -o.ry * 0.4);
        c.lineTo(x + 25, o.ry * 0.65);
        c.strokeStyle = '#293f3f';
        c.lineWidth = 3;
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-40, -o.ry * 0.5);
      c.lineTo(-40, -300);
      c.lineTo(-5, -290);
      c.strokeStyle = '#798b70';
      c.lineWidth = 11;
      c.stroke();
      c.beginPath();
      c.moveTo(-35, -260);
      c.lineTo(145, -120);
      c.lineTo(-35, -125);
      c.fillStyle = '#a6b19340';
      c.fill();
      c.restore();
      return;
    }
    const gr = c.createLinearGradient(-o.rx, -o.ry, o.rx, o.ry);
    gr.addColorStop(0, o.region === 2 ? '#647d91' : '#83a39c');
    gr.addColorStop(0.35, o.region === 2 ? '#35516a' : '#506f72');
    gr.addColorStop(1, '#173d50');
    c.beginPath();
    for (let i = 0; i < 13; i++) {
      const a = (i / 12) * TAU,
        n = 0.9 + hash(i + o.x) * 0.1,
        x = Math.cos(a) * o.rx * n,
        y = Math.sin(a) * o.ry * n;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = gr;
    c.fill();
    c.strokeStyle = '#b9d5c340';
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.moveTo(-o.rx * 0.55, -o.ry * 0.22);
    c.lineTo(-o.rx * 0.12, -o.ry * 0.5);
    c.lineTo(o.rx * 0.32, -o.ry * 0.2);
    c.strokeStyle = '#b6d2be23';
    c.lineWidth = 4;
    c.stroke();
    if (o.kind === 'pillar') {
      c.strokeStyle = '#9cd6ce66';
      c.lineWidth = 4;
      c.strokeRect(-o.rx * 0.35, -o.ry * 0.5, o.rx * 0.7, o.ry);
      c.beginPath();
      c.moveTo(-o.rx * 0.25, 0);
      c.lineTo(o.rx * 0.25, 0);
      c.moveTo(0, -o.ry * 0.35);
      c.lineTo(0, o.ry * 0.35);
      c.stroke();
    } else if (o.region === 0) {
      this.coral(c, -o.rx * 0.3, -o.ry * 0.7, 50 + hash(o.x) * 55, time, '#e7a29c', 0.9);
      this.kelp(c, o.rx * 0.5, -o.ry * 0.45, 70, time, '#74aa91', 0.9);
    } else if (o.region === 1) this.kelp(c, 0, -o.ry * 0.75, 180, time, '#7caf86', 1);
    else {
      c.fillStyle = '#90e5db';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(Math.cos(i) * o.rx * 0.65, Math.sin(i) * o.ry * 0.6, 3, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }
  private kelp(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    time: number,
    color: string,
    alpha: number,
  ) {
    c.save();
    c.translate(x, y);
    c.globalAlpha *= alpha;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = 4;
    const sway = Math.sin(time * 0.65 + x * 0.01) * 18;
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(-10, -height * 0.4, sway, -height * 0.7, sway * 0.8, -height);
    c.stroke();
    for (let j = 1; j < 7; j++) {
      const ly = (-height * j) / 7,
        lx = (sway * j) / 7;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(lx, ly + 12);
        c.quadraticCurveTo(lx + s * 42, ly - 9, lx + s * 24, ly - 35);
        c.quadraticCurveTo(lx + s * 3, ly - 24, lx, ly + 12);
        c.fill();
      }
    }
    c.restore();
  }
  private coral(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    height: number,
    time: number,
    color: string,
    alpha: number,
  ) {
    c.save();
    c.translate(x, y);
    c.globalAlpha *= alpha;
    c.strokeStyle = color;
    c.lineCap = 'round';
    const branch = (sx: number, sy: number, h: number, a: number, depth: number) => {
      const ex = sx + Math.sin(a) * h,
        ey = sy - Math.cos(a) * h;
      c.lineWidth = depth * 2.2 + 1;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(
        sx + (ex - sx) * 0.3 + Math.sin(time * 0.4) * 1.8,
        sy + (ey - sy) * 0.55,
        ex,
        ey,
      );
      c.stroke();
      if (depth > 0) {
        branch(ex, ey, h * 0.63, a - 0.52, depth - 1);
        branch(ex, ey, h * 0.62, a + 0.56, depth - 1);
      }
    };
    branch(0, 0, height * 0.5, 0, 3);
    c.restore();
  }
  private fan(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    color: string,
    alpha: number,
  ) {
    c.save();
    c.globalAlpha *= alpha;
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    for (let i = 0; i < 15; i++) {
      const a = (i / 14 - 0.5) * 2;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(
        x + Math.sin(a) * h * 0.35,
        y - h * 0.3,
        x + Math.sin(a) * h,
        y - Math.cos(a) * h,
      );
      c.stroke();
    }
    c.restore();
  }
  private site(s: Site, g: Game) {
    const c = this.ctx;
    c.save();
    c.translate(s.x, s.y);
    const t = g.time;
    if (s.kind === 'beacon') {
      c.fillStyle = '#355f6b';
      c.beginPath();
      c.moveTo(-27, 55);
      c.lineTo(-18, -20);
      c.lineTo(0, -40);
      c.lineTo(18, -20);
      c.lineTo(27, 55);
      c.closePath();
      c.fill();
      c.strokeStyle = s.used ? '#8aded2' : '#d9efce';
      c.lineWidth = 3;
      c.stroke();
      c.fillStyle = s.used ? '#7fe8d4' : '#f6dc9b';
      c.beginPath();
      c.moveTo(0, -30);
      c.lineTo(9, -12);
      c.lineTo(0, 4);
      c.lineTo(-9, -12);
      c.closePath();
      c.fill();
      if (!s.used) {
        c.strokeStyle = '#9ee9db';
        c.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2);
        c.beginPath();
        c.arc(0, -8, 46 + Math.sin(t * 2) * 5, 0, TAU);
        c.stroke();
        c.globalAlpha = 1;
        this.worldLabel('海洋信标', 0, -70, '#d3f3e3');
      }
    } else if (s.kind === 'safe') {
      this.coral(c, -40, 65, 95, t, '#a7dcc2', 1);
      this.coral(c, 45, 60, 80, t + 2, '#e7bca4', 1);
      c.save();
      c.globalAlpha = 0.12;
      const gr = c.createRadialGradient(0, 0, 15, 0, 0, 150);
      gr.addColorStop(0, '#c5f7bb');
      gr.addColorStop(1, '#c5f7bb00');
      c.fillStyle = gr;
      c.fillRect(-150, -150, 300, 300);
      c.restore();
      c.strokeStyle = '#b1e4bd';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 75, -Math.PI * 0.85, -Math.PI * 0.15);
      c.stroke();
      this.worldLabel('珊瑚庇护所', 0, -105, '#cce8cd');
    } else if (s.kind === 'treasure') {
      if (s.used) {
        c.globalAlpha = 0.4;
      }
      c.fillStyle = '#a28458';
      c.strokeStyle = '#e1c28a';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(-30, -10, 60, 42, 5);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(0, -10, 30, 17, 0, Math.PI, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#f8df9c';
      c.fillRect(-4, 0, 8, 13);
      if (!s.used) {
        for (let i = 0; i < 3; i++) {
          const a = t + i * 2;
          c.beginPath();
          c.arc(Math.cos(a) * 35, -32 + Math.sin(a * 1.2) * 12, 2, 0, TAU);
          c.fill();
        }
        this.worldLabel(s.region === 1 ? '沉船秘藏' : '潮汐秘藏', 0, -65, '#f6dea1');
      }
    } else if (s.kind === 'gate') {
      if (s.region === 2) {
        c.restore();
        return;
      }
      c.save();
      c.globalAlpha = 0.25;
      c.strokeStyle = '#b7eee3';
      c.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const y = -190 + i * 60;
        c.beginPath();
        c.moveTo(-80, y);
        c.bezierCurveTo(-35, y - 18, 15, y + 18, 70, y);
        c.stroke();
        c.beginPath();
        c.moveTo(48, y - 12);
        c.lineTo(70, y);
        c.lineTo(48, y + 12);
        c.stroke();
      }
      c.restore();
      this.worldLabel('通往' + REGIONS[s.region + 1].name, 0, -240, '#c4eee3');
    } else if (s.kind === 'current') {
      const active = Math.sin(t * 0.8 + s.variant) > 0.55;
      c.globalAlpha = active ? 0.35 : 0.15;
      c.strokeStyle = s.region === 2 ? '#f1b384' : '#93ddd8';
      c.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(-90 + i * 30, 120);
        c.bezierCurveTo(-120 + i * 30, 50, -40 + i * 30, -20, -90 + i * 30, -100);
        c.stroke();
      }
      if (s.region === 2)
        this.worldLabel(active ? '热泉喷流 · 避让' : '热泉蓄势', 0, 155, '#ecc798');
    }
    if (g.nearby?.id === s.id && g.screen === 'playing' && s.kind !== 'current') {
      this.worldLabel(
        'F  ' +
          (s.kind === 'safe'
            ? '记录检查点'
            : s.kind === 'gate'
              ? '进入海流'
              : s.kind === 'beacon'
                ? '点亮信标'
                : '开启秘藏'),
        0,
        95,
        '#fff3d0',
        true,
      );
    }
    c.restore();
  }
  private worldLabel(text: string, x: number, y: number, color: string, filled = false) {
    const c = this.ctx;
    c.save();
    c.font = '500 17px "Microsoft YaHei",sans-serif';
    c.textAlign = 'center';
    if (filled) {
      const w = c.measureText(text).width + 28;
      c.fillStyle = '#123849e8';
      c.beginPath();
      c.roundRect(x - w / 2, y - 22, w, 33, 8);
      c.fill();
    }
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }
  private fish(f: Fish, g: Game) {
    const c = this.ctx,
      s = BY_ID[f.species],
      special = ['elite', 'boss'].includes(s.behavior),
      rel = relation(g.player.size, f);
    if (special) this.championWarning(f, g);
    if (s.behavior === 'rare') {
      c.save();
      c.globalAlpha = 0.12;
      c.fillStyle = '#ffdc84';
      c.beginPath();
      c.ellipse(f.x, f.y, f.size * 1.8, f.size * 1.2, 0, 0, TAU);
      c.fill();
      c.restore();
    }
    const art =
      f.species === 'leviathan' && f.hits >= 3 ? { ...s, color: '#8598c0', accent: '#d3f5e8' } : s;
    drawFish(
      c,
      art,
      f.x,
      f.y,
      f.size,
      f.angle,
      g.time + f.phase,
      Math.hypot(f.vx, f.vy),
      1,
      f.pose,
    );
    c.save();
    c.translate(f.x, f.y - f.size * 0.7 - 14);
    if (special) {
      this.worldLabel(s.name, 0, -15, s.behavior === 'boss' ? '#b8e9e4' : '#f4c68d');
      if (f.state === 'weak') this.worldLabel('头部弱点 · 靠近咬击', 0, -43, '#ffdc95');
      for (let i = 0; i < championRequiredHits(f); i++) {
        c.fillStyle = i < f.hits ? '#f4d895' : '#e2dec73a';
        c.beginPath();
        c.arc((i - (championRequiredHits(f) - 1) / 2) * 15, 0, 4, 0, TAU);
        c.fill();
      }
    } else if (g.mode === 'practice' || distance(f, g.player) < 720) {
      if (rel === 'food') {
        c.fillStyle = '#b2eac1';
        c.beginPath();
        c.arc(0, 0, 3.7, 0, TAU);
        c.fill();
      } else if (rel === 'danger') {
        c.fillStyle = '#efae9b';
        c.beginPath();
        c.moveTo(0, -5);
        c.lineTo(5, 4);
        c.lineTo(-5, 4);
        c.closePath();
        c.fill();
      } else if (rel !== 'poison') {
        c.strokeStyle = '#e9d9b3';
        c.lineWidth = 1.3;
        c.beginPath();
        c.arc(0, 0, 4, 0, TAU);
        c.stroke();
      }
      // 特殊危险与体型危险独立显示，目标变大/变小都不能隐藏毒性特征。
      if (s.behavior === 'poison') {
        if (rel === 'danger') c.translate(13, 0);
        c.strokeStyle = '#dfbae8';
        c.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          c.rotate(Math.PI / 4);
          c.beginPath();
          c.moveTo(-6, 0);
          c.lineTo(6, 0);
          c.stroke();
        }
      }
    }
    c.restore();
  }
  private championWarning(f: Fish, g: Game) {
    const c = this.ctx;
    c.save();
    c.translate(f.x, f.y);
    if (f.state === 'windup' || f.state === 'charge') {
      if (f.state === 'windup' && f.vx === 1) {
        c.strokeStyle = '#f8c194';
        c.globalAlpha = 0.28 + 0.12 * Math.sin(g.time * 10);
        c.lineWidth = 4;
        c.beginPath();
        c.arc(0, 0, f.size * 2.25, 0, TAU);
        c.stroke();
      } else if (f.state === 'windup' && f.vx === 2) {
        c.strokeStyle = '#a2e4d6';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(0, 0, 400, f.angle - Math.PI / 2 - 0.4, f.angle - Math.PI / 2 + 0.4);
        c.stroke();
      } else {
        c.rotate(f.angle);
        c.globalAlpha = 0.18 + 0.08 * Math.sin(g.time * 8);
        c.fillStyle = '#ffae86';
        c.beginPath();
        c.moveTo(f.size * 0.3, -f.size * 0.6);
        c.lineTo(850, -f.size * 0.32);
        c.lineTo(900, 0);
        c.lineTo(850, f.size * 0.32);
        c.lineTo(f.size * 0.3, f.size * 0.6);
        c.closePath();
        c.fill();
        c.globalAlpha = 0.7;
        c.setLineDash([12, 14]);
        c.strokeStyle = '#ffd0a2';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(f.size, 0);
        c.lineTo(850, 0);
        c.stroke();
      }
    } else if (f.state === 'weak') {
      c.translate(Math.cos(f.angle) * f.size * 0.74, Math.sin(f.angle) * f.size * 0.74);
      c.strokeStyle = '#f8d49a';
      c.globalAlpha = 0.65;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, f.size * 0.33 + Math.sin(g.time * 6) * 4, 0, TAU);
      c.stroke();
    } else if (f.state === 'sweep') {
      c.globalAlpha = 0.14;
      c.fillStyle = '#edaa85';
      c.beginPath();
      c.arc(0, 0, f.size * 2.25, 0, TAU);
      c.fill();
    } else if (f.state === 'current') {
      c.globalAlpha = 0.16;
      c.fillStyle = '#c19eb9';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 650, f.angle - Math.PI / 2 + 0.4, f.angle - Math.PI / 2 + TAU - 0.4);
      c.closePath();
      c.fill();
      c.fillStyle = '#a7e8d2';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 650, f.angle - Math.PI / 2 - 0.4, f.angle - Math.PI / 2 + 0.4);
      c.fill();
    }
    c.restore();
  }
  private foreground(g: Game, left: number, right: number) {
    if (this.quality === 'low') return;
    const c = this.ctx;
    for (let i = Math.floor(left / 500); i < right / 500; i++) {
      const x = i * 500 + hash(i) * 100;
      this.kelp(
        c,
        x,
        2220,
        200 + hash(i + 8) * 170,
        g.time + i,
        g.region === 2 ? '#0c3048' : '#1c5960',
        0.5,
      );
    }
  }
  private direction(g: Game) {
    const target = g.objectiveTarget();
    if (!target) return;
    const pos = this.toScreen(target.x, target.y),
      margin = 90;
    if (pos.x > margin && pos.x < this.w - margin && pos.y > 130 && pos.y < this.h - 140) return;
    const dx = pos.x - this.w / 2,
      dy = pos.y - this.h / 2,
      a = Math.atan2(dy, dx);
    const radius = Math.min(
      (this.w / 2 - margin) / Math.max(0.001, Math.abs(Math.cos(a))),
      (this.h / 2 - 130) / Math.max(0.001, Math.abs(Math.sin(a))),
    );
    const x = this.w / 2 + Math.cos(a) * radius,
      y = this.h / 2 + Math.sin(a) * radius,
      c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(a);
    c.fillStyle = '#b4e7dc';
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(-7, -6);
    c.lineTo(-4, 0);
    c.lineTo(-7, 6);
    c.closePath();
    c.fill();
    c.restore();
    c.save();
    c.font = '12px "Microsoft YaHei",sans-serif';
    c.textAlign = x > this.w * 0.6 ? 'right' : x < this.w * 0.4 ? 'left' : 'center';
    c.fillStyle = '#ceeae4';
    c.fillText(`${target.label} · ${Math.round(distance(g.player, target) / 10)} m`, x, y + 24);
    c.restore();
  }
  toScreen(x: number, y: number) {
    return {
      x: (x - this.camera.x) * this.camera.zoom + this.w / 2,
      y: (y - this.camera.y) * this.camera.zoom + this.h / 2,
    };
  }
  toWorld(x: number, y: number) {
    return {
      x: (x - this.w / 2) / this.camera.zoom + this.camera.x,
      y: (y - this.h / 2) / this.camera.zoom + this.camera.y,
    };
  }
  /** 当前画面与即将缩放到的画面取并集，避免镜头扩展后撞见刚生成的鱼。 */
  spawnBounds() {
    const p = this.game?.player;
    const half = this.w / (2 * this.camera.zoom);
    const futureHalf = p ? (1550 + p.size * 5.3) / 2 + 320 : half;
    return {
      left: Math.min(this.camera.x - half, (p?.x ?? this.camera.x) - futureHalf),
      right: Math.max(this.camera.x + half, (p?.x ?? this.camera.x) + futureHalf),
    };
  }
  private vignette() {
    const c = this.ctx,
      gr = c.createRadialGradient(
        this.w * 0.5,
        this.h * 0.4,
        this.h * 0.2,
        this.w * 0.5,
        this.h * 0.5,
        this.w * 0.75,
      );
    gr.addColorStop(0, '#001c2a00');
    gr.addColorStop(1, '#001c2a60');
    c.fillStyle = gr;
    c.fillRect(0, 0, this.w, this.h);
  }
  private menuWater() {
    const c = this.ctx;
    c.fillStyle = '#073a53';
    c.fillRect(0, 0, this.w, this.h);
  }
}
