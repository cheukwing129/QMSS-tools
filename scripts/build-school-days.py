#!/usr/bin/env python3
"""Convert expanded QMSS Calendar event JSON to a date -> Day A–F map.

The input is a Google Calendar events-list response (or a plain list of events).
Events must be expanded to individual dates, have an all-day start.date, and a
title/summary containing Day A, Day B, ..., or Day F.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime
from pathlib import Path

DAY_PATTERN = re.compile(r"\bDAY\s*([A-F])\b", re.IGNORECASE)


def event_items(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        raise ValueError("Calendar JSON must be a list or an object containing items/events.")
    for key in ("items", "events", "results"):
        items = payload.get(key)
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    raise ValueError("Calendar JSON has no items, events, or results list.")


def event_day(event: dict) -> tuple[str, str] | None:
    title = str(event.get("summary") or event.get("title") or event.get("subject") or "")
    match = DAY_PATTERN.search(title)
    if not match:
        return None
    start = event.get("start")
    start_date = start.get("date") if isinstance(start, dict) else None
    if not start_date:
        return None
    try:
        date.fromisoformat(str(start_date))
    except ValueError:
        return None
    return str(start_date), match.group(1).upper()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("events", type=Path, help="Expanded Google Calendar events JSON")
    parser.add_argument("--year", required=True, help="學年，例如 2026–2027")
    parser.add_argument("--out", type=Path, default=Path("data/school-days.json"))
    args = parser.parse_args()

    payload = json.loads(args.events.read_text(encoding="utf-8-sig"))
    days: dict[str, str] = {}
    for event in event_items(payload):
        if event.get("status") == "cancelled":
            continue
        parsed = event_day(event)
        if not parsed:
            continue
        event_date, day = parsed
        previous = days.get(event_date)
        if previous and previous != day:
            raise ValueError(f"Conflicting QMSS Calendar day for {event_date}: {previous} and {day}")
        days[event_date] = day

    output = {
        "calendarName": "QMSS Calendar",
        "academicYear": args.year,
        "lastSynced": datetime.now().astimezone().date().isoformat(),
        "days": dict(sorted(days.items())),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已產生 {args.out}: {len(days)} 個日期對照")


if __name__ == "__main__":
    main()
