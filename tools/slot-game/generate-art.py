"""Original layered SVG jewels for the cosmic slot theme."""
from pathlib import Path
out=Path(__file__).parent/'art'
out.mkdir(exist_ok=True)
shapes={
'spark':('#35c9ef','M60 6 73 42 110 60 73 75 60 114 45 75 9 60 45 43Z','M60 6V60L110 60M60 60 60 114M9 60H60'),
'prism':('#ef51b0','M60 10 103 38 87 101 33 101 17 38Z','M17 38 60 53 103 38M60 10V53L33 101M60 53 87 101'),
'rune':('#6395ff','M24 13H94L72 52H105L69 107H17L44 62Z','M24 13 58 53 94 13M58 53 17 107M58 53 69 107'),
'sigil':('#e8b83b','M60 7 103 31V88L60 113 17 88V31Z','M60 7V60L103 31M60 60 103 88M60 60 60 113M60 60 17 88M17 31 60 60'),
'bloom':('#f88b52','M60 56C14 48 19 5 43 13 59 19 60 40 60 56ZM64 60C72 14 115 19 107 43 101 59 80 60 64 60ZM60 64C106 72 101 115 77 107 61 101 60 80 60 64ZM56 60C48 106 5 101 13 77 19 61 40 60 56 60Z',''),
'moon':('#b48aff','M85 12C44 22 34 57 54 83 66 99 83 102 103 95 83 120 41 113 22 87 0 55 14 19 47 9 61 5 74 6 85 12Z','M71 16C42 29 26 63 49 88'),
'orbit':('#41ddae','M60 25A35 35 0 1 1 59.9 25Z',''),
'nova':('#ffb944','M60 3 70 25 88 12 87 35 111 34 97 53 119 63 96 74 108 94 84 92 83 116 65 101 51 119 45 96 22 106 28 82 4 81 21 62 3 46 28 43 19 20 43 28Z',''),
'gateway':('#d5a756','M60 7A53 53 0 1 1 59.9 7Z','')}
for name,(color,path,facets) in shapes.items():
    special=''
    if name in ('sigil','nova','bloom'):
        special='<circle cx="60" cy="60" r="21" fill="url(#metal)" stroke="#fff0bc" stroke-width="2"/><path d="m60 42 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1Z" fill="url(#gem)" stroke="#72410f"/>'
    if name=='orbit': special='<ellipse cx="60" cy="65" rx="53" ry="18" transform="rotate(-25 60 65)" fill="none" stroke="url(#metal)" stroke-width="8"/><ellipse cx="60" cy="65" rx="53" ry="18" transform="rotate(-25 60 65)" fill="none" stroke="#fff0c2" stroke-width="1"/><circle cx="42" cy="43" r="8" fill="#e0fff4" opacity=".6"/>'
    if name=='moon': special='<path d="m88 31 6 14 15 5-15 5-6 15-5-15-15-5 15-5Z" fill="url(#metal)" stroke="#fff0bd"/>'
    if name=='gateway': special='<circle cx="60" cy="60" r="41" fill="#201333" stroke="#fff0b4" stroke-width="2"/><circle cx="60" cy="60" r="34" fill="url(#gem)"/><path d="M42 85V48a18 18 0 0 1 36 0v37Z" fill="#140d25" stroke="url(#metal)" stroke-width="5"/><path d="m60 39 6 16 16 5-16 6-6 16-6-16-16-6 16-5Z" fill="#faf1ce"/>'
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 130"><defs>
<linearGradient id="gem" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#ffffff"/><stop offset=".22" stop-color="{color}"/><stop offset=".55" stop-color="{color}"/><stop offset="1" stop-color="#231131"/></linearGradient>
<linearGradient id="metal" x2=".7" y2="1"><stop stop-color="#fff4c7"/><stop offset=".28" stop-color="#e3b65c"/><stop offset=".5" stop-color="#926022"/><stop offset=".72" stop-color="#fce2a0"/><stop offset="1" stop-color="#754611"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="#000" flood-opacity=".65"/></filter></defs>
<g transform="translate(3 5) scale(.95)" filter="url(#shadow)"><path d="{path}" transform="translate(0 4)" fill="#593824" stroke="#422018" stroke-width="5"/>
<path d="{path}" fill="url(#gem)" stroke="url(#metal)" stroke-width="4"/>
<path d="{path}" fill="none" stroke="#fff3d3" stroke-width=".8" opacity=".7"/>
<path d="{facets}" fill="none" stroke="#fff" stroke-width="1.7" opacity=".5"/>{special}
<path d="m34 22 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="white" opacity=".85"/></g></svg>'''
    (out/(name+'.svg')).write_text(svg,encoding='utf8')
