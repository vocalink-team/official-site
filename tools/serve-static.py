"""Serve the publish directory with the same custom 404 body used by Pages."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
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
    args = parser.parse_args()
    ThreadingHTTPServer((args.bind, args.port), functools.partial(Handler, directory=args.directory)).serve_forever()
