import ws from "ws";
import { EventEmitter } from "events";
import { WebSocketEvents } from "../TwilioCall";
import { TwilioConnectionEvents } from "../twilio";
import { TranscriberPlugin, TranscriptEvent } from "./plugin/TranscriberPlugin";

const collectUntilPause = (
  millisecondsToWait: number,
  callback: (transcript: string) => void
) => {
  let finalTranscriptions: TranscriptEvent[] = [];
  let timeout: ReturnType<typeof setTimeout>;

  return (event: TranscriptEvent) => {
    if (event.isFinal) {
      finalTranscriptions.push(event);
    }

    // const prefix = event.isFinal ? "recognized" : "recognizing";
    // console.log(`${prefix} text: ${event.transcription}`);

    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }

    timeout = setTimeout(() => {
      const transcript = finalTranscriptions
        .map((t) => t.transcription)
        .join(" ");
      callback(transcript);

      finalTranscriptions = [];
      timeout = undefined;
    }, millisecondsToWait);
  };
};

export interface TranscriptHandlerEvent {
  transcription: string;
}

/** @internal */
export class TranscriptionHandler extends EventEmitter {
  public static readonly TRANSCRIPTION_EVENT = "transcription";

  constructor(
    private readonly connection: ws,
    private readonly transcriber: TranscriberPlugin,
    private readonly pauseAtEndOfTranscript: number
  ) {
    super();
    connection.on(WebSocketEvents.Message, this.processMessage.bind(this));
    connection.on(WebSocketEvents.Close, this.close.bind(this));
    transcriber.on(
      TranscriptionHandler.TRANSCRIPTION_EVENT,
      collectUntilPause(
        pauseAtEndOfTranscript,
        this.processTranscript.bind(this)
      )
    );
  }

  private processTranscript(transcription: string) {
    const event: TranscriptHandlerEvent = { transcription };
    this.emit(TranscriptionHandler.TRANSCRIPTION_EVENT, event);
  }

  private processMessage(message: string) {
    const data = JSON.parse(message);
    switch (data.event) {
      case TwilioConnectionEvents.Media:
        this.transcriber.transcribe(Buffer.from(data.media.payload, "base64"));
        break;
      case TwilioConnectionEvents.CallEnded:
        this.close();
        break;
    }
  }

  private close() {
    this.connection.off(WebSocketEvents.Message, this.processMessage);
    this.connection.off(TwilioConnectionEvents.CallEnded, this.close);

    this.transcriber.close();
  }
}