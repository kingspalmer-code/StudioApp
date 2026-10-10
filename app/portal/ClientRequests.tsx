"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useState, type ComponentProps } from "react";
import NewRequestForm from "./NewRequestForm";

// The client's "New request" button. The form opens under it, and once a request is sent it
// closes again with a short confirmation, ready for the next one.
export default function ClientRequests({ startOpen, form }: { startOpen: boolean; form: Omit<ComponentProps<typeof NewRequestForm>, "onSent"> }) {
  const [open, setOpen] = useState(startOpen);
  const [sent, setSent] = useState("");
  const [round, setRound] = useState(0);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false} mode="popLayout">
        {sent && !open && (
          <motion.p key="sent" className="notice sent-notice" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            ✓ {sent}
          </motion.p>
        )}
      </AnimatePresence>
      {!open && (
        <button
          type="button"
          className="btn wide new-request-btn"
          data-tour="new-request"
          onClick={() => {
            setSent("");
            setOpen(true);
          }}
        >
          + New request
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={round}
            className="request-drawer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            style={{ overflow: "hidden" }}
          >
            <div className="request-drawer-head" data-tour="new-request">
              <b>New request</b>
              {!startOpen || round > 0 ? (
                <button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button>
              ) : null}
            </div>
            <NewRequestForm
              {...form}
              onSent={(message) => {
                setSent(message);
                setOpen(false);
                setRound((r) => r + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
