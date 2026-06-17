/**
 * Pure tree-building logic for the project sidebar.
 * Shared between the web UI and TUI — no React, no DOM.
 */

import type { SessionInfo } from "./types.js";
import { projectKey, projectDisplayName, shortPath } from "./format.js";

// ---- ProjectNode ----

export interface ProjectNode {
  name: string;
  key: string;
  sessionCount: number;
  hasOngoing: boolean;
}

export function buildProjectNodes(sessions: SessionInfo[]): ProjectNode[] {
  const map = new Map<string, ProjectNode>();
  for (const s of sessions) {
    const key = projectKey(s.path);
    const existing = map.get(key);
    if (existing) {
      existing.sessionCount++;
      if (s.is_ongoing) existing.hasOngoing = true;
    } else {
      map.set(key, {
        name: shortPath(s.cwd) || projectDisplayName(key),
        key,
        sessionCount: 1,
        hasOngoing: s.is_ongoing,
      });
    }
  }
  return [...map.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

// ---- TreeNode ----

export interface TreeNode {
  node: ProjectNode;
  children: TreeNode[];
}

export function treeNodeCmp(a: TreeNode, b: TreeNode): number {
  return a.node.name.localeCompare(b.node.name);
}

/** The repo-portion of a worktree key: everything before the first worktree marker, or null. */
function worktreeRootKey(key: string): string | null {
  for (const marker of ["--claude-worktrees-", "--worktrees-"]) {
    const i = key.indexOf(marker);
    if (i > 0) return key.slice(0, i);
  }
  return null;
}

/** True when some other key is a prefix-ancestor of `key` (i.e. a real session can anchor it). */
function hasRealAncestor(key: string, keys: ReadonlySet<string>): boolean {
  for (const k of keys) if (k !== key && key.startsWith(k + "-")) return true;
  return false;
}

export function buildTree(nodes: ProjectNode[]): TreeNode[] {
  // A worktree session whose orchestrator never opens a session at the repo root (headless
  // / deterministic runs that only ever execute agent phases inside per-item worktrees) has
  // no ancestor node to nest under, so it would orphan as a flat root. Synthesize the
  // repo-root node from the worktree key so it anchors and groups like an anchored run; the
  // synthesized node flows through the normal parenting/intermediate/flatten logic below.
  const keys = new Set(nodes.map((n) => n.key));
  const synthesized = new Map<string, ProjectNode>();
  for (const node of nodes) {
    const rootKey = worktreeRootKey(node.key);
    if (rootKey && !keys.has(rootKey) && !hasRealAncestor(node.key, keys)) {
      synthesized.set(rootKey, {
        name: projectDisplayName(rootKey),
        key: rootKey,
        sessionCount: 0,
        hasOngoing: false,
      });
    }
  }
  const input = synthesized.size ? [...nodes, ...synthesized.values()] : nodes;

  const sorted = [...input].toSorted((a, b) => a.key.length - b.key.length);
  const roots: TreeNode[] = [];
  const all: TreeNode[] = [];

  for (const node of sorted) {
    let parent: TreeNode | undefined;
    for (const candidate of all) {
      if (
        node.key.startsWith(candidate.node.key + "-") &&
        (!parent || candidate.node.key.length > parent.node.key.length)
      ) {
        parent = candidate;
      }
    }

    const tn: TreeNode = { node, children: [] };
    all.push(tn);

    if (parent) {
      // Split the suffix by "--" to find intermediate path segments.
      // e.g. parent="-Users-me-proj", child="-Users-me-proj-svc--claude-worktrees-foo"
      // suffix="-svc--claude-worktrees-foo" → parts=["-svc","claude-worktrees-foo"]
      // intermediates=["svc"] → virtual node inserted between parent and child.
      const suffix = node.key.slice(parent.node.key.length);
      const suffixParts = suffix.split("--");
      const intermediates = suffixParts
        .slice(0, -1)
        .map((s) => s.replace(/^-+/, ""))
        .filter((s) => s.length > 0);

      if (intermediates.length > 0) {
        let attachTo = parent;
        for (const seg of intermediates) {
          const virtualKey = `__virtual:${attachTo.node.key}:${seg}`;
          let vn = attachTo.children.find((c) => c.node.key === virtualKey);
          if (!vn) {
            vn = {
              node: { name: seg, key: virtualKey, sessionCount: 0, hasOngoing: false },
              children: [],
            };
            attachTo.children.push(vn);
            all.push(vn);
          }
          vn.node = {
            ...vn.node,
            sessionCount: vn.node.sessionCount + node.sessionCount,
            hasOngoing: vn.node.hasOngoing || node.hasOngoing,
          };
          attachTo = vn;
        }
        attachTo.children.push(tn);
      } else {
        const childLabel =
          node.key.slice(parent.node.key.length).replace(/^-+/, "") || projectDisplayName(node.key);
        tn.node = { ...node, name: node.name || childLabel };
        parent.children.push(tn);
      }
    } else {
      roots.push(tn);
    }
  }

  roots.sort(treeNodeCmp);
  for (const r of all) r.children.sort(treeNodeCmp);
  return roots;
}

// ---- Worktree helpers ----

export type WorktreeKind = "worktrees" | "claude-worktrees";

export function detectWorktreeKind(parentKey: string, childKey: string): WorktreeKind | null {
  // New style: key contains "--" — detect from the last "--"-separated segment.
  const parts = childKey.split("--");
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last.startsWith("claude-worktrees")) return "claude-worktrees";
    if (last.startsWith("worktrees")) return "worktrees";
    return null;
  }
  // Old style: single-dash suffix relative to parent key.
  const rest = childKey.slice(parentKey.length);
  if (rest.startsWith("--claude-worktrees-")) return "claude-worktrees";
  if (rest.startsWith("-worktrees-")) return "worktrees";
  return null;
}

export function worktreeLeafName(parentKey: string, childKey: string, kind: WorktreeKind): string {
  // New style: extract leaf from last "--"-separated segment.
  const parts = childKey.split("--");
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    const prefix = kind === "claude-worktrees" ? "claude-worktrees-" : "worktrees-";
    return last.startsWith(prefix) ? last.slice(prefix.length) : projectDisplayName(childKey);
  }
  // Old style: slice past the worktree prefix from the parent key.
  const prefixLen =
    kind === "claude-worktrees" ? "--claude-worktrees-".length : "-worktrees-".length;
  return (
    childKey.slice(parentKey.length + prefixLen).replace(/^-+/, "") || projectDisplayName(childKey)
  );
}

// ---- FlatItem ----

export interface FlatItem {
  key: string | null;
  name: string;
  count: number;
  ongoing: boolean;
  depth: number;
  isGroup: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

export function flattenTree(roots: TreeNode[], collapsedKeys?: ReadonlySet<string>): FlatItem[] {
  const items: FlatItem[] = [];

  function walk(nodes: TreeNode[], depth: number) {
    for (const tn of nodes) {
      const isCollapsed = collapsedKeys?.has(tn.node.key) ?? false;
      const hasChildren = tn.children.length > 0;

      items.push({
        key: tn.node.key,
        name: tn.node.name,
        count: tn.node.sessionCount,
        ongoing: tn.node.hasOngoing,
        depth,
        isGroup: false,
        hasChildren,
        isExpanded: !isCollapsed,
      });

      if (isCollapsed) continue;

      // Categorise children into worktree groups and regular
      const groups = new Map<WorktreeKind, TreeNode[]>();
      const regular: TreeNode[] = [];
      for (const child of tn.children) {
        const kind = detectWorktreeKind(tn.node.key, child.node.key);
        if (kind) {
          let list = groups.get(kind);
          if (!list) {
            list = [];
            groups.set(kind, list);
          }
          list.push(child);
        } else {
          regular.push(child);
        }
      }

      // Emit worktree group headers + their children
      for (const [kind, children] of groups) {
        const totalCount = children.reduce((s, c) => s + c.node.sessionCount, 0);
        const anyOngoing = children.some((c) => c.node.hasOngoing);
        const groupKey = `__group:${kind}:${tn.node.key}`;
        const groupIsCollapsed = collapsedKeys?.has(groupKey) ?? false;

        items.push({
          key: groupKey,
          name: kind,
          count: totalCount,
          ongoing: anyOngoing,
          depth: depth + 1,
          isGroup: true,
          hasChildren: children.length > 0,
          isExpanded: !groupIsCollapsed,
        });

        if (!groupIsCollapsed) {
          for (const child of children) {
            const childIsCollapsed = collapsedKeys?.has(child.node.key) ?? false;
            items.push({
              key: child.node.key,
              name: worktreeLeafName(tn.node.key, child.node.key, kind),
              count: child.node.sessionCount,
              ongoing: child.node.hasOngoing,
              depth: depth + 2,
              isGroup: false,
              hasChildren: child.children.length > 0,
              isExpanded: !childIsCollapsed,
            });
            if (!childIsCollapsed) walk(child.children, depth + 3);
          }
        }
      }

      walk(regular, depth + 1);
    }
  }

  walk(roots, 0);
  return items;
}

/**
 * Filters a flat tree (as produced by `flattenTree`/`buildFlatItems`) by a
 * name query. A node is kept when it matches, when any of its descendants
 * match (so the path to a match stays visible), or when it is an ancestor of a
 * match. Matching is case-insensitive substring on the display name, so it
 * works for project names, worktree leaf names, and group headers alike.
 *
 * The "All Projects" root (key === null) is always kept as a reset affordance.
 * An empty/whitespace query returns the input unchanged.
 */
export function filterFlatItems(items: FlatItem[], query: string): FlatItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  const n = items.length;
  const match = items.map((it) => it.name.toLowerCase().includes(q));
  const keep: boolean[] = Array.from({ length: n }, () => false);

  // Keep every match plus its whole subtree (the contiguous run of deeper items).
  for (let i = 0; i < n; i++) {
    if (!match[i]) continue;
    keep[i] = true;
    for (let j = i + 1; j < n && items[j].depth > items[i].depth; j++) {
      keep[j] = true;
    }
  }

  // Keep ancestors of every match using a stack of currently-open ancestors.
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    while (stack.length > 0 && items[stack[stack.length - 1]].depth >= items[i].depth) {
      stack.pop();
    }
    if (match[i]) {
      for (const a of stack) keep[a] = true;
    }
    stack.push(i);
  }

  // Always keep "All Projects" so the user can clear the filter from the tree.
  for (let i = 0; i < n; i++) {
    if (items[i].key === null) keep[i] = true;
  }

  return items.filter((_, i) => keep[i]);
}

// ---- Convenience ----

/** Chains buildProjectNodes -> buildTree -> flattenTree and prepends "All Projects". */
export function buildFlatItems(
  sessions: SessionInfo[],
  collapsedKeys?: ReadonlySet<string>,
): FlatItem[] {
  const nodes = buildProjectNodes(sessions);
  const tree = buildTree(nodes);
  const flat = flattenTree(tree, collapsedKeys);
  return [
    {
      key: null,
      name: "All Projects",
      count: sessions.length,
      ongoing: false,
      depth: 0,
      isGroup: false,
      hasChildren: false,
      isExpanded: true,
    },
    ...flat,
  ];
}
