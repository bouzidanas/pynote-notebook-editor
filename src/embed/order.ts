// Where an element is on the page, for the notebook's cell order: its place
// in the composed tree, the tree a reader sees, where a shadow root's content
// stands for its host's and a slotted node stands at its slot. Cells inside
// another component's shadow root (a site's own web components) take their
// place among the others; compareDocumentPosition gives no order between
// nodes of different trees.
//
// A closed shadow root hides which of its slots shows a node (assignedSlot is
// null outside it), but a node inside the root reaches the root itself
// (getRootNode), and so its slots. When cells are ordered, a cell passed to a
// closed root's slot stands at that slot if another of the cells is inside
// that root (or in a shadow root within it). A closed root with no cell
// inside cannot be read: the cells passed to it count where it is, in the
// order of the page's markup, whichever slots show them.

type Roots = ReadonlyMap<Element, ShadowRoot>;

/** The shadow roots `nodes` are in, closed ones included, by host. */
function shadowRootsOf(nodes: Iterable<Node>): Roots {
  const roots = new Map<Element, ShadowRoot>();
  for (const node of nodes) {
    for (let root = node.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) roots.set(root.host, root);
  }
  return roots;
}

/** The slot that shows `node`: its assignedSlot, else, in a closed shadow root among `roots`, the slot it is assigned to. */
function slotOf(node: Node, roots: Roots): HTMLSlotElement | null {
  const slot = (node as Element | Text).assignedSlot;
  if (slot) return slot;
  const root = node.parentNode instanceof Element ? roots.get(node.parentNode) : undefined;
  if (!root || root.mode === "open") return null;
  for (const candidate of root.querySelectorAll("slot")) if (candidate.assignedNodes().includes(node)) return candidate;
  return null;
}

/** The node's parent in the composed tree: a slotted node's slot, the host of a shadow root's child. */
function composedParent(node: Node, roots: Roots): Node | null {
  const slot = slotOf(node, roots);
  if (slot) return slot;
  const parent = node.parentNode;
  return parent instanceof ShadowRoot ? parent.host : parent;
}

/** The node and its composed ancestors, from the document down. */
function composedPath(node: Node, roots: Roots): Node[] {
  const path: Node[] = [];
  for (let current: Node | null = node; current; current = composedParent(current, roots)) path.push(current);
  return path.reverse();
}

// Rendered children come first: a slot's assigned nodes before its fallback
// content, a host's shadow root content before its children that no slot shows.
const rank = (node: Node, parent: Node): number => {
  if (parent instanceof HTMLSlotElement) return node.parentNode === parent ? 1 : 0;
  return node.parentNode instanceof ShadowRoot ? 0 : 1;
};

/** The order of two different children of `parent` in the composed tree. */
function siblingOrder(a: Node, b: Node, parent: Node): number {
  const ranks = rank(a, parent) - rank(b, parent);
  if (ranks !== 0) return ranks;
  if (parent instanceof HTMLSlotElement && a.parentNode !== parent) {
    const assigned = parent.assignedNodes();
    return assigned.indexOf(a) - assigned.indexOf(b);
  }
  // Children of the same node of one tree.
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * Compares nodes by their place in the composed tree: negative when `a` comes
 * before `b`, positive when after; 0 for the same node, or nodes of different
 * documents (one is out of the page), which have no order. Closed shadow
 * roots are read from inside, through `nodes`: give it every node it will
 * compare (all the cells), so that each pair is ordered alike.
 */
export function composedOrder(nodes: Iterable<Node>): (a: Node, b: Node) => number {
  const roots = shadowRootsOf(nodes);
  const paths = new Map<Node, Node[]>();
  const pathOf = (node: Node) => {
    let path = paths.get(node);
    if (!path) paths.set(node, (path = composedPath(node, roots)));
    return path;
  };
  return (a, b) => {
    if (a === b) return 0;
    const pathA = pathOf(a);
    const pathB = pathOf(b);
    if (pathA[0] !== pathB[0]) return 0;
    let shared = 0;
    while (shared < pathA.length && shared < pathB.length && pathA[shared] === pathB[shared]) shared++;
    // One contains the other: the container comes first.
    if (shared === pathA.length) return -1;
    if (shared === pathB.length) return 1;
    return siblingOrder(pathA[shared], pathB[shared], pathA[shared - 1]);
  };
}
