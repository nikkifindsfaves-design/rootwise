import { UnderstandingCreditsSection } from "@/components/marketing/understanding-credits-section";

const sans =
  'var(--dg-promo-sans), "Source Sans 3", system-ui, sans-serif';

export default function UnderstandingCreditsPage() {
  return (
    <div style={{ fontFamily: sans, position: "relative" }}>
      <main
        style={{
          padding: "48px 20px 64px",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <UnderstandingCreditsSection />
      </main>
    </div>
  );
}
