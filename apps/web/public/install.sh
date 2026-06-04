#!/usr/bin/env bash
# c0upons CLI installer
# Usage: curl -fsSL https://c0upons.com/install.sh | sh

set -euo pipefail

CLI_URL="https://c0upons.com/cli/c0upons"
BIN_NAME="c0upons"
BIN_DIR=""

BOLD="\033[1m"
GREEN="\033[32m"
ORANGE="\033[38;5;208m"
DIM="\033[2m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}${ORANGE}c0upons${RESET} CLI installer"
echo ""

# Detect install directory
if [ -w "/usr/local/bin" ]; then
  BIN_DIR="/usr/local/bin"
elif [ -d "$HOME/.local/bin" ] && [[ ":$PATH:" == *":$HOME/.local/bin:"* ]]; then
  BIN_DIR="$HOME/.local/bin"
else
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
fi

DEST="$BIN_DIR/$BIN_NAME"

echo -e "  Downloading from ${DIM}${CLI_URL}${RESET}"
curl -fsSL "$CLI_URL" -o /tmp/c0upons_install
chmod +x /tmp/c0upons_install

if [ "$BIN_DIR" = "/usr/local/bin" ]; then
  if command -v sudo &>/dev/null; then
    sudo mv /tmp/c0upons_install "$DEST"
  else
    mv /tmp/c0upons_install "$DEST"
  fi
else
  mv /tmp/c0upons_install "$DEST"
fi

echo -e "  ${GREEN}✓${RESET} Installed to ${BOLD}${DEST}${RESET}"
echo ""
echo -e "  Run ${BOLD}c0upons help${RESET} to get started."
echo ""

if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo -e "  ${DIM}Note: ${BIN_DIR} is not in your PATH.${RESET}"
  echo -e "  ${DIM}Add it with:${RESET}"
  echo ""
  echo -e "    echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
  echo ""
fi
