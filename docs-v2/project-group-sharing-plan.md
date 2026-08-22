# Project Group Sharing — Design Plan

> **Status: Implemented.** Xem `docs-v2/workspace-team-permission-implementation-rules.md`
> §4 cho mô tả as-built chi tiết (data model thật, API thật, quy tắc truy cập
> thật). Tài liệu này giữ lại làm bối cảnh thiết kế/lý do quyết định.

## 1. Bối cảnh

Sau khi hoàn thành domain cleanup ở
`docs-v2/workspace-team-domain-cleanup-plan.md` (D1–D8), Team workspace hiện
tại chia sẻ project theo 2 chiều chồng lên nhau: workspace role (Owner/Admin/
Member/Viewer) và project-level visibility/ACL (`ProjectVisibility` +
`user_projects`). Bàn lại thấy có vài vấn đề:

- Mô hình per-project ACL kiểu GitLab (mời từng member vào từng project) quá
  phức tạp so với nhu cầu thực tế, tốn công quản lý (phải "share" lại mỗi khi
  tạo project mới).
- Mô hình đơn giản nhất ("workspace role quyết định hết, không có phân quyền
  theo project") lại **không cho phép giấu 1 project khỏi 1 phần thành viên
  trong cùng team** (vd project của khách hàng A không nên cho member đang
  làm dự án khách hàng B thấy).
- GitLab giải quyết đúng vấn đề này không phải bằng ACL từng project, mà bằng
  **Subgroup** — chia nhỏ 1 group lớn thành các group con có member riêng,
  project thuộc subgroup nào thì chỉ member subgroup đó thấy.

Quyết định: mượn ý tưởng Subgroup nhưng đơn giản hoá và đặt tên lại là
**Group**, tránh trùng nghĩa với "Team" (đã dùng cho loại workspace).

## 2. Định nghĩa thuật ngữ

- **Group**: 1 tập con thành viên trong 1 Team workspace, dùng để giới hạn
  project nào được thấy bởi ai. **Không phải** 1 loại workspace mới, không
  có billing/subscription riêng, không có role riêng — chỉ là 1 danh sách
  member con.
- **Group membership**: quan hệ nhiều-nhiều giữa User và Group (1 user có thể
  thuộc nhiều Group cùng lúc).
- **Project ↔ Group**: quan hệ 1-1 tuỳ chọn (1 project thuộc **tối đa 1**
  Group, hoặc không thuộc Group nào).

### Hai chiều phân quyền tách biệt, không trộn lẫn

| Chiều | Quyết định | Nguồn |
|---|---|---|
| **Capability** (làm được gì: edit hay chỉ view) | Workspace role: Owner/Admin/Member = edit, Viewer = view-only | `WorkspaceMemberEntity.role` (không đổi từ cleanup trước) |
| **Visibility** (thấy được project nào) | Project không thuộc Group nào → cả team thấy. Project thuộc Group X → chỉ member của Group X (+ Owner/Admin workspace) thấy | Group membership (mới) |

Không có role riêng trong Group — cố tình giữ đơn giản, tránh tạo ra 1 ma
trận quyền 3 chiều (workspace role × group role × project role).

## 3. Data model

### `groups` (bảng mới)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `workspace_id` | uuid FK → workspaces, CASCADE | Group luôn thuộc 1 workspace |
| `name` | varchar | vd "Backend Team", "Client ABC" |
| `created_at` / `updated_at` | timestamptz | |

### `group_members` (bảng mới)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `group_id` | uuid FK → groups, CASCADE | PK compound |
| `user_id` | uuid FK → users, CASCADE | PK compound |

Không cần bảng `group_invitations` riêng — chỉ add được người **đã là active
workspace member** (không mời email mới ở đây, giống nguyên tắc project hiện
tại: chỉ chia sẻ được trong nội bộ team).

### `projects` (đổi)

- Thêm cột `group_id` (uuid, FK → groups, **nullable**, `ON DELETE SET NULL`).
  - `NULL` = không thuộc Group nào → giữ nguyên hành vi hiện tại (mọi active
    workspace member thấy, theo default `anyone_can_edit` đã có từ D4/M6).
  - Có giá trị = chỉ member của Group đó (+ Owner/Admin workspace) thấy.
- **Personal workspace project**: không áp dụng Group (luôn `NULL`), vẫn dùng
  cơ chế mời email tự do hiện có (`ProjectVisibility` + `user_projects` +
  `project_invitations`) — không đổi gì ở nhánh Personal.

## 4. Quy tắc truy cập (thay cho `checkViewPermission`/`checkWritePermission` nhánh Team)

Với project thuộc **Team workspace**:

```
canView(user, project):
  if user.workspaceRole in [Owner, Admin]: true          # luôn thấy hết
  if project.groupId is NULL: true                        # không giới hạn Group
  if user thuộc project.groupId: true
  else: false

canEdit(user, project):
  if not canView(user, project): false
  return user.workspaceRole in [Owner, Admin, Member]      # Viewer luôn chỉ-view
```

- Không còn dùng `user_projects`/`ProjectVisibility`/`project_invitations`
  cho nhánh Team — coi như **deprecate cho Team workspace**, giữ nguyên cho
  Personal workspace.
- `getAllProjects` (list): với Team workspace, where-clause đổi thành
  `project.group_id IS NULL OR EXISTS (group_members của user cho group đó)
  OR user là Owner/Admin`, bỏ điều kiện dựa trên `user_projects`/visibility
  cũ (những cột đó coi như không dùng nữa ở nhánh Team).

## 5. UI/flow

### 5.1 Quản lý Group — tab mới "Groups" trong `WorkspaceSettings`

- Chỉ hiện với Team workspace, chỉ Owner/Admin thấy/thao tác được (cùng điều
  kiện `canManageWorkspace` đã dùng cho tab Activity log).
- Danh sách Group hiện có, mỗi Group: tên, danh sách member, nút "+ Add
  member" (chọn từ dropdown — danh sách lấy từ `getWorkspaceMembers`, không
  phải gõ email), nút xoá member khỏi Group, nút "Create group", nút xoá cả
  Group (project thuộc Group đó tự chuyển về `group_id = NULL`, tức là lại
  share cho cả team — cần cảnh báo rõ trong confirm dialog trước khi xoá).

### 5.2 Gán Project vào Group

- **Lúc tạo project**: thêm 1 `Select` "Group" (optional, mặc định "No
  group") ngay sau chọn Workspace, chỉ hiện khi workspace đã chọn là Team và
  đã có ít nhất 1 Group.
- **Sau khi tạo**: thêm vào `ShareProject` (hoặc màn hình project settings)
  1 dropdown đổi Group của project — chỉ Owner/Admin hoặc creator được đổi
  (dùng lại `checkOwnership`/`isOwnerOrAdmin` đã có từ Milestone 6).
- Bỏ hẳn phần chọn "Anyone can view/edit/Owner and invited" hiện tại trong
  `ShareProject` cho Team project — thay bằng dropdown chọn Group nói trên.
  Giữ nguyên visibility selector cũ cho Personal project.

## 6. Việc cần làm rõ trước khi code — đã chốt, đúng như implement

1. **Xoá 1 user khỏi workspace** → tự động xoá khỏi mọi Group họ đang ở.
   Implement: `GroupsService.removeUserFromWorkspaceGroups`, gọi từ
   `WorkspacesService.removeMember`/`leaveWorkspace`.
2. **Đổi role 1 member** → không ảnh hưởng Group membership. 2 chiều độc lập
   như thiết kế (capability = role, visibility = Group).
3. **Giới hạn số Group**: chưa giới hạn — không phải resource tính phí.
4. **Log vào `workspace_audit_logs`**: đã làm cho `group.create`,
   `group.delete`, `group.member.add`, `group.member.remove`, và
   `project.group_change`.
5. **(Phát sinh khi code) Ai được xem danh sách Group?** Ban đầu định Owner/
   Admin-only giống hệt quyền tạo/xoá Group, nhưng phát hiện Member thường
   cần thấy list Group để chọn lúc tạo project. Chốt: **list là read cho mọi
   active workspace member; create/delete/quản lý member trong Group vẫn
   Owner/Admin-only.**

## 7. Phạm vi implement — DONE

**Backend:**
- [x] Module `groups` riêng (`GroupEntity`, `GroupMemberEntity`, migration
  `1784800800000-CreateGroups.ts`) — không đặt trong `workspaces` để tránh
  circular module dependency (xem quyết định kỹ thuật ở
  `workspace-team-permission-implementation-rules.md` §4.2).
- [x] Migration thêm cột `projects.group_id` (nullable, `ON DELETE SET NULL`).
- [x] `GroupsService` CRUD group + add/remove member, list = mọi active
  member đọc được, còn lại Owner/Admin-only.
- [x] `ProjectsService.checkViewPermission`/`checkWritePermission`/
  `getAllProjects`/`createProject` sửa theo nhánh Team (Group-based),
  Personal workspace giữ nguyên logic cũ.
- [x] API: `GET/POST /workspaces/:id/groups`, `DELETE
  /workspaces/:id/groups/:groupId`, `POST/DELETE
  /workspaces/:id/groups/:groupId/members/:userId`, `PATCH
  /projects/:id/group`.
- [x] Instrument `workspace_audit_logs` cho `group.create`/`group.delete`/
  `group.member.add`/`group.member.remove`/`project.group_change`.

**Frontend:**
- [x] Tab "Groups" mới trong `WorkspaceSettings` (Owner/Admin only).
- [x] API client `src/api/groups/client.ts`.
- [x] `CreateProject`: thêm Group selector (chỉ hiện khi workspace Team và có
  ít nhất 1 Group).
- [x] `ShareProject`: nhánh riêng cho Team project — thay toàn bộ UI
  email-invite + visibility select bằng 1 Group selector; Personal project
  giữ nguyên UI cũ không đổi.

**Không đổi:** workspace role (D3), quota per-seat (D2/D7), workspace audit
log cơ chế chung (D8), Personal workspace project sharing (giữ email-invite
tự do như hiện tại).

**Đã xác minh:** `tsc --noEmit` + `eslint` sạch trên toàn bộ file đã
sửa/thêm ở cả 2 repo. **Chưa xác minh:** chưa chạy migration thật trên DB,
chưa khởi động app, chưa test bằng tài khoản thật — cần làm trước khi merge,
đặc biệt test 4 case: Owner/Admin thấy project dù không ở Group; Member
trong Group thấy+sửa được; Member không ở Group bị chặn (cả khi mở trực
tiếp lẫn trong danh sách project); xoá Group thì project quay lại hiện cho
cả team.
