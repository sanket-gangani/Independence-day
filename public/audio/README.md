# Music

Drop an audio file here named **`theme.mp3`** and it becomes the score.

```
public/audio/theme.mp3
```

It is detected at load (a `HEAD` request, before any sound plays), looped, faded
in when you step into the courtyard, and swelled at the moment the flag opens.
Nothing else needs changing. If the file is absent, a synthesised score plays
instead — a slow lead over a tanpura-style drone in D — along with the morning
ambience, the creak of the halyard and the crowd.

## On "Maa Tujhhe Salaam"

That recording is A. R. Rahman's and it is in copyright, so it is not bundled
here and should not be committed to this repository or served from a public
deployment without a licence. If you have cleared the rights, or you are running
this privately with your own copy, put it at the path above and it will play.

For a public build, use something you are actually allowed to ship: a
royalty-free patriotic instrumental, a recording you commissioned, or the
synthesised score that is already here. Do not substitute a copyrighted
recording of the national anthem either — that carries its own restrictions on
top of copyright.

## Format

MP3 or M4A, mono or stereo, anything from 1 to 4 minutes. It loops, so a track
that ends cleanly on its own downbeat sounds best.
