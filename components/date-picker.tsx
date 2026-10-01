"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const todayValue = formatISODate(today);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setVisibleMonth(startOfMonth(selectedDate ?? today));
    setOpen(nextOpen);
  }

  function selectDate(date: Date) {
    onChange(formatISODate(date));
    setOpen(false);
  }

  function clearDate() {
    onChange("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={value ? `发布日期 ${value}，点击修改` : "选择发布日期，可选"}
          className="h-11 w-full justify-between rounded-lg border-input bg-white px-3 font-normal text-foreground shadow-none hover:bg-white hover:text-foreground"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value || (optional ? "选择日期（选填）" : "选择日期")}
          </span>
          <CalendarDays aria-hidden="true" className="size-4 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="选择发布日期"
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        sticky="always"
        style={{
          maxHeight: "min(calc(100dvh - 96px), var(--radix-popover-content-available-height))",
        }}
        className="calendar-popover w-[min(320px,calc(100vw-32px))] overflow-y-auto rounded-lg border-border bg-popover p-3"
      >
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="上个月"
              title="上个月"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="h-9 w-9 rounded-md text-muted-foreground"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <strong className="text-sm font-semibold">
              {visibleMonth.getFullYear()} 年 {visibleMonth.getMonth() + 1} 月
            </strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="下个月"
              title="下个月"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="h-9 w-9 rounded-md text-muted-foreground"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="grid h-8 place-items-center text-xs font-semibold text-muted-foreground">
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
                    "grid aspect-square min-w-0 place-items-center rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isSelected
                      ? "bg-primary font-semibold text-primary-foreground"
                      : isToday
                        ? "border border-primary font-semibold text-primary"
                        : "hover:bg-accent",
                    isCurrentMonth || isSelected ? "" : "text-muted-foreground/55",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearDate}
              className="h-9 rounded-md px-3 text-muted-foreground"
            >
              清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => selectDate(today)}
              className="h-9 rounded-md bg-accent px-3 text-primary hover:bg-accent hover:text-primary"
            >
              今天
            </Button>
          </div>
      </PopoverContent>
    </Popover>
  );
}
