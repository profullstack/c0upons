#!/bin/sh
# c0upons CLI installer
# Usage: curl -fsSL https://c0upons.com/install.sh | sh
#
# POSIX sh compatible — works under dash/sh as well as bash. Avoid bashisms
# (pipefail, echo -e, [[ ]], &>) so `curl ... | sh` does not error.
set -eu

CLI_URL="https://c0upons.com/cli/c0upons"
BIN_NAME="c0upons"

BOLD="\033[1m"
GREEN="\033[32m"
ORANGE="\033[38;5;208m"
DIM="\033[2m"
RESET="\033[0m"

printf '\n'
printf '%b\n' "${BOLD}${ORANGE}c0upons${RESET} CLI installer"
printf '\n'

# Detect install directory: prefer /usr/local/bin when writable, else ~/.local/bin.
if [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

DEST="$BIN_DIR/$BIN_NAME"

printf '%b\n' "  Downloading from ${DIM}${CLI_URL}${RESET}"
curl -fsSL "$CLI_URL" -o /tmp/c0upons_install
chmod +x /tmp/c0upons_install

if [ "$BIN_DIR" = "/usr/local/bin" ] && command -v sudo >/dev/null 2>&1; then
  sudo mv /tmp/c0upons_install "$DEST"
else
  mv /tmp/c0upons_install "$DEST"
fi

printf '%b\n' "  ${GREEN}✓${RESET} Installed to ${BOLD}${DEST}${RESET}"
printf '\n'
printf '%b\n' "  Run ${BOLD}c0upons help${RESET} to get started."
printf '\n'

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '%b\n' "  ${DIM}Note: ${BIN_DIR} is not in your PATH.${RESET}"
    printf '%b\n' "  ${DIM}Add it with:${RESET}"
    printf '\n'
    printf '%b\n' "    echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
    printf '\n'
    ;;
esac
