// 按钮音效：Web Audio 现场合成，无需音频文件（Safari 用 webkitAudioContext）
let ctx = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // 浏览器要求音频上下文由用户手势激活；点击回调里 resume 即可
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 单个短音：freq 起始频率，freq2 结束频率（滑音），dur 秒，gain 音量，when 延迟秒
function tone({ freq = 600, freq2 = 0, type = 'sine', dur = 0.08, gain = 0.1, when = 0 }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  // 普通按钮：短促的「嗒」
  click() {
    tone({ freq: 740, freq2: 500, type: 'triangle', dur: 0.055, gain: 0.08 });
  },
  // 主要按钮（橙色）：上扬的「叮」
  primary() {
    tone({ freq: 520, freq2: 800, type: 'triangle', dur: 0.09, gain: 0.1 });
    tone({ freq: 1150, type: 'sine', dur: 0.07, gain: 0.05, when: 0.04 });
  },
  // 危险按钮（红色）：低沉的「咚」
  danger() {
    tone({ freq: 300, freq2: 180, type: 'triangle', dur: 0.13, gain: 0.12 });
  },
};

// 事件委托挂在捕获阶段：即使按钮自己的 handler 里 stopPropagation 也能出声
export function initSfx() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.classList.contains('primary')) sfx.primary();
    else if (b.classList.contains('danger')) sfx.danger();
    else sfx.click();
  }, true);
}
