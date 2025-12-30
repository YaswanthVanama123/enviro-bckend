from pathlib import Path
text = Path('src/routes/zohoUploadRoutes.js').read_text(encoding='utf-8')
start = text.index('router.post("/:agreementId/update"')
segment = text[start:start+2000]
print(segment.encode('unicode_escape'))
