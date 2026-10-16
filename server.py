from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
server = ThreadingHTTPServer(("127.0.0.1", 8000), SimpleHTTPRequestHandler)
print("Close Eyes is available at http://127.0.0.1:8000")
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
finally:
    server.server_close()
