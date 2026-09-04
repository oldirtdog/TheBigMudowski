// Character classes, each with its own set of commands that broadcast an in-character action.

const CLASSES = {
  dude: {
    id: 'dude',
    label: 'The Dude',
    description: 'Takes it easy. Prefers not to be hassled.',
    startRoomId: 'dude_apartment',
    welcomeMessages: [
      (player) => `Take it easy, ${player.name}. The rug really tied the room together.`,
      (player) => `Yeah, well, that's just, like, your opinion, man. Welcome, ${player.name}.`,
      (player) => `The Dude abides, ${player.name}. Come on in.`,
    ],
    commands: [
      {
        command: 'abide',
        description: 'settle back and let it go',
        action: (player) => `${player.name} settles back and lets it go. Just abiding.`,
      },
      {
        command: 'drink',
        description: 'take a sip of a White Russian',
        action: (player) => `${player.name} takes a slow sip of a White Russian.`,
      },
    ],
  },
  walter: {
    id: 'walter',
    label: 'Walter',
    description: 'Has rules, and by God, people are going to follow them.',
    startRoomId: 'parking_lot',
    welcomeMessages: [
      (player) => `Listen up, ${player.name}. There are rules, and you're going to follow them.`,
      (player) => `${player.name}, over the line! Just kidding. Good to have you.`,
      (player) => `This is not 'Nam, ${player.name}. This is bowling. There are rules.`,
    ],
    commands: [
      {
        command: 'rules',
        description: 'pound the table about the rules',
        action: (player) => `${player.name} pounds a fist on the nearest surface. "There are rules here, and people are going to follow them!"`,
      },
      {
        command: 'rant',
        description: 'go on a rant',
        action: (player) => `${player.name} launches into a rant about something entirely unrelated.`,
      },
    ],
  },
  donny: {
    id: 'donny',
    label: 'Donny',
    description: "A little out of the loop, but always up for a frame.",
    startRoomId: 'lanes',
    welcomeMessages: [
      (player) => `Hey, ${player.name}! Good to see you. What's going on?`,
      (player) => `${player.name}? I am the Walrus. Just kidding, glad you're here.`,
      (player) => `What's happening, ${player.name}? Grab a lane, we're just getting started.`,
    ],
    commands: [
      {
        command: 'confused',
        description: 'look around, confused',
        action: (player) => `${player.name} looks around, still not quite sure what's going on.`,
      },
      {
        command: 'shrug',
        description: 'shrug it off',
        action: (player) => `${player.name} shrugs it off and goes back to what he was doing.`,
      },
    ],
  },
};

module.exports = { CLASSES };
