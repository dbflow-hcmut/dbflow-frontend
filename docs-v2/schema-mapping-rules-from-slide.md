# Quy tắc mapping ER/EER → Relational theo slide

Nguồn: slide `4_RelationalDataModelAndRelationalMapping.pdf` (phần 3, trang 37–86). Tài liệu này ghi lại các quy tắc mapping mà đồ án áp dụng cho chiều **Conceptual → Logical**, đối chiếu với cách `convertConceptualToLogical` đang làm và trỏ tới trang slide để kiểm tra từng case.

- Code: `src/components/EditProject/utils/schema-conversion.ts` (`convertConceptualToLogicalWithNotices`).
- Test: `src/components/EditProject/utils/conceptual-to-logical.spec.ts` (chạy `yarn test`).
- Bảng theo dõi case: `DBFlow_Conceptual_to_Logical_Test_Cases.xlsx`.
- Mô tả chi tiết thuật toán: [schema-conversion-implementation-rules.md](schema-conversion-implementation-rules.md), mục 9.
- Ảnh các trang slide: `assets/mapping-slide/pNN.jpg` (NN là số trang trong slide).

Ký hiệu cột "Tool": ✅ khớp slide, ⚠️ chọn một trong nhiều phương án của slide, ❌ chưa làm theo slide.

## 1. Bảng tổng quan

| Bước | Quy tắc trong slide | Tool | Trang |
|---|---|---|---|
| 1. Regular entity | Entity → relation; simple attribute → cột; composite attribute → các thành phần đơn; một key attribute → PK | ✅ (composite làm khóa cũng đã xử lý) | 38–40 |
| 2. Weak entity | Relation riêng; thêm PK của owner làm FK; PK = PK owner + partial key | ✅ | 42–44 |
| 3. Quan hệ 1:1 | 3 cách: FK, merged relation, cross-reference | ⚠️ chỉ dùng cách FK | 46–49 |
| 4. Quan hệ 1:N | FK (PK của phía 1) đặt ở phía N; thuộc tính quan hệ vào bảng phía N | ✅ | 51–54 |
| 5. Quan hệ M:N | Relation mới; FK của các bên; PK = tổ hợp các FK; thuộc tính quan hệ vào relation mới | ✅ | 56–58 |
| Quan hệ đệ quy | Đổi tên cột khóa theo vai trò | ✅ (tiền tố `parent_`) | 59–64 |
| 6. Multi-valued | Relation mới: cột giá trị + FK về owner; PK = tổ hợp; multi-valued composite thì đưa các thành phần đơn vào | ✅ | 66–68 |
| 7. Quan hệ n ngôi | Relation mới; FK của mọi bên; riêng bên có cardinality 1 thì FK không thuộc PK | ✅ | 70–71 |
| 8. Specialization | 4 lựa chọn 8A–8D | ⚠️ chỉ dùng 8A | 74–80 |
| Shared subclass | Các class cha phải có cùng khóa, nếu không là category | ⚠️ chỉ hỗ trợ một cha | 81–83 |
| 9. Category (union) | Khóa khác nhau → khóa thay thế; khóa giống nhau → dùng khóa chung | ✅ | 85–86 |

## 2. Từng bước

### Bước 1. Regular entity (trang 38–40)

- Entity → bảng. Simple attribute → cột. Composite attribute → tập các cột thành phần đơn.
- Một key attribute của entity → PK. Nhiều key attribute của cùng entity gộp thành một PK ghép (không UNIQUE từng cột).
- Composite attribute được đánh dấu là khóa → các thành phần của nó làm PK.
- Entity không có khóa: tool tự thêm cột `id` làm PK (slide giả định entity luôn có khóa).

![Bước 1](assets/mapping-slide/p39.jpg)
![Bước 1 - kết quả](assets/mapping-slide/p40.jpg)

### Bước 2. Weak entity (trang 42–44)

- Tạo bảng cho weak entity với mọi simple attribute.
- Thêm PK của bảng owner làm FK.
- PK = PK của owner + partial key (nếu có). Nhiều owner thì lấy PK của tất cả owner.

![Bước 2](assets/mapping-slide/p43.jpg)
![Bước 2 - kết quả](assets/mapping-slide/p44.jpg)

### Bước 3. Quan hệ 1:1 (trang 46–49)

Slide cho 3 cách:
1. **Foreign key:** chọn một bảng, thêm PK của bảng kia làm FK, kèm thuộc tính của quan hệ. Chọn bảng tham gia bắt buộc; nếu cả hai đều bắt buộc thì đặt ở bên nào cũng được.
2. **Merged relation:** gộp hai entity và quan hệ thành một bảng (chỉ khi cả hai bên đều bắt buộc).
3. **Cross-reference:** bảng quan hệ riêng, PK là PK của một trong hai entity.

Tool dùng cách 1: FK đặt ở phía bắt buộc (nếu không có phía nào bắt buộc thì ở entity đầu tiên), FK là `UNIQUE`.

![1:1 - FK](assets/mapping-slide/p47.jpg)
![1:1 - cross-reference](assets/mapping-slide/p49.jpg)

### Bước 4. Quan hệ 1:N (trang 51–54)

- Đặt FK (PK của phía 1) vào bảng phía N, kèm thuộc tính của quan hệ.
- Slide có phương án thay thế bằng bảng quan hệ riêng khi phía N tham gia tùy chọn (ví dụ `ON_LOAN`). Tool không dùng phương án này: luôn dùng FK, cho phép NULL nếu phía N tham gia tùy chọn.

![1:N](assets/mapping-slide/p53.jpg)
![Bước 3-4](assets/mapping-slide/p54.jpg)

### Bước 5. Quan hệ M:N (trang 56–58)

- Tạo bảng mới chứa FK của các entity tham gia và thuộc tính của quan hệ.
- PK = tổ hợp các FK.

![M:N](assets/mapping-slide/p57.jpg)
![M:N - kết quả](assets/mapping-slide/p58.jpg)

### Quan hệ đệ quy (trang 59–64)

- Tên cột khóa phải đổi theo vai trò (ví dụ `HUSBAND_ID`, `WIFE_ID`; `MAJOR_PNUMBER`, `MINOR_PNUMBER`).
- 1:N đệ quy: nếu bắt buộc → FK trong chính bảng (`SUPERVISOR_ID`); nếu tùy chọn → có thể dùng bảng riêng.
- Tool: FK trong chính bảng với tên có tiền tố `parent_` (khóa đơn: `parent_<bảng>_id`; khóa ghép: `parent_<tên cột khóa>`); M:N đệ quy tạo bảng trung gian có hai nhóm cột FK tên khác nhau.

![Đệ quy 1:N](assets/mapping-slide/p61.jpg)
![Đệ quy N:M](assets/mapping-slide/p62.jpg)
![Đệ quy - kết quả](assets/mapping-slide/p64.jpg)

### Bước 6. Multi-valued attribute (trang 66–68)

- Tạo bảng mới gồm cột giá trị và FK về entity (hoặc quan hệ) sở hữu thuộc tính. PK = tổ hợp hai thứ này.
- Nếu thuộc tính đa trị là composite thì đưa các thành phần đơn của nó vào bảng.

![Multi-valued](assets/mapping-slide/p67.jpg)
![Kết quả COMPANY](assets/mapping-slide/p68.jpg)

### Bước 7. Quan hệ n ngôi (trang 70–71)

- Tạo bảng mới với FK là PK của mọi entity tham gia, cộng thuộc tính của quan hệ (hoặc các thành phần đơn của thuộc tính composite).
- Ghi chú trang 71: nếu cardinality của một entity tham gia là **1** thì PK không chứa cột FK trỏ về entity đó.

![Quan hệ 3 ngôi SUPPLY](assets/mapping-slide/p71.jpg)

### Bước 8. Specialization / Generalization (trang 74–83)

Slide có 4 phương án:

| Phương án | Cách làm | Dùng khi |
|---|---|---|
| 8A | Bảng cho superclass và mỗi subclass; PK của subclass là PK của superclass (đồng thời là FK) | Mọi trường hợp |
| 8B | Chỉ bảng subclass, mỗi bảng chứa cả thuộc tính của superclass | Subclass phủ toàn phần (total), nên dùng khi disjoint |
| 8C | Một bảng duy nhất có thêm một cột phân loại `t` | Chỉ khi subclass disjoint |
| 8D | Một bảng duy nhất có thêm các cột boolean `t1..tm` | Subclass overlapping (disjoint cũng được) |

Tool dùng **8A**. Với shared subclass (đa thừa kế), slide yêu cầu các class cha phải có cùng khóa, nếu không thì mô hình hóa bằng category. Phạm vi đồ án chỉ hỗ trợ **một cha** cho mỗi generalization: nếu có nhiều cha thì chỉ dùng cha đầu tiên và báo cảnh báo.

![8A](assets/mapping-slide/p76.jpg)
![8B](assets/mapping-slide/p77.jpg)
![8C](assets/mapping-slide/p79.jpg)
![8D](assets/mapping-slide/p80.jpg)
![Shared subclass](assets/mapping-slide/p82.jpg)
![Shared subclass - kết quả](assets/mapping-slide/p83.jpg)

### Bước 9. Union type / Category (trang 85–86)

Category là entity có thể thuộc một trong nhiều superclass (ví dụ `OWNER` là `PERSON` hoặc `COMPANY` hoặc `BANK`).

**Trường hợp 1: các superclass có khóa KHÁC nhau** (`PERSON.Ssn`, `BANK.Bname`, `COMPANY.Cname`)

1. Tạo bảng cho category (`OWNER`), gồm các thuộc tính riêng của category.
2. Khóa chính của bảng này là **khóa thay thế (surrogate key)** `Owner_id`.
3. Mỗi bảng superclass thêm cột `Owner_id` là FK trỏ về `OWNER.Owner_id`.

```
OWNER(Owner_id PK)
PERSON(Ssn PK, Driver_license_no, Name, Address, Owner_id FK→OWNER)
BANK(Bname PK, Baddress, Owner_id FK→OWNER)
COMPANY(Cname PK, Caddress, Owner_id FK→OWNER)
```

**Trường hợp 2: các superclass dùng CHUNG một khóa** (`CAR.Vehicle_id`, `TRUCK.Vehicle_id`)

- Bảng category (`REGISTERED_VEHICLE`) dùng khóa chung làm PK; không tạo khóa thay thế.
- Khóa của `CAR` và `TRUCK` vừa là PK vừa là FK trỏ về `REGISTERED_VEHICLE`.

```
REGISTERED_VEHICLE(Vehicle_id PK, License_plate_number)
CAR(Vehicle_id PK/FK→REGISTERED_VEHICLE, Cstyle, Cmake, Cmodel, Cyear)
TRUCK(Vehicle_id PK/FK→REGISTERED_VEHICLE, Tmake, Tmodel, Tonnage, Tyear)
```

**Quan hệ gắn vào category** (`OWNS` giữa `OWNER` và `REGISTERED_VEHICLE`, M:N) map như quan hệ thường: bảng `OWNS(Owner_id, Vehicle_id, Purchase_date, Lien_or_regular)` với PK gồm hai FK, trỏ vào bảng category.

![Ví dụ union type](assets/mapping-slide/p86.jpg)

Cách tool áp dụng và điểm khác slide:

| Nội dung | Tool |
|---|---|
| Khóa thay thế của category | Nếu entity category không có key attribute thì cột `id` tự thêm được đổi tên thành `<category>_id`; nếu có key attribute riêng thì dùng khóa đó |
| Cột FK trong bảng superclass (trường hợp 1) | Cho phép NULL. Slide không nói rõ; đây là suy luận (một person không bắt buộc là owner) |
| Tên cột FK | Theo quy ước của tool `<bảng được tham chiếu>_id`, ví dụ `registered_vehicle_id` thay vì `Vehicle_id` trong slide. Cấu trúc giống hệt |
| `completeness` (total/partial), ràng buộc "chỉ thuộc đúng một superclass" | Không thể hiện được trong schema quan hệ, không ảnh hưởng đầu ra |
| Category không có entity riêng, superclass không tồn tại, không có superclass | Cảnh báo cho người dùng |
| Khóa của superclass đã là FK tới bảng khác (superclass là subclass) trong trường hợp "khóa giống nhau" | Không ghi đè, cảnh báo |

## 3. Dùng ảnh trong slide để kiểm tra case

| Case cần kiểm tra | Trang slide | Test tương ứng trong `conceptual-to-logical.spec.ts` |
|---|---|---|
| Entity, khóa, composite | 38–40 | nhóm `entities and attributes` |
| Weak entity | 42–44 | nhóm `weak entities`, `pitfall: weak entities` |
| 1:1, 1:N | 47–54 | nhóm `binary relationships` |
| M:N | 56–58 | nhóm `binary relationships` (junction) |
| Đệ quy | 59–64 | các test `recursive …` |
| Multi-valued | 66–68 | các test `multi-valued …` |
| Ternary SUPPLY, ghi chú khóa của phía "1" | 70–71 | nhóm `n-ary relationships` |
| Generalization 8A | 75–76 | nhóm `generalization / specialization` |
| Shared subclass | 81–83 | test `a subclass declared with two superclasses …` |
| Union OWNER / REGISTERED_VEHICLE / OWNS | 85–86 | nhóm `categories: the slide examples (EER step 9)` |

Cách kiểm tra: mở trang slide, dựng lại ER của ví dụ trong test, so bảng đầu ra với bảng trong slide. Ví dụ OWNER/REGISTERED_VEHICLE đã có sẵn trong test `the whole slide model (both categories + OWNS M:N) gives exactly the tables of the slide`.

## 4. Khác slide / ngoài slide

- Slide không đề cập thuộc tính derived. Đồ án quy ước bỏ derived (của entity lẫn của quan hệ) và báo cảnh báo.
- Thành phần của composite / multi-valued attribute (trong quan hệ, bảng đa trị) được đưa vào bảng như slide yêu cầu ở bước 5, 6, 7 (trang 66, 70, 72); thành phần trùng tên được thêm tiền tố và báo cảnh báo.
- Phương án 1:1 merged/cross-reference, phương án bảng quan hệ riêng cho 1:N/đệ quy khi phía N tùy chọn, và các phương án 8B–8D không được dùng.
