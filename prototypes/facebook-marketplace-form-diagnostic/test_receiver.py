import json
import tempfile
import unittest
from pathlib import Path

from receiver import create_server, persist_report, validate_report


SAFE_REPORT = {
    "url": "https://www.facebook.com/marketplace/create/item",
    "title": "Create new listing",
    "controls": [{
        "index": 0,
        "tag": "input",
        "type": "text",
        "label": "Title",
        "required": True,
    }],
}


class ReceiverTest(unittest.TestCase):
    def test_persists_safe_report_under_tmp(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            path = persist_report(SAFE_REPORT, directory)
            self.assertTrue(Path(path).is_relative_to("/tmp"))
            self.assertEqual(json.loads(Path(path).read_text()), SAFE_REPORT)

    def test_rejects_unknown_nested_control_key(self):
        unsafe = {**SAFE_REPORT, "controls": [{"index": 0, "tag": "input", "required": False, "fieldValue": "secret"}]}
        with self.assertRaises(ValueError):
            validate_report(unsafe)

    def test_rejects_create_lookalike_path(self):
        unsafe = {**SAFE_REPORT, "url": "https://www.facebook.com/marketplace/create/itemevil"}
        with self.assertRaises(ValueError):
            validate_report(unsafe)

    def test_receiver_binds_loopback(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            server = create_server(0, directory)
            try:
                self.assertEqual(server.server_address[0], "127.0.0.1")
            finally:
                server.server_close()


if __name__ == "__main__":
    unittest.main()
