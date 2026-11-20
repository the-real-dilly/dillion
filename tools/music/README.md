# Theme song generator

`compose.py` renders "Sunset in Los Pepinos", the Dilly Gone Mad main theme: an original synthwave composition (A minor, 104 BPM, 72 bars, about 2:53), synthesised entirely in code with numpy/scipy. No samples, no third-party audio.

```bash
python3 -m venv .venv && .venv/bin/pip install numpy scipy
.venv/bin/python tools/music/compose.py theme_raw.wav
ffmpeg -i theme_raw.wav -af loudnorm=I=-14:TP=-1.5:LRA=9 -c:a libmp3lame -b:a 192k theme.mp3
```

Edit the `HOOK_A` / `HOOK_B` lists and the chord tables near the top of the music data section to change the tune.
