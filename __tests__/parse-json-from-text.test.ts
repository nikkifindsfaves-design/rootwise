/// <reference types="vitest/globals" />

import { parseJsonFromText } from "@/lib/utils/parse-json-from-text";

describe("parseJsonFromText", () => {
  describe("strategy 1: raw JSON.parse on trimmed input", () => {
    it("parses a clean JSON string with no wrapping", () => {
      expect(parseJsonFromText('{"name":"Ada","count":2}')).toEqual({
        name: "Ada",
        count: 2,
      });
    });

    it("parses deeply nested valid JSON via the first parse path", () => {
      const nested = {
        a: { b: { c: { d: { e: [1, 2, { f: true }], g: null } } } },
      };
      const str = JSON.stringify(nested);
      expect(parseJsonFromText(str)).toEqual(nested);
    });
  });

  describe("strategy 2: markdown code fences", () => {
    it("parses JSON wrapped in markdown fences with the json label", () => {
      const wrapped = '```json\n{"ok":true,"label":"json"}\n```';
      expect(parseJsonFromText(wrapped)).toEqual({ ok: true, label: "json" });
    });

    it("parses JSON wrapped in plain markdown code fences with no language label", () => {
      const wrapped = '```\n{"plain":true}\n```';
      expect(parseJsonFromText(wrapped)).toEqual({ plain: true });
    });
  });

  describe("strategy 3: outermost curly brace slice", () => {
    it("extracts and parses JSON when there is text before and after the object", () => {
      const input =
        'Here is the result:\n\n{"extracted":1,"note":"middle"}\n\nThanks for reading.';
      expect(parseJsonFromText(input)).toEqual({
        extracted: 1,
        note: "middle",
      });
    });
  });

  describe("failure cases", () => {
    it("throws a clear error when the string contains no JSON at all", () => {
      expect(() => parseJsonFromText("just plain prose, no braces")).toThrow(
        "No valid JSON found in model response",
      );
    });

    it("throws when the input is an empty string", () => {
      expect(() => parseJsonFromText("")).toThrow(
        "No valid JSON found in model response",
      );
    });

    it("throws when the input is only whitespace", () => {
      expect(() => parseJsonFromText("   \n\t  ")).toThrow(
        "No valid JSON found in model response",
      );
    });
  });
});
