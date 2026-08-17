export const DIALECT_IDS = [
  "boston",
  "australia",
  "texas",
  "england",
  "scotland",
  "ireland",
  "wales",
  "newyork",
  "canada",
  "savannah",
  "ghetto",
  "degenerate",
  "emojis",
  "yorkshire",
  "newzealand",
  "jamaica",
  "appalachia",
  "geordie",
  "piglatin",
] as const;

export type DialectId = (typeof DIALECT_IDS)[number];
