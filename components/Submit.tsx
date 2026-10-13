"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

// A form's button that reacts the moment it's pressed: it dims and pulses until the change is
// saved, and can't be pressed twice meanwhile. Use it in place of <button> in forms with an action.
export default function Submit({ disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return <button type="submit" {...props} disabled={disabled || pending} aria-busy={pending || undefined} data-pending={pending || undefined} />;
}
