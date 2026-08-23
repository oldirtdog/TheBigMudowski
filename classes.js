// Character classes, each with its own set of commands that broadcast an in-character action.

const CLASSES = {
  dude: {
    id: 'dude',
    label: 'The Dude',
    description: 'Takes it easy. Prefers not to be hassled.',
    startRoomId: 'dude_apartment',
    welcomeMessage: (player) => `Take it easy, ${player.name}. The rug really tied the room together.`,
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
    welcomeMessage: (player) => `Listen up, ${player.name}. There are rules, and you're going to follow them.`,
    commands: [
      {
        command: 'rules',
        action: (player) => `${player.name} pounds a fist on the nearest surface. "There are rules here, and people are going to follow them!"`,
      },
      {
        command: 'rant',
        action: (player) => `${player.name} launches into a rant about something entirely unrelated.`,
      },
    ],
  },
  donny: {
    id: 'donny',
    label: 'Donny',
    description: "A little out of the loop, but always up for a frame.",
    startRoomId: 'lanes',
    welcomeMessage: (player) => `Hey, ${player.name}! Good to see you. What's going on?`,
    commands: [
      {
        command: 'confused',
        action: (player) => `${player.name} looks around, still not quite sure what's going on.`,
      },
      {
        command: 'shrug',
        action: (player) => `${player.name} shrugs it off and goes back to what he was doing.`,
      },
    ],
  },
};

module.exports = { CLASSES };
