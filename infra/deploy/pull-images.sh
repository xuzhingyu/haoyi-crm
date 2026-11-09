set -eu
mirror=v0rhqhmz.mirror.aliyuncs.com
for image in postgres:17-alpine redis:7.4-alpine node:24-trixie-slim; do
  docker pull --quiet "$mirror/library/$image"
  docker tag "$mirror/library/$image" "$image"
done
