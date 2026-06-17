import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewToolbar } from "./ViewToolbar";

function defaultProps(overrides: Partial<Parameters<typeof ViewToolbar>[0]> = {}) {
  return {
    view: "list" as const,
    hasTeams: false,
    hasSession: false,
    onGoToSessions: vi.fn(),
    onOpenTeams: vi.fn(),
    onOpenDebug: vi.fn(),
    onBackToList: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };
}

describe("ViewToolbar", () => {
  describe("common chrome on all views", () => {
    for (const view of ["list", "picker", "detail", "team", "debug"] as const) {
      it(`${view} view shows the Settings button`, () => {
        render(<ViewToolbar {...defaultProps({ view, hasSession: true })} />);
        expect(screen.getByTitle("Settings")).toBeInTheDocument();
      });

      it(`${view} view does not render the removed Expand/Collapse/Top/Bottom buttons`, () => {
        render(<ViewToolbar {...defaultProps({ view, hasSession: true })} />);
        expect(screen.queryByText("Expand All")).not.toBeInTheDocument();
        expect(screen.queryByText("Collapse All")).not.toBeInTheDocument();
        expect(screen.queryByText("Top")).not.toBeInTheDocument();
        expect(screen.queryByText("Bottom")).not.toBeInTheDocument();
      });
    }
  });

  describe("list view", () => {
    it("shows Sessions, Teams, Debug buttons", () => {
      render(<ViewToolbar {...defaultProps({ hasTeams: true })} />);
      expect(screen.getByText(/Sessions/)).toBeInTheDocument();
      expect(screen.getByText("Teams")).toBeInTheDocument();
      expect(screen.getByText("Debug")).toBeInTheDocument();
    });

    it("hides Teams button when hasTeams=false", () => {
      render(<ViewToolbar {...defaultProps({ hasTeams: false })} />);
      expect(screen.queryByText("Teams")).not.toBeInTheDocument();
    });

    it("calls correct callbacks when buttons clicked", () => {
      const props = defaultProps({ hasTeams: true });
      render(<ViewToolbar {...props} />);

      fireEvent.click(screen.getByText(/Sessions/));
      expect(props.onGoToSessions).toHaveBeenCalled();

      fireEvent.click(screen.getByText("Teams"));
      expect(props.onOpenTeams).toHaveBeenCalled();

      fireEvent.click(screen.getByText("Debug"));
      expect(props.onOpenDebug).toHaveBeenCalled();
    });
  });

  describe("picker view", () => {
    it("shows Back to Messages when hasSession=true", () => {
      render(<ViewToolbar {...defaultProps({ view: "picker", hasSession: true })} />);
      expect(screen.getByText(/Back to Messages/)).toBeInTheDocument();
    });

    it("calls onBackToList when Back to Messages clicked", () => {
      const props = defaultProps({ view: "picker", hasSession: true });
      render(<ViewToolbar {...props} />);
      fireEvent.click(screen.getByText(/Back to Messages/));
      expect(props.onBackToList).toHaveBeenCalled();
    });
  });

  describe("detail/team/debug views", () => {
    for (const view of ["detail", "team", "debug"] as const) {
      it(`${view} view shows Back to Messages`, () => {
        render(<ViewToolbar {...defaultProps({ view })} />);
        expect(screen.getByText(/Back to Messages/)).toBeInTheDocument();
      });
    }

    it("calls onBackToList when back clicked in detail view", () => {
      const props = defaultProps({ view: "detail" });
      render(<ViewToolbar {...props} />);
      fireEvent.click(screen.getByText(/Back to Messages/));
      expect(props.onBackToList).toHaveBeenCalled();
    });
  });
});
