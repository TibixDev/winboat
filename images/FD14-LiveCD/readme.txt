###############################################################################
		FreeDOS 1.4 ("FreeDOS 1.4")
###############################################################################


-------------------------------------------------------------------------------
		General system requirements:
-------------------------------------------------------------------------------

  * DOS-compatible system (Intel + BIOS, or UEFI with Legacy support)

  * At least 20MB free disk space:

    20MB  Plain DOS system
    30MB  Plain DOS system, with sources

    275MB  Full installation including applications and games
    450MB  Full installation with sources


-------------------------------------------------------------------------------
		What's in all those zip files?
-------------------------------------------------------------------------------

FD14-LiveCD.zip

  * FD14BOOT.IMG - Basic FreeDOS installation boot floppy image.
    If your computer has a CD-ROM drive, but you cannot boot from the Live CD
    or Legacy CD. Use this diskette image to boot the system. Then insert the
    install CD. The FreeDOS installer should do the rest. This diskette
    image is for installation purposes only and does not provide a Live
    Environment.

  * FD14LIVE.ISO - The FreeDOS 1.4 installer.  Most users should
    use this image to install FreeDOS.

    Depending on your computer system and hardware configuration, you
    can also use the LiveCD to boot and run FreeDOS directly from the
    CD-ROM without installation to your hard drive.

FD14-LegacyCD.zip

  * FD14BOOT.IMG - This zip archive also contains a copy of the basic
    CD-ROM installation boot floppy.

  * FD14LGCY.ISO - A bootable CD image designed for older hardware. If
    you cannot boot the LiveCD to install FreeDOS, try this disc image.

    This disc image uses the older El Torito boot CD format. Some newer
    computers and virtual machines cannot use this older format. Unless
    you have a computer that requires this type of bootable CD, we
    recommend using the LiveCD instead.

FD14-BonusCD.zip

  * FD14BNS.ISO - A non-bootable CD image that contains some FreeDOS
    packages that are not installed as part of either the LiveCD or
    the Legacy CD.

FD14-LiteUSB.zip

  * FD14LITE.IMG - A minimal FreeDOS installer, as a USB fob drive
    image. This does not contain all of the packages from either the
    LiveCD or the LegacyCD, and instead only contains a basic set of
    FreeDOS packages.

  * FD14LITE.VMDK - A virtual machine disk file, compatible with a
    variety of virtual machine software including VirtualBox, VMware,
    and other systems.

    Using a VMDK file can simplify installing FreeDOS. Just attach the
    VMDK image to your virtual machine software as a hard drive, and
    boot it. (Please note that you will still need to create a virtual
    hard disk to install FreeDOS)

FD14-FullUSB.zip

  * FD14FULL.IMG - Plain DOS system and Full install USB stick image.

  * FD14FULL.VMDK - A virtual machine disk file, compatible with a
    variety of virtual machine software. Just attach the VMDK image to
    your virtual machine as a hard drive, and boot it.

VERIFY.TXT

  * Contains MD5, SHA256 and SHA512 hashes for all of the different
    release files. You can verify your copy of FreeDOS with these.

README.TXT

  * The "before you choose and install" document. (All of the zip
    files listed above also have a copy of the README file.)


-------------------------------------------------------------------------------
		FreeDOS Floppy-Only Edition (FD14-x86)
-------------------------------------------------------------------------------

FreeDOS 1.4 includes a Floppy-Only Edition! This edition should run on
any hardware that can run FreeDOS and has EGA or better graphics:

  * Are you running a '286 or another classic system without a CD-ROM
    drive?  Install from these floppies to install FreeDOS.

  * Do you have just one hard drive and no CD or floppy drive? Just
    copy the contents of the floppies to a temporary directory and run
    the installer from there.

  * Want to perform a "headless" install to a different DOS directory?
    It's easy with the command line options.

The Floppy-Only Edition uses a completely different installer than
the CD-ROM or USB installers. The Floppy-Only Edition does not use
any of those other media to install.

The Floppy-Only Edition contains a limited set of FreeDOS programs
that are more useful on classic PC hardware.

The FreeDOS Floppy-Only Edition is distributed as single zip archive that
contains several pre-made floppy diskette images:

    These zip archives contain image files for several common floppy
    diskette media under separate directories:

    * 720k - 3.5" 720k diskette images

    * 144m - 3.5" 1.44mb diskette images

    * 120m - 5.25" 1.2mb diskette images

    Each of those sets contain a number of pre-made disk images:

    * x86BOOT.img - A floppy boot disk image with the x86 installer.

    * x86DSK??.img - Several floppy diskette images that contain the
      core FreeDOS operating system files. The number of floppy images
      and amount of files on each varies depending on the diskette
      capacity.

To conserve space, the FreeDOS Floppy-Only Edition does not contain
the source code for the FreeDOS packages. You can find the source code
via the FreeDOS website (https://www.freedos.org/download/) or from
the other release media, like the USB or CD-ROM installer.

