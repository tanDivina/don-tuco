#!/bin/bash
# Record the real WhatsApp conversation with Don Tuco for the demo video.
#
# Before running:
#   1. Plug the phone in via USB (USB debugging on, screen unlocked).
#   2. Open WhatsApp on the chat with Don Tuco (+1 414 261 7820).
#      Tip: clear the chat first so the thread starts clean on camera.
#   3. Run this script, then act out the conversation on the phone.
#      Stop with Ctrl+C here or by closing the scrcpy window.
#
# Audio: scrcpy forwards the phone's audio into the recording (Android 11+),
# so any audio in the chat is captured. While mirroring, the phone itself
# plays silently - the sound is in the file, not the speaker. If the voice
# note audio is missing afterwards, pull the real .opus and lay it under
# the video in the edit:
#   adb shell ls "/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Voice Notes/"
set -e
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"

OUT="$HOME/Desktop/DonTuco_Video/personal/whatsapp_demo.mkv"
[ -f "$OUT" ] && mv "$OUT" "${OUT%.mkv}-$(date +%H%M%S).mkv"  # keep earlier takes
mkdir -p "$(dirname "$OUT")"

adb wait-for-device

restore() {
  adb shell cmd notification set_dnd off || true
  adb shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null || true
  echo ""
  echo "Saved: $OUT"
}
trap restore EXIT

# Clean status bar: fixed clock, full battery, no notification icons
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0910 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi -e wifi show -e level 4 >/dev/null

# No popups over the chat mid-take
adb shell cmd notification set_dnd on

echo "Recording to $OUT"
echo "Do the conversation on the phone now. Ctrl+C when done."
scrcpy --record "$OUT" --record-format mkv --max-fps 30 --stay-awake
