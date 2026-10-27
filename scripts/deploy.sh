#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SERVER=root@43.108.80.187
HEALTH_URL=http://43.108.80.187/api/health
EXPECTED_HEALTH='{"ok":true,"mode":"live","accessRequired":true}'
SSH_KEY="$HOME/.ssh/agentforge_deploy"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15)
cd "$ROOT_DIR"

if [ ! -f "$SSH_KEY" ]; then
  echo "缺少部署私钥：$SSH_KEY" >&2
  exit 1
fi

check_health() {
  local deadline=$((SECONDS + 60))
  local body=''
  while [ "$SECONDS" -lt "$deadline" ]; do
    body=$(curl -fsS --max-time 2 "$HEALTH_URL" 2>/dev/null || true)
    if [ "$body" = "$EXPECTED_HEALTH" ]; then
      printf '健康检查通过：%s\n' "$body"
      return 0
    fi
    sleep 2
  done

  echo '健康检查在 60 秒内未通过，最近 50 条服务日志如下（已过滤敏感值）：' >&2
  ssh "${SSH_OPTS[@]}" "$SERVER" "journalctl -u agentforge -n 50 --no-pager 2>&1 | sed -E -e 's/sk-[[:alnum:]_.-]+/[REDACTED_KEY]/g' -e 's#https?://[^[:space:]]+#[REDACTED_URL]#g'" >&2
  return 1
}

prune_releases() {
  ssh "${SSH_OPTS[@]}" "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail
mapfile -t releases < <(ls -1dt /opt/agentforge/releases/* 2>/dev/null || true)
for ((index = 3; index < ${#releases[@]}; index++)); do
  case "${releases[$index]}" in
    /opt/agentforge/releases/*) rm -rf -- "${releases[$index]}" ;;
  esac
done
REMOTE
}

if [ "${1:-}" = '--rollback' ]; then
  ssh "${SSH_OPTS[@]}" "$SERVER" 'bash -s' <<'REMOTE'
set -euo pipefail
current=$(readlink -f /opt/agentforge/current)
previous=''
for release in $(ls -1dt /opt/agentforge/releases/* 2>/dev/null); do
  if [ "$release" != "$current" ]; then
    previous=$release
    break
  fi
done
if [ -z "$previous" ]; then
  echo '没有可回滚的上一个 release' >&2
  exit 1
fi
next_link="/opt/agentforge/.current.$$"
trap 'rm -f "$next_link"' EXIT
ln -s "$previous" "$next_link"
mv -Tf "$next_link" /opt/agentforge/current
systemctl restart agentforge
printf '已回滚到 %s\n' "$(basename "$previous")"
REMOTE
  check_health
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo '工作区有未提交改动，请先提交再部署' >&2
  exit 1
fi
if [ ! -f .env.deploy ]; then
  echo '缺少 .env.deploy；不会创建或改写该文件' >&2
  exit 1
fi

npm run check
npm run build
node scripts/package-standalone.mjs

hash=$(git rev-parse --short HEAD)
archive_name="agentforge-${hash}.tar.gz"
archive_path=".deploy/${archive_name}"
tar -czf "$archive_path" -C .deploy/app .
printf '发布包：%s（%s bytes）\n' "$archive_path" "$(stat -c %s "$archive_path")"

remote_tmp=$(ssh "${SSH_OPTS[@]}" "$SERVER" 'mktemp -d /tmp/agentforge-deploy.XXXXXX')
cleanup() {
  if [ -n "${remote_tmp:-}" ]; then
    ssh "${SSH_OPTS[@]}" "$SERVER" "rm -rf -- '$remote_tmp'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
scp "${SSH_OPTS[@]}" "$archive_path" scripts/server-setup.sh .env.deploy "$SERVER:$remote_tmp/"

ssh "${SSH_OPTS[@]}" "$SERVER" "bash -s -- '$hash' '$archive_name' '$remote_tmp'" <<'REMOTE'
set -euo pipefail
hash=$1
archive_name=$2
remote_tmp=$3
release_dir="/opt/agentforge/releases/$hash"
staging_dir="/opt/agentforge/releases/.${hash}.tmp.$$"
next_link="/opt/agentforge/.current.$$"
cleanup_remote() {
  rm -rf -- "$remote_tmp"
  rm -rf -- "$staging_dir"
  rm -f -- "$next_link"
}
trap cleanup_remote EXIT

bash "$remote_tmp/server-setup.sh"
install -o root -g root -m 600 "$remote_tmp/.env.deploy" /etc/agentforge/env
if [ ! -d "$release_dir" ]; then
  install -d -o root -g root -m 755 "$staging_dir"
  tar -xzf "$remote_tmp/$archive_name" -C "$staging_dir"
  chown -R agentforge:agentforge "$staging_dir"
  mv "$staging_dir" "$release_dir"
fi
chown -R agentforge:agentforge "$release_dir"
if [ -d /opt/agentforge/current ] && [ ! -L /opt/agentforge/current ]; then
  rmdir /opt/agentforge/current
fi
ln -s "$release_dir" "$next_link"
mv -Tf "$next_link" /opt/agentforge/current
systemctl daemon-reload
systemctl enable --now agentforge
systemctl restart agentforge
printf '已发布 release %s\n' "$hash"
REMOTE

check_health
prune_releases
printf '部署完成：%s\n' "$hash"
