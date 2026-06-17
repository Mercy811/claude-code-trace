# Spec: Web Frontend

**Locations**: `src/`, `shared/`

The web frontend is a React 18 app built with Vite. It runs inside the Tauri WebView for the
desktop mode, or as a standalone browser page served by the Rust HTTP backend.

All data comes from either Tauri IPC (`invoke`) or HTTP REST+SSE (`fetch`/`EventSource`),
selected at runtime by `src/lib/isTauri.ts`.

---

## Component Hierarchy

```mermaid
graph TB
    APP["App.tsx\n(root — router + state)"]

    subgraph LeftPanel["Left Panel"]
        PT["ProjectTree\n(sidebar)"]
    end

    subgraph RightPanel["Right Panel / Views"]
        SP["SessionPicker"]
        ML["MessageList"]
        MD["MessageDetail\n(split panels)"]
        TB["TeamBoard"]
        DV["DebugViewer"]
    end

    subgraph SharedUI["Shared UI"]
        IB["InfoBar\n(top status)"]
        VT["ViewToolbar\n(action buttons)"]
        KB["KeybindBar\n(bottom hints)"]
        PO["PopoutModal\n(resize/overlay)"]
        SM["SettingsModal"]
    end

    APP --> PT
    APP --> SP
    APP --> ML
    APP --> MD
    APP --> TB
    APP --> DV
    APP --> IB
    APP --> VT
    APP --> KB
    APP --> PO
    APP --> SM
```

---

## View State Machine

```mermaid
stateDiagram-v2
    [*] --> picker : app start
    picker --> list : select session
    list --> detail : select message\n(Enter)
    list --> team : press T\n(teams exist)
    list --> debug : press D
    detail --> list : press Q/Esc
    team --> list : press Q/Esc
    debug --> list : press Q/Esc
    list --> picker : press Q/Esc
```

---

## Hook Architecture

### `useSession` — Session State

Manages the full lifecycle of a loaded session: loading, live updates, teams, metadata.

```mermaid
flowchart TD
    PATH["session path\n(prop)"]
    PATH --> LOAD["invoke/fetch\nload_session()"]
    LOAD --> STATE["messages, teams\nmeta, totals, ongoing\ngit, debug"]
    STATE --> LISTEN["listen / SSE\n'session-update'"]
    LISTEN --> STATE
```

Key responsibilities:

- Initial load via `invoke("load_session", ...)` (Tauri) or `POST /api/session/load`
- Subscribe to `session-update` events and merge diffs
- Start/stop session watcher (`watch_session` / `unwatch_session`)
- Fetch git info and debug log on demand

---

### `usePicker` — Session Discovery

```mermaid
flowchart TD
    DIRS["project dirs\n(from settings)"]
    DIRS --> DISC["invoke/fetch\ndiscover_sessions()"]
    DISC --> SESSIONS["SessionInfo[]"]
    SESSIONS --> FILTER["filter by search text\n+ project key"]
    FILTER --> DISPLAY["Picker UI"]
    LISTEN["listen / SSE\n'picker-refresh'"] --> DISC
```

---

### `useKeyboard` — Global Keyboard Handler

Routes key events to the active view. Ignores events targeting `INPUT`, `TEXTAREA`, and
`contentEditable` elements.

```mermaid
flowchart LR
    KEY["keydown event"]
    KEY --> GUARD{"target is\ntext input?"}
    GUARD -->|"yes"| SKIP["ignore"]
    GUARD -->|"no"| CB["callback(key, modifiers)"]
    CB --> VIEW["view-specific handler\nin App.tsx"]
```

---

### `useAutoScroll` — Smart Auto-Scroll

Auto-scrolls the message list when new messages arrive, but only if the user is near the bottom.

```mermaid
flowchart LR
    MO["MutationObserver\n(childList on container)"]
    MO --> CHK{"user within\n100 px of bottom?"}
    CHK -->|"yes"| SCROLL["scrollTo(bottom)"]
    CHK -->|"no"| NOOP["preserve position\n(user scrolled up)"]
```

---

### `useScrollToSelected` — Selection Scroll

Scrolls the selected item into view when the selection changes.

```mermaid
flowchart LR
    SEL["selectedIndex\nchanges"]
    SEL --> REF["element.getBoundingClientRect()"]
    REF --> POS{"position relative\nto scroll container?"}
    POS -->|"above or taller than view"| TOP["scrollIntoView\n(block: start)"]
    POS -->|"below"| NEAR["scrollIntoView\n(block: nearest)"]
    POS -->|"fully visible"| NOOP["no-op"]
```

---

### `useViewActions` — Expand/Collapse Delegation

Decouples the toolbar's "Expand All / Collapse All" buttons from the active view component.

```mermaid
flowchart LR
    TB["ViewToolbar\n(calls useViewActionCallbacks)"]
    TB -->|"expandAll()"| SLOT["actions ref"]
    SLOT -->|"dispatch"| ML["MessageList\n(useRegisterViewActions)"]
```

The toolbar holds a stable ref. The active view registers its handlers. When the toolbar fires,
the view's handler executes without a re-render cycle.

---

### `useTauriEvent` — Event Subscription

Generic hook that subscribes to a named Tauri event and calls a handler on each emission.
Handles unlisten cleanup on unmount and AbortController for in-flight async operations.

---

### `useToggleSet` — Expand State

A `Set<number>` backed by React state. Supports:

- `toggle(i)` — flip single index
- `setAll(items)` — expand all
- `clear()` — collapse all

Shared between web and TUI (lives in `shared/hooks/useToggleSet.ts`).

---

## Key Components

### `MessageDetail` — Multi-Panel Detail View

The most complex component. Shows items from a selected message and supports recursive subagent
drill-down.

```mermaid
flowchart LR
    subgraph Panel_Stack
        P0["Panel 0\nMessage items"]
        P1["Panel 1\nSubagent messages"]
        P2["Panel 2\nSubagent items"]
    end

    P0 -->|"Enter on Subagent item"| P1
    P1 -->|"Enter on message"| P2
    P2 -->|"Esc"| P1
    P1 -->|"Esc"| P0
```

Layout: horizontally resizable two-column split.

- Left column: item list (tools, thinking, outputs)
- Right column: selected item detail (JSON viewer, markdown, etc.)

Keyboard navigation:

- `j/k` — move between items (within focused panel)
- `h/l` — switch left/right panel focus
- `Enter` — drill into subagent
- `Esc/q` — pop panel
- `Tab` — expand/collapse selected item
- `e/c` — expand/collapse all items

---

### `ProjectTree` — Hierarchical Session Browser

Groups sessions by project key, nesting worktree sessions under their parent.

```mermaid
graph TD
    ROOT["Project Tree"]
    ROOT --> P1["my-app"]
    P1 --> S1["session 1"]
    P1 --> S2["session 2 (ongoing)"]
    P1 --> WT["my-app--worktree-branch"]
    WT --> S3["session 3"]
    ROOT --> P2["other-project"]
    P2 --> S4["session 4"]
```

Project key derivation is in `shared/projectTree.ts`:

- Split path by `--` to get hierarchy segments
- Each segment becomes a tree node
- Worktrees become children of the base project

---

### `SessionPicker` — Session List with Search

Displays all sessions grouped by date with token/cost stats.
Supports text search and project filtering (via `ProjectTree` selection).

---

### `SettingsModal` — User Preferences

A `PopoutModal` exposing user-configurable preferences:

- **Appearance** — light/dark theme toggle. The choice applies immediately (live preview)
  and persists to `localStorage` under `cctrace-theme`, independent of the Save button.
- **Projects Directory** — overrides the discovery root; saved via `set_projects_dir`.

Theme handling lives in `src/lib/themeMode.ts`:

- `initTheme()` runs in `main.tsx` before first paint, reading the persisted preference and
  setting `data-theme` on the document root (defaulting to `dark`).
- `setTheme(mode)` persists and applies in one call.
- The palette switch is pure CSS: `:root` holds the dark tokens; `:root[data-theme="light"]`
  overrides only the structural surface/text/border tokens. Semantic accent colors (model
  family, context gradient, pills, icons) are intentionally shared across themes to stay in
  sync with the inline colors in `src/lib/theme.ts`.

---

### `InfoBar` — Session Metadata

Top bar showing: project · session_id (8 chars) · git branch · permission mode ·
context % · tokens · cost · ongoing spinner.

Context % uses a colour gradient:

- `< 50%` → green
- `50–80%` → orange
- `> 80%` → red

---

### `DetailItem` — Item Renderer

Renders a single `DisplayItem` with expandable body:

| Item type         | Collapsed preview | Expanded body                 |
| ----------------- | ----------------- | ----------------------------- |
| `Thinking`        | token count       | full thinking text            |
| `Output`          | first line        | full text / markdown          |
| `ToolCall`        | tool_summary      | tool_input JSON + tool_result |
| `Subagent`        | agent type + desc | subagent messages (recursive) |
| `TeammateMessage` | first line        | full text                     |
| `HookEvent`       | hook_name         | key-value pairs + metadata    |

---

## Tauri / HTTP Abstraction

`src/lib/invoke.ts` and `src/lib/listen.ts` provide a unified API that switches
between Tauri IPC and HTTP fetch/EventSource at runtime.

```mermaid
flowchart LR
    CODE["Component / Hook"]
    CODE --> INVOKE["invoke(cmd, args)"]
    INVOKE --> IS_TAURI{"isTauri()?"}
    IS_TAURI -->|"yes"| TAURI_IPC["@tauri-apps/api invoke()"]
    IS_TAURI -->|"no"| HTTP_FETCH["fetch('/api/...')"]
```

```mermaid
flowchart LR
    CODE["Component / Hook"]
    CODE --> LISTEN["listen(event, handler)"]
    LISTEN --> IS_TAURI{"isTauri()?"}
    IS_TAURI -->|"yes"| TAURI_EVT["@tauri-apps/api event.listen()"]
    IS_TAURI -->|"no"| SSE["EventSource /api/events\nfiltered by event name"]
```

---

## Frontend Data Types

All types are defined in `shared/types.ts` and shared with the TUI.
See [07-data-types.md](07-data-types.md) for full type definitions.

---

## Build Configuration

```mermaid
flowchart LR
    VITE["vite.config.ts"]
    VITE -->|"VITE_HEADLESS=1"| HEADLESS["headless build\n(no window chrome)"]
    VITE -->|"default"| NORMAL["normal build\n(desktop/browser)"]
    VITE -->|"VITE_PORT env var"| PORT["dynamic port\n(multi-instance dev)"]
```

Static assets are served from `dist/` when `CCTRACE_STATIC_DIR` is set in the Rust backend.

---

## Related Specs

- [04-http-api.md](04-http-api.md) — API consumed by this frontend
- [07-data-types.md](07-data-types.md) — shared type system
- [08-session-lifecycle.md](08-session-lifecycle.md) — loading + live update flow
- [13-item-rendering.md](13-item-rendering.md) — per-item rendering details (icons, bodies, expansion)
