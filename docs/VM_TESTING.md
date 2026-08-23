# TV OS Virtual Machine Testing Guide

This guide explains how to boot and test `TVOS-x86_64.iso` inside a virtual machine without rebooting your computer.

---

## 1. Quick Launch (QEMU / KVM)

Run the automated VM test command:
```bash
npm run run:vm
```
This executes `./os/build/build-vm.sh`, which configures:
- **RAM**: 4096 MB
- **SMP**: 4 CPU cores
- **Graphics**: `virtio-gpu` with modesetting
- **Display**: 1920×1080 10-foot TV UI
- **Audio**: Intel HDA duplex audio pipe
- **Network**: Virtual NAT interface
- **Input**: USB Tablet / Controller bridge

---

## 2. Testing in VirtualBox or VMware

1. Create a new 64-bit Linux VM (Ubuntu/Debian 64-bit).
2. Assign at least 4 GB RAM and 2–4 CPU cores.
3. Attach `dist/images/TVOS-x86_64.iso` to the virtual CD/DVD drive.
4. Enable **EFI** in System Settings if testing UEFI boot.
5. Enable **3D Hardware Acceleration** under Display Settings.
6. Power on the VM.

---

## 3. Developer Shortcuts & Exit Controls

Inside the running TV OS VM:
- **`Ctrl + Alt + Shift + Q`**: Developer Escape Sequence (exits fullscreen/kiosk or quits shell).
- **`F11`**: Toggle borderless fullscreen / windowed mode.
- **`F12`**: Toggle Chromium Developer Tools.
- **`Xbox Menu Button (or 'm')`**: Opens Quick Settings overlay.
- **`Xbox View Button (or 'y' / '/')`**: Opens Global Search.
- **`Xbox A (or 'Enter')`**: Select / Confirm.
- **`Xbox B (or 'Esc')`**: Back / Exit Player to PiP.
