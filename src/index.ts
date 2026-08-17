import { minwind } from "./plugin.js";

export { minwind, resolveFlags } from "./plugin.js";
export type {
  MinwindEngineId,
  MinwindFlags,
  MinwindMode,
  MinwindOptions,
} from "./plugin.js";
export type { NamingConfig, NamingList, NamingResult } from "./naming.js";
export {
  resolveVocabulary,
  vocabularyFromQuotes,
  isThemedNaming,
  isDialectNaming,
  isMapsNaming,
} from "./naming.js";
export type { DialectId } from "./dialect.js";
export {
  DIALECT_IDS,
  createMapsHasher,
  dialectClassName,
  isDialectId,
} from "./dialect.js";
export type { ThemeId } from "./themes/index.js";
export {
  THEME_IDS,
  THEMES,
  isThemeId,
  vocabularyForTheme,
} from "./themes/index.js";
export type { CustomPropertiesConfig } from "./custom-properties.js";
export type {
  ExclusionConfig,
  ExclusionEntry,
  ExclusionReason,
  NameRegistry,
  RegistryEntry,
} from "./names.js";

export default minwind;
