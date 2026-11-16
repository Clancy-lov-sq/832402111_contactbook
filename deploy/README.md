# Deployment guide

The application is a single Node.js service: Express serves the built single page
application from `server/public` and answers `/api` on the same origin, so a
deployment is one process, one port and one SQLite file.

> The optional "web deployment" item of the assignment (15 points) prepared this
> guide and the container configuration; **no public host was rented and no public
> URL is claimed**. The commands below are what turns the repository into a public
> address, and they were written to be followed literally.

## 1. Build a release locally (optional sanity check)

```bash
npm ci
npm run build          # writes server/public
npm test               # 78 automated tests
npm start              # http://127.0.0.1:8080
```

## 2. Option A — Docker on a cloud server (Huawei Cloud ECS / Alibaba Cloud ECS)

This is the shortest path: a 2 vCPU / 2 GB instance with a 20 GB disk is more than
enough.

1. Create an ECS instance (Ubuntu 22.04 or 24.04 LTS) and open the security group
   for **TCP 80** (and 443 if a certificate is added).
2. Install Docker and the compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker "$USER" && newgrp docker
   ```
3. Put the repository on the server and start it:
   ```bash
   git clone https://github.com/Clancy-lov-sq/832402111_contactbook.git
   cd 832402111_contactbook
   mkdir -p data
   docker compose up -d --build
   ```
4. Check the health endpoint and the page:
   ```bash
   curl -s http://127.0.0.1/api/health | head -20
   curl -I http://127.0.0.1/
   ```
5. Open `http://<public-ip>/` from a machine outside the cloud network.

The SQLite file is a bind mount at `./data/contactbook.db`; `docker compose down`
does not remove it, and a new image can be deployed without touching the contacts.

## 3. Option B — systemd on the cloud server

1. Install Node.js 22.5 or newer (NodeSource or nvm) and verify `node --version`.
2. Prepare the directory and the unprivileged user:
   ```bash
   sudo useradd --create-home --uid 10001 contactbook
   sudo mkdir -p /opt/contactbook/data
   sudo chown -R contactbook:contactbook /opt/contactbook
   ```
3. Build the release and copy it into place:
   ```bash
   git clone https://github.com/Clancy-lov-sq/832402111_contactbook.git
   cd 832402111_contactbook
   npm ci && npm run build && npm test
   sudo rsync -a --exclude node_modules --exclude data ./ /opt/contactbook/
   cd /opt/contactbook && sudo -u contactbook npm ci --omit=dev --ignore-scripts
   ```
4. Install the unit and start it:
   ```bash
   sudo cp deploy/contactbook.service /etc/systemd/system/contactbook.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now contactbook
   sudo systemctl status contactbook
   ```
   The unit binds the service to `127.0.0.1:8080`, which is why the next step is a
   reverse proxy rather than a public port.
5. Put nginx in front of it, optionally with TLS:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/contactbook
   sudo ln -s /etc/nginx/sites-available/contactbook /etc/nginx/sites-enabled/contactbook
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d book.example.com
   ```
6. Set `CORS_ORIGIN` to the public origin once HTTPS is in place, then restart:
   ```bash
   sudo systemctl edit contactbook   # add: Environment=CORS_ORIGIN=https://book.example.com
   sudo systemctl restart contactbook
   ```

## 4. What to verify after the deployment

| Check | Expected |
| --- | --- |
| `GET /api/health` | `"status": "ok"`, `"database.status": "connected"`, the stored contact count |
| `GET /` | the address book page loads and the sidebar reports the contact count |
| Create / edit / delete | the change survives a page reload |
| Star a contact | the star is still filled after a reload, "我的收藏" counts it |
| `GET /api/contacts/export` | an `.xlsx` file downloads, one contact per row |
| Import the exported file with "更新已有" | the report says every row was updated and no row failed |
| Restart the service | the contacts are still there (SQLite file on disk) |

## 5. Operations

- **Backup:** copy `data/contactbook.db` (use `sqlite3 data/contactbook.db ".backup ..."` or stop the service for a consistent file copy). The WAL side files are part of the database while the service runs.
- **Upgrade:** `git pull`, `npm ci`, `npm run build`, restart the unit or `docker compose up -d --build`. The schema is created with `IF NOT EXISTS`, so an upgrade never drops data.
- **Logs:** `journalctl -u contactbook -f` for systemd, `docker compose logs -f` for Docker.
- **Rollback:** keep the previous image tag (`contactbook:1.0.0`) or the previous `/opt/contactbook` directory; the database file is compatible with both.
