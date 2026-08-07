/**
 * ASD-STE100 Issue 9 Simplified Technical English (STE) & ATS Bullet Validator
 * ===========================================================================
 * Client-side validation engine enforcing ASD-STE100 rules and ATS bullet
 * quality guidelines for resume bullet points and professional summaries.
 *
 * Rules Implemented:
 * - Rule 1.14 (Spelling): Flag British English variants (e.g. 'colour', 'centre')
 * - Rule 3.2 (Verb Tenses): Flag non-permitted complex tenses (perfect/progressive)
 * - Rule 3.5 (Ing-Forms): Flag non-approved '-ing' forms unless allowed
 * - Rule 3.6 (Active Voice): Detect passive voice patterns and 'by <agent>'
 * - Rule 4.2 (Contractions): Detect contractions like 'don't', 'can't', etc.
 * - Rule 5.1 / 6.3 (Sentence Length): Enforce word count limits (20 for procedural, 25 for descriptive)
 * - Rule 8.1 (Semicolon): Flag use of semicolons
 * - Rule 8.5/8.6/8.7 (STE Word Count): Handle hyphens, parentheses, quotes, units
 * - ATS Metrics Check: Recommend quantifiable metrics (%, $, numbers) in experience bullets
 */

export type RuleId =
  | "RULE_1_14_SPELLING"
  | "RULE_3_2_TENSES"
  | "RULE_3_5_ING_FORMS"
  | "RULE_3_6_PASSIVE"
  | "RULE_4_2_CONTRACTIONS"
  | "RULE_5_1_LENGTH"
  | "RULE_8_1_SEMICOLON"
  | "ATS_METRICS";

export type STE100RuleViolation = {
  ruleId: RuleId;
  severity: "warning" | "error" | "info";
  message: string;
  suggestion?: string;
};

export type BulletSTE100Result = {
  bullet: string;
  wordCount: number;
  score: number;
  violations: STE100RuleViolation[];
  isCompliant: boolean;
  improvementTips: string[];
};

export type ProfileSTE100Summary = {
  totalBullets: number;
  compliantBullets: number;
  overallScore: number;
  topTips: string[];
  bulletResults: BulletSTE100Result[];
};

const BRITISH_TO_AMERICAN: Record<string, string> = {
  colour: "color",
  colours: "colors",
  centre: "center",
  centres: "centers",
  fibre: "fiber",
  fibres: "fibers",
  theatre: "theater",
  theatres: "theaters",
  organise: "organize",
  organises: "organizes",
  organised: "organized",
  organising: "organizing",
  analyse: "analyze",
  analyses: "analyzes",
  analysed: "analyzed",
  analysing: "analyzing",
  optimise: "optimize",
  optimises: "optimizes",
  optimised: "optimized",
  optimising: "optimizing",
  behaviour: "behavior",
  behaviours: "behaviors",
  modelling: "modeling",
  travelled: "traveled",
  travelling: "traveling",
  cancelled: "canceled",
  cancelling: "canceling",
};

const BRITISH_TO_AMERICAN_PATTERNS = Object.entries(BRITISH_TO_AMERICAN).map(
  ([british, american]) => ({
    pattern: new RegExp(`\\b${british}\\b`, "i"),
    british,
    american,
  })
);


const APPROVED_ING_WORDS = new Set([
  "lighting",
  "opening",
  "routing",
  "servicing",
  "mating",
  "missing",
  "remaining",
  "something",
  "during",
]);

const CONTRACTION_PATTERNS: { pattern: RegExp; expansion: string }[] = [
  { pattern: /\bcan\s*n't\b/i, expansion: "cannot" },
  { pattern: /\bwon\s*n't\b/i, expansion: "will not" },
  { pattern: /\bdon't\b/i, expansion: "do not" },
  { pattern: /\bisn't\b/i, expansion: "is not" },
  { pattern: /\baren't\b/i, expansion: "are not" },
  { pattern: /\bwasn't\b/i, expansion: "was not" },
  { pattern: /\bweren't\b/i, expansion: "were not" },
  { pattern: /\bhasn't\b/i, expansion: "has not" },
  { pattern: /\bhaven't\b/i, expansion: "have not" },
  { pattern: /\bhadn't\b/i, expansion: "had not" },
  { pattern: /\bshouldn't\b/i, expansion: "should not" },
  { pattern: /\bwouldn't\b/i, expansion: "would not" },
  { pattern: /\bcouldn't\b/i, expansion: "could not" },
  { pattern: /\bdoes't\b/i, expansion: "does not" },
  { pattern: /\bdoesn't\b/i, expansion: "does not" },
  { pattern: /\bdidn't\b/i, expansion: "did not" },
  { pattern: /\bi'm\b/i, expansion: "I am" },
  { pattern: /\byou're\b/i, expansion: "you are" },
  { pattern: /\bhe's\b/i, expansion: "he is" },
  { pattern: /\bshe's\b/i, expansion: "she is" },
  { pattern: /\bit's\b/i, expansion: "it is" },
  { pattern: /\bwe're\b/i, expansion: "we are" },
  { pattern: /\bthey're\b/i, expansion: "they are" },
  { pattern: /\bi've\b/i, expansion: "I have" },
  { pattern: /\byou've\b/i, expansion: "you have" },
  { pattern: /\bwe've\b/i, expansion: "we have" },
  { pattern: /\bthey've\b/i, expansion: "they have" },
  { pattern: /\bi'd\b/i, expansion: "I would" },
  { pattern: /\byou'd\b/i, expansion: "you would" },
  { pattern: /\bhe'd\b/i, expansion: "he would" },
  { pattern: /\bshe'd\b/i, expansion: "she would" },
  { pattern: /\bwe'd\b/i, expansion: "we would" },
  { pattern: /\bthey'd\b/i, expansion: "they would" },
  { pattern: /\bi'll\b/i, expansion: "I will" },
  { pattern: /\byou'll\b/i, expansion: "you will" },
  { pattern: /\bhe'll\b/i, expansion: "he will" },
  { pattern: /\bshe'll\b/i, expansion: "she will" },
  { pattern: /\bwe'll\b/i, expansion: "we will" },
  { pattern: /\bthey'll\b/i, expansion: "they will" },
  { pattern: /\blet's\b/i, expansion: "let us" },
  { pattern: /\bthat's\b/i, expansion: "that is" },
  { pattern: /\bthere's\b/i, expansion: "there is" },
  { pattern: /\bwhat's\b/i, expansion: "what is" },
  { pattern: /\bwho's\b/i, expansion: "who is" },
];

const BE_VERBS = "(?:am|is|are|was|were|be|been|being)";
const PAST_PARTICIPLE = "(?:[a-zA-Z]+ed|[a-zA-Z]+en|built|made|done|sent|written|taken|given|seen|led|held|paid|spent|found)";
const PASSIVE_REGEX = new RegExp(
  `\\b${BE_VERBS}\\s+(?:[a-zA-Z]+ly\\s+)?${PAST_PARTICIPLE}\\b`,
  "i"
);
const BY_AGENT_REGEX = new RegExp(
  `\\b${BE_VERBS}\\s+(?:[a-zA-Z]+ly\\s+)?${PAST_PARTICIPLE}\\s+by\\b\\s+[a-zA-Z]+`,
  "i"
);
const PERFECT_REGEX = /\b(?:has|have|had)\s+(?:[a-zA-Z]+ly\s+)?(?:[a-zA-Z]+ed|[a-zA-Z]+en|been)\b/i;
const PROGRESSIVE_REGEX = /\b(?:am|is|are|was|were)\s+(?:[a-zA-Z]+ly\s+)?[a-zA-Z]+ing\b/i;
const METRICS_REGEX = /\b(?:\d+(?:\.\d+)?%?|\$\d+|\d+\+|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million)\b)/i;

/**
 * Calculates sentence word count using ASD-STE100 rules (Rules 8.5, 8.6, 8.7).
 */
export function countWordsSTE100(sentence: string): number {
  if (!sentence || !sentence.trim()) return 0;

  // 1. Parentheses (Rule 8.5): Replace contents with a single token
  let cleaned = sentence.replace(/\([^)]*(?:\([^)]*\)[^)]*)*\)/g, "___PAREN___");

  // 2. Quoted text (Rule 8.6): Replace quoted substring with a single token
  cleaned = cleaned.replace(/"[^"]*"/g, "___QUOTE___");

  // 3. Abbreviations (Rule 8.6)
  cleaned = cleaned.replace(
    /\b(e\.g\.|i\.e\.|a\.m\.|p\.m\.|vs\.|no\.|approx\.)/gi,
    "___ABBR___"
  );

  // 4. Numbers together with units of measurement (Rule 8.6)
  cleaned = cleaned.replace(
    /\b\d+(?:\.\d+)?\s*(?:mA|°C|kg|kilograms|degrees\s+Celsius|ohms|V|dB|mm|in|knots|h|min|s|seconds|meters|L|l|%|k|m|B)?\b/gi,
    "___NUM_UNIT___"
  );

  // 5. Tokenize by splitting on spaces, ignoring outer punctuation except internal hyphens (Rule 8.7)
  const tokens = cleaned
    .split(/\s+/)
    .map((raw) => raw.replace(/^[^\w_@]+|[^\w_@]+$/g, ""))
    .filter(Boolean);

  return tokens.length;
}

/**
 * Validates a single bullet point against ASD-STE100 Issue 9 rules and ATS guidelines.
 */
export function validateBulletSTE100(
  bullet: string,
  isProcedural = true
): BulletSTE100Result {
  const violations: STE100RuleViolation[] = [];
  const improvementTips: string[] = [];
  const wordCount = countWordsSTE100(bullet);

  if (!bullet || !bullet.trim()) {
    return {
      bullet,
      wordCount: 0,
      score: 100,
      violations: [],
      isCompliant: true,
      improvementTips: [],
    };
  }

  // Rule 8.1: Semicolon
  if (bullet.includes(";")) {
    violations.push({
      ruleId: "RULE_8_1_SEMICOLON",
      severity: "warning",
      message: "Semicolon ';' is not permitted in STE-100",
      suggestion: "Split into two distinct sentences or bullet points.",
    });
    improvementTips.push("Remove semicolon ';' and split complex clauses into separate concise points.");
  }

  // Word count limits (Rule 5.1 / 6.3)
  const limit = isProcedural ? 20 : 25;
  if (wordCount > limit) {
    violations.push({
      ruleId: "RULE_5_1_LENGTH",
      severity: "warning",
      message: `Bullet is too long (${wordCount} words; max recommended is ${limit} words)`,
      suggestion: `Trim bullet to under ${limit} words for high ATS readability.`,
    });
    improvementTips.push(`Shorten bullet from ${wordCount} words to under ${limit} words for maximum ATS impact.`);
  }

  // Rule 1.14: British Spelling
  for (const { pattern, british, american } of BRITISH_TO_AMERICAN_PATTERNS) {
    if (pattern.test(bullet)) {
      violations.push({
        ruleId: "RULE_1_14_SPELLING",
        severity: "warning",
        message: `British spelling '${british}' detected`,
        suggestion: `Use American spelling '${american}'.`,
      });
      improvementTips.push(`Replace British spelling '${british}' with American '${american}'.`);
    }
  }

  // Rule 4.2: Contractions
  for (const { pattern, expansion } of CONTRACTION_PATTERNS) {
    const match = bullet.match(pattern);
    if (match) {
      violations.push({
        ruleId: "RULE_4_2_CONTRACTIONS",
        severity: "warning",
        message: `Contraction '${match[0]}' is not permitted`,
        suggestion: `Write in full as '${expansion}'.`,
      });
      improvementTips.push(`Expand contraction '${match[0]}' to '${expansion}'.`);
    }
  }

  // Rule 3.6: Passive Voice
  const passiveMatch = PASSIVE_REGEX.exec(bullet);
  const byMatch = BY_AGENT_REGEX.exec(bullet);
  if (passiveMatch || byMatch) {
    const found = byMatch ? byMatch[0] : passiveMatch ? passiveMatch[0] : "";
    violations.push({
      ruleId: "RULE_3_6_PASSIVE",
      severity: "warning",
      message: `Passive voice pattern detected: '${found}'`,
      suggestion: "Rewrite using active voice starting with a strong action verb.",
    });
    improvementTips.push(`Convert passive construction ('${found}') to active voice starting with an action verb (e.g. 'Engineered', 'Architected').`);
  }

  // Rule 3.5: Non-approved -ing forms
  const ingMatches = bullet.match(/\b([a-zA-Z]+ing)\b/gi) || [];
  for (const word of ingMatches) {
    const lower = word.toLowerCase();
    if (!APPROVED_ING_WORDS.has(lower) && !bullet.toLowerCase().includes(`-${lower}`) && !bullet.toLowerCase().includes(`${lower}-`)) {
      violations.push({
        ruleId: "RULE_3_5_ING_FORMS",
        severity: "info",
        message: `'-ing' form '${word}' is discouraged under STE-100 Rule 3.5`,
        suggestion: "Use past-tense action verb or concise noun form.",
      });
      improvementTips.push(`Swap '-ing' word '${word}' for a direct past-tense action verb.`);
    }
  }

  // Rule 3.2: Perfect & Progressive Tenses
  const perfectMatch = PERFECT_REGEX.exec(bullet);
  const progMatch = PROGRESSIVE_REGEX.exec(bullet);
  if (perfectMatch || progMatch) {
    const found = perfectMatch ? perfectMatch[0] : progMatch ? progMatch[0] : "";
    violations.push({
      ruleId: "RULE_3_2_TENSES",
      severity: "warning",
      message: `Complex tense '${found}' detected`,
      suggestion: "Use simple past tense (e.g. 'Built', 'Led').",
    });
    improvementTips.push(`Replace complex tense '${found}' with simple past tense.`);
  }

  // ATS Metrics Check
  if (!METRICS_REGEX.test(bullet)) {
    violations.push({
      ruleId: "ATS_METRICS",
      severity: "info",
      message: "No quantifiable metric or number detected in bullet",
      suggestion: "Add metrics (%, $, time saved, scale) to demonstrate impact.",
    });
    improvementTips.push("Include measurable metrics (e.g. 'boosted performance by 35%', 'managed 10+ services') to quantify impact.");
  }

  // Calculate score (0 - 100)
  let score = 100;
  for (const v of violations) {
    if (v.severity === "error") score -= 25;
    else if (v.severity === "warning") score -= 15;
    else if (v.severity === "info") score -= 5;
  }
  score = Math.max(0, Math.min(100, score));

  const isCompliant = violations.filter((v) => v.severity !== "info").length === 0;

  return {
    bullet,
    wordCount,
    score,
    violations,
    isCompliant,
    improvementTips,
  };
}

/**
 * Evaluates an entire collection of experience bullets and returns a summary.
 */
export function analyzeProfileBulletsSTE100(
  bullets: string[]
): ProfileSTE100Summary {
  if (!bullets || bullets.length === 0) {
    return {
      totalBullets: 0,
      compliantBullets: 0,
      overallScore: 100,
      topTips: [],
      bulletResults: [],
    };
  }

  const bulletResults = bullets.map((b) => validateBulletSTE100(b));
  const totalBullets = bulletResults.length;
  const compliantBullets = bulletResults.filter((r) => r.isCompliant).length;
  const totalScore = bulletResults.reduce((acc, r) => acc + r.score, 0);
  const overallScore = Math.round(totalScore / totalBullets);

  // Aggregate tips
  const tipsSet = new Set<string>();
  bulletResults.forEach((r) => r.improvementTips.forEach((t) => tipsSet.add(t)));

  return {
    totalBullets,
    compliantBullets,
    overallScore,
    topTips: Array.from(tipsSet).slice(0, 5),
    bulletResults,
  };
}
