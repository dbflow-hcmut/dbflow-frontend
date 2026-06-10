## model (Thông tin mô hình)

* `id*`: Định danh schema (prefix `lid_`).
* `name*`: Tên schema.
* `version*`: Phiên bản (integer ≥ 1).
* `notes`: Ghi chú.

---

## table (Bảng)

* `id*`: Định danh bảng (prefix `lid_`).
* `name*`: Tên bảng.
* `columns*`: Danh sách các cột của bảng (≥ 1).
* `functionalDependencies`: Danh sách FD nội bộ.
* `notes`: Ghi chú.

---

## column (Cột)

* `id*`: Định danh cột (prefix `lid_`).
* `name*`: Tên cột.
* `nullable*`: Cho phép `NULL` hay không (mặc định `true`).
* `unique*`: UNIQUE đơn cột (mặc định `false`).
* `roles`: Các vai trò khóa của cột.
  * `primaryKey`: `true/false` — cột tham gia PK.
  * `foreignKey`: Nếu cột là FK thì khai báo:
    * `refTableId*`: ID bảng đích (prefix `lid_`).
    * `refColumnId*`: ID cột đích (prefix `lid_`).
  * `candidateKey`: `true/false` — cột tham gia candidate key.
* `notes`: Ghi chú.

---

## functionalDependency (Phụ thuộc hàm)

* `id*`: Định danh FD (prefix `lid_`).
* `name`: Tên FD (tuỳ chọn).
* `left*`: Mảng `column.id` — determinant.
* `right*`: Mảng `column.id` — dependent.
* `notes`: Ghi chú.

