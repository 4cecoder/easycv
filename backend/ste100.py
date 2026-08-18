"""
ASD-STE100 Issue 9 Simplified Technical English (STE) Validator
==============================================================
A modular, fully documented rule engine to check text compliance
against key grammar, style, and word-count guidelines of ASD-STE100.

Rules Implemented:
- Rule 1.14 (Spelling): Flag British spelling variants (e.g., 'colour', 'fibre').
- Rule 3.2 (Verb Tenses): Flag non-permitted complex tenses (perfect/progressive helper patterns).
- Rule 3.5 (Ing-Forms): Flag non-approved '-ing' forms unless they belong to allowed lists.
- Rule 3.6 (Active Voice): Detect passive voice helper patterns and 'by <agent>'.
- Rule 4.2 (Omission & Contractions): Detect contraction forms like 'don't', 'isn't', etc.
- Rule 5.1 / 6.3 (Sentence Length): Enforce word count limit (20 words for procedures, 25 for descriptions).
- Rule 8.1 (Semicolon): Flag use of semicolons.
- Rule 8.5 / 8.6 / 8.7 (STE Word Count):
  - Hyphenated words count as one word (Rule 8.7).
  - Numbers, abbreviations, alphanumeric IDs, and quoted text count as one word (Rule 8.6).
  - Parenthesized phrases count as one word in the host sentence (Rule 8.5).
"""

import re
from typing import List


# British vs American English spelling map (Rule 1.14)
BRITISH_TO_AMERICAN_SPELLING = {
    r"\bcolour(s)?\b": "color",
    r"\bfibre(s)?\b": "fiber",
    r"\bcentre(s)?\b": "center",
    r"\btheatre(s)?\b": "theater",
    r"\borganise(s|d|e?s)?\b": "organize",
    r"\banalyse(s|d|e?s)?\b": "analyze",
    r"\bbehaviour(s)?\b": "behavior",
    r"\boptimise(s|d|e?s)?\b": "optimize",
    r"\bmodelling\b": "modeling",
    r"\btravelled\b": "traveled",
    r"\btravelling\b": "traveling",
    r"\bcancelled\b": "canceled",
    r"\bcancelling\b": "canceling",
}

# Approved words with "-ing" suffix (Rule 3.5)
APPROVED_ING_WORDS = {
    "lighting", "opening", "routing", "servicing",  # Nouns
    "mating", "missing", "remaining",              # Adjectives
    "something",                                    # Pronoun
    "during"                                        # Preposition
}

# Standard contractions to flag (Rule 4.2)
CONTRACTION_PATTERNS = [
    r"\bca\s*n't\b", r"\bwo\s*n't\b", r"\bdon't\b", r"\bisn't\b", r"\baren't\b",
    r"\bwasn't\b", r"\bweren't\b", r"\bhasn't\b", r"\bhaven't\b", r"\bhadn't\b",
    r"\bshouldn't\b", r"\bwouldn't\b", r"\bcouldn't\b", r"\bdoesn't\b", r"\bdidn't\b",
    r"\bi'm\b", r"\byou're\b", r"\bhe's\b", r"\bshe's\b", r"\bit's\b", r"\bwe're\b",
    r"\bthey're\b", r"\bi've\b", r"\byou've\b", r"\bwe've\b", r"\bthey've\b",
    r"\bi'd\b", r"\byou'd\b", r"\bhe'd\b", r"\bshe'd\b", r"\bwe'd\b",
    r"\bthey'd\b", r"\bi'll\b", r"\byou'll\b", r"\bhe'll\b", r"\bshe'll\b", r"\bwe'll\b",
    r"\bthey'll\b", r"\blet's\b", r"\bthat's\b", r"\bthere's\b", r"\bwhat's\b", r"\bwho's\b"
]

# Pre-compiled regex patterns for performance
_BRITISH_SPELLING_PATTERNS = [re.compile(p) for p in BRITISH_TO_AMERICAN_SPELLING.keys()]
_CONTRACTION_PATTERNS = [re.compile(p) for p in CONTRACTION_PATTERNS]
_UNIT_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:mA|°C|kg|kilograms|degrees\s+Celsius|ohms|V|dB|mm|in|knots|h|min|s|seconds|meters|L|l)\b",
    re.IGNORECASE,
)
_BE_VERBS_PATTERN = re.compile(r"\b(?:am|is|are|was|were|be|been|being)\b")
_PASSIVE_PATTERN = re.compile(
    _BE_VERBS_PATTERN.pattern + r"\s+(?:[a-zA-Z]+ly\s+)?(?:[a-zA-Z]+ed|[a-zA-Z]+en)\b",
    re.IGNORECASE,
)
_BY_PATTERN = re.compile(
    _BE_VERBS_PATTERN.pattern + r"\s+(?:[a-zA-Z]+ly\s+)?[a-zA-Z]+ed\b\s+by\b\s+[a-zA-Z]+",
    re.IGNORECASE,
)
_ING_WORD_PATTERN = re.compile(r"\b([a-zA-Z]+ing)\b", re.IGNORECASE)
_PERFECT_PATTERN = re.compile(
    r"\b(?:has|have|had)\s+(?:[a-zA-Z]+ly\s+)?(?:[a-zA-Z]+ed|[a-zA-Z]+en|been)\b",
    re.IGNORECASE,
)
_PROGRESSIVE_PATTERN = re.compile(
    r"\b(?:am|is|are|was|were)\s+(?:[a-zA-Z]+ly\s+)?[a-zA-Z]+ing\b",
    re.IGNORECASE,
)
_ABBR_PATTERN = re.compile(r"\b(e\.g\.|i\.e\.|a\.m\.|p\.m\.|vs\.|no\.|approx\.)", re.IGNORECASE)
_MULTI_DOT_ABBR_PATTERN = re.compile(r"\b([A-Z])(\.[A-Z])+\.")
_SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+")


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using standard punctuation boundaries,
    preserving abbreviations like 'e.g.', 'i.e.', 'a.m.', 'p.m.', 'U.S.', 'N.A.T.O.', 'Ph.D.' etc.
    """
    if not text:
        return []
    
    # Temporarily hide dots in common abbreviations (single and multi-dot)
    temp_text = _ABBR_PATTERN.sub(lambda m: m.group(0).replace(".", "___DOT___"), text)
    temp_text = _MULTI_DOT_ABBR_PATTERN.sub(lambda m: m.group(0).replace(".", "___DOT___"), temp_text)
    
    # Split on period, exclamation, or question mark followed by whitespace
    sentences = _SENTENCE_SPLIT_PATTERN.split(temp_text)
    
    # Restore dots
    cleaned = []
    for s in sentences:
        s = s.strip()
        if s:
            cleaned.append(s.replace("___DOT___", "."))
    return cleaned


def count_words_ste100(sentence: str) -> int:
    """Calculate sentence word count using ASD-STE100 rules (Rules 8.5, 8.6, 8.7).
    
    - Hyphenated words count as ONE word (Rule 8.7).
    - Parenthesized blocks count as ONE word in the main sentence (Rule 8.5).
    - Quoted text blocks count as ONE word (Rule 8.6).
    - Numbers, units of measurement, abbreviations, and proper nouns count as ONE word.
    """
    # 1. Handle Parenthesized text (Rule 8.5): Replace contents with a single token
    # Use a single-pass approach with non-greedy matching to handle nested parentheses efficiently
    cleaned_sentence = re.sub(r"\([^)]*(?:\([^)]*\)[^)]*)*\)", "___PAREN___", sentence)

    # 2. Handle Quoted text (Rule 8.6): Replace quoted substring with a single token
    cleaned_sentence = re.sub(r'"[^"]*"', "___QUOTE___", cleaned_sentence)

    # 3. Handle abbreviations (Rule 8.6): Replace e.g., i.e., a.m., p.m., etc. with single tokens
    cleaned_sentence = _ABBR_PATTERN.sub("___ABBR___", cleaned_sentence)
    
    # 4. Handle numbers together with units of measurement (Rule 8.6): e.g., '10 mA', '10 °C', '20 kg'
    cleaned_sentence = _UNIT_PATTERN.sub("___NUM_UNIT___", cleaned_sentence)

    # 5. Tokenize by splitting on spaces, ignoring punctuation except internal hyphens (Rule 8.7)
    tokens = []
    for raw_token in cleaned_sentence.split():
        token = re.sub(r"^[^\w_@]+|[^\w_@]+$", "", raw_token)
        if token:
            tokens.append(token)

    return len(tokens)


def check_british_spelling(sentence: str) -> List[str]:
    """Flags British English spelling variants (Rule 1.14)."""
    warnings = []
    for compiled_pattern, preferred in zip(_BRITISH_SPELLING_PATTERNS, BRITISH_TO_AMERICAN_SPELLING.values()):
        for match in compiled_pattern.finditer(sentence):
            warnings.append(
                f"Use the American spelling '{preferred}' instead of '{match.group(0)}'"
            )
    return warnings


def check_contractions(sentence: str) -> List[str]:
    """Flags contractions to ensure all words are written in full (Rule 4.2)."""
    warnings = []
    for compiled_pattern in _CONTRACTION_PATTERNS:
        for match in compiled_pattern.finditer(sentence):
            warnings.append(f"Spell out '{match.group(0)}' instead of using a contraction")
    return warnings


def check_passive_voice(sentence: str) -> List[str]:
    """Flags potential passive voice structures (Rule 3.6).
    Passive checks look for forms of 'to be' (am, is, are, was, were, be, been, being)
    followed by a verb ending in 'ed' (simplistic past participle heuristic) or 'by' preposition.
    """
    warnings = []

    match = _PASSIVE_PATTERN.search(sentence)
    if match:
        warnings.append(f"Rewrite in active voice — replace '{match.group(0)}' with a stronger action verb")

    match = _BY_PATTERN.search(sentence)
    if match:
        warnings.append(f"Rewrite in active voice — avoid passive phrasing like '{match.group(0)}'")

    return warnings


def check_ing_forms(sentence: str) -> List[str]:
    """Flags non-approved '-ing' forms unless they belong to allowed lists (Rule 3.5)."""
    warnings = []
    ing_words = _ING_WORD_PATTERN.findall(sentence)
    for word in ing_words:
        low = word.lower()
        if low in APPROVED_ING_WORDS:
            continue
        if f"-{low}" in sentence.lower() or f"{low}-" in sentence.lower():
            continue
        warnings.append(
            f"Replace '{word}' with a strong past-tense verb (e.g. 'Managed' instead of 'Managing')"
        )
    return warnings


def check_perfect_progressive_tenses(sentence: str) -> List[str]:
    """Flags non-permitted tenses (Rule 3.2).
    - Perfect tenses: 'has/have/had' + past participle.
    - Progressive tenses: 'is/was/were/am' + '-ing'.
    """
    warnings = []

    match = _PERFECT_PATTERN.search(sentence)
    if match:
        warnings.append(f"Use simple past tense instead of '{match.group(0)}'")

    match = _PROGRESSIVE_PATTERN.search(sentence)
    if match:
        warnings.append(f"Use simple past tense instead of '{match.group(0)}'")

    return warnings


def validate_sentence(sentence: str, is_procedural: bool = False) -> List[str]:
    """Check a single sentence against ASD-STE100 Issue 9 rules."""
    warnings = []

    # Rule 8.1: Semicolon
    if ";" in sentence:
        warnings.append("Split this into two shorter sentences instead of using a semicolon")

    # Word count limits (Rule 5.1/6.3)
    word_count = count_words_ste100(sentence)
    limit = 20 if is_procedural else 25
    if word_count > limit:
        warnings.append(
            f"Shorten this to {limit} words or fewer (currently {word_count})"
        )

    # Check spelling, tenses, active voice, etc.
    warnings.extend(check_british_spelling(sentence))
    warnings.extend(check_contractions(sentence))
    warnings.extend(check_passive_voice(sentence))
    warnings.extend(check_ing_forms(sentence))
    warnings.extend(check_perfect_progressive_tenses(sentence))

    return warnings


def validate_text_ste100(text: str, is_procedural: bool = False) -> List[str]:
    """Main validation entry point for checking multi-sentence strings."""
    warnings = []
    sentences = split_into_sentences(text)
    for s in sentences:
        s_warnings = validate_sentence(s, is_procedural)
        for w in s_warnings:
            snippet = s[:40] + "..." if len(s) > 40 else s
            warnings.append(f"[{snippet}] {w}")
    return warnings