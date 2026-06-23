// winboat-gpu-helper — privileged helper for VFIO PCIe passthrough.
//
// This binary is invoked by the WinBoat Electron app through `pkexec` and
// runs with EUID 0. It performs *exactly one* of the following actions per
// invocation, then exits:
//
//     bind     — bind a PCI function (and optionally its IOMMU-group peers)
//                to vfio-pci, using the standard "driver_override + unbind
//                + drivers_probe" three-step dance.
//     unbind   — reverse the above: clear driver_override, unbind from
//                vfio-pci, drivers_probe back to the original driver
//                (best-effort — if the original driver was determined
//                stateless, we leave the device free for autoload).
//     status   — emit JSON describing the current driver binding of one
//                or more PCI functions. Read-only; usable by anyone, but
//                still goes through the same input validator.
//     modprobe — `modprobe vfio-pci`. Idempotent; no-op if already loaded.
//
// Why a separate binary and not just sh+sudo?
//   1. polkit policy is action-scoped: we want a single action ID that
//      grants the user the ability to bind/unbind GPUs *only* — not a
//      blanket pkexec-arbitrary-command grant.
//   2. The validator can be exhaustively unit-tested in Go, free of shell
//      quoting hazards. Any path / BDF that doesn't match the regex below
//      is refused before any privileged syscall is made.
//   3. A single static binary is trivial to ship in the .deb/.rpm next to
//      the existing guest_server.
//
// Security model — read this carefully if you're modifying this file:
//   * The polkit action defined in packaging/polkit/org.winboat.gpu-passthrough.policy
//     grants `auth_admin_keep` for action `org.winboat.gpu-passthrough.manage`.
//     pkexec sets EUID=0 and passes ALL command-line arguments through.
//   * We therefore treat argv as fully attacker-controlled and validate
//     every byte before constructing any sysfs path. The only inputs we
//     ever accept are:
//        — subcommand: one of {bind, unbind, status, modprobe}
//        — flag `--bdf=DDDD:BB:DD.F` or `BB:DD.F` (we normalise to the
//          full BDF form `0000:BB:DD.F`)
//        — flag `--include-group` (no value)
//   * We DO NOT accept paths, driver names, or anything else from the
//     caller. The driver name `vfio-pci` is hard-coded; the only sysfs
//     paths we write to are derived from a known-good BDF.
//   * All writes go through writeFile() which refuses to follow symlinks.
//   * We emit a single line of JSON to stdout per invocation so the
//     Electron side can parse the result deterministically.
//
// The matching unprivileged-side caller lives in
// src/renderer/lib/gpu/vfio.ts.

package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
)

const (
	// Sysfs roots. Hard-coded so a malicious argv can't redirect us.
	pciDevicesRoot   = "/sys/bus/pci/devices"
	pciDriversRoot   = "/sys/bus/pci/drivers"
	pciDriversProbe  = "/sys/bus/pci/drivers_probe"
	iommuGroupsDir   = "/sys/kernel/iommu_groups"
	vfioDriverName   = "vfio-pci"
)

// BDF format we accept on the wire. We allow either the short `BB:DD.F`
// form OR the full `DDDD:BB:DD.F` form. After validation we always
// normalise to the full form with a "0000" domain prefix where missing.
//
// References:
//   - "PCI bus addressing in Linux":
//     https://wiki.xenproject.org/wiki/Bus:Device.Function_(BDF)_Notation
//   - sysfs layout: /sys/bus/pci/devices/<full-BDF>/...
var bdfRegex = regexp.MustCompile(`^(?:([0-9a-fA-F]{4}):)?([0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-7])$`)

type response struct {
	OK        bool              `json:"ok"`
	Action    string            `json:"action"`
	BDF       string            `json:"bdf,omitempty"`
	Affected  []string          `json:"affected,omitempty"`
	Drivers   map[string]string `json:"drivers,omitempty"`
	Error     string            `json:"error,omitempty"`
	HelperVer string            `json:"helper_version"`
}

// helperVersion is overridden at build time via -ldflags
// "-X main.helperVersion=...". Defaults to "dev" for local builds.
var helperVersion = "dev"

func main() {
	if len(os.Args) < 2 {
		emitErr("missing subcommand", "")
		os.Exit(2)
	}

	sub := os.Args[1]
	args := os.Args[2:]

	switch sub {
	case "bind":
		runBind(args)
	case "unbind":
		runUnbind(args)
	case "status":
		runStatus(args)
	case "modprobe":
		runModprobe()
	case "--version", "-v":
		fmt.Println(helperVersion)
	default:
		emitErr(fmt.Sprintf("unknown subcommand: %q", sub), "")
		os.Exit(2)
	}
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

// normaliseBDF validates `raw` against `bdfRegex` and returns the canonical
// "DDDD:BB:DD.F" form (lower-case hex, leading zero domain).
func normaliseBDF(raw string) (string, error) {
	m := bdfRegex.FindStringSubmatch(strings.TrimSpace(raw))
	if m == nil {
		return "", fmt.Errorf("invalid BDF %q (expected [DDDD:]BB:DD.F)", raw)
	}
	domain := m[1]
	if domain == "" {
		domain = "0000"
	}
	return strings.ToLower(fmt.Sprintf("%s:%s:%s.%s", domain, m[2], m[3], m[4])), nil
}

// deviceDir returns the sysfs directory for `bdf` and confirms it exists
// before returning. The path is constructed from the validated BDF only;
// callers cannot point us at arbitrary directories.
func deviceDir(bdf string) (string, error) {
	p := filepath.Join(pciDevicesRoot, bdf)
	fi, err := os.Lstat(p)
	if err != nil {
		return "", fmt.Errorf("device %s not found in sysfs: %w", bdf, err)
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		// Kernel-managed sysfs entries ARE symlinks (pci0000:00/...). The
		// directory we end up reading is still under /sys/bus/pci/devices
		// because the kernel populates it. We only refuse to FOLLOW
		// symlinks for *writes* (see writeFile below), where we want the
		// canonical path to live inside /sys.
		// Sanity: resolve and verify the target stays under /sys.
		resolved, rerr := filepath.EvalSymlinks(p)
		if rerr != nil {
			return "", fmt.Errorf("evalsymlinks(%s): %w", p, rerr)
		}
		if !strings.HasPrefix(resolved, "/sys/") {
			return "", fmt.Errorf("device path %s escapes /sys", resolved)
		}
	}
	return p, nil
}

// ---------------------------------------------------------------------------
// File I/O helpers — never follow symlinks for writes
// ---------------------------------------------------------------------------

// writeFile opens `path` with O_WRONLY|O_NOFOLLOW so a symlink swap can't
// trick us into writing to an attacker-chosen file. sysfs attribute files
// are never symlinks themselves, so this is purely defensive.
func writeFile(path, contents string) error {
	f, err := os.OpenFile(path, os.O_WRONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	if _, err := f.WriteString(contents); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func readFileTrim(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}

// currentDriver returns the basename of the driver bound to `bdf`, or "" if
// the device is currently unbound. errors.Is(err, os.ErrNotExist) signals
// "unbound" (the `driver` symlink simply doesn't exist).
func currentDriver(bdf string) (string, error) {
	link, err := os.Readlink(filepath.Join(pciDevicesRoot, bdf, "driver"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	return filepath.Base(link), nil
}

// iommuGroupOf returns the integer group number of `bdf`. Group -1 means
// "no IOMMU active for this device".
func iommuGroupOf(bdf string) (int, error) {
	link, err := os.Readlink(filepath.Join(pciDevicesRoot, bdf, "iommu_group"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return -1, nil
		}
		return -1, err
	}
	// The link points at /sys/kernel/iommu_groups/<N>
	var n int
	if _, err := fmt.Sscanf(filepath.Base(link), "%d", &n); err != nil {
		return -1, fmt.Errorf("parse iommu_group link %q: %w", link, err)
	}
	return n, nil
}

// iommuGroupMembers lists all BDFs that share an IOMMU group with `bdf`.
// Includes `bdf` itself. Returns just [bdf] if IOMMU is inactive.
func iommuGroupMembers(bdf string) ([]string, error) {
	grp, err := iommuGroupOf(bdf)
	if err != nil {
		return nil, err
	}
	if grp < 0 {
		return []string{bdf}, nil
	}
	dir := filepath.Join(iommuGroupsDir, fmt.Sprintf("%d", grp), "devices")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read iommu group %d: %w", grp, err)
	}
	members := make([]string, 0, len(entries))
	for _, e := range entries {
		members = append(members, e.Name())
	}
	return members, nil
}

// ---------------------------------------------------------------------------
// Driver bind/unbind primitives
// ---------------------------------------------------------------------------

// bindOne performs the canonical 3-step rebind of `bdf` to vfio-pci.
//
//	echo vfio-pci          > /sys/bus/pci/devices/<bdf>/driver_override
//	echo <bdf>             > /sys/bus/pci/devices/<bdf>/driver/unbind     # if bound
//	echo <bdf>             > /sys/bus/pci/drivers_probe
//
// Source: https://docs.kernel.org/PCI/pci.html#how-to-do-rebinding
//
// driver_override is the only race-free way to force a specific driver to
// claim a device. The older `new_id` approach matches by vendor:device and
// thus would also grab any other GPU with the same IDs, which we don't want.
func bindOne(bdf string) error {
	devDir, err := deviceDir(bdf)
	if err != nil {
		return err
	}
	// Step 1: stake our claim. vfio-pci will now win the next match.
	if err := writeFile(filepath.Join(devDir, "driver_override"), vfioDriverName); err != nil {
		return fmt.Errorf("set driver_override: %w", err)
	}
	// Step 2: detach the current driver (if any). Idempotent — if there's
	// no driver, the unbind file doesn't exist and we skip.
	curr, err := currentDriver(bdf)
	if err != nil {
		return fmt.Errorf("read current driver: %w", err)
	}
	if curr != "" && curr != vfioDriverName {
		unbindPath := filepath.Join(pciDriversRoot, curr, "unbind")
		if err := writeFile(unbindPath, bdf); err != nil {
			// "no such device" here means the unbind raced with us; not fatal.
			if !errors.Is(err, os.ErrNotExist) {
				return fmt.Errorf("unbind from %s: %w", curr, err)
			}
		}
	}
	// Step 3: ask the bus to re-probe — vfio-pci will now bind.
	if err := writeFile(pciDriversProbe, bdf); err != nil {
		return fmt.Errorf("drivers_probe: %w", err)
	}
	return nil
}

// unbindOne reverses bindOne. We clear driver_override and unbind from
// vfio-pci, then trigger a re-probe so the original driver (if its module
// is still loaded) reclaims the device.
//
// We deliberately do NOT modprobe the original driver here — that decision
// belongs to the orchestrator (Phase 1.5) which knows whether the user
// wants the host to reuse the GPU at all.
func unbindOne(bdf string) error {
	devDir, err := deviceDir(bdf)
	if err != nil {
		return err
	}
	// Empty string clears driver_override. The kernel documents an
	// alternative of writing a single newline, but the empty-string form
	// is more widely supported and equally well-defined.
	if err := writeFile(filepath.Join(devDir, "driver_override"), ""); err != nil {
		return fmt.Errorf("clear driver_override: %w", err)
	}
	curr, err := currentDriver(bdf)
	if err != nil {
		return fmt.Errorf("read current driver: %w", err)
	}
	if curr == vfioDriverName {
		unbindPath := filepath.Join(pciDriversRoot, vfioDriverName, "unbind")
		if err := writeFile(unbindPath, bdf); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("unbind from vfio-pci: %w", err)
		}
	}
	if err := writeFile(pciDriversProbe, bdf); err != nil {
		return fmt.Errorf("drivers_probe: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

func parseFlags(args []string) (bdf string, includeGroup bool, err error) {
	fs := flag.NewFlagSet("", flag.ContinueOnError)
	// Silence the default usage so we own our error output.
	fs.SetOutput(devNull{})
	fs.StringVar(&bdf, "bdf", "", "PCI BDF")
	fs.BoolVar(&includeGroup, "include-group", false, "operate on all IOMMU group members")
	if err = fs.Parse(args); err != nil {
		return "", false, err
	}
	if bdf == "" {
		return "", false, errors.New("missing --bdf")
	}
	bdf, err = normaliseBDF(bdf)
	if err != nil {
		return "", false, err
	}
	return bdf, includeGroup, nil
}

func runBind(args []string) {
	bdf, includeGroup, err := parseFlags(args)
	if err != nil {
		emitErr(err.Error(), "bind")
		os.Exit(2)
	}
	targets := []string{bdf}
	if includeGroup {
		targets, err = iommuGroupMembers(bdf)
		if err != nil {
			emitErr(fmt.Sprintf("resolve group: %v", err), "bind")
			os.Exit(1)
		}
	}
	for _, t := range targets {
		// Re-validate every member — paranoid, but cheap.
		t2, verr := normaliseBDF(t)
		if verr != nil {
			emitErr(fmt.Sprintf("group member %q: %v", t, verr), "bind")
			os.Exit(1)
		}
		if err := bindOne(t2); err != nil {
			emitErr(fmt.Sprintf("bind %s: %v", t2, err), "bind")
			os.Exit(1)
		}
	}
	emitOK(response{Action: "bind", BDF: bdf, Affected: targets})
}

func runUnbind(args []string) {
	bdf, includeGroup, err := parseFlags(args)
	if err != nil {
		emitErr(err.Error(), "unbind")
		os.Exit(2)
	}
	targets := []string{bdf}
	if includeGroup {
		targets, err = iommuGroupMembers(bdf)
		if err != nil {
			emitErr(fmt.Sprintf("resolve group: %v", err), "unbind")
			os.Exit(1)
		}
	}
	for _, t := range targets {
		t2, verr := normaliseBDF(t)
		if verr != nil {
			emitErr(fmt.Sprintf("group member %q: %v", t, verr), "unbind")
			os.Exit(1)
		}
		if err := unbindOne(t2); err != nil {
			emitErr(fmt.Sprintf("unbind %s: %v", t2, err), "unbind")
			os.Exit(1)
		}
	}
	emitOK(response{Action: "unbind", BDF: bdf, Affected: targets})
}

func runStatus(args []string) {
	bdf, includeGroup, err := parseFlags(args)
	if err != nil {
		emitErr(err.Error(), "status")
		os.Exit(2)
	}
	targets := []string{bdf}
	if includeGroup {
		targets, err = iommuGroupMembers(bdf)
		if err != nil {
			emitErr(fmt.Sprintf("resolve group: %v", err), "status")
			os.Exit(1)
		}
	}
	drivers := make(map[string]string, len(targets))
	for _, t := range targets {
		t2, verr := normaliseBDF(t)
		if verr != nil {
			emitErr(fmt.Sprintf("group member %q: %v", t, verr), "status")
			os.Exit(1)
		}
		d, derr := currentDriver(t2)
		if derr != nil {
			emitErr(fmt.Sprintf("read driver %s: %v", t2, derr), "status")
			os.Exit(1)
		}
		drivers[t2] = d
	}
	emitOK(response{Action: "status", BDF: bdf, Affected: targets, Drivers: drivers})
}

func runModprobe() {
	// We exec modprobe rather than poking /sys/module because vfio-pci has
	// kernel-side init that must complete before sysfs files like
	// /sys/bus/pci/drivers/vfio-pci/new_id are usable. modprobe returns 0
	// if the module is already loaded.
	//
	// Hard-coded path to /sbin/modprobe — pkexec sets PATH but we don't
	// trust it. Falls back to /usr/sbin if the kernel-policy path moved.
	mp := "/sbin/modprobe"
	if _, err := os.Stat(mp); errors.Is(err, os.ErrNotExist) {
		mp = "/usr/sbin/modprobe"
	}
	cmd := exec.Command(mp, vfioDriverName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		emitErr(fmt.Sprintf("modprobe vfio-pci: %v: %s", err, strings.TrimSpace(string(out))), "modprobe")
		os.Exit(1)
	}
	emitOK(response{Action: "modprobe"})
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

func emitOK(r response) {
	r.OK = true
	r.HelperVer = helperVersion
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(&r); err != nil {
		// As a last resort, dump a primitive error to stderr.
		fmt.Fprintf(os.Stderr, "emit ok failed: %v\n", err)
		os.Exit(1)
	}
}

func emitErr(msg, action string) {
	r := response{OK: false, Action: action, Error: msg, HelperVer: helperVersion}
	enc := json.NewEncoder(os.Stderr)
	_ = enc.Encode(&r)
}

// devNull discards flag.FlagSet's chatter so we can format our own errors.
type devNull struct{}

func (devNull) Write(p []byte) (int, error) { return len(p), nil }
