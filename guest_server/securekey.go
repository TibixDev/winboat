package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	advapi32                  = windows.NewLazySystemDLL("advapi32.dll")
	procSetNamedSecurityInfoW = advapi32.NewProc("SetNamedSecurityInfoW")
	procSetEntriesInAclW      = advapi32.NewProc("SetEntriesInAclW")
)

const (
	// Using a protected location under HKLM
	baseRegistryPath = `SOFTWARE\WinBoatSecureStore`
)

// setSecureRegKey stores a value that only SYSTEM can modify
// Must be run as NT AUTHORITY\SYSTEM
func setSecureRegKey(k string, v string) error {
	// Open/Create the registry key first with default permissions
	key, _, err := registry.CreateKey(registry.LOCAL_MACHINE, baseRegistryPath, registry.ALL_ACCESS)
	if err != nil {
		return fmt.Errorf("failed to create registry key: %w", err)
	}
	defer key.Close()

	// Write the value
	if err := key.SetStringValue(k, v); err != nil {
		return fmt.Errorf("failed to set registry value: %w", err)
	}

	// Now lock it down - get SYSTEM SID
	systemSID, err := windows.StringToSid("S-1-5-18")
	if err != nil {
		return fmt.Errorf("failed to get SYSTEM SID: %w", err)
	}

	// Get Administrators SID
	adminsSID, err := windows.StringToSid("S-1-5-32-544")
	if err != nil {
		return fmt.Errorf("failed to get Administrators SID: %w", err)
	}

	// Get Everyone SID
	everyoneSID, err := windows.StringToSid("S-1-1-0")
	if err != nil {
		return fmt.Errorf("failed to get Everyone SID: %w", err)
	}

	// Create ACL:
	// 1. SYSTEM gets FULL CONTROL (KEY_ALL_ACCESS)
	// 2. Everyone gets READ (KEY_READ) - so your service can read it back
	// 3. Admins explicitly DENIED write access
	explicitAccess := []windows.EXPLICIT_ACCESS{
		{
			AccessPermissions: windows.KEY_ALL_ACCESS,
			AccessMode:        windows.GRANT_ACCESS,
			Inheritance:       windows.CONTAINER_INHERIT_ACE | windows.OBJECT_INHERIT_ACE,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  windows.TRUSTEE_IS_WELL_KNOWN_GROUP,
				TrusteeValue: windows.TrusteeValueFromSID(systemSID),
			},
		},
		{
			AccessPermissions: windows.KEY_READ,
			AccessMode:        windows.GRANT_ACCESS,
			Inheritance:       windows.CONTAINER_INHERIT_ACE | windows.OBJECT_INHERIT_ACE,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  windows.TRUSTEE_IS_WELL_KNOWN_GROUP,
				TrusteeValue: windows.TrusteeValueFromSID(everyoneSID),
			},
		},
		{
			AccessPermissions: windows.KEY_WRITE | windows.KEY_SET_VALUE | windows.DELETE | windows.WRITE_DAC | windows.WRITE_OWNER,
			AccessMode:        windows.DENY_ACCESS,
			Inheritance:       windows.CONTAINER_INHERIT_ACE | windows.OBJECT_INHERIT_ACE,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  windows.TRUSTEE_IS_GROUP,
				TrusteeValue: windows.TrusteeValueFromSID(adminsSID),
			},
		},
	}

	var acl *windows.ACL
	ret, _, err := procSetEntriesInAclW.Call(
		uintptr(len(explicitAccess)),
		uintptr(unsafe.Pointer(&explicitAccess[0])),
		0, // oldAcl is nil
		uintptr(unsafe.Pointer(&acl)),
	)
	if ret != 0 {
		return fmt.Errorf("failed to create ACL: %w", err)
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(acl)))

	// Apply the security descriptor to the registry key
	regPath := `MACHINE\` + baseRegistryPath
	regPathW, err := windows.UTF16PtrFromString(regPath)
	if err != nil {
		return fmt.Errorf("failed to convert path: %w", err)
	}

	ret, _, err = procSetNamedSecurityInfoW.Call(
		uintptr(unsafe.Pointer(regPathW)),
		uintptr(windows.SE_REGISTRY_KEY),
		uintptr(windows.DACL_SECURITY_INFORMATION|windows.OWNER_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION),
		uintptr(unsafe.Pointer(systemSID)),
		0,
		uintptr(unsafe.Pointer(acl)),
		0,
	)

	if ret != 0 {
		return fmt.Errorf("SetNamedSecurityInfoW failed: %w", err)
	}

	return nil
}

// getSecureRegKey retrieves a stored value
// Returns nil if the key or value doesn't exist
func getSecureRegKey(k string) (*string, error) {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, baseRegistryPath, registry.QUERY_VALUE)
	if err != nil {
		// Registry key doesn't exist yet
		if err == registry.ErrNotExist {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to open registry key: %w", err)
	}
	defer key.Close()

	value, _, err := key.GetStringValue(k)
	if err != nil {
		// Value doesn't exist
		if err == registry.ErrNotExist {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to read registry value: %w", err)
	}

	return &value, nil
}
