// Character classes, each with a unique command that broadcasts an in-character action.

const CLASSES = {
  dude: {
    id: 'dude',
    label: 'The Dude',
    description: 'Takes it easy. Prefers not to be hassled.',
    command: 'abide',
    startRoomId: 'dude_apartment',
    action: (player) => `${player.name} settles back and lets it go. Just abiding.`,
  },
  walter: {
    id: 'walter',
    label: 'Walter',
    description: 'Has rules, and by God, people are going to follow them.',
    command: 'rules',
    startRoomId: 'parking_lot',
    action: (player) => `${player.name} pounds a fist on the nearest surface. "There are rules here, and people are going to follow them!"`,
  },
  donny: {
    id: 'donny',
    label: 'Donny',
    description: "A little out of the loop, but always up for a frame.",
    command: 'confused',
    startRoomId: 'lanes',
    action: (player) => `${player.name} looks around, still not quite sure what's going on.`,
  },
};

module.exports = { CLASSES };
