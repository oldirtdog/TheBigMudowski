const net = require('net');
const { rooms } = require('./world');
const { loadPlayers, savePlayers } = require('./persistence');
const { CLASSES } = require('./classes');
const { EMOTES } = require('./emotes');
const { isUnique, isDroppable } = require('./items');
const { hashPassword, verifyPassword } = require('./auth');
const { version: pkgVersion } = require('./package.json');

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = IS_PROD ? 4000 : 4001;
const VERSION = IS_PROD ? pkgVersion : `${pkgVersion}-dev`;
const MAX_PASSWORD_ATTEMPTS = 3;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,20}$/;

// All connected players, keyed by socket.
const players = new Map();

// Saved player data keyed by name, e.g. { Dude: { roomId: 'lanes' } }.
const savedPlayers = loadPlayers();

// Usernames currently mid-registration (chosen a name, haven't finished setting a password yet),
// so two people can't grab the same new username at once and clobber each other's account.
const pendingUsernames = new Set();

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

function buildHelpText(player) {
  const lines = [
    'Commands:',
    '  look (l)                       - look around the room',
    '  north/south/east/west (n/s/e/w) - move between rooms',
    '  say <message>                  - say something out loud',
    '  get/take <item>                - pick up an item from the room',
    '  drop <item>                    - drop an item you are carrying',
    '  inventory (i)                  - list what you are carrying',
    '  who                            - list who is online',
    '  here                           - list who else is in this room',
    '  help                           - show this list',
    '  quit                           - disconnect',
  ];
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
    lines.push('  resetpassword <username> <newpassword> - reset a user\'s password');
    lines.push('  deactivate <username>           - deactivate a user\'s account and disconnect them if online');
    lines.push('  reactivate <username>           - reactivate a deactivated account');
  }
  return lines.join('\r\n');
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

  switch (cmd.toLowerCase()) {
    case 'look':
    case 'l':
      player.socket.write(describeRoom(room, player) + '> ');
      break;

    case 'north':
    case 'south':
    case 'east':
    case 'west':
    case 'n':
    case 's':
    case 'e':
    case 'w': {
      const dirMap = { n: 'north', s: 'south', e: 'east', w: 'west' };
      const direction = dirMap[cmd.toLowerCase()] || cmd.toLowerCase();
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

    case 'inventory':
    case 'i': {
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

    case 'resetpassword': {
      if (!player.isAdmin) {
        player.socket.write(`Unknown command: "${cmd}"\r\n> `);
        break;
      }
      const [targetName, newPassword] = rest;
      if (!targetName || !newPassword) {
        player.socket.write('Usage: resetpassword <username> <newpassword>\r\n> ');
        break;
      }
      const targetKey = targetName.toLowerCase();
      const target = savedPlayers[targetKey];
      if (!target || !target.passwordHash) {
        player.socket.write(`No account found for "${targetName}".\r\n> `);
        break;
      }
      const { salt, hash } = hashPassword(newPassword);
      savedPlayers[targetKey] = { ...target, salt, passwordHash: hash };
      savePlayers(savedPlayers);
      player.socket.write(`Password reset for ${target.username}.\r\n> `);
      break;
    }

    case 'deactivate': {
      if (!player.isAdmin) {
        player.socket.write(`Unknown command: "${cmd}"\r\n> `);
        break;
      }
      const [targetName] = rest;
      if (!targetName) {
        player.socket.write('Usage: deactivate <username>\r\n> ');
        break;
      }
      const targetKey = targetName.toLowerCase();
      const target = savedPlayers[targetKey];
      if (!target || !target.passwordHash) {
        player.socket.write(`No account found for "${targetName}".\r\n> `);
        break;
      }
      savedPlayers[targetKey] = { ...target, active: false };
      savePlayers(savedPlayers);
      const onlineTarget = [...players.values()].find((p) => p.key === targetKey);
      if (onlineTarget) {
        onlineTarget.socket.write('\r\nYour account has been deactivated. Goodbye.\r\n');
        onlineTarget.socket.end();
      }
      player.socket.write(`Account "${target.username}" deactivated.\r\n> `);
      break;
    }

    case 'reactivate': {
      if (!player.isAdmin) {
        player.socket.write(`Unknown command: "${cmd}"\r\n> `);
        break;
      }
      const [targetName] = rest;
      if (!targetName) {
        player.socket.write('Usage: reactivate <username>\r\n> ');
        break;
      }
      const targetKey = targetName.toLowerCase();
      const target = savedPlayers[targetKey];
      if (!target || !target.passwordHash) {
        player.socket.write(`No account found for "${targetName}".\r\n> `);
        break;
      }
      savedPlayers[targetKey] = { ...target, active: true };
      savePlayers(savedPlayers);
      player.socket.write(`Account "${target.username}" reactivated.\r\n> `);
      break;
    }

    case 'who': {
      const names = [...players.values()]
        .map((p) => `${p.name} (${CLASSES[p.className].label})`)
        .join(', ');
      player.socket.write(`Online: ${names}\r\n> `);
      break;
    }

    case 'here': {
      const others = [...room.players]
        .filter((p) => p !== player)
        .map((p) => `${p.name} (${CLASSES[p.className].label})`);
      if (others.length === 0) {
        player.socket.write("No one else is here.\r\n> ");
      } else {
        player.socket.write(`Here: ${others.join(', ')}\r\n> `);
      }
      break;
    }

    case 'quit':
      player.socket.write('Goodbye!\r\n');
      player.socket.end();
      break;

    default:
      player.socket.write(`Unknown command: "${cmd}"\r\n> `);
  }
}

const server = net.createServer((socket) => {
  let stage = 'ask_new_or_returning';
  let player = null;
  let buffer = '';
  let pendingKey = null;
  let pendingName = null;
  let pendingPassword = null;
  let passwordAttempts = 0;

  const classList = Object.values(CLASSES);

  function promptClassChoice() {
    const options = classList
      .map((c, i) => `  ${i + 1}. ${c.label}: ${c.description}`)
      .join('\r\n');
    socket.write(`\r\nChoose your class:\r\n${options}\r\n> `);
  }

  function promptNewOrReturning() {
    socket.write('Are you a new or returning player?\r\n  1. New player\r\n  2. Returning player\r\n> ');
  }

  socket.write(`Welcome to The Big MUDowski! (v${VERSION})\r\n`);
  promptNewOrReturning();

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

  function handleLine(input) {
    if (stage === 'ask_new_or_returning') {
      const choice = input.trim().toLowerCase();
      if (choice === '1' || choice === 'new' || choice === 'n') {
        stage = 'new_username';
        socket.write('Choose a username: ');
        return;
      }
      if (choice === '2' || choice === 'returning' || choice === 'r') {
        stage = 'returning_username';
        socket.write('Username: ');
        return;
      }
      socket.write('Not a valid choice. Enter 1 or 2.\r\n> ');
      return;
    }

    if (stage === 'new_username') {
      const rawName = input.trim();
      if (rawName.toLowerCase() === 'back') {
        stage = 'ask_new_or_returning';
        promptNewOrReturning();
        return;
      }
      if (!rawName) {
        socket.write('Please enter a username: ');
        return;
      }
      if (!USERNAME_REGEX.test(rawName)) {
        socket.write('Usernames must be 2-20 characters: letters, numbers, or underscores only. Choose a username: ');
        return;
      }
      const key = rawName.toLowerCase();
      const saved = savedPlayers[key];
      if (saved && saved.passwordHash) {
        socket.write("That username is already registered. If it's yours, type 'back' and choose 'returning' instead. Choose a username: ");
        return;
      }
      if (pendingUsernames.has(key)) {
        socket.write('That username is currently being registered by someone else. Choose a username: ');
        return;
      }
      pendingUsernames.add(key);
      pendingKey = key;
      pendingName = rawName;
      stage = 'create_password';
      socket.write('Choose a password: ');
      return;
    }

    if (stage === 'returning_username') {
      const rawName = input.trim();
      if (rawName.toLowerCase() === 'back') {
        stage = 'ask_new_or_returning';
        promptNewOrReturning();
        return;
      }
      if (!rawName) {
        socket.write('Please enter a username: ');
        return;
      }
      const key = rawName.toLowerCase();
      const saved = savedPlayers[key];
      if (!saved || !saved.passwordHash) {
        socket.write("No account found for that username. Type 'back' to start over, or try again. Username: ");
        return;
      }
      if (saved.active === false) {
        socket.write("This account has been deactivated. Type 'back' to start over, or try again. Username: ");
        return;
      }
      const alreadyOnline = [...players.values()].some((p) => p.key === key);
      if (alreadyOnline) {
        socket.write('That account is already logged in. Username: ');
        return;
      }
      pendingKey = key;
      pendingName = saved.username;
      passwordAttempts = 0;
      stage = 'enter_password';
      socket.write('Password: ');
      return;
    }

    if (stage === 'enter_password') {
      const saved = savedPlayers[pendingKey];
      if (verifyPassword(input, saved.salt, saved.passwordHash)) {
        const roomId = rooms[saved.roomId] ? saved.roomId : CLASSES[saved.className].startRoomId;
        finishLogin(pendingKey, pendingName, saved.className, roomId, saved.isAdmin, saved.inventory);
        return;
      }
      passwordAttempts += 1;
      if (passwordAttempts >= MAX_PASSWORD_ATTEMPTS) {
        socket.write('Too many failed attempts. Goodbye.\r\n');
        socket.end();
        return;
      }
      socket.write('Incorrect password. Password: ');
      return;
    }

    if (stage === 'create_password') {
      if (!input.trim()) {
        socket.write('Password cannot be empty. Choose a password: ');
        return;
      }
      pendingPassword = input;
      stage = 'confirm_password';
      socket.write('Confirm password: ');
      return;
    }

    if (stage === 'confirm_password') {
      if (input !== pendingPassword) {
        pendingPassword = null;
        stage = 'create_password';
        socket.write("Passwords didn't match. Choose a password: ");
        return;
      }
      const { salt, hash } = hashPassword(pendingPassword);
      pendingPassword = null;
      const existing = savedPlayers[pendingKey];
      savedPlayers[pendingKey] = { ...existing, username: pendingName, salt, passwordHash: hash };
      savePlayers(savedPlayers);
      pendingUsernames.delete(pendingKey);

      if (existing && CLASSES[existing.className] && rooms[existing.roomId]) {
        finishLogin(pendingKey, existing.username || pendingName, existing.className, existing.roomId, existing.isAdmin, existing.inventory);
        return;
      }
      stage = 'choose_class';
      promptClassChoice();
      return;
    }

    if (stage === 'choose_class') {
      const choice = classList[parseInt(input.trim(), 10) - 1];
      if (!choice) {
        socket.write(`Not a valid choice. Enter a number from 1 to ${classList.length}.\r\n> `);
        return;
      }
      const saved = savedPlayers[pendingKey];
      const roomId = saved && rooms[saved.roomId] ? saved.roomId : choice.startRoomId;
      finishLogin(pendingKey, pendingName, choice.id, roomId, saved && saved.isAdmin, saved && saved.inventory);
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
    buffer += data.toString();
    let idx;
    // Process every complete line (terminated by \n, tolerating \r\n).
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      handleLine(line);
    }
  });

  socket.on('close', () => {
    // Release a new-username registration lock if this connection drops before finishing signup.
    if (pendingKey) {
      pendingUsernames.delete(pendingKey);
    }
    if (player) {
      const room = rooms[player.roomId];
      room.players.delete(player);
      broadcastToRoom(room, `${player.name} has disconnected.`);
      players.delete(socket);
      savedPlayers[player.key] = {
        ...savedPlayers[player.key],
        username: player.name,
        roomId: player.roomId,
        className: player.className,
        isAdmin: player.isAdmin,
        inventory: player.inventory,
      };
      savePlayers(savedPlayers);
    }
  });

  socket.on('error', () => {
    // Ignore broken pipe etc.; 'close' will still fire.
  });
});

server.listen(PORT, () => {
  console.log(`The Big MUDowski server (${IS_PROD ? 'production' : 'development'}, v${VERSION}) listening on port ${PORT}`);
});
