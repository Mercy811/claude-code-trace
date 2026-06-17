import { useMemo } from "react";
import type { SessionInfo } from "../types";
import { useScrollToSelected } from "../hooks/useScrollToSelected";
import { RefreshIcon, GitBranchIcon, GitMergeIcon } from "./Icons";
import { OngoingDots } from "./OngoingDots";
import { buildFlatItems, filterFlatItems } from "../../shared/projectTree";
import type { FlatItem } from "../../shared/projectTree";

/** Stable no-op default so the prop doesn't create a new reference each render. */
const noop = () => {};

interface ProjectTreeProps {
  sessions: SessionInfo[];
  selectedProject: string | null;
  highlightedIndex?: number;
  isFocused?: boolean;
  collapsedKeys?: ReadonlySet<string>;
  searchQuery?: string;
  searchInputRef?: React.Ref<HTMLInputElement>;
  onSelectProject: (project: string | null) => void;
  onToggleCollapse?: (key: string) => void;
  onSearchChange?: (query: string) => void;
  onRefresh: () => void;
  onFocus?: () => void;
  refreshing?: boolean;
  style?: React.CSSProperties;
}

/**
 * The flat list of items as displayed in the tree, after applying the name
 * filter. When a search is active the collapse state is ignored so matches
 * inside collapsed subtrees are still found (searching implicitly expands the
 * tree); with no search, collapse state is honoured as normal.
 */
export function visibleProjectItems(
  sessions: SessionInfo[],
  collapsedKeys?: ReadonlySet<string>,
  search?: string,
): FlatItem[] {
  const q = (search ?? "").trim();
  const flat = buildFlatItems(sessions, q ? undefined : collapsedKeys);
  return filterFlatItems(flat, q);
}

/**
 * Returns the ordered list of selectable keys as displayed in the tree.
 * Index 0 = null ("All Projects"), then project keys and group keys in tree order.
 * When `search` is set, the list is filtered to match the displayed (filtered) tree.
 */
export function useProjectKeys(
  sessions: SessionInfo[],
  collapsedKeys?: ReadonlySet<string>,
  search?: string,
): (string | null)[] {
  return useMemo(
    () => visibleProjectItems(sessions, collapsedKeys, search).map((f) => f.key),
    [sessions, collapsedKeys, search],
  );
}

/** Returns the full FlatItem list as displayed in the tree (filtered by `search`). */
export function useProjectItems(
  sessions: SessionInfo[],
  collapsedKeys?: ReadonlySet<string>,
  search?: string,
): FlatItem[] {
  return useMemo(
    () => visibleProjectItems(sessions, collapsedKeys, search),
    [sessions, collapsedKeys, search],
  );
}

// Horizontal spacing per depth level (px).
const DEPTH_STEP = 14;
// Left-edge base padding before any depth indentation (px).
const BASE_PADDING = 8;
// Width reserved for the toggle button column (px).
const TOGGLE_WIDTH = 18;

// The border-left on .project-tree__item is 2px, which shifts content right
// beyond paddingLeft. Account for it so guide lines align with toggle centres.
const BORDER_LEFT = 2;

function itemStyle(depth: number): React.CSSProperties {
  return { paddingLeft: BASE_PADDING + depth * DEPTH_STEP };
}

// Horizontal position of depth-level i's toggle centre.
function toggleCentre(i: number): number {
  return BASE_PADDING + i * DEPTH_STEP + BORDER_LEFT + Math.floor(TOGGLE_WIDTH / 2);
}

/**
 * Renders one guide span per ancestor depth level.
 * - Spans 0 … depth-2: full-height vertical rail (continuous line for siblings).
 * - Span depth-1 (the last one): vertical line + horizontal arm to the toggle,
 *   forming an L-connector.
 */
function GuideLines({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          className={`project-tree__guide${i === depth - 1 ? " project-tree__guide--last" : ""}`}
          style={{ left: toggleCentre(i) }}
        />
      ))}
    </>
  );
}

export function ProjectTree({
  sessions,
  selectedProject,
  highlightedIndex = 0,
  isFocused = false,
  collapsedKeys,
  searchQuery = "",
  searchInputRef,
  onSelectProject,
  onToggleCollapse = noop,
  onSearchChange = noop,
  onRefresh,
  onFocus,
  refreshing,
  style,
}: ProjectTreeProps) {
  const allItems = useMemo(
    () => visibleProjectItems(sessions, collapsedKeys, searchQuery),
    [sessions, collapsedKeys, searchQuery],
  );

  const scrollRef = useScrollToSelected(highlightedIndex);
  // Only "All Projects" survives the filter → no real matches.
  const noMatches = searchQuery.trim() !== "" && allItems.every((it) => it.key === null);

  return (
    <div
      className={`project-tree${isFocused ? " project-tree--focused" : ""}`}
      style={style}
      onClick={onFocus}
    >
      <div className="project-tree__header">
        <span>Projects</span>
        <button
          className={`project-tree__refresh${refreshing ? " project-tree__refresh--spinning" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          title="Refresh all projects"
        >
          <RefreshIcon />
        </button>
      </div>
      <div className="project-tree__search-row">
        <input
          ref={searchInputRef}
          className="project-tree__search"
          type="text"
          placeholder="Filter projects... (/)"
          aria-label="Filter projects"
          value={searchQuery}
          spellCheck={false}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears the query, or blurs the box once it is already empty.
            if (e.key === "Escape") {
              if (searchQuery) onSearchChange("");
              else e.currentTarget.blur();
            }
          }}
        />
      </div>
      {noMatches && <div className="project-tree__empty">No matching projects</div>}
      <div className="project-tree__list">
        {allItems.map((item, idx) => {
          const isSelected = !item.isGroup && selectedProject === item.key;
          const isHighlighted = isFocused && idx === highlightedIndex;
          const canToggle = item.hasChildren && item.key != null;

          return (
            <div
              key={item.key ?? "__all__"}
              ref={isHighlighted ? scrollRef : undefined}
              className={[
                "project-tree__item",
                isSelected ? "project-tree__item--selected" : "",
                isHighlighted ? "project-tree__item--highlighted" : "",
                item.depth > 0 ? "project-tree__item--child" : "",
                item.isGroup ? "project-tree__item--group" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={itemStyle(item.depth)}
              onClick={item.isGroup ? undefined : () => onSelectProject(item.key)}
            >
              {/* Ancestor guide rails + L-connector to the toggle. */}
              <GuideLines depth={item.depth} />

              {/* Toggle button — always occupies the same fixed column. */}
              <span
                className={`project-tree__toggle${canToggle ? " project-tree__toggle--active" : ""}`}
                onClick={
                  canToggle
                    ? (e) => {
                        e.stopPropagation();
                        onToggleCollapse(item.key!);
                      }
                    : undefined
                }
                role={canToggle ? "button" : undefined}
                aria-label={canToggle ? (item.isExpanded ? "Collapse" : "Expand") : undefined}
                aria-expanded={canToggle ? item.isExpanded : undefined}
              >
                {canToggle ? (item.isExpanded ? "\u25be" : "\u25b8") : ""}
              </span>

              <span
                className="project-tree__name"
                title={item.isGroup ? undefined : (item.key ?? undefined)}
              >
                {item.isGroup && (
                  <span className="project-tree__group-icon">
                    {item.name === "worktrees" ? <GitBranchIcon /> : <GitMergeIcon />}
                  </span>
                )}
                {item.name}
              </span>

              <span className="project-tree__meta">
                {item.ongoing && <OngoingDots count={1} />}
                <span className="project-tree__count">{item.count}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
