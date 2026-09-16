#!/usr/bin/env sh
# Dev startup: generate the Prisma client (into the anon-volume src/generated),
# apply migrations deterministically, seed reference data, then run the watcher.
# `exec` makes tsx PID 1 so it receives Compose's SIGTERM on stop/Ctrl+C.
#
# Two passes, two uids (10.16). The container starts as root, and only the
# Prisma client generation runs that way: the anonymous volume it writes to is
# root-owned. The script then re-executes itself as the host's uid/gid
# (HOST_UID/HOST_GID — `npm run dev` exports them from `id -u`/`id -g`), so
# everything that touches a bind mount — migrate, the seed (which writes images
# into ../uploads) and the watcher — runs as the user who owns those paths on
# the host. Without this, a fresh clone's `uploads/` is created by Docker as
# root and the host cannot write to it (EACCES on `npm run db:seed`).
set -e

if [ "$(id -u)" = "0" ]; then
  echo "Generating Prisma client..."
  node_modules/.bin/prisma generate

  # Docker creates a missing bind-mount source on the host as root, at mount
  # time — before this script runs. Handing the tree to the host uid here is
  # what lets the seed below create `products/…` inside it. Recursive so a
  # tree written as root by the pre-10.16 container heals on the next `up`.
  chown -R "$HOST_UID:$HOST_GID" /app/uploads

  echo "Dropping privileges to ${HOST_UID}:${HOST_GID}..."
  # `setpriv` ships with util-linux in the base image — no extra package. HOME
  # moves to a writable place because the host uid has no passwd entry in the
  # container, and the Prisma CLI keeps its checkpoint cache under $HOME.
  exec setpriv --reuid="$HOST_UID" --regid="$HOST_GID" --clear-groups \
    env HOME=/tmp "$0" "$@"
fi

echo "Applying migrations..."
node_modules/.bin/prisma migrate deploy

echo "Seeding database..."
# Same split as production (10.3): reference data failing stops the boot here
# via `set -e`; demonstration data failing only logs, so `npm run dev` never
# dies over a fake catalog. The fence lives in src/lib/seed/optionalSeedStep.ts.
# Run the seed directly with the local tsx binary. `prisma db seed` would spawn
# `tsx` expecting it on PATH, which fails when prisma is invoked directly (not
# via an npm script that prepends node_modules/.bin).
node_modules/.bin/tsx prisma/seed.ts

echo "Starting dev server (tsx watch)..."
exec node_modules/.bin/tsx watch src/server.ts
