#!/bin/bash
# 元の Desktop Native Host に戻す

BACKUP="/c/Users/kh/AppData/Roaming/claude-bridge/backup/original-manifest.json"
TARGET="/c/Users/kh/AppData/Roaming/Claude/ChromeNativeHost/com.anthropic.claude_browser_extension.json"

if [ -f "$BACKUP" ]; then
  cp "$BACKUP" "$TARGET"
  echo "✅ 復元完了: Desktop Native Host に戻しました"
  echo "⚠️  Chrome を再起動してください"
else
  echo "❌ バックアップが見つかりません: $BACKUP"
  exit 1
fi
