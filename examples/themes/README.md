# Built-in words themes

These packs ship in the package. Pass a theme id; leftover tokens fall back
to hash names. Generate a prominence manifest from a minwind-off build so
the first words land on the document shell; see the
[Spaceballs case study](../../docs/spaceballs-case-study.md).

To generate a custom list (a sport, a brand, a speech, something you would
screenshot), copy [SKILL.md](./SKILL.md) into your project's `.cursor/skills/`
or paste it as a prompt.

```ts
minwind({
  naming: {
    strategy: "words",
    theme: "star-wars",
    prominence: loadProminence(),
  },
});
```

Bring your own list instead of a theme:

```ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: ["quill", "willow", "ember"],
  },
});
```

Or extend a built-in pack:

```ts
import { THEMES } from "minwind";

minwind({
  naming: {
    strategy: "words",
    vocabulary: [...THEMES["star-wars"], "porg2"],
  },
});
```

`minwind apply --naming words --theme star-wars` is the same contract.
`--vocabulary words.json` is the custom-list CLI. Do not pass both.

Every entry is already a CSS identifier (`[a-z][a-z0-9]*`, or `_` plus
alphanumerics for a digit-leading word). Order is prominence: most iconic
first. Words that collide with a class your stylesheet keeps are skipped at
build time. Language packs (`huttese`, `mandoa`, `klingon`, `aurebesh`,
`high-valyrian`, `dothraki`) have apostrophes and case already stripped.
Digit-leading custom words get a leading underscore (`2b` becomes `_2b`).
The Star Wars pack still uses a letter prefix on droids (`r2d2`, `fourlom`,
`triplezero`).

Unofficial fan vocabularies. Not affiliated with the rights holders.

## Packs

| Theme id               | Shell might read                  |
| ---------------------- | --------------------------------- |
| `star-wars`            | `vader yoda skywalker`            |
| `huttese`              | `ooma chuba boska`                |
| `mandoa`               | `aliit vod cyare`                 |
| `aurebesh`             | `aurek besh cresh`                |
| `star-trek`            | `spock kirk picard`               |
| `klingon`              | `qapla nuqneh tlhingan`           |
| `game-of-thrones`      | `winterfell stark jon`            |
| `high-valyrian`        | `valar morghulis dracarys`        |
| `dothraki`             | `khal khaleesi arakh`             |
| `stranger-things`      | `eleven hopper vecna`             |
| `super-mario`          | `mario luigi peach`               |
| `zelda`                | `zelda ganondorf triforce`        |
| `witcher`              | `geralt yennefer ciri`            |
| `zoolander`            | `zoolander mugatu hansel`         |
| `lebowski`             | `dude abides walter`              |
| `portal`               | `glados cake companion`           |
| `dune`                 | `spice arrakis fremen`            |
| `princess-bride`       | `inconceivable westley buttercup` |
| `office-space`         | `lumbergh milton stapler`         |
| `firefly`              | `shiny gorram browncoat`          |
| `twin-peaks`           | `coop laura blacklodge`           |
| `buffy`                | `buffy slayer spike`              |
| `x-files`              | `mulder scully trustno1`          |
| `cowboy-bebop`         | `spike swordfish bebop`           |
| `mr-robot`             | `elliot fsociety hellofriend`     |
| `battlestar-galactica` | `frak cylon starbuck`             |
| `lost`                 | `dharma hatch locke`              |
| `severance`            | `lumon innie waffleparty`         |
| `dark`                 | `sicmundus winden jonas`          |
| `the-expanse`          | `rocinante holden beltalowda`     |
| `rick-and-morty`       | `rick morty meeseeks`             |
| `disney`               | `simba elsa ariel`                |
| `pirates`              | `ahoy matey avast`                |
| `classic-cartoon`      | `mickey minnie donald`            |
| `pokemon`              | `pikachu charizard snorlax`       |
| `lotr`                 | `frodo gandalf mordor`            |
| `harry-potter`         | `hogwarts expelliarmus lumos`     |
| `futurama`             | `bender zoidberg hypnotoad`       |

`disney` is the feature films (Lion King, Frozen, Little Mermaid, Aladdin,
Toy Story, Moana, Lilo & Stitch, Peter Pan, Alice). `pirates` is slang plus
Pirates of the Caribbean and Treasure Planet. `classic-cartoon` is Mickey,
DuckTales, Gargoyles, and Gravity Falls.

## Packs that would catch on next

These have the same inspect-element energy and enough distinctive single words
to fill a real token universe:

- **Hackers (1995)** — `crashoverride`, `acidburn`, `gibson`. Looking at the
  source is the joke.
- **He-Man** — `greyskull` on `<html>`.
- **Studio Ghibli** — `totoro`, `noface`, `calcifer`, `catbus`.
- **The Matrix** — `neo`, `morpheus`, `construct`.
- **Ghostbusters** — `staypuft`, `zuul`, `proton`.
- **Elden Ring** — `tarnished`, `malenia`, `maidenless`.
- **Disco Elysium** — `revachol`, `kimkitsuragi`.
- **Calvin and Hobbes** — `transmogrifier`, `calvinball`, `spiff`.
- **Mean Girls** — `fetch`, `plastics`, `grool`.
- **Hitchhiker's Guide** — `vogon`, `babel`, `towel`, `magrathea`.
- **Monty Python** — `ni`, `shrubbery`, `blackknight`.
- **The Simpsons** — `duffman`, `milhouse`, `krusty`.
- **Doctor Who** — `tardis`, `dalek`, `gallifrey`.
- **Serial Experiments Lain** — `lain`, `wired`. Web-native cult.
- **Dwarf Fortress** — `boatmurdered`, `catsplosion`.
- **Labyrinth** — `jareth`, `goblinking`.
- **Earthbound** — `giygas`, `ness`, `happyhappy`.
- **Encanto / Mulan / Hercules** — fold into `disney`.
- **Kim Possible** — fold into `classic-cartoon`.
