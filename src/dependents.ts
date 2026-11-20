import { compareCodeUnits } from "./util.js";

// KTD7: the rename set closed over CSS dependencies. A selector arm is
// dependent when it holds a class outside the rename set, and ordinary
// otherwise. The stylesheet transform renames only ordinary arms and skips
// dependent ones (mixed-compound-skipped), so a renamed token whose arms
// are all dependent would never appear renamed and would fail presence.
// That token keeps its original name instead. A token in no arm at all
// stays renamed, so presence still fails on it. The pre-pass runs this on
// the compiled entry stylesheet and apply on the built stylesheets; `arms`
// is selectorArmTokens' output.
//
// One pass reaches the fixed point KTD7 asks for. Keeping a token changes
// no arm's status: every arm holding it was already dependent, or the
// token would have had an ordinary arm and renamed.
export function dependentTokens(
  arms: ReadonlyArray<ReadonlyArray<string>>,
  renames: (token: string) => boolean,
): Array<string> {
  const inArms = new Set<string>();
  const inOrdinaryArm = new Set<string>();
  for (const arm of arms) {
    const renamed = arm.filter(renames);
    const ordinary = renamed.length === arm.length;
    for (const token of renamed) {
      inArms.add(token);
      if (ordinary) inOrdinaryArm.add(token);
    }
  }
  return Array.from(inArms)
    .filter(function (token) {
      return !inOrdinaryArm.has(token);
    })
    .sort(compareCodeUnits);
}
