package main

import (
	"io"
	"net"
	"testing"
	"time"
)

func TestValidateArgs_RequiredListenDial(t *testing.T) {
	_, err := validateArgs("tcp", "", "127.0.0.1:1")
	if err == nil {
		t.Fatal("expected error for empty listen")
	}
	_, err = validateArgs("tcp", "127.0.0.1:1", "")
	if err == nil {
		t.Fatal("expected error for empty dial")
	}
}

func TestValidateArgs_InvalidProto(t *testing.T) {
	_, err := validateArgs("sctp", "127.0.0.1:1", "127.0.0.1:2")
	if err == nil {
		t.Fatal("expected error for unsupported proto")
	}
	if got := err.Error(); got == "" {
		t.Fatal("error message empty")
	}
}

func TestValidateArgs_OK(t *testing.T) {
	for _, proto := range []string{"tcp", "udp"} {
		cfg, err := validateArgs(proto, "0.0.0.0:9", "172.30.0.2:9")
		if err != nil {
			t.Fatalf("proto %s: %v", proto, err)
		}
		if cfg.proto != proto || cfg.listen == "" || cfg.dial == "" {
			t.Fatalf("unexpected cfg: %+v", cfg)
		}
	}
}

// TCP round-trip: fake upstream echoes payload; proxy bridges client <-> upstream.
func TestServeTCP_RoundTrip(t *testing.T) {
	// Upstream echo server (simulates guest).
	upLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer upLn.Close()
	go func() {
		for {
			c, err := upLn.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				_, _ = io.Copy(conn, conn)
			}(c)
		}
	}()

	// Proxy listen on ephemeral port, dial the echo server.
	proxyLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxyAddr := proxyLn.Addr().String()
	_ = proxyLn.Close()

	errCh := make(chan error, 1)
	go func() {
		errCh <- serveTCP(proxyAddr, upLn.Addr().String())
	}()

	// Wait briefly for listener
	deadline := time.Now().Add(2 * time.Second)
	var client net.Conn
	for {
		client, err = net.DialTimeout("tcp", proxyAddr, 200*time.Millisecond)
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("proxy not accepting: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	defer client.Close()

	payload := []byte("winboat-tcp-roundtrip")
	if _, err := client.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = client.(*net.TCPConn).CloseWrite()

	buf := make([]byte, 64)
	_ = client.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, err := io.ReadFull(client, buf[:len(payload)])
	if err != nil {
		t.Fatalf("read echo: %v", err)
	}
	if string(buf[:n]) != string(payload) {
		t.Fatalf("got %q want %q", buf[:n], payload)
	}
}

func TestServeUDP_RoundTrip(t *testing.T) {
	upstream, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer upstream.Close()
	go func() {
		buf := make([]byte, 65535)
		for {
			n, addr, readErr := upstream.ReadFrom(buf)
			if readErr != nil {
				return
			}
			_, _ = upstream.WriteTo(buf[:n], addr)
		}
	}()

	reserved, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	proxyAddr := reserved.LocalAddr().String()
	_ = reserved.Close()
	go func() {
		_ = serveUDP(proxyAddr, upstream.LocalAddr().String())
	}()

	proxyUDPAddr, err := net.ResolveUDPAddr("udp", proxyAddr)
	if err != nil {
		t.Fatal(err)
	}
	client, err := net.DialUDP("udp", nil, proxyUDPAddr)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	payload := []byte("winboat-udp-roundtrip")
	buf := make([]byte, len(payload))
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, err = client.Write(payload); err != nil {
			t.Fatal(err)
		}
		_ = client.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		n, readErr := client.Read(buf)
		if readErr == nil {
			if string(buf[:n]) != string(payload) {
				t.Fatalf("got %q want %q", buf[:n], payload)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("udp proxy did not echo before deadline: %v", readErr)
		}
	}
}
