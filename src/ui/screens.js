// Title and result screens, plus the touch dodge buttons.
export class Screens {
  constructor(root) {
    this.root = root;
    this.el = null;
  }

  show(html, onTap, delay = 0) {
    this.hide();
    const d = document.createElement('div');
    d.className = 'screen';
    d.dataset.ui = '1';
    d.innerHTML = html;
    this.root.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
    if (onTap) {
      const armAt = performance.now() + delay;
      const fn = (e) => {
        e.stopPropagation();
        if (performance.now() < armAt) return;
        d.removeEventListener('pointerdown', fn);
        onTap();
      };
      d.addEventListener('pointerdown', fn);
    }
    this.el = d;
  }

  hide() {
    if (!this.el) return;
    const d = this.el;
    d.classList.remove('in');
    d.classList.add('out');
    setTimeout(() => d.remove(), 500);
    this.el = null;
  }

  title(onStart) {
    this.show(
      `<div class="title">
        <div class="logo"><span>墨</span><span>决</span><i class="seal">一笔</i></div>
        <div class="sub">一 刀 一 笔</div>
        <ul class="how">
          <li><b>划</b>动手指出刀</li>
          <li>看红色来刀，<b>迎着它划</b>过去即是格挡</li>
          <li>两侧按钮或 A / D 闪避</li>
        </ul>
        <div class="tap">点 击 开 始</div>
      </div>`,
      onStart,
    );
  }

  result(s, onRetry) {
    this.show(
      `<div class="result ${s.win ? 'win' : 'lose'}">
        <div class="big">${s.win ? '胜' : '败'}</div>
        <div class="stats">完美格挡 ${s.perfect}　·　最高连斩 ${s.maxCombo}　·　用时 ${s.time} 秒</div>
        <div class="tap">点 击 再 战</div>
      </div>`,
      onRetry,
      700,
    );
  }
}

export function makeDodgeButtons(root, onDodge) {
  const wrap = document.createElement('div');
  wrap.className = 'dodges';
  for (const side of [-1, 1]) {
    const b = document.createElement('div');
    b.className = `dodge ${side < 0 ? 'l' : 'r'}`;
    b.dataset.ui = '1';
    b.innerHTML = `<span>${side < 0 ? '‹' : '›'}</span><em>闪</em>`;
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      b.classList.add('hit');
      setTimeout(() => b.classList.remove('hit'), 160);
      onDodge(side);
    });
    wrap.appendChild(b);
  }
  root.appendChild(wrap);
  return {
    show(v) {
      wrap.classList.toggle('on', v);
    },
  };
}
