import type { ViewState } from "../types";
import { BackIcon } from "./Icons";
import { IoMdSettings } from "react-icons/io";
import { isTauri } from "../lib/isTauri";
import { invoke } from "../lib/invoke";

interface ViewToolbarProps {
  view: ViewState;
  hasTeams: boolean;
  hasSession: boolean;
  onGoToSessions: () => void;
  onOpenTeams: () => void;
  onOpenDebug: () => void;
  onBackToList: () => void;
  onOpenSettings: () => void;
}

function RightButtons({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <>
      <span className="view-toolbar__spacer" />
      {isTauri && (
        <button
          className="view-toolbar__btn"
          onClick={async () => {
            try {
              await invoke("switch_to_browser");
            } catch {}
          }}
          title="Open in browser and hide this window"
        >
          Open in Browser
        </button>
      )}
      <button className="view-toolbar__btn" onClick={onOpenSettings} title="Settings">
        <IoMdSettings />
      </button>
    </>
  );
}

export function ViewToolbar({
  view,
  hasTeams,
  hasSession,
  onGoToSessions,
  onOpenTeams,
  onOpenDebug,
  onBackToList,
  onOpenSettings,
}: ViewToolbarProps) {
  if (view === "list") {
    return (
      <div className="view-toolbar">
        <button className="view-toolbar__btn" onClick={onGoToSessions}>
          <BackIcon /> Sessions
        </button>
        <span className="view-toolbar__separator" />
        {hasTeams && (
          <button className="view-toolbar__btn" onClick={onOpenTeams}>
            Teams
          </button>
        )}
        <button className="view-toolbar__btn" onClick={onOpenDebug}>
          Debug
        </button>
        <RightButtons onOpenSettings={onOpenSettings} />
      </div>
    );
  }

  if (view === "picker") {
    return (
      <div className="view-toolbar">
        {hasSession && (
          <button className="view-toolbar__btn" onClick={onBackToList}>
            <BackIcon /> Back to Messages
          </button>
        )}
        <RightButtons onOpenSettings={onOpenSettings} />
      </div>
    );
  }

  // detail, team, debug
  return (
    <div className="view-toolbar">
      <button className="view-toolbar__btn" onClick={onBackToList}>
        <BackIcon /> Back to Messages
      </button>
      <RightButtons onOpenSettings={onOpenSettings} />
    </div>
  );
}
