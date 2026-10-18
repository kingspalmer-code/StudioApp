"use client";

import { useState } from "react";
import type { TimeLog } from "@/lib/hours";
import TimeTracker from "./TimeTracker";

// A job's Hours section: everyone's time on it, from here or from the calendar, added up.
export default function JobHours(props: { initial: TimeLog[]; ticketId: number; me: string; names: Record<string, string>; canEditAll: boolean; readOnly: boolean; today: string }) {
  const { initial, ...rest } = props;
  const [logs, setLogs] = useState(initial);
  return <TimeTracker logs={logs} setLogs={setLogs} {...rest} />;
}
