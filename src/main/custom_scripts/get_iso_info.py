import gi
import sys

gi.require_version("Libosinfo", "1.0")

from gi.repository import Libosinfo

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Missing filename!', file=sys.stderr)
        exit(1)

    file_path = sys.argv[1]

    loader = Libosinfo.Loader()
    loader.process_default_path()
    db = loader.get_db()

    try:
        media = Libosinfo.Media.create_from_location(file_path, None)
    except gi.repository.GLib.GError:
        print('Invalid', end='')
        exit(0)

    if not media.is_bootable():
        print('Invalid', end='')
        exit(0)

    if not db.identify_media(media):
        print('Unknown', end='')
        exit(0)
    
    print(media.get_os().get_family(), end='') # winnt for windows