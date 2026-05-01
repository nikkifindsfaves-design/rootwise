export const RELATIONSHIP_TYPES = [
  "parent",
  "child",
  "spouse",
  "sibling",
  "grandparent",
  "grandchild",
  "aunt/uncle",
  "niece/nephew",
  "other",
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type DirectedRelationship<TId extends string = string> = {
  personAId: TId;
  personBId: TId;
  relationshipType: RelationshipType;
};

export type RelatedToFocalRelationship<TId extends string = string> = {
  relatedPersonId: TId;
  relationshipType: string;
};

export type BirthFamilyParticipant<TId extends string = string> = {
  personId: TId;
  eventType: string;
};

const RELATIONSHIP_TYPE_SET: ReadonlySet<string> = new Set(RELATIONSHIP_TYPES);

const INVERSE_RELATIONSHIP_TYPES: Record<RelationshipType, RelationshipType> = {
  parent: "child",
  child: "parent",
  spouse: "spouse",
  sibling: "sibling",
  grandparent: "grandchild",
  grandchild: "grandparent",
  "aunt/uncle": "niece/nephew",
  "niece/nephew": "aunt/uncle",
  other: "other",
};

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  parent: "Parent",
  child: "Child",
  spouse: "Spouse",
  sibling: "Sibling",
  grandparent: "Grandparent",
  grandchild: "Grandchild",
  "aunt/uncle": "Aunt/uncle",
  "niece/nephew": "Niece/nephew",
  other: "Other relationship",
};

export function normalizeRelationshipType(raw: string): RelationshipType {
  const n = raw.trim().toLowerCase();
  if (RELATIONSHIP_TYPE_SET.has(n)) return n as RelationshipType;
  if (n.includes("spouse") || n.includes("husband") || n.includes("wife")) {
    return "spouse";
  }
  if (n === "parent" || n.includes("father") || n.includes("mother")) {
    return "parent";
  }
  if (n === "child" || n.includes("son") || n.includes("daughter")) {
    return "child";
  }
  if (n.includes("sibling") || n.includes("brother") || n.includes("sister")) {
    return "sibling";
  }
  if (n.includes("grandparent") || n.includes("grandfather") || n.includes("grandmother")) {
    return "grandparent";
  }
  if (n.includes("grandchild")) return "grandchild";
  if (n.includes("aunt") || n.includes("uncle")) return "aunt/uncle";
  if (n.includes("niece") || n.includes("nephew")) return "niece/nephew";
  return "other";
}

export function inverseRelationshipType(raw: string): RelationshipType {
  return INVERSE_RELATIONSHIP_TYPES[normalizeRelationshipType(raw)];
}

export function relationshipTypeLabel(raw: string): string {
  return RELATIONSHIP_LABELS[normalizeRelationshipType(raw)];
}

export function relationshipTypeOfRelatedToFocalFromDirected(
  rawRelationshipType: string,
  focalIsPersonA: boolean
): RelationshipType {
  const type = normalizeRelationshipType(rawRelationshipType);
  return focalIsPersonA ? inverseRelationshipType(type) : type;
}

/**
 * UI relationship choices describe how the related person relates to the focal
 * person. The review-save API still expects the focal person's relationship
 * toward the related person, so invert at that boundary.
 */
export function relationshipTypeOfFocalToRelated(
  relatedToFocalType: string
): RelationshipType {
  return inverseRelationshipType(relatedToFocalType);
}

/**
 * Convert event-upload style UI semantics into a directed relationship row.
 * Prefer parent/grandparent/aunt rows for descendant selections so both flows
 * produce the same canonical forward edge.
 */
export function directedRelationshipFromRelatedToFocal<TId extends string>(
  relatedPersonId: TId,
  focalPersonId: TId,
  relatedToFocalType: string
): DirectedRelationship<TId> {
  const type = normalizeRelationshipType(relatedToFocalType);
  switch (type) {
    case "child":
    case "grandchild":
    case "niece/nephew":
      return {
        personAId: focalPersonId,
        personBId: relatedPersonId,
        relationshipType: inverseRelationshipType(type),
      };
    default:
      return {
        personAId: relatedPersonId,
        personBId: focalPersonId,
        relationshipType: type,
      };
  }
}

export function directedRelationshipsFromRelatedToFocal<TId extends string>(
  focalPersonId: TId,
  relationships: ReadonlyArray<RelatedToFocalRelationship<TId>>,
  options?: { parentRelationshipTargetIds?: readonly TId[] }
): DirectedRelationship<TId>[] {
  const parentTargetIds = options?.parentRelationshipTargetIds ?? [];
  const edges = relationships.flatMap((relationship) => {
    const type = normalizeRelationshipType(relationship.relationshipType);
    if (type === "parent" && parentTargetIds.length > 0) {
      return parentTargetIds.map((targetId) =>
        directedRelationshipFromRelatedToFocal(
          relationship.relatedPersonId,
          targetId,
          type
        )
      );
    }
    return [
      directedRelationshipFromRelatedToFocal(
        relationship.relatedPersonId,
        focalPersonId,
        type
      ),
    ];
  });

  return edges.filter(
    (edge, index, all) =>
      all.findIndex(
        (other) =>
          other.personAId === edge.personAId &&
          other.personBId === edge.personBId &&
          other.relationshipType === edge.relationshipType
      ) === index
  );
}

function isBirthEventType(eventType: string): boolean {
  return eventType.trim().toLowerCase() === "birth";
}

function isChildBornEventType(eventType: string): boolean {
  const normalized = eventType.trim().toLowerCase();
  return (
    normalized === "child born" ||
    normalized === "child birth" ||
    ((normalized.includes("child") ||
      normalized.includes("son") ||
      normalized.includes("daughter")) &&
      (normalized.includes("born") || normalized.includes("birth")))
  );
}

export function hasBirthFamilyEventTypes(
  participants: ReadonlyArray<BirthFamilyParticipant>
): boolean {
  return (
    participants.some((participant) => isBirthEventType(participant.eventType)) &&
    participants.some((participant) => isChildBornEventType(participant.eventType))
  );
}

export function directedRelationshipsFromBirthFamilyEvents<TId extends string>(
  participants: ReadonlyArray<BirthFamilyParticipant<TId>>
): DirectedRelationship<TId>[] {
  const children = participants.filter((participant) =>
    isBirthEventType(participant.eventType)
  );
  const parents = participants.filter((participant) =>
    isChildBornEventType(participant.eventType)
  );

  const edges = parents.flatMap((parent) =>
    children
      .filter((child) => child.personId !== parent.personId)
      .map((child) => ({
        personAId: parent.personId,
        personBId: child.personId,
        relationshipType: "parent" as const,
      }))
  );

  return edges.filter(
    (edge, index, all) =>
      all.findIndex(
        (other) =>
          other.personAId === edge.personAId &&
          other.personBId === edge.personBId &&
          other.relationshipType === edge.relationshipType
      ) === index
  );
}
