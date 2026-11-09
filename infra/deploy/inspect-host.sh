set -eu
printf 'IMAGES\n'
docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}'
printf 'NETWORKS\n'
docker inspect nginx-project --format '{{json .NetworkSettings.Networks}}'
printf 'MOUNTS\n'
docker inspect nginx-project --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
printf 'DOMAIN_CONFIG\n'
grep -l 'server_name qiushuihao.fun' /data/docker/nginx/conf/* 2>/dev/null || true
printf 'WORKBENCH_LAYOUT\n'
docker inspect affiliate-workbench-api --format '{{.Config.Image}} {{range .Mounts}}{{.Destination}} {{end}}'
printf 'PORTS\n'
docker ps --format '{{.Names}} {{.Ports}}'
printf 'SWAP\n'
cat /proc/swaps
mkdir -p /opt/haoyi-workspace/releases /opt/haoyi-workspace/shared
chmod 700 /opt/haoyi-workspace/shared
