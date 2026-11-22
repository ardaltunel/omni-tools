# Roulette audio sources

All recordings are distributed under CC0 1.0 Universal.

- `chip-lay-1.mp3`, `chips-collide-1.mp3` and `chips-stack-3.mp3` were converted from the corresponding OGG files in **Casino Audio 1.1** by **Kenney Vleugels**. The original creator's license is retained in `KENNEY-LICENSE.txt`. [Kenney pack](https://kenney.nl/assets/casino-audio), [Kenney's OpenGameArt upload](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips), [downloaded archive](https://opengameart.org/sites/default/files/kenney_casino-audio.zip).
- `roulette-spin.mp3` is the official high-quality MP3 preview of **spin_sound.wav** by **takecoins**, published September 27, 2021. The creator describes it as spinning roulette and publishes it under CC0. [Creator and license page](https://freesound.org/people/takecoins/sounds/588351/), [downloaded MP3](https://cdn.freesound.org/previews/588/588351_13287395-hq.mp3).

[CC0 1.0 Universal terms](https://creativecommons.org/publicdomain/zero/1.0/)

Downloaded November 22, 2026. The three Kenney recordings were converted to MP3 with the installed FFmpeg 7 `libmp3lame` encoder using `-map_metadata -1 -c:a libmp3lame -q:a 3`. This supports older iOS/Safari versions that cannot decode OGG Vorbis. The roulette MP3 retains the downloaded audio data.

Playback applies level matching, a 5 ms edge fade, a low-pass filter, gentle peak compression and a soft volume envelope. The short roulette recording loops during a spin. Chip stacking provides the win cue, and a quiet chip placement provides the loss cue.
