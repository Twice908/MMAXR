declare module "wasm-media-encoders" {
  export interface Mp3Encoder {
    configure(options: {
      readonly sampleRate: number;
      readonly channels: 1 | 2;
      readonly bitrate: number;
    }): void;
    encode(channels: readonly Float32Array[]): Uint8Array;
    finalize(): Uint8Array;
  }

  export function createMp3Encoder(): Promise<Mp3Encoder>;
}