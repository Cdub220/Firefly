"""Firefly pitch deck, four slides. python-pptx. Script lives in each slide's speaker notes.
Usage: python3 docs/pitch/make_deck.py [out.pptx]"""
import sys
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
BLANK=prs.slide_layouts[6]; M=Inches(0.7); W=prs.slide_width-2*M

def slide():
    s=prs.slides.add_slide(BLANK); f=s.background.fill; f.solid(); f.fore_color.rgb=BG; return s
def rect(s,x,y,w,h,fill=PANEL,line=None):
    r=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,x,y,w,h); r.fill.solid(); r.fill.fore_color.rgb=fill
    if line: r.line.color.rgb=line; r.line.width=Pt(0.75)
    else: r.line.fill.background()
    r.shadow.inherit=False; return r
def text(s,x,y,w,h,runs,size=18,font=BODY,color=INK,bold=False,align=PP_ALIGN.LEFT,spacing=None,anchor=MSO_ANCHOR.TOP,ls=None,space_after=None):
    tb=s.shapes.add_textbox(x,y,w,h); tf=tb.text_frame; tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=tf.margin_right=tf.margin_top=tf.margin_bottom=0
    if isinstance(runs,str): runs=[(runs,color)]
    p=tf.paragraphs[0]; p.alignment=align
    if ls: p.line_spacing=ls
    if space_after is not None: p.space_after=Pt(space_after)
    for t,c in runs:
        if t=="\n":
            p=tf.add_paragraph(); p.alignment=align
            if ls: p.line_spacing=ls
            if space_after is not None: p.space_after=Pt(space_after)
            continue
        r=p.add_run(); r.text=t; f=r.font; f.size=Pt(size); f.name=font; f.color.rgb=c; f.bold=bold
        if spacing is not None: r._r.get_or_add_rPr().set('spc',str(spacing))
    return tb
def eyebrow(s,num,label,y):
    text(s,M,y,Inches(8),Inches(0.3),[(num+"  ",ORANGE),(label.upper(),MUTED)],size=10,font=MONO,spacing=300)
def headline(s,runs,y,size=40,w=None):
    return text(s,M,y,w or Inches(10.5),Inches(1.6),runs,size=size,font=DISPLAY,ls=1.0)
def stat(s,x,y,w,big,lbl,col=ORANGE):
    text(s,x,y,w,Inches(0.6),big,size=28,font=DISPLAY,color=col)
    text(s,x,y+Inches(0.6),w,Inches(0.6),lbl,size=11,font=BODY,color=INK2,ls=1.1)
def notes(s,t): s.notes_slide.notes_text_frame.text=t

# ── 1 · intro
s=slide()
text(s,M,Inches(2.0),Inches(8),Inches(0.3),[("■  ",ORANGE),("DEFENSE TRACK  ·  DEAN & CHASE  ·  CALTECH",MUTED)],size=10,font=MONO,spacing=300)
rect(s,M,Inches(2.5),Inches(0.16),Inches(1.0),ORANGE)
text(s,M+Inches(0.4),Inches(2.35),Inches(8),Inches(1.3),"FIREFLY",size=72,font=DISPLAY,color=INK)
text(s,M,Inches(3.85),Inches(7.2),Inches(2.5),[("Nobody knows where the fire is. ",INK),("We're building the system that figures it out and sends the drones.",ORANGE)],size=30,font=BODY,ls=1.1)
notes(s,"C: Hi, I'm Chase.\nD: And I'm Dean. We're both computer science majors at Caltech, and we're building Firefly.\nC: Firefly is the decision brain for a firefighting drone swarm. When a building catches fire, nobody knows where the fire is. Not the crew outside. Not the people inside.\nD: We're building the system that figures it out, and sends the drones.")

# ── 2 · the problem
s=slide(); eyebrow(s,"01","The problem",Inches(0.5))
headline(s,[("The fire destroys the sensors that report it.",INK)],Inches(0.85),size=38)
# stat strip
y=Inches(2.35); gap=Inches(0.3); w=(W-2*gap)/3
stat(s,M,y,w,"1.39M","US fires a year")
stat(s,M+w+gap,y,w,"$19.1B","in direct damage")
stat(s,M+2*(w+gap),y,w,"23 min","a small crew spends climbing, hauling, and finding a high-rise fire before water is on it",BLUE)
rect(s,M,Inches(3.75),W,Emu(9000),LINE)
# body
text(s,M,Inches(3.95),Inches(11.6),Inches(2.3),[
    ("Every sensor in a burning building fails in a way that looks like good data. ",INK),
    ("Soot coats a thermal lens and it reads room temperature where it's hottest. A radio link drops and the panel keeps showing the last number. Heat pushes a sensor past its ceiling and 300° and 800° read the same. A room flashes over and every sensor in it goes dark.",INK2),
    ("\n",INK2),
    ("That's not noise. Noise averages out. ",INK2),("These are lies. They come in groups, they point the same direction, and nobody tells the estimator which sensors are lying.",ORANGE)],size=16,font=BODY,ls=1.25,space_after=8)
text(s,M,Inches(6.35),Inches(11.6),Inches(0.6),[("Firefighters spend the first minutes climbing, hauling, and searching. ",INK),("That is the gap.",ORANGE)],size=16,font=BODY,bold=True)
notes(s,"C: In the US a fire department is dispatched every twenty-three seconds. One point four million fires a year. Nineteen billion dollars in direct damage. And a small crew in a high-rise needs twenty-three extra minutes before water is on the fire. Most of that is climbing, hauling, and finding it.\nD: Here's why it's hard. Every sensor in that building fails in a way that looks like good data. Soot coats a thermal lens, and it reads room temperature in the room that's burning. A radio link drops, and the panel keeps showing the last number it got. Heat pushes a sensor past its rated ceiling, and from then on three hundred degrees and eight hundred look the same. A room flashes over, the wiring melts, and every sensor in it goes dark.\nD: None of that is noise. Noise averages out. These are lies. They come in groups, they point the same direction, and nobody tells the estimator which sensors are lying.\nC: In 2020 the USS Bonhomme Richard burned for four days at the pier with the crew aboard, and the Navy scrapped her. That was not a missing hose. That was a command that could not see inside its own hull.")

# ── 3 · what we're making
s=slide(); eyebrow(s,"02","What we're making",Inches(0.5))
headline(s,[("A drone fleet that lives in the building, and the brain that runs it.",INK)],Inches(0.85),size=34,w=Inches(11.5))
y=Inches(2.55); gap=Inches(0.35); lw=Inches(4.6); rw=W-lw-gap; rx=M+lw+gap
# left: fleet
rect(s,M,y,lw,Emu(20000),BLUE)
text(s,M,y+Inches(0.2),lw,Inches(0.3),"THE FLEET",size=10,font=MONO,color=BLUE,spacing=300)
text(s,M,y+Inches(0.6),lw,Inches(3.2),[
    ("Tethers",INK),(" hold a line on the standpipe.",INK2),("\n",INK2),
    ("Retardant carriers",INK),(" coat what hasn't burned yet.",INK2),("\n",INK2),
    ("Hatch units",INK),(" close doors to starve the fire.",INK2),("\n",INK2),
    ("Scouts",INK),(" are pure sensors.",INK2),("\n",INK2),
    ("\n",INK2),
    ("They don't extinguish, and they don't replace firefighters. ",INK2),("They contain, and buy the crew time.",INK)],size=15,font=BODY,ls=1.2,space_after=6)
# right: brain
rect(s,rx,y,rw,Emu(20000),ORANGE)
text(s,rx,y+Inches(0.2),rw,Inches(0.3),"THE BRAIN  ·  TWO PARTS",size=10,font=MONO,color=ORANGE,spacing=300)
text(s,rx,y+Inches(0.6),rw,Inches(1.5),[
    ("1  Estimation. ",INK),("Uses the building's physics to catch lying sensors, then reports the fire as ",INK2),("certain, maybe, and a confidence that means something.",INK),
    (" On the same damaged feed the textbook filter is confidently wrong ",INK2),("65%",ORANGE),(" of the time. Ours: ",INK2),("0%.",BLUE)],size=14,font=BODY,ls=1.25)
text(s,rx,y+Inches(2.2),rw,Inches(1.2),[
    ("2  Dispatch. ",INK),("Every drone is also a sensor, so where we fight decides what we see next. ",INK2),("When the brain can't separate two rooms, it covers both.",INK)],size=14,font=BODY,ls=1.25)
text(s,M,Inches(6.3),Inches(11.6),Inches(0.6),[("The product is the hardware and the software together. ",INK),("This weekend is the software, proven in simulation.",ORANGE)],size=16,font=BODY,bold=True)
notes(s,"C: So we're building two things. A drone fleet that lives in the building, and the brain that runs it.\nC: The fleet is heterogeneous. Tethers hold a line on the standpipe. Retardant carriers coat what hasn't burned yet. Hatch units close doors to starve the fire. Scouts are pure sensors. They don't extinguish, and they don't replace firefighters. They contain, and they buy the crew time.\nD: The brain has two parts. First, estimation. It uses the building's physics to catch lying sensors, and it reports the fire as certain, maybe, and a confidence that actually means something. We ran the textbook tool, a Kalman filter, on the same damaged feed. It's confidently wrong sixty-five percent of the time, at ninety-seven percent confidence. Ours: zero. When two fires both fit the evidence, it says so and names both.\nD: Second, dispatch. Every drone is also a sensor, so where we choose to fight decides what we can see next. When the brain can't separate two rooms, it covers both.\nC: The product is the hardware and the software together. This weekend is the software, proven in simulation.")

# ── 4 · the market
s=slide(); eyebrow(s,"03","The market",Inches(0.5))
headline(s,[("Start where the sensors are already installed.",INK)],Inches(0.85),size=38)
y=Inches(2.35); gap=Inches(0.3); w=(W-2*gap)/3
stat(s,M,y,w,"~290","Navy hulls")
stat(s,M+w+gap,y,w,"344,950","DoD buildings")
stat(s,M+2*(w+gap),y,w,"~118,000","US buildings over 100k sq ft")
rect(s,M,Inches(3.75),W,Emu(9000),LINE)
text(s,M,Inches(3.95),Inches(11.6),Inches(2.2),[
    ("Government and military first, ",INK),("where the budgets and the sensor networks already exist. ",INK2),
    ("Then building owners and data-center operators, ",INK),("who eat the damage and the downtime, licensed per structure on the alarm panel they already have. ",INK2),
    ("Then insurers, ",INK),("who price the loss and can push it through premium credits. ",INK2),
    ("Fire departments don't pay. ",INK),("They get the commander's display, and that is what makes everyone else's purchase worth anything on the day.",INK2)],size=16,font=BODY,ls=1.3)
rect(s,M,Inches(5.95),W,Emu(9000),LINE)
text(s,M,Inches(6.15),Inches(11.6),Inches(0.9),[("A wrong confident answer sends drones to the wrong floor. We're building the one that says ",INK),('"floor 22 or 30 — cover both."',ORANGE)],size=18,font=BODY,bold=True,ls=1.2)
notes(s,"D: We start where the sensors are already installed. About two hundred ninety Navy hulls. Three hundred forty-four thousand DoD buildings. A hundred eighteen thousand commercial buildings over a hundred thousand square feet.\nC: Government and military first, where the budgets and the sensor networks already exist. Then owners and operators, who eat the damage and the downtime, a license per structure on the alarm panel they already have. Then insurers, who price the loss and can push it through premium credits.\nD: Fire departments don't pay. They get the commander's display, and that display is what makes everyone else's purchase worth anything on the day.\nD: A wrong confident answer sends drones to the wrong floor.\nC: We're building the one that says: floor twenty-two, or thirty.\nD: Cover both.")

out=sys.argv[1] if len(sys.argv)>1 else "docs/pitch/Firefly-Pitch.pptx"
prs.save(out); print(out)
