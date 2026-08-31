// Simple in-memory world: rooms keyed by id, each with exits to other room ids.

const rooms = {
  dude_apartment: {
    id: 'dude_apartment',
    name: "The Dude's Apartment",
    description: 'A cluttered apartment that smells faintly of White Russians and incense. A well-worn rug ties the whole room together, and a stack of bowling magazines slumps beside the cassette deck.',
    exits: { south: 'parking_lot' },
    players: new Set(),
    items: ['rug'],
  },
  parking_lot: {
    id: 'parking_lot',
    name: 'Strip Mall Parking Lot',
    description: 'A cracked asphalt lot outside a row of shops. A beat-up sedan is parked crookedly near the curb.',
    exits: { north: 'dude_apartment', east: 'lanes', west: 'diner', south: 'lebowski_study' },
    players: new Set(),
    items: [],
  },
  lanes: {
    id: 'lanes',
    name: 'The Bowling Alley',
    description: 'Rows of gleaming lanes stretch out under buzzing fluorescent lights. The rumble of rolling balls and clattering pins never quite stops.',
    exits: { west: 'parking_lot', north: 'sobchak_security' },
    players: new Set(),
    items: ['bowling ball'],
  },
  sobchak_security: {
    id: 'sobchak_security',
    name: 'Sobchak Security',
    description: "A cramped office lined with security catalogs and a small arsenal of surplus gear. A hand-lettered sign on the desk reads 'RULES ARE RULES.'",
    exits: { south: 'lanes' },
    players: new Set(),
    items: [],
  },
  diner: {
    id: 'diner',
    name: 'The Diner',
    description: 'A quiet coffee shop with vinyl booths and a case of pie by the register. Little creamer tubs are scattered across every table.',
    exits: { east: 'parking_lot' },
    players: new Set(),
    items: ['slice of pie'],
  },
  lebowski_study: {
    id: 'lebowski_study',
    name: "The Big Lebowski's Study",
    description: 'A wood-paneled study lined with framed photographs and bowling trophies. A wheelchair ramp leads off toward the hallway.',
    exits: { north: 'parking_lot', east: 'maude_loft', west: 'treehorn_mansion' },
    players: new Set(),
    items: [],
  },
  maude_loft: {
    id: 'maude_loft',
    name: "Maude's Loft",
    description: 'A cavernous art studio with plastic sheeting on the floor and an unfinished canvas hanging from the ceiling on a rig of ropes.',
    exits: { west: 'lebowski_study' },
    players: new Set(),
    items: [],
  },
  treehorn_mansion: {
    id: 'treehorn_mansion',
    name: "Treehorn's Mansion",
    description: 'A sprawling mansion overlooking the coast. Faint music drifts in from a pool party happening somewhere out back.',
    exits: { east: 'lebowski_study' },
    players: new Set(),
    items: [],
  },
};

module.exports = { rooms };
