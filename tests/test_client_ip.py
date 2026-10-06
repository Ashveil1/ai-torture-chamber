"""Client IP: forged X-Forwarded-For only counts until the proxy key is set."""
import sys, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
import server


class R:
    def __init__(self, **h): self.headers = {k.replace("_", "-"): v for k, v in h.items()}


class ClientIpTests(unittest.TestCase):
    def test_no_key_keeps_old_behaviour(self):
        with mock.patch.object(server, "_PROXY_KEY", ""):
            self.assertEqual(server._client_ip(R(x_forwarded_for="1.1.1.1, 9.9.9.9", x_real_ip="9.9.9.9")), "1.1.1.1")

    def test_forged_header_direct_to_origin(self):
        with mock.patch.object(server, "_PROXY_KEY", "k" * 32):
            # someone hits Railway directly with a made-up X-Forwarded-For and a made-up client ip
            r = R(x_forwarded_for="6.6.6.6, 5.5.5.5", x_real_ip="5.5.5.5", x_wh_client_ip="7.7.7.7", x_wh_relay_key="wrong")
            self.assertEqual(server._client_ip(r), "5.5.5.5")
            self.assertEqual(server._client_ip(R(x_forwarded_for="6.6.6.6", x_real_ip="5.5.5.5")), "5.5.5.5")

    def test_through_the_proxy(self):
        with mock.patch.object(server, "_PROXY_KEY", "k" * 32):
            r = R(x_forwarded_for="2.2.2.2, 76.76.21.1", x_real_ip="76.76.21.1", x_wh_client_ip="2.2.2.2", x_wh_relay_key="k" * 32)
            self.assertEqual(server._client_ip(r), "2.2.2.2")


if __name__ == "__main__":
    unittest.main()
