# TV OS Recovery Mode & Fault Tolerance

TV OS is designed as an appliance that never locks you out in case of a service failure, network drop, or crash.

---

## 1. Fault Tolerance Architecture

| Fault Scenario | TV OS Behavior | Recovery Action |
|---|---|---|
| **TV Shell crash** | `tvos.service` systemd supervisor automatically restarts the shell in 2 seconds. | User state (watch progress, current tab) restored from disk. |
| **PlayerService backend error** | Player status switches to `'error'` and notifies the user with a retry toast. | Audio/video element recycled without crashing shell. |
| **Ambient lighting offline** | TCP timeout is bypassed silently. | TV OS continues normal boot & playback. |
| **Network disconnected** | Network status shows `offline`. Local media and cached screens remain usable. | UI remains fully navigable. |
| **Controller disconnects** | HUD toast alerts user. Spatial focus automatically falls back to USB/Bluetooth keyboard. | Instant fallback without losing focus. |

---

## 2. Booting into Recovery Mode

If a custom configuration corrupts boot:
1. Turn on the machine and hold `Shift` or `Esc` to show GRUB.
2. Select **`TV OS (Recovery Mode / Safe Shell)`**.
3. The system boots into emergency target with root shell on `/dev/tty1`.

### Recovery Shell Commands:
```bash
# View systemd logs for TV OS
journalctl -u tvos.service -n 100 --no-pager

# Restart the TV OS appliance
systemctl restart tvos.service

# Clear user data & cached settings if corrupted
rm -rf /home/tvos/.config/tvos-launcher/

# Test audio output
speaker-test -c 2 -t wav

# Check display modes
wayland-info
```

---

## 3. Developer Emergency Escape

If locked in kiosk mode on desktop:
Press **`Ctrl + Alt + Shift + Q`** on the keyboard to trigger the emergency windowed exit.
