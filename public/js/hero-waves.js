const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function initHeroWaves(canvas) {
  if (!canvas || !canvas.getContext || prefersReducedMotion()) return () => {};
  const context = canvas.getContext("2d");
  if (!context) return () => {};

  let frame = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointer = { x: 0.58, y: 0.42 };
  let targetPointer = { ...pointer };
  let last = performance.now();
  let elapsed = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const move = (event) => {
    const rect = canvas.getBoundingClientRect();
    targetPointer = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1))),
    };
  };

  const drawWave = (time, index, color, alpha, amplitude, baseline, frequency) => {
    context.beginPath();
    const offset = (pointer.x - 0.5) * 28 * (index + 1);
    const vertical = (pointer.y - 0.5) * 18 * (index + 1);
    for (let x = -32; x <= width + 32; x += 8) {
      const normalized = x / Math.max(width, 1);
      const pointerDistance = (normalized - pointer.x) * 4.2;
      const pointerPull = Math.exp(-(pointerDistance * pointerDistance));
      const response = pointerPull * Math.sin(time * 0.00115 + index * 1.35) * (16 + index * 4);
      const y = baseline + vertical + response + Math.sin(normalized * frequency + time * (0.00032 + index * 0.00007) + index * 1.4) * (amplitude + pointer.x * 12) + Math.sin(normalized * 7 + time * 0.00021) * 7 - offset * normalized;
      if (x === -32) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = color;
    context.globalAlpha = alpha;
    context.lineWidth = index === 0 ? 1.7 : 1.15;
    context.stroke();
  };

  const draw = (now) => {
    const delta = Math.min(48, now - last);
    last = now;
    elapsed += delta;
    pointer.x += (targetPointer.x - pointer.x) * 0.035;
    pointer.y += (targetPointer.y - pointer.y) * 0.035;
    context.clearRect(0, 0, width, height);

    const glowX = width * (0.5 + (pointer.x - 0.5) * 0.32);
    const glowY = height * (0.42 + (pointer.y - 0.5) * 0.22);
    const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * 0.64);
    glow.addColorStop(0, "rgba(185,165,255,.34)");
    glow.addColorStop(.42, "rgba(118,89,223,.12)");
    glow.addColorStop(1, "rgba(248,247,242,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    drawWave(elapsed, 0, "#7659df", .42, 38, height * .31, 8.5);
    drawWave(elapsed + 420, 1, "#b9a5ff", .48, 29, height * .43, 10.5);
    drawWave(elapsed + 820, 2, "#121118", .18, 24, height * .56, 12);
    drawWave(elapsed + 1080, 3, "#7659df", .28, 34, height * .68, 9.5);
    context.globalAlpha = 1;
    frame = window.requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", move, { passive: true });
  frame = window.requestAnimationFrame(draw);

  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", move);
    context.clearRect(0, 0, width, height);
  };
}
