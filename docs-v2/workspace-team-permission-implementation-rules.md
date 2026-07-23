# Workspace & Team Permission Implementation Rules

## 1. Trạng thái và vị trí code

Tài liệu này mô tả workspace/team foundation đã được implement ở backend.

Code chính:

- `dbflow-backend/src/modules/workspaces/workspace.enums.ts`
- `dbflow-backend/src/modules/workspaces/entity/workspace.entity.ts`
- `dbflow-backend/src/modules/workspaces/entity/workspace-member.entity.ts`
- `dbflow-backend/src/modules/workspaces/entity/workspace-invitation.entity.ts`
- `dbflow-backend/src/modules/workspaces/workspaces.service.ts`
- `dbflow-backend/src/modules/workspaces/workspaces.controller.ts`
- `dbflow-backend/src/migrations/1778100000000-CreateWorkspacesTables.ts`
- `dbflow-backend/src/migrations/1778200000000-CreateWorkspaceInvitationsTable.ts`
- `dbflow-backend/src/migrations/1778300000000-AddWorkspaceOwnershipToResources.ts`
- `dbflow-backend/src/modules/auth/auth.controller.ts`
- `dbflow-backend/src/modules/auth/auth.service.ts`
- `dbflow-frontend/src/app/accept-workspace-invite/page.tsx`
- `dbflow-frontend/src/components/CreateProject/index.tsx`
- `dbflow-frontend/src/components/Sidebar/index.tsx`
- `dbflow-frontend/src/app/projects/page.tsx`
- `dbflow-frontend/src/components/WorkspaceSettings/index.tsx`
- `dbflow-frontend/src/components/SettingsModal/index.tsx`

## 2. Data model hiện tại

### Workspace

- Type: `personal | team`.
- Status: `active | suspended | archived`.
- Có `owner_user_id` riêng để xác định owner chính.
- Slug là unique và được tạo từ tên cộng random suffix.
- Personal workspace bị giới hạn một workspace trên mỗi owner bằng partial
  unique index.

### Workspace member

- Primary key: `(workspace_id, user_id)`.
- Role: `owner | admin | billing | member | viewer`.
- Status: `active | suspended`.
- Owner cũng bắt buộc có một membership với role `owner`.

### Workspace invitation

- Status: `pending | accepted | revoked | expired`.
- Raw invitation token chỉ gửi qua email; database lưu SHA-256 hash.
- Invitation hết hạn sau 7 ngày.
- Chỉ một pending invitation được tồn tại cho cùng workspace/email.

## 3. Runtime flows

### User đăng ký bằng email/password

1. Tạo user.
2. Gọi `ensurePersonalWorkspace`.
3. Nếu chưa có personal workspace, tạo workspace và owner membership trong
   cùng database transaction.

### User đăng nhập bằng Google

1. Find hoặc create Google user.
2. Gọi `ensurePersonalWorkspace`.
3. Flow idempotent: workspace đã tồn tại thì không tạo thêm.

### Backfill user hiện tại

Migration tạo personal workspace và owner membership cho toàn bộ user chưa có.
Slug backfill dùng `personal-<user uuid>` để đảm bảo unique.

### Tạo team

1. Authenticated user gửi tên team.
2. Tạo `team` workspace.
3. Tạo owner membership cho user trong cùng transaction.
4. Nếu một bước lỗi, toàn bộ transaction rollback.
5. Frontend persist team mới làm active workspace rồi mở Settings modal trực
   tiếp ở tab Workspace. Không có route settings riêng theo workspace.

### Invite và accept

1. Owner/admin mời email với role không phải owner.
2. Service từ chối nếu user đã là member hoặc pending invite còn hiệu lực.
3. Tạo secure random token, lưu hash và gửi raw token qua email.
4. User đăng nhập và accept bằng token.
5. Backend lock riêng row invitation (không join relation trong câu `FOR
   UPDATE`), sau đó tải workspace để kiểm tra status. Cách tách query tránh
   PostgreSQL áp dụng row lock lên nullable side của outer join.
6. Tạo membership và chuyển invitation sang accepted trong cùng transaction.

### Transfer ownership

1. Chỉ owner hiện tại được transfer team workspace.
2. Target phải là active member.
3. Lock owner membership, target membership và workspace.
4. Owner cũ chuyển thành admin, target thành owner và `owner_user_id` được đổi
   trong cùng transaction.

### Resource ownership migration

- `projects.workspace_id` và `db_connections.workspace_id` là required.
- Project cũ được backfill về personal workspace của `owner_id`.
- DB connection cũ được backfill về personal workspace của `created_by`.
- `owner_id` và `created_by` vẫn là actor/creator; workspace là resource owner
  và billing subject tương lai.

### Tạo project và DB connection

- Create project/connection có thể gửi `workspaceId`; nếu thiếu thì dùng
  personal workspace để giữ backward compatibility.
- Role được tạo resource: owner, admin, member.
- Billing và viewer role không được tạo resource.
- DB connection tạo từ project tự kế thừa workspace của project.
- Connection không thể link sang project thuộc workspace khác.

### Active workspace UI

- Sidebar tải workspace list và lưu lựa chọn vào
  `localStorage.active_workspace_id`.
- Trên Projects route, đổi workspace cập nhật query `workspaceId` và reset page
  về 1.
- Khi mở `/projects` bằng URL chưa có `workspaceId` (bao gồm refresh URL cũ),
  client khôi phục workspace hợp lệ đã lưu, ghi nó vào query và tải lại danh
  sách theo workspace đó. Link Projects trong sidebar cũng luôn giữ active
  workspace trong query.
- Server Projects page forward `workspaceId` xuống backend để render đúng list.
- Create Project mặc định dùng active workspace; nếu chưa có thì ưu tiên
  personal workspace.
- Client create-project dùng một entry point chung: nếu caller (AI chat, import
  DDL hoặc DB introspection) không truyền `workspaceId`, request tự lấy
  `localStorage.active_workspace_id`. Backend vẫn quyết định fallback và kiểm
  tra membership nếu client không có preference hợp lệ.
- Active workspace trong localStorage chỉ là UI preference. Backend luôn kiểm
  tra membership lại.
- Khi mở project trực tiếp, frontend đồng bộ active workspace thành
  `project.workspaceId`. Billing/quota của project-scoped operation vẫn do
  backend resolve từ project, không tin UI preference.

### Workspace management UI

- Settings được mount thành modal toàn cục trong AppShell và chỉ xuất hiện trong
  account popup khi người dùng click avatar. Entry Settings phát event
  `dbflow:open-settings`; không có mục Settings trong navigation chính và không
  còn route `/settings`.
- Modal dùng navigation Profile, Security và Workspace ở cột trái; nội dung
  workspace tiếp tục dùng active workspace hiện tại.
- Workspace settings điều khiển tab con bằng state (`activeKey`); các thao tác
  reload data như invite, đổi role, remove hoặc revoke không được reset người
  dùng về tab General.
- Sidebar cho phép tạo Team; workspace mới vẫn mở trang quản lý workspace cụ
  thể sau khi tạo thành công.
- General tab sửa workspace name theo permission backend.
- Members tab hỗ trợ invite, đổi role và remove member.
- Invitations tab list/revoke pending invitations.
- Billing history tab chỉ mở cho workspace role `owner` hoặc `billing`; các role
  khác bị disable ngay trên UI và backend vẫn kiểm tra permission.
- Owner có transfer ownership; non-owner member có leave action.
- UI ẩn action không phù hợp theo `currentUserRole`, nhưng backend vẫn là nguồn
  authorization cuối cùng.

## 4. Permission rules hiện tại

- Chỉ active member mới list/get workspace.
- Archived workspace được xem như không tồn tại đối với member API.
- Suspended workspace trả forbidden.
- Chỉ `owner` và `admin` được update name/avatar.
- Mọi active member được list members của workspace.
- Owner/admin được invite, revoke invitation, đổi role và remove member.
- Admin không được đổi/xóa một admin khác.
- Owner không được đổi role hoặc bị remove trực tiếp.
- Owner team phải transfer ownership trước khi leave.
- Personal workspace không được invite member, leave hoặc transfer ownership.
- API không tin workspace ownership từ request body; membership được query từ
  database bằng authenticated user ID.
- Team project yêu cầu active workspace membership trước khi xét project
  permission.
- Personal project vẫn giữ project collaborator behavior hiện tại.
- Team project chỉ mời được user đã là active workspace member.

## 5. API hiện tại

```http
GET   /workspaces
POST  /workspaces
GET   /workspaces/:workspaceId
PATCH /workspaces/:workspaceId
GET   /workspaces/:workspaceId/members
GET   /workspaces/:workspaceId/invitations
POST  /workspaces/:workspaceId/invitations
DELETE /workspaces/:workspaceId/invitations/:invitationId
PATCH /workspaces/:workspaceId/members/:targetUserId/role
DELETE /workspaces/:workspaceId/members/:targetUserId
POST  /workspaces/:workspaceId/leave
POST  /workspaces/:workspaceId/transfer-ownership
POST  /workspace-invitations/accept
```

Tất cả endpoint dùng `JwtAuthGuard` và cookie JWT hiện có.

## 6. Edge cases và limitations

- Workspace chưa phải billing owner trong code subscription vì billing chưa
  được implement.
- Chưa có seat quota.
- Chưa có scheduled job đánh dấu invitation hết hạn; expiry vẫn được enforce khi
  accept.
- Email delivery đang best-effort. Nếu gửi mail lỗi, invitation vẫn tồn tại và
  hiện chưa có resend endpoint.
- Slug hiện không cho user tự chọn và không tự đổi khi đổi workspace name.
- Personal workspace được tạo sau khi user đã save. Nếu workspace creation lỗi,
  registration request lỗi nhưng user record có thể đã tồn tại; slice sau nên
  cân nhắc transaction/outbox hoặc repair-on-login.

## 7. Bước tiếp theo

1. Workspace permission guard/decorator dùng lại giữa các modules.
2. Resend invitation và scheduled expiry cleanup.
3. Plan, subscription, seat quota và entitlement theo workspace.
