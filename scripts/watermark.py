"""Burn account identity into each page on the server, not as a removable HTML overlay."""
import sys, io
from PIL import Image, ImageDraw, ImageFont
with Image.open(sys.argv[1]) as source:
    image = source.convert('RGBA')
overlay = Image.new('RGBA', image.size, (0,0,0,0))
draw = ImageDraw.Draw(overlay)
try:
    font = ImageFont.truetype('DejaVuSans.ttf', max(16, image.width // 48))
except OSError:
    font = ImageFont.load_default()
label = sys.argv[2]
for y in range(70, image.height, 260):
    draw.text((20,y), label, fill=(85,65,115,65), font=font)
draw.rectangle((0,image.height-42,image.width,image.height),fill=(255,255,255,220))
draw.text((10,image.height-34),label,fill=(30,30,30,230),font=font)
out = io.BytesIO()
Image.alpha_composite(image, overlay).convert('RGB').save(out,format='PNG')
sys.stdout.buffer.write(out.getvalue())
