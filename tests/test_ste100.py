import unittest
from backend.ste100 import (
    count_words_ste100,
    validate_text_ste100,
    check_british_spelling,
    check_contractions,
    check_passive_voice,
    check_ing_forms,
    check_perfect_progressive_tenses
)

class TestSTE100Validator(unittest.TestCase):
    """Test suite for ASD-STE100 Issue 9 Simplified Technical English rules."""

    def test_word_count_rules(self):
        # Rule 8.7: Hyphenated words count as one
        self.assertEqual(count_words_ste100("cutoff-switch power connection"), 3)
        self.assertEqual(count_words_ste100("Main-gear-door retraction-winch handle"), 3)

        # Rule 8.5: Parentheses count as one word
        self.assertEqual(count_words_ste100("Make sure switch is released (legend is off)."), 6)

        # Rule 8.6: Numbers and units count as one
        self.assertEqual(count_words_ste100("The unit weighs 20 kg."), 4)
        self.assertEqual(count_words_ste100("Make sure that the temperature is 10 °C."), 7)

    def test_british_spelling(self):
        self.assertTrue(len(check_british_spelling("Change the colour of the display.")) > 0)
        self.assertTrue(len(check_british_spelling("Carbon fibre reinforced plastic.")) > 0)
        self.assertEqual(check_british_spelling("Change the color of the display."), [])

    def test_contractions(self):
        self.assertTrue(len(check_contractions("If wet, don't touch the adapter.")) > 0)
        self.assertEqual(check_contractions("Do not touch the adapter."), [])

    def test_passive_voice(self):
        self.assertTrue(len(check_passive_voice("The circuits are connected by a switching relay.")) > 0)
        self.assertTrue(len(check_passive_voice("The database was corrupted.")) > 0)
        self.assertEqual(check_passive_voice("A switching relay connects the circuits."), [])

    def test_ing_forms(self):
        self.assertTrue(len(check_ing_forms("When you are doing this procedure, obey precautions.")) > 0)
        # 'during' and 'servicing' are approved words
        self.assertEqual(check_ing_forms("Clean during normal servicing."), [])

    def test_sentence_length_limits(self):
        long_sentence = "This is a very long descriptive sentence that exceeds the standard limit of twenty five words to see if our validator detects it correctly because it has more words than allowed by the standard."
        warns = validate_text_ste100(long_sentence, is_procedural=False)
        self.assertTrue(any("too long" in w for w in warns))

    def test_semicolon(self):
        warns = validate_text_ste100("Examine the removed parts; replace the damaged ones.")
        self.assertTrue(any("Semicolon" in w for w in warns))
