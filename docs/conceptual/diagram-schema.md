## diagram (Sơ đồ tổng thể)

* `id*`: ID sơ đồ (prefix `cid_`).
* `name*`: Tên sơ đồ.
* `viewport`: Cấu hình khung nhìn.

  * `x, y`: Tọa độ offset.
  * `zoom`: Mức phóng to/thu nhỏ (0.1 → 5.0).
  * `gridSize`: Kích thước lưới căn chỉnh.
  * `snapToGrid`: Bật/tắt chế độ hút vào lưới.
* `nodes*`: Tập các node trong sơ đồ.
* `edges*`: Tập các cạnh nối giữa các node.

---

## node

* `id*`: ID node (prefix `cid_`).
* `type*`: Loại node (`entity`, `relationship`, `attribute`, `isaCircle`, `unionCircle`, `note`).
* `position*`: Vị trí node trên canvas (`x`, `y`).
* `size*`: Kích thước node (`w`, `h`; minimum 20×20).
* `zIndex`: Thứ tự lớp vẽ.
* `style`: Thuộc tính hiển thị (`class`, `stroke`, `fill`).
* `name`: Văn bản hiển thị trong khối (tên entity/attr/relationship).

### entity node

* `entityId*`: Tham chiếu đến `model.entities[].id` (prefix `cid_`).
* `entityRender.doubleStroke`: `true` nếu là weak entity (hình chữ nhật viền đôi).

### relationship node

* `relationshipId*`: Tham chiếu đến `model.relationships[].id` (prefix `cid_`).
* `relationshipRender.doubleStroke`: `true` nếu là identifying relationship (hình thoi viền đôi).

### attribute node

* `attributeId*`: Tham chiếu đến attribute id trong model (prefix `cid_`).
* `attributeRender`: Các ký hiệu hiển thị cho oval.

  * `doubleEllipse`: Oval kép (multi-valued hoặc complex parent).
  * `dashed`: Oval nét đứt (derived).
  * `underline`: Gạch chân (key).
  * `underlineStyle`: `solid` = key thường, `dashed` = partial key.

### isaCircle node

* `isaCircle.symbol*`: Ký hiệu trong vòng tròn (`d` = disjoint, `o` = overlap).

### unionCircle node

* `unionCircle.symbol*`: Luôn = `"U"`.
* `unionCircle.categoryId`: Tham chiếu đến `model.categories[].id`.

### note node

* `text*`: Nội dung ghi chú tự do.

---

## edge (Cạnh nối)

* `id*`: ID cạnh (prefix `cid_`).
* `type*`: Loại cạnh.

  * `participation`: entity ↔ relationship (participation thường).
  * `attrOf`: attribute → entity/relationship (thuộc tính thuộc về).
  * `componentOf`: attribute con → attribute composite/complex.
  * `identifying`: entity ↔ relationship (identifying relationship).
  * `isaParent`: entity cha → isaCircle.
  * `isaChild`: isaCircle → entity con.
  * `categoryLink`: categoryEntity → unionCircle.
  * `categoryMember`: unionCircle → superclass entity.
* `relationshipId`: Tham chiếu model.relationships (bắt buộc nếu type = `participation` hoặc `identifying`).
* `generalizationId`: Tham chiếu model.generalizations (bắt buộc nếu type = `isaParent` / `isaChild`).
* `categoryId`: Tham chiếu model.categories (bắt buộc nếu type = `categoryLink` / `categoryMember`).
* `from*`: Đầu mút nguồn.
  * `nodeId*`: ID node nguồn (prefix `cid_`).
  * `portId`: Cổng kết nối (`top`, `bottom`, `left`, `right`).
* `to*`: Đầu mút đích.
  * `nodeId*`: ID node đích (prefix `cid_`).
  * `portId`: Cổng kết nối (`top`, `bottom`, `left`, `right`).
* `labels`: Văn bản hiển thị trên cạnh.
  * `nearFrom`: Nhãn gần đầu mút nguồn (thường là cardinality).
  * `center`: Nhãn giữa cạnh.
  * `nearTo`: Nhãn gần đầu mút đích (thường là cardinality).
* `endStyle`: Trang trí riêng cho mỗi đầu mút.
  * `from.doubleLine`: `true` = total participation.
  * `from.marker`: `none` / `one` / `many`.
  * `from.bracket`: `true` = bracket line (identifying relationship).
  * `to.doubleLine`: `true` = total participation.
  * `to.marker`: `none` / `one` / `many`.
  * `to.bracket`: `true` = bracket line (identifying relationship).

