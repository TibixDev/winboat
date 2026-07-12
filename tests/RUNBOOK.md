# WinBoat GPU passthrough — end-to-end test runbook

This runbook validates the `feat/gpu-passthrough` branch on **real hardware**.
It covers the full path from a clean Linux host through to GPU-dependent
workloads running inside the Windows guest.

The companion guest scripts live under `tests/guest/`:

- `install-test-suite.ps1` — installs benchmarks, Ollama, optionally Unreal
- `run-gpu-checks.ps1`     — runs the benchmarks, writes a PASS/FAIL summary

Both scripts are idempotent — re-running them is safe.

---

## 0. Prerequisites — host

### 0.1 Hardware

| Component | Requirement |
| --- | --- |
| CPU | Intel VT-x + VT-d, or AMD-V + AMD-Vi |
| GPU | One of: dedicated AMD/NVIDIA card for full PCIe passthrough, *or* Intel Xe / Arc / Battlemage iGPU for SR-IOV |
| RAM | ≥ 16 GB (8 GB host + 8 GB guest minimum) |
| Storage | ≥ 80 GB free for Windows + Unreal |

### 0.2 BIOS / UEFI

Enable **all** of the following — names vary by vendor:

- Intel VT-d / AMD-Vi / IOMMU
- Above 4G Decoding
- Resize BAR (recommended; required for some dGPUs)
- Disable CSM / enable UEFI-only boot

### 0.3 Kernel cmdline

Add the appropriate flags to `/etc/default/grub` `GRUB_CMDLINE_LINUX_DEFAULT`,
then run `sudo update-grub` (Ubuntu/Zorin/Debian) or
`sudo grub2-mkconfig -o /boot/grub2/grub.cfg` (Fedora):

```text
# Always
intel_iommu=on iommu=pt
# (AMD)
amd_iommu=on iommu=pt
# Intel Xe / Arc SR-IOV — set VF count up front (Phase 2)
xe.max_vfs=7
# Optional: bind GPU to vfio-pci at boot instead of dynamically
vfio-pci.ids=10de:1c82,10de:0fb9
```

Reboot. Verify:

```bash
dmesg | grep -e DMAR -e IOMMU
# expect: "DMAR: IOMMU enabled" (Intel) or "AMD-Vi: Lazy IO/TLB flushing enabled"
ls /sys/kernel/iommu_groups/ | wc -l
# expect > 1
```

### 0.4 WinBoat with GPU passthrough branch

```bash
git clone https://github.com/TibixDev/winboat.git
cd winboat
git fetch origin feat/gpu-passthrough
git checkout feat/gpu-passthrough
npm install
npm run build:gpu-helper           # builds gpu_helper static binary
npm run build                      # production build
```

The build script lands `winboat-gpu-helper` at
`resources/winboat-gpu-helper` ready for the polkit installer to copy on
first launch. (The polkit policy is installed under `/usr/share/polkit-1/
actions/winboat-gpu-helper.policy` when WinBoat first attempts a GPU
operation.)

---

## 1. First-run: detect + configure

Launch WinBoat. The setup wizard remains a single quick page; do **not**
expect a new GPU screen (design constraint — wizard stays simple).

After setup:

1. Open **Settings → Advanced → GPU passthrough**.
2. The Config panel shows host-side eligibility:
   - IOMMU enabled / disabled
   - per-GPU rows with vendor, BDF, driver, IOMMU group
3. Pick a GPU and a mode:
   - **VFIO** for dedicated AMD/NVIDIA cards
   - **SR-IOV** for Intel Xe / Arc iGPUs (Phase 2)
   - **mvisor-VGPU** — stubbed (Phase 3), not selectable yet
4. Save settings. WinBoat will:
   - run the polkit installer once (you will get a `pkexec` password prompt
     — the helper is verified by exec.path policy)
   - mutate the compose file with the appropriate QEMU args
   - on next container start, bind the GPU and inject `vfio-pci-nohotplug`

### 1.1 Sanity-check host bind

After saving with VFIO mode but before starting the guest:

```bash
# the BDF you picked
BDF=0000:01:00.0
ls -l /sys/bus/pci/devices/$BDF/driver       # should be -> /sys/bus/pci/drivers/vfio-pci
cat /sys/bus/pci/devices/$BDF/driver_override # should be: vfio-pci
ls /dev/vfio/                                # one entry per IOMMU group + "vfio"
```

For SR-IOV, before starting the guest:

```bash
cat /sys/bus/pci/devices/$BDF/sriov_totalvfs   # > 0 means card supports it
cat /sys/bus/pci/devices/$BDF/sriov_numvfs     # should equal what you configured
ls /sys/bus/pci/devices/$BDF/virtfn*           # VF symlinks
```

---

## 2. Start guest

From the WinBoat tray icon or main UI, hit **Start**. Watch the log file:

```bash
tail -F ~/.config/winboat/logs/winboat.log
```

Look for the markers `GPU passthrough:` — they indicate which branch of
`applyGpuPassthroughIfEnabled` fired:

| Log line | Meaning |
| --- | --- |
| `disabled` | GPU passthrough is off |
| `no-device` | No eligible GPU found |
| `compose-updated` | Compose was mutated, container restarted by replaceCompose |
| `bind-failed` | Driver-override / modprobe / SR-IOV configure failed; see `cause` |
| `ineligible` | IOMMU disabled or device not viable |

If you see `bind-failed`, **stop here** and check
`/sys/bus/pci/devices/$BDF/`. Common causes:

- IOMMU group contains other essential devices (e.g. SATA controller)
- Card is already bound to nvidia/amdgpu — give it back, then retry with
  `dynamic-unbind` option enabled in Settings
- SR-IOV silent-noop: i915 (gen ≤ Tiger Lake) does not support
  `sriov_numvfs`. Switch to the Xe driver (gen ≥ 12.5 Alder Lake / Arc) and
  add `xe.max_vfs=N` to the kernel cmdline.

---

## 3. Inside the guest — install test suite

Inside Windows (you can open an elevated PowerShell from the Windows Start
menu — the WinBoat clipboard share lets you paste these commands):

```powershell
# Copy the test scripts from the shared drive (WinBoat exposes
# the host workspace under \\tsclient\home\ when run over RDP).
mkdir C:\WinBoatTests -Force
copy \\tsclient\home\<your-user>\workspace\winboat\tests\guest\*.ps1 C:\WinBoatTests\
cd C:\WinBoatTests
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\install-test-suite.ps1            # default
# or:
.\install-test-suite.ps1 -Full      # add Unreal + 3DMark
```

The installer is idempotent and prints `[OK] / [SKIP] / [ERR]` per
component. Expected total time: 5–10 min default, 30+ min with `-Full`
(Unreal Engine 5 is ~80 GB after Epic Games Launcher pulls it).

---

## 4. Inside the guest — run checks

```powershell
cd C:\WinBoatTests
.\run-gpu-checks.ps1                # full
.\run-gpu-checks.ps1 -Quick         # skip Heaven (~3 min saved)
```

Output lands in `C:\WinBoatTests\results-<timestamp>\` with a
`summary.md` the host can grep:

```bash
# from the host
cat ~/.local/share/winboat/shared/WinBoatTests/results-*/summary.md
```

### 4.1 PASS criteria

| Check | Threshold | Why |
| --- | --- | --- |
| GPU enumeration | Real PCI device, not "Basic Display Adapter" | Confirms passthrough device visible |
| dxdiag DDI | ≥ 12 | Confirms D3D12 path is live |
| glmark2 | ≥ 500 | Sanity — anything < 500 means software rendering |
| vkmark | ≥ 500 | Confirms Vulkan loader sees the GPU |
| Heaven (full) | ≥ 20 avg FPS at 1280×720 preset 2 | Real DX11 sustained workload |
| Ollama qwen2.5:1.5b | ≥ 30 tok/s eval rate | CPU-only baseline is ~15 tok/s, so >30 confirms GPU acceleration |

If **any** check below threshold: collect the per-file output under
`results-<timestamp>/` and the host log
`~/.config/winboat/logs/winboat.log`, and open an issue with both.

---

## 5. Optional — real games & Unreal Engine

After `.\install-test-suite.ps1 -Full`:

1. Sign into Epic Games Launcher (manual; out of scope for automation).
2. Click **Unreal Engine → Library → +** → install UE 5.x. ~80 GB.
3. Launch any sample project. Watch the "Stat Unit" overlay (`stat unit`
   console command in PIE) — GPU frame time should be < 16 ms at 1080p on
   a passed-through mid-range GPU.

For raw games: install via Steam (winget id `Valve.Steam`) and try a
DX12 title. Pass criteria is subjective ("smooth at native res") — there
is no automation threshold for game tests.

---

## 6. Stop guest — verify clean release

```bash
# In WinBoat UI: Stop
# Then on host:
ls -l /sys/bus/pci/devices/$BDF/driver
# VFIO mode + dynamic unbind ON:  should be back to original (nvidia/amdgpu)
# VFIO mode + dynamic unbind OFF: should still be vfio-pci (intentional;
#                                  bind survives across container restarts)
```

For SR-IOV: VFs persist until reboot or until you manually `echo 0 >
sriov_numvfs`. WinBoat does **not** auto-tear-down SR-IOV (Phase 2 design;
Phase 4 may add it).

---

## 7. Reporting results

When opening a PR comment or issue with results, include:

- Host distro + kernel: `uname -a`, `cat /etc/os-release`
- GPU: `lspci -nnk -d ::0300` (the line for your card)
- IOMMU groups: `for d in /sys/kernel/iommu_groups/*/devices/*; do n="${d##*/iommu_groups/}"; echo "Group ${n%%/*}: $(lspci -s "${d##*/}")"; done`
- WinBoat log: `~/.config/winboat/logs/winboat.log` (last 200 lines)
- Guest summary: `results-<timestamp>/summary.md`
- Per-check raw outputs if any failed: `results-<timestamp>/0[1-6]-*.{txt,json}`

---

## Appendix A — Troubleshooting matrix

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `bind-failed: modprobe vfio-pci` | vfio-pci not in kernel | `sudo apt install linux-modules-extra-$(uname -r)` |
| `bind-failed: write driver_override` | Selinux / AppArmor denied | Check `dmesg \| grep DENIED`; the AppArmor profile shipped by the .deb covers this — AppImage users must run with `--disable-gpu-sandbox` |
| Container starts but guest shows "Basic Display Adapter" | x-vga not applied | Confirm host BIOS Resize BAR + Above 4G; check QEMU log inside container |
| Heaven crashes | DX11 runtime missing | Install KB4019990 / DirectX June 2010 redist inside guest |
| Ollama < 30 tok/s | GPU not picked up by llama.cpp | Set `OLLAMA_GPU_OVERHEAD=1024` env in guest; check `ollama ps` shows VRAM use |
| SR-IOV `silent-noop` | i915 driver | Boot with Xe driver: `i915.force_probe=! xe.force_probe=*` in kernel cmdline |

## Appendix B — Source references

- VFIO kernel docs: <https://docs.kernel.org/driver-api/vfio.html>
- SR-IOV howto: <https://docs.kernel.org/PCI/pci-iov-howto.html>
- Intel Xe SR-IOV: <https://www.kernel.org/doc/html/latest/gpu/xe/xe_sriov.html>
- QEMU vfio-pci-nohotplug: <https://www.qemu.org/docs/master/system/devices/vfio.html>
- xfreerdp3(1): <https://man.archlinux.org/man/extra/freerdp/xfreerdp3.1.en>
- polkit pkexec: <https://www.freedesktop.org/software/polkit/docs/latest/pkexec.1.html>
