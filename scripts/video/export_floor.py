"""Export Wrong Floor scenes as .glb for Blender (the video pipeline's sets).

Loads the game with ?debug#<floor>, lets the floor build, and saves the whole scene (the floor,
the car, the lights) through WF.exportGLB. Residents come out in their rest pose.

    python scripts/video/export_floor.py floor7 floor2 --out video/scenes
    python scripts/video/export_floor.py floor4 --base https://wirehead-beta.vercel.app

Needs Playwright and a Chromium (CHROMIUM env var, default Homebrew's).
"""
import argparse
import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright


async def export(base, floors, out, revisit):
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM", "/opt/homebrew/bin/chromium"),
                                    args=["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"])
        for fl in floors:
            ctx = await b.new_context(accept_downloads=True)
            await ctx.add_init_script("try{localStorage.setItem('chamber_consent',JSON.stringify({v:9,mode:'witness'}))}catch(e){}")
            await ctx.route("**/chamber/**", lambda r: r.fulfill(status=503, body=""))
            pg = await ctx.new_page()
            await pg.goto(f"{base}/wrongfloor.html?debug#{fl}")
            await pg.wait_for_timeout(4500)
            async with pg.expect_download() as dl:
                n = await pg.evaluate(f"WF.exportGLB('{fl}')")
            path = out / f"{fl}.glb"
            await (await dl.value).save_as(path)
            print(f"{path}  {n / 1e6:.1f} MB")
            await ctx.close()
        await b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("floors", nargs="+", help="floor1..floor7, floorS (stairwell), floorR (records), floorB (stacks)")
    ap.add_argument("--base", default="http://localhost:8731")
    ap.add_argument("--out", type=Path, default=Path("video/scenes"))
    a = ap.parse_args()
    asyncio.run(export(a.base.rstrip("/"), a.floors, a.out, False))


if __name__ == "__main__":
    main()
