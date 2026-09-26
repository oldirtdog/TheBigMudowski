# The Big MUDowski

A telnet-based multiplayer text adventure (a "MUD," short for Multi-User Dungeon) themed around *The Big Lebowski*. Players connect over a plain telnet connection, log in (with a password or through WorkOS), and walk around a small text-based world as The Dude, talking to and seeing other connected players.

This file is a reference for how the project is put together today. The running list of what's done, in progress, and planned lives in [TODO.md](TODO.md).

## Running It

There are two ways to run the server, controlled by the `NODE_ENV` environment variable:

| Command | Environment | Port | Save file |
|---|---|---|---|
| `npm run dev` | development | 4001 | `players.dev.json` |
| `npm start` | production | 4000 | `players.json` |

Default to `npm run dev` for anything you're testing or building. Only use `npm start` (production) when you're intentionally deploying a milestone. Production runs on mudhaven.net; [deploy.sh](deploy.sh) pulls the latest commit there and restarts the service.

To connect as a player once the server is running:

```bash
telnet localhost 4001
```

(swap `4001` for `4000` if you're connecting to the production server)

### Settings (`.env`)

The server reads settings from a `.env` file in the project folder, if there is one. It's git-ignored, so it never goes to GitHub. Copy [.env.example](.env.example) to `.env` and fill it in:

- `WORKOS_CLIENT_ID` — the WorkOS Client ID used for WorkOS logins (WorkOS dashboard > API Keys). Use the **Staging** environment's ID on your dev machine and the **Production** one on the prod host. Without it, password logins still work and WorkOS logins show a "not set up" message.

## How Login Works

The first prompt is `Login (or type 'w' to sign in with WorkOS):`.

**Password login** — type a username (2-20 characters: letters, numbers, or underscores).
- If the account exists, you're asked for its **password** (3 attempts before the connection is dropped).
- If it doesn't, you're asked whether to create it, then to **choose** and **confirm** a password. Passwords are never stored as plain text — they're hashed with a random salt (via Node's `crypto.scrypt`) and only the hash is saved.
- Password typing is hidden on screen. The server uses telnet's standard echo setting to tell the client not to display it ([RFC 857](https://www.rfc-editor.org/rfc/rfc857)). This hides the password but doesn't encrypt it; it still travels over the network as plain text.

**WorkOS login** — type `w`. The server shows a link and a short code; open the link in any browser, sign in with WorkOS, and the MUD logs you in once WorkOS confirms (it checks every few seconds; type `cancel` to go back). This uses WorkOS's [CLI Auth](https://workos.com/docs/authkit/cli-auth) (OAuth device code) flow, which is built for programs without a browser. The first time, you choose a character name. WorkOS characters have no MUD password; they always sign in with `w`.

New characters start as **The Dude** in the Dude's Apartment. Returning players land wherever they last logged out.

Safety nets built into this flow:
- Two people can't be logged into the same account at once.
- Two people can't claim the same new name at the same moment.
- Logging out is immediate: `quit`, being deactivated or deleted, or too many wrong passwords all close the connection from the server's side, even if the player's client never hangs up. TCP keepalive also catches connections that silently die (Wi-Fi drops, laptop sleeps) so those players don't stay logged in.

## Character Classes

Defined in [classes.js](classes.js). Everyone starts as The Dude; the other classes are kept for characters meant to be unlocked through the story later. Each has a starting room and two flavor/role-play commands (no stats or combat yet — that's future work per the roadmap).

| Class | Description | Commands | Available |
|---|---|---|---|
| The Dude | Takes it easy. Prefers not to be hassled. | `abide`, `drink` | At start |
| Walter | Has rules, and by God, people are going to follow them. | `rules`, `rant` | Not yet |
| Donny | A little out of the loop, but always up for a frame. | `confused`, `shrug` | Not yet |

## The World

Defined in [world.js](world.js) — 8 rooms connected by directional exits (north/south/east/west): the Dude's Apartment, the Strip Mall Parking Lot, the Bowling Alley, Sobchak Security, the Diner, the Big Lebowski's Study, Maude's Loft, and Treehorn's Mansion.

Rooms can hold items that players pick up and drop. Item rules live in [items.js](items.js) — for example, the rug is unique (you can only carry one) and can't be dropped.

## Commands

Most commands have a one-letter shortcut, shown in brackets in the in-game `help`. Shortcuts are assigned automatically: each command gets its first letter, or if that's taken, its second, and so on, in list order. Movement, `look`, and `inventory` keep their long-standing letters.

**Everyone:**

| Command | Shortcut | What it does |
|---|---|---|
| `look` | `l` | Describe the current room |
| `north` / `south` / `east` / `west` | `n` / `s` / `e` / `w` | Move |
| `inventory` | `i` | List what you're carrying |
| `help` | `h` | Show the command list |
| `say <message>` | `a` | Speak to the room |
| `get <item>` (or `take`) | `g` | Pick up an item |
| `drop <item>` | `d` | Drop an item |
| `who` | `o` | List who's online |
| `here` | `r` | List who else is in the room |
| `quit` | `q` | Log out and disconnect |

**Emotes** (full words only, no shortcuts): `smile`, `laugh`, `wave`, `nod`, `cry`, `dance`, `cheer`, `sigh`, `bow`, `clap` — defined in [emotes.js](emotes.js).

**Class-specific:** see the table above (also full words only).

## Accounts & Admin

Accounts are stored keyed by lowercase username in the save file (see below).

**The admin account.** Logging in with the username `admin` opens a restricted admin console instead of the game — no character or room. It always uses a local password, so it works even if WorkOS is down. The first time anyone logs in as `admin`, they're offered the chance to create it. **After wiping a save file, log in as `admin` yourself right away** so no one else can claim it.

Admin console commands (choose by number, shortcut letter, or name):

| Command | Shortcut | What it does |
|---|---|---|
| `resetpassword <username>` | `r` | Set a new password for a password account (prompts for it, hidden) |
| `deactivate <username>` | `d` | Block an account from logging in and disconnect them if online |
| `reactivate <username>` | `e` | Undo a deactivation |
| `deleteuser <username>` | `l` | Permanently delete an account (you retype the username to confirm) |
| `who` | `w` | List who's online |
| `help` | `h` | Show the command list |
| `quit` | `q` | Disconnect |

WorkOS characters don't have MUD passwords, so `resetpassword` doesn't apply to them — their passwords are managed in WorkOS. Deleting a WorkOS character removes the character only; the person's WorkOS account still exists, so they could sign in again and make a new character.

A regular player can also be given admin commands in-game by hand-editing their save-file entry to add `"isAdmin": true`. In the game they type admin commands in full (the shortcut letters above only work in the admin console).

## Data & Persistence

Player accounts and progress are stored as JSON in `players.dev.json` (dev) or `players.json` (prod) — see [persistence.js](persistence.js) for the load/save logic. Both files are git-ignored, since they contain password hashes; they only ever live on the machine running the server.

A password account looks like:

```json
{
  "username": "Jackie_T",
  "salt": "...",
  "passwordHash": "...",
  "className": "dude",
  "roomId": "dude_apartment",
  "inventory": [],
  "isAdmin": false
}
```

A WorkOS account stores the person's WorkOS user ID instead of a password (no email or other personal details are saved):

```json
{
  "username": "Bunny_L",
  "workosUserId": "user_...",
  "className": "dude",
  "roomId": "dude_apartment",
  "inventory": [],
  "isAdmin": false
}
```

## File Overview

| File | Purpose |
|---|---|
| [server.js](server.js) | The telnet server itself — handles connections, login, and all in-game and admin commands |
| [workos.js](workos.js) | Talks to WorkOS for the `w` login (device code flow) |
| [auth.js](auth.js) | Password hashing and verification (`crypto.scrypt`) |
| [world.js](world.js) | Room definitions, exits, and starting items |
| [classes.js](classes.js) | Character class definitions and their commands |
| [emotes.js](emotes.js) | Emotes available to every player |
| [items.js](items.js) | Item rules (unique, droppable) |
| [persistence.js](persistence.js) | Loads/saves player account data to disk |
| [deploy.sh](deploy.sh) | Run on the prod host to pull the latest commit and restart the server |
| [.env.example](.env.example) | Template for the git-ignored `.env` settings file |
| [package.json](package.json) | Project metadata and the `npm start` / `npm run dev` scripts |
| [TODO.md](TODO.md) | The living roadmap/checklist for the project |

## Roadmap

See [TODO.md](TODO.md) for the full checklist. It uses three states: `[ ]` not started, `[~]` built but awaiting review, `[x]` done and confirmed.

---
Author: Jonathan Marlowe
Company: Archetype SC
