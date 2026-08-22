const net = require('net');
const { rooms } = require('./world');
const { loadPlayers, savePlayers } = require('./persistence');
const { CLASSES } = require('./classes');
const { version: VERSION } = require('./package.json');

const PORT = 4000;

// All connected players, keyed by socket.
const players = new Map();

// Saved player data keyed by name, e.g. { Dude: { roomId: 'lanes' } }.
const savedPlayers = loadPlayers();

function describeRoom(room, viewer) {
  const exits = Object.keys(room.exits).join(', ') || 'none';
  const others = [...room.players]
    .filter((p) => p !== viewer)
    .map((p) => p.name);
  let text = `\r\n${room.name}\r\n${room.description}\r\nExits: ${exits}\r\n`;
  if (others.length > 0) {
    text += `Also here: ${others.join(', ')}\r\n`;
  }
  return text;
}

function broadcastToRoom(room, message, exceptSocket) {
  for (const player of room.players) {
    if (player.socket !== exceptSocket) {
      player.socket.write(`\r\n${message}\r\n> `);
    }
  }
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

    case 'who': {
      const names = [...players.values()]
        .map((p) => `${p.name} (${CLASSES[p.className].label})`)
        .join(', ');
      player.socket.write(`Online: ${names}\r\n> `);
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
  socket.write(`Welcome to the MUD! (v${VERSION})\r\nWhat is your name? `);

  let stage = 'login';
  let player = null;
  let buffer = '';
  let pendingName = null;

  const classList = Object.values(CLASSES);

  function promptClassChoice() {
    const options = classList
      .map((c, i) => `  ${i + 1}. ${c.label}: ${c.description}`)
      .join('\r\n');
    socket.write(`\r\nChoose your class:\r\n${options}\r\n> `);
  }

  function finishLogin(name, className, roomId) {
    player = { name, socket, roomId, className };
    players.set(socket, player);
    rooms[roomId].players.add(player);
    stage = 'playing';
    socket.write(`\r\nWelcome, ${name} the ${CLASSES[className].label}!\r\n`);
    socket.write(describeRoom(rooms[roomId], player) + '> ');
    broadcastToRoom(rooms[roomId], `${name} arrives.`, socket);
  }

  function handleLine(input) {
    if (stage === 'login') {
      const name = input.trim();
      if (!name) {
        socket.write('Please enter a name: ');
        return;
      }
      const saved = savedPlayers[name];
      if (saved && CLASSES[saved.className]) {
        const roomId = rooms[saved.roomId] ? saved.roomId : CLASSES[saved.className].startRoomId;
        finishLogin(name, saved.className, roomId);
        return;
      }
      pendingName = name;
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
      const saved = savedPlayers[pendingName];
      const roomId = saved && rooms[saved.roomId] ? saved.roomId : choice.startRoomId;
      finishLogin(pendingName, choice.id, roomId);
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
    if (player) {
      const room = rooms[player.roomId];
      room.players.delete(player);
      broadcastToRoom(room, `${player.name} has disconnected.`);
      players.delete(socket);
      savedPlayers[player.name] = { roomId: player.roomId, className: player.className };
      savePlayers(savedPlayers);
    }
  });

  socket.on('error', () => {
    // Ignore broken pipe etc.; 'close' will still fire.
  });
});

server.listen(PORT, () => {
  console.log(`MUD server listening on port ${PORT}`);
});
