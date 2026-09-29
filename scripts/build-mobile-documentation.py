#!/usr/bin/env python3
"""Rebuild the editable master and A4 PDF from the repository's actual evidence.
Dependencies: reportlab, pillow (PDF QA additionally uses pymupdf/pypdf).
Run from repository root: python scripts/build-mobile-documentation.py
"""
from pathlib import Path
import re, html, json
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, CondPageBreak, Table, TableStyle, Image, KeepTogether)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
from PIL import Image as PILImage

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'
OUT = DOCS / 'Foerderungsdokumentation_Mobile_App.pdf'
SOURCE = DOCS / 'Foerderungsdokumentation_Mobile_App.md'
TEAL = colors.HexColor('#007f84')
INK = colors.HexColor('#17373b')
MUTED = colors.HexColor('#526b70')
LIGHT = colors.HexColor('#eaf5f4')
FONT = 'Helvetica'
BOLD = 'Helvetica-Bold'
for regular, bold in [(Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')), (Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))]:
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont('Body', str(regular)))
        pdfmetrics.registerFont(TTFont('BodyBold', str(bold)))
        pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='Body', boldItalic='BodyBold')
        FONT, BOLD = 'Body', 'BodyBold'
        break

def read(name):
    return (DOCS / name).read_text()
def body(name):
    return read(name).split('\n', 1)[1].strip()
def section(name, heading):
    text = read(name)
    start = text.index('## ' + heading) + len('## ' + heading)
    return text[start:].split('\n## ', 1)[0].strip()
def subordinate(text, levels=1):
    return re.sub(r'^(#{1,5}) ', lambda m: '#' * min(6, len(m.group(1)) + levels) + ' ', text, flags=re.M)

def master():
    chapters = []
    def add(title, content): chapters.append(f'# {title}\n\n{content.strip()}\n')
    add('1. Projektübersicht', 'Alberring Connect ist eine interne Mitarbeiterplattform. Gegenstand dieser Entwicklung ist die Erweiterung der bestehenden Web-App um gemeinsam gepflegte iOS- und Android-Pakete. Fachmodule, Benutzerkonten und Supabase-Backend bleiben gemeinsam. Patientendokumentation gehört nicht zum vorgesehenen Zweck.\n\nDokumentationsstand: 17.09.2026. Die folgenden Aussagen unterscheiden ausgeführten Code, tatsächlich durchgeführte Tests und noch offene Betreiber-/Storefreigaben. Es wurde weder eine App in einem Store veröffentlicht noch die bestehende produktive Web-App ersetzt.')
    add('2. Ausgangssituation', 'Die übernommene React-/Vite-PWA enthielt produktive Fachbereiche, Supabase-Sicherheitsregeln und Webtests. Native Projekte, sichere mobile Sessionpersistenz und ausführbare Standort-/Mikrofon-/Pushadapter fehlten. Umfangreiche bereits vorhandene uncommittete Änderungen wurden als Ausgangsstand erfasst und beibehalten.\n\n![Vorher: tatsächliche Web-Anmeldung](screenshots/01-vorher-web-login.png)')
    add('3. Projektziel', 'Eine gemeinsame Codebasis für Web, iOS und Android, unveränderte Hosting-Infrastruktur, nutzerinitiierte Gerätefunktionen, sichere Sessions und vorbereitete Builds/Releases. Die zusätzliche Entwicklungsleistung soll durch Quelländerungen, reproduzierbare Tests, echte Screenshots und eine editierbare technische Dokumentation nachvollziehbar sein.')
    add('4. Technische Problemstellung', 'Ein nativer Container benötigt andere Sessionpersistenz, Berechtigungszustände, Lifecycle- und Navigationsbehandlung als ein Browser. Vercel-Header gelten nicht im lokal gebündelten WebView. Standort und Audio erfordern explizite Einwilligung in der Bedienung; Uploads und Push dürfen keine Mandanten- oder Sitzungsgrenzen umgehen. Fehlende Developerkonten dürfen nicht durch erfundene Keys oder vorgetäuschte Zustellerfolge ersetzt werden.')
    add('5. IST-Analyse', subordinate(body('01_IST_ANALYSE.md')))
    add('6. Technische Anforderungen', 'Der Frontend-Build muss im nativen Paket liegen. Alle Fachkomponenten, Datenmodelle, Formulare und API-Clients bleiben gemeinsam. Native Kommunikation verwendet HTTPS; privilegierte Schlüssel verbleiben serverseitig. Berechtigungen werden im Nutzungskontext angefragt. Keine Hintergrundortung und keine heimliche Audioaufnahme. Fehlende Netzwerk-/Providerverfügbarkeit ist sichtbar zu behandeln.\n\nFür die Storevorbereitung sind Xcode-/SDK-Versionen, Android-Target, versionierte Artefakte, Signing-Konfiguration, Datenverarbeitung und reale Geräteszenarien getrennt zu prüfen. Einzelheiten folgen in den Plattform- und Releasekapiteln.')
    add('7. Architektur vor der Erweiterung', 'Browser/PWA auf Vercel → gemeinsamer Supabase-JS-Client → Auth, PostgreSQL/RLS, private Storage-Buckets, Realtime und Edge Functions. Die Frontend-App war bereits für kleine Bildschirme gestaltet. Plattforminterfaces existierten, aber keine nativen Implementierungen oder Store-Artefakte.')
    add('8. Zielarchitektur', section('06_ARCHITEKTUR.md', 'Gesamtarchitektur') + '\n\n' + section('06_ARCHITEKTUR.md', 'Vorher und nachher'))
    add('9. Umgesetzte Maßnahmen', subordinate(body('04_AENDERUNGSDOKUMENTATION.md')))
    add('10. iOS-Integration', section('06_ARCHITEKTUR.md', 'iOS und Android') + '\n\n' + section('06_ARCHITEKTUR.md', 'Capacitor und Plattformgrenzen') + '\n\niOS-Projekt, Info.plist, Swift-Bridges, SPM und Sync sind vorhanden. Ohne Xcode wurde keine erfolgreiche iOS-Kompilierung oder Simulator-/Hardwareabnahme behauptet.')
    add('11. Android-Integration', 'Android-Projekt mit API 36, AGP 8.13.0 und Gradle 8.14.3; Permissions, sichere Netzwerk-/Backupregeln, adaptive Icons, Splash, Deep Links und Keystore-Bridge. Die lokale Java-/SDK-Toolchain wurde geprüft eingerichtet. Tatsächliche Debug-APK, unsigniertes Release-AAB und Android-Lint wurden erfolgreich erstellt. Zusätzliche KeyStore-Instrumentation wurde auf dem Android-36-Emulator ausgeführt. Die Ergebnisse im Entwicklungsnachweis sind maßgeblich; eine erfolgreiche Kompilierung ist keine Play-Store-Freigabe.')
    add('12. Berechtigungskonzept', section('06_ARCHITEKTUR.md', 'Permissions und Standort') + '\n\n![Tatsächliche Berechtigungsanzeige im Browser](screenshots/08-permission-status.png)')
    add('13. Standort', 'Vorher gab es keine GPS-Funktion. Nachher verwendet Web die Browser-Geolocation und Native die Capacitor-Standort-API. Koordinaten, Genauigkeit und Zeit erscheinen zuerst als Chatentwurf. Es erfolgt keine automatische Übertragung und kein Bewegungsprofil. Die positive Browserprüfung verwendete ausdrücklich synthetische Testkoordinaten; reale GPS-Qualität und alle OS-Dialoge bleiben Geräteabnahme.\n\n![Abgelehnter Standortzugriff in der laufenden App](screenshots/10-standort-abgelehnt.png)\n\n![Standortentwurf mit gekennzeichneten Browser-Testkoordinaten](screenshots/15-location-draft.png)')
    add('14. Kamera und Fotos', section('06_ARCHITEKTUR.md', 'Storage und Uploads') + '\n\n![Tatsächlicher Foto-Upload im lokalen Testchat](screenshots/13-photo-upload.png)')
    add('15. Mikrofon', section('06_ARCHITEKTUR.md', 'Kamera, Fotos und Mikrofon') + '\n\n![Audioaufnahme mit synthetischem Chromium-Mikrofon; tatsächliche App](screenshots/14-audio-recording.png)\n\n![Fehlerzustand bei nicht verfügbarem Mikrofon](screenshots/11-mikrofon-fehlerzustand.png)')
    add('16. Push Notifications', section('06_ARCHITEKTUR.md', 'Push Notifications'))
    add('17. Authentifizierung und Secure Storage', section('06_ARCHITEKTUR.md', 'Authentifizierung und sichere Persistenz'))
    add('18. Security Audit', subordinate(body('02_SECURITY_AUDIT.md')))
    add('19. Backend und Datenhaltung', section('06_ARCHITEKTUR.md', 'Backend, Supabase und Datenbank') + '\n\n' + section('06_ARCHITEKTUR.md', 'API-Kommunikation und Fehlerbehandlung'))
    add('20. Update- und Release-Architektur', subordinate(body('03_RELEASE_PROZESS.md')))
    add('21. CI/CD und Deployment', section('06_ARCHITEKTUR.md', 'CI/CD, Deployment und Betrieb') + '\n\nDer vorbereitete Webworkflow reagiert nur auf erfolgreiche CI-Läufe desselben Repositorys auf main und checkt den zugehörigen Commit aus. Ein späterer main-Stand verhindert die Veröffentlichung eines veralteten Builds. Native signierte Artefakte benötigen ein freigeschaltetes geschütztes Release-Environment. Die bestehenden produktiven Cloud-Einstellungen wurden nicht automatisch umgestellt.')
    add('22. Tests und Qualitätssicherung', subordinate(body('09_ENTWICKLUNGSNACHWEIS.md')))
    image_lines = ['Die folgenden Abbildungen stammen aus der tatsächlich ausgeführten App. Browserbilder verwenden ausschließlich eine isolierte lokale Supabase-Testorganisation. Es wurden keine API-Antworten zur Erzeugung der Oberflächen simuliert. Synthetische Sensorwerte sind gesondert gekennzeichnet.', '']
    for filename, caption in [('03-nachher-mobile-login.png','Mobile Anmeldung des gemeinsamen Frontends'),('04-mobile-dashboard.png','Dashboard mit lokalem Prüfprofil'),('05-web-dashboard.png','Dieselbe Hauptansicht am Desktop'),('06-mobile-navigation.png','Mobile Navigation'),('09-chat-geraetefunktionen.png','Kontextuelle Gerätefunktionen im Chat'),('12-offline-zustand.png','Tatsächlicher Offlinezustand im Browser')]:
        image_lines.append(f'![{caption}](screenshots/{filename})\n')
    for f in sorted((DOCS/'screenshots').glob('*android*.png')):
        image_lines.append(f'![Tatsächlich ausgeführte Android-App im Emulator: {f.stem}](screenshots/{f.name})\n')
    image_lines.append('Fehlende oder eingeschränkte Belege und ihre spätere Erstellung sind in `docs/screenshots/README.md` beschrieben. Es gibt keinen erfundenen iOS-Simulatorbeleg.')
    add('23. Screenshots', '\n'.join(image_lines))
    add('24. Architekturdiagramme', 'Das reproduzierbare Diagramm in Kapitel 8 stellt die implementierten Grenzen dar. Quelle: `docs/diagrams/gesamtarchitektur.mmd`; derselbe Aufbau wird im PDF vektoriell gerendert. Web, iOS und Android besitzen keine getrennten Fachanwendungen. Native Plattformadapter bilden nur die Geräte-/Storage-Grenze.')
    add('25. Code- und Dateiänderungen', subordinate(body('05_DATEIAENDERUNGEN.md')))
    add('26. Datenschutz und Store-Grundlage', subordinate(body('07_DATENSCHUTZ_STORE.md')))
    add('27. Aktueller Projektstatus', 'Der gemeinsame Quellstand und die native Architektur sind implementiert. Web-/Native-Builds, lokale Backendprüfungen, Browserabläufe und Android-Build/Emulatorprüfungen sind nachvollziehbar dokumentiert. Die laufende produktive Web-App wurde nicht ersetzt oder neu veröffentlicht.\n\nFür eine uneingeschränkte Produktions-/Storefreigabe fehlen weiterhin die accountabhängige Einrichtung, echte APNs-/FCM-Zustellung, iOS-Kompilierung mit Xcode, reale Mehrgeräteabnahme und organisatorisch-rechtliche Freigaben. Die vorhandene Oberfläche bleibt bewusst hell; eine eigenständige dunkle App-Palette und ein vollständiger Offline-Schreibmodus wurden nicht eingeführt.')
    add('28. Offene Store-Schritte', subordinate(body('08_STORE_SETUP_CHECKLISTE.md')))
    add('29. Fazit', 'Die Web-Anwendung wurde um native Projekte, sichere Geräteschnittstellen und wiederholbare Prüf-/Releaseabläufe erweitert. Wesentliche Unterschiede zum Ausgangszustand sind durch Dateien, Testergebnisse und echte Screenshots belegt. Das gemeinsame Backend und die vorhandene Fachlogik bleiben erhalten. Der nachgewiesene technische Stand bildet die Grundlage für die abschließende Geräte-, Datenschutz- und Storeabnahme; er ersetzt diese Freigaben nicht.')
    return '# Alberring Connect\n\n# Technische Förderungsdokumentation\n\nGemeinsame Web-, iOS- und Android-Anwendung\n\nVersion 1.0 · Dokumentationsstand 17.09.2026\n\n' + '\n'.join(chapters)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('BodyText2', fontName=FONT, fontSize=9.2, leading=13.7, textColor=INK, spaceAfter=7, splitLongWords=True))
styles.add(ParagraphStyle('H1x', fontName=BOLD, fontSize=19, leading=24, textColor=TEAL, spaceAfter=16, keepWithNext=True))
styles.add(ParagraphStyle('H2x', fontName=BOLD, fontSize=12.1, leading=16, textColor=INK, spaceBefore=11, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle('H3x', fontName=BOLD, fontSize=10.2, leading=14, textColor=INK, spaceBefore=8, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle('Captionx', fontName=FONT, fontSize=8.1, leading=11, textColor=MUTED, alignment=TA_CENTER, spaceBefore=6, spaceAfter=15))
styles.add(ParagraphStyle('Cellx', fontName=FONT, fontSize=7.4, leading=10.6, textColor=INK, splitLongWords=True))
styles.add(ParagraphStyle('Codex', fontName=FONT, fontSize=8, leading=11.2, textColor=MUTED, backColor=LIGHT, borderPadding=7, spaceAfter=8))
styles.add(ParagraphStyle('Tocx', fontName=FONT, fontSize=9.4, leading=17, textColor=INK))
styles.add(ParagraphStyle('FileListx', fontName=FONT, fontSize=8, leading=11.5, textColor=INK, spaceAfter=2, splitLongWords=True))

def clean(s):
    for a,b in [('–','-'),('—','-'),('‑','-'),('→',' > '),('✅','Erledigt'),('✓','OK'),('☐','[ ]')]: s=s.replace(a,b)
    return s

def inline(text):
    text = html.escape(clean(text))
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2)}" color="#007f84">{m.group(1)}</a>' if m.group(2).startswith('http') else m.group(1), text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`([^`]+)`', r'<font color="#365b60">\1</font>', text)
    return text

def architecture():
    d=Drawing(480,315)
    def box(x,y,w,h,title,sub=''):
        d.add(Rect(x,y,w,h,rx=8,ry=8,fillColor=LIGHT,strokeColor=TEAL,strokeWidth=1))
        d.add(String(x+w/2,y+h/2+(4 if sub else -3),title,fontName=BOLD,fontSize=10,textAnchor='middle',fillColor=INK))
        if sub:d.add(String(x+w/2,y+11,sub,fontName=FONT,fontSize=7.6,textAnchor='middle',fillColor=MUTED))
    def arrow(x1,y1,x2,y2):
        d.add(Line(x1,y1,x2,y2,strokeColor=TEAL,strokeWidth=1.3));d.add(Polygon([x2-3,y2+5,x2+3,y2+5,x2,y2],fillColor=TEAL,strokeColor=TEAL))
    box(8,255,140,45,'Web / PWA','Vercel')
    box(170,255,140,45,'iOS / Capacitor','lokales App-Paket')
    box(332,255,140,45,'Android / Capacitor','lokales App-Paket')
    for x in [78,240,402]:arrow(x,255,x,225)
    box(8,175,464,50,'Gemeinsamer React- und TypeScript-Code','Komponenten · Formulare · Hooks · Router · Fachlogik')
    arrow(150,175,150,142);arrow(365,175,365,142)
    box(8,90,290,52,'Supabase / HTTPS / JWT','Auth · PostgreSQL + RLS · Storage · Realtime')
    box(318,90,154,52,'Geräteadapter','Permissions · Keychain / Keystore')
    arrow(150,90,150,60)
    box(8,5,290,55,'Bestehende Edge Functions','APNs / FCM nur mit Betreiber-Credentials')
    d.add(String(396,54,'Kamera · Fotos · Standort',fontName=FONT,fontSize=8.2,textAnchor='middle',fillColor=MUTED))
    d.add(String(396,40,'Mikrofon · Lifecycle',fontName=FONT,fontSize=8.2,textAnchor='middle',fillColor=MUTED))
    return d

class Doc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename,pagesize=A4,rightMargin=42,leftMargin=42,topMargin=51,bottomMargin=47,title='Alberring Connect - Technische Förderungsdokumentation',author='Alberring Connect / technische Projektdokumentation')
        self.addPageTemplates(PageTemplate(id='main',frames=[Frame(self.leftMargin,self.bottomMargin,self.width,self.height,id='body')],onPage=self.page))
        self.heading_count=0
    def beforeDocument(self):
        self.heading_count=0
    def page(self,canvas,doc):
        if doc.page==1:return
        canvas.saveState();canvas.setStrokeColor(TEAL);canvas.setLineWidth(0.8);canvas.line(42,A4[1]-30,A4[0]-42,A4[1]-30)
        canvas.setFont(FONT,7.5);canvas.setFillColor(MUTED);canvas.drawString(42,A4[1]-23,'ALBERRING CONNECT  /  TECHNISCHER PROJEKTNACHWEIS')
        canvas.drawString(42,26,'Stand 17.09.2026 · Version 1.0 · Code, Prüfung und offene Freigaben getrennt')
        canvas.drawRightString(A4[0]-42,26,str(doc.page));canvas.restoreState()
    def afterFlowable(self,flowable):
        if isinstance(flowable,Paragraph) and flowable.style.name=='H1x':
            self.heading_count+=1;key=f'h-{self.heading_count}-{self.page}';self.canv.bookmarkPage(key);text=flowable.getPlainText();self.notify('TOCEntry',(0,text,self.page,key));self.canv.addOutlineEntry(text,key,0)

def render(text):
    story=[]
    story.append(Spacer(1,75))
    story.append(Paragraph('ALBERRING CONNECT',ParagraphStyle('CoverBrand',fontName=BOLD,fontSize=14,textColor=TEAL,spaceAfter=24)))
    story.append(Paragraph('Technische<br/>Förderungsdokumentation',ParagraphStyle('CoverTitle',fontName=BOLD,fontSize=32,leading=39,textColor=INK,spaceAfter=23)))
    story.append(Paragraph('Eine gemeinsame Anwendung<br/>für Web, iOS und Android',ParagraphStyle('CoverSub',fontName=FONT,fontSize=18,leading=25,textColor=MUTED,spaceAfter=35)))
    story.append(Table([[Paragraph('ENTWICKLUNGSNACHWEIS',styles['H3x'])],[Paragraph('Architektur · Sicherheit · Gerätefunktionen<br/>Builds · Tests · reale Screenshots · Releasevorbereitung',styles['BodyText2'])]],colWidths=[480],style=TableStyle([('BACKGROUND',(0,0),(-1,-1),LIGHT),('LEFTPADDING',(0,0),(-1,-1),17),('RIGHTPADDING',(0,0),(-1,-1),17),('TOPPADDING',(0,0),(-1,0),13),('BOTTOMPADDING',(0,-1),(-1,-1),13)])))
    story.append(Spacer(1,55))
    story.append(Paragraph('Dokumentationsstand 17. September 2026<br/>Version 1.0 · App 1.0.0 / Build 1',styles['BodyText2']))
    story.append(Paragraph('Diese Dokumentation hält tatsächlich durchgeführte Arbeiten fest. Fehlende Account-, iOS-Hardware- und Storeprüfungen sind ausdrücklich ausgewiesen.',styles['BodyText2']))
    story.append(PageBreak());story.append(Paragraph('Inhaltsverzeichnis',styles['H1x']))
    toc=TableOfContents();toc.levelStyles=[styles['Tocx']];story.append(toc);story.append(PageBreak())
    text=text[text.index('# 1. Projektübersicht'):]
    lines=text.splitlines();i=0;figure=0;first=True
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line.startswith('# '):
            chapter = int(re.match(r'# (\d+)\.', line).group(1))
            if not first:
                if chapter in {23, 25}:
                    story.append(PageBreak())
                else:
                    story.append(Spacer(1, 19))
            story.append(CondPageBreak(410 if chapter == 8 else 140))
            first=False;story.append(Paragraph(inline(line[2:]),styles['H1x']));i+=1;continue
        if line.startswith('##'):
            level=len(line)-len(line.lstrip('#'));story.append(Paragraph(inline(line.lstrip('# ').strip()),styles['H2x' if level<=3 else 'H3x']));i+=1;continue
        if line.startswith('```'):
            lang=line[3:];buf=[];i+=1
            while i<len(lines) and not lines[i].strip().startswith('```'):buf.append(lines[i]);i+=1
            if lang=='mermaid':
                figure+=1;story.append(KeepTogether([architecture(),Paragraph(f'Abbildung {figure}: Gemeinsame Architektur und Plattformgrenzen.',styles['Captionx'])]))
            else:story.append(Paragraph('<br/>'.join(html.escape(clean(x)).replace(' ','&nbsp;') for x in buf),styles['Codex']))
            i+=1;continue
        image_match=re.match(r'!\[(.*?)\]\((.*?)\)',line)
        if image_match:
            caption,rel=image_match.groups();path=DOCS/rel
            if not path.exists():raise FileNotFoundError(f'Missing required evidence screenshot: {path}')
            w,h=PILImage.open(path).size;ratio=min(480/w,500/h);figure+=1
            story.append(KeepTogether([Image(str(path),width=w*ratio,height=h*ratio),Paragraph(f'Abbildung {figure}: '+inline(caption),styles['Captionx'])]));i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+',c) for c in row):rows.append(row)
                i+=1
            n=max(map(len,rows));widths=[480/n]*n
            if n==2:widths=[150,330]
            elif n==3:widths=[100,150,230]
            data=[[Paragraph(inline(c),styles['Cellx']) for c in row+['']*(n-len(row))] for row in rows]
            table=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),LIGHT),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.8,TEAL),('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#cfddde'))]));story.append(table);story.append(Spacer(1,9));continue
        if re.match(r'^[-*] ',line) or re.match(r'^\d+\. ',line):
            item=re.sub(r'^(?:[-*]|\d+\.) ', '', line)
            style=styles['FileListx' if re.fullmatch(r'`[^`]+`',item) else 'BodyText2']
            story.append(Paragraph('• '+inline(item),style));i+=1;continue
        buf=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(?:#|\||```|!\[|[-*] |\d+\. )',lines[i].strip()):buf.append(lines[i].strip());i+=1
        story.append(Paragraph(inline(' '.join(buf)),styles['BodyText2']))
    doc=Doc(str(OUT));doc.multiBuild(story)

if __name__=='__main__':
    text=master();SOURCE.write_text(text);render(text)
    print(f'Created {SOURCE.relative_to(ROOT)} and {OUT.relative_to(ROOT)}')
