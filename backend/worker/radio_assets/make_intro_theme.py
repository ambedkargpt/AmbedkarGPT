"""Build the 30-second opening theme from the station's own music.

    python backend/worker/radio_assets/make_intro_theme.py <bheem-radio-assets-dir>

Writes backend/worker/radio_assets/music/sonic_logo.wav. build_radio puts it in
place of Bheem Radio's 5-second sonic logo, which is the first thing the
bulletin plays - so the opening becomes thirty seconds of news-style music before
the anchor speaks, as a TV bulletin opens, instead of a five-second sting.

It is assembled from assets already in the Bheem Radio pack, so there is nothing
new to license:

    0s ........................................ 30s
    headline_bed (the driving news bed, full 30s, faded out at the end)
    hit         hit         hit         hit
    0.0         7.5         15.0        22.5
                                          sonic_logo (lands so it ends at 30.0)

It is a stand-in. A commissioned theme - the thing that makes a bulletin
recognisable from its first two seconds - replaces it by dropping a 30-second
WAV at the same path; nothing else changes.
"""
import pathlib
import subprocess
import sys

LENGTH = 30.0
HITS_AT = [0.0, 7.5, 15.0, 22.5]


def main(assets: pathlib.Path) -> None:
    music = assets / "music"
    bed, hit, logo = music / "headline_bed.wav", music / "headline_hit.wav", music / "sonic_logo.wav"
    for f in (bed, hit, logo):
        if not f.is_file():
            raise SystemExit(f"missing {f}")

    logo_len = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(logo),
    ], text=True).strip())
    logo_at = LENGTH - logo_len

    out = pathlib.Path(__file__).resolve().parent / "music" / "sonic_logo.wav"
    out.parent.mkdir(parents=True, exist_ok=True)

    inputs = ["-i", str(bed)]
    for _ in HITS_AT:
        inputs += ["-i", str(hit)]
    inputs += ["-i", str(logo)]

    # Bed: in over a third of a second, out over the last two, and pulled down
    # while the logo plays so the logo is the thing heard last. Hits and logo
    # are delayed into place; everything is normalised to one format first so
    # amix does not have to guess.
    fmt = "aformat=sample_rates=44100:channel_layouts=stereo"
    chains = [
        f"[0:a]{fmt},atrim=0:{LENGTH},afade=t=in:d=0.3,"
        f"afade=t=out:st={LENGTH - 2.0}:d=2.0,"
        f"volume='if(gte(t,{logo_at:.2f}),0.45,0.85)':eval=frame[bed]",
    ]
    labels = ["[bed]"]
    for i, at in enumerate(HITS_AT, start=1):
        ms = int(at * 1000)
        chains.append(f"[{i}:a]{fmt},adelay={ms}|{ms},volume=0.9[h{i}]")
        labels.append(f"[h{i}]")
    n = len(HITS_AT) + 1
    ms = int(logo_at * 1000)
    chains.append(f"[{n}:a]{fmt},adelay={ms}|{ms}[logo]")
    labels.append("[logo]")
    chains.append(
        "".join(labels)
        + f"amix=inputs={len(labels)}:normalize=0:duration=first,"
        + f"atrim=0:{LENGTH},alimiter=limit=0.95[out]"
    )

    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *inputs,
         "-filter_complex", ";".join(chains), "-map", "[out]",
         "-ar", "44100", "-ac", "2", str(out)],
        check=True,
    )
    print(f"wrote {out} ({LENGTH:.0f}s; logo at {logo_at:.1f}s)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(pathlib.Path(sys.argv[1]))
