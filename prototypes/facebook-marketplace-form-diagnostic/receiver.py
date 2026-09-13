#!/usr/bin/env python3
"""Small localhost receiver for the throwaway Facebook Marketplace diagnostic."""

import argparse
import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

REPORT_DIR = Path(os.environ.get("FACEBOOK_MARKETPLACE_REPORT_DIR", "/tmp/facebook-marketplace-form-reports"))
MAX_BODY_BYTES = 64 * 1024
REPORT_KEYS = {"url", "title", "controls"}
CONTROL_KEYS = {"index", "tag", "type", "role", "name", "label", "required", "accept", "optionLabels"}
TEXT_CONTROL_KEYS = {"type", "role", "name", "label", "accept"}
MAX_TEXT_LENGTH = 160


def is_create_path(path):
    return path == "/marketplace/create/item" or path.startswith("/marketplace/create/item/")


def validate_report(report):
    if not isinstance(report, dict) or set(report) - REPORT_KEYS:
        raise ValueError("report has an unexpected schema")

    url = report.get("url")
    parsed = urlparse(url) if isinstance(url, str) else None
    if (not parsed or len(url) > 512 or parsed.scheme != "https" or
            parsed.netloc != "www.facebook.com" or not is_create_path(parsed.path) or
            parsed.query or parsed.fragment):
        raise ValueError("report URL is not a clean Facebook Marketplace create-item path")
    if "title" in report and (not isinstance(report["title"], str) or len(report["title"]) > MAX_TEXT_LENGTH):
        raise ValueError("title must be text of at most 160 characters")

    controls = report.get("controls")
    if not isinstance(controls, list) or len(controls) > 200:
        raise ValueError("controls must be a list of at most 200 items")
    for control in controls:
        if not isinstance(control, dict) or set(control) - CONTROL_KEYS or {"index", "tag", "required"} - set(control):
            raise ValueError("control has an unexpected schema")
        if (type(control["index"]) is not int or not 0 <= control["index"] < 200 or
                not isinstance(control["tag"], str) or not 1 <= len(control["tag"]) <= 32 or
                type(control["required"]) is not bool):
            raise ValueError("control has an invalid type or length")
        for key in TEXT_CONTROL_KEYS:
            if key in control and (not isinstance(control[key], str) or len(control[key]) > MAX_TEXT_LENGTH):
                raise ValueError("control text is invalid or too long")
        if "optionLabels" in control:
            labels = control["optionLabels"]
            if (not isinstance(labels, list) or len(labels) > 100 or
                    any(not isinstance(label, str) or len(label) > MAX_TEXT_LENGTH for label in labels)):
                raise ValueError("optionLabels must be at most 100 short strings")


def persist_report(report, report_dir=REPORT_DIR):
    validate_report(report)
    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)
    name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid4().hex + ".json"
    path = report_dir / name
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


class ReportHandler(BaseHTTPRequestHandler):
    def _respond(self, status, body):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path != "/report":
            self._respond(404, {"error": "not found"})
            return
        try:
            size = int(self.headers.get("Content-Length", "-1"))
            if size < 0 or size > MAX_BODY_BYTES:
                raise ValueError("request body is too large")
            report = json.loads(self.rfile.read(size))
            path = persist_report(report, self.server.report_dir)
        except (ValueError, json.JSONDecodeError) as error:
            self._respond(400, {"error": str(error)})
            return
        self._respond(201, {"saved": path.name})


def create_server(port, report_dir):
    server = ThreadingHTTPServer(("127.0.0.1", port), ReportHandler)
    server.report_dir = Path(report_dir)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--dir", default=str(REPORT_DIR), dest="report_dir")
    args = parser.parse_args()
    server = create_server(args.port, args.report_dir)
    print(f"Listening on http://127.0.0.1:{args.port}/report; saving under {args.report_dir}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
