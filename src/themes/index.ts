import { AUREBESH_VOCABULARY } from "./aurebesh.js";
import { BATTLESTAR_GALACTICA_VOCABULARY } from "./battlestar-galactica.js";
import { BUFFY_VOCABULARY } from "./buffy.js";
import { CLASSIC_CARTOON_VOCABULARY } from "./classic-cartoon.js";
import { COWBOY_BEBOP_VOCABULARY } from "./cowboy-bebop.js";
import { DARK_VOCABULARY } from "./dark.js";
import { DISNEY_VOCABULARY } from "./disney.js";
import { DOTHRAKI_VOCABULARY } from "./dothraki.js";
import { DUNE_VOCABULARY } from "./dune.js";
import { FIREFLY_VOCABULARY } from "./firefly.js";
import { FUTURAMA_VOCABULARY } from "./futurama.js";
import { GAME_OF_THRONES_VOCABULARY } from "./game-of-thrones.js";
import { HARRY_POTTER_VOCABULARY } from "./harry-potter.js";
import { HIGH_VALYRIAN_VOCABULARY } from "./high-valyrian.js";
import { HUTTESE_VOCABULARY } from "./huttese.js";
import { KLINGON_VOCABULARY } from "./klingon.js";
import { LEBOWSKI_VOCABULARY } from "./lebowski.js";
import { LOST_VOCABULARY } from "./lost.js";
import { LOTR_VOCABULARY } from "./lotr.js";
import { MANDOA_VOCABULARY } from "./mandoa.js";
import { MR_ROBOT_VOCABULARY } from "./mr-robot.js";
import { OFFICE_SPACE_VOCABULARY } from "./office-space.js";
import { PIRATES_VOCABULARY } from "./pirates.js";
import { POKEMON_VOCABULARY } from "./pokemon.js";
import { PORTAL_VOCABULARY } from "./portal.js";
import { PRINCESS_BRIDE_VOCABULARY } from "./princess-bride.js";
import { RICK_AND_MORTY_VOCABULARY } from "./rick-and-morty.js";
import { SEVERANCE_VOCABULARY } from "./severance.js";
import { STAR_TREK_VOCABULARY } from "./star-trek.js";
import { STAR_WARS_VOCABULARY } from "./star-wars.js";
import { STRANGER_THINGS_VOCABULARY } from "./stranger-things.js";
import { SUPER_MARIO_VOCABULARY } from "./super-mario.js";
import { THE_EXPANSE_VOCABULARY } from "./the-expanse.js";
import { TWIN_PEAKS_VOCABULARY } from "./twin-peaks.js";
import { WITCHER_VOCABULARY } from "./witcher.js";
import { X_FILES_VOCABULARY } from "./x-files.js";
import { ZELDA_VOCABULARY } from "./zelda.js";
import { ZOOLANDER_VOCABULARY } from "./zoolander.js";

export const THEME_IDS = [
  "aurebesh",
  "battlestar-galactica",
  "buffy",
  "classic-cartoon",
  "cowboy-bebop",
  "dark",
  "disney",
  "dothraki",
  "dune",
  "firefly",
  "futurama",
  "game-of-thrones",
  "harry-potter",
  "high-valyrian",
  "huttese",
  "klingon",
  "lebowski",
  "lost",
  "lotr",
  "mandoa",
  "mr-robot",
  "office-space",
  "pirates",
  "pokemon",
  "portal",
  "princess-bride",
  "rick-and-morty",
  "severance",
  "star-trek",
  "star-wars",
  "stranger-things",
  "super-mario",
  "the-expanse",
  "twin-peaks",
  "witcher",
  "x-files",
  "zelda",
  "zoolander",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: { readonly [K in ThemeId]: ReadonlyArray<string> } = {
  aurebesh: AUREBESH_VOCABULARY,
  "battlestar-galactica": BATTLESTAR_GALACTICA_VOCABULARY,
  buffy: BUFFY_VOCABULARY,
  "classic-cartoon": CLASSIC_CARTOON_VOCABULARY,
  "cowboy-bebop": COWBOY_BEBOP_VOCABULARY,
  dark: DARK_VOCABULARY,
  disney: DISNEY_VOCABULARY,
  dothraki: DOTHRAKI_VOCABULARY,
  dune: DUNE_VOCABULARY,
  firefly: FIREFLY_VOCABULARY,
  futurama: FUTURAMA_VOCABULARY,
  "game-of-thrones": GAME_OF_THRONES_VOCABULARY,
  "harry-potter": HARRY_POTTER_VOCABULARY,
  "high-valyrian": HIGH_VALYRIAN_VOCABULARY,
  huttese: HUTTESE_VOCABULARY,
  klingon: KLINGON_VOCABULARY,
  lebowski: LEBOWSKI_VOCABULARY,
  lost: LOST_VOCABULARY,
  lotr: LOTR_VOCABULARY,
  mandoa: MANDOA_VOCABULARY,
  "mr-robot": MR_ROBOT_VOCABULARY,
  "office-space": OFFICE_SPACE_VOCABULARY,
  pirates: PIRATES_VOCABULARY,
  pokemon: POKEMON_VOCABULARY,
  portal: PORTAL_VOCABULARY,
  "princess-bride": PRINCESS_BRIDE_VOCABULARY,
  "rick-and-morty": RICK_AND_MORTY_VOCABULARY,
  severance: SEVERANCE_VOCABULARY,
  "star-trek": STAR_TREK_VOCABULARY,
  "star-wars": STAR_WARS_VOCABULARY,
  "stranger-things": STRANGER_THINGS_VOCABULARY,
  "super-mario": SUPER_MARIO_VOCABULARY,
  "the-expanse": THE_EXPANSE_VOCABULARY,
  "twin-peaks": TWIN_PEAKS_VOCABULARY,
  witcher: WITCHER_VOCABULARY,
  "x-files": X_FILES_VOCABULARY,
  zelda: ZELDA_VOCABULARY,
  zoolander: ZOOLANDER_VOCABULARY,
};

export function isThemeId(value: string): value is ThemeId {
  for (const id of THEME_IDS) {
    if (id === value) return true;
  }
  return false;
}

export function vocabularyForTheme(id: string): ReadonlyArray<string> {
  if (!isThemeId(id)) {
    throw new Error(
      `minwind: unknown naming.theme "${id}";` +
        ` known themes: ${THEME_IDS.join(", ")}`,
    );
  }
  return THEMES[id];
}

export {
  AUREBESH_VOCABULARY,
  BATTLESTAR_GALACTICA_VOCABULARY,
  BUFFY_VOCABULARY,
  CLASSIC_CARTOON_VOCABULARY,
  COWBOY_BEBOP_VOCABULARY,
  DARK_VOCABULARY,
  DISNEY_VOCABULARY,
  DOTHRAKI_VOCABULARY,
  DUNE_VOCABULARY,
  FIREFLY_VOCABULARY,
  FUTURAMA_VOCABULARY,
  GAME_OF_THRONES_VOCABULARY,
  HARRY_POTTER_VOCABULARY,
  HIGH_VALYRIAN_VOCABULARY,
  HUTTESE_VOCABULARY,
  KLINGON_VOCABULARY,
  LEBOWSKI_VOCABULARY,
  LOST_VOCABULARY,
  LOTR_VOCABULARY,
  MANDOA_VOCABULARY,
  MR_ROBOT_VOCABULARY,
  OFFICE_SPACE_VOCABULARY,
  PIRATES_VOCABULARY,
  POKEMON_VOCABULARY,
  PORTAL_VOCABULARY,
  PRINCESS_BRIDE_VOCABULARY,
  RICK_AND_MORTY_VOCABULARY,
  SEVERANCE_VOCABULARY,
  STAR_TREK_VOCABULARY,
  STAR_WARS_VOCABULARY,
  STRANGER_THINGS_VOCABULARY,
  SUPER_MARIO_VOCABULARY,
  THE_EXPANSE_VOCABULARY,
  TWIN_PEAKS_VOCABULARY,
  WITCHER_VOCABULARY,
  X_FILES_VOCABULARY,
  ZELDA_VOCABULARY,
  ZOOLANDER_VOCABULARY,
};
