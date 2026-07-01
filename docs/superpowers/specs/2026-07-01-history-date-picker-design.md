# History Date Picker Design

## Context

The history page currently filters trips with a native `input type="date"` in `HistoryDateFilter`. The route already accepts a `date=YYYY-MM-DD` query value and `getBeijingDayRange` converts it into an Asia/Shanghai calendar-day range. This design keeps the existing query contract and replaces only the browser-native date input UI.

## User Experience

`HistoryDateFilter` will render a custom date button labeled for viewing a history date. Activating the button opens a floating month calendar. The calendar shows the selected month, weekday headers, and a fixed grid of day buttons. The selected date is visually emphasized, today's date has a subtle marker, and days outside the current month are shown but de-emphasized so the grid remains stable.

Users can move between months with icon buttons. Selecting a day updates a hidden `date` field and submits the existing `/history` form immediately, preserving the current page behavior.

## Component Scope

The change stays inside `src/components/history/history-date-filter.tsx` unless a small helper is needed for date formatting or calendar generation. No third-party date picker will be added. The component must not render any `input type="date"`.

## Data Flow

The component receives the normalized selected value from the server, such as `2026-06-30`. It derives the visible month from that value, renders selectable date values in `YYYY-MM-DD`, and submits the selected value through the existing form field named `date`.

Invalid or missing date handling remains server-side in `getBeijingDayRange`; the client calendar assumes the `value` prop is normalized by the page.

## Accessibility

The trigger button keeps an accessible label for the selected history date. Month navigation buttons have explicit labels. Each day is a real button with an accessible date label and `aria-pressed` for the selected date. The popover can be closed by clicking the trigger again or after choosing a day.

## Testing

Add focused component tests covering:

- No native `type="date"` input is rendered.
- Opening the trigger reveals a month calendar.
- Month navigation changes the visible month.
- Choosing a day updates the hidden `date` value and submits the form.
