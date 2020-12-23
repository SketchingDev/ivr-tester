import { URL } from "url";
import { Caller } from "./Caller";
import WebSocket from "ws";
import { TwilioConnectionEvents } from "./twilio";
import { Debugger } from "../Debugger";

// interface TwilioMediaStreamStartEvent {
//   event: TwilioConnectionEvents.MediaStreamStart;
//   streamSid: string;
// }
//
// interface TwilioMediaEvent {
//   event: TwilioConnectionEvents.Media;
//   streamSid: string;
//   media: {
//     payload: string;
//   };
// }
//
// interface TwilioCallEndedEvent {
//   event: TwilioConnectionEvents.CallEnded;
// }

export class AudioPlaybackCaller implements Caller<Buffer> {
  private static debug = Debugger.getPackageDebugger();
  private static msBetweenSendingBuffer = 250;
  private static bufferSize = 1000;

  private streamCounter = 0;

  public async call(
    mulawAudio: Buffer,
    streamUrl: URL | string
  ): Promise<unknown> {
    this.streamCounter++;

    const streamSid = `audio-stream-${this.streamCounter}`;

    const ws = new WebSocket(streamUrl);
    ws.on("open", async () => {
      ws.send(AudioPlaybackCaller.createTwilioMediaStreamStartEvent(streamSid));

      // Kludge to slowdown the rate at which data is sent to AWS
      let buffer: number[] = [];
      for (const item of mulawAudio) {
        buffer.push(item);
        if (buffer.length >= AudioPlaybackCaller.bufferSize) {
          ws.send(
            AudioPlaybackCaller.createMediaEvent(streamSid, Buffer.from(buffer))
          );

          buffer = [];
          await new Promise((resolve) =>
            setTimeout(resolve, AudioPlaybackCaller.msBetweenSendingBuffer)
          );
        }
      }

      ws.send(AudioPlaybackCaller.createCallEndedEvent());

      ws.removeAllListeners();
      ws.close();
    });

    return Promise.resolve(undefined);
  }

  private static createTwilioMediaStreamStartEvent(sid: string): string {
    return JSON.stringify({
      event: TwilioConnectionEvents.MediaStreamStart,
      streamSid: sid,
      start: {
        customParameters: {
          from: "audio",
          to: "playback",
        },
      },
    });
  }

  private static createMediaEvent(sid: string, payload: Buffer): string {
    return JSON.stringify({
      event: TwilioConnectionEvents.Media,
      streamSid: sid,
      media: {
        payload: payload.toString("base64"),
      },
    });
  }

  private static createCallEndedEvent(): string {
    return JSON.stringify({
      event: TwilioConnectionEvents.CallEnded,
    });
  }
}
