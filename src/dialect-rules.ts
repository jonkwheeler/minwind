import type { DialectId } from "./dialect-ids.js";

function replaceAll(input: string, find: string, replace: string): string {
  return input.split(find).join(replace);
}

function applyPairs(input: string, pairs: Array<[string, string]>): string {
  let out = input;
  let i = 0;
  while (i < pairs.length) {
    out = replaceAll(out, pairs[i][0], pairs[i][1]);
    i += 1;
  }
  return out;
}

function stretchVowels(input: string, times: number): string {
  const chars = input.split("");
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if ("aeiou".indexOf(ch) !== -1) {
      out.push(ch.repeat(times));
    } else {
      out.push(ch);
    }
    i += 1;
  }
  return out.join("");
}

function bostonize(word: string): string {
  return applyPairs(word, [
    ["ight", "aht"],
    ["ough", "aw"],
    ["augh", "ah"],
    ["alk", "awk"],
    ["all", "awl"],
    ["ar", "ah"],
    ["er", "ah"],
    ["or", "aw"],
    ["ir", "eeah"],
    ["ur", "ah"],
    ["ing", "in"],
    ["r", ""],
  ]);
}

function australiaize(word: string): string {
  return applyPairs(word, [
    ["ight", "oight"],
    ["ite", "oite"],
    ["ay", "ie"],
    ["ey", "ee"],
    ["no", "naur"],
    ["ow", "aow"],
    ["ou", "ow"],
    ["er", "ah"],
    ["ing", "in"],
  ]);
}

function texasize(word: string): string {
  let out = applyPairs(word, [
    ["ight", "aaaht"],
    ["all", "awl"],
    ["alk", "awk"],
    ["oil", "oll"],
    ["or", "oar"],
    ["er", "urr"],
    ["ing", "in"],
  ]);
  out = stretchVowels(out, 2);
  return out;
}

function englandize(word: string): string {
  let out = word;
  if (out.charAt(0) === "h") {
    out = "'" + out.slice(1);
  }
  return applyPairs(out, [
    ["ight", "oight"],
    ["through", "frough"],
    ["th", "f"],
    ["tion", "shun"],
    ["old", "owld"],
    ["er", "ah"],
    ["ing", "in'"],
  ]);
}

function scotlandize(word: string): string {
  return applyPairs(word, [
    ["ight", "icht"],
    ["ough", "och"],
    ["ou", "oo"],
    ["ow", "oo"],
    ["oo", "oo"],
    ["er", "ir"],
    ["ing", "in"],
    ["r", "rr"],
  ]);
}

function irelandize(word: string): string {
  return applyPairs(word, [
    ["ight", "oight"],
    ["through", "troo"],
    ["th", "t"],
    ["ing", "in"],
    ["er", "er"],
    ["you", "yeh"],
    ["my", "me"],
  ]);
}

function walesize(word: string): string {
  let out = applyPairs(word, [
    ["ight", "eieight"],
    ["ll", "ll"],
    ["l", "ll"],
    ["th", "dd"],
    ["w", "w"],
    ["ing", "io"],
  ]);
  if (out.length > 2 && out.indexOf("-") === -1) {
    const mid = Math.floor(out.length / 2);
    out = out.slice(0, mid) + "-" + out.slice(mid);
  }
  return out;
}

function newyorkize(word: string): string {
  return applyPairs(word, [
    ["orange", "awrange"],
    ["alk", "awk"],
    ["all", "awl"],
    ["or", "aw"],
    ["ar", "ah"],
    ["er", "uh"],
    ["th", "d"],
    ["ing", "in"],
  ]);
}

function canadaize(word: string): string {
  return applyPairs(word, [
    ["out", "oot"],
    ["ough", "oo"],
    ["ou", "oo"],
    ["ow", "oo"],
    ["ouse", "oose"],
    ["or", "oar"],
    ["ing", "ing-eh"],
  ]);
}

function savannahize(word: string): string {
  let out = applyPairs(word, [
    ["ight", "aaaaaiiiht"],
    ["ing", "iiiin'"],
    ["er", "aaaah"],
    ["th", "thhh"],
  ]);
  out = stretchVowels(out, 3);
  return out;
}

function degenerateize(word: string): string {
  let out = applyPairs(word, [
    ["ight", "ight"],
    ["tion", "shun"],
    ["th", "f"],
    ["er", "ew"],
    ["le", "we"],
    ["ll", "ww"],
    ["r", "w"],
    ["l", "w"],
    ["ing", "inny"],
  ]);
  if (out.length > 3) {
    const first = out.charAt(0);
    if ("bcdfghjklmnpqrstvwxyz".indexOf(first) !== -1) {
      out = first + "-" + out;
    }
  }
  return out;
}

function ghettoize(word: string): string {
  let out = word;
  if (out.indexOf("mb") !== -1) {
    out = replaceAll(out, "mb", "embay");
  }
  if (/^s[ptcklmnwfr]/.test(out)) {
    out = "e" + out;
  }
  return applyPairs(out, [
    ["tion", "shun"],
    ["ture", "chur"],
    ["ight", "ite"],
    ["ough", "uff"],
    ["augh", "aff"],
    ["ph", "f"],
    ["qu", "kw"],
    ["kn", "n"],
    ["wh", "w"],
    ["th", "d"],
    ["ing", "in"],
    ["er", "a"],
    ["or", "a"],
    ["le", "uh"],
    ["x", "cks"],
    ["oo", "u"],
    ["tt", "d"],
    ["ll", "w"],
  ]);
}

function yorkshireize(word: string): string {
  return applyPairs(word, [["ight", "eet"]]);
}

export function applyRules(word: string, dialect: DialectId): string {
  if (dialect === "boston") {
    return bostonize(word);
  }
  if (dialect === "australia") {
    return australiaize(word);
  }
  if (dialect === "texas") {
    return texasize(word);
  }
  if (dialect === "england") {
    return englandize(word);
  }
  if (dialect === "scotland") {
    return scotlandize(word);
  }
  if (dialect === "ireland") {
    return irelandize(word);
  }
  if (dialect === "wales") {
    return walesize(word);
  }
  if (dialect === "newyork") {
    return newyorkize(word);
  }
  if (dialect === "canada") {
    return canadaize(word);
  }
  if (dialect === "savannah") {
    return savannahize(word);
  }
  if (dialect === "ghetto") {
    return ghettoize(word);
  }
  if (dialect === "degenerate") {
    return degenerateize(word);
  }
  if (dialect === "yorkshire") {
    return yorkshireize(word);
  }
  return word;
}
