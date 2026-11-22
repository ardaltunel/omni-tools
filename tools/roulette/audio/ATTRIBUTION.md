# Roulette audio sources

All recordings are distributed under CC0 1.0 Universal.

- `chip-lay-1.mp3`, `chips-collide-1.mp3` and `chips-stack-3.mp3` were converted from the corresponding OGG files in **Casino Audio 1.1** by **Kenney Vleugels**. The original creator's license is retained in `KENNEY-LICENSE.txt`. [Kenney pack](https://kenney.nl/assets/casino-audio), [Kenney's OpenGameArt upload](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), [downloaded archive](https://opengameart.org/sites/default/files/kenney_casino-audio.zip).
- `roulette-roll.mp3` is an edited excerpt of **Marbles_Rolling on wooden floor 2.wav** by **KaleidacousticsAudio**, published April 20, 2022. The creator recorded single glass marbles rolling on a wooden floor and hitting a wall with a Zoom H5 and released the recording under CC0. [Creator and license page](https://freesound.org/people/KaleidacousticsAudio/sounds/629002/), [downloaded official HQ MP3](https://cdn.freesound.org/previews/629/629002_13875907-hq.mp3).

[CC0 1.0 Universal terms](https://creativecommons.org/publicdomain/zero/1.0/)

Downloaded November 22, 2026. Recordings are encoded as MP3 with the installed FFmpeg 7 `libmp3lame` encoder using `-map_metadata -1 -c:a libmp3lame -q:a 3`. This supports older iOS/Safari versions that cannot decode OGG Vorbis.

The 6.8 second roulette edit uses continuous source audio starting at 0.7 seconds. Playback speed gradually decreases from 1.3× to 0.55×, the rolling fades out by 6.1 seconds, and three quiet excerpts of the recorded wooden impact occur at 5.92, 6.24 and 6.49 seconds. The edit applies a 140 Hz high-pass, a 2.3 kHz low-pass, transient compression and a soft peak limit. It plays once per spin and contains no repeated loop.

The chip placement is shortened to 0.14 seconds, filtered at 2.4 kHz and softened with transient compression and short fades. Chip stacking provides a quiet win cue. Wheel ticks and loss tones stay silent. Playback applies downward-only level limiting, a low-pass filter, gentle peak compression and volume envelopes.

FFmpeg decoded-file measurements for the final edits are −29.9 dB RMS / −13.2 dB peak for the spin and −34.4 dB RMS / −14.9 dB peak for chip placement, before the in-game master volume.
