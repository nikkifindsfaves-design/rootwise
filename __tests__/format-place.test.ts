/// <reference types="vitest/globals" />

import { formatPlace } from "@/lib/utils/places";
import type { PlaceObject } from "@/lib/utils/places";

describe("formatPlace", () => {
  it("joins township, county, state, and country with commas when all four fields are present", () => {
    expect(
      formatPlace({
        township: "West Bradford",
        county: "Chester County",
        state: "Pennsylvania",
        country: "United States",
      }),
    ).toBe("West Bradford, Chester County, Pennsylvania, United States");
  });

  it("returns only the country when township, county, and state are null", () => {
    expect(
      formatPlace({
        township: null,
        county: null,
        state: null,
        country: "United States",
      }),
    ).toBe("United States");
  });

  it("joins state and country when township and county are absent but state and country are present", () => {
    expect(
      formatPlace({
        township: null,
        county: null,
        state: "Virginia",
        country: "United States",
      }),
    ).toBe("Virginia, United States");
  });

  it("joins county, state, and country when township is absent but those three are present", () => {
    expect(
      formatPlace({
        township: null,
        county: "Fairfax County",
        state: "Virginia",
        country: "United States",
      }),
    ).toBe("Fairfax County, Virginia, United States");
  });

  it("omits null segments and keeps present segments in township–county–state–country order", () => {
    expect(
      formatPlace({
        township: "Germantown",
        county: null,
        state: "Pennsylvania",
        country: "United States",
      }),
    ).toBe("Germantown, Pennsylvania, United States");
  });

  it("treats undefined township, county, or state like missing values when mixed with defined fields", () => {
    const withUndefinedTownship = {
      township: undefined,
      county: "Suffolk County",
      state: "Massachusetts",
      country: "United States",
    } as unknown as PlaceObject;

    expect(formatPlace(withUndefinedTownship)).toBe(
      "Suffolk County, Massachusetts, United States",
    );
  });

  it("skips empty or whitespace-only township, county, and state but still includes a non-empty country", () => {
    expect(
      formatPlace({
        township: "",
        county: "   ",
        state: "\t",
        country: "Canada",
      }),
    ).toBe("Canada");
  });

  it("trims leading and trailing whitespace on each segment before joining", () => {
    expect(
      formatPlace({
        township: "  Radnor ",
        county: " Delaware County ",
        state: " PA ",
        country: " USA ",
      }),
    ).toBe("Radnor, Delaware County, PA, USA");
  });

  it("formats a colonial-era place with township and county before colony and empire", () => {
    expect(
      formatPlace({
        township: "Braintree",
        county: "Suffolk County",
        state: "Massachusetts Bay Colony",
        country: "British Empire",
      }),
    ).toBe(
      "Braintree, Suffolk County, Massachusetts Bay Colony, British Empire",
    );
  });

  it("returns an empty string when every segment is null, undefined, or blank after trim", () => {
    expect(
      formatPlace({
        township: null,
        county: null,
        state: null,
        country: "",
      }),
    ).toBe("");
  });
});
