import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np


DIARIZATION_PATH = Path(__file__).with_name("diarization.py")
SPEC = importlib.util.spec_from_file_location("sami_ai_dubbing_diarization", DIARIZATION_PATH)
DIARIZATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DIARIZATION)


class HybridDiarizationContractTest(unittest.TestCase):
    def test_sortformer_distinct_local_voices_cannot_merge_into_one_global_voice(self):
        base_turns = [
            {"start": 0.0, "end": 2.0, "speaker": "SPEAKER_00"},
            {"start": 2.0, "end": 8.0, "speaker": "SPEAKER_01"},
            {"start": 8.0, "end": 10.0, "speaker": "SPEAKER_02"},
        ]
        refinement = {"turns": [
            {"start": 0.0, "end": 2.0, "speaker": "local_0", "window": 0},
            {"start": 2.0, "end": 5.0, "speaker": "local_1", "window": 0},
            {"start": 5.0, "end": 10.0, "speaker": "local_2", "window": 0},
        ]}
        embeddings = {
            "local_0": np.array([1.0, 0.0, 0.0], dtype=np.float32),
            "local_1": np.array([0.0, 1.0, 0.0], dtype=np.float32),
            "local_2": np.array([0.0, 0.0, 1.0], dtype=np.float32),
        }

        def fake_embedding(_pipeline, _audio, turns, max_segments=4):
            del max_segments
            return embeddings[turns[0]["speaker"]]

        with patch.object(DIARIZATION, "extract_group_embedding", side_effect=fake_embedding):
            turns, report = DIARIZATION.refine_with_sortformer(
                object(),
                object(),
                base_turns,
                ["SPEAKER_00", "SPEAKER_01", "SPEAKER_02"],
                np.eye(3, dtype=np.float32),
                refinement,
            )

        self.assertTrue(report["applied"])
        self.assertEqual(report["acceptedWindows"], 1)
        self.assertEqual(
            report["windows"][0]["mapping"],
            {
                "local_0": "SPEAKER_00",
                "local_1": "SPEAKER_01",
                "local_2": "SPEAKER_02",
            },
        )
        self.assertEqual(
            [(turn["start"], turn["end"], turn["speaker"]) for turn in turns],
            [
                (0.0, 2.0, "SPEAKER_00"),
                (2.0, 5.0, "SPEAKER_01"),
                (5.0, 10.0, "SPEAKER_02"),
            ],
        )

    def test_window_is_rejected_when_sortformer_invents_too_many_local_voices(self):
        base_turns = [
            {"start": 0.0, "end": 5.0, "speaker": "SPEAKER_00"},
            {"start": 5.0, "end": 10.0, "speaker": "SPEAKER_01"},
        ]
        refinement = {"turns": [
            {"start": index, "end": index + 1.0, "speaker": f"local_{index}", "window": 0}
            for index in range(3)
        ]}
        turns, report = DIARIZATION.refine_with_sortformer(
            object(),
            object(),
            base_turns,
            ["SPEAKER_00", "SPEAKER_01"],
            np.eye(2, dtype=np.float32),
            refinement,
        )
        self.assertFalse(report["applied"])
        self.assertEqual(report["windows"][0]["reason"], "speaker-count")
        self.assertEqual(turns, base_turns)

    def test_window_falls_back_to_pyannote_when_more_than_four_global_voices_are_present(self):
        base_turns = [
            {"start": float(index), "end": float(index + 1), "speaker": f"SPEAKER_{index:02d}"}
            for index in range(5)
        ]
        refinement = {"turns": [
            {"start": 0.0, "end": 2.5, "speaker": "local_0", "window": 0},
            {"start": 2.5, "end": 5.0, "speaker": "local_1", "window": 0},
        ]}
        turns, report = DIARIZATION.refine_with_sortformer(
            object(),
            object(),
            base_turns,
            [f"SPEAKER_{index:02d}" for index in range(5)],
            np.eye(5, dtype=np.float32),
            refinement,
        )
        self.assertFalse(report["applied"])
        self.assertEqual(report["windows"][0]["reason"], "sortformer-capacity")
        self.assertEqual(turns, base_turns)


if __name__ == "__main__":
    unittest.main()
