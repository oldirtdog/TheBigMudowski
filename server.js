const net = require('net');
const path = require('path');

// Load settings like WORKOS_CLIENT_ID from a local .env file, if there is one (it's git-ignored).
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const { rooms } = require('./world');
const { loadPlayers, savePlayers } = require('./persistence');
const { CLASSES } = require('./classes');
const { EMOTES } = require('./emotes');
const { isUnique, isDroppable } = require('./items');
const { hashPassword, verifyPassword } = require('./auth');
const workos = require('./workos');
const { version: pkgVersion } = require('./package.json');

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = IS_PROD ? 4000 : 4001;
const VERSION = IS_PROD ? pkgVersion : `${pkgVersion}-dev`;
const MAX_PASSWORD_ATTEMPTS = 3;
const KEEPALIVE_DELAY_MS = 60 * 1000;
const STARTING_CLASS_ID = 'dude';
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,20}$/;

// All connected players, keyed by socket.
const players = new Map();

// Saved player data keyed by name, e.g. { Dude: { roomId: 'lanes' } }.
const savedPlayers = loadPlayers();

// Character names currently mid-creation (name chosen, class not picked yet),
// so two people can't grab the same new name at once and clobber each other's character.
const pendingUsernames = new Set();

// Telnet control codes. A client that receives "IAC WILL ECHO" stops showing what the player types,
// which is how telnet hides passwords; "IAC WONT ECHO" turns normal typing display back on.
// See RFC 854 (telnet) and RFC 857 (echo): https://www.rfc-editor.org/rfc/rfc857
const IAC = 255;
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;
const SB = 250;
const SE = 240;
const ECHO = 1;

// Shows a prompt and hides the player's next line of typing (for passwords).
function promptHidden(socket, text) {
  socket.write(text);
  socket.write(Buffer.from([IAC, WILL, ECHO]));
  socket.hidingInput = true;
}

// Removes telnet control codes (like a client's reply to IAC WILL ECHO) so they don't end up mixed into typed text.
function stripTelnetCommands(data) {
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== IAC) {
      out.push(data[i]);
      continue;
    }
    const cmd = data[i + 1];
    if (cmd === IAC) {
      out.push(IAC); // an escaped literal 255 byte
      i += 1;
    } else if (cmd >= WILL && cmd <= DONT) {
      i += 2; // three-byte option negotiation, e.g. IAC DO ECHO
    } else if (cmd === SB) {
      const end = data.indexOf(SE, i);
      i = end === -1 ? data.length : end; // skip a whole subnegotiation block
    } else {
      i += 1;
    }
  }
  return Buffer.from(out);
}

// Sends a last message and closes the connection. end() on its own only asks the player's client to hang up,
// and a client that never does would stay logged in; destroy() closes our side once the message is sent,
// which fires the socket's 'close' handler and logs the player out right away.
function disconnect(socket, message) {
  socket.end(message, () => socket.destroy());
}

function describeRoom(room, viewer) {
  const exits = Object.keys(room.exits).join(', ') || 'none';
  const others = [...room.players]
    .filter((p) => p !== viewer)
    .map((p) => p.name);
  const visibleItems = room.items.filter((item) => {
    const alreadyCarrying = viewer.inventory.some((i) => i.toLowerCase() === item.toLowerCase());
    return !(isUnique(item) && alreadyCarrying);
  });
  let text = `\r\n${room.name}\r\n${room.description}\r\nExits: ${exits}\r\n`;
  if (visibleItems.length > 0) {
    text += `Items here: ${visibleItems.join(', ')}\r\n`;
  }
  if (others.length > 0) {
    text += `Also here: ${others.join(', ')}\r\n`;
  }
  return text;
}

// Gives each command a one-letter shortcut: its first letter, or if that's already taken, its second, and so on.
// Commands listed with a `shortcut` keep it, and earlier commands in the list get first pick.
// Returns a lookup from shortcut letter to command name.
function assignShortcuts(commands) {
  const taken = new Set(commands.filter((c) => c.shortcut).map((c) => c.shortcut));
  for (const c of commands) {
    if (c.shortcut) continue;
    const letter = [...c.command].find((ch) => !taken.has(ch));
    if (letter) {
      c.shortcut = letter;
      taken.add(letter);
    }
  }
  return Object.fromEntries(commands.filter((c) => c.shortcut).map((c) => [c.shortcut, c.command]));
}

// Shows a command with its shortcut letter in brackets, e.g. "s[a]y".
function withShortcut(c) {
  if (!c.shortcut) return c.command;
  const i = c.command.indexOf(c.shortcut);
  return `${c.command.slice(0, i)}[${c.shortcut}]${c.command.slice(i + 1)}`;
}

const DIRECTIONS = ['north', 'south', 'east', 'west'];

// Everyday player commands, in the order shown in help (which is also the order they pick shortcut letters).
// Emotes and class actions don't get shortcuts, so a stray letter can't set one off by accident.
const PLAYER_COMMANDS = [
  { command: 'look', shortcut: 'l', description: 'look around the room' },
  { command: 'north', shortcut: 'n' },
  { command: 'south', shortcut: 's' },
  { command: 'east', shortcut: 'e' },
  { command: 'west', shortcut: 'w' },
  { command: 'inventory', shortcut: 'i', description: 'list what you are carrying' },
  { command: 'help', description: 'show this list' },
  { command: 'say', args: '<message>', description: 'say something out loud' },
  { command: 'get', args: '<item>', description: 'pick up an item from the room (also: take)' },
  { command: 'drop', args: '<item>', description: 'drop an item you are carrying' },
  { command: 'who', description: 'list who is online' },
  { command: 'here', description: 'list who else is in this room' },
  { command: 'quit', description: 'disconnect' },
];
const PLAYER_SHORTCUTS = assignShortcuts(PLAYER_COMMANDS);

function formatCommandUsage(c) {
  return c.args ? `${withShortcut(c)} ${c.args}` : withShortcut(c);
}

function buildHelpText(player) {
  const lines = ['Commands (the letter in [brackets] is a shortcut):'];
  for (const c of PLAYER_COMMANDS) {
    if (DIRECTIONS.includes(c.command)) {
      // Show the four directions together on one line.
      if (c.command === DIRECTIONS[0]) {
        const moves = PLAYER_COMMANDS.filter((d) => DIRECTIONS.includes(d.command)).map(withShortcut).join('/');
        lines.push(`  ${moves.padEnd(32)} - move between rooms`);
      }
      continue;
    }
    lines.push(`  ${formatCommandUsage(c).padEnd(32)} - ${c.description}`);
  }
  lines.push('', 'Emotes:', `  ${EMOTES.map((e) => e.command).join(', ')}`);
  const playerClass = CLASSES[player.className];
  if (playerClass) {
    lines.push('', `${playerClass.label} commands:`);
    for (const c of playerClass.commands) {
      lines.push(`  ${c.command.padEnd(31)} - ${c.description || ''}`);
    }
  }
  if (player.isAdmin) {
    lines.push('', 'Admin commands:');
    lines.push('  resetpassword <username>        - reset a user\'s password');
    lines.push('  deactivate <username>           - deactivate a user\'s account and disconnect them if online');
    lines.push('  reactivate <username>           - reactivate a deactivated account');
    lines.push('  deleteuser <username>           - permanently delete a user\'s account (asks you to confirm)');
  }
  return lines.join('\r\n');
}

function formatPlayerForWho(p) {
  if (p.accountType === 'admin') {
    return `${p.name} (Admin)`;
  }
  return `${p.name} (${CLASSES[p.className].label})`;
}

function runResetPassword(player, rest) {
  if (!player.isAdmin) {
    player.socket.write('Unknown command: "resetpassword"\r\n> ');
    return;
  }
  const [targetName] = rest;
  if (!targetName) {
    player.socket.write('Usage: resetpassword <username>\r\n> ');
    return;
  }
  const targetKey = targetName.toLowerCase();
  const target = savedPlayers[targetKey];
  if (!target || !target.passwordHash) {
    player.socket.write(`No password account found for "${targetName}".\r\n> `);
    return;
  }
  player.pendingPasswordReset = targetKey;
  promptHidden(player.socket, `New password for ${target.username} (or press Enter to cancel): `);
}

// Finishes a resetpassword command once the admin has typed the new password.
function finishPasswordReset(player, newPassword) {
  const targetKey = player.pendingPasswordReset;
  player.pendingPasswordReset = null;
  if (!newPassword.trim()) {
    player.socket.write('Password reset cancelled.\r\n> ');
    return;
  }
  const target = savedPlayers[targetKey];
  const { salt, hash } = hashPassword(newPassword);
  savedPlayers[targetKey] = { ...target, salt, passwordHash: hash };
  savePlayers(savedPlayers);
  player.socket.write(`Password reset for ${target.username}.\r\n> `);
}

function runDeactivate(player, rest) {
  if (!player.isAdmin) {
    player.socket.write('Unknown command: "deactivate"\r\n> ');
    return;
  }
  const [targetName] = rest;
  if (!targetName) {
    player.socket.write('Usage: deactivate <username>\r\n> ');
    return;
  }
  const targetKey = targetName.toLowerCase();
  const target = savedPlayers[targetKey];
  if (!target || target.accountType === 'admin') {
    player.socket.write(`No account found for "${targetName}".\r\n> `);
    return;
  }
  savedPlayers[targetKey] = { ...target, active: false };
  savePlayers(savedPlayers);
  const onlineTarget = [...players.values()].find((p) => p.key === targetKey);
  if (onlineTarget) {
    disconnect(onlineTarget.socket, '\r\nYour account has been deactivated. Goodbye.\r\n');
  }
  player.socket.write(`Account "${target.username}" deactivated.\r\n> `);
}

function runReactivate(player, rest) {
  if (!player.isAdmin) {
    player.socket.write('Unknown command: "reactivate"\r\n> ');
    return;
  }
  const [targetName] = rest;
  if (!targetName) {
    player.socket.write('Usage: reactivate <username>\r\n> ');
    return;
  }
  const targetKey = targetName.toLowerCase();
  const target = savedPlayers[targetKey];
  if (!target || target.accountType === 'admin') {
    player.socket.write(`No account found for "${targetName}".\r\n> `);
    return;
  }
  savedPlayers[targetKey] = { ...target, active: true };
  savePlayers(savedPlayers);
  player.socket.write(`Account "${target.username}" reactivated.\r\n> `);
}

function runDeleteUser(player, rest) {
  if (!player.isAdmin) {
    player.socket.write('Unknown command: "deleteuser"\r\n> ');
    return;
  }
  const [targetName] = rest;
  if (!targetName) {
    player.socket.write('Usage: deleteuser <username>\r\n> ');
    return;
  }
  const targetKey = targetName.toLowerCase();
  const target = savedPlayers[targetKey];
  if (!target || target.accountType === 'admin') {
    player.socket.write(`No account found for "${targetName}".\r\n> `);
    return;
  }
  if (targetKey === player.key) {
    player.socket.write("You can't delete your own account.\r\n> ");
    return;
  }
  player.pendingDelete = targetKey;
  player.socket.write(`This permanently deletes ${target.username} and everything they've saved. It can't be undone.\r\nType the username again to confirm, or anything else to cancel: `);
}

// Finishes a deleteuser command once the admin has retyped the username to confirm.
function finishDeleteUser(player, input) {
  const targetKey = player.pendingDelete;
  player.pendingDelete = null;
  const target = savedPlayers[targetKey];
  if (!target || input.trim().toLowerCase() !== targetKey) {
    player.socket.write('Delete cancelled.\r\n> ');
    return;
  }
  const onlineTarget = [...players.values()].find((p) => p.key === targetKey);
  if (onlineTarget) {
    // Flag them so logging out doesn't save their character right back into the file.
    onlineTarget.deleted = true;
    disconnect(onlineTarget.socket, '\r\nYour account has been deleted. Goodbye.\r\n');
  }
  delete savedPlayers[targetKey];
  savePlayers(savedPlayers);
  player.socket.write(`Account "${target.username}" deleted.\r\n> `);
}

const ADMIN_COMMANDS = [
  { command: 'resetpassword', args: '<username>', description: "reset a user's password" },
  { command: 'deactivate', args: '<username>', description: "deactivate a user's account and disconnect them if online" },
  { command: 'reactivate', args: '<username>', description: 'reactivate a deactivated account' },
  { command: 'deleteuser', args: '<username>', description: "permanently delete a user's account (asks you to confirm)" },
  { command: 'who', description: 'list who is online' },
  { command: 'help', description: 'show this menu' },
  { command: 'quit', description: 'disconnect' },
];
const ADMIN_SHORTCUTS = assignShortcuts(ADMIN_COMMANDS);

function buildAdminMenuText() {
  const lines = ['Admin console. Choose a command by number or [shortcut] letter, or type it out:'];
  ADMIN_COMMANDS.forEach((c, i) => lines.push(`  ${i + 1}. ${formatCommandUsage(c)}`));
  return lines.join('\r\n');
}

function buildAdminHelpText() {
  const lines = ['Admin console commands:'];
  ADMIN_COMMANDS.forEach((c, i) => lines.push(`  ${i + 1}. ${formatCommandUsage(c).padEnd(45)} - ${c.description}`));
  return lines.join('\r\n');
}

function handleAdminCommand(player, line) {
  const input = line.trim();
  if (!input) {
    player.socket.write('> ');
    return;
  }
  const [rawCmd, ...rest] = input.split(/\s+/);
  const menuIndex = parseInt(rawCmd, 10);
  const cmd = (!isNaN(menuIndex) && ADMIN_COMMANDS[menuIndex - 1])
    ? ADMIN_COMMANDS[menuIndex - 1].command
    : ADMIN_SHORTCUTS[rawCmd.toLowerCase()] || rawCmd;

  switch (cmd.toLowerCase()) {
    case 'resetpassword':
      runResetPassword(player, rest);
      break;

    case 'deactivate':
      runDeactivate(player, rest);
      break;

    case 'reactivate':
      runReactivate(player, rest);
      break;

    case 'deleteuser':
      runDeleteUser(player, rest);
      break;

    case 'who': {
      const names = [...players.values()].map(formatPlayerForWho).join(', ');
      player.socket.write(`Online: ${names}\r\n> `);
      break;
    }

    case 'help':
      player.socket.write(`\r\n${buildAdminHelpText()}\r\n> `);
      break;

    case 'quit':
      disconnect(player.socket, 'Goodbye!\r\n');
      break;

    default:
      player.socket.write(`Unknown command: "${cmd}"\r\n> `);
  }
}

function broadcastToRoom(room, message, exceptSocket) {
  for (const player of room.players) {
    if (player.socket !== exceptSocket) {
      player.socket.write(`\r\n${message}\r\n> `);
    }
  }
}

function dropItems(player, room, itemName, count) {
  for (let i = 0; i < count; i++) {
    const idx = player.inventory.findIndex((it) => it.toLowerCase() === itemName.toLowerCase());
    if (idx !== -1) {
      player.inventory.splice(idx, 1);
    }
  }
  const alreadyHere = room.items.some((i) => i.toLowerCase() === itemName.toLowerCase());
  if (!alreadyHere) {
    room.items.push(itemName);
  }
  const description = count > 1 ? `${count} of the ${itemName}` : `the ${itemName}`;
  broadcastToRoom(room, `${player.name} drops ${description}.`, player.socket);
  player.socket.write(`You drop ${description}.\r\n> `);
}

function handleCommand(player, line) {
  const input = line.trim();
  if (!input) {
    player.socket.write('> ');
    return;
  }
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(' ');
  const room = rooms[player.roomId];
  const playerClass = CLASSES[player.className];
  const classCommand = playerClass && playerClass.commands.find((c) => c.command === cmd.toLowerCase());

  if (classCommand) {
    const message = classCommand.action(player);
    broadcastToRoom(room, message, player.socket);
    player.socket.write(`${message}\r\n> `);
    return;
  }

  const emote = EMOTES.find((e) => e.command === cmd.toLowerCase());
  if (emote) {
    const message = emote.action(player);
    broadcastToRoom(room, message, player.socket);
    player.socket.write(`${message}\r\n> `);
    return;
  }

  const command = PLAYER_SHORTCUTS[cmd.toLowerCase()] || cmd.toLowerCase();
  switch (command) {
    case 'look':
      player.socket.write(describeRoom(room, player) + '> ');
      break;

    case 'north':
    case 'south':
    case 'east':
    case 'west': {
      const direction = command;
      const destId = room.exits[direction];
      if (!destId) {
        player.socket.write(`You can't go that way.\r\n> `);
        break;
      }
      room.players.delete(player);
      broadcastToRoom(room, `${player.name} leaves ${direction}.`);
      player.roomId = destId;
      const newRoom = rooms[destId];
      newRoom.players.add(player);
      broadcastToRoom(newRoom, `${player.name} arrives.`, player.socket);
      player.socket.write(describeRoom(newRoom, player) + '> ');
      break;
    }

    case 'say': {
      if (!arg) {
        player.socket.write('Say what?\r\n> ');
        break;
      }
      broadcastToRoom(room, `${player.name} says, "${arg}"`, player.socket);
      player.socket.write(`You say, "${arg}"\r\n> `);
      break;
    }

    case 'inventory': {
      if (player.inventory.length === 0) {
        player.socket.write("You aren't carrying anything.\r\n> ");
      } else {
        player.socket.write(`You are carrying: ${player.inventory.join(', ')}\r\n> `);
      }
      break;
    }

    case 'get':
    case 'take': {
      if (!arg) {
        player.socket.write('Get what?\r\n> ');
        break;
      }
      const item = room.items.find((i) => i.toLowerCase() === arg.toLowerCase());
      if (!item) {
        player.socket.write(`There's no ${arg} here.\r\n> `);
        break;
      }
      const alreadyCarrying = player.inventory.some((i) => i.toLowerCase() === item.toLowerCase());
      if (isUnique(item) && alreadyCarrying) {
        player.socket.write(`You already have a ${item}.\r\n> `);
        break;
      }
      player.inventory.push(item);
      broadcastToRoom(room, `${player.name} picks up the ${item}.`, player.socket);
      player.socket.write(`You pick up the ${item}.\r\n> `);
      break;
    }

    case 'drop': {
      if (!arg) {
        player.socket.write('Drop what?\r\n> ');
        break;
      }
      const matches = player.inventory.filter((i) => i.toLowerCase() === arg.toLowerCase());
      if (matches.length === 0) {
        player.socket.write(`You aren't carrying a ${arg}.\r\n> `);
        break;
      }
      const itemName = matches[0];
      if (!isDroppable(itemName)) {
        player.socket.write(`You can't drop the ${itemName}.\r\n> `);
        break;
      }
      if (matches.length === 1) {
        dropItems(player, room, itemName, 1);
        break;
      }
      player.pendingDrop = { itemName, available: matches.length };
      player.socket.write(`You have ${matches.length} of "${itemName}". How many would you like to drop? (1-${matches.length}, or "cancel"): `);
      break;
    }

    case 'help':
      player.socket.write(`\r\n${buildHelpText(player)}\r\n> `);
      break;

    case 'resetpassword':
      runResetPassword(player, rest);
      break;

    case 'deactivate':
      runDeactivate(player, rest);
      break;

    case 'reactivate':
      runReactivate(player, rest);
      break;

    case 'deleteuser':
      runDeleteUser(player, rest);
      break;

    case 'who': {
      const names = [...players.values()].map(formatPlayerForWho).join(', ');
      player.socket.write(`Online: ${names}\r\n> `);
      break;
    }

    case 'here': {
      const others = [...room.players]
        .filter((p) => p !== player)
        .map(formatPlayerForWho);
      if (others.length === 0) {
        player.socket.write("No one else is here.\r\n> ");
      } else {
        player.socket.write(`Here: ${others.join(', ')}\r\n> `);
      }
      break;
    }

    case 'quit':
      disconnect(player.socket, 'Goodbye!\r\n');
      break;

    default:
      player.socket.write(`Unknown command: "${cmd}"\r\n> `);
  }
}

const server = net.createServer((socket) => {
  // Have the operating system check in on idle connections, so a player whose connection silently dies
  // (Wi-Fi drops, laptop sleeps) is eventually detected as gone and logged out instead of lingering.
  socket.setKeepAlive(true, KEEPALIVE_DELAY_MS);
  let stage = 'login_menu';
  let player = null;
  let buffer = '';
  let pendingKey = null;
  let pendingName = null;
  let pendingPassword = null;
  let pendingWorkosUserId = null;
  // The new name this connection has reserved in pendingUsernames, if any, so it's released on disconnect.
  let reservedName = null;
  let passwordAttempts = 0;
  // The in-progress WorkOS login, if any. Setting .cancelled stops its polling (on 'cancel' or disconnect).
  let workosAttempt = null;

  // Everyone starts as The Dude; other characters are meant to be unlocked through the story later.
  function createCharacter(credentials) {
    const startClass = CLASSES[STARTING_CLASS_ID];
    // Save right away so the new account exists even if the server stops unexpectedly.
    savedPlayers[pendingKey] = {
      username: pendingName,
      ...credentials,
      className: startClass.id,
      roomId: startClass.startRoomId,
      inventory: [],
    };
    savePlayers(savedPlayers);
    pendingUsernames.delete(pendingKey);
    finishLogin(pendingKey, pendingName, startClass.id, startClass.startRoomId, false, []);
  }

  function promptLoginMenu() {
    socket.write("Login (or type 'w' to sign in with WorkOS): ");
  }

  socket.write(`Welcome to The Big MUDowski! (v${VERSION})\r\n`);
  promptLoginMenu();

  function finishLogin(key, name, className, roomId, isAdmin, inventory) {
    player = {
      key,
      name,
      socket,
      roomId,
      className,
      isAdmin: !!isAdmin,
      inventory: Array.isArray(inventory) ? inventory : [],
      pendingDrop: null,
      pendingPasswordReset: null,
      pendingDelete: null,
    };
    players.set(socket, player);
    rooms[roomId].players.add(player);
    stage = 'playing';
    const welcomeMessages = CLASSES[className].welcomeMessages;
    const welcomeMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    socket.write(`\r\n${welcomeMessage(player)}\r\n`);
    socket.write(describeRoom(rooms[roomId], player) + '> ');
    broadcastToRoom(rooms[roomId], `${name} arrives.`, socket);
  }

  function finishAdminLogin(key, name) {
    player = {
      key,
      name,
      socket,
      accountType: 'admin',
      isAdmin: true,
      roomId: null,
      className: null,
      inventory: [],
      pendingDrop: null,
      pendingPasswordReset: null,
      pendingDelete: null,
    };
    players.set(socket, player);
    stage = 'admin';
    socket.write(`\r\n${buildAdminMenuText()}\r\n> `);
  }

  function findKeyByWorkosUserId(workosUserId) {
    return Object.keys(savedPlayers).find((k) => savedPlayers[k].workosUserId === workosUserId);
  }

  function backToLoginMenu(message) {
    stage = 'login_menu';
    pendingKey = null;
    pendingName = null;
    socket.write(`${message}\r\n`);
    promptLoginMenu();
  }

  // Runs the WorkOS device-code login: show the player a link and code, then check back
  // every few seconds until they've signed in, declined, or the code expires.
  async function startWorkosLogin() {
    if (!workos.isConfigured()) {
      console.error('WorkOS login attempted but WORKOS_CLIENT_ID is not set.');
      backToLoginMenu('Login is not set up on this server yet. Please try again later.');
      return;
    }
    const attempt = { cancelled: false };
    workosAttempt = attempt;
    stage = 'workos_waiting';

    let auth;
    try {
      auth = await workos.startDeviceLogin();
    } catch (err) {
      console.error('WorkOS login failed to start:', err.message);
      if (attempt.cancelled) return;
      workosAttempt = null;
      backToLoginMenu("Couldn't reach the login service right now. Please try again in a moment.");
      return;
    }
    if (attempt.cancelled) return;

    socket.write(
      `\r\nTo log in, open this link in any web browser:\r\n  ${auth.verification_uri_complete}\r\n` +
      `and make sure it shows this code: ${auth.user_code}\r\n` +
      "Waiting for you to finish signing in... (type 'cancel' to go back)\r\n"
    );

    let intervalMs = (auth.interval || 5) * 1000;
    const expiresAt = Date.now() + (auth.expires_in || 300) * 1000;
    while (Date.now() < expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      if (attempt.cancelled) return;
      let result;
      try {
        result = await workos.pollDeviceLogin(auth.device_code);
      } catch (err) {
        // One failed check (e.g. a network hiccup) shouldn't end the login; just try again next time.
        console.error('WorkOS login check failed:', err.message);
        continue;
      }
      if (attempt.cancelled) return;
      if (result.status === 'pending') continue;
      if (result.status === 'slow_down') {
        intervalMs += 5000;
        continue;
      }
      workosAttempt = null;
      if (result.status === 'success') {
        handleWorkosUser(result.user);
      } else {
        console.error('WorkOS login ended:', result.status, result.message);
        backToLoginMenu(result.message);
      }
      return;
    }
    workosAttempt = null;
    backToLoginMenu('The login code expired.');
  }

  function handleWorkosUser(user) {
    const key = findKeyByWorkosUserId(user.id);
    if (!key) {
      pendingWorkosUserId = user.id;
      stage = 'new_character_name';
      socket.write("\r\nYou're signed in! Let's create your character.\r\nChoose a character name: ");
      return;
    }
    const saved = savedPlayers[key];
    if (saved.active === false) {
      backToLoginMenu('This account has been deactivated.');
      return;
    }
    if ([...players.values()].some((p) => p.key === key)) {
      backToLoginMenu('Your character is already logged in somewhere else.');
      return;
    }
    const roomId = rooms[saved.roomId] ? saved.roomId : CLASSES[saved.className].startRoomId;
    finishLogin(key, saved.username, saved.className, roomId, saved.isAdmin, saved.inventory);
  }

  function handleLoginName(rawName) {
    if (!USERNAME_REGEX.test(rawName)) {
      socket.write('Usernames are 2-20 characters: letters, numbers, or underscores only.\r\n');
      promptLoginMenu();
      return;
    }
    const key = rawName.toLowerCase();
    const saved = savedPlayers[key];
    if (!saved) {
      pendingKey = key;
      pendingName = rawName;
      stage = 'confirm_new_account';
      socket.write(`There's no account named ${rawName}. Create it? (y/n): `);
      return;
    }
    if (!saved.passwordHash) {
      socket.write("That character signs in with WorkOS. Type 'w' to use WorkOS.\r\n");
      promptLoginMenu();
      return;
    }
    if (saved.active === false) {
      socket.write('This account has been deactivated.\r\n');
      promptLoginMenu();
      return;
    }
    if ([...players.values()].some((p) => p.key === key)) {
      socket.write('That account is already logged in.\r\n');
      promptLoginMenu();
      return;
    }
    pendingKey = key;
    pendingName = saved.username;
    passwordAttempts = 0;
    stage = 'enter_password';
    promptHidden(socket, 'Password: ');
  }

  function handleLine(input) {
    if (stage === 'login_menu') {
      const rawName = input.trim();
      if (!rawName) {
        promptLoginMenu();
        return;
      }
      if (rawName.toLowerCase() === 'w') {
        startWorkosLogin();
        return;
      }
      if (rawName.toLowerCase() === 'quit') {
        disconnect(socket, 'Goodbye!\r\n');
        return;
      }
      handleLoginName(rawName);
      return;
    }

    if (stage === 'workos_waiting') {
      if (input.trim().toLowerCase() === 'cancel' && workosAttempt) {
        workosAttempt.cancelled = true;
        workosAttempt = null;
        backToLoginMenu('Login cancelled.');
      }
      return;
    }

    if (stage === 'new_character_name') {
      const rawName = input.trim();
      if (!rawName) {
        socket.write('Please enter a character name: ');
        return;
      }
      if (!USERNAME_REGEX.test(rawName)) {
        socket.write('Character names must be 2-20 characters: letters, numbers, or underscores only. Choose a character name: ');
        return;
      }
      const key = rawName.toLowerCase();
      if (key === 'admin' || savedPlayers[key]) {
        socket.write('That name is already taken. Choose a character name: ');
        return;
      }
      if (pendingUsernames.has(key)) {
        socket.write('That name is currently being claimed by someone else. Choose a character name: ');
        return;
      }
      pendingUsernames.add(key);
      reservedName = key;
      pendingKey = key;
      pendingName = rawName;
      createCharacter({ workosUserId: pendingWorkosUserId });
      return;
    }

    if (stage === 'confirm_new_account') {
      const answer = input.trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        backToLoginMenu('Okay.');
        return;
      }
      if (savedPlayers[pendingKey] || pendingUsernames.has(pendingKey)) {
        backToLoginMenu('Sorry, someone else just claimed that name.');
        return;
      }
      pendingUsernames.add(pendingKey);
      reservedName = pendingKey;
      stage = 'create_password';
      promptHidden(socket, 'Choose a password: ');
      return;
    }

    if (stage === 'enter_password') {
      const saved = savedPlayers[pendingKey];
      if (verifyPassword(input, saved.salt, saved.passwordHash)) {
        if (saved.accountType === 'admin') {
          finishAdminLogin(pendingKey, pendingName);
          return;
        }
        const roomId = rooms[saved.roomId] ? saved.roomId : CLASSES[saved.className].startRoomId;
        finishLogin(pendingKey, pendingName, saved.className, roomId, saved.isAdmin, saved.inventory);
        return;
      }
      passwordAttempts += 1;
      if (passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
        disconnect(socket, 'Too many failed attempts. Goodbye.\r\n');
        return;
      }
      promptHidden(socket, 'Incorrect password. Password: ');
      return;
    }

    if (stage === 'create_password') {
      if (!input.trim()) {
        promptHidden(socket, 'Password cannot be empty. Choose a password: ');
        return;
      }
      pendingPassword = input;
      stage = 'confirm_password';
      promptHidden(socket, 'Confirm password: ');
      return;
    }

    if (stage === 'confirm_password') {
      if (input !== pendingPassword) {
        pendingPassword = null;
        stage = 'create_password';
        promptHidden(socket, "Passwords didn't match. Choose a password: ");
        return;
      }
      const { salt, hash } = hashPassword(pendingPassword);
      pendingPassword = null;
      // The username "admin" is the dedicated admin account: no character, straight to the admin console.
      if (pendingKey === 'admin') {
        savedPlayers.admin = { username: pendingName, salt, passwordHash: hash, accountType: 'admin', isAdmin: true };
        savePlayers(savedPlayers);
        pendingUsernames.delete('admin');
        finishAdminLogin('admin', pendingName);
        return;
      }
      createCharacter({ salt, passwordHash: hash });
      return;
    }

    if (player && player.pendingPasswordReset) {
      finishPasswordReset(player, input);
      return;
    }

    if (player && player.pendingDelete) {
      finishDeleteUser(player, input);
      return;
    }

    if (stage === 'admin') {
      handleAdminCommand(player, input);
      return;
    }

    if (player.pendingDrop) {
      const pending = player.pendingDrop;
      const raw = input.trim().toLowerCase();
      if (raw === 'cancel') {
        player.pendingDrop = null;
        socket.write('Never mind.\r\n> ');
        return;
      }
      const count = parseInt(raw, 10);
      if (!Number.isInteger(count) || count < 1 || count > pending.available) {
        socket.write(`Please enter a number from 1 to ${pending.available}, or "cancel": `);
        return;
      }
      player.pendingDrop = null;
      dropItems(player, rooms[player.roomId], pending.itemName, count);
      return;
    }

    handleCommand(player, input);
  }

  socket.on('data', (data) => {
    buffer += stripTelnetCommands(data).toString();
    let idx;
    // Process every complete line (terminated by \n, tolerating \r\n).
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '').replace(/\0/g, '');
      buffer = buffer.slice(idx + 1);
      if (socket.hidingInput) {
        // The player's Enter key wasn't displayed either, so move to a fresh line ourselves.
        socket.hidingInput = false;
        socket.write(Buffer.from([IAC, WONT, ECHO]));
        socket.write('\r\n');
      }
      handleLine(line);
    }
  });

  socket.on('close', () => {
    // Stop checking WorkOS if the player disconnects mid-login.
    if (workosAttempt) {
      workosAttempt.cancelled = true;
    }
    // Release a new-name lock if this connection drops before finishing character creation.
    if (reservedName && !player) {
      pendingUsernames.delete(reservedName);
    }
    if (player) {
      players.delete(socket);
      if (player.accountType !== 'admin') {
        const room = rooms[player.roomId];
        room.players.delete(player);
        broadcastToRoom(room, `${player.name} has disconnected.`);
      }
      // A deleted account must not be saved back into the file on its way out.
      if (!player.deleted) {
        savedPlayers[player.key] = player.accountType === 'admin'
          ? { ...savedPlayers[player.key], username: player.name, accountType: 'admin', isAdmin: true }
          : {
            ...savedPlayers[player.key],
            username: player.name,
            roomId: player.roomId,
            className: player.className,
            isAdmin: player.isAdmin,
            inventory: player.inventory,
          };
        savePlayers(savedPlayers);
      }
    }
  });

  socket.on('error', () => {
    // Ignore broken pipe etc.; 'close' will still fire.
  });
});

server.listen(PORT, () => {
  console.log(`The Big MUDowski server (${IS_PROD ? 'production' : 'development'}, v${VERSION}) listening on port ${PORT}`);
});
