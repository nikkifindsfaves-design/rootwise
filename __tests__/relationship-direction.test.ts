import {
  directedRelationshipsFromBirthFamilyEvents,
  directedRelationshipFromRelatedToFocal,
  directedRelationshipsFromRelatedToFocal,
  hasBirthFamilyEventTypes,
  inverseRelationshipType,
  relationshipTypeLabel,
  relationshipTypeOfFocalToRelated,
  relationshipTypeOfRelatedToFocalFromDirected,
} from "@/lib/relationships/direction";

describe("relationship direction helpers", () => {
  it("maps a related parent to a parent edge from related person to focal person", () => {
    expect(directedRelationshipFromRelatedToFocal("parent-id", "child-id", "parent")).toEqual({
      personAId: "parent-id",
      personBId: "child-id",
      relationshipType: "parent",
    });
  });

  it("maps a related child to a parent edge from focal person to related person", () => {
    expect(directedRelationshipFromRelatedToFocal("child-id", "parent-id", "child")).toEqual({
      personAId: "parent-id",
      personBId: "child-id",
      relationshipType: "parent",
    });
  });

  it("keeps symmetric spouse and sibling relationships stable", () => {
    expect(directedRelationshipFromRelatedToFocal("spouse-id", "focal-id", "spouse")).toEqual({
      personAId: "spouse-id",
      personBId: "focal-id",
      relationshipType: "spouse",
    });
    expect(inverseRelationshipType("sibling")).toBe("sibling");
  });

  it("keeps extended family inverse direction explicit", () => {
    expect(directedRelationshipFromRelatedToFocal("grandchild-id", "focal-id", "grandchild")).toEqual({
      personAId: "focal-id",
      personBId: "grandchild-id",
      relationshipType: "grandparent",
    });
    expect(directedRelationshipFromRelatedToFocal("niece-id", "focal-id", "niece/nephew")).toEqual({
      personAId: "focal-id",
      personBId: "niece-id",
      relationshipType: "aunt/uncle",
    });
  });

  it("converts event-upload review choices back to the save-review API perspective", () => {
    expect(relationshipTypeOfFocalToRelated("parent")).toBe("child");
    expect(relationshipTypeOfFocalToRelated("child")).toBe("parent");
    expect(relationshipTypeOfFocalToRelated("spouse")).toBe("spouse");
  });

  it("converts extracted directed relationships into related-to-focal UI choices", () => {
    expect(relationshipTypeOfRelatedToFocalFromDirected("parent", false)).toBe("parent");
    expect(relationshipTypeOfRelatedToFocalFromDirected("parent", true)).toBe("child");
  });

  it("uses readable labels instead of raw slugs", () => {
    expect(relationshipTypeLabel("parent")).toBe("Parent");
    expect(relationshipTypeLabel("niece/nephew")).toBe("Niece/nephew");
    expect(relationshipTypeLabel("unknown")).toBe("Other relationship");
  });

  it("links co-parents to attached children instead of to the profile parent", () => {
    expect(
      directedRelationshipsFromRelatedToFocal(
        "profile-parent",
        [
          { relatedPersonId: "new-child", relationshipType: "child" },
          { relatedPersonId: "other-parent", relationshipType: "parent" },
        ],
        { parentRelationshipTargetIds: ["new-child"] }
      )
    ).toEqual([
      {
        personAId: "profile-parent",
        personBId: "new-child",
        relationshipType: "parent",
      },
      {
        personAId: "other-parent",
        personBId: "new-child",
        relationshipType: "parent",
      },
    ]);
  });

  it("infers parentage from birth and child-born event types", () => {
    const participants = [
      { personId: "father", eventType: "Child Birth" },
      { personId: "mother", eventType: "child born" },
      { personId: "child", eventType: "birth" },
    ];

    expect(hasBirthFamilyEventTypes(participants)).toBe(true);
    expect(directedRelationshipsFromBirthFamilyEvents(participants)).toEqual([
      {
        personAId: "father",
        personBId: "child",
        relationshipType: "parent",
      },
      {
        personAId: "mother",
        personBId: "child",
        relationshipType: "parent",
      },
    ]);
  });
});
