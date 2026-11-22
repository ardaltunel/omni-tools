# Roulette audio sources

All recordings are distributed under CC0 1.0 Universal.

- `chip-lay-1.mp3`, `chips-collide-1.mp3` and `chips-stack-3.mp3` were converted from the corresponding OGG files in **Casino Audio 1.1** by **Kenney Vleugels**. The original creator's license is retained in `KENNEY-LICENSE.txt`. [Kenney pack](https://kenney.nl/assets/casino-audio), [Kenney's OpenGameArt upload](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), [downloaded archive](https://opengameart.org/sites/default/files/kenney_casino-audio.zip).
- The legacy `roulette-roll.mp3`, retained for older cached clients, is an edited excerpt of **Marbles_Rolling on wooden floor 2.wav** by **KaleidacousticsAudio** under CC0. [Creator and license page](https://freesound.org/people/KaleidacousticsAudio/sounds/629002/), [downloaded official HQ MP3](https://cdn.freesound.org/previews/629/629002_13875907-hq.mp3).
- `roulette-ball-soft.mp3` is a 6.8 second excerpt of **roulette_casino_evian.aif** by **f_ilippo**, published August 21, 2008. The creator recorded a croupier spinning the actual roulette wheel at Évian casino with a mono Schoeps microphone while the salon was closed to the public, and released it under CC0. [Creator and license page](https://freesound.org/people/f_ilippo/sounds/59194/), [downloaded official HQ MP3](https://cdn.freesound.org/previews/59/59194_745228-hq.mp3).

[CC0 1.0 Universal terms](https://creativecommons.org/publicdomain/zero/1.0/)

Downloaded November 22, 2026. Recordings are encoded as MP3 with the installed FFmpeg 7 `libmp3lame` encoder using `-map_metadata -1 -c:a libmp3lame -q:a 3`. This supports older iOS/Safari versions that cannot decode OGG Vorbis.

The chip placement is shortened to 0.14 seconds, filtered at 2.4 kHz and softened with transient compression and short fades. Chip stacking provides a quiet win cue. Wheel ticks and loss tones stay silent. Playback applies downward-only level limiting, a low-pass filter, gentle peak compression and volume envelopes.

`roulette-ball-soft.mp3` uses source seconds 11.3–18.1 at their original speed. The real ball's late tracking and landing are retained in one continuous excerpt. Processing uses a 220 Hz high-pass, 3.4 kHz low-pass, transient compression, 10 dB gain, a 180 ms fade-in and 400 ms fade-out. There are no added impacts, pitch changes, time stretching or loops.

The complete FFmpeg audio filter is `highpass=f=220,lowpass=f=3400,acompressor=threshold=0.025:ratio=3:attack=2:release=70:makeup=1,volume=10dB,afade=t=in:d=0.18,afade=t=out:st=6.4:d=0.4`. Its decoded duration is 6.8 seconds, mean level is −30.6 dBFS and peak is −15.1 dBFS before the in-game mix. Chip placement measures −34.4 dBFS RMS / −14.9 dBFS peak before mixing.

Runtime limits the spin to a peak gain of 0.22, at least 10.65 dB below the previous 0.75 gain, while preserving chip gains and saved user volume. The spin fades in over 300 ms, gradually decreases to 0.10, and fades to silence over its last 400 ms. At the default master gain of 0.27, even its maximum gain gives upper levels of approximately −55.1 dBFS RMS / −39.6 dBFS peak before the additional envelope attenuation. Late unmute seeks to the current recording position and resumes at the reduced level.
