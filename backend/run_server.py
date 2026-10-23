"""Production-style entry point (works on Windows, macOS and Linux)."""
import os

from waitress import serve

from app import create_app

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    app = create_app()
    print(f"\n  LexAI is running at http://{host}:{port}\n  Press Ctrl+C to stop.\n")
    serve(app, host=host, port=port, threads=8)
