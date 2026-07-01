# History Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the history page's browser-native date input with a custom month calendar popover that preserves the existing `/history?date=YYYY-MM-DD` filter contract.

**Architecture:** Keep the feature inside `HistoryDateFilter` and submit through the existing form. The component owns only popover visibility, visible month, and hidden date field updates; server-side Beijing date normalization remains in `getBeijingDayRange`.

**Tech Stack:** Next.js client component, React state, TypeScript, Tailwind CSS classes, lucide-react icons, Vitest with Testing Library.

---

## File Map

- `tests/unit/ui-components.test.tsx`: add focused jsdom tests for the custom history calendar.
- `src/components/history/history-date-filter.tsx`: replace the native date input with the custom trigger, popover, month grid, and hidden field.

## Task 1: Custom Trigger And Popover Shell

**Files:**
- Modify: `tests/unit/ui-components.test.tsx`
- Modify: `src/components/history/history-date-filter.tsx`

- [ ] **Step 1: Write the failing test**

Add this test near the existing history date filter test in `tests/unit/ui-components.test.tsx`:

```tsx
  it("renders a custom history date trigger instead of a native date input", () => {
    const { container } = render(<HistoryDateFilter value="2026-06-30" />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.querySelector('input[name="date"]')?.getAttribute("type")).toBe(
      "hidden"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看日期 2026年6月30日" })
    );

    expect(screen.getByRole("dialog", { name: "选择历史日期" })).toBeTruthy();
    expect(screen.getByText("2026年6月")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "renders a custom history date trigger"
```

Expected: FAIL because the current component renders `input[type="date"]` and no custom trigger.

- [ ] **Step 3: Implement the minimal trigger and popover shell**

Replace `src/components/history/history-date-filter.tsx` with a client component that renders a hidden `date` input, a button labeled `查看日期 YYYY年M月D日`, and a popover dialog with the selected month title when opened.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "renders a custom history date trigger"
```

Expected: PASS.

## Task 2: Month Navigation And Stable Calendar Grid

**Files:**
- Modify: `tests/unit/ui-components.test.tsx`
- Modify: `src/components/history/history-date-filter.tsx`

- [ ] **Step 1: Write the failing test**

Add this test near the custom trigger test:

```tsx
  it("navigates the visible month in the custom history calendar", () => {
    render(<HistoryDateFilter value="2026-06-30" />);

    fireEvent.click(
      screen.getByRole("button", { name: "查看日期 2026年6月30日" })
    );
    fireEvent.click(screen.getByRole("button", { name: "上个月" }));

    expect(screen.getByText("2026年5月")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下个月" }));

    expect(screen.getByText("2026年6月")).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "navigates the visible month"
```

Expected: FAIL because month navigation buttons do not exist yet.

- [ ] **Step 3: Implement month navigation and day grid**

Add previous and next month icon buttons, weekday headers, and a 42-cell Monday-first calendar grid. Each day button should use an accessible label like `选择 2026年6月29日`, de-emphasize days outside the visible month, set `aria-pressed` for the selected value, and visually mark today.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "navigates the visible month"
```

Expected: PASS.

## Task 3: Day Selection And Form Submit

**Files:**
- Modify: `tests/unit/ui-components.test.tsx`
- Modify: `src/components/history/history-date-filter.tsx`

- [ ] **Step 1: Write the failing test**

Replace the old native-input submission test with this custom-calendar submission test:

```tsx
  it("submits the history date filter when the user picks a calendar day", () => {
    const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
    const requestSubmit = vi.fn();
    HTMLFormElement.prototype.requestSubmit = requestSubmit;

    try {
      const { container } = render(<HistoryDateFilter value="2026-06-30" />);

      fireEvent.click(
        screen.getByRole("button", { name: "查看日期 2026年6月30日" })
      );
      fireEvent.click(
        screen.getByRole("button", { name: "选择 2026年6月29日" })
      );

      expect(
        (container.querySelector('input[name="date"]') as HTMLInputElement).value
      ).toBe("2026-06-29");
      expect(requestSubmit).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog", { name: "选择历史日期" })).toBeNull();
    } finally {
      HTMLFormElement.prototype.requestSubmit = originalRequestSubmit;
    }
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "submits the history date filter"
```

Expected: FAIL because selecting a custom day does not update the hidden field and submit yet.

- [ ] **Step 3: Implement day selection**

When a day button is clicked, synchronously update the hidden input value, update component state, close the popover, and call `form.requestSubmit()` so the existing `/history` action receives `date=YYYY-MM-DD`.

- [ ] **Step 4: Run the focused history date picker tests**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx -t "history date"
```

Expected: PASS for the custom trigger, month navigation, and day selection tests.

## Task 4: Full Verification

**Files:**
- Verify: `tests/unit/ui-components.test.tsx`
- Verify: `src/components/history/history-date-filter.tsx`

- [ ] **Step 1: Run the full UI component test file**

Run:

```bash
npm test -- tests/unit/ui-components.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit the implementation**

Run:

```bash
git add docs/superpowers/plans/2026-07-01-history-date-picker.md tests/unit/ui-components.test.tsx src/components/history/history-date-filter.tsx
git commit -m "feat: add custom history date picker"
```
