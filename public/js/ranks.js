const RANK_LABELS = Object.freeze({
  initiate: "新人（砖石）",
  seeker: "行者（岩砾）",
  alchemist: "侍从（镔铁）",
  arcanist: "近卫（青铜）",
  ritualist: "秘士（白银）",
  emissary: "侍祭（黄金）",
  archon: "蜜使（铂金）",
  oracle: "神谕者（钻石）",
  phantom: "幽虚影",
  ascendant: "凌世君",
  eternus: "不朽之星",
});

export function rankLabel(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  // Keep already-localized labels while translating the compact database code.
  return RANK_LABELS[raw] || raw;
}

export { RANK_LABELS };
