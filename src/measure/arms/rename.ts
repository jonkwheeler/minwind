import { unescapeCssIdentifier } from "../css-model.js";
import type { ClassInventoryEntry } from "../exclusions.js";
import type { ArmResult, SimulationInput, SpanEdit } from "../span-edit.js";
import {
  buildArmResult,
  createArmNameAllocator,
  rawTokensWithinSpan,
  routeAndApplySpanEdits,
} from "../span-edit.js";
import { compareCodeUnits } from "../util.js";

// KTD7 eligibility: utility-layer classes appearing in at least one class
// attribute. A class that is also a marker reference in another selector arm
// (variantReferences > 0) is additionally held out: renaming its candidate
// occurrences while references keep the old name would break those selectors
// (R7), and the safe direction is always to keep original bytes.
function eligibleEntries(input: SimulationInput): Array<ClassInventoryEntry> {
  const eligible = input.model.entries.filter(function (entry) {
    return (
      entry.category === "utility" &&
      !entry.excluded &&
      entry.variantReferences === 0
    );
  });
  eligible.sort(function (a, b) {
    if (a.htmlOccurrences !== b.htmlOccurrences) {
      return b.htmlOccurrences - a.htmlOccurrences;
    }
    return compareCodeUnits(a.token, b.token);
  });
  return eligible;
}

// Collects every rename edit, tagging each with its owning class so a single
// span mismatch routes the whole class to the unmodelable set (KTD2/KTD6).
// Tokens in `dropped` are already routed and keep original bytes everywhere.
function collectEdits(
  input: SimulationInput,
  newNameByToken: Map<string, string>,
  dropped: ReadonlySet<string>,
): { editsByFile: Map<string, Array<SpanEdit>>; unroutable: Set<string> } {
  const editsByFile = new Map<string, Array<SpanEdit>>();
  const unroutable = new Set<string>();

  function editsFor(filePath: string): Array<SpanEdit> {
    let edits = editsByFile.get(filePath);
    if (!edits) {
      edits = [];
      editsByFile.set(filePath, edits);
    }
    return edits;
  }

  for (const [filePath, source] of input.htmlSources) {
    const attributes = input.htmlClassAttributes.get(filePath);
    if (!attributes) continue;
    for (const occurrence of attributes) {
      const rawTokens = rawTokensWithinSpan(source, occurrence.span);
      if (rawTokens.length !== occurrence.tokens.length) {
        // Entity-decoded whitespace (e.g. &#32;) breaks the positional match
        // between decoded tokens and raw source; route every eligible member.
        for (const token of occurrence.tokens) {
          if (newNameByToken.has(token)) unroutable.add(token);
        }
        continue;
      }
      for (let i = 0; i < rawTokens.length; i += 1) {
        const token = occurrence.tokens[i];
        const name = newNameByToken.get(token);
        if (!name || dropped.has(token)) continue;
        if (rawTokens[i].token !== token) {
          // An entity (e.g. &amp;) inside this token's raw source.
          unroutable.add(token);
          continue;
        }
        editsFor(filePath).push({
          start: rawTokens[i].start,
          end: rawTokens[i].end,
          expected: rawTokens[i].token,
          replacement: name,
          owner: token,
        });
      }
    }
  }

  for (const [filePath, source] of input.cssSources) {
    const model = input.cssModels.get(filePath);
    if (!model) continue;
    for (const rule of model.rules) {
      for (const arm of rule.arms) {
        const candidate = arm.candidates[0];
        if (candidate === undefined) continue;
        const name = newNameByToken.get(candidate);
        if (!name || dropped.has(candidate)) continue;
        // The candidate identifier span was recorded at model time from the
        // original ClassSelector node (absolute offsets), so the selector is
        // never re-parsed here.
        const identifierSpan = arm.candidateSpan;
        if (identifierSpan === null) {
          unroutable.add(candidate);
          continue;
        }
        const rawIdentifier = source.slice(
          identifierSpan.start,
          identifierSpan.end,
        );
        if (unescapeCssIdentifier(rawIdentifier) !== candidate) {
          unroutable.add(candidate);
          continue;
        }
        editsFor(filePath).push({
          start: identifierSpan.start,
          end: identifierSpan.end,
          expected: rawIdentifier,
          replacement: name,
          owner: candidate,
        });
      }
    }
  }

  return { editsByFile, unroutable };
}

export function simulateRename(input: SimulationInput): ArmResult {
  const newNameByToken = new Map<string, string>();
  const allocate = createArmNameAllocator(input);
  for (const entry of eligibleEntries(input)) {
    newNameByToken.set(entry.token, allocate());
  }

  // Routing is global: a class that fails anywhere keeps its original bytes
  // in every file, so discovery and application loop until a fixpoint.
  const dropped = new Set<string>();
  let files: Map<string, string> | null = null;
  for (let attempt = 0; attempt <= input.model.entries.length; attempt += 1) {
    const { editsByFile, unroutable } = collectEdits(
      input,
      newNameByToken,
      dropped,
    );
    const freshUnroutable = Array.from(unroutable).filter(function (token) {
      return !dropped.has(token);
    });
    if (freshUnroutable.length > 0) {
      for (const token of freshUnroutable) dropped.add(token);
      continue;
    }
    const nextFiles = new Map<string, string>();
    const rejected: Array<string> = [];
    const sources = new Map<string, string>([
      ...input.htmlSources,
      ...input.cssSources,
    ]);
    for (const [filePath, source] of sources) {
      const result = routeAndApplySpanEdits(
        source,
        editsByFile.get(filePath) ?? [],
      );
      nextFiles.set(filePath, result.output);
      rejected.push(...result.rejectedOwners);
    }
    const freshRejected = rejected.filter(function (token) {
      return !dropped.has(token);
    });
    if (freshRejected.length > 0) {
      for (const token of freshRejected) dropped.add(token);
      continue;
    }
    files = nextFiles;
    break;
  }
  if (files === null) {
    throw new Error("rename edit routing did not converge");
  }

  return buildArmResult("rename", input, files, {
    classesRenamed: newNameByToken.size - dropped.size,
    unmodelableTokens: Array.from(dropped).sort(compareCodeUnits),
  });
}
