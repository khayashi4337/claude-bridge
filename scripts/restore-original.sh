#!/bin/bash
# 元の Desktop Native Host に戻す

# ユーザーのホームディレクトリを使用
APPDATA="${APPDATA:-$HOME/AppData/Roaming}"
BACKUP="$APPDATA/claude-bridge/backup/original-manifest.json"
TARGET="$APPDATA/Claude/ChromeNativeHost/com.anthropic.claude_browser_extension.json"

if [ -f "$BACKUP" ]; then
  cp "$BACKUP" "$TARGET"
  echo "✅ 復元完了: Desktop Native Host に戻しました"
  echo "⚠️  Chrome を再起動してください"
else
  echo "❌ バックアップが見つかりません: $BACKUP"
  exit 1
fi
