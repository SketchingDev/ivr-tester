import WebSocket from "ws";

export interface TwilioCallStream {
  sendMediaPayload(data: Buffer): void;
  isClosed(): boolean;
  close(): void;
}

export async function simulateTwilioCall(
  serverUrl: string
): Promise<TwilioCallStream> {
  const waitForConnection = async (ws: WebSocket): Promise<void> =>
    new Promise((resolve) => {
      ws.on("open", resolve);
    });

  const ws = new WebSocket(serverUrl);
  await waitForConnection(ws);

  return {
    async sendMediaPayload(data: Buffer): Promise<void> {
      const payload = {
        event: "media",
        media: {
          payload: data.toString("base64"),
        },
      };

      return new Promise((resolve, reject) => {
        ws.send(JSON.stringify(payload), (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    close(): void {
      if (ws && ![ws.CLOSED, ws.CLOSING].includes(ws.readyState)) {
        ws.close();
      }
    },

    isClosed(): boolean {
      return ws.readyState === ws.CLOSED;
    },
  };
}
