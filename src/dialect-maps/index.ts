import type { DialectId } from "../dialect-ids.js";
import { BOSTON } from "./boston.js";
import { AUSTRALIA } from "./australia.js";
import { TEXAS } from "./texas.js";
import { ENGLAND } from "./england.js";
import { SCOTLAND } from "./scotland.js";
import { IRELAND } from "./ireland.js";
import { WALES } from "./wales.js";
import { NEWYORK } from "./newyork.js";
import { CANADA } from "./canada.js";
import { SAVANNAH } from "./savannah.js";
import { GHETTO } from "./ghetto.js";
import { DEGENERATE } from "./degenerate.js";
import { EMOJIS } from "./emojis.js";

export const DIALECT_SPECIALS: Partial<
  Record<DialectId, Readonly<Record<string, string>>>
> = {
  boston: BOSTON,
  australia: AUSTRALIA,
  texas: TEXAS,
  england: ENGLAND,
  scotland: SCOTLAND,
  ireland: IRELAND,
  wales: WALES,
  newyork: NEWYORK,
  canada: CANADA,
  savannah: SAVANNAH,
  ghetto: GHETTO,
  degenerate: DEGENERATE,
  emojis: EMOJIS,
};

export function specialFor(word: string, dialect: DialectId): string | null {
  const table = DIALECT_SPECIALS[dialect];
  if (table === undefined) return null;
  const spelling = table[word];
  if (spelling === undefined || spelling === "") return null;
  return spelling;
}
