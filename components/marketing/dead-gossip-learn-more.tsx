"use client";

import { startTransition, useEffect, useState } from "react";

type TabId =
  | "why"
  | "features"
  | "credits"
  | "next";

const TABS: { id: TabId; label: string }[] = [
  { id: "why", label: "Why Dead Gossip" },
  { id: "credits", label: "Understanding Credits" },
  { id: "features", label: "Features & Releases" },
  { id: "next", label: "What's Next" },
];

const WHATS_NEXT_ITEMS: {
  title: string;
  description: string;
  status: "building" | "exploring";
}[] = [
  {
    title: "Research Log",
    description:
      "Rules Based Guided Research to Free Resources.",
    status: "building",
  },
  {
    title: "Court Records Extraction",
    description:
      "Extract Important Data from Various Court Record types.",
    status: "exploring",
  },
  {
    title: "Newspaper Article Extraction",
    description:
      "Extract Important Data from Newspaper Articles to create events.",
    status: "exploring",
  },
  {
    title: "Needs Attention",
    description: "Highlights Open Tasks in your research logs.",
    status: "exploring",
  },
  {
    title: "Week in Your History",
    description:
      "Displays events from the upcoming week and events that happened on those days.",
    status: "exploring",
  },
  {
    title: "Export Your Tree Data",
    description: "Ability to export tree data in csv or GEDCOM.",
    status: "exploring",
  },
  {
    title: "Import existing trees",
    description:
      "Import csv or GEDCOM to create people and their events automatically.",
    status: "exploring",
  },
  {
    title: "Data Reporting",
    description:
      "Ability to use the data you've collected to see patterns like how many lived in a specific place, were veterans, or died of measles.",
    status: "exploring",
  },
];

const display = `var(--dg-promo-display), "Playfair Display", Georgia, serif`;
const sans =
  'var(--dg-promo-sans), "Source Sans 3", system-ui, sans-serif';

const dimWhite = "rgba(250, 250, 249, 0.68)";
const dimMore = "rgba(250, 250, 249, 0.45)";
const inactiveTab = "rgba(255, 255, 255, 0.35)";
const amber = "#eab308";
const amberDeep = "#d97706";
const purpleStrong = "#a855f7";
const purpleSoft = "#9333ea";
const green = "#22c55e";

const waitlistHref = "/login#waitlist";

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

function FlowCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 120 }}>{children}</div>
  );
}

export function DeadGossipLearnMore() {
  const [tab, setTab] = useState<TabId>("why");

  useEffect(() => {
    // Deep link with hash opens the credits tab after hydration without sync setState-in-effect lint.
    if (typeof window === "undefined") return;
    if (window.location.hash === "#understanding-credits") {
      startTransition(() => {
        setTab("credits");
      });
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash === "#understanding-credits") {
        setTab("credits");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (tab !== "credits") return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#understanding-credits") return;
    const id = window.setTimeout(() => {
      document.getElementById("understanding-credits")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab]);

  return (
    <div style={{ fontFamily: sans, position: "relative" }}>
      {/* Hero */}
      <header
        style={{
          position: "relative",
          padding: "72px 20px 40px",
          maxWidth: 640,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-10% -20%",
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(234,179,8,0.08) 0%, transparent 52%), radial-gradient(ellipse 60% 45% at 70% 0%, rgba(168,85,247,0.09) 0%, transparent 50%)",
            zIndex: 0,
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              padding: "8px 16px",
              marginBottom: 28,
              border: "1px solid rgba(234, 179, 8, 0.28)",
              backgroundColor: "rgba(255,255,255,0.03)",
              filter: "drop-shadow(0 0 14px rgba(234, 179, 8, 0.35))",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                backgroundColor: amberDeep,
                boxShadow: "0 0 12px rgba(234,179,8,0.45)",
              }}
              aria-hidden
            />
            <span
              style={{
                fontFamily: sans,
                fontSize: "0.8125rem",
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: amberDeep,
              }}
            >
              PILOT LAUNCH JUNE 2026!
            </span>
          </div>

          <h1
            style={{
              fontFamily: display,
              fontWeight: 600,
              fontSize: "clamp(1.875rem, 6vw, 2.75rem)",
              lineHeight: 1.08,
              margin: 0,
              color: "#fafafa",
            }}
          >
            Your ancestors left clues.
          </h1>
          <h1
            style={{
              fontFamily: display,
              fontWeight: 600,
              fontSize: "clamp(1.875rem, 6vw, 2.75rem)",
              lineHeight: 1.08,
              marginTop: 6,
              marginBottom: 0,
              background: `linear-gradient(110deg, ${amberDeep} 0%, ${purpleSoft} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            We turn them into stories.
          </h1>
          <p
            style={{
              marginTop: 22,
              fontSize: 15,
              lineHeight: 1.65,
              color: dimWhite,
              maxWidth: 560,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Learn why we built Dead Gossip, see what&apos;s new,
            understand credits and vote on what we build next.
          </p>
        </div>
      </header>

      {/* Sticky tabs */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          backgroundColor: "rgba(12, 10, 9, 0.76)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "4px 8px",
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={active}
                style={{
                  fontFamily: sans,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "14px 10px",
                  border: "none",
                  cursor: "pointer",
                  background: "transparent",
                  color: active ? "#fafafa" : inactiveTab,
                  borderBottom: active
                    ? `2px solid ${amber}`
                    : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main style={{ padding: "40px 20px 64px", maxWidth: 960, margin: "0 auto" }}>
        {tab === "why" ? (
          <section style={{ display: "flex", justifyContent: "center" }}>
            <article
              style={{
                width: "100%",
                maxWidth: 600,
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "40px 36px",
                backgroundColor: "rgba(255,255,255,0.02)",
                boxSizing: "border-box",
              }}
            >
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 15,
                  color: dimWhite,
                }}
              >
                Dead Gossip started with a simple question:
              </p>
              <blockquote
                style={{
                  margin: "0 0 24px",
                  paddingLeft: 18,
                  borderLeft: `3px solid ${amber}`,
                  fontFamily: display,
                  fontSize: 22,
                  color: "#fafafa",
                  lineHeight: 1.35,
                }}
              >
                Who in my family looked around Indiana and said…
                &lsquo;yeah, we&apos;re good here&rsquo;?
              </blockquote>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: dimWhite,
                }}
              >
                That curiosity pulled me into genealogy. At first, it felt
                easy. Add a hint, build a tree, watch your history come to
                life.
              </p>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 17,
                  color: "#fafafa",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }}
              >
                Then reality hit.
              </p>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: dimWhite,
                }}
              >
                Paywalls. Duplicate records. Clunky tools. And way too much time
                spent digging instead of actually discovering.
              </p>
              <p
                style={{
                  margin: "0 0 20px",
                  fontSize: 16,
                  color: amber,
                  fontWeight: 500,
                }}
              >
                So I built something better.
              </p>
              <p
                style={{
                  margin: "0 0 26px",
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: dimWhite,
                }}
              >
                Dead Gossip is a modern genealogy platform designed to make
                research faster, smarter and actually enjoyable.
              </p>

              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  padding: "24px 0",
                }}
              >
                {[
                  "AI-powered data extraction that pulls key details from the toughest handwritten records and organizes them instantly",
                  "A rule-based research log and guide that recommends free sites and shows you exactly where to look next",
                  "AI-written ancestor stories in distinct 'vibes' — from scandal to true crime to warm and personal",
                  "Customizable tree canvases that give your family history personality, not just structure",
                ].map((line, idx) => (
                  <div
                    key={`feature-${idx}`}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      marginBottom: 14,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: dimWhite,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: amber,
                        marginTop: "0.42em",
                      }}
                    />
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <p
                style={{
                  margin: "26px 0 10px",
                  textAlign: "center",
                  fontFamily: display,
                  fontSize: 17,
                  color: "#fafafa",
                }}
              >
                Because your family history isn&apos;t boring. Your tools
                shouldn&apos;t be either.
              </p>
              <p
                style={{
                  margin: 0,
                  textAlign: "center",
                  fontSize: 15,
                  color: amber,
                  fontWeight: 500,
                }}
              >
                Sign up for our waitlist. The first 30 people will be invited to
                our test pilot.
              </p>
            </article>
          </section>
        ) : null}

        {tab === "features" ? (
          <section style={{ textAlign: "center" }}>
            <h2
              style={{
                fontFamily: display,
                fontWeight: 600,
                fontSize: "clamp(1.375rem, 3.5vw, 1.75rem)",
                marginBottom: 10,
              }}
            >
              Features &amp; Releases
            </h2>
            <p style={{ margin: "0 auto 36px", maxWidth: 520, color: dimWhite, fontSize: 15, lineHeight: 1.6 }}>
              What we&apos;ve shipped recently — and why we built it.
            </p>
            <p style={{ margin: 0, color: dimMore, fontSize: 15 }}>Coming soon</p>
          </section>
        ) : null}

        {tab === "credits" ? (
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
              <h2
                style={{
                  fontFamily: display,
                  fontWeight: 600,
                  fontSize: "clamp(1.375rem, 3.5vw, 1.75rem)",
                  marginBottom: 10,
                }}
              >
                Understanding Credits
              </h2>
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
                No tricks, no fine print. Here&apos;s exactly how credits work
                and what happens when they run out.
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
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontFamily: sans,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#fafafa",
                  }}
                >
                  Monthly Credits
                </h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: dimWhite }}>
                  Included with your plan. They do not carry over and refresh
                  every billing cycle and are always used first.
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
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontFamily: sans,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#fafafa",
                  }}
                >
                  Add-On Credits
                </h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: dimWhite }}>
                  Purchased when you need more. They never expire and are always
                  used last.
                </p>
              </div>
            </div>

            <h3
              style={{
                fontFamily: display,
                fontSize: "1.2rem",
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              What Costs What
            </h3>
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
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8, color: dimMore }}>
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
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8, color: dimMore }}>
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
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", marginBottom: 8, color: dimMore }}>
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
                  <div
                    style={{ color: inactiveTab }}
                  >
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
                  <h3
                    style={{
                      margin: "0 0 10px",
                      fontFamily: sans,
                      fontSize: 17,
                      fontWeight: 600,
                      color: "#fafafa",
                    }}
                  >
                    Run out of credits? You still have full access.
                  </h3>
                  <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.7, color: dimWhite }}>
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
        ) : null}

        {tab === "next" ? (
          <section>
            <div style={{ marginBottom: 28, textAlign: "left" }}>
              <h2
                style={{
                  fontFamily: display,
                  fontWeight: 600,
                  fontSize: "clamp(1.375rem, 3.5vw, 1.75rem)",
                  marginBottom: 10,
                }}
              >
                You Decide What&apos;s Next
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: dimWhite,
                  maxWidth: 520,
                }}
              >
                Vote on the research problems that matter most to you.
                The highest-voted items move up and get built first.
              </p>
            </div>
            <div
              style={{
                maxWidth: 680,
                margin: "0 auto",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                padding: "8px 0",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              {WHATS_NEXT_ITEMS.map((item, idx) => {
                const statusLabel =
                  item.status === "building" ? "Building Now" : "Exploring";
                const dotColor =
                  item.status === "building" ? amber : purpleStrong;
                const pillBorder =
                  item.status === "building"
                    ? "rgba(234, 179, 8, 0.45)"
                    : "rgba(168, 85, 247, 0.45)";
                const pillBg =
                  item.status === "building"
                    ? "rgba(234, 179, 8, 0.12)"
                    : "rgba(124, 58, 237, 0.14)";
                const pillColor =
                  item.status === "building" ? amber : purpleStrong;
                return (
                  <div
                    key={item.title}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      padding: "18px 22px",
                      borderBottom:
                        idx < WHATS_NEXT_ITEMS.length - 1
                          ? "1px solid rgba(255,255,255,0.06)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: dotColor,
                        marginTop: "0.45em",
                      }}
                      aria-hidden
                    />
                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "8px 14px",
                          marginBottom: 8,
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontFamily: sans,
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#fafafa",
                          }}
                        >
                          {item.title}
                        </h3>
                        <span
                          style={{
                            flexShrink: 0,
                            fontFamily: sans,
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.02em",
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: `1px solid ${pillBorder}`,
                            backgroundColor: pillBg,
                            color: pillColor,
                          }}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: dimWhite,
                        }}
                      >
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "48px 24px 64px",
          textAlign: "center",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontFamily: display,
            fontSize: "clamp(1.15rem, 3vw, 1.375rem)",
            margin: "0 0 14px",
            color: "#fafafa",
          }}
        >
          Ready to hear what your ancestors have to say?
        </p>
        <p style={{ margin: "0 0 22px", fontSize: 15, color: dimWhite }}>
          Sign up for our waitlist. The first 30 people will be invited to our
          test pilot.
        </p>
        <a
          href={waitlistHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            fontFamily: sans,
            fontSize: 15,
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: 8,
            textDecoration: "none",
            color: amberDeep,
            background:
              `linear-gradient(165deg, rgba(234,179,8,0.35) 0%, rgba(168,85,247,0.18) 100%)`,
            border: `1px solid rgba(234,179,8,0.35)`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          Sign up today!
        </a>
      </footer>
    </div>
  );
}
