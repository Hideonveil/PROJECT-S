export function initNodeField(root = document) {
  const canvas = root.querySelector("canvas[data-node-field]");
  if (!canvas) return null;
  const field = new NodeField(canvas);
  field.start();
  return field;
}

export class NodeField {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = { count: 36, accent: "#c9ff3d", dim: "#7f8ea0", ...options };
    this.nodes = [];
    this.raf = 0;
    this.t = 0;
    this.running = false;
    this.onResize = () => this.resize();
    this.resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(this.onResize);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    if (this.resizeObserver) this.resizeObserver.observe(this.canvas);
    else window.addEventListener("resize", this.onResize);
    const loop = () => {
      if (!this.running) return;
      this.t += 1;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    else window.removeEventListener("resize", this.onResize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx = this.canvas.getContext("2d");
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seedNodes();
  }

  seedNodes() {
    const { count } = this.options;
    this.nodes = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: 1 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      accent: i % 7 === 0,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);

    const link = 120;
    for (let i = 0; i < this.nodes.length; i += 1) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j += 1) {
        const b = this.nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < link) {
          const alpha = (1 - dist / link) * 0.16;
          ctx.strokeStyle =
            a.accent || b.accent
              ? `rgba(201, 255, 61, ${alpha * 1.4})`
              : `rgba(127, 142, 160, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of this.nodes) {
      const pulse = 1 + Math.sin(this.t * 0.03 + n.phase) * 0.25;
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -10) n.x = this.w + 10;
      if (n.x > this.w + 10) n.x = -10;
      if (n.y < -10) n.y = this.h + 10;
      if (n.y > this.h + 10) n.y = -10;

      ctx.fillStyle = n.accent ? this.options.accent : this.options.dim;
      ctx.globalAlpha = n.accent ? 0.75 * pulse : 0.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * (n.accent ? 1.7 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
