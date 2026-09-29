#!/usr/bin/env python3
"""Render the technical Android/iOS documentation from its editable Markdown.

Run from any directory with Python 3 and reportlab, pillow, pymupdf installed.
The PDF, evidence manifest and page previews are generated from local sources.
"""
from pathlib import Path
import hashlib
import html
import json
import re
import subprocess

from PIL import Image as PILImage, ImageDraw
import fitz
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, Image, KeepTogether,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/Technische_Dokumentation_Android_iOS.md'
OUT = ROOT / 'output/pdf/Alberring_Technische_Dokumentation_Android_iOS.pdf'
QA = ROOT / 'tmp/pdfs/technical-mobile'
EVIDENCE = ROOT / 'docs/evidence/technical-mobile-documentation_2026-09-28.json'
WIDTH, HEIGHT = A4
MARGIN = 43
BODY = WIDTH - 2 * MARGIN
INK = colors.HexColor('#18383c')
TEAL = colors.HexColor('#007f84')
MUTED = colors.HexColor('#536c70')
LIGHT = colors.HexColor('#edf6f5')
RULE = colors.HexColor('#d4e4e3')

FONT, BOLD = 'Helvetica', 'Helvetica-Bold'
for a, b in [
    ('/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'),
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
]:
    if Path(a).exists() and Path(b).exists():
        pdfmetrics.registerFont(TTFont('DocRegular', a))
        pdfmetrics.registerFont(TTFont('DocBold', b))
        FONT, BOLD = 'DocRegular', 'DocBold'
        pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=FONT, boldItalic=BOLD)
        break

styles = {
    'body': ParagraphStyle('body', fontName=FONT, fontSize=9.5, leading=14.1, textColor=INK, spaceAfter=8),
    'h1': ParagraphStyle('h1', fontName=BOLD, fontSize=22, leading=27, textColor=INK, spaceAfter=15),
    'h2': ParagraphStyle('h2', fontName=BOLD, fontSize=11.5, leading=16, textColor=TEAL, spaceBefore=9, spaceAfter=7, keepWithNext=True),
    'cell': ParagraphStyle('cell', fontName=FONT, fontSize=8.1, leading=11.4, textColor=INK),
    'headcell': ParagraphStyle('headcell', fontName=BOLD, fontSize=8.1, leading=11.4, textColor=colors.white),
    'caption': ParagraphStyle('caption', fontName=FONT, fontSize=8, leading=11.1, textColor=MUTED, spaceBefore=7),
    'source': ParagraphStyle('source', fontName=FONT, fontSize=7.7, leading=10.6, textColor=MUTED, spaceBefore=5, spaceAfter=6),
    'code': ParagraphStyle('code', fontName='Courier', fontSize=7.9, leading=11.8, textColor=INK, backColor=LIGHT, borderPadding=9, spaceBefore=5, spaceAfter=13),
}

def inline(value):
    value = value.replace('–', '-').replace('—', '-').replace('‑', '-')
    value = html.escape(value)
    value = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<a href="\2" color="#007f84">\1</a>', value)
    value = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', value)
    value = re.sub(r'`([^`]+)`', r'<font color="#365b60">\1</font>', value)
    return value

def para(value, style='body'):
    return Paragraph(inline(value), styles[style])

def diagram():
    d = Drawing(BODY, 262)
    def box(x, y, w, h, label, sub):
        d.add(Rect(x, y, w, h, rx=7, ry=7, fillColor=LIGHT, strokeColor=RULE))
        d.add(String(x+w/2, y+h/2+2, label, textAnchor='middle', fontName=BOLD, fontSize=10, fillColor=INK))
        d.add(String(x+w/2, y+11, sub, textAnchor='middle', fontName=FONT, fontSize=7.7, fillColor=MUTED))
    def arrow(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeWidth=1.2, strokeColor=TEAL))
        d.add(Polygon([x2-3, y2+5, x2+3, y2+5, x2, y2], fillColor=TEAL, strokeColor=TEAL))
    w = (BODY-20)/3
    for x, title, sub in [(0,'Web / PWA','Vercel'), (w+10,'Android','Capacitor / lokales Paket'), (2*w+20,'iOS','Capacitor / lokales Paket')]:
        box(x,210,w,45,title,sub)
        arrow(x+w/2,210,x+w/2,187)
    box(0,140,BODY,47,'Gemeinsamer React- und TypeScript-Code','Oberfläche, Routing, Formulare und Fachabläufe')
    arrow(153,140,153,118)
    arrow(414,140,414,118)
    box(0,68,307,50,'Supabase / HTTPS und WSS','Auth, Datenbank, RLS/RPC, Storage und Realtime')
    box(320,68,BODY-320,50,'Plattformadapter','Geräte, Permissions, sichere Sessions')
    arrow(153,68,153,46)
    box(0,0,307,46,'Edge Functions / Push-Vorbereitung','APNs und FCM nach Betreiberkonfiguration')
    d.add(String(414,36,'Keychain / Keystore',textAnchor='middle',fontName=FONT,fontSize=8.8,fillColor=MUTED))
    d.add(String(414,20,'Kamera, Audio, Standort',textAnchor='middle',fontName=FONT,fontSize=8.8,fillColor=MUTED))
    return d

class Document(BaseDocTemplate):
    def __init__(self):
        super().__init__(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=56, bottomMargin=46,
                         title='Alberring Connect - Technische Dokumentation Android und iOS',
                         author='Alberring Connect', subject='Architektur, native Entwicklung und technische Nachweise')
        self.addPageTemplates(PageTemplate(id='main', frames=[Frame(MARGIN,46,BODY,HEIGHT-102,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)], onPage=self.page))
        self.sections = []
    def page(self, c, doc):
        if doc.page == 1:
            c.setFillColor(TEAL)
            c.rect(0, HEIGHT-13, WIDTH, 13, stroke=0, fill=1)
            return
        c.setStrokeColor(RULE)
        c.line(MARGIN,HEIGHT-37,WIDTH-MARGIN,HEIGHT-37)
        c.setFont(BOLD,7.5)
        c.setFillColor(TEAL)
        c.drawString(MARGIN,HEIGHT-27,'ALBERRING CONNECT')
        c.setFont(FONT,7.5)
        c.setFillColor(MUTED)
        c.drawRightString(WIDTH-MARGIN,HEIGHT-27,'TECHNISCHE DOKUMENTATION / ANDROID + iOS')
        c.line(MARGIN,34,WIDTH-MARGIN,34)
        c.drawString(MARGIN,22,'28.09.2026  |  Dokumentversion 1.0')
        c.drawRightString(WIDTH-MARGIN,22,f'{doc.page:02d}')
    def afterFlowable(self, f):
        if isinstance(f,Paragraph) and f.style.name == 'h1':
            title=f.getPlainText()
            key=f'chapter-{len(self.sections)}'
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title,key,0)
            self.sections.append({'title':title,'page':self.page})

def table(lines):
    rows = [[v.strip() for v in line.strip().strip('|').split('|')] for line in lines]
    rows = [r for r in rows if not all(re.match(r'^:?-+:?$', c) for c in r)]
    n = len(rows[0])
    widths = [BODY*.31, BODY*.69] if n == 2 else [BODY*.24, BODY*.43, BODY*.33]
    data = [[para(c,'headcell' if i==0 else 'cell') for c in row] for i,row in enumerate(rows)]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),('VALIGN',(0,0),(-1,-1),'TOP'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[LIGHT,colors.white]),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LINEBELOW',(0,0),(-1,-1),.3,RULE),
    ]))
    return [t,Spacer(1,10)]

used_images=[]
def pictures(lines):
    cells=[]
    max_height=430
    column=(BODY-18)/2
    for line in lines:
        m=re.fullmatch(r'!\[(.*)\]\((.*)\)',line)
        caption,relative=m.groups()
        path=SOURCE.parent/relative
        used_images.append(path)
        with PILImage.open(path) as im: iw,ih=im.size
        ratio=min(column/iw,max_height/ih)
        picture=Image(str(path),width=iw*ratio,height=ih*ratio)
        picture.hAlign='CENTER'
        cells.append([picture,para(caption,'caption')])
    while len(cells)<2: cells.append('')
    t=Table([[cells[0],'',cells[1]]],colWidths=[column,18,column])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    return [t,Spacer(1,12)]

def render_section(text):
    lines=text.strip().splitlines()
    result=[]
    i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line: i+=1; continue
        if line.startswith('# '): result.append(para(line[2:],'h1'))
        elif line.startswith('## '): result.append(para(line[3:],'h2'))
        elif line=='<!-- architecture -->': result.extend([diagram(),Spacer(1,8)])
        elif line.startswith('```'):
            block=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'):
                block.append(html.escape(lines[i]).replace(' ','&#160;')); i+=1
            result.append(Paragraph('<br/>'.join(block),styles['code']))
        elif line.startswith('|'):
            block=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                block.append(lines[i]);i+=1
            result.extend(table(block)); continue
        elif line.startswith('!['):
            block=[]
            while i<len(lines) and lines[i].strip().startswith('!['):
                block.append(lines[i].strip());i+=1
            result.extend(pictures(block));continue
        else:
            block=[line];i+=1
            while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||!\[|```|<!--|\d+\. )',lines[i].strip()):
                block.append(lines[i].strip());i+=1
            value=' '.join(block)
            result.append(para(value,'source' if value.startswith(('Quelle:','Quellen:')) else 'body'))
            continue
        i+=1
    return result

def cover(text):
    title=ParagraphStyle('title',fontName=BOLD,fontSize=37,leading=43,textColor=INK,spaceAfter=22)
    sub=ParagraphStyle('sub',fontName=FONT,fontSize=22,leading=29,textColor=TEAL,spaceAfter=27)
    lines=[x for x in text.strip().split('\n\n') if x]
    result=[Spacer(1,48),para('ALBERRING CONNECT','h2'),Spacer(1,32),
            Paragraph('Technische<br/>Dokumentation',title),Paragraph('Android und iOS',sub),
            para('Architektur. Native Integration. Entwicklungsnachweise.'),Spacer(1,26)]
    result.append(para(lines[2]))
    result.append(Spacer(1,10))
    result.append(para(lines[3]))
    for value in lines[4:]:
        result.append(Spacer(1,12));result.append(para(value))
    result.append(Spacer(1,25))
    result.append(para('MIT 10 ORIGINALAUFNAHMEN AUS DEM PROJEKT','h2'))
    return result

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    QA.mkdir(parents=True,exist_ok=True)
    sections=SOURCE.read_text().split('<!-- page -->')
    story=cover(sections[0])
    for section in sections[1:]: story += [PageBreak()]+render_section(section)
    doc=Document();doc.build(story)
    pdf=fitz.open(OUT)
    if len(pdf)!=len(sections):
        raise RuntimeError(f'Unexpected pagination: {len(pdf)} pages for {len(sections)} planned pages')
    failures=[]
    thumbnails=[]
    for n,page in enumerate(pdf):
        pix=page.get_pixmap(matrix=fitz.Matrix(1.45,1.45),alpha=False)
        path=QA/f'page-{n+1:02}.png';pix.save(path)
        im=PILImage.open(path).convert('RGB');im.thumbnail((298,422))
        thumbnails.append(im)
        for word in page.get_text('words'):
            x0,y0,x1,y1=word[:4]
            if x0<20 or x1>WIDTH-20 or y0<16 or y1>HEIGHT-14:
                failures.append({'page':n+1,'text':word[4],'bbox':word[:4]})
        if '\ufffd' in page.get_text(): failures.append({'page':n+1,'replacement_character':True})
    for first in range(0,len(thumbnails),6):
        contact=PILImage.new('RGB',(3*318,2*452),'#dce6e6');draw=ImageDraw.Draw(contact)
        for offset,im in enumerate(thumbnails[first:first+6]):
            x=(offset%3)*318+10;y=(offset//3)*452+10
            contact.paste(im,(x,y));draw.text((x,y+427),f'Seite {first+offset+1}',fill='black')
        contact.save(QA/f'contact-{first//6+1}.jpg',quality=90)
    paths=[SOURCE,Path(__file__),ROOT/'package.json',ROOT/'package-lock.json',ROOT/'capacitor.config.ts',ROOT/'mobile-version.json',ROOT/'vite.config.ts',ROOT/'src/main.tsx',ROOT/'src/lib/supabase.ts']
    for folder,pattern in [('src/services/platform','*.ts'),('src/features/auth','*.tsx'),('ios/App/App','*.swift'),('ios/App/App','*.plist'),('android/app/src/main/java','*.java'),('.github/workflows','*.yml')]:
        paths+=list((ROOT/folder).rglob(pattern))
    paths += [ROOT/p for p in ['android/app/build.gradle','android/variables.gradle','android/app/src/main/AndroidManifest.xml','ios/App/App.xcodeproj/project.pbxproj','docs/screenshots/README.md','docs/screenshots/NACHWEIS.json','docs/evidence/android-build.txt','docs/evidence/frontend-tests.md','docs/evidence/mobile-device-flows.json','docs/evidence/backend-tests.txt','docs/evidence/ABSCHLUSSBERICHT.txt','docs/evidence/NATIVE_NOTES.md','docs/evidence/mobile-adapter-tests_2026-09-28.txt','docs/MAILVERSAND_2026-09-24.md','supabase/migrations/20260917073037_native_push_devices_and_audio.sql']]
    paths+=used_images
    manifest={'document_date':'2026-09-28','git_base_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'working_tree':'Contains pre-existing uncommitted changes; this manifest is not a full snapshot','pdf':{'path':str(OUT.relative_to(ROOT)),'sha256':sha(OUT),'pages':len(pdf)},'sections':doc.sections,'screenshot_count':len(used_images),'screenshot_evidence_date':'2026-09-17','current_test':{'command':'npm run test:mobile','date':'2026-09-28','files_passed':6,'tests_passed':59},'layout_bounds_failures':failures,'sources':{str(p.relative_to(ROOT)):sha(p) for p in sorted(set(paths)) if p.is_file()}}
    EVIDENCE.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    if failures: raise RuntimeError(f'PDF layout checks failed: {failures}')
    print(json.dumps({'pdf':str(OUT),'pages':len(pdf),'screenshots':len(used_images),'layout_bounds_failures':len(failures),'preview_dir':str(QA)},ensure_ascii=False))

if __name__=='__main__': main()
