/**
 * Native Messaging Protocol メッセージパーサー
 *
 * Chrome Native Messaging のバイナリフォーマットを処理:
 * - 4byte Little Endian 長さプレフィックス
 * - UTF-8 エンコードされた JSON ペイロード
 */

import { NativeMessage, NativeMessagingConstants } from '../types';
import { BridgeError, ErrorCodes } from '../types';

const { MAX_MESSAGE_SIZE, LENGTH_PREFIX_SIZE } = NativeMessagingConstants;

/**
 * デコード結果
 */
export interface DecodeResult {
  /** デコードされたメッセージ */
  message: NativeMessage;
  /** 残りのバッファ */
  remaining: Buffer;
}

/**
 * Native Messaging メッセージパーサー
 */
export class MessageParser {
  /**
   * バイナリバッファからメッセージをデコード
   *
   * @param buffer 入力バッファ
   * @returns デコード結果、またはデータ不足の場合 null
   * @throws {BridgeError} パースエラーまたはサイズ超過
   */
  decode(buffer: Buffer): DecodeResult | null {
    // 長さプレフィックスが揃うまで待機
    if (buffer.length < LENGTH_PREFIX_SIZE) {
      return null;
    }

    // メッセージ長を読み取り (Little Endian)
    const messageLength = buffer.readUInt32LE(0);

    // サイズ超過チェック
    if (messageLength > MAX_MESSAGE_SIZE) {
      throw new BridgeError(
        `Message size ${messageLength} exceeds maximum ${MAX_MESSAGE_SIZE}`,
        ErrorCodes.SIZE_EXCEEDED,
        false
      );
    }

    // メッセージ本体が揃うまで待機
    const totalLength = LENGTH_PREFIX_SIZE + messageLength;
    if (buffer.length < totalLength) {
      return null;
    }

    // JSON をパース
    const jsonBuffer = buffer.slice(LENGTH_PREFIX_SIZE, totalLength);
    const jsonString = jsonBuffer.toString('utf8');

    let message: NativeMessage;
    try {
      message = JSON.parse(jsonString) as NativeMessage;
    } catch (error) {
      throw new BridgeError(
        `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ErrorCodes.PARSE_ERROR,
        false,
        error instanceof Error ? error : undefined
      );
    }

    // 残りのバッファを返却
    const remaining = buffer.slice(totalLength);

    return { message, remaining };
  }

  /**
   * メッセージをバイナリフォーマットにエンコード
   *
   * @param message エンコードするメッセージ
   * @returns エンコードされたバッファ
   * @throws {BridgeError} サイズ超過
   */
  encode(message: NativeMessage): Buffer {
    const jsonString = JSON.stringify(message);
    const jsonBuffer = Buffer.from(jsonString, 'utf8');

    // サイズ超過チェック
    if (jsonBuffer.length > MAX_MESSAGE_SIZE) {
      throw new BridgeError(
        `Message size ${jsonBuffer.length} exceeds maximum ${MAX_MESSAGE_SIZE}`,
        ErrorCodes.SIZE_EXCEEDED,
        false
      );
    }

    // 長さプレフィックスを作成 (Little Endian)
    const lengthBuffer = Buffer.alloc(LENGTH_PREFIX_SIZE);
    lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);

    // 結合して返却
    return Buffer.concat([lengthBuffer, jsonBuffer]);
  }

  /**
   * 複数メッセージを含むバッファからすべてのメッセージをデコード
   *
   * @param buffer 入力バッファ
   * @returns デコードされたメッセージ配列と残りのバッファ
   */
  decodeAll(buffer: Buffer): { messages: NativeMessage[]; remaining: Buffer } {
    const messages: NativeMessage[] = [];
    let currentBuffer = buffer;

    while (true) {
      const result = this.decode(currentBuffer);
      if (result === null) {
        break;
      }
      messages.push(result.message);
      currentBuffer = result.remaining;
    }

    return { messages, remaining: currentBuffer };
  }
}
