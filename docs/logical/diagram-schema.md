## diagram

* `id`: Định danh sơ đồ.
* `name`: Tên sơ đồ.
* `viewport`: Thông tin hiển thị toàn cảnh sơ đồ.
  * `x`, `y`: Tọa độ gốc (offset).
  * `zoom`: Mức phóng to/thu nhỏ (0.1 → 5.0).
  * `gridSize`: Kích thước lưới.
  * `snapToGrid`: Có tự động bắt vào lưới không.
* `nodes*`: Danh sách node (bảng hoặc ghi chú).
* `edges*`: Danh sách cạnh (mũi tên FK hoặc liên kết ghi chú).

---

## node

* `id*`: Định danh node (prefix `cid_`).
* `type*`: `"table"`, `"note"`, `"sticky-note"`, `"text-label"`, `"drawing-path"`.
* `position*`: Tọa độ trên canvas (`x`, `y`).
* `size*`: Kích thước (`w`, `h`; minimum 20×20).
* `zIndex`: Lớp hiển thị.
* `style`: Style cơ bản (`class`, `stroke`, `fill`, `fontSize`).
* `name`: Tên hiển thị của node (thường là tên bảng).

### table node (type = "table")

* `tableId*`: Tham chiếu `table.id` trong model.json (prefix `cid_`).
* `columns`: Thứ tự và trang trí cột hiển thị.
  * `columnId*`: Tham chiếu `column.id` trong model.json (prefix `lid_`).
  * `label`: Tên hiển thị nếu khác tên gốc.
  * `decorations`: Style cột.
    * `pk`: Cột PK (gạch chân).
    * `ck`: Cột candidate key.
    * `fk`: Cột FK (đánh dấu).

### note node (type = "note")

* `text`: Nội dung ghi chú.

---

## edge

* `id*`: Định danh cạnh (prefix `cid_`).
* `type*`: `"fk"` hoặc `"noteLink"`.
* `source*`: ID column nguồn (prefix `lid_`).
* `target*`: ID column đích (prefix `lid_`).
* `sourceSide`: Phía kết nối column nguồn (`left` / `right`).
* `targetSide`: Phía kết nối column đích (`left` / `right`).
* `points`: Polyline — danh sách điểm (`x`, `y`) vẽ đường uốn lượn.
* `style`: Style đường (`stroke`, `fill`, `class`).
* `fkRef`: Tham chiếu FK cụ thể trong model.json (bắt buộc nếu type = `fk`).
  * `tableId`: ID bảng chứa FK (prefix `cid_`).
  * `foreignKeyIndex`: Chỉ số trong mảng FK (≥ 0).
* `labels`: Text hiển thị trên cạnh.
  * `text`: Nội dung.
  * `position`: Tọa độ đặt label (`x`, `y`).
