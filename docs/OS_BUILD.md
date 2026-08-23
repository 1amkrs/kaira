# TV OS Operating System Appliance Build Guide

This guide documents the automated build pipeline for generating bootable TV OS images:
1. **`TVOS-x86_64.iso`**: Bootable hybrid UEFI/BIOS ISO for PC/Laptop/VM development and living room PC appliances.
2. **`TVOS-aarch64.img`**: Bootable flashable microSD image for **Raspberry Pi 5**.

---

## 1. Architecture Overview

```
                         TV OS Codebase
                               │
                 npm run build (Vite & TypeScript)
                               │
                Electron TV Shell Wayland Bundle
                               │
          ┌────────────────────┴────────────────────┐
          ▼                                         ▼
   x86_64 Live-Build                         Raspberry Pi 5
(Debian Base + Cage Kiosk)             (RPi Kernel + VideoCore VII)
          │                                         │
          ▼                                         ▼
 dist/images/TVOS-x86_64.iso              dist/images/TVOS-aarch64.img
```

---

## 2. Prerequisites for Image Building

Building the raw binary disk images on a Linux host requires:
```bash
sudo apt update
sudo apt install -y debootstrap xorriso squashfs-tools isolinux grub-efi-amd64-bin grub-pc-bin qemu-system-x86 qemu-utils
```

---

## 3. Building x86_64 Bootable ISO

To generate the x86_64 live bootable ISO:
```bash
npm run build:iso
```
Output:
`dist/images/TVOS-x86_64.iso`

### Flashing to USB
```bash
# Identify USB drive (e.g. /dev/sdX)
sudo dd if=dist/images/TVOS-x86_64.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

---

## 4. Building ARM64 / Raspberry Pi 5 Image

To generate the Raspberry Pi 5 appliance image:
```bash
npm run build:pi
```
Output:
`dist/images/TVOS-aarch64.img`

### Flashing to MicroSD
Flash directly using **Raspberry Pi Imager** (Choose Custom OS -> `TVOS-aarch64.img`) or using `dd`:
```bash
sudo dd if=dist/images/TVOS-aarch64.img of=/dev/sdX bs=4M status=progress conv=fsync
```

---

## 5. Automated systemd Services

The image boots automatically into the `tvos.service` systemd unit:
- **Service file**: `/etc/systemd/system/tvos.service`
- **Supervisor**: Automatic restart on crash (`Restart=always`, `RestartSec=2`).
- **Session launcher**: `/opt/tvos/os/packages/tvos-session.sh` running Cage Wayland kiosk.
