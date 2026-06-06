import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoadError } from "@/components/shared/load-error";

describe("LoadError", () => {
  it("uses human, connection-framed copy with no developer/DB jargon", () => {
    render(<LoadError subject="calendar" />);
    expect(screen.getByText(/we couldn't load your calendar/i)).toBeInTheDocument();
    expect(screen.getByText(/check your connection/i)).toBeInTheDocument();
    // The old "schema applied and seeded" hint must NOT reach the user.
    expect(screen.queryByText(/schema|seeded/i)).toBeNull();
  });

  it("omits the Retry button when no handler is provided", () => {
    render(<LoadError subject="tasks" />);
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("calls onRetry when Try again is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<LoadError subject="calendar" onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
