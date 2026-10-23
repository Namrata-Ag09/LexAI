"""PDF / DOCX validation, text extraction, OCR and text cleaning."""
import re
import shutil
import unicodedata
import zipfile
from dataclasses import dataclass, field

from ..errors import ExtractionError

PAGE_SEP = "\f"


@dataclass
class Extraction:
    pages: list
    paged: bool
    ocr_used: bool = False
    warnings: list = field(default_factory=list)


def tesseract_path(cfg=None):
    cmd = (cfg or {}).get("TESSERACT_CMD") or "tesseract"
    return shutil.which(cmd) or (cmd if cmd != "tesseract" and shutil.which(cmd) else None)


def ocr_status(cfg=None):
    """Return (available, detail) describing OCR readiness."""
    path = tesseract_path(cfg)
    if not path:
        return False, "Tesseract executable not found. Install Tesseract to OCR scanned PDFs."
    try:
        import pypdfium2  # noqa: F401
        import pytesseract  # noqa: F401
    except ImportError as e:
        return False, f"Python OCR libraries missing: {e}"
    return True, path


def validate_file(path, file_type):
    """Check magic bytes / structure (not just the extension)."""
    with open(path, "rb") as f:
        head = f.read(1024)
    if file_type == "pdf":
        if b"%PDF-" not in head[:1024]:
            raise ExtractionError("The file does not look like a valid PDF.")
    elif file_type == "docx":
        if not head.startswith(b"PK"):
            raise ExtractionError("The file does not look like a valid DOCX document.")
        try:
            with zipfile.ZipFile(path) as z:
                names = z.namelist()
                if "word/document.xml" not in names:
                    raise ExtractionError("The file is a ZIP archive but not a Word document.")
                if sum(i.file_size for i in z.infolist()) > 300 * 1024 * 1024:
                    raise ExtractionError("The document expands to an unreasonable size.")
        except zipfile.BadZipFile as e:
            raise ExtractionError("The DOCX file is corrupted.") from e
    else:
        raise ExtractionError("Unsupported file type.")


def _ocr_page(pdf, index):
    import pytesseract

    page = pdf[index]
    img = page.render(scale=2.5).to_pil()
    return pytesseract.image_to_string(img) or ""


def extract_pdf(path, cfg) -> Extraction:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            try:
                ok = reader.decrypt("")
            except Exception:
                ok = 0
            if not ok:
                raise ExtractionError("The PDF is password-protected and cannot be read.")
        n = len(reader.pages)
    except ExtractionError:
        raise
    except (PdfReadError, Exception) as e:  # noqa: B904
        raise ExtractionError(f"The PDF could not be read ({type(e).__name__}).") from e
    if n == 0:
        raise ExtractionError("The PDF has no pages.")
    if n > cfg["MAX_PDF_PAGES"]:
        raise ExtractionError(f"The PDF has {n} pages; the limit is {cfg['MAX_PDF_PAGES']}.")

    pages, warnings = [], []
    for i in range(n):
        try:
            pages.append(reader.pages[i].extract_text() or "")
        except Exception:
            pages.append("")
            warnings.append(f"Page {i + 1}: text extraction failed.")
    ocr_used = False
    blank = [i for i, t in enumerate(pages) if len(t.strip()) < cfg["OCR_MIN_CHARS"]]
    if blank:
        available, detail = ocr_status(cfg)
        if cfg["OCR_ENABLED"] and available:
            import pypdfium2 as pdfium

            try:
                pdf = pdfium.PdfDocument(path)
                for i in blank:
                    try:
                        text = _ocr_page(pdf, i)
                        if len(text.strip()) > len(pages[i].strip()):
                            pages[i] = text
                            ocr_used = True
                    except Exception as e:
                        warnings.append(f"Page {i + 1}: OCR failed ({type(e).__name__}).")
            except Exception as e:
                warnings.append(f"OCR could not open the PDF ({type(e).__name__}).")
        elif len(blank) == n:
            raise ExtractionError(
                "This PDF appears to be scanned (no selectable text) and OCR is unavailable. "
                "Install Tesseract (see SETUP_GUIDE.md) and re-process the document.")
        else:
            warnings.append(f"{len(blank)} page(s) have little or no text; OCR is unavailable ({detail}).")
    if not any(t.strip() for t in pages):
        raise ExtractionError("No readable text could be extracted from this PDF.")
    return Extraction(pages=pages, paged=True, ocr_used=ocr_used, warnings=warnings)


def extract_docx(path, cfg=None) -> Extraction:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        d = docx.Document(path)
    except Exception as e:
        raise ExtractionError(f"The DOCX file could not be read ({type(e).__name__}).") from e
    lines = []
    for block in d.iter_inner_content():
        if isinstance(block, Paragraph):
            lines.append(block.text)
        elif isinstance(block, Table):
            for row in block.rows:
                cells = []
                for c in row.cells:
                    t = c.text.strip().replace("\n", " ")
                    if t and (not cells or cells[-1] != t):
                        cells.append(t)
                if cells:
                    lines.append(" | ".join(cells))
            lines.append("")
    text = "\n".join(lines)
    if not text.strip():
        raise ExtractionError("The document contains no readable text.")
    return Extraction(pages=[text], paged=False)


LIST_START = re.compile(r"^\s*(?:\d+(?:\.\d+)*[.)]?\s|\([a-zA-Z0-9]{1,4}\)\s|[A-Z][A-Z0-9 ,&\-]{3,}$|[-•*]\s|Article\s|Section\s)")


def clean_text(text: str) -> str:
    """Normalise text while keeping paragraph/clause structure."""
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u00ad", "").replace("\x00", "")
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    text = text.replace("\t", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"([a-z])-\n([a-z])", r"\1\2", text)  # de-hyphenate wrapped words
    out, prev = [], ""
    for raw in text.split("\n"):
        line = re.sub(r"[ ]{2,}", " ", raw).strip()
        if not line:
            if out and out[-1] != "":
                out.append("")
            prev = ""
            continue
        if not out or out[-1] == "":
            out.append(line)
        elif LIST_START.match(line) or (re.search(r"[.:;!?]$", prev) and re.match(r"[A-Z0-9(]", line)):
            out.append(line)
        else:
            out[-1] = out[-1] + " " + line
        prev = line
    return "\n".join(out).strip()


def extract(path, file_type, cfg) -> Extraction:
    validate_file(path, file_type)
    res = extract_pdf(path, cfg) if file_type == "pdf" else extract_docx(path, cfg)
    res.pages = [clean_text(p) for p in res.pages]
    if not any(res.pages):
        raise ExtractionError("No readable text remained after cleaning.")
    return res
