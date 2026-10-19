"use client";

import { useState } from "react";
import { gbp, round2, totals, type LineItem } from "@/lib/documents";
import NumberInput from "@/components/NumberInput";

// An amount on the job form (a quote, a price, what's been paid). It can be typed in as one figure,
// or broken into lines (qty × price) that add up to it, so nobody has to do the sum by hand.
export default function AmountInput({
  id,
  name,
  label,
  required,
  placeholder,
  defaultValue,
  defaultItems,
  itemise,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  defaultValue: string;
  defaultItems?: LineItem[];
  itemise: boolean;
}) {
  const [items, setItems] = useState<LineItem[]>(defaultItems ?? []);
  const [typed, setTyped] = useState(defaultValue);
  const itemised = items.length > 0;
  const sum = totals(items, null).subtotal;
  const setItem = (i: number, v: Partial<LineItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...v } : x)));
  const start = () => {
    const n = parseFloat(typed.replace(/[£,\s]/g, ""));
    setItems([{ description: "", qty: 1, unit_price: Number.isFinite(n) ? n : 0 }]);
  };

  return (
    <>
      <div className="row">
        <label htmlFor={id}>{label}</label>
        <div className="ctl">
          {itemised ? (
            <>
              <input id={id} name={name} type="hidden" value={sum.toFixed(2)} />
              <span className="amount-sum">{gbp(sum)}</span>
              <input type="hidden" name={`${name}__items`} value={JSON.stringify(items)} />
            </>
          ) : (
            <input id={id} name={name} type="text" inputMode="decimal" required={required} placeholder={placeholder} value={typed} onChange={(e) => setTyped(e.target.value)} />
          )}
        </div>
      </div>
      {itemised &&
        items.map((it, i) => (
          <div className="row doc-item amount-item" key={i}>
            <input className="desc" aria-label={`${label} line ${i + 1}`} value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="What it's for" />
            <NumberInput className="qty" aria-label="Quantity" placeholder="Qty" min={0} step="any" value={it.qty} onValue={(qty) => setItem(i, { qty })} />
            <NumberInput className="price" aria-label="Price (£)" placeholder="£" step="0.01" value={it.unit_price} onValue={(unit_price) => setItem(i, { unit_price })} />
            <span className="amt">{gbp(round2((it.qty || 0) * (it.unit_price || 0)))}</span>
            <button
              type="button"
              className="x"
              aria-label="Remove line"
              onClick={() => {
                if (items.length === 1) setTyped(sum ? String(sum) : "");
                setItems((xs) => xs.filter((_, j) => j !== i));
              }}
            >
              ×
            </button>
          </div>
        ))}
      {itemise && (
        <div className="row amount-add">
          <button type="button" className="link" onClick={() => (itemised ? setItems((xs) => [...xs, { description: "", qty: 1, unit_price: 0 }]) : start())}>
            {itemised ? "+ Add a line" : `+ Break ${label.replace(/\s*\(£\)/, "").toLowerCase()} into items`}
          </button>
        </div>
      )}
    </>
  );
}
