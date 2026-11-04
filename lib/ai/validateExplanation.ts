import { z } from "zod";

import type { Fact } from "./facts";
import {
  MAX_FACT_REFS,
  MAX_LIMITATIONS_CHARS,
  MAX_OBSERVATIONS,
  MAX_OBSERVATION_CHARS,
} from "./prompts";

// Output validation for Muse Spark explanations.
//
// Dedicated to model-generated prose: nothing here reuses the user-input
// parsers. Every observation must cite server-generated fact IDs, every
// number in the text must match a cited fact exactly (integer-exact, never
// float-compared), and verdict, recommendation, or provenance vocabulary is
// rejected outright. Any failure discards the whole explanation.
//
// Known limitation (M2): citations plus numeric and phrase checks cannot
// prove qualitative statements true. A valid citation can still frame a
// misleading narrative, and paraphrase ("the numbers work in your favor")
// evades any fixed pattern list. The backstops are fixed instructions,
// short length caps, mandatory citations, server-rendered fact chips
// beside the prose, the educational disclaimer, and human review of live
// outputs. This module narrows the model's room to mislead; it does not
// claim complete semantic verification.

const observationSchema = z
  .object({
    text: z.string().min(1).max(MAX_OBSERVATION_CHARS),
    factIds: z
      .array(z.string().regex(/^f[1-9]\d*$/))
      .min(1)
      .max(MAX_FACT_REFS),
  })
  .strict();

const limitationsSchema = z
  .object({
    text: z.string().min(1).max(MAX_LIMITATIONS_CHARS),
    factIds: z
      .array(z.string().regex(/^f[1-9]\d*$/))
      .min(1)
      .max(MAX_FACT_REFS),
  })
  .strict();

export const explanationOutputSchema = z
  .object({
    observations: z.array(observationSchema).min(1).max(MAX_OBSERVATIONS),
    limitations: limitationsSchema,
  })
  .strict();

export type ExplanationOutput = z.output<typeof explanationOutputSchema>;

export type ValidationReason =
  | "invalid_shape"
  | "unknown_fact"
  | "banned_language"
  | "number_mismatch";

export interface ValidatedObservation {
  text: string;
  facts: Fact[];
}

export interface ValidatedExplanation {
  observations: ValidatedObservation[];
  limitations: ValidatedObservation;
}

// Verdict, recommendation, and ranking language. The model explains figures;
// it never judges affordability or picks a property.
const VERDICT_PATTERNS: RegExp[] = [
  /\bcan\s+afford\b/i,
  /\bcan\s*not\s+afford\b/i,
  /\bcan't\s+afford\b/i,
  /\bcould\s+(not\s+)?afford\b/i,
  /\bcouldn't\s+afford\b/i,
  /\bcomfortably\s+afford\b/i,
  /\b(is|are|seems?|looks?|appears?|sounds?|remains?|stays?|feels?)\s+(an?\s+)?(\w+\s+)?(affordable|comfortable|safe|risky|expensive)\b/i,
  /\bunaffordable\b/i,
  /\btoo\s+expensive\b/i,
  /\bfinancially\s+suitable\b/i,
  /\b(affordable|comfortable|expensive)\s+(home|house|property|payment|mortgage|loan|option|choice|price|cost|rate)\b(?!\s+(tax|rate|cost|insurance|loan))/i,
  /\bsafe\s+(investment|purchase|buy|bet|choice|option)\b/i,
  /\bshould\s+(buy|purchase|choose|sell|pick|go\s+with)\b/i,
  /\bought\s+to\s+(buy|choose|pick)\b/i,
  /\b(consider|worth)\s+(buying|choosing)\b/i,
  /\brecommend\w*\b/i,
  /\brank\w*\b/i,
  /\b(choose|pick|select|buy)\s+(property\s+)?[ab]\b/i,
  /\bgo\s+(for|with)\s+(property\s+)?[ab]\b/i,
  /\bavoid\s+(property\s+)?[ab]\b/i,
  /\b(can|could)\s+be\s+afforded\b/i,
  /\b(good|great|excellent|solid|smart|wise|sound|greater|greatest|smarter|smartest|wiser|wisest|better|best)\s+(choice|deal|option|buy|investment|value|purchase)\b/i,
  /\b(good|great|excellent|solid|smart|wise|sound|greater|greatest|smarter|smartest|wiser|wisest|better|best)\s+(property|home)\b(?!\s+(tax|rate|cost|insurance|loan))/i,
  /\b(poor|bad|terrible|awful|horrible)\s+(choice|deal|investment|option|buy|purchase|value)\b/i,
  /\b(poor|bad|terrible|awful|horrible)\s+(property|home)\b(?!\s+(tax|rate|cost|insurance|loan))/i,
  /\b(superior|preferable)\s+(choice|option|property|home|deal|investment)\b/i,
  /\b(is|are|would\s+be|could\s+be|seems?|looks?|appears?)\s+(an?\s+|the\s+)?(better|best|worse|worst|preferable)\b(?!\s+(estimates?|represented|expressed|explained|shown|displayed|understood)\b)/i,
  /\boutperform\w*\b/i,
  /\bbeats?\b/i,
  /\bcomes?\s+out\s+(ahead|on\s+top)\b/i,
  /\bwinner\b/i,
];

// Provenance vocabulary. The application labels every figure itself via
// fact chips, so the model asserting provenance could only contradict them.
// Bare "estimate" stays allowed as an ordinary noun for a figure ("higher
// maintenance estimate"); its verb/adjective forms are banned.
const PROVENANCE_PATTERNS: RegExp[] = [
  /\bestimat(ed|ing|es|ion|ions)\b/i,
  /\bassump\w+\b/i,
  /\bcalculat\w*\b/i,
  /\bcomput\w+\b/i,
  /user-provided/i,
  /\bexact\s+figure\b/i,
  /\byou\s+(entered|provided|input|gave|typed)\b/i,
];

// Multiplier vocabulary. Quantitative comparisons must cite figures, not
// hide behind "twice" or "half". "Double-check" is exempt: it advises
// diligence, not a quantity.
const MULTIPLIER_PATTERNS: RegExp[] = [
  /\b(twice|thrice|triple|quadruple|halve|halves|half|quarter)\b/i,
  /\bdouble\b(?!\s*-?\s*check)/i,
  /\b\w+fold\b/i,
];

export type TokenUnit = "money" | "percent" | "months" | "years" | "bare";

export interface NumberToken {
  raw: string;
  unit: TokenUnit;
  // Parsed exact values; null when the token cannot be represented exactly
  // (sub-cent money, oversized input) and therefore cannot match any fact.
  cents: number | null;
  milli: number | null;
  tenths: number | null;
  year: number | null;
  bare: string | null;
}

// Order matters: unit-bearing forms win over bare numbers at each position.
const TOKEN_RE =
  /-?\$[\d,]+(?:\.\d+)?|-?[\d,]+(?:\.\d+)?\s*%|[\d,]+(?:\.\d+)?\s*(?:months?|years?)\b|\b\d+\s*-years?\b|\b\d[\d,]*(?:\.\d+)?\b/gi;

// Exact scaled-integer parse of a decimal digit string via BigInt: intPart
// and fracPart contain digits only. Returns null past maxFrac decimals or
// beyond safe-integer range.
function scaledInt(
  intPart: string,
  fracPart: string,
  maxFrac: number,
): number | null {
  if (fracPart.length > maxFrac || intPart.length > 15) {
    return null;
  }
  // Constructor form only: BigInt literals need ES2020+ (see tsconfig).
  // 10 ** maxFrac is exact for maxFrac <= 3.
  const scale = BigInt(10 ** maxFrac);
  const value =
    BigInt(intPart) * scale +
    BigInt(fracPart.padEnd(maxFrac, "0") || "0");
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(value);
}

function splitDecimal(digits: string): { int: string; frac: string } {
  const [int = "", frac = ""] = digits.replace(/,/g, "").split(".");
  return { int: int === "" ? "0" : int, frac };
}

// Canonical bare form: no commas, no leading zeros, no trailing decimal
// zeros. Compared by string equality against builder-supplied forms.
function canonicalBare(digits: string): string {
  const { int, frac } = splitDecimal(digits);
  const normInt = int.replace(/^0+(?=\d)/, "");
  const normFrac = frac.replace(/0+$/, "");
  return normFrac === "" ? normInt : `${normInt}.${normFrac}`;
}

function emptyToken(raw: string, unit: TokenUnit): NumberToken {
  return { raw, unit, cents: null, milli: null, tenths: null, year: null, bare: null };
}

function parseToken(raw: string): NumberToken {
  // Only the money alternative captures a leading minus (signed deltas);
  // every other token class is non-negative in this domain.
  if (raw.startsWith("-$") || raw.startsWith("$")) {
    const token = emptyToken(raw, "money");
    const negated = raw.startsWith("-");
    const { int, frac } = splitDecimal(raw.slice(negated ? 2 : 1));
    const cents = scaledInt(int, frac, 2);
    token.cents = cents === null ? null : negated ? -cents : cents;
    return token;
  }
  if (raw.endsWith("%")) {
    // Signed milli: negative percentages match only explicitly negative
    // facts, so future negative-percent workflows keep working.
    const token = emptyToken(raw, "percent");
    const negated = raw.startsWith("-");
    const { int, frac } = splitDecimal(
      raw.slice(negated ? 1 : 0, -1).trim(),
    );
    const milli = scaledInt(int, frac, 3);
    token.milli = milli === null ? null : negated ? -milli : milli;
    return token;
  }
  const duration = raw.match(/^([\d,]+(?:\.\d+)?)\s*(?:-)?\s*(months?|years?)$/i);
  if (duration?.[1] !== undefined && duration[2] !== undefined) {
    const kind = duration[2].toLowerCase().startsWith("month") ? "months" : "years";
    const token = emptyToken(raw, kind);
    const { int, frac } = splitDecimal(duration[1]);
    if (kind === "months") {
      token.tenths = scaledInt(int, frac, 1);
      token.bare = canonicalBare(duration[1]);
    } else if (/^0*$/.test(frac)) {
      token.year = scaledInt(int, "", 0);
      token.bare = canonicalBare(duration[1]);
    }
    return token;
  }
  const token = emptyToken(raw, "bare");
  token.bare = canonicalBare(raw);
  return token;
}

// A word negator immediately before a digit token ("minus $200") must never
// read as the positive amount. Only the money and percent units support
// negatives, and only when the digits themselves are unsigned: bare numbers
// stay ambiguous ("5" in "5 dollars" vs "5 homes"), durations and counts
// have no negative form, and a negator stacked on an explicit "-" is
// contradictory, so all of those reject. Dash punctuation ("The balance -
// $5 - is due") is not a word and never triggers this.
const PRECEDING_WORD_RE = /([A-Za-z]+)\s*$/;

function applyDigitNegator(
  text: string,
  index: number,
  token: NumberToken,
): NumberToken {
  const prev = text
    .slice(0, index)
    .match(PRECEDING_WORD_RE)?.[1]?.toLowerCase();
  if (prev === undefined || !NEGATORS.has(prev)) {
    return token;
  }
  if (!token.raw.startsWith("-")) {
    if (token.unit === "money" && token.cents !== null) {
      return { ...token, cents: -token.cents };
    }
    if (token.unit === "percent" && token.milli !== null) {
      return { ...token, milli: -token.milli };
    }
  }
  return unmatchableToken(token.raw, token.unit);
}

export function extractNumberTokens(text: string): NumberToken[] {
  TOKEN_RE.lastIndex = 0;
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    tokens.push(applyDigitNegator(text, match.index ?? 0, parseToken(match[0])));
  }
  tokens.push(...extractWordTokens(text));
  return tokens;
}

// --- Number-word quantities (H1) ---
//
// Word-form quantities with financial units ("thirty percent", "two
// thousand dollars") validate exactly like digit tokens, converted through
// the same integer representations: dollars to cents, percentages to
// milli-percent, months to tenths, years to years, and property/home/line
// counts to bare integers. Vague quantifiers ("several percent", "a few
// dollars") and unparseable constructions emit unmatchable tokens, so they
// reject rather than bypass. Unit-less number-words ("one of the reasons")
// and qualitative uses ("a high percent") stay unchecked by design.

const WORD_ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  a: 1,
  an: 1,
};

const WORD_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const WORD_SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1000000,
};

const WORD_UNIT_RE =
  /\b(percent|months?|years?|dollars?|propert(?:y|ies)|homes?|lines?)\b/gi;

const WORD_RUN_RE = /([A-Za-z]+(?:[ -]+[A-Za-z]+)*)[ -]*$/;

const VAGUE_SINGLE = new Set([
  "several",
  "many",
  "few",
  "some",
  "various",
  "multiple",
  "numerous",
  "countless",
  "couple",
  "dozen",
  "dozens",
]);

const VAGUE_OF_HEADS = "few|little|numbers?|pairs?|couples?|lots?|dozens?";
const VAGUE_OF_RE = new RegExp(`^(?:a\\s+)?(?:${VAGUE_OF_HEADS})\\s+of$`);
// Intervening adjectives ("a couple of lovely homes") still express a vague
// quantity. Anchored at the run start so possessive and reference phrases
// ("account number of these homes", "buy a number of these homes")
// stay unchecked; mid-sentence vague phrases remain a known limitation.
const VAGUE_OF_ADJ_RE = new RegExp(
  `^(?:a\\s+)?(?:${VAGUE_OF_HEADS})\\s+of(?:\\s+[a-z]+){1,3}$`,
);

const MAX_WORD_VALUE = 999_999_999_999;

function isWordNumber(word: string): boolean {
  // hasOwn, not `in`: prototype names must never read as numbers.
  return (
    Object.hasOwn(WORD_ONES, word) ||
    Object.hasOwn(WORD_TENS, word) ||
    Object.hasOwn(WORD_SCALES, word)
  );
}

function parseWordValue(inputWords: string[]): number | null {
  // A leading article is grammatical, not quantitative ("a thirty-year
  // term" is thirty, not thirty-one).
  const words =
    inputWords.length > 1 && (inputWords[0] === "a" || inputWords[0] === "an")
      ? inputWords.slice(1)
      : inputWords;
  let total = 0;
  let current = 0;
  let seen = false;
  for (const word of words) {
    const one = WORD_ONES[word];
    if (one !== undefined) {
      current += one;
      seen = true;
      continue;
    }
    const ten = WORD_TENS[word];
    if (ten !== undefined) {
      current += ten;
      seen = true;
      continue;
    }
    const scale = WORD_SCALES[word];
    if (scale === undefined) {
      return null;
    }
    current = (seen ? current : 1) * scale;
    seen = true;
    if (scale >= 1000) {
      total += current;
      current = 0;
      seen = false;
    }
  }
  total += current;
  return total > MAX_WORD_VALUE ? null : total;
}

function wordUnitKind(unitWord: string): TokenUnit {
  const word = unitWord.toLowerCase();
  if (word === "percent") {
    return "percent";
  }
  if (word.startsWith("month")) {
    return "months";
  }
  if (word.startsWith("year")) {
    return "years";
  }
  if (word.startsWith("dollar")) {
    return "money";
  }
  return "bare";
}

function unmatchableToken(raw: string, unit: TokenUnit): NumberToken {
  return {
    raw,
    unit,
    cents: null,
    milli: null,
    tenths: null,
    year: null,
    bare: null,
  };
}

const NEGATORS = new Set(["negative", "minus"]);

function wordTokenFor(
  unitWord: string,
  value: number | null,
  negate: boolean,
): NumberToken {
  const unit = wordUnitKind(unitWord);
  // Conversions mirror the fact builders exactly; value is a safe integer
  // far below every overflow bound (max ~1e12, cents ~1e14).
  if (value === null) {
    return unmatchableToken(unitWord, unit);
  }
  // Signed word quantities match only explicitly signed facts. Durations
  // and counts have no negative form, so negated ones always reject.
  if (negate && unit !== "money" && unit !== "percent") {
    return unmatchableToken(unitWord, unit);
  }
  const signed = negate ? -value : value;
  const token = unmatchableToken(`${signed} ${unitWord}`, unit);
  switch (unit) {
    case "money":
      token.cents = signed * 100;
      break;
    case "percent":
      token.milli = signed * 1000;
      break;
    case "months":
      token.tenths = signed * 10;
      token.bare = String(signed);
      break;
    case "years":
      token.year = signed;
      token.bare = String(signed);
      break;
    case "bare":
      token.bare = String(signed);
      break;
  }
  return token;
}

function extractWordTokens(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  WORD_UNIT_RE.lastIndex = 0;
  for (const match of text.matchAll(WORD_UNIT_RE)) {
    const unitWord = match[1] ?? "";
    const before = text.slice(0, match.index ?? 0);
    const run = before.match(WORD_RUN_RE)?.[1] ?? "";
    const words = run
      .toLowerCase()
      .split(/[\s-]+/)
      .filter((word) => word !== "");
    const consumed: string[] = [];
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i] ?? "";
      if (!isWordNumber(word)) {
        break;
      }
      consumed.unshift(word);
    }
    if (consumed.length === 0) {
      // A vague quantifier with a financial unit is an unparseable
      // quantity claim: reject. Anything else is qualitative prose.
      const tail = words.slice(-3).join(" ");
      const last = words[words.length - 1] ?? "";
      if (
        VAGUE_SINGLE.has(last) ||
        VAGUE_OF_RE.test(tail) ||
        VAGUE_OF_ADJ_RE.test(words.join(" "))
      ) {
        tokens.push(unmatchableToken(match[0], wordUnitKind(unitWord)));
      }
      continue;
    }
    // A conjunction inside the run ("one hundred and five") means the
    // trailing words understate the claim: reject rather than validate
    // the fragment.
    const blocker = words[words.length - consumed.length - 1];
    const beforeBlocker = words[words.length - consumed.length - 2];
    if (
      blocker === "and" &&
      beforeBlocker !== undefined &&
      isWordNumber(beforeBlocker)
    ) {
      tokens.push(unmatchableToken(match[0], wordUnitKind(unitWord)));
      continue;
    }
    // An adjacent negator ("negative five dollars") must never read as
    // the positive amount: sign handling is explicit, and non-monetary
    // negations reject.
    const negate = blocker !== undefined && NEGATORS.has(blocker);
    tokens.push(wordTokenFor(unitWord, parseWordValue(consumed), negate));
  }
  return tokens;
}

function tokenMatches(token: NumberToken, facts: Fact[]): boolean {
  switch (token.unit) {
    case "money": {
      const cents = token.cents;
      return cents !== null && facts.some((f) => f.cents.includes(cents));
    }
    case "percent": {
      const milli = token.milli;
      return (
        milli !== null &&
        facts.some(
          (f) =>
            f.milliPct.includes(milli) ||
            (milli % 10 === 0 && f.bps.includes(milli / 10)),
        )
      );
    }
    case "months": {
      const tenths = token.tenths;
      const bare = token.bare;
      return (
        (tenths !== null && facts.some((f) => f.monthsX10.includes(tenths))) ||
        (bare !== null && facts.some((f) => f.bare.includes(bare)))
      );
    }
    case "years": {
      const year = token.year;
      const bare = token.bare;
      return (
        (year !== null && facts.some((f) => f.years.includes(year))) ||
        (bare !== null && facts.some((f) => f.bare.includes(bare)))
      );
    }
    case "bare": {
      const bare = token.bare;
      return bare !== null && facts.some((f) => f.bare.includes(bare));
    }
  }
}

function hasBannedLanguage(text: string): boolean {
  return [...VERDICT_PATTERNS, ...PROVENANCE_PATTERNS, ...MULTIPLIER_PATTERNS].some(
    (pattern) => pattern.test(text),
  );
}

export function validateExplanation(
  input: unknown,
  facts: Fact[],
):
  | { ok: true; explanation: ValidatedExplanation }
  | { ok: false; reason: ValidationReason } {
  const parsed = explanationOutputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_shape" };
  }
  const ledger = new Map(facts.map((fact) => [fact.id, fact]));
  const resolve = (
    section: { text: string; factIds: string[] },
  ): ValidatedObservation | null => {
    const cited: Fact[] = [];
    for (const id of section.factIds) {
      const fact = ledger.get(id);
      if (fact === undefined) {
        return null;
      }
      cited.push(fact);
    }
    return { text: section.text, facts: cited };
  };
  const observations: ValidatedObservation[] = [];
  for (const section of parsed.data.observations) {
    const resolved = resolve(section);
    if (resolved === null) {
      return { ok: false, reason: "unknown_fact" };
    }
    observations.push(resolved);
  }
  const limitations = resolve(parsed.data.limitations);
  if (limitations === null) {
    return { ok: false, reason: "unknown_fact" };
  }
  const sections = [...observations, limitations];
  if (sections.some((section) => hasBannedLanguage(section.text))) {
    return { ok: false, reason: "banned_language" };
  }
  for (const section of sections) {
    const grounded = extractNumberTokens(section.text).every((token) =>
      tokenMatches(token, section.facts),
    );
    if (!grounded) {
      return { ok: false, reason: "number_mismatch" };
    }
  }
  return { ok: true, explanation: { observations, limitations } };
}
