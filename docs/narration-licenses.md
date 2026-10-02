# Narration Licenses

| Component | Version / asset | License | Source |
| --- | --- | --- | --- |
| Piper Web browser engine | `piper-tts-web` 1.1.2 | MIT | [npm package](https://www.npmjs.com/package/piper-tts-web) |
| MP3 encoder | `wasm-media-encoders` 0.7.0 | MIT | [npm package](https://www.npmjs.com/package/wasm-media-encoders) |
| Jenny Dioco voice model | `en_GB-jenny_dioco-medium` | MIT | [Piper voices repository](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/jenny_dioco/medium) |

The selected voice is the only voice generated for this lesson. Its ONNX model is stored locally under `audio/`; its matching JSON config is retrieved from the model source and cached in the browser. The model and config are separate from the Piper engine code.
