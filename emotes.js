// Generic emotes available to every player, regardless of class.

const EMOTES = [
  { command: 'smile', action: (player) => `${player.name} smiles.` },
  { command: 'laugh', action: (player) => `${player.name} laughs.` },
  { command: 'wave', action: (player) => `${player.name} waves.` },
  { command: 'nod', action: (player) => `${player.name} nods.` },
  { command: 'cry', action: (player) => `${player.name} tears up a little.` },
  { command: 'dance', action: (player) => `${player.name} busts out a little dance.` },
  { command: 'cheer', action: (player) => `${player.name} cheers.` },
  { command: 'sigh', action: (player) => `${player.name} lets out a heavy sigh.` },
  { command: 'bow', action: (player) => `${player.name} takes a bow.` },
  { command: 'clap', action: (player) => `${player.name} claps.` },
];

module.exports = { EMOTES };
