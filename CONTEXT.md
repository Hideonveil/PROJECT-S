# Jiyuan Matching

Jiyuan connects compatible players into a shared Room and carries them through one game Session and its settlement.

## Language

**Room**:
The shared space a player enters immediately after starting matchmaking. A Room may recruit members before any Session exists.
_Avoid_: Fake Room, Forming Page, Matching Room

**Recruitment**:
The Room-level state that determines whether compatible players may still join.
_Avoid_: Room lifecycle, Session status

**Session**:
One formal game process inside a Room, with a fixed participant set and an independent terminal lifecycle.
_Avoid_: Room, Match entity

**Active Member**:
A player currently present in the Room UI. Leaving changes membership but does not rewrite the Session participant set.
_Avoid_: Session participant

**Session Participant**:
A player frozen into a Session when recruitment locks. Participants remain settlement and postgame subjects even after leaving the Room UI.
_Avoid_: Active member

**Settlement**:
A participant's terminal decision for a Session, including Goodbye, slipping away after Goodbye, or disconnect timeout.
_Avoid_: Active-member count, Room exit

**Stop-Recruitment Vote**:
A reversible decision by an active Casual Room member to lock recruitment. It becomes effective only when every current active member agrees.
_Avoid_: Owner lock, Force start

**Resume Eligibility**:
The server decision that a player has a valid Room or Session relationship that can be offered for reconnection.
_Avoid_: Active room_member
