#!/usr/bin/env node
/**
 * Named Pipe Proxy Test Client
 * プロキシへの接続をテストするためのクライアント
 */

import * as net from 'net';
import * as os from 'os';
import * as readline from 'readline';

// Native Messaging プロトコル: 4バイト Little Endian 長さ + JSON
function encodeMessage(obj: unknown): Buffer {
  const json = JSON.stringify(obj);
  const jsonBuffer = Buffer.from(json, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(jsonBuffer.length, 0);
  return Buffer.concat([lengthBuffer, jsonBuffer]);
}

function decodeMessage(buffer: Buffer): { message: unknown; remaining: Buffer } | null {
  if (buffer.length < 4) return null;

  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return null;

  const json = buffer.slice(4, 4 + length).toString('utf8');
  const message = JSON.parse(json);
  const remaining = buffer.slice(4 + length);

  return { message, remaining };
}

async function main(): Promise<void> {
  const username = os.userInfo().username;
  const pipeName = process.argv[2] || `\\\\.\\pipe\\claude-bridge-proxy-${username}`;

  console.log(`Connecting to: ${pipeName}`);

  const socket = net.connect(pipeName);
  let buffer = Buffer.alloc(0);

  socket.on('connect', () => {
    console.log('Connected!');
    console.log('Type JSON messages to send (or "quit" to exit):');
    console.log('Example: {"type":"test","data":"hello"}');
  });

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    // メッセージをデコード
    let decoded;
    while ((decoded = decodeMessage(buffer)) !== null) {
      console.log('Received:', JSON.stringify(decoded.message, null, 2));
      buffer = decoded.remaining;
    }
  });

  socket.on('error', (err) => {
    console.error('Connection error:', err.message);
    process.exit(1);
  });

  socket.on('close', () => {
    console.log('Connection closed');
    process.exit(0);
  });

  // 対話的入力
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', (line) => {
    if (line.trim().toLowerCase() === 'quit') {
      socket.end();
      rl.close();
      return;
    }

    try {
      const obj = JSON.parse(line);
      const encoded = encodeMessage(obj);
      socket.write(encoded);
      console.log(`Sent ${encoded.length} bytes`);
    } catch (err) {
      console.error('Invalid JSON:', err instanceof Error ? err.message : 'Unknown error');
    }
  });
}

main();
