// 胜利礼花：全屏 canvas 粒子演出（彩纸雨 + 两侧礼炮 + 烟花），现场绘制无外部素材
// startConfetti(canvas, { grand }) 开始；grand=true 完整开场（礼炮+烟花），false 只下轻彩纸雨
// stopConfetti() 停止并清屏（复盘/回大厅时调用）

const COLORS = ['#f6c744', '#ffde7a', '#e8543f', '#4fb3a1', '#5b8dd9', '#c86bd9', '#fff3c4', '#7bc85e'];

let cv = null;
let cx = null;
let raf = 0;
let parts = [];
let rainUntil = 0;     // 持续彩纸雨截止时间
let fwLeft = 0;        // 剩余烟花发数
let fwNextAt = 0;

function fit() {
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
}

function confetto(x, y, angle, speed) {
  return {
    kind: 'paper', x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    w: 6 + Math.random() * 6, h: 9 + Math.random() * 9,
    rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.3,
    // tumble：绕横轴翻滚的相位，画的时候用 sin 压扁高度模拟 3D 翻面
    tumble: Math.random() * Math.PI * 2, vt: 0.14 + Math.random() * 0.2,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    life: 1, decay: 0.0022 + Math.random() * 0.002,
  };
}

function spark(x, y, angle, speed, color) {
  return {
    kind: 'spark', x, y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: 1.6 + Math.random() * 1.8, color,
    life: 1, decay: 0.012 + Math.random() * 0.01,
  };
}

// 礼炮：从 (x,y) 朝 angle 方向扇形喷彩纸
function cannon(x, y, angle, n, spread, speed) {
  for (let i = 0; i < n; i++) {
    parts.push(confetto(x, y, angle + (Math.random() - 0.5) * spread, speed * (0.45 + Math.random() * 0.75)));
  }
}

// 烟花：上半屏随机位置圆形爆开一圈光点
function firework() {
  const x = cv.width * (0.15 + Math.random() * 0.7);
  const y = cv.height * (0.1 + Math.random() * 0.32);
  const color = COLORS[(Math.random() * COLORS.length) | 0];
  const n = 42 + (Math.random() * 16 | 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
    parts.push(spark(x, y, a, 2.2 + Math.random() * 3.4, color));
  }
}

function tick() {
  raf = requestAnimationFrame(tick);
  const now = Date.now();
  cx.clearRect(0, 0, cv.width, cv.height);

  // 顶部持续飘落的彩纸雨
  if (now < rainUntil) {
    for (let i = 0; i < 2; i++) {
      const c = confetto(Math.random() * cv.width, -16, Math.PI / 2, 0.6 + Math.random());
      c.vx = (Math.random() - 0.5) * 1.6;
      parts.push(c);
    }
  }
  if (fwLeft > 0 && now >= fwNextAt) {
    firework();
    fwLeft--;
    fwNextAt = now + 750 + Math.random() * 500;
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= p.decay;
    if (p.kind === 'paper') {
      p.vy = Math.min(p.vy + 0.075, 2.6);           // 重力 + 空气阻力封顶的落速
      p.vx = p.vx * 0.99 + Math.sin(p.tumble) * 0.06; // 翻面带来的左右摇摆
      p.rot += p.vr; p.tumble += p.vt;
      cx.globalAlpha = Math.min(1, p.life * 3);
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.rot);
      cx.scale(1, Math.max(0.12, Math.abs(Math.sin(p.tumble)))); // 翻滚压扁
      cx.fillStyle = p.color;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    } else {
      p.vy += 0.045; p.vx *= 0.985; p.vy *= 0.985;
      cx.globalAlpha = Math.max(0, p.life);
      cx.fillStyle = p.color;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r * (0.5 + p.life * 0.7), 0, Math.PI * 2);
      cx.fill();
      // 外圈光晕（比实心圆便宜得多的发光效果）
      cx.globalAlpha = Math.max(0, p.life) * 0.25;
      cx.beginPath();
      cx.arc(p.x, p.y, p.r * 2.6, 0, Math.PI * 2);
      cx.fill();
    }
    if (p.life <= 0 || p.y > cv.height + 30) parts.splice(i, 1);
  }
  cx.globalAlpha = 1;

  // 全部落完且不再生成时自动停，省 CPU
  if (!parts.length && now >= rainUntil && fwLeft <= 0) stopConfetti();
}

export function startConfetti(canvas, { grand = true } = {}) {
  cv = canvas;
  cx = cv.getContext('2d');
  fit();
  const now = Date.now();
  if (grand) {
    // 两侧礼炮朝中上方齐射 + 烟花连发 + 8 秒彩纸雨
    cannon(-10, cv.height * 0.72, -Math.PI / 3.2, 70, 0.9, 11);
    cannon(cv.width + 10, cv.height * 0.72, Math.PI + Math.PI / 3.2, 70, 0.9, 11);
    fwLeft = 6;
    fwNextAt = now + 350;
    rainUntil = now + 8000;
  } else {
    rainUntil = now + 3500;
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

export function stopConfetti() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  parts = [];
  rainUntil = 0;
  fwLeft = 0;
  if (cx) cx.clearRect(0, 0, cv.width, cv.height);
}

window.addEventListener('resize', () => { if (raf) fit(); });
