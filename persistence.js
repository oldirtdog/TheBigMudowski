const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'players.json');

// Returns saved player data keyed by player name, e.g. { Dude: { roomId: 'lanes' } }.
function loadPlayers() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function savePlayers(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { loadPlayers, savePlayers };
