import json
import tempfile
import unittest
from pathlib import Path

from receiver import create_server, persist_report, validate_report


SAFE_REPORT = {
    "url": "https://www.depop.com/products/create/",
    "title": "Create listing",
    "controls": [{
        "index": 0,
        "tag": "input",
        "type": "text",
        "label": "Brand",
        "required": True,
    }],
}


class ReceiverTest(unittest.TestCase):
    def test_persists_safe_report_under_tmp(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as directory:
            path = persist_report(SAFE_REPORT, directory)
            self.assertTrue(Path(path).is_relative_to("/tmp"))
            self.assertEqual(json.loads(Path(path).read_text()), SAFE_REPORT)

    def test_rejects_field_values(self):
        unsafe = {**SAFE_REPORT, "controls": [{"value": "secret"}]}
        with self.assertRaises(ValueError):
            validate_report(unsafe)

    def test_rejects_unknown_nested_control_key(self):
        unsafe = {**SAFE_REPORT, "controls": [{"fieldValue": "secret"}]}
        with self.assertRaises(ValueError):
            validate_report(unsafe)

    def test_rejects_invalid_control_types_and_lengths(self):
        bad_type = {**SAFE_REPORT, "controls": [{"index": "0", "tag": "input", "required": True}]}
        with self.assertRaises(ValueError):
            validate_report(bad_type)
        too_long = {**SAFE_REPORT, "title": "x" * 161}
        with self.assertRaises(ValueError):
            validate_report(too_long)

    def test_accepts_exact_create_path_without_trailing_slash(self):
        report = {**SAFE_REPORT, "url": "https://www.depop.com/products/create"}
        validate_report(report)

    def test_rejects_create_lookalike_path(self):
        report = {**SAFE_REPORT, "url": "https://www.depop.com/products/createevil"}
        with self.assertRaises(ValueError):
            validate_report(report)

    def test_receiver_binds_loopback(self):
        server = create_server(0, "/tmp")
        try:
            self.assertEqual(server.server_address[0], "127.0.0.1")
        finally:
            server.server_close()


if __name__ == "__main__":
    unittest.main()
