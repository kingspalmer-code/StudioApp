"use client";

import { useState } from "react";

// A number box backed by a number. It keeps what you've typed while you're in it, so emptying it
// doesn't snap straight back to 0, and an untouched 0 clears when you tap in (see ClearZero).
// Left empty, it shows 0 again and the number stays 0.
export default function NumberInput({
  value,
  onValue,
  onFocus,
  onBlur,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: number; onValue: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [typed, setTyped] = useState(false);
  return (
    <input
      {...rest}
      type="number"
      data-own-zero=""
      value={text ?? String(value)}
      onFocus={(e) => {
        if (!typed && value === 0) setText("");
        onFocus?.(e);
      }}
      onChange={(e) => {
        setTyped(true);
        setText(e.target.value);
        onValue(Number(e.target.value) || 0);
      }}
      onBlur={(e) => {
        setText(null);
        onBlur?.(e);
      }}
    />
  );
}
