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
- **Credit / Quota**: hạn mức tài nguyên (chủ yếu AI request) theo Plan, tính
  theo **Team workspace** làm pool chung, có thêm lớp **per-member cap**
  (tùy chọn, do Admin/Owner cấu hình) và **per-member usage breakdown** (xem
  ai đang dùng bao nhiêu).
- **Role (workspace-level)**: Owner / Admin / Member / Viewer — bỏ role
  Billing riêng (gộp quyền billing vào Owner, Admin có thể xem nhưng không
  đổi gói).
- **Project ownership**: Team workspace → project thuộc **team**; Personal
  workspace → project thuộc **user**. "Creator" (người tạo ra) chỉ là
  metadata hiển thị, không quyết định quyền truy cập.
- **Project sharing mặc định trong Team**: mọi thành viên active mặc định
  thấy được project trong team (kiểu Figma), **trừ khi** project được đánh
  dấu **Private** (opt-in) — lúc đó mới cần mời riêng từng người.

## 4. Quyết định thiết kế đã chốt

| # | Quyết định |
|---|---|
| D1 | Xóa hoàn toàn chữ "Business" khỏi UI/code FE — dùng "Team" xuyên suốt. |
| D2 | Thêm UI hiển thị usage breakdown theo từng member trong tab "Plan & usage". |
| D3 | Thêm UI cho Admin/Owner set giới hạn credit riêng cho 1 member (optional cap). |
| D4 | Rút gọn role còn 4: Owner, Admin, Member, Viewer. Bỏ role Billing khỏi dropdown gán role. |
| D5 | Đổi default visibility của project trong Team workspace: member thấy hết project trừ project đánh dấu Private. |
| D6 | Gộp 2 luồng invite (workspace-invite / project-invite) cho Team workspace: accept workspace-invite → tự có quyền xem project public trong team, không cần bước mời riêng nữa (project-invite riêng chỉ còn cần cho project Private). |
| D7 | Project ownership hiển thị: Team workspace → hiển thị "thuộc về team", không hiển thị 1 user cụ thể là chủ sở hữu duy nhất có quyền tuyệt đối. |

## 5. Phạm vi refactor Frontend

### 5.1 Terminology / copy (D1)
- [ ] `src/app/pricing/page.tsx`: đổi toggle "Personal / Business" → "Personal / Team", đổi biến `Audience = "personal" | "business"` → `"personal" | "team"`.
- [ ] `src/app/pricing/configure/page.tsx`: đổi tên component `ConfigureBusinessPlanPage` → `ConfigureTeamPlanPage`, bỏ fallback string `"Business"` → `"Team"`.
- [ ] Rà toàn bộ `grep -ri business` trong `src/` để bắt hết chỗ còn sót (route, metadata title, alt text...).

### 5.2 Credit / usage per-member (D2, D3)
- [ ] Hoàn thiện trang `src/app/usage/page.tsx` (hiện đang là stub rỗng) hoặc gộp nội dung này vào tab "Plan & usage" của `WorkspaceSettings`.
- [ ] Thêm bảng breakdown "AI requests theo member" (cần API mới từ BE trả `usage_events` group theo `userId`).
- [ ] Thêm form set quota riêng cho từng member trong Members tab (chỉ hiện với role Owner/Admin) — cần API mới từ BE (`workspace_member_quota`).
- [ ] Hiển thị cảnh báo khi 1 member gần chạm giới hạn riêng của họ (khác với giới hạn chung workspace).

### 5.3 Role UI (D4)
- [ ] Bỏ option `billing` khỏi `ASSIGNABLE_ROLES` trong Members tab dropdown.
- [ ] Cập nhật copy mô tả từng role (thêm tooltip/mô tả ngắn cho Owner/Admin/Member/Viewer thay vì chỉ hiện tên).
- [ ] Xóa/migrate UI liên quan `WorkspaceRole.Billing` nếu còn dùng ở đâu khác (grep `"billing"` trong context role, không phải context billing-history).

### 5.4 Project ownership & sharing (D5, D6, D7)
- [ ] `ShareProject`: với project trong Team workspace, đổi default visibility hiển thị thành "Team can view" thay vì "Owner and invited" — chỉ cho phép chuyển sang Private nếu cần.
- [ ] Bỏ hiển thị "Owner" là 1 user cá nhân trong danh sách collaborator của project thuộc Team workspace; thay bằng "Created by {user}" (metadata) + quyền quản lý theo role team.
- [ ] `AcceptWorkspaceInvite`: sau khi accept, điều hướng thẳng vào danh sách project của team (vì giờ đã tự có quyền xem), bỏ nhu cầu chờ project-invite riêng cho project public.
- [ ] `AcceptInvite` (project-invite riêng): giữ lại nhưng chỉ áp dụng cho project được đánh dấu Private trong Team workspace, hoặc project trong Personal workspace (không đổi).
- [ ] `ProjectsList` / `useProjects`: đảm bảo query trả về đúng "mọi project trong team mà tôi active member" theo default mới, không chỉ project tôi có `user_projects` entry.

## 6. Phụ thuộc Backend (chặn trước khi làm FE)

Các mục sau **cần BE làm trước hoặc song song**, FE không tự làm được:

- API trả usage breakdown theo `userId` trong 1 workspace (D2).
- API tạo/sửa/xóa quota riêng cho từng member (`workspace_member_quota`) (D3).
- Đổi default `ProjectVisibility` khi tạo project trong Team workspace + logic "active workspace member tự có quyền view" (D5, D6).
- Gộp enum `WorkspaceType`/`PlanWorkspaceType`, bỏ role `billing` ở entity (D1, D4) — hoặc ít nhất FE cần biết BE còn trả `billing` trong response hay không để quyết định có filter ở FE hay chờ BE bỏ hẳn.

## 7. Thứ tự đề xuất

1. D1 (đổi tên "Business" → "Team") — làm được ngay, không phụ thuộc BE, rủi ro thấp.
2. D4 (rút gọn role UI) — làm được ngay nếu BE vẫn tạm chấp nhận giá trị `billing` cũ (chỉ ẩn khỏi UI, chưa cần BE đổi).
3. D2/D3 (credit per-member) — chờ BE có API, ưu tiên cao vì đúng pain point chính.
4. D5/D6/D7 (project ownership & default sharing) — thay đổi hành vi lớn nhất, cần BE đổi default visibility + access-check logic trước, nên làm sau cùng và cần test kỹ (ảnh hưởng tới toàn bộ luồng chia sẻ project hiện có).
