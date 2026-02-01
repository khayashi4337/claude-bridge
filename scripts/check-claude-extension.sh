#!/bin/bash
# Chrome Extension Status Checker
# 対象: Claude in Chrome (fcoeoabgfenejglbffodgkkbkcdhcgfn)
# Profile: Profile 1

EXTENSION_ID="fcoeoabgfenejglbffodgkkbkcdhcgfn"
EXTENSION_NAME="Claude in Chrome"
PROFILE="Profile 1"
# Windows と Unix 両対応
if [ -n "$LOCALAPPDATA" ]; then
    CHROME_USER_DATA="$LOCALAPPDATA/Google/Chrome/User Data"
else
    CHROME_USER_DATA="$HOME/AppData/Local/Google/Chrome/User Data"
fi
PREFS_PATH="$CHROME_USER_DATA/${PROFILE}/Secure Preferences"

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================="
echo "Chrome Extension Status Checker"
echo "=================================="
echo "Extension: ${EXTENSION_NAME}"
echo "ID: ${EXTENSION_ID}"
echo "Profile: ${PROFILE}"
echo "----------------------------------"

# ファイル存在確認
if [ ! -f "$PREFS_PATH" ]; then
    echo -e "${RED}ERROR: Preferences file not found${NC}"
    echo "Path: $PREFS_PATH"
    exit 1
fi

# 拡張機能データ取得
EXT_DATA=$(cat "$PREFS_PATH" 2>/dev/null | jq --arg ext "$EXTENSION_ID" '.extensions.settings[$ext]' 2>/dev/null)

if [ "$EXT_DATA" = "null" ] || [ -z "$EXT_DATA" ]; then
    echo -e "${RED}STATUS: NOT INSTALLED${NC}"
    echo "拡張機能がインストールされていません"
    exit 2
fi

# disable_reasons チェック
DISABLE_REASONS=$(echo "$EXT_DATA" | jq '.disable_reasons' 2>/dev/null)

if [ "$DISABLE_REASONS" = "null" ] || [ "$DISABLE_REASONS" = "[]" ]; then
    echo -e "${GREEN}STATUS: ENABLED ✅${NC}"
    VERSION=$(echo "$EXT_DATA" | jq -r '.manifest.version' 2>/dev/null)
    echo "Version: ${VERSION}"
    exit 0
else
    echo -e "${RED}STATUS: DISABLED ❌${NC}"
    echo "disable_reasons: ${DISABLE_REASONS}"
    echo ""
    echo "拡張機能を有効化してください:"
    echo "  chrome://extensions/?id=${EXTENSION_ID}"
    exit 3
fi
