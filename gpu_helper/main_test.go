package main

import "testing"

func TestNormaliseBDF(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		// Happy paths
		{"03:00.0", "0000:03:00.0", false},
		{"0000:03:00.0", "0000:03:00.0", false},
		{"1A:1f.7", "0000:1a:1f.7", false},
		{"FFFF:ab:Cd.3", "ffff:ab:cd.3", false},
		{"  03:00.0\n", "0000:03:00.0", false},

		// Empty / nonsense
		{"", "", true},
		{"hello", "", true},
		{"03:00.8", "", true},  // function digit out of range (only 0-7 valid)
		{"3:00.0", "", true},   // bus too short
		{"030:00.0", "", true}, // bus too long
		{"03:0.0", "", true},   // device too short
		{"03:000.0", "", true}, // device too long
		{"03:00.", "", true},   // missing function
		{"03:00.10", "", true}, // function too long

		// Path injection attempts
		{"../etc/passwd", "", true},
		{"03:00.0/etc", "", true},
		{"00:00:00:00.0", "", true}, // too many colons but no domain pattern
		{"$(rm -rf /)", "", true},
		{"03:00.0\x00malicious", "", true},

		// Domain too short / too long
		{"FFF:03:00.0", "", true},
		{"FFFFF:03:00.0", "", true},
	}
	for _, tc := range tests {
		got, err := normaliseBDF(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("normaliseBDF(%q): expected error, got %q", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("normaliseBDF(%q): unexpected error %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("normaliseBDF(%q) = %q; want %q", tc.in, got, tc.want)
		}
	}
}

func TestBdfRegexAnchored(t *testing.T) {
	// Defence-in-depth: the regex must be anchored at both ends so a
	// malicious input like "03:00.0; rm -rf /" cannot pass validation.
	if normalised, err := normaliseBDF("03:00.0; rm -rf /"); err == nil {
		t.Fatalf("expected error for shell-injection-flavoured input; got %q", normalised)
	}
	if normalised, err := normaliseBDF("prefix03:00.0"); err == nil {
		t.Fatalf("expected error for prefixed input; got %q", normalised)
	}
}
