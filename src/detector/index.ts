/**
 * Detector モジュール
 */

import { IpcConnector } from '../types';
import { BridgeConfig } from '../config';
import { ProcessDetector } from './detector';
import { WindowsDetector } from './windows';
import { DarwinDetector } from './darwin';

export * from './types';
export * from './detector';
export * from './windows';
export * from './darwin';

/**
 * 現在の OS に対応した Detector を作成
 */
export function createDetector(
  connector: IpcConnector,
  config: BridgeConfig
): ProcessDetector {
  if (process.platform === 'win32') {
    return new WindowsDetector(connector, config);
  } else if (process.platform === 'darwin') {
    return new DarwinDetector(connector, config);
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
