# MUD Roadmap

## Foundation
- [x] Basic telnet server (login, look, movement, say, who, quit)
- [x] Project scaffolding (git, package.json, .gitignore)
- [x] Big Lebowski-themed world (7 rooms)

## Persistence
- [x] Save player data (name, location) to disk
- [x] Load player data back in on reconnect
- [x] Decide on simple storage format (e.g. JSON file) vs. a database

## Accounts
- [ ] Move from name-only login to real accounts (username + password)
- [ ] Store passwords securely (hashed, never plain text)
- [ ] Prevent one account name from being used by two people at once
- [ ] Tie saved player data to the account instead of just the typed name

## World content
- [ ] Add items players can pick up / drop (e.g. a rug, a bowling ball)
- [ ] Add NPCs to rooms (e.g. the Dude's landlord)
- [ ] Expand the Big Lebowski's mansion into multiple rooms (hallway, pool area, garage, etc.)
- [ ] Expand Maude's loft into multiple rooms
- [ ] Add more rooms if the small set feels too cramped

## Character classes
- [ ] Design a class system with The Dude, Walter, and Donny as the base classes
- [ ] Define what makes each class distinct (flavor/role-play command for now; stats/abilities once combat exists)
- [ ] Let players pick a class at character creation

## Items to create
- [ ] (add items here as we think of them)

## Main storyline
- [ ] Outline the story beats from the movie as an in-game quest line
- [ ] Add quest/story state tracking per player (which beats they've completed)
- [ ] Add story-triggering NPCs, items, or room events

## Gameplay commands
- [ ] Inventory command (`inventory` / `i`)
- [ ] Get/take and drop items
- [ ] Emotes (e.g. `smile`, `laugh`)
- [ ] Help command listing available commands

## Polish
- [ ] Handle edge cases (empty names, duplicate names, disconnects mid-command)
- [ ] Basic tests for room navigation and commands
- [ ] Colored/formatted output for terminal clients
