declare module "piper-tts-web" {
  export class PiperWebEngine {
    constructor(options?: Readonly<Record<string, unknown>>);
    generate(text: string, voiceId: string, speaker?: number): Promise<{ readonly file: Blob; readonly duration: number }>;
    destroy(): void;
  }

  export class OnnxWebRuntime {
    constructor(options?: { readonly basePath?: string; readonly numThreads?: number });
  }

  export class PhonemizeWebRuntime {
    constructor(options?: { readonly basePath?: string });
  }

  export class RemoteVoiceProvider {
    constructor(options?: {
      readonly baseUrl?: string;
      readonly provider?: { fetch(url: string): Promise<unknown>; destroy?(): void };
    });
    list(): Promise<unknown>;
    fetch(voiceId: string): Promise<unknown>;
    destroy(): void;
  }
}