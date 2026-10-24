function buildComponents(adjacency) {
  const components = new Map();
  let componentId = 0;
  for (const start of adjacency.keys()) {
    if (components.has(start)) continue;
    const stack = [start];
    components.set(start, componentId);
    while (stack.length) {
      const current = stack.pop();
      for (const connection of adjacency.get(current) || []) {
        if (!components.has(connection.to)) {
          components.set(connection.to, componentId);
          stack.push(connection.to);
        }
      }
    }
    componentId++;
  }
  return components;
}
module.exports = { buildComponents };
