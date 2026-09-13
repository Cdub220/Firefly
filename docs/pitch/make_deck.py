from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

BG=RGBColor(0x0e,0x11,0x16); PANEL=RGBColor(0x15,0x1a,0x21); LINE=RGBColor(0x2a,0x32,0x40)
INK=RGBColor(0xe6,0xea,0xf0); INK2=RGBColor(0xaa,0xb4,0xc3); MUTED=RGBColor(0x6f,0x7b,0x8c)
ORANGE=RGBColor(0xf0,0x5a,0x28); BLUE=RGBColor(0x6a,0xa9,0xe0)
DISPLAY="Arial Black"; BODY="Arial"; MONO="Courier New"

prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
BLANK=prs.slide_layouts[6]
M=Inches(0.6)

def slide():
    s=prs.slides.add_slide(BLANK)
    bg=s.background.fill; bg.solid(); bg.fore_color.rgb=BG
    return s
def rect(s,x,y,w,h,fill=PANEL,line=None):
    r=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,x,y,w,h); r.fill.solid(); r.fill.fore_color.rgb=fill
    if line: r.line.color.rgb=line; r.line.width=Pt(0.75)
    else: r.line.fill.background()
    r.shadow.inherit=False; return r
def text(s,x,y,w,h,runs,size=18,font=BODY,color=INK,bold=False,align=PP_ALIGN.LEFT,spacing=None,anchor=MSO_ANCHOR.TOP,line_spacing=None):
    tb=s.shapes.add_textbox(x,y,w,h); tf=tb.text_frame; tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=tf.margin_right=tf.margin_top=tf.margin_bottom=0
    if isinstance(runs,str): runs=[(runs,color)]
    p=tf.paragraphs[0]; p.alignment=align
    if line_spacing: p.line_spacing=line_spacing
    for i,(t,c) in enumerate(runs):
        if t=="\n":
            p=tf.add_paragraph(); p.alignment=align
            if line_spacing: p.line_spacing=line_spacing
            continue
        r=p.add_run(); r.text=t; f=r.font; f.size=Pt(size); f.name=font; f.color.rgb=c; f.bold=bold
        if spacing is not None:
            rPr=r._r.get_or_add_rPr(); rPr.set('spc',str(spacing))
    return tb
def eyebrow(s,num,label,y=Inches(1.7),color=ORANGE):
    text(s,M,y,Inches(8),Inches(0.3),[(num+"  ",color),(label.upper(),MUTED)],size=10,font=MONO,spacing=300)
def headline(s,runs,y=Inches(2.1),size=44,w=Inches(8.5)):
    return text(s,M,y,w,Inches(2.2),runs,size=size,font=DISPLAY,color=INK,line_spacing=1.0)
def tiles(s,items,y,accent_first=None,h=Inches(1.5)):
    n=len(items); gap=Inches(0.08); W=prs.slide_width-2*M; w=(W-gap*(n-1))/n
    for i,(big,lbl,col) in enumerate(items):
        x=M+i*(w+gap); rect(s,x,y,w,h,PANEL)
        text(s,x+Inches(0.3),y+Inches(0.25),w-Inches(0.5),Inches(0.8),big,size=36,font=DISPLAY,color=col)
        text(s,x+Inches(0.3),y+Inches(1.0),w-Inches(0.5),Inches(0.4),lbl.upper(),size=9,font=MONO,color=MUTED,spacing=200)
def columns(s,items,y,rule=True):
    n=len(items); gap=Inches(0.35); W=prs.slide_width-2*M; w=(W-gap*(n-1))/n
    for i,(lbl,big,body,col) in enumerate(items):
        x=M+i*(w+gap)
        if rule: rect(s,x,y,w,Emu(20000),col)
        text(s,x,y+Inches(0.2),w,Inches(0.3),lbl.upper(),size=9,font=MONO,color=MUTED,spacing=200)
        if big: text(s,x,y+Inches(0.5),w,Inches(0.7),big,size=30,font=DISPLAY,color=col)
        text(s,x,y+(Inches(1.2) if big else Inches(0.55)),w,Inches(1.6),body,size=13,font=BODY,color=INK2,line_spacing=1.15)
def notes(s,t): s.notes_slide.notes_text_frame.text=t
def footer(s,t): text(s,M,Inches(6.9),Inches(12),Inches(0.3),t,size=9,font=MONO,color=MUTED)

# 1 title
s=slide()
text(s,M,Inches(1.9),Inches(8),Inches(0.3),[("■  ",ORANGE),("DEFENSE TRACK  ·  DEAN & CHASE",MUTED)],size=10,font=MONO,spacing=300)
rect(s,M,Inches(2.4),Inches(0.16),Inches(1.0),ORANGE)
text(s,M+Inches(0.4),Inches(2.25),Inches(8),Inches(1.3),"FIREFLY",size=72,font=DISPLAY,color=INK)
text(s,M,Inches(3.75),Inches(6.2),Inches(2.5),[("Nobody knows where the fire is. ",INK),("We're building the system that figures it out and sends the drones.",ORANGE)],size=32,font=BODY,line_spacing=1.1)
notes(s,"When a building catches fire, nobody knows where the fire is. ‖ Not the crew outside. Not the people inside. We're building the system that figures it out — and sends the drones.")

# 2 the problem
s=slide(); eyebrow(s,"01","The problem")
headline(s,[("A fire department is dispatched ",INK),("\n",INK),("every 23 seconds.",ORANGE)])
tiles(s,[("1.39M","US fires a year",ORANGE),("$19.1B","Direct damage",ORANGE),("3,920","Deaths a year",INK),("1.9%","of US GDP — the total cost of fire",INK)],Inches(4.5))
notes(s,"In the US, a fire department gets dispatched every twenty-three seconds. One-point-four million fires a year. Nineteen billion dollars in direct damage. ‖ But this is the number nobody quotes: the total cost of fire is one-point-nine percent of GDP.")

# 3 who pays
s=slide(); eyebrow(s,"02","Who pays",y=Inches(0.6))
headline(s,[("Three bills, one missing capability.",INK)],y=Inches(1.0),size=40)
columns(s,[("US Navy","$4B","15 major warship fires, 2008–2020. Two ships lost.",ORANGE),
           ("Building owners","$3.6B/yr","8% of US fires. 20% of all the damage.",ORANGE),
           ("Data centers","$14k/min","Every minute offline. Fire is the biggest single cause of data-center insurance losses.",ORANGE),
           ("Firefighters","23 min","Extra minutes a small crew spends climbing, hauling, and finding the fire before water is on it. The gap Firefly closes. 62 died on duty in 2024.",BLUE)],Inches(3.0))
footer(s,"NFPA 2024 Fire Loss · GAO-23-105481 · NIST high-rise field experiments · EMA Research · Allianz Commercial")
notes(s,"The Navy lost four billion dollars to fifteen warship fires, and two of the ships with it. Commercial buildings: eight percent of US fires, twenty percent of the damage. A data center loses fourteen thousand dollars a minute offline, and fire is the biggest single cause of its insurance losses. ‖ And firefighters. NIST timed real crews in a thirteen-story building. A small crew needed twenty-three extra minutes before water was on the fire, and most of that is climbing, hauling, and finding it. That is the window Firefly is built to close.")

# 4 bonhomme richard
s=slide(); eyebrow(s,"03","USS Bonhomme Richard · 2020")
headline(s,[("It burned for four days. In port.",INK)],size=40)
tiles(s,[("11/14","Decks reached",ORANGE),("1,400°F","Peak heat",ORANGE),("4 days","Crew aboard",ORANGE),("$3B+","Scrapped, not repaired",ORANGE)],Inches(4.0))
text(s,M,Inches(5.75),Inches(9),Inches(0.9),[("Not a missing hose. ",INK2),("A command that could not see inside its own hull.",ORANGE)],size=20,font=BODY,line_spacing=1.15)
notes(s,"Here's what that looks like. July 2020, San Diego. The USS Bonhomme Richard caught fire pierside — crew aboard, help on the pier. It burned for four days. It reached eleven of fourteen decks and fourteen hundred degrees. Three billion dollars to repair, so the Navy scrapped her. ‖ That was not a missing hose. That was a command that could not see inside its own hull.")

# 5 the hard problem
s=slide(); eyebrow(s,"04","The hard problem",y=Inches(1.4))
headline(s,[("The fire destroys the sensors that report it.",INK)],y=Inches(1.8),size=40)
y=Inches(3.9); n=4; gap=Inches(0.08); W=prs.slide_width-2*M; w=(W-gap*3)/4
for i,(lbl,frm,to,body) in enumerate([("Blind","812°","22°","Smoke blinds the camera. Reads cold where it's hottest."),("Freeze","812°","310°","Comms drop. Last reading sticks, still looks live."),("Saturate","812°","600°","Heat pins the sensor at max. Every hot room reads the same."),("Flashover","812°","—","A room flashes over. Every sensor in it dies at once.")]):
    x=M+i*(w+gap); rect(s,x,y,w,Inches(1.6),PANEL)
    text(s,x+Inches(0.2),y+Inches(0.15),w,Inches(0.3),lbl.upper(),size=9,font=MONO,color=ORANGE,spacing=200)
    tb=text(s,x+Inches(0.2),y+Inches(0.45),w,Inches(0.4),[(frm,MUTED),("  →  ",MUTED),(to,INK)],size=18,font=MONO,bold=True)
    tb.text_frame.paragraphs[0].runs[0].font._element.set('strike','sngStrike')
    text(s,x+Inches(0.2),y+Inches(0.95),w-Inches(0.4),Inches(0.7),body,size=12,font=BODY,color=INK2,line_spacing=1.1)
text(s,M,Inches(5.8),Inches(10),Inches(0.9),[("That's not noise. Noise averages out. That's ",INK2),("corruption",ORANGE),(" — and the estimator is never told which sensors are lying.",INK2)],size=18,font=BODY,line_spacing=1.15)
notes(s,"And this is why it's hard. The fire destroys the sensors that report it. ‖ Smoke blinds a thermal camera, so it reads cold exactly where it's hottest. Comms drop, and the last reading sticks on the panel, still looking live. Heat pins a sensor at its maximum. And when a room flashes over, every sensor inside it dies in the same second. ‖ That is not noise. Noise is small, random, and averages out. This is corruption — readings wrong in coordinated ways — and nobody tells the estimator which ones are lying.")

# 6 why textbook fails
s=slide(); eyebrow(s,"05","Why the textbook tool fails",y=Inches(0.9))
headline(s,[("A Kalman filter doesn't get fuzzy. It gets ",INK),("confidently wrong.",ORANGE)],y=Inches(1.3),size=40,w=Inches(9))
y=Inches(3.8); W=prs.slide_width-2*M; w=(W-Inches(0.08))/2
rect(s,M,y,w,Inches(2.0),RGBColor(0x1c,0x16,0x14)); rect(s,M+w+Inches(0.08),y,w,Inches(2.0),PANEL)
text(s,M+Inches(0.35),y+Inches(0.2),w,Inches(0.3),"KALMAN BASELINE",size=9,font=MONO,color=MUTED,spacing=200)
text(s,M+Inches(0.35),y+Inches(0.5),w,Inches(1.1),"65%",size=66,font=DISPLAY,color=ORANGE)
text(s,M+Inches(0.35),y+Inches(1.55),w,Inches(0.4),"of ticks confidently wrong",size=13,font=BODY,color=INK2)
x2=M+w+Inches(0.43)
text(s,x2,y+Inches(0.2),w,Inches(0.3),"FIREFLY, SAME FEED",size=9,font=MONO,color=MUTED,spacing=200)
text(s,x2,y+Inches(0.5),w,Inches(1.1),"0%",size=66,font=DISPLAY,color=BLUE)
text(s,x2,y+Inches(1.55),w,Inches(0.4),'it says "maybe" and names both',size=13,font=BODY,color=INK2)
text(s,M,Inches(6.05),Inches(10),Inches(0.8),"A confident wrong answer sends drones to the wrong floor — and looks exactly like a right one.",size=18,font=BODY,color=INK2,line_spacing=1.15)
footer(s,"npm run evidence · demo-6 · 60 ticks · seeds 1–5 · k=1 · sensor freezes at t=5 · results/evidence-cp2.json")
notes(s,"So we ran the standard tool, a Kalman filter, on that feed. It doesn't get fuzzy. It gets confidently wrong — sixty-five percent of the time, at ninety-seven percent confidence. ‖ Ours, same sensors, same seed: zero. When two fires both fit the evidence, it says so, and names both. ‖ A confident wrong answer sends drones to the wrong floor. And it looks exactly like a right one.")

# 7 four pieces
s=slide(); eyebrow(s,"06","What we're building",y=Inches(1.7),color=ORANGE)
headline(s,[("Four pieces. One system.",INK)],y=Inches(2.1),size=40)
y=Inches(3.5); n=4; gap=Inches(0.08); W=prs.slide_width-2*M; w=(W-gap*3)/4
for i,(num,title,body) in enumerate([("01","A brain that knows what it doesn't know","Finds the fire from sensors the fire is killing. Reports a set of possible fires, not a false point."),("02","An allocator that treats drones as sensors","Where we fight decides what we can see next. Suppression and observability, solved as one decision."),("03","A swarm that already lives in the building","Tethers, retardant carriers, door closers, scouts. They don't extinguish — they contain, and buy the crew time."),("04","A commander's display","What the incident commander sees: fire status beside a confidence that means something. Useful before a single drone is bought.")]):
    x=M+i*(w+gap); rect(s,x,y,w,Inches(2.4),PANEL); rect(s,x,y,w,Emu(25000),BLUE)
    text(s,x+Inches(0.2),y+Inches(0.2),w,Inches(0.3),num,size=9,font=MONO,color=BLUE,spacing=200)
    text(s,x+Inches(0.2),y+Inches(0.5),w-Inches(0.4),Inches(0.9),title,size=16,font=BODY,color=INK,bold=True,line_spacing=1.1)
    text(s,x+Inches(0.2),y+Inches(1.35),w-Inches(0.4),Inches(1.0),body,size=11.5,font=BODY,color=INK2,line_spacing=1.12)
notes(s,"So — four pieces. ‖ A brain that knows what it doesn't know. An allocator that treats every drone as a sensor, because where you choose to fight decides what you can see next. A swarm that already lives in the building: tethers, retardant carriers, door closers, scouts. They don't extinguish — they contain, and they buy the crew time. ‖ And a commander's display that's worth something on day one, before anybody buys a drone.")

# 8 any structure
s=slide(); eyebrow(s,"07","Any structure",y=Inches(1.7))
headline(s,[("The building is a JSON file. Not a rewrite.",INK)],y=Inches(2.1),size=40,w=Inches(9))
x=M; y=Inches(4.15)
for i,c in enumerate(["SHIP","HIGH-RISE","WAREHOUSE","HANGAR","PARKING STRUCTURE","DATA CENTER"]):
    w=Inches(0.28+0.13*len(c)); r=rect(s,x,y,w,Inches(0.45),PANEL if i else BG,ORANGE if i==0 else LINE)
    text(s,x,y,w,Inches(0.45),c,size=11,font=MONO,color=ORANGE if i==0 else INK2,align=PP_ALIGN.CENTER,anchor=MSO_ANCHOR.MIDDLE); x+=w+Inches(0.12)
text(s,M,Inches(4.95),Inches(10),Inches(1.4),[("Spaces, levels, and heat paths with per-edge transfer rates. A hull conducts through steel; a tower stacks up the shaft. ",INK2),("Same brain, different file, nothing retrained.",ORANGE)],size=18,font=BODY,line_spacing=1.2)
notes(s,"And the building is a JSON file. Spaces, levels, heat paths. A hull conducts through steel; a tower stacks up the shaft — that's a number in the file, not a rewrite. Ship, high-rise, warehouse, data center. Same brain, nothing retrained.")

# 9 where it goes
s=slide(); eyebrow(s,"08","Where it goes",y=Inches(0.7))
headline(s,[("Start where the sensors are already installed.",INK)],y=Inches(1.1),size=40,w=Inches(9))
y=Inches(2.9); W=prs.slide_width-2*M
for i,(lbl,val) in enumerate([("Navy ships","~290 hulls"),("DoD buildings","344,950"),("US buildings over 100k sq ft","~118,000"),("Firefighting drone market by 2030","$2.2B")]):
    yy=y+i*Inches(0.72); rect(s,M,yy,W,Inches(0.66),PANEL)
    text(s,M+Inches(0.25),yy,Inches(6),Inches(0.66),lbl.upper(),size=10,font=MONO,color=BLUE,spacing=200,anchor=MSO_ANCHOR.MIDDLE)
    text(s,M+W-Inches(4.25),yy,Inches(4),Inches(0.66),val,size=22,font=DISPLAY,color=INK,align=PP_ALIGN.RIGHT,anchor=MSO_ANCHOR.MIDDLE)
text(s,M,Inches(6.0),Inches(10),Inches(0.9),[("We're not selling the drone. ",INK2),("We're the decision layer every one of those fleets needs and none of them has.",ORANGE)],size=18,font=BODY,line_spacing=1.15)
notes(s,"We start where the sensors are already installed. About two hundred ninety Navy hulls. Then three hundred forty-four thousand DoD buildings. Then a hundred eighteen thousand commercial buildings over a hundred thousand square feet. ‖ We're not selling the drone. We're the decision layer every one of those fleets needs, and none of them has.")

# 10 who buys (new)
s=slide(); eyebrow(s,"09","Who buys",y=Inches(0.6))
headline(s,[("Sold to whoever holds the bill.",INK)],y=Inches(1.0),size=40)
columns(s,[("Government & military","Navy · DoD","Damage-control and facilities budgets already exist. One program office, one procurement, ~290 hulls and 344,950 buildings. Dual-use is the Defense track by definition.",ORANGE),
           ("Building owners & operators","High-rise · data center","They pay for the fire and the downtime. A software layer on the alarm panel they already own, licensed per structure, before any drone is bought.",ORANGE),
           ("Insurers","Underwriters · reinsurers","They price the loss. A structure with honest fire-state telemetry is a better risk: premium credits make them the distribution channel, not just a customer.",ORANGE),
           ("Fire departments","Users, not buyers","The incident commander's display. Free to the department; it is what makes the owner's and insurer's purchase worth anything on the day.",BLUE)],Inches(2.6))
text(s,M,Inches(5.85),Inches(11.5),Inches(1.0),[("The model: ",INK2),("per-structure software license for the decision layer, drone-vendor agnostic.",ORANGE),(" The sensors are already installed; the drones are somebody else's hardware; we are the part neither has.",INK2)],size=16,font=BODY,line_spacing=1.2)
notes(s,"Who pays for it. Government and the military first: the budgets exist, the sensor networks exist, and dual-use is what this track is. Then building owners and data-center operators, who eat the damage and the downtime — a per-structure license on the alarm panel they already own. Then insurers, who price the loss and can push it through premium credits. ‖ Fire departments don't pay. They get the commander's display, and that display is what makes everyone else's purchase worth anything on the day.")

# 11 one sentence
s=slide()
text(s,M,Inches(2.3),Inches(8),Inches(0.3),[("■  ",ORANGE),("THE ONE-SENTENCE VERSION",MUTED)],size=10,font=MONO,spacing=300)
text(s,M,Inches(2.8),Inches(8.5),Inches(2.6),[("A wrong confident answer sends drones to the wrong floor. We're building the one that says ",INK),('"floor 22 or 30 — cover both."',ORANGE)],size=32,font=BODY,line_spacing=1.15)
text(s,M,Inches(5.6),Inches(8),Inches(0.3),[("Firefly ",INK2),("Dean · Chase     ",MUTED),("Track ",INK2),("Defense",MUTED)],size=11,font=MONO)
notes(s,"A wrong confident answer sends drones to the wrong floor. ‖ We're building the one that says: floor twenty-two or thirty — cover both. Then stop.")

# 12 sources (backup)
s=slide(); eyebrow(s,"○","Backup · only if a judge asks",y=Inches(0.5),color=MUTED)
headline(s,[("Sources.",INK)],y=Inches(0.9),size=40)
columns(s,[("Fire loss",None,"NFPA, Fire Loss in the US During 2024 (Nov 2025) — 1.39M fires, $19.1B, 3,920 deaths, 119,500 non-residential fires at $3.6B.\nNFPA / Univ. at Buffalo, Total Cost of Fire — $328.5B, 1.9% of GDP.\nNFPA, Fatal Firefighter Injuries 2024 — 62 on-duty deaths.",LINE),
           ("Defense",None,"GAO-23-105481, Navy Ship Fires — 15 major fires, ~$4B, two total losses.\nGAO-26-107716 — fire prevention still hinges on oversight gaps.\nNavy investigation reports, Oct 2021 — 11 of 14 decks, 1,400°F, $3B+.\nDoD real property — 344,950 buildings.",LINE),
           ("Commercial & market",None,"NIST high-rise fireground field experiments — crew-size deltas to 23 min.\nEMA Research 2024 — $14,056/min downtime.\nAllianz Commercial on data-center claim severity.\nEIA CBECS 2018 — 2% of 5.9M buildings over 100k sq ft.\nTBRC — firefighting drones $1.46B (2025) → $2.22B (2030).",LINE)],Inches(2.2))
footer(s,"Firefly's own figures come from npm run evidence: demo-6, 60 ticks, seeds 1–5, k=1, onset t=5. Recorded in results/evidence-cp2.json.")
notes(s,"Backup only.")

import sys; out=sys.argv[1] if len(sys.argv)>1 else "docs/pitch/Firefly-Pitch.pptx"
prs.save(out); print(out)
