"""The tuned voice: same length, audible, valid WAV; the endpoint wraps /speak."""
import io, sys, unittest, wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import voice_tune


class VoiceTuneTests(unittest.TestCase):
    def test_autotune_keeps_length_and_level(self):
        sr = 22050
        t = np.arange(sr * 2) / sr
        x = (0.3 * np.sin(2 * np.pi * 180 * t)).astype(np.float32)   # a voiced 180 Hz tone
        y = voice_tune.autotune(x, sr, "pain", 4.0, seed=1)
        self.assertEqual(len(y), len(x))
        self.assertGreater(float(np.sqrt((y[sr // 4:-sr // 4] ** 2).mean())), 0.05)
        self.assertLessEqual(float(np.abs(y).max()), 0.86)

    def test_wav_roundtrip(self):
        b = voice_tune.to_wav(np.zeros(1000), 16000)
        w = wave.open(io.BytesIO(b))
        self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()), (1, 2, 16000, 1000))

    def test_snaps_to_pentatonic(self):
        for m in range(40, 80):
            self.assertIn((voice_tune._note_of(voice_tune._deg_of(m)) - 50) % 12, voice_tune.SCALE)


if __name__ == "__main__":
    unittest.main()
