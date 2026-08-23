# MUD Roadmap

Legend: `[ ]` not started · `[~]` built, awaiting your review · `[x]` done, confirmed

## Project identity
- [ ] Pick a real name for the game (currently just "the MUD")
- [~] Set up separate dev and prod versions via `NODE_ENV` (`npm run dev` = port 4001, `players.dev.json`, `-dev` version; `npm start` = port 4000, `players.json`)

## Foundation
- [x] Basic telnet server (login, look, movement, say, who, quit)
- [x] Project scaffolding (git, package.json, .gitignore)
- [x] Big Lebowski-themed world (7 rooms)

## Persistence
- [x] Save player data (name, location) to disk
- [x] Load player data back in on reconnect
- [x] Decide on simple storage format (e.g. JSON file) vs. a database

## Accounts
- [~] Move from name-only login to real accounts (username + password, with confirm-on-create; usernames are case-insensitive)
- [~] Store passwords securely (hashed with `crypto.scrypt` + random salt, never plain text)
- [~] Prevent one account name from being used by two people at once
- [~] Tie saved player data to the account instead of just the typed name

## Admin
- [ ] Admin panel (in-game admin commands or a separate tool)
- [ ] Reset a user's password
- [ ] Deactivate / reactivate a user account

## World content
- [ ] Add items players can pick up / drop (e.g. a rug, a bowling ball)
- [ ] Add NPCs to rooms (e.g. the Dude's landlord)
- [ ] Expand the Big Lebowski's mansion into multiple rooms (hallway, pool area, garage, etc.)
- [ ] Expand Maude's loft into multiple rooms
- [~] Add more rooms if the small set feels too cramped (added Sobchak Security so far)

## Character classes
- [~] Design a class system with The Dude, Walter, and Donny as the base classes
- [~] Define what makes each class distinct (each has 2 flavor/role-play commands for now; stats/abilities once combat exists)
- [~] Let players pick a class at character creation (numbered choice at login)
- [ ] Add multiple welcome messages per class and pick one at random on each login

## Items to create
- [ ] (add items here as we think of them)

## Main storyline
- [ ] Outline the story beats from the movie as an in-game quest line
- [ ] Add quest/story state tracking per player (which beats they've completed)
- [ ] Add story-triggering NPCs, items, or room events
- [ ] Story mode

## Gameplay commands
- [ ] Inventory command (`inventory` / `i`)
- [ ] Get/take and drop items
- [ ] Emotes (e.g. `smile`, `laugh`)
- [ ] Help command listing available commands

## Polish
- [ ] Handle edge cases (empty names, duplicate names, disconnects mid-command)
- [ ] Basic tests for room navigation and commands
- [ ] Colored/formatted output for terminal clients
- [ ] Hide password input while typing (needs telnet echo-suppression); encrypt the connection before any public hosting, since passwords currently travel as plain text

## Deployment (long term)
- [ ] Move the server to Jonathan's home server
- [ ] Set up public hosting (open port/firewall, keep process running, point a doroyal.com subdomain to it)
