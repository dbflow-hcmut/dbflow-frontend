## diagram

* `id*`: Định danh sơ đồ (prefix `pid_`).
* `name*`: Tên sơ đồ.
* `viewport`: Thông tin hiển thị toàn cảnh sơ đồ.
  * `x`, `y`: Tọa độ gốc (offset).
  * `zoom`: Mức phóng to/thu nhỏ (0.1 → 5.0).
  * `gridSize`: Kích thước lưới.
  * `snapToGrid`: Có tự động bắt vào lưới không.
* `nodes*`: Danh sách node (bảng hoặc ghi chú).
* `edges*`: Danh sách cạnh (mũi tên FK hoặc liên kết ghi chú).

---

## node

* `id*`: Định danh node (prefix `pid_`).
* `type*`: `"table"`, `"note"`, `"sticky-note"`, `"text-label"`, `"drawing-path"`.
* `position*`: Tọa độ trên canvas (`x`, `y`).
* `size*`: Kích thước (`w`, `h`; minimum 20×20).
* `zIndex`: Lớp hiển thị.
* `style`: Style cơ bản (`class`, `stroke`, `fill`, `fontSize`).
* `name`: Tên hiển thị của node (thường là tên bảng).

### table node (type = "table")

* `tableId*`: Tham chiếu `table.id` trong model.json (prefix `pid_`).
* `columns`: Thứ tự và trang trí cột hiển thị.
  * `columnId*`: Tham chiếu `column.id` trong model.json (prefix `pid_`).
  * `label`: Tên hiển thị nếu khác tên gốc.
  * `decorations`: Style cột.
    * `pk`: Cột PK (gạch chân).
    * `fk`: Cột FK (đánh dấu).
    * `underline`: Ép hiển thị gạch chân.
    * `italic`: Hiển thị in nghiêng.

### note node (type = "note")

* `text`: Nội dung ghi chú.

---

## edge

* `id*`: Định danh cạnh (prefix `pid_`).
* `type*`: `"fk"` hoặc `"noteLink"`.
* `source*`: ID node nguồn (prefix `pid_`).
* `target*`: ID node đích (prefix `pid_`).
* `points`: Polyline — danh sách điểm (`x`, `y`) vẽ đường uốn lượn.
* `style`: Style đường (`stroke`, `fill`, `class`).
* `fkRef`: Tham chiếu FK cụ thể trong model.json (bắt buộc nếu type = `fk`).
  * `tableId`: ID bảng chứa FK (prefix `pid_`).
  * `foreignKeyIndex`: Chỉ số trong mảng FK (≥ 0).
  * `sourceColumnName`: Tên cột nguồn.
  * `targetColumnName`: Tên cột đích.
  * `onDelete`: Hành vi khi xóa (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
  * `onUpdate`: Hành vi khi cập nhật (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
* `labels`: Text hiển thị trên cạnh.
  * `text`: Nội dung.
  * `position`: Tọa độ đặt label (`x`, `y`).
