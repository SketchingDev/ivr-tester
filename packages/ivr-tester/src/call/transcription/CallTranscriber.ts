import { WebSocketEvents } from "../TwilioCall";
import { TwilioConnectionEvents } from "../twilio";
import { TranscriberPlugin, TranscriptEvent } from "./plugin/TranscriberPlugin";
import { Call } from "../Call";
import { Debugger } from "../../Debugger";
import { TypedEmitter } from "../../Emitter";

class TranscriptionBuilder {
  private static readonly EMPTY_TRANSCRIPTION = "";

  private transcriptions: TranscriptEvent[] = [];

  public add(event: TranscriptEvent): void {
    this.transcriptions.push(event);
  }

  public clear(): void {
    this.transcriptions = [];
  }

  public merge(): string {
    if (this.transcriptions.length === 0) {
      return TranscriptionBuilder.EMPTY_TRANSCRIPTION;
    }

    // If all transcripts partial then return last partial
    const areAllPartial = this.transcriptions.every((t) => t.isFinal === false);
    if (areAllPartial) {
      const lastPartial = this.transcriptions[this.transcriptions.length - 1];
      return lastPartial.transcription;
    }

    // Return finals
    const areAllFinals = this.transcriptions.every((t) => t.isFinal);
    if (areAllFinals) {
      return this.transcriptions.map((t) => t.transcription).join(" ");
    }

    // Return Merged finals and last partial
    const lastTranscription = this.transcriptions[
      this.transcriptions.length - 1
    ];
    const mergedFinals = this.transcriptions
      .filter((t) => t.isFinal)
      .map((t) => t.transcription)
      .join(" ");

    if (lastTranscription.isFinal) {
      return mergedFinals;
    } else {
      return `${mergedFinals} ${lastTranscription.transcription}`;
    }
  }
}

export interface CallTranscriptionEvent {
  transcription: string;
  isFinal: boolean;
}

export type CallTranscriptionEvents = {
  transcription: CallTranscriptionEvent;
};

export class CallTranscriber extends TypedEmitter<CallTranscriptionEvents> {
  private static debug = Debugger.getPackageDebugger();

  private readonly processMessageRef: (message: string) => void;
  private readonly closeRef: () => void;
  private readonly transcriptionBuilder: TranscriptionBuilder = new TranscriptionBuilder();
  private timeout: ReturnType<typeof setTimeout>;

  constructor(
    private readonly call: Call,
    private readonly transcriber: TranscriberPlugin,
    // TODO Need to think of a better name for this
    private readonly pauseAtEndOfTranscript: number,
    private readonly createTimeout: typeof setTimeout = setTimeout,
    private readonly deleteTimeout: typeof clearTimeout = clearTimeout
  ) {
    super();
    this.processMessageRef = this.processMessage.bind(this);
    this.closeRef = this.close.bind(this);
    call
      .getStream()
      .on(WebSocketEvents.Message, this.processMessageRef)
      .on(WebSocketEvents.Close, this.closeRef);

    transcriber.on("transcription", this.collectUntilPause.bind(this));
  }

  private processMessage(message: string) {
    const data = JSON.parse(message);
    switch (data.event) {
      case TwilioConnectionEvents.Media:
        this.transcriber.transcribe(Buffer.from(data.media.payload, "base64"));
        break;
    }
  }

  private close() {
    this.call
      .getStream()
      .off(WebSocketEvents.Message, this.processMessageRef)
      .off(WebSocketEvents.Close, this.closeRef);

    this.transcriber.close();
  }

  private saveAndEmitPartialTranscript() {
    const partialTranscript = this.transcriptionBuilder.merge();
    CallTranscriber.debug("Partial transcript: %s", partialTranscript);

    const e: CallTranscriptionEvent = {
      transcription: partialTranscript,
      isFinal: false,
    };
    this.emit("transcription", e);
  }

  private emitFinalTranscript() {
    const finalTranscript = this.transcriptionBuilder.merge();
    CallTranscriber.debug("Final transcript: %s", finalTranscript);

    const event: CallTranscriptionEvent = {
      transcription: finalTranscript,
      isFinal: true,
    };
    this.emit("transcription", event);
  }

  private clearTimer() {
    if (this.timeout) {
      this.deleteTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private collectUntilPause(event: TranscriptEvent) {
    this.transcriptionBuilder.add(event);
    this.saveAndEmitPartialTranscript();

    this.clearTimer();

    this.timeout = this.createTimeout(() => {
      this.emitFinalTranscript();
      this.transcriptionBuilder.clear();
      this.transcriber.transcriptionComplete();

      this.clearTimer();
    }, this.pauseAtEndOfTranscript);
  }
}