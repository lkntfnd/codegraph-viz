// public/app/stronglyConnectedComponents.js — find stable directed graph cycles.

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

function adjacency(ids, links, reverse = false) {
  const result = new Map(ids.map((id) => [id, []]));
  for (const link of links) {
    const source = endpointId(reverse ? link.target : link.source);
    const target = endpointId(reverse ? link.source : link.target);
    if (result.has(source) && result.has(target)) result.get(source).push(target);
  }
  for (const neighbors of result.values()) neighbors.sort((left, right) => left.localeCompare(right));
  return result;
}

function finishingOrder(ids, graph) {
  const visited = new Set();
  const order = [];

  for (const root of ids) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ id: root, next: 0 }];

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = graph.get(frame.id);
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ id: neighbor, next: 0 });
        }
      } else {
        order.push(frame.id);
        stack.pop();
      }
    }
  }

  return order;
}

export function findStronglyConnectedComponents(nodeIds, links) {
  const ids = [...new Set(nodeIds.map(String))].sort((left, right) => left.localeCompare(right));
  const forward = adjacency(ids, links);
  const reverse = adjacency(ids, links, true);
  const order = finishingOrder(ids, forward);
  const assigned = new Set();
  const selfLoops = new Set(
    links
      .filter((link) => endpointId(link.source) === endpointId(link.target))
      .map((link) => endpointId(link.source)),
  );
  const components = [];

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const root = order[index];
    if (assigned.has(root)) continue;
    assigned.add(root);
    const members = [];
    const stack = [root];

    while (stack.length) {
      const id = stack.pop();
      members.push(id);
      for (const neighbor of reverse.get(id)) {
        if (assigned.has(neighbor)) continue;
        assigned.add(neighbor);
        stack.push(neighbor);
      }
    }

    members.sort((left, right) => left.localeCompare(right));
    components.push({
      id: members[0],
      members,
      cyclic: members.length > 1 || selfLoops.has(members[0]),
    });
  }

  components.sort((left, right) => left.id.localeCompare(right.id));
  const componentByNodeId = new Map();
  for (const component of components) {
    for (const id of component.members) componentByNodeId.set(id, component);
  }

  return { components, componentByNodeId };
}
