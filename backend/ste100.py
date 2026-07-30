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
from typing import List, Dict, Any

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
    r"\bshan't\b", r"\bmustn't\b", r"\bi'm\b", r"\byou're\b", r"\bhe's\b", r"\bshe's\b",
    r"\bit's\b", r"\bwe're\b", r"\bthey're\b", r"\bi've\b", r"\byou've\b", r"\bwe've\b",
    r"\bthey've\b", r"\bi'd\b", r"\byou'd\b", r"\bhe'd\b", r"\bshe'd\b", r"\bwe'd\b",
    r"\bthey'd\b", r"\bi'll\b", r"\byou'll\b", r"\bhe'll\b", r"\bshe'll\b", r"\bwe'll\b",
    r"\bthey'll\b", r"\blet's\b", r"\bthat's\b", r"\bthere's\b", r"\bwhat's\b", r"\bwho's\b"
]


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using standard punctuation boundaries,
    preserving abbreviations like 'e.g.', 'i.e.', 'a.m.', 'p.m.' etc.
    """
    if not text:
        return []
    # Temporarily hide dots in common abbreviations
    abbr_pattern = r"\b(e\.g\.|i\.e\.|a\.m\.|p\.m\.|vs\.|no\.|approx\.)"
    temp_text = re.sub(abbr_pattern, lambda m: m.group(0).replace(".", "___DOT___"), text, flags=re.IGNORECASE)
    
    # Split on period, exclamation, or question mark followed by whitespace
    sentences = re.split(r"(?<=[.!?])\s+", temp_text)
    
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
    # We do this iteratively to support nested parentheses if any.
    cleaned_sentence = sentence
    while True:
        next_sentence, count = re.subn(r"\([^)]*\)", "___PAREN___", cleaned_sentence)
        if count == 0:
            break
        cleaned_sentence = next_sentence

    # 2. Handle Quoted text (Rule 8.6): Replace quoted substring with a single token
    cleaned_sentence = re.sub(r'"[^"]*"', "___QUOTE___", cleaned_sentence)

    # 3. Handle numbers together with units of measurement (Rule 8.6): e.g., '10 mA', '10 °C', '20 kg'
    # We replace 'number + unit' with a single token
    unit_pattern = r"\b\d+(?:\.\d+)?\s*(?:mA|°C|kg|kilograms|degrees\s+Celsius|ohms|V|dB|mm|in| knots| knots|h|min|s|seconds|meters|L|l)\b"
    cleaned_sentence = re.sub(unit_pattern, "___NUM_UNIT___", cleaned_sentence, flags=re.IGNORECASE)

    # 4. Tokenize by splitting on spaces, ignoring punctuation except internal hyphens (Rule 8.7)
    # Remove outer punctuation but keep hyphens inside words
    tokens = []
    # Split by whitespace
    for raw_token in cleaned_sentence.split():
        # Strip trailing/leading non-alphanumeric chars, except internal hyphens or tokens we created
        token = re.sub(r"^[^\w_@]+|[^\w_@]+$", "", raw_token)
        if token:
            tokens.append(token)

    return len(tokens)


def check_british_spelling(sentence: str) -> List[str]:
    """Flags British English spelling variants (Rule 1.14)."""
    warnings = []
    for pattern, preferred in BRITISH_TO_AMERICAN_SPELLING.items():
        matches = re.findall(pattern, sentence, flags=re.IGNORECASE)
        if matches:
            warnings.append(f"British spelling variant '{matches[0]}' detected (use American '{preferred}')")
    return warnings


def check_contractions(sentence: str) -> List[str]:
    """Flags contractions to ensure all words are written in full (Rule 4.2)."""
    warnings = []
    for pattern in CONTRACTION_PATTERNS:
        matches = re.findall(pattern, sentence, flags=re.IGNORECASE)
        if matches:
            warnings.append(f"Contraction '{matches[0]}' is not permitted; write it in full")
    return warnings


def check_passive_voice(sentence: str) -> List[str]:
    """Flags potential passive voice structures (Rule 3.6).
    Passive checks look for forms of 'to be' (am, is, are, was, were, be, been, being)
    followed by a verb ending in 'ed' (simplistic past participle heuristic) or 'by' preposition.
    """
    warnings = []
    # Pattern: to-be verb + optional adverb/whitespace + past participle ending in 'ed' or 'en'
    be_verbs = r"\b(?:am|is|are|was|were|be|been|being)\b"
    passive_pattern = be_verbs + r"\s+(?:[a-zA-Z]+ly\s+)?(?:[a-zA-Z]+ed|[a-zA-Z]+en)\b"
    
    matches = re.findall(passive_pattern, sentence, flags=re.IGNORECASE)
    if matches:
        warnings.append(f"Passive voice pattern detected: '{matches[0]}' (prefer active voice)")
        
    # Check for direct 'by <agent>' indicators in combination with a verb
    by_pattern = be_verbs + r"\s+.+?\s+\bby\b"
    by_matches = re.findall(by_pattern, sentence, flags=re.IGNORECASE)
    if by_matches:
        warnings.append(f"Passive helper with agent 'by' detected: '{by_matches[0]}' (rewrite in active voice)")

    return warnings


def check_ing_forms(sentence: str) -> List[str]:
    """Flags non-approved '-ing' forms unless they belong to allowed lists (Rule 3.5)."""
    warnings = []
    # Find all words ending in 'ing'
    ing_words = re.findall(r"\b([a-zA-Z]+ing)\b", sentence, flags=re.IGNORECASE)
    for word in ing_words:
        low = word.lower()
        # Skip if it is in approved words
        if low in APPROVED_ING_WORDS:
            continue
        # Skip common compound technical nouns with hyphen e.g. air-conditioning
        if f"-{low}" in sentence.lower() or f"{low}-" in sentence.lower():
            continue
        warnings.append(f"'-ing' form '{word}' is not recommended (Rule 3.5) unless it functions as an approved technical noun")
    return warnings


def check_perfect_progressive_tenses(sentence: str) -> List[str]:
    """Flags non-permitted tenses (Rule 3.2).
    - Perfect tenses: 'has/have/had' + past participle.
    - Progressive tenses: 'is/was/were/am' + '-ing'.
    """
    warnings = []
    # Perfect tenses
    perfect_pattern = r"\b(?:has|have|had)\s+(?:[a-zA-Z]+ly\s+)?(?:[a-zA-Z]+ed|[a-zA-Z]+en|been)\b"
    perfect_matches = re.findall(perfect_pattern, sentence, flags=re.IGNORECASE)
    if perfect_matches:
        warnings.append(f"Perfect tense helper '{perfect_matches[0]}' detected (use simple past or present instead)")
        
    # Progressive tenses
    progressive_pattern = r"\b(?:am|is|are|was|were)\s+(?:[a-zA-Z]+ly\s+)?[a-zA-Z]+ing\b"
    progressive_matches = re.findall(progressive_pattern, sentence, flags=re.IGNORECASE)
    if progressive_matches:
        warnings.append(f"Progressive tense helper '{progressive_matches[0]}' detected (use simple present or past instead)")
        
    return warnings


def validate_sentence(sentence: str, is_procedural: bool = False) -> List[str]:
    """Check a single sentence against ASD-STE100 Issue 9 rules."""
    warnings = []

    # Rule 8.1: Semicolon
    if ";" in sentence:
        warnings.append("Semicolon ';' is not permitted; write two separate sentences instead")

    # Word count limits (Rule 5.1/6.3)
    word_count = count_words_ste100(sentence)
    limit = 20 if is_procedural else 25
    if word_count > limit:
        warnings.append(
            f"Sentence is too long ({word_count} words). "
            f"Maximum permitted is {limit} words for {'procedural' if is_procedural else 'descriptive'} text"
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
            # Format the warning with a snippet of the sentence
            snippet = s[:40] + "..." if len(s) > 40 else s
            warnings.append(f"[{snippet}] {w}")
    return warnings
