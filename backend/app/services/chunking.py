"""Page-aware chunking with overlap. A chunk never crosses a page boundary."""


def _snap_end(text, start, end, size):
    if end >= len(text):
        return len(text)
    lo = start + int(size * 0.6)
    for sep in ("\n", ". ", "; ", " "):
        i = text.rfind(sep, lo, end)
        if i != -1:
            return i + len(sep)
    return end


def chunk_text(text, size, overlap):
    if size < 100:
        raise ValueError("chunk size must be at least 100")
    if not 0 <= overlap < size:
        raise ValueError("overlap must be >= 0 and smaller than chunk size")
    chunks, start, n = [], 0, len(text)
    while start < n:
        end = _snap_end(text, start, min(start + size, n), size)
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        nxt = max(end - overlap, start + 1)
        sp = text.find(" ", nxt, end)
        start = sp + 1 if sp != -1 else nxt
        if start <= 0 or start >= n:
            break
    return chunks


def chunk_pages(pages, paged, size, overlap):
    """Return [{'page': int|None, 'text': str}] in reading order."""
    out = []
    for i, page_text in enumerate(pages):
        for piece in chunk_text(page_text, size, overlap):
            out.append({"page": (i + 1) if paged else None, "text": piece})
    return out
