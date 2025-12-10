# WinBoat CLI

Command-line interface for WinBoat that allows you to install and launch applications from the terminal.

## Installation

After installing WinBoat dependencies, you can use the CLI in several ways:

### Option 1: Using npm script
```bash
npm run winboat [options]
```

### Option 2: Direct execution
```bash
node scripts/winboat-cli.ts [options]
```

### Option 3: Create a symlink (recommended)
```bash
# Create a symlink in your local bin directory
ln -s $(pwd)/scripts/winboat-cli.ts ~/.local/bin/winboat
chmod +x ~/.local/bin/winboat

# Make sure ~/.local/bin is in your PATH
export PATH="$HOME/.local/bin:$PATH"
```

## Usage

### Install an Application
```bash
winboat -i /path/to/installer.exe
winboat -i ~/Downloads/app.msi
```

### Launch an Application
```bash
winboat -l "Google Chrome"
winboat -l "Notepad"
winboat -l "chrome"  # Partial name matching
```

### List All Applications
```bash
winboat --list
winboat -ls
```

### Check Status
```bash
winboat --status
winboat -s
```

### Custom API URL
```bash
winboat --api-url http://localhost:7148 --list
```

### Help
```bash
winboat --help
winboat -h
```

## Examples

```bash
# Install an application
winboat -i ~/Downloads/vscode.exe

# List all available apps
winboat --list

# Launch Chrome
winboat -l "Google Chrome"

# Check if WinBoat is running
winboat --status

# Install with custom API URL
winboat --api-url http://192.168.1.100:7148 -i app.msi
```

## Requirements

- WinBoat container must be running
- WinBoat Guest Server API must be accessible (default: http://localhost:7148)
- For launching apps: FreeRDP 3.x must be installed

## Troubleshooting

### "API is not accessible"
- Ensure the WinBoat container is running
- Check that the API port (default 7148) is accessible
- Verify the API URL with `--api-url` if using a custom port

### "FreeRDP 3.x not found" (when launching)
- Install FreeRDP 3.x with sound support
- On Ubuntu/Debian: `sudo apt install freerdp3-x11`
- Verify installation: `xfreerdp3 --version`

### "Could not determine RDP port"
- Ensure the container is running
- Check that port mappings are correct in docker-compose.yml
- Try restarting the container

## Notes

- App names for `-l` are case-insensitive and support partial matching
- If multiple apps match, you'll be prompted to be more specific
- Installation may take a few moments; apps appear in the list shortly after
- The CLI communicates directly with the WinBoat Guest Server API


