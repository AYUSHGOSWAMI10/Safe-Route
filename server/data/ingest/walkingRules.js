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

function getOneWay(way) {
  const tags = getTags(way);
  const oneway = tags.oneway;

  if (!oneway) return null;

  const v = oneway.toLowerCase();
  if (v === "yes") return "yes";
  if (v === "yes" || v === "true") return "yes";
  if (v === "-1" || v === "reverse") return "reverse";
  if (v === "no" || v === "false" || v === "reversible") return null;
  return null;
}

module.exports = {
  getTags,
  isWalkable,
  getOneWay,
};
