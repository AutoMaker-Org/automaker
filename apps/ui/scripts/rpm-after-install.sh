#!/bin/bash
# Set the setuid bit on chrome-sandbox so Electron's sandbox works on systems
# where unprivileged user namespaces are restricted (e.g. hardened kernels).
# On Fedora/RHEL with standard kernel settings this is a safe no-op.
chmod 4755 /opt/Automaker/chrome-sandbox 2>/dev/null || true

# Refresh the GTK icon cache so GNOME/KDE picks up the newly installed icon
# immediately without requiring a logout. The -f flag forces a rebuild even
# if the cache is up-to-date; -t suppresses the mtime check warning.
gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true

# Rebuild the desktop entry database so the app appears in the app launcher
# straight after install.
update-desktop-database /usr/share/applications 2>/dev/null || true
