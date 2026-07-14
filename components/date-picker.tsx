"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatISODate(date) === value ? date : null;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(month: Date): Date[] {
  const firstDay = startOfMonth(month);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - mondayOffset);

  return Array.from(
    { length: 42 },
    (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index),
  );
}

export function DatePicker({ value, onChange, optional = true }: DatePickerProps) {
  const selectedDate = parseISODate(value);
  const today = useMemo(() => new Date(), []);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? today));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const todayValue = formatISODate(today);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openCalendar() {
    setVisibleMonth(startOfMonth(selectedDate ?? today));
    setOpen(true);
  }

  function closeAndRestoreFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectDate(date: Date) {
    onChange(formatISODate(date));
    closeAndRestoreFocus();
  }

  function clearDate() {
    onChange("");
    closeAndRestoreFocus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `发布日期 ${value}，点击修改` : "选择发布日期，可选"}
        onClick={() => (open ? setOpen(false) : openCalendar())}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-[#d6dde2] bg-white px-3 text-left font-normal text-[#17212b] hover:border-[#8ab9b2]"
      >
        <span className={value ? "" : "text-[#687386]"}>
          {value || (optional ? "选择日期（选填）" : "选择日期")}
        </span>
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded border border-[#b9d4cf] bg-[#edf7f5] text-xs font-bold text-[#0b6b63]">日</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="选择发布日期"
          className="absolute left-0 z-30 mt-2 w-[min(320px,calc(100vw-40px))] rounded-lg border border-[#d9dee5] bg-white p-3 shadow-[0_18px_45px_rgba(23,32,47,.16)] sm:left-auto sm:right-0"
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="上个月"
              title="上个月"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="grid h-9 w-9 place-items-center rounded-lg text-xl text-[#465266] hover:bg-[#f3f5f7]"
            >
              ‹
            </button>
            <strong className="text-sm">
              {visibleMonth.getFullYear()} 年 {visibleMonth.getMonth() + 1} 月
            </strong>
            <button
              type="button"
              aria-label="下个月"
              title="下个月"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="grid h-9 w-9 place-items-center rounded-lg text-xl text-[#465266] hover:bg-[#f3f5f7]"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="grid h-8 place-items-center text-xs font-semibold text-[#8992a2]">
                {weekday}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const dateValue = formatISODate(date);
              const isSelected = dateValue === value;
              const isToday = dateValue === todayValue;
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();

              return (
                <button
                  key={dateValue}
                  type="button"
                  aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`}
                  aria-pressed={isSelected}
                  onClick={() => selectDate(date)}
                  className={[
                    "grid h-9 w-9 place-items-center rounded-lg text-sm",
                    isSelected
                      ? "bg-[#0e766e] font-bold text-white"
                      : isToday
                        ? "border border-[#0e766e] font-semibold text-[#0e766e]"
                        : "hover:bg-[#edf5f3]",
                    isCurrentMonth || isSelected ? "" : "text-[#a9b0bc]",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#e5e8ed] pt-3">
            <button
              type="button"
              onClick={clearDate}
              className="h-9 rounded-lg px-3 text-sm font-semibold text-[#687386] hover:bg-[#f3f5f7]"
            >
              清空
            </button>
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="h-9 rounded-lg bg-[#e7f4f1] px-3 text-sm font-semibold text-[#0e766e] hover:bg-[#d8ebe7]"
            >
              今天
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
