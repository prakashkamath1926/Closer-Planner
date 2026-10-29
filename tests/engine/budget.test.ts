import { describe, it, expect } from "vitest";
import {
  calculateBudget,
  isOverBudget,
  getEffectiveItemCost,
  BudgetItemInput,
} from "../../src/lib/engine/budget";
import { toMinorUnits } from "../../src/lib/engine/money";

describe("engine/budget: budget tracking & over-budget detection", () => {
  const EIGHT_LAKH = 800000;

  it("calculates totals correctly when within budget", () => {
    const items: BudgetItemInput[] = [
      { id: "1", title: "Venue", estimated_cost: "300000.00", cost_status: "estimate" },
      { id: "2", title: "Catering", estimated_cost: "250000.00", cost_status: "estimate" },
      { id: "3", title: "Decor", estimated_cost: "100000.00", cost_status: "estimate" },
    ];

    const summary = calculateBudget(EIGHT_LAKH, items, "INR");

    expect(summary.isOverBudget).toBe(false);
    expect(summary.budgetTotalMinor).toBe(toMinorUnits(800000));
    expect(summary.effectiveTotalMinor).toBe(toMinorUnits(650000));
    expect(summary.remainingBudgetMinor).toBe(toMinorUnits(150000));
    expect(summary.overBudgetAmountMinor).toBe(0);
    expect(summary.overBudgetAmountFormatted).toBeNull();
  });

  it("8 lakh in never yields a plan whose total exceeds 8 lakh without an explicit over-budget flag", () => {
    // Plan totaling 8,50,000 against an 8,00,000 budget
    const items: BudgetItemInput[] = [
      { id: "1", title: "Venue", estimated_cost: "400000.00", cost_status: "estimate" },
      { id: "2", title: "Catering", estimated_cost: "350000.00", cost_status: "estimate" },
      { id: "3", title: "Music & DJ", estimated_cost: "100000.00", cost_status: "estimate" },
    ];

    const summary = calculateBudget(EIGHT_LAKH, items, "INR");

    // Must explicitly set isOverBudget to true
    expect(summary.isOverBudget).toBe(true);
    expect(summary.effectiveTotalMinor).toBe(toMinorUnits(850000));
    expect(summary.overBudgetAmountMinor).toBe(toMinorUnits(50000));
    expect(summary.overBudgetAmountFormatted).toContain("50,000");
    expect(summary.remainingBudgetMinor).toBe(-toMinorUnits(50000));

    expect(isOverBudget(EIGHT_LAKH, items)).toBe(true);
  });

  it("handles exact budget match (total == budget)", () => {
    const items: BudgetItemInput[] = [
      { id: "1", title: "Venue", estimated_cost: "500000.00", cost_status: "estimate" },
      { id: "2", title: "Catering", estimated_cost: "300000.00", cost_status: "estimate" },
    ];

    const summary = calculateBudget(EIGHT_LAKH, items, "INR");

    expect(summary.isOverBudget).toBe(false);
    expect(summary.effectiveTotalMinor).toBe(toMinorUnits(800000));
    expect(summary.remainingBudgetMinor).toBe(0);
    expect(summary.overBudgetAmountMinor).toBe(0);
  });

  it("prioritizes confirmed cost over estimated cost when confirmed", () => {
    const item: BudgetItemInput = {
      id: "1",
      title: "Photographer",
      estimated_cost: "50000.00",
      confirmed_cost: "60000.00",
      cost_status: "confirmed",
    };

    expect(getEffectiveItemCost(item)).toBe(toMinorUnits(60000));

    // When status is estimate, estimated_cost is used even if confirmed_cost field is present
    const unconfirmedItem: BudgetItemInput = {
      id: "2",
      title: "Photographer",
      estimated_cost: "50000.00",
      confirmed_cost: "60000.00",
      cost_status: "estimate",
    };
    expect(getEffectiveItemCost(unconfirmedItem)).toBe(toMinorUnits(50000));
  });

  it("excludes Plan B (is_fallback = true) items from active budget totals", () => {
    const items: BudgetItemInput[] = [
      { id: "1", title: "Original Banquet Hall", estimated_cost: "400000.00", cost_status: "estimate", is_fallback: false },
      { id: "2", title: "Plan B: Garden Lawn", estimated_cost: "300000.00", cost_status: "estimate", is_fallback: true },
    ];

    const summary = calculateBudget(EIGHT_LAKH, items, "INR");

    // Only 400,000 counted, not 700,000
    expect(summary.effectiveTotalMinor).toBe(toMinorUnits(400000));
    expect(summary.isOverBudget).toBe(false);
  });
});

