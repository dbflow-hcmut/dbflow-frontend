## model (Thông tin mô hình)

* `id*`: Định danh schema/model.
* `name*`: Tên schema.
* `version*`: Phiên bản (integer ≥ 1).
* `notes`: Ghi chú.

---

## table (Bảng)

* `id*`: Định danh bảng (prefix `cid_`).
* `name*`: Tên bảng.
* `columns*`: Danh sách các cột của bảng.
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
    * `refTableId*`: ID bảng đích (prefix `cid_`).
    * `refColumnId*`: ID cột đích (prefix `lid_`).
  * `candidateKey`: `true/false` — cột tham gia candidate key.
* `notes`: Ghi chú.

---

## functionalDependency (Phụ thuộc hàm)

* `id*`: Định danh FD (prefix `fd_`).
* `name`: Tên FD (tuỳ chọn).
* `left*`: Mảng định danh hoặc tên cột determinant.
* `right*`: Mảng định danh hoặc tên cột dependent.
* `notes`: Ghi chú.

