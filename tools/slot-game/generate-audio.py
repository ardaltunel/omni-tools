"""Generate original, softly enveloped slot cues (no third-party samples)."""
import math, random, wave
from pathlib import Path

OUT = Path(__file__).parent / 'audio'
OUT.mkdir(exist_ok=True)
RATE = 24000
random.seed(412)

def make(name, notes, duration, mechanical=False):
    samples = [0.0] * int(RATE * duration)
    for frequency, start, length, level in notes:
        for n in range(int(length * RATE)):
            t = n / RATE
            index = int(start * RATE) + n
            if index >= len(samples): break
            envelope = min(1, t / .015) * math.exp(-5 * t / length) * min(1, (length-t)/.035)
            tone = math.sin(2*math.pi*frequency*t) + .16*math.sin(2*math.pi*frequency*2*t)*math.exp(-12*t)
            samples[index] += level * envelope * tone
    if mechanical:
        filtered = 0
        for n in range(len(samples)):
            t=n/RATE
            filtered = .9*filtered + .1*random.uniform(-1,1)
            envelope = min(1,t/.04) * max(0,1-t/duration)**2
            samples[n] += filtered * .24 * envelope * (.55+.45*math.sin(t*2*math.pi*24)**2)
    with wave.open(str(OUT / (name+'.wav')), 'wb') as f:
        f.setparams((1,2,RATE,0,'NONE','not compressed'))
        import struct
        f.writeframes(b''.join(struct.pack('<h', int(max(-.8,min(.8,x))*32767)) for x in samples))

make('spin',[(150,0,.25,.10),(220,.14,.22,.07),(280,.3,.2,.045)],.65,True)
make('cascade',[(440,0,.25,.12),(660,.09,.3,.08)],.45)
make('multiplier',[(392,0,.4,.12),(587,.12,.4,.10),(784,.24,.5,.07)],.85)
make('win',[(392,0,.5,.12),(494,.1,.5,.11),(587,.2,.6,.10)],1.0)
make('big',[(330,0,.5,.10),(440,.12,.6,.12),(554,.24,.6,.10),(660,.36,.7,.09)],1.25)
make('mega',[(262,0,.6,.10),(392,.12,.6,.11),(524,.24,.6,.10),(660,.36,.7,.09),(784,.48,.8,.08)],1.5)
make('free',[(330,0,.6,.10),(440,.16,.6,.12),(554,.32,.6,.10),(660,.48,.8,.09)],1.5)
make('miss',[(170,0,.17,.06)],.25,True)
make('toggle',[(440,0,.16,.08)],.22)
