# Narration TTS Setup

The development-only generator runs Piper in the browser. The Node CLI remains the silent mock generator; it never runs Piper.

## Generate Audio

1. Optionally copy `.env.example` to `.env`. `PIPER_VOICE_ID` defaults to `en_GB-jenny_dioco-medium`. Set `PIPER_BASE_PATH` only when serving a Piper `voices.json` catalog and its matching model/config files from another base URL.
2. Start the web dev server:

   ```sh
   pnpm --filter @mma/web dev
   ```

3. Open `http://localhost:5173/?narration-generator` and select **Generate all 10 cues**. Generation does not start until that button is pressed. The browser checks the selected voice catalog, downloads missing model/config files, and reports model download progress.
4. Piper model files and generated MP3 cache entries are stored in the browser's origin-private file system (OPFS). With the default voice, the Jenny ONNX model already in `audio/` is served locally; its JSON config and the Piper catalog are fetched from the official Piper voice repository. The first run needs network access. No audio is uploaded.
5. Download each cue's MP3 and VTT from the result list. Put them in `modules/chem-atom-builder/narration/en/generated/`, replacing the matching caption files, and commit the MP3/VTT assets. Keep the existing `.wav.gz` files as the silent playback fallback.

MP3 output is mono at 64 kbps, and generation stops if the lesson would exceed 5 MiB. The browser decodes both Piper's WAV and the encoded MP3 before offering downloads. Each must be non-silent (peak above `0.02`, RMS above `0.005`) and last `0.2` to `0.8` seconds per spoken word. Failed checks show an alert and set `data-exit-status="1"`; no failed clip is offered for download. Successful generation sets it to `0`.

Piper provides no word timestamps: captions are split at sentence boundaries and their intervals are estimated by spoken word count, scaled to the duration of the decoded MP3. Pauses and speaking emphasis can make individual sentence boundaries approximate. The Node mock generator remains for tests and writes only under each module's ignored `.mock-narration/` directory, never to the committed narration assets.

## Hear The Audio

- Desktop: run the dev server, open the lesson at `http://localhost:5173/`, choose **Tap to enable sound**, and start or replay a cue. Confirm captions advance sentence by sentence and mute still works.
- Phone: run `pnpm --filter @mma/web dev --host 0.0.0.0`, open `http://<computer-LAN-address>:5173/` on the phone, enable sound with a tap, and replay the Na+, C-14, and Cl- cues. Confirm audio, captions, mute, and fallback behavior.

For a self-hosted voice base path, expose `voices.json` plus the standard Piper voice model tree, including both `.onnx` and `.onnx.json` files. Use the same base path for the catalog, model, and config.
