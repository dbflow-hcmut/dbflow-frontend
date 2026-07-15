## model (Thông tin mô hình)

* `id*`: ID mô hình (prefix `cid_`).
* `name*`: Tên mô hình.
* `version*`: Phiên bản (integer ≥ 1).
* `notes`: Ghi chú.

---

## entity (Thực thể)

* `id*`: ID thực thể (prefix `cid_`).
* `name*`: Tên thực thể.
* `kind*`: Loại thực thể (`strong`, `weak`). Mặc định: `strong`.
* `attributes*`: Tập các thuộc tính của thực thể.
* `notes`: Ghi chú nghiệp vụ.

---

## attribute (Thuộc tính)

* `id*`: ID thuộc tính (prefix `cid_`).
* `name*`: Tên thuộc tính.
* `kind*`: Loại thuộc tính (`simple`, `composite`, `multi_valued`, `complex`, `derived`).
* `isKey*`: Có phải thuộc tính khóa hay không (boolean).
* `semantics`: Tag ngữ nghĩa mô tả ý nghĩa nghiệp vụ (array of string).
* `components`: Tập các thuộc tính con nếu `kind = composite | complex`.
  * `id*`: ID thuộc tính con (prefix `cid_`).
  * `name*`: Tên thuộc tính con.
  * `kind*`: Loại thuộc tính con (`simple`, `composite`, `multi_valued`, `complex`, `derived`).
  * `components`: Tập thuộc tính con lồng nhau nếu thuộc tính con là `composite | complex`.
* `derivation`: Công thức tính nếu `kind = derived`.
* `notes`: Ghi chú nghiệp vụ.

---

## relationship (Quan hệ)

* `id*`: ID quan hệ (prefix `cid_`).
* `name*`: Tên quan hệ.
* `type*`: Loại quan hệ (`association`, `identifying`). Mặc định: `association`.
* `arity`: Bậc quan hệ (integer ≥ 1).
* `ends*`: Tập các entity tham gia quan hệ (≥ 2 phần tử).
* `attributes`: Thuộc tính của quan hệ (cùng format với `attribute`).
* `semantics`: Mô tả ngữ nghĩa nghiệp vụ.
* `notes`: Ghi chú nghiệp vụ.

---

## relEnd (Đầu mút quan hệ)

* `entityId*`: ID của thực thể tham gia (prefix `cid_`).
* `role`: Vai trò của thực thể trong quan hệ (bắt buộc khi quan hệ đệ quy).
* `cardinality`: Số lượng instance (`"1"`, `"N"`, `"M"`, `"1..N"`, v.v.).
* `optional`: Bắt buộc (`false`) / Tùy chọn (`true`).

---

## generalization (Tổng quát hóa)

* `id*`: ID (prefix `cid_`). Với direct entity → entity identifying/bracket edge, ID generalization bằng chính ID của edge.
* `parentEntityIds*`: Tập các ID của thực thể cha (prefix `cid_`). Edge không có móc/bracket được hiểu là cha. Với direct entity → entity edge, đầu có bracket là parent.
* `childEntityIds*`: Tập các ID của thực thể con. Edge có móc/bracket được hiểu là con. Với direct entity → entity edge, đầu không có bracket là child.
* `categoryBy`: Tiêu chí phân loại thực thể (nếu có).
* `constraints*`: Các ràng buộc cha-con.
  * `disjointness*`: `disjoint` hoặc `overlap`.
  * `completeness*`: `total` hoặc `partial`.

---

## category (Thể loại / Union)

* `id*`: ID (prefix `cid_`).
* `categoryEntityId`: ID của category entity (prefix `cid_`). Edge có móc/bracket được hiểu là category entity.
* `superclassEntityIds*`: Tập các ID của superclass entities. Edge không có móc/bracket được hiểu là superclass.
* `completeness*`: `total` hoặc `partial`.
* `notes`: Ghi chú.
