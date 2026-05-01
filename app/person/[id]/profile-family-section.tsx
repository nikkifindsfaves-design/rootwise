"use client";

import {
  cropCoverRenderedSize,
  cropPercentToOffsetCover,
} from "@/lib/profile/photo-crop-cover";
import { formatDateString } from "@/lib/utils/dates";
import Link from "next/link";
import { useParams } from "next/navigation";
import { memo, useId, useState, type CSSProperties } from "react";

const serif =
  "var(--dg-font-heading, var(--font-dg-display), 'Playfair Display', Georgia, serif)";
const sans = "var(--dg-font-body, var(--font-dg-body), Lato, sans-serif)";

const colors = {
  brownMuted: "var(--dg-brown-muted)",
  brownBorder: "var(--dg-brown-border)",
  parchment: "var(--dg-parchment)",
  cream: "var(--dg-cream)",
  avatarBg: "var(--dg-avatar-bg)",
  avatarInitials: "var(--dg-avatar-initials)",
  forest: "var(--dg-forest)",
};

type FamilyPersonRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_zoom?: number | null;
  natural_width?: number | null;
  natural_height?: number | null;
  gender: string | null;
};

type RelationshipMeta = {
  otherPersonId: string;
  relationshipType: string;
  personAId: string;
  personBId: string;
};

const FAMILY_MEMBER_DOSSIER_SQUARE = 44;

function initials(p: Pick<FamilyPersonRow, "first_name" | "last_name">): string {
  const f = p.first_name.trim();
  const l = p.last_name.trim();
  const s = `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  return s || "?";
}

/** Profile-centric relationship label for the family sidebar (e.g. Father, Sister). */
export function relationshipUiLabelForProfile(
  relationshipType: string,
  person: FamilyPersonRow
): string {
  const g = (person.gender ?? "").trim().toLowerCase();
  const t = relationshipType.trim().toLowerCase();
  if (t === "parent") {
    if (g === "male") return "Father";
    if (g === "female") return "Mother";
    return "Parent";
  }
  if (t === "child") {
    if (g === "male") return "Son";
    if (g === "female") return "Daughter";
    return "Child";
  }
  if (t === "spouse") return "Spouse";
  if (t === "sibling") {
    if (g === "male") return "Brother";
    if (g === "female") return "Sister";
    return "Sibling";
  }
  return relationshipType;
}

export function UnknownParentSlot({
  roleLabel,
  disabled,
  onAdd,
}: {
  roleLabel: "Father" | "Mother";
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="group relative flex w-full max-w-full cursor-pointer items-start gap-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        backgroundColor: "transparent",
        border: "none",
        color: "inherit",
      }}
      aria-label={`Add ${roleLabel.toLowerCase()} — link existing or create new`}
      onClick={onAdd}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed"
        style={{
          position: "relative",
          width: FAMILY_MEMBER_DOSSIER_SQUARE,
          height: FAMILY_MEMBER_DOSSIER_SQUARE,
          backgroundColor: colors.avatarBg,
          borderColor: `${colors.brownBorder}aa`,
          color: colors.avatarInitials,
        }}
      >
        <span
          className="text-sm font-bold opacity-70"
          style={{ fontFamily: serif }}
          aria-hidden
        >
          ?
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="break-words text-[15px] font-semibold leading-snug"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Unknown
        </p>
        <p
          className="mt-0.5 text-[11px] leading-snug"
          style={{ fontFamily: sans, color: colors.brownMuted }}
        >
          {disabled
            ? "Open this profile from your tree to add."
            : "Click to link or create…"}
        </p>
      </div>
      <span
        className="shrink-0 self-start pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: sans, color: colors.brownMuted }}
      >
        {roleLabel}
      </span>
    </button>
  );
}

export function FamilyMemberCard({
  p,
  crop_x,
  crop_y,
  crop_zoom,
  natural_width,
  natural_height,
  relationshipLabel,
  nameMeta,
  hideRelationshipLabel = false,
  onEditRelationship,
}: {
  p: FamilyPersonRow;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_zoom?: number | null;
  natural_width?: number | null;
  natural_height?: number | null;
  relationshipLabel: string;
  nameMeta?: string | null;
  hideRelationshipLabel?: boolean;
  onEditRelationship?: () => void;
}) {
  const familyCardParams = useParams() as { treeId?: string };
  const familyCardTreeId =
    typeof familyCardParams.treeId === "string" &&
    familyCardParams.treeId.trim() !== ""
      ? familyCardParams.treeId.trim()
      : "";
  const displayName = [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const nameLine = displayName.trim() || "—";
  const photo = p.photo_url ?? null;

  const hasPixelCrop =
    typeof natural_width === "number" &&
    natural_width > 0 &&
    typeof natural_height === "number" &&
    natural_height > 0 &&
    typeof crop_x === "number" &&
    Number.isFinite(crop_x) &&
    typeof crop_y === "number" &&
    Number.isFinite(crop_y) &&
    typeof crop_zoom === "number" &&
    Number.isFinite(crop_zoom);

  let pixelAvatarStyle: CSSProperties | null = null;
  if (hasPixelCrop) {
    const { w: rw, h: rh } = cropCoverRenderedSize(
      natural_width,
      natural_height,
      FAMILY_MEMBER_DOSSIER_SQUARE,
      FAMILY_MEMBER_DOSSIER_SQUARE,
      crop_zoom
    );
    const offset = cropPercentToOffsetCover(
      crop_x,
      crop_y,
      rw,
      rh,
      FAMILY_MEMBER_DOSSIER_SQUARE,
      FAMILY_MEMBER_DOSSIER_SQUARE
    );
    pixelAvatarStyle = {
      position: "absolute",
      left: offset.x,
      top: offset.y,
      width: rw,
      height: rh,
      maxWidth: "none",
    };
  }

  const dateDetail = [
    p.birth_date ? `b. ${formatDateString(p.birth_date)}` : "",
    p.death_date ? `d. ${formatDateString(p.death_date)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const familyCardHref =
    familyCardTreeId !== ""
      ? `/dashboard/${familyCardTreeId}/person/${p.id}`
      : `/person/${p.id}`;

  return (
    <Link
      href={familyCardHref}
      className="flex min-w-0 items-start gap-3 py-3"
      style={{
        textDecoration: "none",
        color: "inherit",
        backgroundColor: "transparent",
      }}
    >
      <div
        className="shrink-0 overflow-hidden rounded-md"
        style={{
          position: "relative",
          width: FAMILY_MEMBER_DOSSIER_SQUARE,
          height: FAMILY_MEMBER_DOSSIER_SQUARE,
          backgroundColor: colors.avatarBg,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className={hasPixelCrop ? undefined : "h-full w-full"}
            style={
              hasPixelCrop
                ? pixelAvatarStyle ?? undefined
                : {
                    objectFit: "cover",
                    objectPosition: `${p.crop_x ?? 50}% ${p.crop_y ?? 50}%`,
                    width: "100%",
                    height: "100%",
                  }
            }
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-sm font-bold"
            style={{ fontFamily: serif, color: colors.avatarInitials }}
          >
            {initials(p)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <p
            className="break-words text-[15px] font-semibold leading-snug"
            style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
          >
            {nameLine}
          </p>
          {nameMeta ? (
            <span
              className="shrink-0 text-[11px] font-semibold"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              {nameMeta}
            </span>
          ) : null}
        </div>
        {dateDetail ? (
          <p
            className="mt-0.5 break-words text-[11px] leading-snug"
            style={{ fontFamily: sans, color: colors.brownMuted }}
          >
            {dateDetail}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start justify-end gap-1.5 self-start pt-0.5">
        {onEditRelationship ? (
          <button
            type="button"
            className="rounded px-0.5 text-xs leading-none"
            style={{ color: colors.brownMuted }}
            aria-label="Edit relationship"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEditRelationship();
            }}
          >
            ✎
          </button>
        ) : null}
        {!hideRelationshipLabel ? (
          <span
            className="max-w-[5.5rem] text-right text-[10px] font-bold uppercase leading-snug tracking-[0.14em]"
            style={{ fontFamily: sans, color: colors.brownMuted, wordBreak: "break-word" }}
          >
            {relationshipLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export const CollapsibleFamilyGroup = memo(function CollapsibleFamilyGroup({
  title,
  members,
  relationshipMetaByPersonId,
  onEditRelationship,
  defaultExpanded = false,
  defaultRelationshipType = "sibling",
  containerClassName = "mb-3",
}: {
  title: string;
  members: FamilyPersonRow[];
  relationshipMetaByPersonId: Record<string, RelationshipMeta | undefined>;
  onEditRelationship: (meta: RelationshipMeta) => void;
  defaultExpanded?: boolean;
  /** Used when `relationshipMetaByPersonId` has no row for a member. */
  defaultRelationshipType?: string;
  containerClassName?: string;
}) {
  const baseId = useId();
  const headerId = `${baseId}-hdr`;
  const listId = `${baseId}-list`;
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (members.length === 0) return null;

  return (
    <div className={containerClassName}>
      <button
        type="button"
        id={headerId}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-0 py-1 text-left transition hover:border-[color-mix(in_srgb,var(--dg-brown-border)_55%,transparent)]"
        style={{ fontFamily: sans }}
      >
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: colors.brownMuted }}
        >
          {title}
        </span>
        <span
          className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums"
          style={{ color: colors.brownMuted }}
        >
          <span>({members.length})</span>
          <span aria-hidden className="inline-block w-3 text-center">
            {expanded ? "−" : "+"}
          </span>
        </span>
      </button>
      {expanded ? (
        <ul
          id={listId}
          className="m-0 list-none p-0"
          role="region"
          aria-labelledby={headerId}
        >
          {members.map((p) => {
            const relMeta = relationshipMetaByPersonId[p.id];
            const relType = relMeta?.relationshipType ?? defaultRelationshipType;
            return (
              <li
                key={p.id}
                className="border-0 border-b border-solid last:border-b-0"
                style={{ borderBottomColor: colors.brownBorder }}
              >
                <FamilyMemberCard
                  p={p}
                  crop_x={p.crop_x}
                  crop_y={p.crop_y}
                  crop_zoom={p.crop_zoom}
                  natural_width={p.natural_width}
                  natural_height={p.natural_height}
                  relationshipLabel={relationshipUiLabelForProfile(relType, p)}
                  onEditRelationship={
                    relMeta ? () => onEditRelationship(relMeta) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

export const SpouseWithChildrenCollapsible = memo(
  function SpouseWithChildrenCollapsible({
    spouse,
    childPeople: kids,
    marriageYear,
    relationshipMetaByPersonId,
    onEditRelationship,
    onAddChildWithSpouse,
    defaultExpanded = false,
  }: {
    spouse: FamilyPersonRow;
    childPeople: FamilyPersonRow[];
    marriageYear?: string | null;
    relationshipMetaByPersonId: Record<string, RelationshipMeta | undefined>;
    onEditRelationship: (meta: RelationshipMeta) => void;
    onAddChildWithSpouse: (spouse: FamilyPersonRow) => void;
    defaultExpanded?: boolean;
  }) {
    const baseId = useId();
    const panelId = `${baseId}-panel`;
    const toggleId = `${baseId}-toggle`;
    const [expanded, setExpanded] = useState(defaultExpanded);

    const childCountLabel =
      kids.length === 1 ? "1 child" : `${kids.length} children`;
    const spouseRelMeta = relationshipMetaByPersonId[spouse.id];
    return (
      <div
        className="mb-3 rounded-md border p-2.5"
        style={{
          borderColor: colors.brownBorder,
          borderLeftWidth: 3,
          borderLeftColor:
            "color-mix(in srgb, var(--dg-forest) 60%, var(--dg-brown-border))",
          backgroundColor:
            "color-mix(in srgb, var(--dg-parchment) 82%, var(--dg-cream))",
        }}
      >
        <p
          className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ fontFamily: sans, color: colors.brownMuted }}
        >
          Spouse
        </p>
        <div
          className="border-0 border-b border-solid"
          style={{ borderBottomColor: colors.brownBorder }}
        >
          <FamilyMemberCard
            p={spouse}
            crop_x={spouse.crop_x}
            crop_y={spouse.crop_y}
            crop_zoom={spouse.crop_zoom}
            natural_width={spouse.natural_width}
            natural_height={spouse.natural_height}
            relationshipLabel=""
            nameMeta={marriageYear ? `m. ${marriageYear}` : null}
            hideRelationshipLabel
            onEditRelationship={
              spouseRelMeta ? () => onEditRelationship(spouseRelMeta) : undefined
            }
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <button
            type="button"
            id={toggleId}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-2 border-none bg-transparent p-0 text-left text-xs font-bold uppercase tracking-wide underline-offset-2 transition hover:underline"
            style={{ fontFamily: sans, color: colors.brownMuted }}
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center text-[11px] leading-none"
              aria-hidden
            >
              {expanded ? "−" : "+"}
            </span>
            <span>
              {expanded ? `Hide ${childCountLabel}` : `Show ${childCountLabel}`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onAddChildWithSpouse(spouse)}
            className="border-none bg-transparent p-0 text-xs font-bold uppercase tracking-wide underline-offset-2 transition hover:underline"
            style={{ fontFamily: sans, color: colors.forest }}
          >
            + Add child
          </button>
        </div>
        {expanded ? (
          <div
            id={panelId}
            className="mt-2 space-y-3"
            role="region"
            aria-labelledby={toggleId}
          >
            {kids.length > 0 ? (
              <div>
                <ul className="m-0 list-none p-0">
                  {kids.map((p, i) => {
                    const relMeta = relationshipMetaByPersonId[p.id];
                    return (
                      <li
                        key={p.id}
                        className={
                          i < kids.length - 1
                            ? "border-0 border-b border-solid"
                            : undefined
                        }
                        style={
                          i < kids.length - 1
                            ? { borderBottomColor: colors.brownBorder }
                            : undefined
                        }
                      >
                        <FamilyMemberCard
                          p={p}
                          crop_x={p.crop_x}
                          crop_y={p.crop_y}
                          crop_zoom={p.crop_zoom}
                          natural_width={p.natural_width}
                          natural_height={p.natural_height}
                          relationshipLabel={relationshipUiLabelForProfile(
                            relMeta?.relationshipType ?? "child",
                            p
                          )}
                          onEditRelationship={
                            relMeta
                              ? () => onEditRelationship(relMeta)
                              : undefined
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p
                className="text-sm italic"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                No children linked with this spouse in your tree.
              </p>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);
