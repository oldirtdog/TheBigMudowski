# The Big MUDowski

A telnet-based multiplayer text adventure (a "MUD," short for Multi-User Dungeon) themed around *The Big Lebowski*. Players connect over a plain telnet connection, log into an account, pick a character class, and walk around a small text-based world, talking to and seeing other connected players.

This file is a reference for how the project is put together today. The running list of what's done, in progress, and planned lives in [TODO.md](TODO.md).

## Running It

There are two ways to run the server, controlled by the `NODE_ENV` environment variable:

| Command | Environment | Port | Save file |
|---|---|---|---|
| `npm run dev` | development | 4001 | `players.dev.json` |
| `npm start` | production | 4000 | `players.json` |

Default to `npm run dev` for anything you're testing or building. Only use `npm start` (production) when you're intentionally deploying a milestone.

To connect as a player once the server is running:

```bash
telnet localhost 4001
```

(swap `4001` for `4000` if you're connecting to the production server)

## How Login Works

1. **Enter a username.** Usernames must be 2-20 characters: letters, numbers, or underscores only.
   - If the username already belongs to a saved account, you're asked for a **password** (3 attempts before the connection is dropped).
   - If it's a new username, you're asked to **choose a password**, then **confirm** it. The password is never stored as plain text — it's hashed with a random salt (via Node's `crypto.scrypt`) and only the hash is saved.
2. **Choose a class** (first login only): The Dude, Walter, or Donny. This is a one-time choice tied to the account.
3. You land in your class's starting room (or wherever you last logged out, if you've played before).

A couple of safety nets are built into this flow:
- Two people can't be logged into the same account at once.
- Two people can't register the same brand-new username at the same moment (the second one is told to pick something else, rather than silently overwriting the first).

## Character Classes

Defined in [classes.js](classes.js). Each has a starting room and two flavor/role-play commands (no stats or combat yet — that's future work per the roadmap).

| Class | Description | Commands |
|---|---|---|
| The Dude | Takes it easy. Prefers not to be hassled. | `abide`, `drink` |
| Walter | Has rules, and by God, people are going to follow them. | `rules`, `rant` |
| Donny | A little out of the loop, but always up for a frame. | `confused`, `shrug` |

## The World

Defined in [world.js](world.js) — 7 rooms connected by directional exits (north/south/east/west): the Dude's Apartment, the Strip Mall Parking Lot, the Bowling Alley, Sobchak Security, the Diner, the Big Lebowski's Study, Maude's Loft, and Treehorn's Mansion.

## Commands

**Everyone:**
- `look` / `l` — describe the current room
- `north` / `south` / `east` / `west` (or `n` / `s` / `e` / `w`) — move
- `say <message>` — speak to the room
- `who` — list who's currently online
- `inventory` / `i` — list what you're carrying (there's nothing to pick up yet, so this is currently always empty — it's groundwork for the item system on the roadmap)
- `quit` — disconnect

**Class-specific:** see the table above.

**Admin only:**
- `resetpassword <username> <newpassword>` — resets another account's password. Only works for accounts with `isAdmin: true` in their saved data (see below). Non-admins typing this get the same generic "unknown command" response anyone gets for a made-up command.

## Accounts & Admin

Accounts are stored keyed by lowercase username in the save file (see below). To grant someone admin rights today, hand-edit their entry in the save file and add `"isAdmin": true`. There's no in-game way to do this yet — that's the planned "admin panel" item on the roadmap.

## Data & Persistence

Player accounts and progress are stored as JSON in `players.dev.json` (dev) or `players.json` (prod) — see [persistence.js](persistence.js) for the load/save logic. Both files are git-ignored, since they contain real password hashes; they only ever live on the machine running the server. Each account entry looks like:

```json
{
  "username": "jonathan",
  "salt": "...",
  "passwordHash": "...",
  "roomId": "parking_lot",
  "className": "walter",
  "isAdmin": true,
  "inventory": []
}
```

## File Overview

| File | Purpose |
|---|---|
| [server.js](server.js) | The telnet server itself — handles connections, login, and all in-game commands |
| [world.js](world.js) | Room definitions and exits |
| [classes.js](classes.js) | Character class definitions and their commands |
| [auth.js](auth.js) | Password hashing and verification (`crypto.scrypt`) |
| [persistence.js](persistence.js) | Loads/saves player account data to disk |
| [package.json](package.json) | Project metadata and the `npm start` / `npm run dev` scripts |
| [TODO.md](TODO.md) | The living roadmap/checklist for the project |

## Roadmap

See [TODO.md](TODO.md) for the full checklist. It uses three states: `[ ]` not started, `[~]` built but awaiting review, `[x]` done and confirmed.

---
Author: Jonathan Marlowe
Company: Archetype SC
