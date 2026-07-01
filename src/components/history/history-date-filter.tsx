"use client";

import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { getBeijingDateInputValue } from "@/lib/history/day-filter";

type HistoryDateFilterProps = {
  value: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type CalendarDay = DateParts & {
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
  value: string;
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function parseDateValue(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function formatDateValue({ year, month, day }: DateParts) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

function formatDateLabel(value: string) {
  const { year, month, day } = parseDateValue(value);
  return `${year}年${month}月${day}日`;
}

function formatMonthLabel({ year, month }: DateParts) {
  return `${year}年${month}月`;
}

function addMonths({ year, month }: DateParts, offset: number): DateParts {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: 1,
  };
}

function getCalendarDays(
  visibleMonth: DateParts,
  selectedValue: string,
  todayValue: string
): CalendarDay[] {
  const firstDay = new Date(
    Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1)
  );
  const mondayFirstOffset = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(
    Date.UTC(visibleMonth.year, visibleMonth.month - 1, 1 - mondayFirstOffset)
  );

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    const day = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    const dayValue = formatDateValue(day);

    return {
      ...day,
      isCurrentMonth: day.month === visibleMonth.month,
      isSelected: dayValue === selectedValue,
      isToday: dayValue === todayValue,
      value: dayValue,
    };
  });
}

function getDayButtonClass(day: CalendarDay) {
  const classes = [
    "relative flex h-9 w-full items-center justify-center rounded-xl text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-primary/30",
  ];

  if (day.isSelected) {
    classes.push("bg-[#191c1e] text-white shadow-sm");
  } else {
    classes.push("text-[#191c1e] hover:bg-[#eef4f7]");
  }

  if (!day.isCurrentMonth && !day.isSelected) {
    classes.push("text-[#9ba1a6]");
  }

  if (day.isToday && !day.isSelected) {
    classes.push("ring-1 ring-[#6aa6b8]");
  }

  return classes.join(" ");
}

export function HistoryDateFilter({ value }: HistoryDateFilterProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState<DateParts>(() =>
    parseDateValue(value)
  );
  const calendarDays = getCalendarDays(
    visibleMonth,
    selectedValue,
    getBeijingDateInputValue()
  );

  useEffect(() => {
    setSelectedValue(value);
    setVisibleMonth(parseDateValue(value));
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = value;
    }
  }, [value]);

  function selectDate(nextValue: string) {
    setSelectedValue(nextValue);
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = nextValue;
    }
    setIsOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <form
      action="/history"
      className="relative mt-4 flex flex-wrap items-center gap-3"
      ref={formRef}
    >
      <span className="text-sm font-semibold text-[#434655]">
        查看日期
      </span>
      <input
        name="date"
        readOnly
        ref={hiddenInputRef}
        type="hidden"
        value={selectedValue}
      />
      <button
        aria-expanded={isOpen}
        aria-label={`查看日期 ${formatDateLabel(selectedValue)}`}
        className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-2 text-sm font-semibold text-[#191c1e] outline-none ring-primary/20 transition hover:bg-white focus:ring-4"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="size-4" />
        {formatDateLabel(selectedValue)}
      </button>

      {isOpen ? (
        <div
          aria-label="选择历史日期"
          className="absolute left-0 top-12 z-20 w-80 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-xl shadow-[#191c1e]/10"
          role="dialog"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              aria-label="上个月"
              className="flex size-9 items-center justify-center rounded-xl text-[#434655] transition hover:bg-[#eef4f7] focus:outline-none focus:ring-2 focus:ring-primary/30"
              onClick={() =>
                setVisibleMonth((current) => addMonths(current, -1))
              }
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <p className="text-center text-sm font-bold text-[#191c1e]">
              {formatMonthLabel(visibleMonth)}
            </p>
            <button
              aria-label="下个月"
              className="flex size-9 items-center justify-center rounded-xl text-[#434655] transition hover:bg-[#eef4f7] focus:outline-none focus:ring-2 focus:ring-primary/30"
              onClick={() =>
                setVisibleMonth((current) => addMonths(current, 1))
              }
              type="button"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-bold text-[#6b7280]">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>周{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((day) => (
              <button
                aria-label={`选择 ${formatDateLabel(day.value)}`}
                aria-pressed={day.isSelected}
                className={getDayButtonClass(day)}
                key={day.value}
                onClick={() => selectDate(day.value)}
                type="button"
              >
                {day.day}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
