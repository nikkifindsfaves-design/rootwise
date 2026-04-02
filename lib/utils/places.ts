export type PlaceObject = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

function segment(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function formatPlace(place: PlaceObject): string {
  const parts = [
    segment(place.township),
    segment(place.county),
    segment(place.state),
    segment(place.country),
  ].filter((p): p is string => p != null);
  return parts.join(", ");
}

export function placeToSearchString(partial: string): string {
  return partial.trim().toLowerCase();
}
