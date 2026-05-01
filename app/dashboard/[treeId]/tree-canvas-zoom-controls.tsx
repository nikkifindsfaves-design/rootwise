"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { useControls } from "react-zoom-pan-pinch";

const sans = "var(--font-dg-body), Lato, sans-serif";

const colors = {
  brownDark: "var(--dg-brown-dark)",
  brownMuted: "var(--dg-brown-muted)",
  brownBorder: "var(--dg-brown-border)",
  parchment: "var(--dg-parchment)",
  cream: "var(--dg-cream)",
};

type TreeCanvasPerson = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
};

function displayName(p: TreeCanvasPerson): string {
  return [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export const TreeCanvasZoomControls = memo(function TreeCanvasZoomControls({
  unlinkedPeople,
  onSelectUnlinkedPerson,
}: {
  unlinkedPeople: TreeCanvasPerson[];
  onSelectUnlinkedPerson: (personId: string) => void;
}) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const unlinkedRef = useRef<HTMLDivElement>(null);
  const btnBase: CSSProperties = {
    fontFamily: sans,
    minWidth: 36,
    height: 32,
    padding: "0 0.35rem",
    fontSize: "1.05rem",
    fontWeight: 700,
    lineHeight: 1,
    color: colors.brownDark,
    backgroundColor: colors.parchment,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.brownBorder,
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.15s, border-color 0.15s",
  };

  useEffect(() => {
    if (!unlinkedOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = unlinkedRef.current;
      if (!root || root.contains(e.target as Node)) return;
      setUnlinkedOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [unlinkedOpen]);

  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
      {unlinkedPeople.length > 0 ? (
        <div ref={unlinkedRef} className="relative">
          {unlinkedOpen ? (
            <div
              className="absolute bottom-full right-0 mb-2 max-h-64 w-64 overflow-y-auto rounded-md border p-2 shadow-sm"
              style={{
                backgroundColor: colors.parchment,
                borderColor: colors.brownBorder,
                boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <p
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Unlinked people
                </p>
                <button
                  type="button"
                  className="rounded border px-1.5 py-0 text-xs"
                  style={{
                    fontFamily: sans,
                    borderColor: colors.brownBorder,
                    color: colors.brownDark,
                    backgroundColor: colors.cream,
                  }}
                  aria-label="Close unlinked people list"
                  onClick={() => setUnlinkedOpen(false)}
                >
                  ×
                </button>
              </div>
              <ul className="space-y-1">
                {unlinkedPeople.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full rounded border px-2 py-1 text-left text-sm hover:opacity-90"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        color: colors.brownDark,
                        backgroundColor: colors.cream,
                      }}
                      onClick={() => {
                        onSelectUnlinkedPerson(p.id);
                        setUnlinkedOpen(false);
                      }}
                    >
                      {displayName(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className="relative rounded-md border px-2 py-1.5 text-sm font-semibold"
            style={{
              fontFamily: sans,
              color: colors.brownDark,
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
            }}
            aria-label="Show unlinked people"
            onClick={() => setUnlinkedOpen((v) => !v)}
          >
            ⚭
            <span
              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full border px-1 text-[11px] leading-4"
              style={{
                borderColor: colors.brownBorder,
                backgroundColor: colors.cream,
                color: colors.brownDark,
              }}
            >
              {unlinkedPeople.length}
            </span>
          </button>
        </div>
      ) : null}
      <div
        className="flex flex-col gap-1 rounded-md border p-1.5 shadow-sm"
        style={{
          backgroundColor: colors.parchment,
          borderColor: colors.brownBorder,
          boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
        }}
        role="toolbar"
        aria-label="Canvas zoom"
      >
        <button
          type="button"
          className="dg-tree-zoom-btn"
          style={btnBase}
          aria-label="Zoom in"
          onClick={() => zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          className="dg-tree-zoom-btn"
          style={btnBase}
          aria-label="Zoom out"
          onClick={() => zoomOut()}
        >
          −
        </button>
        <button
          type="button"
          className="dg-tree-zoom-btn"
          style={{
            ...btnBase,
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
          aria-label="Reset zoom"
          onClick={() => resetTransform()}
        >
          Reset
        </button>
      </div>
    </div>
  );
});
