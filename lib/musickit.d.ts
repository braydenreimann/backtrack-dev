type MusicKitQueueOptions = {
  song: string;
};

interface MusicKitPlayer {
  setQueue(options: MusicKitQueueOptions): Promise<unknown> | unknown;
  play(): Promise<unknown> | unknown;
  pause(): void;
  stop?: () => Promise<unknown> | unknown;
}

interface MusicKitNamespace {
  configure(options: {
    developerToken: string;
    app: {
      name: string;
      build: string;
    };
  }): Promise<unknown> | unknown;
  getInstance(): MusicKitPlayer;
}

declare global {
  interface Window {
    MusicKit?: MusicKitNamespace;
  }
}

export {};
