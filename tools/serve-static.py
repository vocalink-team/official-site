"""Serve the publish directory with the same custom 404 body used by Pages."""
import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, response_headers=(), **kwargs):
        self.response_headers = response_headers
        super().__init__(*args, **kwargs)

    def end_headers(self):
        for name, value in self.response_headers:
            self.send_header(name, value)
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        page = Path(self.directory) / "404.html"
        if code != 404 or not page.is_file():
            return super().send_error(code, message, explain)
        data = page.read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", default="_site")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--preview-header-rule", type=Path)
    args = parser.parse_args()
    response_headers = ()
    if args.preview_header_rule:
        rule = json.loads(args.preview_header_rule.read_text(encoding="utf-8"))
        response_headers = tuple(
            (name, setting["value"])
            for name, setting in rule["action_parameters"]["headers"].items()
        )
    handler = functools.partial(Handler, directory=args.directory, response_headers=response_headers)
    ThreadingHTTPServer((args.bind, args.port), handler).serve_forever()
