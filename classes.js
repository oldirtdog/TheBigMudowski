// Character classes, each with its own set of commands that broadcast an in-character action.

const CLASSES = {
  dude: {
    id: 'dude',
    label: 'The Dude',
    description: 'Takes it easy. Prefers not to be hassled.',
    startRoomId: 'dude_apartment',
    commands: [
      {
        command: 'abide',
        action: (player) => `${player.name} settles back and lets it go. Just abiding.`,
      },
      {
        command: 'drink',
        action: (player) => `${player.name} takes a slow sip of a White Russian.`,
      },
    ],
  },
  walter: {
    id: 'walter',
    label: 'Walter',
    description: 'Has rules, and by God, people are going to follow them.',
    startRoomId: 'parking_lot',
    commands: [
      {
        command: 'rules',
        action: (player) => `${player.name} pounds a fist on the nearest surface. "There are rules here, and people are going to follow them!"`,
      },
    ],
  },
  donny: {
    id: 'donny',
    label: 'Donny',
    description: "A little out of the loop, but always up for a frame.",
    startRoomId: 'lanes',
    commands: [
      {
        command: 'confused',
        action: (player) => `${player.name} looks around, still not quite sure what's going on.`,
      },
    ],
  },
};

module.exports = { CLASSES };
