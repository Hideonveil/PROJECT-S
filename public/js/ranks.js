import { defaultAvailableGame, gameById } from "./game-catalog.js";

function displayRank(option) {
  if (option?.value) return String(option.value);
  if (!option?.name) return "";
  return option.subtitle ? `${option.name}（${option.subtitle}）` : String(option.name);
}

export function rankLabel(value, fallback = "", gameId = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const game = gameById(gameId) || defaultAvailableGame();
  const option = game?.rankOptions?.find((rank) => rank.code === raw || rank.value === raw);
  return displayRank(option) || raw;
}
