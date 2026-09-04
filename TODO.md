# MUD Roadmap

Legend: `[ ]` not started · `[~]` built, awaiting your review · `[x]` done, confirmed

## Project identity
- [x] Name the game "The Big MUDowski" and show it in the welcome message alongside the version number (currently just "the MUD")
- [x] Set up separate dev and prod versions via `NODE_ENV` (`npm run dev` = port 4001, `players.dev.json`, `-dev` version; `npm start` = port 4000, `players.json`)

## Foundation
- [x] Basic telnet server (login, look, movement, say, who, quit)
- [x] Project scaffolding (git, package.json, .gitignore)
- [x] Big Lebowski-themed world (7 rooms)

## Persistence
- [x] Save player data (name, location) to disk
- [x] Load player data back in on reconnect
- [x] Decide on simple storage format (e.g. JSON file) vs. a database

## Accounts
- [x] At login, ask upfront whether the player is new or returning, instead of inferring it from the typed username
- [x] Move from name-only login to real accounts (username + password, with confirm-on-create; usernames are case-insensitive)
- [x] Store passwords securely (hashed with `crypto.scrypt` + random salt, never plain text)
- [x] Prevent one account name from being used by two people at once
- [x] Tie saved player data to the account instead of just the typed name

## Admin
- [ ] Admin panel (in-game admin commands or a separate tool)
- [ ] Support a dedicated admin account type with no character/class, restricted to administrative commands only (distinct from today's approach of flagging a regular player account as admin)
- [x] Reset a user's password (admin-only `resetpassword <username> <newpassword>` command; mark an account as admin by hand-setting `isAdmin: true` in its save-file entry until a real admin panel exists)
- [~] Deactivate / reactivate a user account — admin-only `deactivate <username>` / `reactivate <username>` commands; deactivating an online user disconnects them immediately and blocks login until reactivated

## World content
- [x] Add items players can pick up / drop (e.g. a rug, a bowling ball) — added a rug, bowling ball, and slice of pie so far; not persisted across server restarts yet
- [ ] Add NPCs to rooms (e.g. the Dude's landlord)
- [ ] Expand the Big Lebowski's mansion into multiple rooms (hallway, pool area, garage, etc.)
- [ ] Expand Maude's loft into multiple rooms
- [x] Add more rooms if the small set feels too cramped (added Sobchak Security so far)

## Character classes
- [x] Design a class system with The Dude, Walter, and Donny as the base classes
- [x] Define what makes each class distinct (each has 2 flavor/role-play commands for now; stats/abilities once combat exists)
- [x] Let players pick a class at character creation (numbered choice at login)
- [~] Add multiple welcome messages per class and pick one at random on each login — three per class now

## Items to create
- [ ] (add items here as we think of them)

## Main storyline
- [ ] Outline the story beats from the movie as an in-game quest line
- [ ] Add quest/story state tracking per player (which beats they've completed)
- [ ] Add story-triggering NPCs, items, or room events
- [ ] Story mode
- [ ] Force new players to play as the Dude on their first story mode playthrough (other classes unlock after)
- [ ] Unlock other classes once a player finishes story mode as the Dude
- [ ] Unlock PVP options once other classes are unlocked
- [ ] Story mode should branch per class instead of following one fixed path
- [ ] Base the story on popular fan theories rather than strict movie canon, and use it to fill in character backstories

## Gameplay commands
- [x] Inventory command (`inventory` / `i`) — lists carried items and persists per-player; always empty for now since there's nothing to pick up yet
- [x] Get/take and drop items — items no longer disappear from the room for everyone once one player picks them up; `unique` items (e.g. rug) cap at one per player and hide from that player's room listing once they have one, while `droppable: false` items (currently just the rug) can't be dropped at all; dropping more than one of a stackable item now prompts for how many to drop
- [x] Emotes (e.g. `smile`, `laugh`) — added smile, laugh, wave, nod, cry, dance, cheer, sigh, bow, clap
- [x] Help command listing available commands
- [x] Room-scoped "who's here" command, separate from global `who` (which lists everyone online) — note `look` already lists other players in the room via "Also here: ...", so this would be a quicker one-word alternative to a full room description; added as `here`
- [ ] Admin (or story-triggered) override to force-drop a normally non-droppable item like the rug ("special situations")

## Polish
- [x] Handle edge cases (empty names, duplicate names, disconnects mid-command) — added username character/length validation, a lock so two people can't register the same new username at once, and rejection of whitespace-only passwords
- [ ] Basic tests for room navigation and commands
- [ ] Colored/formatted output for terminal clients
- [ ] Mask password input while typing (show `*` per keystroke instead of the typed character; needs telnet echo-suppression); encrypt the connection before any public hosting, since passwords currently travel as plain text

## Deployment (long term)
- [ ] Move the server to Jonathan's home server
- [ ] Set up public hosting (open port/firewall, keep process running, point a doroyal.com subdomain to it)
- [ ] Daily 9am scheduled task: prompt Jonathan for 3 TODO items to work on that day, implement them on dev without committing/checking off (tabled — needs a git remote like GitHub first, since cloud scheduled agents can't see the local-only repo)
- [ ] Build a real deploy step for pushing a milestone from dev to prod (beyond just running `npm start` locally)
