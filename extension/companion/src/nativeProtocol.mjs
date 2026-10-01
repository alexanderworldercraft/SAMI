export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message));
  if (body.length > 1024 * 1024) throw new Error("Réponse native trop volumineuse.");
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
export class NativeDecoder {
  buffer = Buffer.alloc(0);
  constructor(onMessage) { this.onMessage = onMessage; }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (!length || length > 16 * 1024 * 1024) throw new Error("Taille du message natif invalide (maximum 16 Mo).");
      if (this.buffer.length < length + 4) return;
      const body = this.buffer.subarray(4, length + 4);
      this.buffer = this.buffer.subarray(length + 4);
      const message = JSON.parse(body.toString("utf8"));
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Message natif invalide.");
      this.onMessage(message);
    }
  }
}
