## First-Time Setup: Creating the Base Image

To create the initial FreeDOS base image, use helper script:

```bash
./scripts/create-base-image.sh
```

The script will:
1. Create a blank 1GB QCOW2 disk
2. Launch QEMU with the FreeDOS 1.4 LiveCD
3. Guide you through the FreeDOS installation
4. Save the installed image as the base

**During the installation:**
- Choose "Install to harddisk"
- Select your language
- When prompted about Drive C not being partitioned, answer "Yes" to partition
- System will reboot automatically
- After reboot, choose "Yes" to format the drive
- Select installation options (full installation recommended)
- After installation completes, type: `fdapm /poweroff`

**Manual creation** (if you prefer):
See detailed instructions in [build/freedos-image/README.md](build/freedos-image/README.md).
