import { keccak256, toBytes, type Hex } from "viem";

export const BOND_CATEGORY_KEYS = {
  SPORTS: "SPORTS",
  WEATHER: "WEATHER",
  TECHNOLOGY: "TECHNOLOGY",
  CRYPTO: "CRYPTO",
  CULTURE_POP: "CULTURE_POP",
  NEWS: "NEWS",
  VANILLA_MARKET: "VANILLA_MARKET",
  USER_MARKETS: "USER_MARKETS",
  STRANGE_EVENTS: "STRANGE_EVENTS",
  VIRAL: "VIRAL",
  VANILLA_BOUNTY: "VANILLA_BOUNTY",
  UNDERWORLD_BOUNTY: "UNDERWORLD_BOUNTY",
  VANILLA_CHALLENGE: "VANILLA_CHALLENGE",
  UNDERWORLD_CHALLENGE: "UNDERWORLD_CHALLENGE",
} as const;

export type BondCategoryKey = keyof typeof BOND_CATEGORY_KEYS;

export function bondCategoryId(key: BondCategoryKey): Hex {
  return keccak256(toBytes(BOND_CATEGORY_KEYS[key]));
}

export function marketBondCategoryId(category: string, underworld: boolean): Hex {
  const normalized = category.trim().toLowerCase();
  if (underworld) {
    if (normalized.includes("viral")) return bondCategoryId("VIRAL");
    if (normalized.includes("extra") || normalized.includes("strange")) {
      return bondCategoryId("STRANGE_EVENTS");
    }
    return bondCategoryId("USER_MARKETS");
  }

  if (normalized.includes("deport") || normalized.includes("sport")) return bondCategoryId("SPORTS");
  if (normalized.includes("clima") || normalized.includes("weather")) return bondCategoryId("WEATHER");
  if (normalized.includes("tecn") || normalized.includes("tech")) return bondCategoryId("TECHNOLOGY");
  if (normalized.includes("crypto") || normalized.includes("cripto")) return bondCategoryId("CRYPTO");
  if (normalized.includes("cultura") || normalized.includes("pop")) return bondCategoryId("CULTURE_POP");
  if (normalized.includes("noticia") || normalized.includes("news")) return bondCategoryId("NEWS");
  return bondCategoryId("VANILLA_MARKET");
}

export function challengeBondCategoryId(underworld = true): Hex {
  return bondCategoryId(underworld ? "UNDERWORLD_CHALLENGE" : "VANILLA_CHALLENGE");
}

export function bountyBondCategoryId(underworld: boolean): Hex {
  return bondCategoryId(underworld ? "UNDERWORLD_BOUNTY" : "VANILLA_BOUNTY");
}
