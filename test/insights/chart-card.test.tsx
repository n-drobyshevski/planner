import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "../test-utils";
import userEvent from "@testing-library/user-event";
import { ChartCard, type ChartSettings } from "@/components/insights/chart-card";

const VIEWER = "viewer-1";

function lastSettings(calls: ChartSettings[]): ChartSettings {
  return calls[calls.length - 1];
}

function renderCard(
  props: Partial<React.ComponentProps<typeof ChartCard>> = {},
): ChartSettings[] {
  const calls: ChartSettings[] = [];
  render(
    <ChartCard
      id="test-chart"
      viewerId={VIEWER}
      title="Per day"
      headline="8h tracked — up 12% vs the previous period."
      {...props}
    >
      {(settings) => {
        calls.push(settings);
        return <div data-testid="chart" data-type={settings.chartType} />;
      }}
    </ChartCard>,
  );
  return calls;
}

beforeEach(() => {
  localStorage.clear();
});

describe("ChartCard", () => {
  it("renders the takeaway headline and the chart content", () => {
    renderCard();
    expect(
      screen.getByText("8h tracked — up 12% vs the previous period."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("shows no controls button when there is nothing to control", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: /chart options/i })).toBeNull();
  });

  it("switches chart type and persists it for the next mount", async () => {
    const user = userEvent.setup();
    const calls = renderCard({ chartTypes: ["bar", "line", "area"] });
    expect(lastSettings(calls).chartType).toBe("bar");

    await user.click(screen.getByRole("button", { name: /chart options/i }));
    await user.click(screen.getByRole("radio", { name: /line chart/i }));
    expect(lastSettings(calls).chartType).toBe("line");

    // A fresh mount under the same viewer + chart id restores the choice.
    const calls2 = renderCard({ chartTypes: ["bar", "line", "area"] });
    expect(lastSettings(calls2).chartType).toBe("line");
  });

  it("toggles the previous-period comparison and persists it", async () => {
    const user = userEvent.setup();
    const calls = renderCard({ comparison: true });
    expect(lastSettings(calls).showComparison).toBe(false);

    await user.click(screen.getByRole("button", { name: /chart options/i }));
    await user.click(screen.getByRole("switch"));
    expect(lastSettings(calls).showComparison).toBe(true);

    const calls2 = renderCard({ comparison: true });
    expect(lastSettings(calls2).showComparison).toBe(true);
  });

  it("series chips toggle visibility and read out their state", async () => {
    const user = userEvent.setup();
    const calls = renderCard({
      series: [
        { key: "a", label: "Work", color: "#111111" },
        { key: "b", label: "Home", color: "#222222" },
      ],
    });
    expect(lastSettings(calls).hiddenSeries.size).toBe(0);

    const workChip = screen.getByRole("button", { name: /work/i });
    expect(workChip).toHaveAttribute("aria-pressed", "true");
    await user.click(workChip);
    expect(lastSettings(calls).hiddenSeries.has("a")).toBe(true);
    expect(screen.getByRole("button", { name: /work/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("keeps settings scoped per chart id", async () => {
    const user = userEvent.setup();
    renderCard({ chartTypes: ["bar", "line"] });
    await user.click(screen.getByRole("button", { name: /chart options/i }));
    await user.click(screen.getByRole("radio", { name: /line chart/i }));

    const other = renderCard({ id: "other-chart", chartTypes: ["bar", "line"] });
    expect(lastSettings(other).chartType).toBe("bar");
  });

  it("reveals the accessible table behind the disclosure", async () => {
    const user = userEvent.setup();
    renderCard({
      table: (
        <table>
          <caption>Numbers</caption>
          <tbody>
            <tr>
              <td>42</td>
            </tr>
          </tbody>
        </table>
      ),
    });
    expect(screen.queryByText("42")).toBeNull();
    await user.click(screen.getByRole("button", { name: /view as table/i }));
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("survives corrupt stored settings", () => {
    localStorage.setItem(
      `planner:insights:chart:v1:${VIEWER}:test-chart`,
      "{not json",
    );
    const calls = renderCard({ chartTypes: ["bar", "line"] });
    expect(lastSettings(calls).chartType).toBe("bar");
  });
});
