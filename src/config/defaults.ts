/**
 * デフォルト設定
 */

import { BridgeConfig } from './schema';

/**
 * デフォルト設定値
 */
export const DEFAULT_CONFIG: BridgeConfig = {
  target: 'auto',
  fallback: {
    enabled: true,
    order: ['cli', 'desktop'],
  },
  timeouts: {
    connection: 5000,
    healthCheck: 2000,
    reconnect: 1000,
  },
  detection: {
    interval: 5000,
    cacheTtl: 3000,
  },
};

/**
 * 設定をマージ（部分設定を完全な設定に）
 */
export function mergeConfig(
  base: BridgeConfig,
  partial: Partial<BridgeConfig>
): BridgeConfig {
  return {
    target: partial.target ?? base.target,
    fallback: {
      enabled: partial.fallback?.enabled ?? base.fallback.enabled,
      order: partial.fallback?.order ?? base.fallback.order,
    },
    timeouts: {
      connection: partial.timeouts?.connection ?? base.timeouts.connection,
      healthCheck: partial.timeouts?.healthCheck ?? base.timeouts.healthCheck,
      reconnect: partial.timeouts?.reconnect ?? base.timeouts.reconnect,
    },
    detection: {
      interval: partial.detection?.interval ?? base.detection.interval,
      cacheTtl: partial.detection?.cacheTtl ?? base.detection.cacheTtl,
    },
    advanced: partial.advanced ?? base.advanced,
  };
}
