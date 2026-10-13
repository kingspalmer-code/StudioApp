"use client";

import { useState } from "react";
import { CheckAllIcon, NotificationList, Tabs, useNotifications, type Tab } from "@/components/Notifications";

export default function AllNotifications() {
  const [tab, setTab] = useState<Tab>("unread");
  const feed = useNotifications(tab, 300);
  const anyUnread = feed.items?.some((n) => !n.read_at);
  return (
    <div className="nt-page">
      <div className="nt-page-bar">
        <Tabs tab={tab} setTab={setTab} />
        {tab !== "archived" && anyUnread && (
          <button type="button" className="link nt-all-read" onClick={() => feed.markAllRead()}>
            <CheckAllIcon /> Mark all as read
          </button>
        )}
      </div>
      <NotificationList feed={feed} tab={tab} />
    </div>
  );
}
