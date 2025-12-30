from pathlib import Path
lines = Path('src/routes/zohoUploadRoutes.js').read_text(encoding='utf-8').splitlines()
for idx in range(760,940):
    print(f"{idx+1}: {lines[idx].encode('unicode_escape')}")
