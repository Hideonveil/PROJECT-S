#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

sudo install -m 0644 "$SCRIPT_DIR/jiyuan-monitor.service" /etc/systemd/system/jiyuan-monitor.service
sudo install -m 0644 "$SCRIPT_DIR/jiyuan-monitor.timer" /etc/systemd/system/jiyuan-monitor.timer
sudo systemctl daemon-reload
sudo systemctl enable --now jiyuan-monitor.timer
sudo systemctl start jiyuan-monitor.service
sudo systemctl --no-pager status jiyuan-monitor.timer

