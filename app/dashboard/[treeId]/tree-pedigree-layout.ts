/** Pedigree layout constants (match product spec). */
export const NODE_W = 160;
export const NODE_H = 90;
export const GAP_W = 40;
export const GAP_V = 120;
export const CANVAS_PAD = 80;
export const ISLAND_EXTRA_GAP = 100;

export type ParentRelationship = {
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
};

function normType(t: string): string {
  return t.trim().toLowerCase();
}

/** Parent edges only: person_a = parent, person_b = child. */
export function buildParentsOf(
  relationships: ParentRelationship[]
): Map<string, Set<string>> {
  const parentsOf = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (normType(r.relationship_type) !== "parent") continue;
    const child = r.person_b_id;
    const parent = r.person_a_id;
    if (!parentsOf.has(child)) parentsOf.set(child, new Set());
    parentsOf.get(child)!.add(parent);
  }
  return parentsOf;
}

export function buildSpousePairs(
  relationships: ParentRelationship[],
  personSet: Set<string>
): [string, string][] {
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  for (const r of relationships) {
    const t = normType(r.relationship_type);
    if (t !== "spouse" && t !== "married") continue;
    const a = r.person_a_id;
    const b = r.person_b_id;
    if (!personSet.has(a) || !personSet.has(b)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(a < b ? [a, b] : [b, a]);
  }
  return pairs;
}

function maxAncestorDepth(
  id: string,
  parentsOf: Map<string, Set<string>>,
  memo: Map<string, number>,
  visiting: Set<string>
): number {
  if (memo.has(id)) return memo.get(id)!;
  if (visiting.has(id)) return 0;
  visiting.add(id);
  const pars = parentsOf.get(id);
  let d = 0;
  if (pars) {
    for (const p of pars) {
      d = Math.max(d, 1 + maxAncestorDepth(p, parentsOf, memo, visiting));
    }
  }
  visiting.delete(id);
  memo.set(id, d);
  return d;
}

export function pickDeepestRoot(
  personIds: string[],
  parentsOf: Map<string, Set<string>>
): string {
  if (personIds.length === 0) return "";
  let best = personIds[0]!;
  let bestDepth = -1;
  const memo = new Map<string, number>();
  for (const id of personIds) {
    const d = maxAncestorDepth(id, parentsOf, memo, new Set());
    if (d > bestDepth || (d === bestDepth && id < best)) {
      bestDepth = d;
      best = id;
    }
  }
  return best;
}

function collectAncestors(
  root: string,
  parentsOf: Map<string, Set<string>>
): Set<string> {
  const out = new Set<string>();
  const stack = [...(parentsOf.get(root) ?? [])];
  while (stack.length) {
    const p = stack.pop()!;
    if (out.has(p)) continue;
    out.add(p);
    for (const gp of parentsOf.get(p) ?? []) stack.push(gp);
  }
  return out;
}

/** Inverse of parentsOf: each person's children (within the person set). */
function buildChildrenOf(
  parentsOf: Map<string, Set<string>>,
  personSet: Set<string>
): Map<string, Set<string>> {
  const childrenOf = new Map<string, Set<string>>();
  for (const [child, parents] of parentsOf) {
    if (!personSet.has(child)) continue;
    for (const p of parents) {
      if (!personSet.has(p)) continue;
      if (!childrenOf.has(p)) childrenOf.set(p, new Set());
      childrenOf.get(p)!.add(child);
    }
  }
  return childrenOf;
}

function collectDescendants(
  root: string,
  parentsOf: Map<string, Set<string>>,
  personSet: Set<string>
): Set<string> {
  const childrenOf = buildChildrenOf(parentsOf, personSet);
  const out = new Set<string>();
  const stack = [...(childrenOf.get(root) ?? [])];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    for (const gc of childrenOf.get(c) ?? []) stack.push(gc);
  }
  return out;
}

function spouseClosure(
  seed: Set<string>,
  spousePairs: [string, string][]
): Set<string> {
  const s = new Set(seed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, b] of spousePairs) {
      const inA = s.has(a);
      const inB = s.has(b);
      if (inA && !inB) {
        s.add(b);
        changed = true;
      } else if (inB && !inA) {
        s.add(a);
        changed = true;
      }
    }
  }
  return s;
}

/**
 * Root = 0. Ancestors: +1, +2, … (higher index = toward top of canvas).
 * Descendants: -1, -2, … (more negative = toward bottom).
 */
function assignGenerations(
  mainIds: Set<string>,
  root: string,
  parentsOf: Map<string, Set<string>>,
  spousePairs: [string, string][]
): Map<string, number> {
  const personSet = mainIds; // same set for childrenOf edges
  const childrenOf = buildChildrenOf(parentsOf, personSet);
  const gen = new Map<string, number>();
  gen.set(root, 0);

  const upQueue: string[] = [root];
  while (upQueue.length) {
    const c = upQueue.shift()!;
    const g = gen.get(c) ?? 0;
    for (const p of parentsOf.get(c) ?? []) {
      if (!mainIds.has(p)) continue;
      const next = g + 1;
      const prev = gen.get(p);
      if (prev === undefined || next > prev) {
        gen.set(p, next);
        upQueue.push(p);
      }
    }
  }

  const MAX_GEN_ITERS = 64;
  for (let iter = 0; iter < MAX_GEN_ITERS; iter++) {
    let changed = false;

    for (const [a, b] of spousePairs) {
      if (!mainIds.has(a) || !mainIds.has(b)) continue;
      const ga = gen.get(a);
      const gb = gen.get(b);
      if (ga === undefined && gb === undefined) continue;
      const target = Math.max(ga ?? -Infinity, gb ?? -Infinity);
      if (target === -Infinity) continue;
      if (gen.get(a) !== target) {
        gen.set(a, target);
        changed = true;
      }
      if (gen.get(b) !== target) {
        gen.set(b, target);
        changed = true;
      }
    }

    for (const p of mainIds) {
      const gp = gen.get(p);
      if (gp === undefined) continue;
      for (const c of childrenOf.get(p) ?? []) {
        if (!mainIds.has(c)) continue;
        const next = gp - 1;
        const prev = gen.get(c);
        if (prev === undefined || next < prev) {
          gen.set(c, next);
          changed = true;
        }
      }
    }

    for (const c of mainIds) {
      const gc = gen.get(c);
      if (gc === undefined) continue;
      for (const p of parentsOf.get(c) ?? []) {
        if (!mainIds.has(p)) continue;
        const next = gc + 1;
        const prev = gen.get(p);
        if (prev === undefined || next > prev) {
          gen.set(p, next);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  for (const id of mainIds) {
    if (gen.has(id)) continue;
    let g0 = -Infinity;
    for (const [a, b] of spousePairs) {
      const other = a === id ? b : b === id ? a : null;
      if (other === null) continue;
      const go = gen.get(other);
      if (go !== undefined) g0 = Math.max(g0, go);
    }
    gen.set(id, g0 === -Infinity ? 0 : g0);
  }

  return gen;
}

function rowWidth(nodeCount: number): number {
  if (nodeCount <= 0) return 0;
  return nodeCount * NODE_W + (nodeCount - 1) * GAP_W;
}

export type PedigreePosition = {
  id: string;
  x: number;
  y: number;
  generation: number;
  island: boolean;
};

/** Left-edge to left-edge step: node width + minimum horizontal gap. */
const CELL = NODE_W + GAP_W;

/**
 * Horizontal placement: even spread per generation, parent-over-child alignment,
 * spouse side-by-side, then overlap removal (two passes) and canvas padding.
 */
function computeHorizontalLayout(
  mainIds: Set<string>,
  gen: Map<string, number>,
  parentsOf: Map<string, Set<string>>,
  spousePairs: [string, string][],
  rows: Map<number, string[]>,
  gMin: number,
  gMax: number
): { xById: Map<string, number>; contentWidth: number } {
  const childrenOf = buildChildrenOf(parentsOf, mainIds);
  const xById = new Map<string, number>();

  let maxN = 0;
  for (let g = gMin; g <= gMax; g++) {
    maxN = Math.max(maxN, (rows.get(g) ?? []).length);
  }
  let contentWidth = Math.max(640, rowWidth(maxN) + CANVAS_PAD * 2);
  const centerX = contentWidth / 2;

  function placeEvenRow(g: number) {
    const ids = rows.get(g) ?? [];
    const n = ids.length;
    if (n === 0) return;
    const w = rowWidth(n);
    let x = centerX - w / 2;
    for (const id of ids) {
      xById.set(id, x);
      x += CELL;
    }
  }

  for (let g = gMin; g <= gMax; g++) {
    placeEvenRow(g);
  }

  function idealParentLeftForChild(
    childId: string,
    parentId: string,
    gParent: number
  ): number | null {
    const pars = [...(parentsOf.get(childId) ?? [])].filter(
      (p) => mainIds.has(p) && gen.get(p) === gParent
    );
    const childLeft = xById.get(childId);
    if (childLeft === undefined) return null;
    if (pars.length === 2) {
      const [p1, p2] =
        pars[0]! < pars[1]! ? [pars[0]!, pars[1]!] : [pars[1]!, pars[0]!];
      const childRight = childLeft + NODE_W;
      if (parentId === p1) {
        return childLeft - GAP_W - NODE_W;
      }
      if (parentId === p2) {
        return childRight + GAP_W;
      }
      return null;
    }
    if (pars.length === 1 && pars[0] === parentId) {
      return childLeft;
    }
    return null;
  }

  const PARENT_PASS = 6;
  for (let pass = 0; pass < PARENT_PASS; pass++) {
    for (let g = gMax; g > gMin; g--) {
      const ids = rows.get(g) ?? [];
      for (const p of ids) {
        const ch = [...(childrenOf.get(p) ?? [])].filter((c) => mainIds.has(c));
        if (ch.length === 0) continue;
        if (ch.length === 1) {
          const left = idealParentLeftForChild(ch[0]!, p, g);
          if (left != null) {
            xById.set(p, left);
          }
        } else {
          let minL = Infinity;
          let maxR = -Infinity;
          for (const c of ch) {
            const xl = xById.get(c);
            if (xl === undefined) continue;
            minL = Math.min(minL, xl);
            maxR = Math.max(maxR, xl + NODE_W);
          }
          if (minL !== Infinity) {
            const mid = (minL + maxR) / 2 - NODE_W / 2;
            xById.set(p, mid);
          }
        }
      }
    }

    for (const [a, b] of spousePairs) {
      if (!mainIds.has(a) || !mainIds.has(b)) continue;
      const ga = gen.get(a);
      const gb = gen.get(b);
      if (ga !== gb || ga === undefined) continue;
      const xa = xById.get(a);
      const xb = xById.get(b);
      if (xa === undefined || xb === undefined) continue;
      const pairW = NODE_W * 2 + GAP_W;
      const mid =
        (xa + NODE_W / 2 + xb + NODE_W / 2) / 2;
      const newLeft = mid - pairW / 2;
      if (xa <= xb) {
        xById.set(a, newLeft);
        xById.set(b, newLeft + CELL);
      } else {
        xById.set(b, newLeft);
        xById.set(a, newLeft + CELL);
      }
    }
  }

  function resolveOverlapsForGeneration(g: number) {
    const ids = [...(rows.get(g) ?? [])];
    ids.sort((a, b) => (xById.get(a) ?? 0) - (xById.get(b) ?? 0));
    for (let i = 1; i < ids.length; i++) {
      const prev = ids[i - 1]!;
      const cur = ids[i]!;
      const minAllowed = (xById.get(prev) ?? 0) + CELL;
      const xc = xById.get(cur) ?? 0;
      if (xc < minAllowed) {
        xById.set(cur, minAllowed);
      }
    }
  }

  for (let round = 0; round < 2; round++) {
    for (let g = gMin; g <= gMax; g++) {
      resolveOverlapsForGeneration(g);
    }
  }

  let minX = Infinity;
  let maxR = -Infinity;
  for (const id of mainIds) {
    const x = xById.get(id);
    if (x === undefined) continue;
    minX = Math.min(minX, x);
    maxR = Math.max(maxR, x + NODE_W);
  }
  if (minX === Infinity) {
    minX = CANVAS_PAD;
    maxR = CANVAS_PAD + NODE_W;
  }
  const shift = CANVAS_PAD - minX;
  for (const id of mainIds) {
    const x = xById.get(id);
    if (x !== undefined) {
      xById.set(id, x + shift);
    }
  }
  contentWidth = Math.max(640, maxR - minX + 2 * CANVAS_PAD);

  return { xById, contentWidth };
}

function layoutMainAndIslandPositions(
  mainIds: Set<string>,
  islandIds: string[],
  gen: Map<string, number>,
  parentsOf: Map<string, Set<string>>,
  spousePairs: [string, string][],
  gMin: number,
  gMax: number
): {
  positions: PedigreePosition[];
  contentWidth: number;
  contentHeight: number;
} {
  const rows = new Map<number, string[]>();
  for (const id of mainIds) {
    const g = gen.get(id) ?? 0;
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g)!.push(id);
  }
  for (const g of rows.keys()) {
    rows.set(
      g,
      [...(rows.get(g) ?? [])].sort((a, b) => a.localeCompare(b))
    );
  }

  const genSpan = gMax - gMin;
  const { xById, contentWidth } = computeHorizontalLayout(
    mainIds,
    gen,
    parentsOf,
    spousePairs,
    rows,
    gMin,
    gMax
  );

  const positions: PedigreePosition[] = [];
  for (let g = gMin; g <= gMax; g++) {
    const y = CANVAS_PAD + (gMax - g) * (NODE_H + GAP_V);
    for (const id of rows.get(g) ?? []) {
      positions.push({
        id,
        x: xById.get(id) ?? CANVAS_PAD,
        y,
        generation: g,
        island: false,
      });
    }
  }

  let bottomY = CANVAS_PAD + genSpan * (NODE_H + GAP_V) + NODE_H;
  if (islandIds.length > 0) {
    const w = rowWidth(islandIds.length);
    let x = contentWidth / 2 - w / 2;
    const y =
      CANVAS_PAD +
      (genSpan + 1) * (NODE_H + GAP_V) +
      ISLAND_EXTRA_GAP;
    for (const id of islandIds) {
      positions.push({ id, x, y, generation: -1, island: true });
      x += CELL;
    }
    bottomY = y + NODE_H;
  }

  return {
    positions,
    contentWidth,
    contentHeight: bottomY + CANVAS_PAD,
  };
}

export function computePedigreeLayout(
  personIds: string[],
  relationships: ParentRelationship[]
): {
  positions: PedigreePosition[];
  initialRootId: string;
  mainIds: Set<string>;
  islandIds: string[];
  contentWidth: number;
  contentHeight: number;
} {
  const personSet = new Set(personIds);
  const parentsOf = buildParentsOf(relationships);
  const spousePairs = buildSpousePairs(relationships, personSet);

  if (personIds.length === 0) {
    return {
      positions: [],
      initialRootId: "",
      mainIds: new Set(),
      islandIds: [],
      contentWidth: CANVAS_PAD * 2 + 400,
      contentHeight: CANVAS_PAD * 2 + 200,
    };
  }

  const initialRootId = pickDeepestRoot(personIds, parentsOf);
  const ancestors = collectAncestors(initialRootId, parentsOf);
  const descendants = collectDescendants(initialRootId, parentsOf, personSet);
  const mainIds = spouseClosure(
    new Set([initialRootId, ...ancestors, ...descendants]),
    spousePairs
  );

  const islandIds = personIds.filter((id) => !mainIds.has(id)).sort();

  const gen = assignGenerations(
    mainIds,
    initialRootId,
    parentsOf,
    spousePairs
  );

  let gMax = -Infinity;
  let gMin = Infinity;
  for (const id of mainIds) {
    const g = gen.get(id);
    if (g === undefined) continue;
    gMax = Math.max(gMax, g);
    gMin = Math.min(gMin, g);
  }
  if (gMax === -Infinity) {
    gMax = 0;
    gMin = 0;
  }

  const { positions, contentWidth, contentHeight } = layoutMainAndIslandPositions(
    mainIds,
    islandIds,
    gen,
    parentsOf,
    spousePairs,
    gMin,
    gMax
  );

  return {
    positions,
    initialRootId,
    mainIds,
    islandIds,
    contentWidth,
    contentHeight,
  };
}

export function layoutForRoot(
  personIds: string[],
  relationships: ParentRelationship[],
  rootId: string
): ReturnType<typeof computePedigreeLayout> {
  const personSet = new Set(personIds);
  if (!personSet.has(rootId)) {
    return computePedigreeLayout(personIds, relationships);
  }
  const parentsOf = buildParentsOf(relationships);
  const spousePairs = buildSpousePairs(relationships, personSet);
  const ancestors = collectAncestors(rootId, parentsOf);
  const descendants = collectDescendants(rootId, parentsOf, personSet);
  const mainIds = spouseClosure(
    new Set([rootId, ...ancestors, ...descendants]),
    spousePairs
  );
  const islandIds = personIds.filter((id) => !mainIds.has(id)).sort();

  const gen = assignGenerations(mainIds, rootId, parentsOf, spousePairs);
  let gMax = -Infinity;
  let gMin = Infinity;
  for (const id of mainIds) {
    const g = gen.get(id);
    if (g === undefined) continue;
    gMax = Math.max(gMax, g);
    gMin = Math.min(gMin, g);
  }
  if (gMax === -Infinity) {
    gMax = 0;
    gMin = 0;
  }

  const { positions, contentWidth, contentHeight } = layoutMainAndIslandPositions(
    mainIds,
    islandIds,
    gen,
    parentsOf,
    spousePairs,
    gMin,
    gMax
  );

  return {
    positions,
    initialRootId: rootId,
    mainIds,
    islandIds,
    contentWidth,
    contentHeight,
  };
}
