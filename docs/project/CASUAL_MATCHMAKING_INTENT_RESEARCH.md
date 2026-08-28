# Casual Matchmaking Intent Research

Date: 2026-08-28

## Question

How should Jiyuan replace the current Casual choices (`随缘 / 速度 / 满人 / 更多`) so that the UI is understandable, mixed users can still match, Room-first recruitment stays coherent, and the queue does not fragment?

## Current repository findings

The current four choices do not describe four consistently implemented behaviours.

- `随缘` and `速度` both write a strict `1–1` teammate range in the browser.
- `满人` writes a strict `5–5` teammate range.
- `更多` describes its range as strict and says users only join ranges that intersect.
- Server compatibility deliberately ignores Casual teammate count as a hard condition.
- `recruitmentMode = open | rush | fill` is stored, but the persistent matcher does not use the three values as distinct scheduling or Room-lock policies.
- The capacity runner treats `minTeammates` as a completion requirement, which is a third interpretation of the same data.

Therefore UI copy, ticket data, matcher eligibility, Room behaviour, and test acceptance currently disagree. This is a domain-contract problem, not a card-design problem.

## Primary-source patterns

### 1. Separate hard eligibility from preference ranking

PlayFab distinguishes filtering rules from distance-based sorting. A hard rule can reject a ticket; softer attributes rank compatible candidates. It also supports time-based expansion and making a rule optional while retaining it as a sorting signal. Long-waiting tickets are seeded first. Source: [PlayFab — How matchmaking works](https://learn.microsoft.com/en-us/xbox/playfab/multiplayer/matchmaking/how-matchmaking-works).

Amazon GameLift FlexMatch similarly supports gradual rule expansion, including relaxing team minimum size after configured wait times. Its documentation warns against relaxing player-count requirements before backfill has had time to work. Sources: [FlexMatch expansions](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-rulesets-components-expansion.html), [FlexMatch rule-set properties](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-ruleset-property-definitions.html).

**Lesson for Jiyuan:** game, mode, account eligibility and true safety constraints are hard. Mic, role and preferred headcount should rank candidates, not split Casual into isolated queues.

### 2. Use one minimum/maximum contract, not vague intent names

PlayFab's simplest queue is a minimum and maximum match size: the service tries to fill to maximum and can form a match at minimum when there are not enough tickets. Source: [PlayFab Matchmaking](https://learn.microsoft.com/en-us/xbox/playfab/multiplayer/matchmaking/).

Fortnite exposes a much simpler player decision: `Fill` allows random players to occupy open party slots; `No Fill` does not. It does not ask users to choose several overlapping meanings of “fast”, “casual”, and “full”. Source: [Epic Games — Team Fill](https://www.epicgames.com/help/c-202300000001636/c-202300000001721/unable-to-find-teammates-while-playing-in-duos-trios-or-squad-in-battle-royale-and-zero-build-modes-in-fortnite-a202300000014690?lang=en-US).

**Lesson for Jiyuan:** every user entering Casual matchmaking has already chosen Fill. `随缘` is the default product behaviour, `速度` is a later decision to stop recruitment, and `满人` is what happens when nobody stops recruitment. They do not need to be three pre-queue modes.

### 3. Lobby/Room first, then backfill

Steam's documented flow is: search for a similar lobby, join it if found, otherwise create one; users remain in the lobby until ready, can chat, and receive callbacks when members join or leave. Full lobbies are excluded by default. Steam also provides “near value” sorting separately from strict filters and recommends starting restrictive then broadening successive searches. Sources: [Steam Matchmaking & Lobbies](https://partner.steamgames.com/doc/features/multiplayer/matchmaking), [Steam skill matchmaking](https://partner.steamgames.com/doc/features/multiplayer/matchmaking/skill?l=english&language=english).

PlayFab models backfill as a separate ticket for an existing game, so open capacity is filled without pretending every newcomer is starting a separate match. Source: [PlayFab server backfill tickets](https://learn.microsoft.com/en-us/xbox/playfab/multiplayer/matchmaking/backfill-tickets-multiplayer-sdk).

**Lesson for Jiyuan:** prefer adding a compatible ticket to an existing recruiting Room before creating another one-person Room. This both improves occupancy and reduces the number of independently mutating Room groups.

### 4. Display expectations without turning all of them into filters

Destiny 2 Fireteam Finder lets players specify tone tags, mic, platform, language and minimum rank, but its guide explicitly states that several of these communicate expectations without preventing applications. It asks for an explicit number of players to recruit rather than an ambiguous speed label. Source: [Bungie Fireteam Finder Guide](https://help.bungie.net/hc/en-us/articles/25787853699220-Fireteam-Finder-Guide).

Final Fantasy XIV Party Finder similarly distinguishes recruitment settings and display-only settings; its automatic Duty Finder can request reinforcements for an in-progress party. Source: [FFXIV Party Play manual](https://na.finalfantasyxiv.com/game_manual/pp/).

**Lesson for Jiyuan:** if preferred headcount remains visible, label it as a preference and show it to Room members. Do not promise strict matching unless the backend actually enforces it symmetrically.

### 5. Avoid unnecessary pool partitioning

Open Match pools select tickets that satisfy every filter. Multiple overlapping profiles require evaluator/synchronizer handling, while perfectly partitioned profiles cannot share tickets. Sources: [Open Match API](https://open-match.dev/site/docs/reference/api/), [Open Match evaluator and synchronizer](https://open-match.dev/site/docs/guides/evaluator/).

PlayFab also describes required equality rules as natural partition boundaries and softer/expanding rules as poor partition keys. Source: [PlayFab matchmaking scaling](https://learn.microsoft.com/en-us/gaming/playfab/multiplayer/matchmaking/matchmaking-partition).

**Lesson for Jiyuan:** do not create Casual sub-pools for `default / hurry / fill / advanced`. At current and near-term population levels, that would reduce liquidity and increase one-person Rooms.

## Recommended Jiyuan model

### Product UI

Remove `随缘 / 速度 / 满人 / 更多` as four mutually exclusive top-level choices.

Casual configuration should contain:

1. `麦克风`: 开麦 / 不开麦 / 无所谓 (soft preference).
2. Optional collapsed control: `偏好人数` — 不限（推荐） / 2 / 3 / 4 / 5 / 6 人.

The copy must say: `优先寻找接近这个人数的 Room；不会因此错过合适玩家。`

Do not expose a minimum/maximum dual slider. A range looks precise but creates unclear asymmetric contracts between users.

### One Casual queue

All Casual tickets share one eligibility pool.

Hard eligibility:

- same game;
- Casual mode;
- valid searching ticket;
- user not already active in another Room/Session;
- Room open and recruiting;
- Room below the game's hard cap;
- security/blocking rules, if introduced later.

Soft ranking, in order:

1. backfill an existing recruiting Room before creating another Room;
2. oldest waiting ticket / oldest recruiting Room;
3. microphone agreement;
4. preferred total-player distance;
5. role/play-style agreement if retained.

After a bounded wait, mic/role/headcount differences remain visible but no longer block or strongly penalize a candidate.

### Room contract

- Room exists immediately after matchmaking starts.
- Recruitment remains active until the hard cap or unanimous `停止招募`.
- Once at least two members are present, `停止招募` becomes available.
- If nobody votes to stop, Room naturally continues toward full capacity. This is the old `满人` behaviour without a separate queue.
- A user wanting to begin quickly proposes `停止招募` inside Room. This is the old `速度` behaviour at the moment it becomes actionable.
- If membership changes, vote handling follows the already accepted membership-version rules.
- At hard cap, recruitment locks automatically and creates the Session.

### Minimal compatibility rollout

No new matching subsystem is required.

- New Casual tickets can temporarily canonicalize legacy fields to `desiredTeammates=5`, `minTeammates=1`, `recruitmentMode=open`.
- Optional preferred total can live in existing safe metadata until a dedicated field is justified.
- Existing legacy values remain readable for old rows but stop driving new matching or test acceptance.
- The matcher must score preference distance but never use it as an eligibility partition.
- The capacity runner must define “matched” as membership in the current Room with at least one peer. It must test Room filling and Session lock separately instead of treating each user's old `minTeammates` as the match-completion truth.

## Required acceptance tests

1. Tickets formerly labelled 随缘、速度、满人 can all enter the same compatible Room.
2. A preferred 2-person user and preferred 6-person user see each other immediately and symmetrically.
3. Headcount preference affects ordering, not eligibility.
4. Existing recruiting Rooms are filled before unnecessary one-person Rooms are created.
5. With no stop votes, a Room can backfill to six and auto-lock.
6. With all active members voting, a 2/3/4/5-person Room locks correctly.
7. Join/leave updates the vote denominator using `room_id + membership_version`.
8. No client or runner treats another member's private preference as the Room's hard completion requirement.
9. Mixed-intent stress produces no isolated ticket cohort, duplicate Room, ghost, or conflict storm.
10. Matcher attempts remain bounded when only preference-mismatched candidates exist.

## Decision

Recommended: replace the four-choice pre-match intent step with one unified Casual queue and an optional single-value soft headcount preference. Move “quickly start” and “fill the room” from pre-match labels into observable Room behaviour.

If Jiyuan later needs truly strict, fixed-size recruitment, make that a separate explicit `自定义房间` product with a visible Room contract. Do not hide it behind `更多` inside automatic Casual matchmaking.
