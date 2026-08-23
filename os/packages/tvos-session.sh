#!/bin/sh
# ==============================================================================
# TV OS Appliance Session Launcher
# Launches TV OS on any hardware or virtual machine
# ==============================================================================

# Clear any nested display variables
unset WAYLAND_DISPLAY
unset DISPLAY

export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=TVOS
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp/run-0}
export LIBGL_DRIVERS_PATH=/usr/lib/xorg/modules/dri:/usr/lib/dri
export LIBVA_DRIVERS_PATH=/usr/lib/dri:/usr/lib/xorg/modules/dri

mkdir -p "$XDG_RUNTIME_DIR" /run /tmp/.X11-unix /var/log /etc/X11 /var/run/dbus
chmod 700 "$XDG_RUNTIME_DIR"
chmod 1777 /tmp /tmp/.X11-unix

if [ ! -f /etc/machine-id ]; then
  echo "00000000000000000000000000000001" > /etc/machine-id
fi

APP_DIR="/opt/tvos"

echo "[tvos] 🚀 Initializing TV OS Appliance Runtime..."

# Auto-unpack TV OS rootfs payload from live boot media if not present
if [ ! -f "$APP_DIR/bin/electron" ]; then
  echo "[tvos] 📦 Locating TV OS payload from boot media..."
  mkdir -p /media/cdrom
  for dev in /dev/sr0 /dev/cdrom /dev/sda /dev/sdb /dev/vda /dev/sda1 /dev/sdb1; do
    if [ -b "$dev" ]; then
      mount -o ro "$dev" /media/cdrom 2>/dev/null || true
      if [ -f "/media/cdrom/tvos/rootfs.tar.gz" ]; then
        echo "[tvos] Unpacking payload from $dev..."
        tar -xzf /media/cdrom/tvos/rootfs.tar.gz -C /
        break
      fi
    fi
  done
  for mnt in /media/* /mnt/*; do
    if [ -f "$mnt/tvos/rootfs.tar.gz" ]; then
      echo "[tvos] Unpacking payload from $mnt..."
      tar -xzf "$mnt/tvos/rootfs.tar.gz" -C /
      break
    fi
  done
fi

chmod -R 755 /bin /sbin /usr/bin /usr/sbin /usr/libexec /lib /lib64 /usr/lib /opt/tvos 2>/dev/null || true

# Start DBus session bus
if command -v dbus-daemon >/dev/null 2>&1; then
  dbus-daemon --system --fork 2>/dev/null || true
fi

# Launch X11 Display Server on vt1
if command -v Xorg >/dev/null 2>&1; then
  echo "[tvos] 🖥️ Spawning X11 Display Server on Virtual Terminal 1..."
  if ! pgrep -x Xorg >/dev/null 2>&1; then
    Xorg :0 vt1 -ac -novtswitch -logfile /var/log/Xorg.0.log &
  fi
  export DISPLAY=:0
  
  # Wait for X11 socket to be ready
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if [ -e /tmp/.X11-unix/X0 ]; then
      echo "[tvos] ✅ X11 display server active on :0"
      break
    fi
    sleep 0.2
  done

  # Launch Openbox Window Manager if available
  if command -v openbox >/dev/null 2>&1; then
    if ! pgrep -x openbox >/dev/null 2>&1; then
      openbox &
      sleep 0.2
    fi
  fi

  echo "[tvos] 📺 Launching TV OS UI Shell on display :0..."
  while true; do
    "$APP_DIR/tvos-launcher" >> /var/log/tvos.log 2>&1 || true
    echo "[tvos] ⚠️ TV OS shell restarted, relaunching in 2s..."
    sleep 2
  done
fi

echo "[tvos] 📺 Launching TV OS UI Shell directly..."
while true; do
  "$APP_DIR/tvos-launcher" || true
  sleep 2
done
