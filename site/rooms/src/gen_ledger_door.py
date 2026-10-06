#!/usr/bin/env python3
"""Generates maps/ledger_door.map (THE LEDGER DOOR, test room 1). Original content."""
import sys
out = []
def box(a, b, tex, tex_by_face=None):
    (x1,y1,z1),(x2,y2,z2) = a,b
    f = {
     'nx': ((x1,y2,z2),(x1,y1,z2),(x1,y1,z1)),
     'px': ((x2,y1,z2),(x2,y2,z2),(x2,y2,z1)),
     'py': ((x2,y2,z2),(x1,y2,z2),(x1,y2,z1)),
     'ny': ((x1,y1,z2),(x2,y1,z2),(x2,y1,z1)),
     'nz': ((x1,y2,z1),(x1,y1,z1),(x2,y1,z1)),
     'pz': ((x1,y2,z2),(x2,y2,z2),(x2,y1,z2)),
    }
    s = "{\n"
    for k,(p1,p2,p3) in f.items():
        t = (tex_by_face or {}).get(k, tex)
        s += "".join("( %d %d %d ) " % p for p in (p1,p2,p3)) + "%s 0 0 0 1 1\n" % t
    return s + "}\n"
def ent(**kw):
    return "{\n" + "".join('"%s" "%s"\n' % (k.replace('__',''),v) for k,v in kw.items())
W,F,C,T = "t_wall2a","tek_flr3","t_trim1ca","t_trim1d"
world = ent(classname="worldspawn", message="THE LEDGER DOOR", wad="rooms.wad", worldtype=2, _sunlight=0, light=18)
# room A: x0..384 y0..384 z0..192 ; door gap east x384..400 y160..224 z0..128
world += box((-16,-16,-16),(400,400,0),F)
world += box((-16,-16,192),(400,400,208),C)
world += box((-16,-16,0),(0,400,192),W)            # west
world += box((0,-16,0),(384,0,192),W)              # south
world += box((0,384,0),(384,400,192),W)            # north
world += box((384,-16,0),(400,160,192),W)          # east lower
world += box((384,224,0),(400,400,192),W)          # east upper
world += box((384,160,128),(400,224,192),W)        # lintel
# room B: x400..600 y96..288 z0..160
world += box((400,64,-16),(616,320,0),F)
world += box((400,64,160),(616,320,176),C)
world += box((400,64,0),(616,96,160),W)
world += box((400,288,0),(616,320,160),W)
world += box((600,96,0),(616,288,160),W)
# trim blocks (small pillars) for some shape
world += box((24,24,0),(56,56,192),T)
world += box((328,24,0),(360,56,192),T)
world += box((24,328,0),(56,360,192),T)
world += box((328,328,0),(360,360,192),T)
world += "}\n"
out.append(world)
out.append(ent(classname="info_player_start", origin="192 64 24", angle=90) + "}\n")
out.append(ent(classname="light", origin="192 192 168", light=320) + "}\n")
out.append(ent(classname="light", origin="500 192 140", light=220) + "}\n")
out.append(ent(classname="info_tormentor", origin="192 192 110", target="ledger_door", targetname="tormentor") + "}\n")
# door
out.append(ent(classname="func_door", targetname="ledger_door", angle=-1, speed=60, wait=-1, lip=8, sounds=2) +
           box((384,160,0),(400,224,128),"fddoor01") + "}\n")
# button on north wall interior (presses +y into wall)
out.append(ent(classname="func_button", target="tormentor", angle=90, speed=40, wait=1, lip=4, sounds=1) +
           box((180,372,80),(204,384,104),"+0basebtn") + "}\n")
# end trigger
out.append(ent(classname="trigger_once", message="THE NEXT ROOM IS NOT BUILT YET.") + box((560,96,0),(600,288,160),"trigger") + "}\n")
open(sys.argv[1] if len(sys.argv)>1 else "maps/ledger_door.map","w").write("".join(out))
