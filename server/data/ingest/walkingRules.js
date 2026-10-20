const walkableTypes = new Set([
  "footway",
  "pedestrian",
  "path",
  "residential",
  "living_street",
  "service",
  "tertiary",
  "secondary",
  "unclassified",
  "track",
  "tertiary_link",
  "secondary_link",
]);

function getTags(way) {
  const tags = Array.isArray(way.tag) ? way.tag : way.tag ? [way.tag] : [];

  return Object.fromEntries(tags.map((t) => [t.k, t.v]));
}

function isWalkable(way) {
  const tags = getTags(way);

  if (!walkableTypes.has(tags.highway)) return false;

  // Motorroads are not suitable for pedestrians
    if (tags.motorroad === "yes") return false;

  // Explicit pedestrian restrictions
  if (["no", "private"].includes(tags.foot)) return false;

  // General access restrictions unless foot access is explicitly allowed
  if (["no", "private"].includes(tags.access)) {
    if (!["yes", "designated", "permissive"].includes(tags.foot)) {
      return false;
    }
  }

  return true;
}

module.exports = {
  getTags,
  isWalkable,
};
