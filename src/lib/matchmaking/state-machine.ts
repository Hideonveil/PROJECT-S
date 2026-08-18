import type { MatchState } from "./types";

const transitions: Record<MatchState, readonly MatchState[]> = {
  idle: ["searching"],
  searching: ["candidate_found", "cancelled", "expired"],
  candidate_found: ["waiting_confirmation", "searching", "cancelled", "expired"],
  waiting_confirmation: ["matched", "searching", "cancelled", "expired"],
  matched: ["playing", "cancelled"],
  playing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

export const ACTIVE_MATCH_STATES: readonly MatchState[] = [
  "searching",
  "candidate_found",
  "waiting_confirmation",
  "matched",
  "playing",
];

export function canTransition(from: MatchState, to: MatchState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: MatchState, to: MatchState): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_MATCH_TRANSITION:${from}->${to}`);
  }
}

export function isTerminalState(state: MatchState): boolean {
  return transitions[state].length === 0;
}
