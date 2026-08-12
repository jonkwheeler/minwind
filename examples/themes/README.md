# Themed class-name vocabularies

Copy one of these arrays into a source-level minwind plugin. Themed naming is
the `words` strategy: each original Tailwind token gets one standalone name.

```ts
minwind({
  naming: {
    strategy: "words",
    vocabulary: STAR_WARS_VOCABULARY,
    prominence: loadProminence(),
  },
});
```

These files are examples in the repo, not a package export. Copy a file into
your project or paste the array into your config. Generate a prominence manifest from a minwind-off build so
the first words land on the document shell; see the
[Spaceballs case study](../../docs/spaceballs-case-study.md).

Every entry is already a CSS identifier (`[a-z][a-z0-9]*`). Order is
prominence: most iconic first. Words that collide with a class your stylesheet
keeps are skipped at build time.

Unofficial fan vocabularies. Not affiliated with the rights holders.

## Packs

| File                | Shell might read                  |
| ------------------- | --------------------------------- |
| `star-wars.ts`      | `vader yoda skywalker`            |
| `star-trek.ts`      | `spock kirk picard`               |
| `super-mario.ts`    | `mario luigi peach`               |
| `zelda.ts`          | `zelda ganondorf triforce`        |
| `witcher.ts`        | `geralt yennefer ciri`            |
| `zoolander.ts`      | `zoolander mugatu hansel`         |
| `lebowski.ts`       | `dude abides walter`              |
| `portal.ts`         | `glados cake companion`           |
| `dune.ts`           | `spice arrakis fremen`            |
| `princess-bride.ts` | `inconceivable westley buttercup` |
| `office-space.ts`   | `lumbergh milton stapler`         |
| `firefly.ts`        | `shiny gorram browncoat`          |

## Packs that would catch on next

These have the same inspect-element energy and enough distinctive single words
to fill a real token universe:

- **Hackers (1995)** — `crashoverride`, `acidburn`, `gibson`. Looking at the
  source is the joke.
- **He-Man** — `greyskull` on `<html>`.
- **Twin Peaks** — `blacklodge`, `loglady`, `damnfine`.
- **Cowboy Bebop** — `spike`, `swordfish`, `bebop`.
- **Studio Ghibli** — `totoro`, `noface`, `calcifer`, `catbus`.
- **The Matrix** — `neo`, `morpheus`, `construct`.
- **Ghostbusters** — `staypuft`, `zuul`, `proton`.
- **Elden Ring** — `tarnished`, `malenia`, `maidenless`.
- **Disco Elysium** — `revachol`, `kimkitsuragi`.
- **Calvin and Hobbes** — `transmogrifier`, `calvinball`, `spiff`.
- **Mean Girls** — `fetch`, `plastics`, `grool`.
- **Hitchhiker's Guide** — `vogon`, `babel`, `towel`, `magrathea`.
- **Serial Experiments Lain** — `lain`, `wired`. Web-native cult.
- **Dwarf Fortress** — `boatmurdered`, `catsplosion`.
- **Labyrinth** — `jareth`, `goblinking`.
- **Earthbound** — `giygas`, `ness`, `happyhappy`.
