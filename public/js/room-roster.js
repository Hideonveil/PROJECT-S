function active(members = []) {
  return (Array.isArray(members) ? members : []).filter((member) => (member?.memberStatus || member?.status || "active") === "active");
}

/** Return only user-visible roster changes between two server snapshots. */
export function rosterDelta(previousMembers, nextMembers) {
  const previous = active(previousMembers);
  const next = active(nextMembers);
  const previousIds = new Set(previous.map((member) => member.id));
  const nextIds = new Set(next.map((member) => member.id));
  return {
    joined: next.filter((member) => member.id && !previousIds.has(member.id)),
    left: previous.filter((member) => member.id && !nextIds.has(member.id)),
  };
}
