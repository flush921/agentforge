#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION=22.23.4
NODE_NAME="node-v${NODE_VERSION}-linux-x64"
NODE_HOME="/opt/node/${NODE_NAME}"

if [ "$(id -u)" -ne 0 ]; then
  echo 'server-setup.sh 需要 root 权限' >&2
  exit 1
fi

for command_name in curl tar sha256sum systemctl; do
  command -v "$command_name" >/dev/null
done

work_dir=$(mktemp -d /tmp/agentforge-setup.XXXXXX)
trap 'rm -rf "$work_dir"' EXIT

if ! swapon --noheadings --show=NAME | grep -qx '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
chmod 600 /swapfile
if ! grep -Eq '^[[:space:]]*/swapfile[[:space:]]' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
fi
printf 'vm.swappiness=10\n' >"$work_dir/swappiness.conf"
if ! cmp -s "$work_dir/swappiness.conf" /etc/sysctl.d/99-agentforge.conf; then
  install -o root -g root -m 644 "$work_dir/swappiness.conf" /etc/sysctl.d/99-agentforge.conf
fi
if [ "$(sysctl -n vm.swappiness)" != '10' ]; then
  sysctl -w vm.swappiness=10 >/dev/null
fi

if [ ! -x "$NODE_HOME/bin/node" ] || [ "$("$NODE_HOME/bin/node" --version)" != "v${NODE_VERSION}" ]; then
  curl -fsSL --retry 3 -o "$work_dir/${NODE_NAME}.tar.xz" "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_NAME}.tar.xz"
  curl -fsSL --retry 3 -o "$work_dir/SHASUMS256" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  expected=$(awk -v file="${NODE_NAME}.tar.xz" '$2 == file { print $1 }' "$work_dir/SHASUMS256")
  if [ -z "$expected" ]; then
    echo 'Node.js 官方校验清单中没有目标版本' >&2
    exit 1
  fi
  printf '%s  %s\n' "$expected" "$work_dir/${NODE_NAME}.tar.xz" | sha256sum -c -
  install -d -o root -g root -m 755 /opt/node
  rm -rf "$NODE_HOME"
  tar -xJf "$work_dir/${NODE_NAME}.tar.xz" -C /opt/node
fi
ln -sfn "$NODE_HOME/bin/node" /usr/local/bin/node
ln -sfn "$NODE_HOME/bin/npm" /usr/local/bin/npm
ln -sfn "$NODE_HOME/bin/npx" /usr/local/bin/npx
node --version

if ! id agentforge >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin agentforge
elif [ "$(getent passwd agentforge | cut -d: -f7)" != '/usr/sbin/nologin' ]; then
  usermod --shell /usr/sbin/nologin agentforge
fi
install -d -o root -g root -m 755 /opt/agentforge /opt/agentforge/releases
if [ ! -L /opt/agentforge/current ]; then
  install -d -o root -g root -m 755 /opt/agentforge/current
fi
install -d -o root -g root -m 700 /etc/agentforge

cat >"$work_dir/agentforge.service" <<'UNIT'
[Unit]
Description=AgentForge Next.js standalone server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=agentforge
Group=agentforge
WorkingDirectory=/opt/agentforge/current
EnvironmentFile=/etc/agentforge/env
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/local/bin/node server.js
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
MemoryMax=320M
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
if ! cmp -s "$work_dir/agentforge.service" /etc/systemd/system/agentforge.service; then
  install -o root -g root -m 644 "$work_dir/agentforge.service" /etc/systemd/system/agentforge.service
fi

install -d -o root -g root -m 755 /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=100M\n' >"$work_dir/journald.conf"
if ! cmp -s "$work_dir/journald.conf" /etc/systemd/journald.conf.d/agentforge.conf; then
  install -o root -g root -m 644 "$work_dir/journald.conf" /etc/systemd/journald.conf.d/agentforge.conf
  systemctl restart systemd-journald
fi
systemctl daemon-reload

echo '服务器初始化完成'
