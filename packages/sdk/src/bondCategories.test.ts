import { describe, expect, it } from "vitest";
import { bondCategoryId, challengeBondCategoryId, marketBondCategoryId } from "./bondCategories.js";

describe("authoritative creation bond categories", () => {
  it("maps visible market categories to registered on-chain identifiers", () => {
    expect(marketBondCategoryId("Crypto", false)).toBe(bondCategoryId("CRYPTO"));
    expect(marketBondCategoryId("Deportes", false)).toBe(bondCategoryId("SPORTS"));
    expect(marketBondCategoryId("Viral", true)).toBe(bondCategoryId("VIRAL"));
    expect(marketBondCategoryId("Personalizado", true)).toBe(bondCategoryId("USER_MARKETS"));
  });

  it("separates Vanilla and Underworld challenge categories", () => {
    expect(challengeBondCategoryId(false)).toBe(bondCategoryId("VANILLA_CHALLENGE"));
    expect(challengeBondCategoryId(true)).toBe(bondCategoryId("UNDERWORLD_CHALLENGE"));
  });
});
