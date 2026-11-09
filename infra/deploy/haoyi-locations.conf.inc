location = /report.html {
    alias /usr/share/nginx/html/haoyi/report.html;
    add_header Cache-Control "no-cache";
    add_header X-Content-Type-Options nosniff always;
}
location = /haoyi { return 308 /haoyi/; }
location ^~ /haoyi/api/v1/internal/ { return 404; }
location ^~ /haoyi/api/v1/crm/integrations/ { return 404; }
location ^~ /haoyi/api/v1/crm/ {
    proxy_pass http://haoyi-legacy-crm:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Haoyi-Bridge-Token "";
    proxy_set_header X-User-Id "";
    proxy_set_header X-User-Role "";
    proxy_set_header X-Org-Id "";
    proxy_read_timeout 240s;
    client_max_body_size 20m;
}
location ^~ /haoyi/api/ {
    proxy_pass http://haoyi-lead-core:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 90s;
    client_max_body_size 12m;
}
location ^~ /haoyi/ {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /haoyi/index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
location ^~ /haoyi-auth/admin/ { return 404; }
location ^~ /haoyi-auth/ {
    proxy_pass http://haoyi-workspace-auth:8080/haoyi-auth/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-Prefix /haoyi-auth;
}
