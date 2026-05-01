import type { ReactNode } from "react";

const display = `var(--dg-promo-display), "Playfair Display", Georgia, serif`;
const sans =
  'var(--dg-promo-sans), "Source Sans 3", system-ui, sans-serif';

const dimWhite = "rgba(250, 250, 250, 0.68)";
const dimMore = "rgba(250, 250, 250, 0.45)";
const inactiveTab = "rgba(255, 255, 255, 0.35)";
const amber = "#eab308";
const purpleStrong = "#a855f7";
const green = "#22c55e";

function LayersIcon({ color }: { color: string }) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 4L4 9l8 5 8-5-8-5z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 13l8 5 8-5"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17l8 5 8-5"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddonIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx={12}
        cy={12}
        r={9}
        stroke={green}
        strokeWidth="1.75"
      />
      <path
        stroke={green}
        strokeWidth={1.85}
        strokeLinecap="round"
        d="M12 8v8M8 12h8"
      />
    </svg>
  );
}

function DocIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 4h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M14 4v5h5"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={11} stroke={green} strokeWidth="1.5" />
      <path
        d="M8 12l3 3 5-7"
        stroke={green}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowSep() {
  return (
    <span
      style={{
        fontFamily: sans,
        color: inactiveTab,
        fontSize: 14,
        padding: "0 4px",
        userSelect: "none",
      }}
      aria-hidden
    >
      →
    </span>
  );
}

function FlowCell({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 120 }}>{children}</div>
  );
}

/**
 * Credits explainer shown on `/understanding-credits` only (not linked from learn-more).
 */
export function UnderstandingCreditsSection() {
  return (
    <section id="understanding-credits">
      <div
        style={{
          textAlign: "center",
          marginBottom: 36,
          maxWidth: 900,
          marginLeft: "auto",
          marginRight: "auto",
          paddingLeft: 0,
          paddingRight: 0,
          width: "100%",
        }}
      >
        <h1
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: "clamp(1.375rem, 3.5vw, 1.75rem)",
            marginBottom: 10,
          }}
        >
          Understanding Credits
        </h1>
        <p
          style={{
            margin: 0,
            color: dimWhite,
            fontSize: 15,
            lineHeight: 1.6,
            maxWidth: "min(840px, 100%)",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          No tricks, no fine print. Here&apos;s exactly how credits work and
          what happens when they run out.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            padding: "24px",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <LayersIcon color={amber} />
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontFamily: sans,
              fontSize: 16,
              fontWeight: 600,
              color: "#fafafa",
            }}
          >
            Monthly Credits
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: dimWhite,
            }}
          >
            Included with your plan. They do not carry over and refresh every
            billing cycle and are always used first.
          </p>
        </div>
        <div
          style={{
            padding: "24px",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <AddonIcon />
          </div>
          <h2
            style={{
              margin: "0 0 8px",
              fontFamily: sans,
              fontSize: 16,
              fontWeight: 600,
              color: "#fafafa",
            }}
          >
            Add-On Credits
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: dimWhite,
            }}
          >
            Purchased when you need more. They never expire and are always used
            last.
          </p>
        </div>
      </div>

      <h2
        style={{
          fontFamily: display,
          fontSize: "1.2rem",
          marginBottom: 18,
          textAlign: "center",
        }}
      >
        What Costs What
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 14,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            padding: "18px 14px",
            borderRadius: 10,
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.09)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginBottom: 8,
              color: dimMore,
            }}
          >
            Story
          </div>
          <div style={{ fontSize: 26, marginBottom: 10 }} aria-hidden>
            📝
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#fafafa",
            }}
          >
            2 credits
          </div>
          <div style={{ fontSize: 13, marginTop: 6, color: dimWhite }}>
            per story generated
          </div>
        </div>
        <div
          style={{
            padding: "18px 14px",
            borderRadius: 10,
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.09)",
            backgroundColor: "rgba(255,255,255,0.02)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginBottom: 8,
              color: dimMore,
            }}
          >
            Extraction Sonnet
          </div>
          <div style={{ fontSize: 26, marginBottom: 10 }} aria-hidden>
            ⚡
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: "#fafafa",
            }}
          >
            3 credits
          </div>
          <div style={{ fontSize: 13, marginTop: 6, color: dimWhite }}>
            per document · not on Curious plan
          </div>
        </div>
        <div
          style={{
            padding: "18px 14px",
            borderRadius: 10,
            textAlign: "center",
            border: "1px solid rgba(168, 85, 247, 0.48)",
            background:
              "linear-gradient(160deg, rgba(124,58,237,0.2) 0%, rgba(12,10,9,0.92) 100%)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginBottom: 8,
              color: dimMore,
            }}
          >
            Extraction Opus
          </div>
          <div style={{ fontSize: 26, marginBottom: 10 }} aria-hidden>
            🔬
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: purpleStrong,
            }}
          >
            5 credits
          </div>
          <div style={{ fontSize: 13, marginTop: 6, color: dimWhite }}>
            per document · not on Curious plan
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "28px",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            color: dimMore,
            textTransform: "uppercase",
          }}
        >
          Example
        </span>
        <div
          style={{
            marginTop: 22,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: "14px 4px",
          }}
        >
          <FlowCell>
            <div style={{ color: inactiveTab }}>
              <DocIcon size={22} />
            </div>
            <div style={{ fontSize: 14, marginTop: 8, color: dimWhite }}>
              Upload a birth certificate
            </div>
          </FlowCell>
          <ArrowSep />
          <FlowCell>
            <div
              style={{
                fontFamily: sans,
                fontSize: 26,
                fontWeight: 600,
                color: purpleStrong,
              }}
            >
              3
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: dimWhite }}>
              credits for extraction
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: dimMore }}>
              Sonnet · 1 document
            </div>
          </FlowCell>
          <ArrowSep />
          <FlowCell>
            <div
              style={{
                fontFamily: sans,
                fontSize: 26,
                fontWeight: 600,
                color: "#fafafa",
              }}
            >
              3
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: dimWhite }}>
              stories generated
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: dimMore }}>
              parents · location · date context
            </div>
          </FlowCell>
          <ArrowSep />
          <FlowCell>
            <div
              style={{
                fontFamily: sans,
                fontSize: 26,
                fontWeight: 600,
                color: amber,
              }}
            >
              6
            </div>
            <div style={{ fontSize: 14, marginTop: 6, color: dimWhite }}>
              credits for stories
            </div>
            <div style={{ fontSize: 12, marginTop: 4, color: dimMore }}>
              3 stories × 2 each
            </div>
          </FlowCell>
        </div>

        <div
          style={{
            marginTop: 26,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 20,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <span style={{ fontSize: 15, color: dimWhite }}>Total</span>
          <span
            style={{
              fontFamily: display,
              fontSize: "clamp(1.65rem, 4vw, 2rem)",
              color: amber,
              fontWeight: 600,
            }}
          >
            9 credits
          </span>
          <span style={{ fontSize: 13, color: dimMore }}>
            3 extraction + 6 stories
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: "24px",
          border: "1px solid rgba(34, 197, 94, 0.42)",
          borderRadius: 12,
          backgroundColor: "rgba(22, 101, 52, 0.12)",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ flexShrink: 0 }}>
            <CheckCircleIcon />
          </div>
          <div>
            <h2
              style={{
                margin: "0 0 10px",
                fontFamily: sans,
                fontSize: 17,
                fontWeight: 600,
                color: "#fafafa",
              }}
            >
              Run out of credits? You still have full access.
            </h2>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 15,
                lineHeight: 1.7,
                color: dimWhite,
              }}
            >
              Zero credits doesn&apos;t lock you out. Upload documents, use the
              full UI for manual data entry and events will still generate —
              just without AI-written stories. When your credits refresh next
              month, hit{" "}
              <span style={{ color: amber, fontWeight: 600 }}>
                &apos;Regenerate Story&apos;
              </span>{" "}
              on any event to get a story. Or regenerate anytime to get a
              different take on the same event.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: dimMore,
                fontStyle: "italic",
              }}
            >
              Credits only affect two things: automated data extraction and
              written stories. Everything else is always yours.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
