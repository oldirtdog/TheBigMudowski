// Item definitions.
// `unique: true` means a player can only ever carry one at a time.
// `droppable: false` means the item can't be dropped through the normal `drop` command
// (e.g. the rug is sentimental and only comes off through a future story event).
// Anything not listed here, or missing a flag, uses the default for that flag.

const ITEMS = {
  rug: { unique: true, droppable: false },
};

function isUnique(itemName) {
  const def = ITEMS[itemName.toLowerCase()];
  return !!(def && def.unique);
}

function isDroppable(itemName) {
  const def = ITEMS[itemName.toLowerCase()];
  return !def || def.droppable !== false;
}

module.exports = { ITEMS, isUnique, isDroppable };
