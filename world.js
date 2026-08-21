// Simple in-memory world: rooms keyed by id, each with exits to other room ids.

const rooms = {
  town_square: {
    id: 'town_square',
    name: 'Town Square',
    description: 'A worn stone square at the heart of a small town. A fountain bubbles quietly in the center.',
    exits: { north: 'market', east: 'tavern' },
    players: new Set(),
  },
  market: {
    id: 'market',
    name: 'Market Street',
    description: 'Stalls line the street, though most are shuttered this time of day.',
    exits: { south: 'town_square' },
    players: new Set(),
  },
  tavern: {
    id: 'tavern',
    name: 'The Rusty Tankard Tavern',
    description: 'A dim, smoky room. A fire crackles in the hearth.',
    exits: { west: 'town_square' },
    players: new Set(),
  },
};

module.exports = { rooms };
