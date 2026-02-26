#!/bin/bash
# Set the setuid bit on chrome-sandbox so Electron's sandbox works on systems
# where unprivileged user namespaces are restricted (e.g. hardened kernels).
# On Fedora/RHEL with standard kernel settings this is not strictly required,
# but it is a safe no-op when not needed.
chmod 4755 /opt/Automaker/chrome-sandbox 2>/dev/null || true
