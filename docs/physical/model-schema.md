## model (Thong tin mo hinh)

* `id*`: Dinh danh schema (prefix `pid_`).
* `name*`: Ten schema.
* `version*`: Phien ban (integer >= 1).
* `dbms`: He quan tri CSDL muc tieu (`postgres`, `mysql`, `sqlserver`, `oracle`, `bigquery`, `snowflake`).
* `description`: Mo ta ngan ve luoc do.
* `defaultDatabase`: Ten database mac dinh khi file mo ta nhieu database.
* `notes`: Ghi chu.

---

## table (Bang)

* `id*`: Dinh danh bang (prefix `pid_`).
* `name*`: Ten bang.
* `comment`: Mo ta / comment cua bang.
* `columns*`: Danh sach cac cot cua bang (>= 1).
* `primaryKey`: Rang buoc khoa chinh cap bang.
  * `name`: Ten constraint PK.
  * `columns*`: Mang column IDs tham gia PK.
* `uniqueConstraints`: Danh sach rang buoc UNIQUE cap bang (ho tro composite).
  * `name`: Ten constraint.
  * `columns*`: Mang column IDs.
* `foreignKeys`: Danh sach rang buoc FK cap bang (ho tro composite FK).
  * `name`: Ten constraint FK.
  * `columns*`: Mang column IDs cua bang hien tai.
  * `refTableId*`: ID bang dich (prefix `pid_`).
  * `refColumns*`: Mang column IDs cua bang dich.
  * `onDelete`: Hanh vi khi xoa (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
  * `onUpdate`: Hanh vi khi cap nhat (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
* `checkConstraints`: Danh sach rang buoc CHECK.
  * `name`: Ten constraint.
  * `expression*`: Bieu thuc SQL (vi du: `"price > 0"`).
* `indexes`: Danh sach index.
* `partitioning`: Cau hinh phan vung bang.
  * `type`: Chien luoc (`RANGE`, `LIST`, `HASH`).
  * `columns`: Mang ten cot partition key.
  * `expression`: Bieu thuc partition (neu khong phai cot don gian).
* `storageOptions`: Tuy chon luu tru phu thuoc DBMS (`tablespace`, `filegroup`, `compression`).
* `triggers`: Danh sach trigger gan voi bang nay.
* `functionalDependencies`: Danh sach FD noi bo.
* `showFunctionalDependencies`: Co hien thi FD tren node/table hay khong.
* `notes`: Ghi chu.

---

## column (Cot)

* `id*`: Dinh danh cot (prefix `pid_`).
* `name*`: Ten cot.
* `position`: Vi tri thu tu cua cot trong bang (integer >= 0).
* `dataType`: Kieu du lieu SQL co ban KHONG kem length (vi du: `varchar`, `integer`, `decimal`).
* `dataTypeOriginal`: Kieu du lieu goc theo cu phap DBMS nguon (vi du: `INT UNSIGNED`, `SERIAL`).
* `dataTypeNormalized`: Kieu du lieu da chuan hoa ve tap canonical nho phuc vu phan tich cross-DBMS.
* `length`: Length/precision shorthand (vi du: `"255"`, `"10,2"`). Uu tien dung precision/scale khi co the.
* `precision`: Numeric precision (tong so chu so) hoac string max length.
* `scale`: Numeric scale (so chu so sau dau thap phan).
* `nullable*`: Cho phep `NULL` (mac dinh `true`).
* `unique*`: UNIQUE don cot (mac dinh `false`).
* `autoIncrement`: Cot auto-increment (mac dinh `false`).
* `defaultValue`: Bieu thuc default SQL (vi du: `"NOW()"`, `"0"`).
* `roles`: Cac vai tro khoa cua cot.
  * `primaryKey`: `true/false` -- cot tham gia PK.
  * `foreignKey`: Neu cot la FK thi khai bao:
    * `refTableId*`: ID bang dich (prefix `pid_`).
    * `refColumnId*`: ID cot dich (prefix `pid_`).
    * `onDelete`: Hanh vi khi xoa (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
    * `onUpdate`: Hanh vi khi cap nhat (`NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`).
  * `candidateKey`: `true/false` -- cot tham gia candidate key.
* `comment`: Comment / mo ta cot.
* `notes`: Ghi chu.

---

## index (Chi muc)

* `id*`: Dinh danh index.
* `name*`: Ten index (vi du: `idx_customer_email`).
* `type*`: Loai index (`BTREE`, `HASH`, `GIN`, `GIST`, `BRIN`). Mac dinh: `BTREE`.
* `columns*`: Danh sach cot trong index (>= 1).
  * `columnName*`: Ten cot.
  * `order*`: Thu tu sap xep (`ASC` / `DESC`). Mac dinh: `ASC`.
* `isUnique`: Index unique hay khong (mac dinh `false`).

---

## view (View / Materialized View)

* `id*`: Dinh danh view (prefix `pid_`).
* `name*`: Ten view.
* `definition*`: Cau lenh SQL SELECT dinh nghia view.
* `isMaterialized`: Co phai materialized view hay khong (mac dinh `false`).
* `columns`: Danh sach ten cot output cua view.
* `comment`: Mo ta.

---

## sequence (Sequence)

* `id*`: Dinh danh sequence (prefix `pid_`).
* `name*`: Ten sequence.
* `startValue`: Gia tri bat dau.
* `increment`: Buoc nhay (mac dinh `1`).
* `minValue`: Gia tri nho nhat.
* `maxValue`: Gia tri lon nhat.
* `cycle`: Co lap lai hay khong (mac dinh `false`).
* `comment`: Mo ta.

---

## trigger (Trigger)

* `id*`: Dinh danh trigger (prefix `pid_`).
* `name*`: Ten trigger.
* `timing`: Thoi diem (`BEFORE`, `AFTER`, `INSTEAD OF`).
* `event`: Su kien (`INSERT`, `UPDATE`, `DELETE`).
* `forEach`: Cap do (`ROW`, `STATEMENT`). Mac dinh: `ROW`.
* `body`: Than trigger hoac ten function.
* `comment`: Mo ta.

---

## function (Function / Procedure)

* `id*`: Dinh danh function (prefix `pid_`).
* `name*`: Ten function.
* `language`: Ngon ngu (vi du: `plpgsql`, `sql`, `javascript`).
* `parameters`: Danh sach tham so.
  * `name`: Ten tham so.
  * `dataType`: Kieu du lieu.
  * `mode`: Che do (`IN`, `OUT`, `INOUT`). Mac dinh: `IN`.
* `returnType`: Kieu tra ve.
* `body`: Than function/procedure.
* `comment`: Mo ta.

---

## functionalDependency (Phu thuoc ham)

* `id*`: Dinh danh FD (prefix `pid_`).
* `name`: Ten FD (tuy chon).
* `left*`: Mang `column.id` -- determinant.
* `right*`: Mang `column.id` -- dependent.
* `notes`: Ghi chu.

---

## sourceInfo (Thong tin nguon goc)

* `origin`: Cach tao schema (`manual`, `forward-engineering`, `reverse-engineering`, `import-ddl`, `ai-generated`).
* `sourceFile`: File DDL goc hoac connection string.
* `reversedAt`: Thoi diem reverse engineering (ISO 8601).
* `warnings`: Danh sach canh bao trong qua trinh import/reverse.
* `logicalMappable`: Co the anh xa nguoc ve logical/conceptual hay khong (mac dinh `true`).
