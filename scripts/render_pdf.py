"""Convert an owner-imported PDF to private reader pages. Original PDFs are never served."""
import sys, json, pathlib
import fitz
source, destination = sys.argv[1:3]
dest = pathlib.Path(destination)
dest.mkdir(parents=True, exist_ok=True)
with fitz.open(source) as doc:
    if doc.is_encrypted or len(doc) > 1500:
        raise ValueError('Encrypted or oversized PDF is not supported')
    for number, page in enumerate(doc, 1):
        scale = min(2, 1600 / max(page.rect.width, page.rect.height))
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pix.save(dest / f'{number}.png')
    print(json.dumps({'pages':len(doc)}))
