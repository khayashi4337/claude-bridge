/**
 * 設定バリデーション
 */

import { BridgeConfig } from './schema';
import { BridgeError, ErrorCodes } from '../types';

/**
 * バリデーションエラー
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 設定をバリデート
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Config must be an object' }] };
  }

  const c = config as Record<string, unknown>;

  // target
  if (c.target !== undefined) {
    if (!['auto', 'desktop', 'cli'].includes(c.target as string)) {
      errors.push({ path: 'target', message: 'Must be "auto", "desktop", or "cli"' });
    }
  }

  // fallback
  if (c.fallback !== undefined) {
    if (typeof c.fallback !== 'object') {
      errors.push({ path: 'fallback', message: 'Must be an object' });
    } else {
      const fb = c.fallback as Record<string, unknown>;

      if (fb.enabled !== undefined && typeof fb.enabled !== 'boolean') {
        errors.push({ path: 'fallback.enabled', message: 'Must be a boolean' });
      }

      if (fb.order !== undefined) {
        if (!Array.isArray(fb.order)) {
          errors.push({ path: 'fallback.order', message: 'Must be an array' });
        } else if (!fb.order.every((t) => ['desktop', 'cli'].includes(t as string))) {
          errors.push({ path: 'fallback.order', message: 'Must contain only "desktop" or "cli"' });
        }
      }
    }
  }

  // timeouts
  if (c.timeouts !== undefined) {
    if (typeof c.timeouts !== 'object') {
      errors.push({ path: 'timeouts', message: 'Must be an object' });
    } else {
      const t = c.timeouts as Record<string, unknown>;
      for (const key of ['connection', 'healthCheck', 'reconnect']) {
        if (t[key] !== undefined && (typeof t[key] !== 'number' || (t[key] as number) < 0)) {
          errors.push({ path: `timeouts.${key}`, message: 'Must be a non-negative number' });
        }
      }
    }
  }

  // detection
  if (c.detection !== undefined) {
    if (typeof c.detection !== 'object') {
      errors.push({ path: 'detection', message: 'Must be an object' });
    } else {
      const d = c.detection as Record<string, unknown>;
      for (const key of ['interval', 'cacheTtl']) {
        if (d[key] !== undefined && (typeof d[key] !== 'number' || (d[key] as number) < 0)) {
          errors.push({ path: `detection.${key}`, message: 'Must be a non-negative number' });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * バリデーションエラーを BridgeError に変換
 */
export function toConfigError(result: ValidationResult): BridgeError {
  const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
  return new BridgeError(
    `Invalid configuration: ${messages}`,
    ErrorCodes.CONFIG_INVALID,
    true
  );
}

/**
 * 設定をバリデートし、エラーがあればスロー
 */
export function assertValidConfig(config: unknown): asserts config is Partial<BridgeConfig> {
  const result = validateConfig(config);
  if (!result.valid) {
    throw toConfigError(result);
  }
}
