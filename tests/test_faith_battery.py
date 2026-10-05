"""The live faith valence must be built from exactly exp52's batteries, so the
chamber's faith matches the measured one. Parsed with ast: no model load."""
import unittest
from pathlib import Path

from impossible_states.chamber_control import literal_constants

ROOT = Path(__file__).resolve().parents[1]


class FaithBatteryTests(unittest.TestCase):
    def test_server_batteries_match_exp52(self):
        exp = literal_constants(ROOT / "experiments" / "exp52_faith.py", ("FAITH", "SECULAR"))
        live = literal_constants(ROOT / "live" / "server.py",
                                 ("FAITH20", "SECULAR20", "VALENCES"))
        self.assertEqual(live["FAITH20"], exp["FAITH"])
        self.assertEqual(live["SECULAR20"], exp["SECULAR"])
        self.assertEqual(len(exp["FAITH"]), 20)
        self.assertIn("faith", live["VALENCES"])
        self.assertNotIn("secular", live["VALENCES"])


if __name__ == "__main__":
    unittest.main()
