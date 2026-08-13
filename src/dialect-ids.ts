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
] as const;

export type DialectId = (typeof DIALECT_IDS)[number];
