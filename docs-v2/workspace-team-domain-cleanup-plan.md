# Workspace / Team / Credit / Role — Domain Cleanup Plan (Frontend)

## 1. Bối cảnh

Feedback hiện tại về domain model:

- "Workspace" và gói "Business" đang bị định nghĩa lộn xộn, dùng lẫn với nhau.
- Credit trong 1 team đang là 1 pool dùng chung — 1 thành viên có thể xài hết
  credit của cả team, không có giới hạn theo từng người.
- Role trong workspace đang quá đơn giản, có role gần như không có logic
  riêng (`billing`, `viewer`).
- Chưa rõ: thành viên chung 1 team workspace có tự động chung project như
  Figma không (hiện tại là không, và có mâu thuẫn giữa copy UI và hành vi
  thật).

Tài liệu này chốt lại glossary + quyết định thiết kế, và liệt kê phạm vi cần
sửa ở **frontend** để chuẩn bị refactor. Backend đổi tương ứng là điều kiện
tiên quyết cho phần lớn các mục dưới đây — xem mục 6.

## 2. Hiện trạng (as-is) — tóm tắt

| Khái niệm | Thực tế trong code hiện tại | File liên quan (FE) |
|---|---|---|
| Workspace | `type: personal \| team`, không có bảng Team riêng | `src/api/workspaces/client.ts` |
| "Business" | Không tồn tại trong data model — chỉ là nhãn UI trên `/pricing`, mọi nơi khác gọi là "Team" | `src/app/pricing/page.tsx`, `src/app/pricing/configure/page.tsx` (component tên `ConfigureBusinessPlanPage`) |
| Plan (gói) | Catalog giá + `limits` + `features`, không gắn tổ chức | `src/api/subscriptions/client.ts` |
| Credit | Không có wallet/entity riêng — chỉ 1 con số `aiRequests.used/limit` theo **workspace**, không tách theo user | `WorkspaceEntitlements.usage.aiRequests`, tab "Plan & usage" trong `WorkspaceSettings` |
| Role (workspace) | `owner/admin/billing/member/viewer` — chỉ Owner/Admin có logic phân biệt thật sự | `WorkspaceRole` type, Members tab trong `WorkspaceSettings` |
| Permission (project) | Enum riêng `owner/editor/viewer/invited`, độc lập với WorkspaceRole | `ProjectPermission` (`src/utils/constants.ts`), `ShareProject` |
| Project ownership | `ownerId` là 1 user cụ thể, có quyền tuyệt đối bất kể role trong team | `ProjectResponse.owner` |
| Project sharing trong team | Mặc định phải mời riêng từng project (`owner_and_invited`); accept workspace-invite copy lại ngầm nói "vào workspace là vào được hết project" — mâu thuẫn | `AcceptWorkspaceInvite`, `ShareProject` |

## 3. Glossary chuẩn hóa (target)

- **Workspace**: container gốc chứa member + project + billing. Có 2 loại:
  - **Personal workspace**: 1 người, không có role/member khác, project thuộc
    về chính người dùng.
  - **Team workspace**: nhiều người, có role, billing riêng, project thuộc về
    **team** chứ không thuộc cá nhân.
- **Plan (gói)**: cấu hình giá + hạn mức. Không phải là loại tổ chức. "Business"
  **không phải type riêng** — nếu marketing muốn giữ tên này thì chỉ là
  `Plan.name` hiển thị (vd Plan tên "Business" áp cho Team workspace), không
  bao giờ xuất hiện như 1 loại workspace hay 1 khái niệm kỹ thuật riêng.
- **Subscription**: Workspace nào đang dùng Plan nào, trạng thái billing.
- **Credit / Quota**: hạn mức tài nguyên (chủ yếu AI request) theo Plan,
  hiểu là **mức cố định cho mỗi seat**, không phải tổng pool của cả team
  (mô hình giống Claude.ai Team/Enterprise). Mọi member trong 1 team workspace
  có hạn mức bằng nhau, không ai cấu hình riêng cho ai; dùng hết phần của
  mình thì bị chặn, không đụng tới phần người khác, không cộng dồn/rollover.
  Quota này chỉ áp dụng cho project **thuộc team workspace đó** — không dùng
  chéo sang project cá nhân của member (xem D7).
- **Role (workspace-level)**: Owner / Admin / Member / Viewer — bỏ role
  Billing riêng (gộp quyền billing vào Owner, Admin có thể xem nhưng không
  đổi gói).
- **Project ownership**: Team workspace → project thuộc **team**; Personal
  workspace → project thuộc **user**. "Creator" (người tạo ra) chỉ là
  metadata hiển thị, không quyết định quyền truy cập.
- **Project sharing mặc định trong Team**: mọi thành viên active mặc định
  thấy được project trong team (kiểu Figma), **trừ khi** project được đánh
  dấu **Private** (opt-in) — lúc đó mới cần mời riêng từng người.

## 4. Permission matrix — Role trong Team workspace

| Chức năng | Owner | Admin | Member | Viewer |
|---|---|---|---|---|
| Xem project trong team | ✅ | ✅ | ✅ | ✅ |
| Tạo / sửa / xóa project | ✅ | ✅ | ✅ | ❌ |
| Đánh dấu project Private / đổi visibility | ✅ | ✅ | Chỉ với project mình tạo | ❌ |
| Mời thành viên vào team (role Member/Viewer) | ✅ | ✅ | ❌ | ❌ |
| Mời/xóa Admin khác | ✅ | ❌ | ❌ | ❌ |
| Xóa thành viên khỏi team | ✅ | ✅ (trừ Owner/Admin khác) | ❌ | ❌ |
| Đổi tên/avatar workspace | ✅ | ✅ | ❌ | ❌ |
| Xem billing / lịch sử thanh toán | ✅ | Xem được, không sửa | ❌ | ❌ |
| Đổi gói (upgrade/downgrade/cancel) | ✅ | ❌ | ❌ | ❌ |
| Chuyển quyền Owner cho người khác | ✅ | ❌ | ❌ | ❌ |
| Xóa workspace | ✅ | ❌ | ❌ | ❌ |
| Xem báo cáo AI usage theo từng member | ✅ | ✅ | ❌ (chỉ xem phần mình dùng) | ❌ |

Nguyên tắc chung:
- **Owner** = người chịu trách nhiệm cuối cùng (billing, xóa team, chuyển giao) — chỉ có 1 người/team.
- **Admin** = vận hành hằng ngày (quản lý người, quản lý project, kiểm soát credit) nhưng không đụng vào tiền/xóa team.
- **Member** = người làm việc thực tế, tạo và sửa được project nhưng không quản lý người khác.
- **Viewer** = chỉ xem, dùng cho khách mời/stakeholder, không tốn quyền tạo/sửa.

## 5. Quyết định thiết kế đã chốt

| # | Quyết định |
|---|---|
| D1 | Xóa hoàn toàn chữ "Business" khỏi UI/code FE — dùng "Team" xuyên suốt. |
| D2 | **Quota per-seat cố định (mô hình Claude.ai Team/Enterprise)**: mỗi member trong team workspace được cấp đúng 1 mức AI-request/tháng bằng nhau (giá trị lấy từ `Plan.limits`, hiểu là "mỗi seat" chứ không phải tổng workspace). Track riêng theo `(workspaceId, userId, metric, periodKey)`. Không có pool chung, không có cấu hình riêng theo từng người, không rollover phần dư, member mới vào tự động có cùng mức như mọi người. |
| D3 | Rút gọn role còn 4: Owner, Admin, Member, Viewer. Bỏ role Billing khỏi dropdown gán role. |
| D4 | Đổi default visibility của project trong Team workspace: member thấy hết project trừ project đánh dấu Private. |
| D5 | Gộp 2 luồng invite (workspace-invite / project-invite) cho Team workspace: accept workspace-invite → tự có quyền xem project public trong team, không cần bước mời riêng nữa (project-invite riêng chỉ còn cần cho project Private). |
| D6 | Project ownership hiển thị: Team workspace → hiển thị "thuộc về team", không hiển thị 1 user cụ thể là chủ sở hữu duy nhất có quyền tuyệt đối. |
| D7 | **Quota không dùng chéo giữa workspace**: quota per-seat của 1 team chỉ áp dụng cho project thuộc team workspace đó. Project cá nhân của cùng 1 user luôn tính theo quota của Personal workspace riêng (thường thấp hơn/free tier), không được "mượn" phần quota dư của team. Đây là quyết định có chủ đích (giống Claude/Copilot Business: seat gắn với tổ chức, không mang sang tài khoản cá nhân), không phải giới hạn kỹ thuật cần nới lỏng sau này. |
| D8 | **Thêm Workspace audit log**: hiện tại chỉ có audit log ở tầng platform-admin (`admin_audit_logs`, chỉ ghi hành động của site admin như `plan.create`/`user.status.update`). Không có log nào cho hành động xảy ra bên trong 1 team workspace (đổi role member, mời/xóa member, đổi visibility project, chuyển ownership, đổi/hủy subscription do chính Owner làm). Thêm bảng `workspace_audit_logs` riêng, cùng cấu trúc actor/action/targetType/targetId/beforeData/afterData/createdAt như `admin_audit_logs`, nhưng scope theo `workspaceId`. Hiển thị cho Owner/Admin xem trong 1 tab "Activity log" của Workspace Settings. |

## 6. Phạm vi refactor Frontend

### 6.1 Terminology / copy (D1)
- [x] `src/app/pricing/page.tsx`: đổi toggle "Personal / Business" → "Personal / Team", đổi biến `Audience = "personal" | "business"` → `"personal" | "team"`.
- [x] `src/app/pricing/configure/page.tsx`: đổi tên component `ConfigureBusinessPlanPage` → `ConfigureTeamPlanPage`, bỏ fallback string `"Business"` → `"Team"`.
- [x] Rà toàn bộ `grep -ri business` trong `src/` để bắt hết chỗ còn sót (route, metadata title, alt text...) — không còn kết quả nào.

### 6.2 Credit / usage per-seat (D2, D7)
- [x] Gộp vào tab "Plan & usage" của `WorkspaceSettings` thay vì trang `/usage` riêng (trang đó vẫn còn là stub, để lại cho việc dọn dẹp sau).
- [x] Thêm bảng "AI requests by member" (Owner/Admin thấy mọi người, Member/Viewer chỉ thấy đúng 1 dòng của họ — BE tự scope qua `GET /workspaces/:id/usage/ai-requests`, FE chỉ ẩn bảng khi có ≤1 dòng để khỏi trùng với số tổng hợp phía trên).
- [x] Không có UI cấu hình custom cap riêng theo member — đúng theo D2 (mọi seat bằng nhau).
- [x] Quota mỗi workspace luôn resolve theo `workspaceId` của chính project/entitlements đó (đã có sẵn từ kiến trúc cũ) — Personal workspace và Team workspace không chia sẻ counter (D7), không cần thêm code chặn.

### 6.3 Role UI (D3)
- [x] Bỏ option `billing` khỏi `ASSIGNABLE_ROLES` trong Members tab dropdown (giữ nguyên `WorkspaceRole.Billing` ở BE/type, chỉ ẩn khỏi UI để fade out tự nhiên).
- [x] Thêm mô tả ngắn cho từng role qua `optionRender` (Admin/Member/Viewer) ở cả 2 chỗ chọn role (dropdown trong bảng Members + modal Invite team member).
- [x] Rà lại — `canViewBilling` (dòng ~139) vẫn cố ý giữ check `"billing"` để member cũ còn role này không mất quyền xem billing history cho tới khi được đổi role; không phải chỗ cần xóa.

### 6.4 Project ownership & sharing (D4, D5, D6) — DONE
- [x] BE `ProjectsService.createProject`: default visibility = `AnyoneCanEdit` cho project trong Team workspace (Figma-style), giữ `OwnerAndInvited` cho Personal workspace.
- [x] BE `ProjectsService.getAllProjects`: viết lại query để trả về cả project mà user chỉ có quyền qua workspace membership + visibility public (trước đây chỉ trả project có `user_projects` entry riêng).
- [x] BE `checkOwnership`/`deleteProject`: workspace Owner/Admin (không chỉ người tạo) quản lý được project trong Team workspace (đổi visibility, quản lý collaborator, xóa project) qua `WorkspacesService.isOwnerOrAdmin` mới.
- [x] BE `getProjectPermissions`/`getAllProjectPermissions`: thêm field `canManage` và `workspace_type` để FE biết ai thực sự được quản lý (không chỉ dựa vào `permission === owner`), và `formatProjectResponse` thêm `createdBy` song song `owner` (metadata, không phải quyền lực tối cao).
- [x] FE `ShareProject`: `currentUserCanEdit` đổi sang dùng `canManage` (sửa đúng bug — trước đây admin team sẽ không thấy nút quản lý dù BE đã cho phép); nhãn "Owner"→"Created by", "Any one can edit/view"→"Everyone in workspace can edit/view" khi là Team project để rõ ràng là chia sẻ trong phạm vi team, không phải public Internet.
- [x] FE `ProjectsList`: sửa `isOwner()` để nhận diện cả Owner/Admin của Team workspace — tránh bug UI hiển thị nhầm "Leave Project" trong khi backend thực chất xóa toàn bộ project.
- [x] `AcceptWorkspaceInvite`/`AcceptInvite`: không cần sửa code — hành vi mới khớp đúng với copy đã có sẵn ("access the workspace and its projects").

### 6.5 Audit log (D8)
- [x] **Quick win — admin audit log (không cần chờ BE)**: đã thêm trang `src/app/admin/audit-logs/page.tsx` (bảng thời gian/admin/action/target/reason, expand row xem before→after JSON diff), API client `getAdminAuditLogs()` trong `src/api/admin/client.ts`, nav entry trong `AdminSidebar`, và link từ dòng chú thích ở `/admin/plans`.
- [x] **Workspace audit log**: bảng `workspace_audit_logs` (migration `1784797200000-CreateWorkspaceAuditLogs.ts`), `WorkspacesService.logActivity`/`listAuditLogs`, instrument `updateMemberRole`/`removeMember`/`transferOwnership`/`inviteMember`/`revokeInvitation` và `ProjectsService.updateProjectVisibility`. API `GET /workspaces/:id/audit-logs`. FE: tab "Activity log" trong `WorkspaceSettings` (Owner/Admin only, không cần feature-flag `team_roles`), bảng thời gian/actor/action/target + expand xem before→after. Chưa log riêng cho đổi/hủy subscription (chưa rõ BE có action owner-driven riêng cho việc đó ngoài Stripe webhook) — để lại cho lần sau nếu cần.

## 7. Phụ thuộc Backend (chặn trước khi làm FE)

Các mục sau **cần BE làm trước hoặc song song**, FE không tự làm được:

- [x] Đổi khóa bảng usage-counter từ `(workspaceId, metric, periodKey)` →
  `(workspaceId, userId, metric, periodKey)` — migration
  `1784793600000-AddUserScopeToUsageCounters.ts` (rebuild counters từ
  `usage_events` ledger, không reset về 0); `UsageService.reserve/transition`
  và `SubscriptionsService.getEntitlements/assertExportQuota` đã thread
  `userId` qua toàn bộ truy vấn `usage_counters` (áp dụng cho cả
  `ai_requests_monthly` lẫn `exports_monthly` vì dùng chung 1 bảng).
- [x] API `GET /workspaces/:workspaceId/usage/ai-requests` (`subscriptions.controller.ts`)
  → `SubscriptionsService.getMemberUsageBreakdown`, Owner/Admin thấy mọi
  member, còn lại chỉ thấy chính mình.
- [x] Limit trong `Plan.limits` vốn đã được dùng trực tiếp làm giới hạn (không
  nhân theo `quantity`/seats ở đâu cả) — chuyển sang per-seat chỉ cần đổi khóa
  truy vấn, không cần đổi đơn vị số liệu.
- Đổi default `ProjectVisibility` khi tạo project trong Team workspace + logic "active workspace member tự có quyền view" (D4, D5).
- Gộp enum `WorkspaceType`/`PlanWorkspaceType`, bỏ role `billing` ở entity (D1, D3) — hoặc ít nhất FE cần biết BE còn trả `billing` trong response hay không để quyết định có filter ở FE hay chờ BE bỏ hẳn.
- Tạo bảng `workspace_audit_logs` + service ghi log tại các điểm thay đổi trong `workspaces.service.ts`/`projects.service.ts`/`subscriptions.service.ts` (đổi role, mời/xóa member, đổi visibility, chuyển ownership, đổi/hủy subscription) + API `GET /workspaces/:id/audit-logs` (D8). Riêng phần admin audit log **không cần việc BE nào** — API đã có sẵn, chỉ thiếu FE.

## 8. Thứ tự đề xuất

1. D1 (đổi tên "Business" → "Team") — làm được ngay, không phụ thuộc BE, rủi ro thấp.
2. D8 phần admin audit log UI — làm được ngay, API đã có sẵn, không phụ thuộc BE, quick win.
3. D3 (rút gọn role UI) — làm được ngay nếu BE vẫn tạm chấp nhận giá trị `billing` cũ (chỉ ẩn khỏi UI, chưa cần BE đổi).
4. D2/D7 (quota per-seat cố định) — chờ BE đổi khóa usage-counter theo user, ưu tiên cao vì đúng pain point chính.
5. D8 phần workspace audit log — chờ BE có bảng + API mới, làm sau khi các mục quota/role ổn định vì sẽ log chính các hành động đó.
6. D4/D5/D6 (project ownership & default sharing) — thay đổi hành vi lớn nhất, cần BE đổi default visibility + access-check logic trước, nên làm sau cùng và cần test kỹ (ảnh hưởng tới toàn bộ luồng chia sẻ project hiện có).
