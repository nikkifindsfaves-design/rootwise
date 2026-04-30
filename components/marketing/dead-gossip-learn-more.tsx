"use client";

import { useState } from "react";

type TabId = "why" | "features" | "next";

const TABS: { id: TabId; label: string }[] = [
  { id: "why", label: "Why Dead Gossip" },
  { id: "features", label: "The Body of Work (So Far)" },
  { id: "next", label: "Next of Kin" },
];

/** YouTube embed id (from youtube.com/watch?v=… or youtu.be/…) */
const WHATS_NEW_ITEMS: {
  id: string;
  youtubeId: string;
  dateLabel: string;
  description: string;
}[] = [
  {
    id: "day-thirty-vibes",
    youtubeId: "HVxMsh1L-xw",
    dateLabel: "April 27, 2026",
    description:
      "Your ancestor lived one life but Dead Gossip will tell it five ways. Day 30 of building in public: same person, same records, different vibe, completely different story. Reverent or reckless — you decide how their history reads. Still polishing but the bones are good. And in genealogy, the bones are everything. The good, the bad, the buried.",
  },
  {
    id: "canvas-themes-vibe",
    youtubeId: "ui8xF4vsbR0",
    dateLabel: "April 24, 2026",
    description:
      "The family tree hasn't had a glow-up since someone hand-drew one on parchment in 1847. That changes today. Building Dead Gossip in public: three canvas themes that transform your entire experience. Dead Gossip for chaos energy. Evidence Board for the ancestors with a record. Heirloom for the ones who kept their secrets quiet. Your tree, your ancestors, your vibe. The good, the bad, the buried.",
  },
  {
    id: "day-twenty-glow-up",
    youtubeId: "RYCcrGw2VmA",
    dateLabel: "April 17, 2026",
    description:
      "Your ancestors didn't survive wars, famine and questionable marriages just to end up on an ugly profile page. Day 20 of building Dead Gossip in public: same features — documents, vitals, notepad — but now they actually look like they belong together. The glow-up is real and the dead deserved better. The good, the bad, the buried.",
  },
  {
    id: "census-profile",
    youtubeId: "SdQvjViGD9w",
    dateLabel: "April 14, 2026",
    description:
      "Someone scrawled your ancestor's name in cursive on a census form 150 years ago and AI just pulled every detail off the page. Building Dead Gossip in public: handwritten census extraction, a profile page that finally does these people justice, photos to put faces to names and four record types running — birth, death, marriage and census. The dead are getting the glow-up they deserve. The good, the bad, the buried.",
  },
  {
    id: "day-ten",
    youtubeId: "vQJD4mGK9uA",
    dateLabel: "April 5, 2026",
    description:
      "Your third-great-grandfather's 1847 baptism just got narrated in five different vibes by AI. Want it respectful? Done. Want it chaotic? Also done. Day 10 of building Dead Gossip in public: event stories with personality, a family tree canvas and manual ancestor selection for the ones who slipped through the cracks. The good, the bad, the buried.",
  },
  {
    id: "day-two",
    youtubeId: "av1fgK5fnAA",
    dateLabel: "March 28, 2026",
    description:
      "Your great-great-grandmother's birth record just got read by AI in under 10 seconds. Day 2 of building Dead Gossip in public: data extraction, duplicate detection, merge review and a landing page worthy of the dead. The good, the bad, the buried.",
  },
  {
    id: "day-one",
    youtubeId: "xJkvs177YzU",
    dateLabel: "March 27, 2026",
    description:
      "Day one. No code experience. No plan. Just a webpage to track a few ancestors and a gut feeling this could be something. The bodies would come later.",
  },
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

const waitlistHref = "/login#waitlist";

export function DeadGossipLearnMore() {
  const [tab, setTab] = useState<TabId>("why");

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
            Learn why we built Dead Gossip, see what&apos;s new, and vote on
            what we build next.
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
          <section>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <h2
                style={{
                  fontFamily: display,
                  fontWeight: 600,
                  fontSize: "clamp(1.375rem, 3.5vw, 1.75rem)",
                  marginBottom: 10,
                }}
              >
                The Body of Work (So Far)
              </h2>
              <p
                style={{
                  margin: 0,
                  maxWidth: 520,
                  marginLeft: "auto",
                  marginRight: "auto",
                  color: dimWhite,
                  fontSize: 15,
                  lineHeight: 1.6,
                }}
              >
                Watch us build, feature by feature in under 90 seconds.
              </p>
            </div>
            <style
              dangerouslySetInnerHTML={{
                __html: `
.whats-new-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  background-color: rgba(255,255,255,0.02);
  box-sizing: border-box;
}
.whats-new-row .whats-new-media {
  flex: 1 1 320px;
  max-width: min(100%, 440px);
  min-width: 0;
}
.whats-new-row .whats-new-copy {
  flex: 1 1 220px;
  min-width: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  border-left: none;
}
@media (min-width: 640px) {
  .whats-new-row .whats-new-copy {
    border-top: none;
    border-left: 1px solid rgba(255,255,255,0.08);
  }
}
              `.trim(),
              }}
            />
            <div
              role="list"
              style={{ display: "flex", flexDirection: "column", gap: 28 }}
            >
              {WHATS_NEW_ITEMS.map((item) => (
                <article
                  key={item.id}
                  role="listitem"
                  className="whats-new-row"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftStyle: "solid",
                    borderLeftColor: "rgba(234, 179, 8, 0.65)",
                  }}
                  aria-label={`${item.dateLabel}. ${item.description.slice(0, 120)}`}
                >
                  <div
                    className="whats-new-media"
                    style={{
                      position: "relative",
                      alignSelf: "flex-start",
                      aspectRatio: "16 / 9",
                      backgroundColor: "rgba(0,0,0,0.35)",
                    }}
                  >
                    <iframe
                      title={`The Body of Work — ${item.dateLabel}`}
                      src={`https://www.youtube.com/embed/${item.youtubeId}?rel=0`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        border: "none",
                        display: "block",
                      }}
                    />
                  </div>
                  <div
                    className="whats-new-copy"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 10,
                      padding: "22px 24px",
                      boxSizing: "border-box",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontFamily: display,
                        fontSize: "clamp(1.05rem, 2.8vw, 1.35rem)",
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color: "#fafafa",
                      }}
                    >
                      {item.dateLabel}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontFamily: sans,
                        fontSize: 15,
                        lineHeight: 1.65,
                        color: dimWhite,
                      }}
                    >
                      {item.description}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "next" ? (
          <section>
            <div
              style={{
                marginBottom: 28,
                maxWidth: 680,
                marginLeft: "auto",
                marginRight: "auto",
                textAlign: "center",
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
                Next of Kin
              </h2>
              <p
                style={{
                  margin: 0,
                  marginLeft: "auto",
                  marginRight: "auto",
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: dimWhite,
                  maxWidth: 520,
                }}
              >
                What we&apos;re digging into next.
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
