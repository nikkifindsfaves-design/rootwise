"use client";

import type { CSSProperties } from "react";

function autoFormatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  // Year-only: exactly 4 digits where first two > 12 (e.g. 1924, 1847)
  // This catches colonial-era and modern years cleanly
  if (digits.length === 4 && parseInt(digits.slice(0, 2), 10) > 12) {
    return digits;
  }

  // Standard mm/dd/yyyy auto-format
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type SmartDateInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  disabled?: boolean;
};

export function SmartDateInput({
  id,
  value,
  onChange,
  className,
  style,
  placeholder = "mm/dd/yyyy or yyyy",
  disabled,
}: SmartDateInputProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      className={className}
      style={style}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        const digitsOnly = e.target.value.replace(/\D/g, "");
        onChange(autoFormatDateInput(digitsOnly));
      }}
    />
  );
}
