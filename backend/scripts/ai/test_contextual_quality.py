import json
import tempfile
import unittest
from unittest.mock import patch
import worker
from pathlib import Path

from worker import (
    contextual_translation_quality,
    contextual_translation_blocking_policy,
    contextualize_segments,
    expected_script_is_present,
    numeric_content_is_equivalent,
    parse_whisper_cpp_transcription,
    tighten_transcript_segments,
    write_translation_quality_log,
)


class ContextualSubtitleQualityTests(unittest.TestCase):
    def test_transcription_only_never_translates_source(self):
        with tempfile.TemporaryDirectory() as directory:
            audio = Path(directory) / "source.wav"
            audio.write_bytes(b"test")
            output = Path(directory) / "out.json"
            segments = [{"start": 0, "end": 2, "text": "Bonjour à tous."}]
            with patch.object(worker, "transcribe_faster_whisper", return_value=("fr", segments)), patch.object(worker, "translate_segments") as translate:
                worker.execute({"engine": "faster-whisper", "model": "whisper"}, {"audioPath": str(audio), "targetLanguage": "en", "transcriptionOnly": True}, output)
            translate.assert_not_called()
            result = json.loads(output.read_text())
            self.assertEqual(result["sourceLanguage"], "fr")
            self.assertEqual(result["sourceSegments"][0]["text"], "Bonjour à tous.")

    def test_parses_whisper_cpp_full_json_word_timestamps(self):
        language, segments = parse_whisper_cpp_transcription({
            "result": {"language": "fr"},
            "transcription": [{
                "offsets": {"from": 60190, "to": 64220},
                "text": " Allez, cinquante-cinq !",
                "tokens": [
                    {
                        "offsets": {"from": 62690, "to": 63020},
                        "text": " Allez,",
                        "p": 0.92,
                    },
                    {
                        "offsets": {"from": 63040, "to": 63620},
                        "text": " cinquante-cinq !",
                        "p": 0.88,
                    },
                    {
                        "offsets": {"from": 63620, "to": 63820},
                        "text": "[_BEG_]",
                        "p": 1.0,
                    },
                ],
            }],
        })

        self.assertEqual(language, "fr")
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["words"][0]["start"], 62.69)
        self.assertEqual(segments[0]["words"][-1]["end"], 63.62)
        self.assertEqual(segments[0]["words"][0]["confidence"], 0.92)

    def test_tightens_subtitle_timing_to_the_actual_spoken_words(self):
        tightened = tighten_transcript_segments([{
            "start": 60.19,
            "end": 64.22,
            "text": "Allez, cinquante-cinq !",
            "words": [
                {"start": 62.69, "end": 63.02, "text": "Allez,"},
                {"start": 63.04, "end": 63.62, "text": "cinquante-cinq !"},
            ],
        }])

        self.assertEqual(tightened[0]["start"], 62.69)
        self.assertEqual(tightened[0]["end"], 63.62)

    def test_groups_fragmented_sentence_until_punctuation(self):
        segments = [
            {"start": 0.0, "end": 1.0, "text": "Aujourd'hui pour cette expérience"},
            {"start": 1.05, "end": 2.0, "text": "nous prendrons cette voiture."},
            {"start": 2.2, "end": 3.0, "text": "Elle fonctionne."},
        ]

        units = contextualize_segments(segments)

        self.assertEqual(len(units), 2)
        self.assertEqual(
            units[0]["text"],
            "Aujourd'hui pour cette expérience nous prendrons cette voiture.",
        )
        self.assertEqual(units[0]["sourceIndexes"], [0, 1])

    def test_reports_changed_numbers_and_semantic_drift(self):
        report = contextual_translation_quality(
            [{"start": 0.0, "end": 2.0, "text": "Il reste 11 kilomètres de ruban."}],
            ["The Commission adopted 27 environmental rules."],
            ["La Commission a adopté vingt-sept règles environnementales."],
            "en",
        )

        self.assertEqual(report["warningCount"], 1)
        self.assertIn("numbers_changed", report["warnings"][0]["flags"])
        self.assertIn("weak_back_translation", report["warnings"][0]["flags"])
        self.assertEqual(report["blockingCount"], 0)

    def test_spelled_number_is_a_warning_without_blocking_a_valid_translation(self):
        report = contextual_translation_quality(
            [{"start": 0.0, "end": 2.0, "text": "Il reste 11 kilomètres."}],
            ["There are eleven kilometres left."],
            ["Il reste onze kilomètres."],
            "en",
        )

        self.assertIn("numbers_not_literal", report["warnings"][0]["flags"])
        self.assertEqual(report["blockingCount"], 0)

    def test_numeric_only_japanese_cue_is_valid_in_every_writing_system(self):
        self.assertTrue(expected_script_is_present("55 !", "ja"))

    def test_repeated_structural_translation_failures_still_block(self):
        reports = [
            {"index": 0, "flags": ["local_repetition"], "backTranslationSimilarity": 0.1},
            {"index": 1, "flags": ["local_repetition"], "backTranslationSimilarity": 0.1},
            {"index": 2, "flags": [], "backTranslationSimilarity": 1.0},
        ]

        policy = contextual_translation_blocking_policy(reports)

        self.assertTrue(policy["blocked"])
        self.assertIn("repeated_generation_failures", policy["reasons"])
        self.assertEqual(policy["blockingIndexes"], [0, 1])

    def test_normalizes_decimal_and_thousands_separators(self):
        self.assertTrue(numeric_content_is_equivalent(
            "gagner 5000 euros et parcourir 2,5 km avec 0,0001 g",
            "win 5,000 euros and travel 2.5 km with 0.0001 g",
        ))

    def test_normalizes_twelve_and_twenty_four_hour_times(self):
        self.assertTrue(numeric_content_is_equivalent(
            "Rendez-vous jeudi à 18h15.",
            "See you Thursday at 6:15.",
        ))

    def test_accepts_rounded_kmh_to_mph_conversion(self):
        self.assertTrue(numeric_content_is_equivalent(
            "une voiture lancée à 50 km heure",
            "a car going 30 miles an hour",
        ))

    def test_normalizes_compound_meter_notation(self):
        self.assertTrue(numeric_content_is_equivalent(
            "bétonnées à 1m50 de profondeur",
            "cemented to a depth of 1.5 meters",
        ))

    def test_normalizes_english_kilometer_spelling(self):
        self.assertTrue(numeric_content_is_equivalent(
            "100 rouleaux de 25 mètres et 2,5 km de scotch",
            "100 rolls of 25 meters and 2.5 kilometers of tape",
        ))

    def test_still_rejects_an_actual_number_change(self):
        self.assertFalse(numeric_content_is_equivalent(
            "Il reste 11 kilomètres.",
            "There are 27 kilometres left.",
        ))

    def test_normalizes_japanese_number_units(self):
        self.assertTrue(numeric_content_is_equivalent(
            "5000 euros, 11 kilomètres et 25 mètres",
            "5千ユーロ、11キロ、25メートル",
        ))

    def test_normalizes_japanese_time_and_speed(self):
        self.assertTrue(numeric_content_is_equivalent(
            "jeudi à 18h15, à 50 km heure",
            "木曜日6時15分、時速50キロ",
        ))

    def test_normalizes_japanese_digit_enumeration(self):
        self.assertTrue(numeric_content_is_equivalent(
            "1, 2, 3, 4, 5, 6, 7",
            "1,2,3,4,5,6,7",
        ))

    def test_normalizes_japanese_kanji_and_arabic_duplicates(self):
        self.assertTrue(numeric_content_is_equivalent("100. 100.", "百人100人"))

    def test_normalizes_explicit_japanese_multiplier(self):
        self.assertTrue(numeric_content_is_equivalent(
            "on a doublé par rapport à 50",
            "50から2倍になる",
        ))

    def test_does_not_treat_kanji_inside_a_word_as_a_number(self):
        self.assertTrue(numeric_content_is_equivalent(
            "une voiture à 50 km heure",
            "時速50キロでは不十分です",
        ))

    def test_failure_log_contains_only_blocking_segments(self):
        translated = [
            {
                "start": 38.14,
                "end": 40.0,
                "text": "The Commission adopted 27 rules.",
                "sourceText": "Il reste 11 kilomètres.",
                "backTranslation": "La Commission a adopté 27 règles.",
                "quality": {"flags": ["numbers_changed"]},
            },
            {
                "start": 41.0,
                "end": 42.0,
                "text": "Everything is fine.",
                "sourceText": "Tout va bien.",
                "backTranslation": "Tout va bien.",
                "quality": {"flags": []},
            },
        ]
        quality = {
            "blockingCount": 1,
            "warningCount": 1,
            "blockingIndexes": [0],
            "segments": [
                {"index": 0, "flags": ["numbers_changed"], "backTranslationSimilarity": 0.1},
                {"index": 1, "flags": [], "backTranslationSimilarity": 1.0},
            ],
        }

        with tempfile.TemporaryDirectory() as directory:
            log_path = write_translation_quality_log(
                Path(directory) / "output.json", "fr", "en", translated, quality
            )
            content = json.loads(Path(log_path).read_text(encoding="utf-8"))

        self.assertEqual(content["blockingCount"], 1)
        self.assertEqual(len(content["segments"]), 1)
        self.assertEqual(content["segments"][0]["start"], 38.14)


if __name__ == "__main__":
    unittest.main()
