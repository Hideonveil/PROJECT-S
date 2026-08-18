const PALETTES = [
  { bg: "#e9eefb", face: "#fdf8f0", accent: "#7d6cf2", warm: "#dd9040", line: "#c9cfdf" },
  { bg: "#e8f3ee", face: "#fbf5ea", accent: "#4fb386", warm: "#e0a44c", line: "#c4d6cc" },
  { bg: "#f7ecef", face: "#fdf6ee", accent: "#df6a72", warm: "#7d6cf2", line: "#e3cdd2" },
  { bg: "#eef6fa", face: "#f5f2ea", accent: "#4aa8cc", warm: "#dd9040", line: "#c8dde8" },
  { bg: "#f4f0e6", face: "#fbf8f0", accent: "#c9a24d", warm: "#df6a72", line: "#ddd5c2" },
  { bg: "#efeaf9", face: "#f8f4ec", accent: "#8a76f5", warm: "#e0a44c", line: "#d5cdeb" },
];

export function avatar(seed, size = 72, extra = "") {
  if (!String(seed || "").trim()) {
    return `<span class="avatar-canvas avatar-empty ${extra}" style="width:${size}px;height:${Math.round(size * 0.866)}px" aria-hidden="true"></span>`;
  }
  if (String(seed).startsWith("data:")) {
    return `<img class="avatar-canvas avatar-image ${extra}" src="${escapeAttr(seed)}" width="${size}" alt="" />`;
  }
  const h = Math.round(size * 0.866);
  return `<canvas class="avatar-canvas ${extra}" width="${size}" height="${h}" data-avatar="${escapeAttr(
    seed
  )}"></canvas>`;
}

export function avatarWrap(seed, size = 64, online = true, extra = "") {
  const dot = online === null ? "" : `<span class="avatar-online ${online ? "" : "avatar-online--off"}"></span>`;
  return `<span class="avatar-wrap ${extra}" style="--avatar-size:${size}px">${avatar(
    seed,
    Math.round(size * 1.2),
    "avatar-canvas--inwrap"
  )}${dot}</span>`;
}

export function paintAvatars(root = document) {
  root.querySelectorAll("canvas[data-avatar]").forEach(paintAvatar);
}

function paintAvatar(canvas) {
  const seed = canvas.dataset.avatar || "node";
  const h = hashString(seed);
  const palette = PALETTES[h % PALETTES.length];
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const hh = canvas.height;

  ctx.clearRect(0, 0, w, hh);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, hh);

  const cx = w / 2;
  const cy = hh / 2;
  const r = Math.min(w, hh) * 0.44;

  ctx.save();
  hexClip(ctx, cx, cy, r);

  const glow = ctx.createRadialGradient(
    w * (0.25 + (h % 5) * 0.04),
    hh * (0.22 + (h % 3) * 0.06),
    0,
    w * 0.5,
    hh * 0.5,
    w * 0.72
  );
  glow.addColorStop(0, `${palette.accent}22`);
  glow.addColorStop(0.55, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, hh);

  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const rr = r * (0.62 + i * 0.2);
    hexPath(ctx, cx, cy, rr);
    ctx.stroke();
  }

  const face = hexPoints(cx, cy, r * 0.54);
  ctx.fillStyle = palette.face;
  ctx.fill(new Path2D(face));
  ctx.strokeStyle = "rgba(10, 14, 21, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke(new Path2D(face));

  drawEyes(ctx, cx, cy, r, palette);
  drawMouth(ctx, cx, cy, r, palette);

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy - r * 0.26);
  ctx.lineTo(cx - r * 0.2, cy - r * 0.42);
  ctx.stroke();

  ctx.restore();

  ctx.strokeStyle = `${palette.accent}66`;
  ctx.lineWidth = 1.5;
  hexPath(ctx, cx, cy, r);
  ctx.stroke();

  ctx.fillStyle = palette.warm;
  const dot = hexPoints(cx + r * 0.76, cy - r * 0.62, r * 0.12);
  ctx.fill(new Path2D(dot));
}

function drawEyes(ctx, cx, cy, r, palette) {
  ctx.fillStyle = "rgba(10, 14, 21, 0.92)";
  const eyeY = cy - r * 0.08;
  const left = [
    [cx - r * 0.48, eyeY - r * 0.14],
    [cx - r * 0.1, eyeY - r * 0.14],
    [cx - r * 0.18, eyeY + r * 0.12],
    [cx - r * 0.52, eyeY + r * 0.06],
  ];
  const right = left.map(([x, y]) => [cx * 2 - x, y]);
  polygon(ctx, left);
  polygon(ctx, right);
  ctx.fill();

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.56, eyeY - r * 0.02);
  ctx.lineTo(cx - r * 0.06, eyeY - r * 0.02);
  ctx.moveTo(cx + r * 0.06, eyeY - r * 0.02);
  ctx.lineTo(cx + r * 0.56, eyeY - r * 0.02);
  ctx.stroke();
}

function drawMouth(ctx, cx, cy, r, palette) {
  ctx.strokeStyle = "rgba(10, 14, 21, 0.85)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.18, cy + r * 0.28);
  ctx.lineTo(cx + r * 0.18, cy + r * 0.28);
  ctx.stroke();
}

function hexPath(ctx, cx, cy, r) {
  const pts = hexPointArray(cx, cy, r);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function hexClip(ctx, cx, cy, r) {
  hexPath(ctx, cx, cy, r);
  ctx.clip();
}

function hexPoints(cx, cy, r) {
  return hexPointArray(cx, cy, r)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}

function hexPointArray(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

function polygon(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
