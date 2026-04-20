# DB Connection Feature

## 1. Tổng quan

Tính năng **DB Connection** cho phép người dùng lưu thông tin kết nối tới một database thực tế, sau đó sử dụng kết nối đó để:
- Test thử kết nối
- Introspect (đọc schema thực) → import vào Physical Model của DBflow
- So sánh model với schema thực (diff)

---

## 2. Những gì đã có trong code (Frontend)

### 2.1 UI Component — `DBConnectionModal`
**File**: `src/components/DBConnectionModal/index.tsx`

| Phần | Trạng thái | Ghi chú |
|---|---|---|
| DBMS Selector (PostgreSQL / MySQL / SQL Server / SQLite) | ✅ Done | `Segmented`, `DBMS_OPTIONS` |
| Connection Method Cards (Direct / SSH Tunnel / Local Agent) | ✅ Done | `METHOD_CARDS`, state `method` |
| Form: Connection Name | ✅ Done | Required validation |
| Form: Host + Port (auto-fill port theo DBMS) | ✅ Done | Port = 0 thì disable (SQLite) |
| Form: Database Name, Username, Password | ✅ Done | Password là `Input.Password` |
| SSL/TLS Toggle | ✅ Done | State `sslEnabled` |
| SSH Tunnel fields (host, port, username, auth type) | ✅ Done | Ẩn/hiện theo `method === "ssh"` |
| SSH Auth: Password / Private Key (PEM textarea) | ✅ Done | State `sshAuthType` |
| Lock host = `127.0.0.1` khi method = `local_agent` | ✅ Done | `readOnly` + auto-fill |
| Test Connection button (UI states: idle/testing/success/failed) | ✅ Done (UI only) | Backend chưa có |
| Save Connection button | ✅ Done (UI only) | `TODO: POST /api/proxy/db-connections` |
| Reset form khi đóng modal | ✅ Done | `handleClose` |

### 2.2 Local Agent Banner
**File**: `src/components/DBConnectionModal/LocalAgentBanner.tsx`

| Phần | Trạng thái | Ghi chú |
|---|---|---|
| Tự động check agent tại `http://localhost:27182/health` | ✅ Done | Timeout 1.5s |
| Hiển thị trạng thái: checking / running / not_running | ✅ Done | 3 states |
| Nút download agent khi not_running | ✅ Done | |

### 2.3 Types
**File**: `src/types/db-connection.type.ts`

| Type/Interface | Trạng thái |
|---|---|
| `DBConnectionDBMS` | ✅ Done |
| `DBConnectionMethod` | ✅ Done |
| `DBConnectionStatus` | ✅ Done |
| `SSHAuthType` | ✅ Done |
| `DBConnection` (entity interface) | ✅ Done |
| `DBConnectionFormValues` | ✅ Done |
| `DEFAULT_PORTS` | ✅ Done |

### 2.4 Integration vào ProjectsList
**File**: `src/components/ProjectsList/index.tsx`

- Modal được render tại trang projects list với state `isDBConnectionOpen`
- Nút mở modal đã có trong toolbar

---

## 3. Những gì còn thiếu (cần build)

### 3.1 Frontend

| Hạng mục | Ghi chú |
|---|---|
| `src/api/db-connections/` — API client | Gọi backend CRUD + test + introspect |
| Hook `useDBConnections(projectId)` | Fetch danh sách connections của project |
| `DBConnectionListPanel` | UI hiển thị danh sách saved connections trong project |
| Wire `handleSave` → `POST /api/proxy/db-connections` | Thay mock hiện tại |
| Wire `handleTestConnection` → `POST /api/proxy/db-connections/test` | Thay mock hiện tại |
| Modal phải nhận `projectId` prop | Để gắn connection với đúng project |
| Edit modal (mở với data đã có, ẩn password) | Re-use `DBConnectionModal` với mode `edit` |

### 3.2 Backend (NestJS)

**Module mới**: `src/modules/db-connections/`

```
db-connections/
├── entity/
│   └── db-connection.entity.ts
├── dto/
│   ├── create-db-connection.dto.ts
│   ├── update-db-connection.dto.ts
│   └── test-db-connection.dto.ts
├── db-connections.controller.ts   (REST endpoints)
├── db-connections.service.ts
├── db-connections.module.ts
└── utils/
    ├── encryption.util.ts          # AES-256-GCM
    └── db-connector.factory.ts     # Connect thực tới DB
```

**Migration**: thêm bảng `db_connections`

---

## 4. Database Schema

### Bảng `db_connections`

| Column | Type | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `created_by` | UUID FK → `users.id` | Người sở hữu connection (không gắn trực tiếp với project) |
| `name` | VARCHAR(255) | Tên hiển thị |
| `dbms` | ENUM | postgresql / mysql / sqlserver / sqlite |
| `method` | ENUM | direct / ssh / local_agent |
| `status` | ENUM | connected / failed / untested |
| `host` | VARCHAR(255) | |
| `port` | INTEGER | nullable với SQLite |
| `database` | VARCHAR(255) | |
| `username` | VARCHAR(255) | |
| `password_encrypted` | TEXT | AES-256-GCM, không lưu plaintext |
| `ssl` | BOOLEAN | |
| `ssh_host` | VARCHAR, nullable | |
| `ssh_port` | INTEGER, nullable | |
| `ssh_username` | VARCHAR, nullable | |
| `ssh_auth_type` | ENUM, nullable | password / private_key |
| `ssh_password_encrypted` | TEXT, nullable | |
| `ssh_private_key_encrypted` | TEXT, nullable | |
| `last_tested_at` | TIMESTAMPTZ, nullable | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

> **Security**: Password và Private Key phải mã hóa bằng `AES-256-GCM` với key từ env (`DB_CONN_ENCRYPTION_KEY`). API response **không bao giờ trả về plaintext credential**.

---

## 5. API Endpoints

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/projects/:projectId/db-connections` | List connections của project |
| `POST` | `/api/projects/:projectId/db-connections` | Tạo connection mới |
| `GET` | `/api/projects/:projectId/db-connections/:connId` | Chi tiết (ẩn password) |
| `PATCH` | `/api/projects/:projectId/db-connections/:connId` | Cập nhật |
| `DELETE` | `/api/projects/:projectId/db-connections/:connId` | Xóa |
| `POST` | `/api/projects/:projectId/db-connections/test` | Test kết nối chưa lưu |
| `POST` | `/api/projects/:projectId/db-connections/:connId/test` | Test connection đã lưu |
| `POST` | `/api/projects/:projectId/db-connections/:connId/introspect` | Đọc schema thực từ DB |

---

## 6. Tái sử dụng connection giữa các project

### Vấn đề
Một DB (ví dụ production server) thường được dùng chung với nhiều project khác nhau. Người dùng không muốn nhập lại toàn bộ thông tin kết nối mỗi lần tạo project mới.

### Giải pháp: **Link khi tạo project mới**

Khi tạo project mới (`CreateProject` modal/page), user có thể **chọn một DB Connection đã lưu** từ các project của mình để link vào project mới ngay lúc đó.

**Cách hoạt động**:
1. User tạo project mới → form có thêm field optional **"Link DB Connection"**
2. Dropdown hiển thị tất cả DB connections đã được user tạo trước đó (từ các projects khác)
3. User chọn → project mới được liên kết với connection đó (tạo bản ghi `project_db_connections` mới trỏ tới cùng `db_connection_id`)
4. Nếu không chọn → bỏ qua, có thể thêm sau trong project settings

**Bảng liên kết `project_db_connections`** (thay vì `project_id` trực tiếp trong `db_connections`):

| Column | Type | Ghi chú |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID FK → `projects.id` | |
| `db_connection_id` | UUID FK → `db_connections.id` | |
| `linked_at` | TIMESTAMPTZ | |

Bảng `db_connections` lúc này **không có `project_id`** — connection là entity độc lập thuộc về `created_by` (người tạo). Nhiều project có thể link tới cùng 1 connection.

**API bổ sung**:

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/db-connections` | List tất cả connections của user hiện tại (để dropdown chọn khi tạo project) |
| `POST` | `/api/projects/:projectId/db-connections/link` | Link một connection đã có vào project |
| `DELETE` | `/api/projects/:projectId/db-connections/:connId/unlink` | Gỡ liên kết (không xóa connection) |

> **Đơn giản hóa**: Credential vẫn được lưu dùng chung, không cần nhập lại. Unlink chỉ xóa liên kết, không xóa connection thật. Nếu muốn xóa hẳn thì gọi `DELETE /api/db-connections/:connId`.

---

## 7. Roadmap theo Phase

### Phase 1 — Core (MVP) ✅ UI Done, ❌ Backend Missing
- [ ] Backend: entity + migration + CRUD API + encryption
- [ ] Frontend: wire API, thêm `projectId` prop vào modal
- [ ] Test Connection thật (dùng `pg` / `mysql2` / `mssql` / `sqlite3`)
- [ ] Connection list UI trong project settings

### Phase 2 — Schema Import
- [ ] Backend: Introspect endpoint (đọc `information_schema`)
- [ ] Frontend: Hiện danh sách tables → user chọn → import vào Physical Model
- [ ] Tạo `SchemaVersion` từ kết quả introspect

### Phase 3 — Sync & Diff
- [ ] So sánh Physical Model trong DBflow với schema thật → show diff
- [ ] Generate ALTER SQL từ diff
- [ ] Forward engineering (deploy model lên DB)

### Phase 4 — Reuse & Advanced
- [ ] **Link DB Connection khi tạo project mới** — dropdown chọn connection đã có trong `CreateProject` form
- [ ] **Unlink connection** khỏi project mà không xóa connection gốc
- [ ] Connection templates (vd: local Docker presets)
- [ ] SSH tunnel keep-alive management
