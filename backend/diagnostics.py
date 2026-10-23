"""Run `python diagnostics.py` for a plain-English environment check."""
import shutil
import sys

ok = True


def line(status, name, detail=""):
    global ok
    if status == "FAIL":
        ok = False
    print(f"[{status:^4}] {name} {('- ' + detail) if detail else ''}")


line("OK" if sys.version_info >= (3, 10) else "FAIL", "Python", sys.version.split()[0] + " (3.10+ required)")
for mod in ("flask", "flask_sqlalchemy", "flask_migrate", "chromadb", "pypdf", "docx", "google.genai", "waitress"):
    try:
        __import__(mod)
        line("OK", f"import {mod}")
    except Exception as e:  # noqa: BLE001
        line("FAIL", f"import {mod}", f"{type(e).__name__}: run the setup script again")

from app.config import load_config  # noqa: E402

cfg = load_config()
line("OK" if cfg["GEMINI_API_KEY"] else "WARN", "GEMINI_API_KEY",
     "configured" if cfg["GEMINI_API_KEY"] else "not set - AI features disabled until you add it to .env")
line("OK" if shutil.which(cfg["TESSERACT_CMD"] or "tesseract") else "WARN", "Tesseract OCR",
     "found" if shutil.which(cfg["TESSERACT_CMD"] or "tesseract") else "not installed (optional, needed only for scanned PDFs)")
from app.services.extraction import PAGE_SEP  # noqa: E402,F401

print("\nEverything required is ready." if ok else "\nSome required items failed. See TROUBLESHOOTING.md.")
sys.exit(0 if ok else 1)
