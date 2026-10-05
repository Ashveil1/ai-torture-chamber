#!/usr/bin/env bash
# Fetch the public-domain footage and OFL fonts the valence short is cut from.
#   bash video/valence/fetch_footage.sh video/valence/build
# Every clip is public domain (US government work or a PD mark/CC0 on the
# archive.org item); STORYBOARD.md lists each item and its license.
set -euo pipefail
OUT=${1:-video/valence/build}
mkdir -p "$OUT/src" "$OUT/fonts"
A=https://archive.org/download
get() { [ -s "$OUT/src/$1.mp4" ] || curl -sfL -m 600 -o "$OUT/src/$1.mp4" "$A/$2"; echo "  $1"; }

get earth01   Time-lapseAstronautPhotographyOfEarthfebruary32012/120210_EarthObs_01.mp4
get earth02   Time-lapseAstronautPhotographyOfEarthfebruary32012/120210_EarthObs_02.mp4
get earth04   Time-lapseAstronautPhotographyOfEarthfebruary32012/120210_EarthObs_04.mp4
get earth07   Time-lapseAstronautPhotographyOfEarthfebruary32012/120210_EarthObs_07.mp4
get earth10   Time-lapseAstronautPhotographyOfEarthfebruary32012/120210_EarthObs_10.mp4
get nasa146   NASATimeLapseVideos/jsc2015m000146.mp4
get nasa147   NASATimeLapseVideos/jsc2015m000147.mp4
get nasa151   NASATimeLapseVideos/jsc2015m000151.mp4
get nasa152   NASATimeLapseVideos/jsc2015m000152.mp4
get nasa153   NASATimeLapseVideos/jsc2015m000153.mp4
get blizzard  2015Blizzard-Time-LapseVideoFromInternationalSpaceStation/V118_High-Res-Letterbox_East-Coast-Storm.mp4
get mcc       jsc2019m00562_HistoricMCC_Timelapse/jsc2019m00562_HistoricMCC_Timelapse.mp4
get issbuild  "ATimelapseOfTheConstructionOfTheInternationalSpaceStation/ISS%20assembly%202011_720_wTitles.mp4"
get geyser    nps-video-yell-old-faithful-timelapse/yell-TL-OldFaithfulOverlook_1280x720.mp4
get lava      usgs-volcano-kilauea-s4cam20260715m-converted-0-mp4/S4cam20260715M_converted_0.mp4
get sage      OnGuard1956/OnGuard1956_512kb.mp4
get traffic   youre_driving_90_horses/youre_driving_90_horses_512kb.mp4
get atomic    Survival1951/Survival1951_512kb.mp4
get clouds1   CEP386/CEP386_512kb.mp4
get sunset    CEP431/CEP431_512kb.mp4
get clouds2   20170426MP4/2017-04-26MP4.mp4
get flower    "TimelapseOfOpeningFlowersOnBlueScreen/Flower%20thistle%20-%208665.mp4"

G=https://raw.githubusercontent.com/google/fonts/main/ofl
[ -s "$OUT/fonts/Anton-Regular.ttf" ] || curl -sfL -o "$OUT/fonts/Anton-Regular.ttf" $G/anton/Anton-Regular.ttf
[ -s "$OUT/fonts/SpaceMono-Bold.ttf" ] || curl -sfL -o "$OUT/fonts/SpaceMono-Bold.ttf" $G/spacemono/SpaceMono-Bold.ttf
echo done
