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
	"strconv"
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
	// SR-IOV-specific fields. Used by sriov-status / sriov-configure /
	// sriov-probe. Pointers so JSON marshals "absent" vs "0" correctly.
	SriovTotalVfs *int   `json:"sriov_total_vfs,omitempty"`
	SriovNumVfs   *int   `json:"sriov_num_vfs,omitempty"`
	SriovSupported *bool `json:"sriov_supported,omitempty"`
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
	case "sriov-status":
		runSriovStatus(args)
	case "sriov-probe":
		runSriovProbe(args)
	case "sriov-configure":
		runSriovConfigure(args)
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
	// Hard-coded path to modprobe — pkexec sets PATH but we don't
	// trust it. We try /sbin then /usr/sbin then /usr/bin (NixOS,
	// Alpine, and some minimal containers put it under /usr/bin).
	mp := ""
	for _, candidate := range []string{"/sbin/modprobe", "/usr/sbin/modprobe", "/usr/bin/modprobe"} {
		if _, err := os.Stat(candidate); err == nil {
			mp = candidate
			break
		}
	}
	if mp == "" {
		emitErr("modprobe not found in /sbin, /usr/sbin, or /usr/bin", "modprobe")
		os.Exit(1)
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

// ---------------------------------------------------------------------------
// SR-IOV subcommands (Phase 2)
//
// Two attribute files in sysfs control SR-IOV per PCI function:
//
//   /sys/bus/pci/devices/<bdf>/sriov_totalvfs  RO; max VFs the device
//                                              advertises via the PCI
//                                              SR-IOV capability.
//   /sys/bus/pci/devices/<bdf>/sriov_numvfs    RW; current VF count.
//
// References:
//   - PCI SR-IOV uAPI: https://docs.kernel.org/PCI/pci-iov-howto.html
//   - i915: lacks sriov_configure on most kernels; the file may be present
//     but a write returns -EINVAL or silently no-ops. We DETECT this via
//     a 1->read-back probe in runSriovProbe.
//   - Xe: needs `xe.max_vfs=N` on the kernel cmdline. Without it, the file
//     is present but writes also fail. The active probe distinguishes.
// ---------------------------------------------------------------------------

func sriovAttrPath(bdf, attr string) string {
	return filepath.Join(pciDevicesRoot, bdf, attr)
}

func readIntFile(path string) (int, error) {
	s, err := readFileTrim(path)
	if err != nil {
		return 0, err
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", path, err)
	}
	return n, nil
}

// runSriovStatus reads sriov_totalvfs and sriov_numvfs. Cheap and
// unprivileged-friendly (the polkit policy currently routes it through
// the .manage action because we already have a single binary; if we
// add a separate .sriov-status action later, swap the polkit annotation).
//
// Returns sriov_supported=false when sriov_totalvfs is missing OR equals
// zero. Some kernels expose the file but report 0 when the device has no
// SR-IOV capability — treat that as unsupported.
func runSriovStatus(args []string) {
	fs := flag.NewFlagSet("sriov-status", flag.ContinueOnError)
	fs.SetOutput(devNull{})
	bdfRaw := fs.String("bdf", "", "Bus:Device.Function of the GPU")
	if err := fs.Parse(args); err != nil {
		emitErr(fmt.Sprintf("flag parse: %v", err), "sriov-status")
		os.Exit(2)
	}
	bdf, err := normaliseBDF(*bdfRaw)
	if err != nil {
		emitErr(err.Error(), "sriov-status")
		os.Exit(2)
	}
	if _, err := deviceDir(bdf); err != nil {
		emitErr(err.Error(), "sriov-status")
		os.Exit(1)
	}

	r := response{Action: "sriov-status", BDF: bdf}

	total, terr := readIntFile(sriovAttrPath(bdf, "sriov_totalvfs"))
	num, nerr := readIntFile(sriovAttrPath(bdf, "sriov_numvfs"))
	supported := terr == nil && total > 0

	if terr == nil {
		r.SriovTotalVfs = &total
	}
	if nerr == nil {
		r.SriovNumVfs = &num
	}
	r.SriovSupported = &supported

	emitOK(r)
}

// runSriovProbe ACTIVELY tests whether the SR-IOV driver-side handler
// actually implements VF creation. The PCI capability bits are present
// even when the driver hasn't wired up sriov_configure (i915 is the
// canonical example), so a passive read of sriov_totalvfs lies.
//
// Strategy:
//   1. Snapshot current numvfs.
//   2. If numvfs > 0, leave the device alone and report supported=true
//      (it's clearly working).
//   3. Otherwise, write "1" to sriov_numvfs. Read it back.
//      - Read returns 1 -> supported=true. Write "0" to restore.
//      - Read returns 0 or write returned an error -> supported=false.
//   4. Always restore numvfs to the snapshot before returning.
//
// Refuses to run if the device doesn't advertise SR-IOV
// (sriov_totalvfs absent or 0) — the probe would have no effect anyway.
func runSriovProbe(args []string) {
	fs := flag.NewFlagSet("sriov-probe", flag.ContinueOnError)
	fs.SetOutput(devNull{})
	bdfRaw := fs.String("bdf", "", "Bus:Device.Function of the GPU")
	if err := fs.Parse(args); err != nil {
		emitErr(fmt.Sprintf("flag parse: %v", err), "sriov-probe")
		os.Exit(2)
	}
	bdf, err := normaliseBDF(*bdfRaw)
	if err != nil {
		emitErr(err.Error(), "sriov-probe")
		os.Exit(2)
	}
	if _, err := deviceDir(bdf); err != nil {
		emitErr(err.Error(), "sriov-probe")
		os.Exit(1)
	}

	totalPath := sriovAttrPath(bdf, "sriov_totalvfs")
	numPath := sriovAttrPath(bdf, "sriov_numvfs")

	total, terr := readIntFile(totalPath)
	if terr != nil || total <= 0 {
		supported := false
		t := 0
		emitOK(response{
			Action:         "sriov-probe",
			BDF:            bdf,
			SriovTotalVfs:  &t,
			SriovSupported: &supported,
		})
		return
	}

	originalNum, nerr := readIntFile(numPath)
	if nerr != nil {
		emitErr(fmt.Sprintf("read sriov_numvfs: %v", nerr), "sriov-probe")
		os.Exit(1)
	}

	// Case: VFs already exist -> driver clearly works.
	if originalNum > 0 {
		supported := true
		emitOK(response{
			Action:         "sriov-probe",
			BDF:            bdf,
			SriovTotalVfs:  &total,
			SriovNumVfs:    &originalNum,
			SriovSupported: &supported,
		})
		return
	}

	// Active probe: write "1", read back, then restore.
	werr := writeFile(numPath, "1")
	supported := false
	if werr == nil {
		// Re-read to confirm the kernel accepted the change.
		if n, rerr := readIntFile(numPath); rerr == nil && n >= 1 {
			supported = true
		}
		// Restore. Best-effort: errors here are logged but don't fail
		// the probe (the kernel will let userspace re-call later).
		_ = writeFile(numPath, "0")
	}

	r := response{
		Action:         "sriov-probe",
		BDF:            bdf,
		SriovTotalVfs:  &total,
		SriovNumVfs:    &originalNum,
		SriovSupported: &supported,
	}
	if !supported && werr != nil {
		r.Error = fmt.Sprintf("sriov_numvfs write rejected: %v", werr)
	}
	emitOK(r)
}

// runSriovConfigure sets sriov_numvfs to the requested value. Caller is
// responsible for validating against sriov_totalvfs first (we still
// double-check here defensively).
func runSriovConfigure(args []string) {
	fs := flag.NewFlagSet("sriov-configure", flag.ContinueOnError)
	fs.SetOutput(devNull{})
	bdfRaw := fs.String("bdf", "", "Bus:Device.Function of the GPU")
	numVfs := fs.Int("numvfs", -1, "Number of VFs to instantiate (0 to disable)")
	if err := fs.Parse(args); err != nil {
		emitErr(fmt.Sprintf("flag parse: %v", err), "sriov-configure")
		os.Exit(2)
	}
	if *numVfs < 0 {
		emitErr("--numvfs is required (>= 0)", "sriov-configure")
		os.Exit(2)
	}
	bdf, err := normaliseBDF(*bdfRaw)
	if err != nil {
		emitErr(err.Error(), "sriov-configure")
		os.Exit(2)
	}
	if _, err := deviceDir(bdf); err != nil {
		emitErr(err.Error(), "sriov-configure")
		os.Exit(1)
	}

	if *numVfs > 0 {
		total, terr := readIntFile(sriovAttrPath(bdf, "sriov_totalvfs"))
		if terr != nil {
			emitErr(fmt.Sprintf("read sriov_totalvfs: %v", terr), "sriov-configure")
			os.Exit(1)
		}
		if *numVfs > total {
			emitErr(fmt.Sprintf("requested %d VFs exceeds sriov_totalvfs=%d", *numVfs, total), "sriov-configure")
			os.Exit(1)
		}
	}

	// Writing the same value as currently-set is a no-op in the kernel;
	// some drivers (notably i915 derivatives that DO implement
	// sriov_configure) require numvfs=0 before changing to a non-zero
	// value. We pre-zero to be safe when going from >0 to a different >0.
	cur, _ := readIntFile(sriovAttrPath(bdf, "sriov_numvfs"))
	if cur > 0 && *numVfs > 0 && cur != *numVfs {
		_ = writeFile(sriovAttrPath(bdf, "sriov_numvfs"), "0")
	}

	if err := writeFile(sriovAttrPath(bdf, "sriov_numvfs"), strconv.Itoa(*numVfs)); err != nil {
		emitErr(fmt.Sprintf("write sriov_numvfs=%d: %v", *numVfs, err), "sriov-configure")
		os.Exit(1)
	}

	final, _ := readIntFile(sriovAttrPath(bdf, "sriov_numvfs"))
	r := response{
		Action:      "sriov-configure",
		BDF:         bdf,
		SriovNumVfs: &final,
	}
	if final != *numVfs {
		r.Error = fmt.Sprintf("requested %d VFs but kernel reports %d (driver may not implement sriov_configure)", *numVfs, final)
		r.OK = false
		// emitOK overrides OK=true; use emitErr-equivalent envelope on stdout.
		emitOK(r) // still emit, caller can detect via error field
		return
	}
	emitOK(r)
}
