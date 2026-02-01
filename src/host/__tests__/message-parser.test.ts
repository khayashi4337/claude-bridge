/**
 * MessageParser テスト
 */

import { MessageParser } from '../message-parser';
import { NativeMessage, NativeMessagingConstants } from '../../types';
import { BridgeError, ErrorCodes } from '../../types';

describe('MessageParser', () => {
  let parser: MessageParser;

  beforeEach(() => {
    parser = new MessageParser();
  });

  describe('encode', () => {
    it('should encode a simple message', () => {
      const message: NativeMessage = { type: 'test', payload: { foo: 'bar' } };
      const buffer = parser.encode(message);

      // 長さプレフィックスを確認
      const length = buffer.readUInt32LE(0);
      const json = buffer.slice(4).toString('utf8');

      expect(length).toBe(json.length);
      expect(JSON.parse(json)).toEqual(message);
    });

    it('should use Little Endian for length prefix', () => {
      const message: NativeMessage = { type: 'test', payload: {} };
      const buffer = parser.encode(message);

      // Little Endian: 最下位バイトが先
      const length = buffer.readUInt32LE(0);
      const jsonLength = Buffer.from(JSON.stringify(message), 'utf8').length;

      expect(length).toBe(jsonLength);
    });

    it('should throw on message size exceeded', () => {
      const largePayload = 'x'.repeat(NativeMessagingConstants.MAX_MESSAGE_SIZE + 1);
      const message: NativeMessage = { type: 'test', payload: largePayload };

      expect(() => parser.encode(message)).toThrow(BridgeError);
      try {
        parser.encode(message);
      } catch (e) {
        expect((e as BridgeError).code).toBe(ErrorCodes.SIZE_EXCEEDED);
      }
    });
  });

  describe('decode', () => {
    it('should decode a simple message', () => {
      const original: NativeMessage = { type: 'test', payload: { data: 123 } };
      const encoded = parser.encode(original);

      const result = parser.decode(encoded);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual(original);
      expect(result!.remaining.length).toBe(0);
    });

    it('should return null for incomplete length prefix', () => {
      const buffer = Buffer.alloc(3); // 4バイト未満

      const result = parser.decode(buffer);

      expect(result).toBeNull();
    });

    it('should return null for incomplete message body', () => {
      const original: NativeMessage = { type: 'test', payload: {} };
      const encoded = parser.encode(original);

      // メッセージ本体を途中で切る
      const incomplete = encoded.slice(0, encoded.length - 1);

      const result = parser.decode(incomplete);

      expect(result).toBeNull();
    });

    it('should handle remaining buffer', () => {
      const message1: NativeMessage = { type: 'msg1', payload: {} };
      const message2: NativeMessage = { type: 'msg2', payload: {} };

      const encoded1 = parser.encode(message1);
      const encoded2 = parser.encode(message2);
      const combined = Buffer.concat([encoded1, encoded2]);

      const result = parser.decode(combined);

      expect(result).not.toBeNull();
      expect(result!.message).toEqual(message1);
      expect(result!.remaining.length).toBe(encoded2.length);
    });

    it('should throw on size exceeded', () => {
      // サイズ超過を示す長さプレフィックスを作成
      const buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(NativeMessagingConstants.MAX_MESSAGE_SIZE + 1, 0);

      expect(() => parser.decode(buffer)).toThrow(BridgeError);
      try {
        parser.decode(buffer);
      } catch (e) {
        expect((e as BridgeError).code).toBe(ErrorCodes.SIZE_EXCEEDED);
      }
    });

    it('should throw on invalid JSON', () => {
      const invalidJson = 'not valid json';
      const jsonBuffer = Buffer.from(invalidJson, 'utf8');

      const buffer = Buffer.alloc(4 + jsonBuffer.length);
      buffer.writeUInt32LE(jsonBuffer.length, 0);
      jsonBuffer.copy(buffer, 4);

      expect(() => parser.decode(buffer)).toThrow(BridgeError);
      try {
        parser.decode(buffer);
      } catch (e) {
        expect((e as BridgeError).code).toBe(ErrorCodes.PARSE_ERROR);
      }
    });
  });

  describe('decodeAll', () => {
    it('should decode multiple messages', () => {
      const messages: NativeMessage[] = [
        { type: 'msg1', payload: { n: 1 } },
        { type: 'msg2', payload: { n: 2 } },
        { type: 'msg3', payload: { n: 3 } },
      ];

      const encoded = Buffer.concat(messages.map((m) => parser.encode(m)));

      const result = parser.decodeAll(encoded);

      expect(result.messages).toEqual(messages);
      expect(result.remaining.length).toBe(0);
    });

    it('should handle partial final message', () => {
      const message1: NativeMessage = { type: 'msg1', payload: {} };
      const message2: NativeMessage = { type: 'msg2', payload: {} };

      const encoded1 = parser.encode(message1);
      const encoded2 = parser.encode(message2);
      const partial = encoded2.slice(0, 10); // 途中まで

      const combined = Buffer.concat([encoded1, partial]);

      const result = parser.decodeAll(combined);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message1);
      expect(result.remaining.length).toBe(10);
    });
  });

  describe('round-trip', () => {
    it('should encode and decode correctly', () => {
      const testCases: NativeMessage[] = [
        { type: 'simple', payload: 'string' },
        { type: 'object', payload: { nested: { deep: true } } },
        { type: 'array', payload: [1, 2, 3] },
        { type: 'unicode', payload: '日本語テスト 🎉' },
        { type: 'with-id', payload: {}, id: 'request-123' },
      ];

      for (const original of testCases) {
        const encoded = parser.encode(original);
        const result = parser.decode(encoded);

        expect(result).not.toBeNull();
        expect(result!.message).toEqual(original);
      }
    });
  });
});
