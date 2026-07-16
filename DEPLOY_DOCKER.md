# Docker deployment

This project can run outside Vercel as a Docker container. The container serves the static dashboard from `webapp/` and provides compatible endpoints for:

- `/api/config`
- `/api/apps-script`
- `/healthz`

## Build on the cloud server

```bash
git clone https://github.com/subinsudkuo-source/trang-ap-ar-dashboard.git
cd trang-ap-ar-dashboard
docker build -t trang-ap-ar-dashboard:latest .
docker run -d --name trang-ap-ar-dashboard \
  --restart unless-stopped \
  -p 8080:8080 \
  -e APPS_SCRIPT_WEB_APP_URL="https://script.google.com/macros/s/AKfycbwoBZYkXTRDKhjBA5a6c5JIK34d4tWCc5mmMPG9ItxGms3yideRMqP_YSmlnyC7wjJs/exec" \
  trang-ap-ar-dashboard:latest
```

Open:

```text
http://SERVER_IP:8080/
```

## Run with Docker Compose

```bash
git clone https://github.com/subinsudkuo-source/trang-ap-ar-dashboard.git
cd trang-ap-ar-dashboard
docker compose up -d --build
```

## Export image to a tar file

Use this when you want to build on one machine and import on another cloud server.

```bash
docker build -t trang-ap-ar-dashboard:latest .
docker save -o trang-ap-ar-dashboard.tar trang-ap-ar-dashboard:latest
```

Copy `trang-ap-ar-dashboard.tar` to the cloud server, then import and run:

```bash
docker load -i trang-ap-ar-dashboard.tar
docker run -d --name trang-ap-ar-dashboard \
  --restart unless-stopped \
  -p 8080:8080 \
  -e APPS_SCRIPT_WEB_APP_URL="https://script.google.com/macros/s/AKfycbwoBZYkXTRDKhjBA5a6c5JIK34d4tWCc5mmMPG9ItxGms3yideRMqP_YSmlnyC7wjJs/exec" \
  trang-ap-ar-dashboard:latest
```

## Health check

```bash
curl http://SERVER_IP:8080/healthz
```

Expected response:

```json
{"ok":true}
```
