#!/bin/sh
set -e
node /app/server/server.js &
exec nginx -g "daemon off;"
