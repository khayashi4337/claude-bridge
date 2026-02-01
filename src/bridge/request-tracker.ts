/**
 * Request Tracker
 *
 * リクエスト/レスポンスの対応付けを管理
 */

import { NativeMessage } from '../types';

/**
 * 追跡中のリクエスト
 */
interface PendingRequest {
  /** リクエストメッセージ */
  request: NativeMessage;
  /** タイムスタンプ */
  timestamp: number;
  /** 解決コールバック */
  resolve: (response: NativeMessage) => void;
  /** 拒否コールバック */
  reject: (error: Error) => void;
}

/**
 * リクエストトラッカー
 *
 * リクエストIDに基づいてリクエスト/レスポンスを対応付け
 */
export class RequestTracker {
  private pending = new Map<string, PendingRequest>();
  private idCounter = 0;

  /**
   * 新しいリクエストIDを生成
   */
  generateId(): string {
    this.idCounter += 1;
    return `req-${Date.now()}-${this.idCounter}`;
  }

  /**
   * リクエストを追跡開始
   */
  track(request: NativeMessage, timeout: number = 30000): Promise<NativeMessage> {
    const id = request.id || this.generateId();

    // IDを付与
    if (!request.id) {
      request.id = id;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${id}`));
      }, timeout);

      this.pending.set(id, {
        request,
        timestamp: Date.now(),
        resolve: (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  /**
   * レスポンスを解決
   */
  resolve(response: NativeMessage): boolean {
    const id = response.id;
    if (!id) {
      return false;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return false;
    }

    this.pending.delete(id);
    pending.resolve(response);
    return true;
  }

  /**
   * リクエストをキャンセル
   */
  cancel(id: string, error: Error): boolean {
    const pending = this.pending.get(id);
    if (!pending) {
      return false;
    }

    this.pending.delete(id);
    pending.reject(error);
    return true;
  }

  /**
   * すべてのリクエストをキャンセル
   */
  cancelAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  /**
   * 追跡中のリクエスト数
   */
  get size(): number {
    return this.pending.size;
  }

  /**
   * 追跡中かどうか
   */
  has(id: string): boolean {
    return this.pending.has(id);
  }
}
