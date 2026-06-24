# Schema Normalization: Thuật toán chuẩn hoá Logical/Physical Schema

Tài liệu này mô tả implementation hiện tại của tính năng chuẩn hoá schema. Phần UI flow chỉ tóm tắt ngắn; trọng tâm là thuật toán trong `normalization.ts`: attribute closure, candidate key, minimal cover, check 2NF/3NF/BCNF, decomposition và apply decomposition ngược vào model.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Engine chuẩn hoá pure logic | `src/components/EditProject/utils/normalization.ts` |
| Panel phân tích NF, chọn target NF, preview/apply decomposition | `src/components/EditProject/components/NormalizationPanel/index.tsx` |
| Nơi build model cho panel và apply decomposition | `src/components/EditProject/index.tsx` |
| Logical model builder | `src/components/EditProject/utils/logical-model.builder.ts` |
| Physical model builder | `src/components/EditProject/utils/physical-model.builder.ts` |
| Test/verification nhanh cho normalization engine | `src/components/EditProject/utils/normalization.test.ts` |

## 2. Flow runtime sơ lược

Tính năng Normalization chỉ bật cho Logical và Physical schema.

Flow:

1. `EditProject` build `normalizationModelData` từ canvas hiện tại.
2. Nếu schema là Logical:
   - map nodes/edges sang stored logical diagram.
   - gọi `buildLogicalModel`.
   - fallback `_logicalModelData` nếu canvas trống.
3. Nếu schema là Physical:
   - map nodes/edges sang stored physical diagram.
   - gọi `buildPhysicalModel`.
   - fallback `_physicalModelData` nếu canvas trống.
4. `NormalizationPanel` nhận `modelData`.
5. Panel extract mỗi table thành `AnalyzeTableInput`.
6. Với mỗi table, gọi `analyzeTable`.
7. User chọn target NF: `2NF`, `3NF`, hoặc `BCNF`.
8. Panel lọc violation và tính decomposition tương ứng.
9. Nếu user bấm Apply, `EditProject.handleApplyDecomposition` thay bảng gốc bằng các bảng decomposed và rewire FK.

Conceptual schema không có Normalization panel.

## 3. Data model của engine

### 3.1. Functional Dependency

```ts
export type FD = {
    left: string[];
    right: string[];
};
```

Trong engine, attribute là tên column dạng string. Hầu hết thuật toán normalize attribute bằng:

```ts
trim().toLowerCase()
```

và sort để deterministic.

### 3.2. AnalyzeTableInput

```ts
export type AnalyzeTableInput = {
    tableName: string;
    columns: string[];
    primaryKey: string[];
    candidateKeys?: string[][];
    functionalDependencies: FD[];
};
```

Panel extract từ model như sau:

- `columns`: lấy `table.columns.map(c => c.name)`.
- `primaryKey`: các column có `roles.primaryKey`.
- `candidateKeys`: các column có `roles.candidateKey`, gom thành một candidate key duy nhất nếu có.
- `functionalDependencies`: lấy từ `table.functionalDependencies`.

Lưu ý quan trọng: `candidateKeys` được extract trong panel nhưng `analyzeTable` hiện không dùng `input.candidateKeys` khi có FDs. Khi `fds.length > 0`, candidate keys được tính lại bằng `findCandidateKeys(allAttrs, minimalCover)`.

### 3.3. NormalizationResult

```ts
export type NormalizationResult = {
    tableName: string;
    attributes: string[];
    originalFDs: FD[];
    minimalCover: FD[];
    candidateKeys: string[][];
    primeAttributes: string[];
    currentNF: "1NF" | "2NF" | "3NF" | "BCNF";
    violations: NormalizationViolation[];
    decomposition: DecomposedTable[];
};
```

### 3.4. DecomposedTable

```ts
export type DecomposedTable = {
    name: string;
    attributes: string[];
    primaryKey: string[];
    fds: FD[];
    isKeyPreservation?: boolean;
};
```

Đây là output preview/apply decomposition. `attributes` và `primaryKey` đều là column names, không phải column ids.

## 4. Set utilities

Engine dùng array string thay vì `Set` trong public result để output deterministic.

### 4.1. norm

```ts
norm(attrs) = lowercase + trim + unique + sort
```

Mọi FD/attribute set gần như đều đi qua `norm`.

Hệ quả:

- Column `Student_ID`, `student_id`, ` student_id ` được xem là cùng attribute.
- Output attribute order đã sort, không giữ thứ tự column ban đầu.

### 4.2. Các helper set

- `setEq(a, b)`: so sánh bằng length và từng item.
- `isSubset(sub, sup)`: mọi phần tử của `sub` nằm trong `sup`.
- `isProperSubset(sub, sup)`: subset và nhỏ hơn thật sự.
- `union(...sets)`: gộp rồi normalize.
- `difference(a, b)`: lấy phần tử của `a` không nằm trong `b`.

## 5. Attribute closure

Hàm: `attributeClosure(x, fds)`.

Mục tiêu: tính `X+`, tức tất cả attributes suy ra được từ `X` dưới tập FD.

Thuật toán:

```ts
result = norm(X)
changed = true

while changed:
    changed = false
    for each FD Y -> Z:
        if Y subset result:
            merged = result union Z
            if merged grew:
                result = merged
                changed = true

return result
```

Dùng trong:

- `isSuperkey`.
- `findCandidateKeys`.
- `minimalCover`.
- Check 3NF/BCNF.
- BCNF decomposition.

## 6. Superkey và Candidate Key

### 6.1. isSuperkey

```ts
isSuperkey(attrs, allAttributes, fds):
    closure = attributeClosure(attrs, fds)
    return allAttributes subset closure
```

Một set attribute là superkey nếu closure của nó bao phủ toàn bộ attributes của relation.

### 6.2. findCandidateKeys

Hàm: `findCandidateKeys(allAttributes, fds)`.

Mục tiêu: tìm các minimal superkeys.

#### 6.2.1. Case đặc biệt

- Nếu relation không có attribute: return `[[]]`.
- Nếu không có FD: candidate key duy nhất là toàn bộ attributes.

#### 6.2.2. Phân loại attribute

Code phân loại attribute theo xuất hiện trong FD:

| Nhóm | Điều kiện | Ý nghĩa |
|---|---|---|
| L-only | Có trên LHS, không có RHS | Phải nằm trong mọi key |
| R-only | Có trên RHS, không có LHS | Không được dùng để expand key |
| Both | Có cả LHS và RHS | Có thể cần thêm vào key |
| Neither | Không xuất hiện trong FD nào | Phải nằm trong mọi key |

Implementation:

- `mustBeInKey = L-only + Neither`.
- `neverInKey = R-only` nhưng biến này hiện chỉ được tính, không dùng tiếp.
- `maybe = Both`.

#### 6.2.3. BFS theo kích thước subset

1. `base = norm(mustBeInKey)`.
2. Nếu `base` đã là superkey, return `[base]`.
3. Sinh subset của `maybe` theo size tăng dần.
4. Candidate = `base ∪ subset`.
5. Skip candidate nếu đã có candidate key trước đó là subset của nó.
6. Nếu candidate là superkey, push vào `candidateKeys`.
7. Nếu tìm được key ở size hiện tại, break, không xét size lớn hơn.

Giới hạn chống explosion:

```ts
maxMaybeSize = Math.min(maybe.length, 10)
```

Nếu không tìm được key, fallback dùng toàn bộ attributes.

## 7. Minimal Cover

Hàm: `minimalCover(fds)`.

Mục tiêu: đưa FD set về canonical cover.

### 7.1. Step 1: split RHS

FD dạng:

```text
X -> A, B
```

được tách thành:

```text
X -> A
X -> B
```

FD trivial bị bỏ:

```text
X -> A nếu A đã nằm trong X
```

### 7.2. Step 2: remove extraneous LHS attributes

Với mỗi FD `X -> A`, nếu `X` có nhiều hơn 1 attribute:

1. Thử bỏ từng attribute `B` khỏi `X`.
2. Tính closure của `X - {B}` dưới tập FD hiện tại.
3. Nếu closure vẫn chứa `A`, attribute `B` là extraneous.
4. Cập nhật left thành reduced set.

### 7.3. Step 3: remove redundant FDs

Với mỗi FD:

1. Tạo tập `others = all FDs - current FD`.
2. Tính closure của current left dưới `others`.
3. Nếu closure vẫn chứa current right, FD hiện tại redundant.
4. Nếu không redundant, giữ lại.

### 7.4. Step 4: merge same LHS

Các FD có cùng LHS được merge lại:

```text
A -> B
A -> C
=> A -> B, C
```

Output vẫn normalized/sorted.

## 8. Check Normal Forms

Engine không check 1NF trực tiếp. Nó giả định table đang ở 1NF nếu có columns atomic trong model. `currentNF = "1NF"` nghĩa là có violation 2NF.

### 8.1. Check 2NF

Hàm: `check2NF(allAttributes, fds, candidateKeys, primeAttrs)`.

2NF violation:

```text
Tồn tại FD Y -> A
Trong đó:
- A là non-prime attribute
- Y là proper subset của một candidate key
```

Thuật toán:

1. Tính `nonPrime = allAttributes - primeAttrs`.
2. Với mỗi FD trong minimal cover:
   - Normalize left/right.
   - Với từng attribute `A` trong RHS:
     - Nếu `A` prime, skip.
     - Với từng candidate key `ck`:
       - Nếu `left` là proper subset của `ck`, push 2NF violation.

Violation message gọi đây là partial dependency.

### 8.2. Check 3NF

Hàm: `check3NF(allAttributes, fds, candidateKeys, primeAttrs, violations2NF)`.

3NF violation:

```text
Với FD X -> A:
- X không phải superkey
- A không phải prime attribute
```

Rule exception của 3NF:

- Nếu `A` là prime attribute thì 3NF cho phép, skip.

Code cũng skip FD đã được report bởi 2NF để tránh duplicate.

Violation message gọi đây là transitive dependency.

Lưu ý: tham số `candidateKeys` có trong signature nhưng implementation không dùng trực tiếp trong check3NF; logic dùng `primeAttrs` và `isSuperkey`.

### 8.3. Check BCNF

Hàm: `checkBCNF(allAttributes, fds, violations2NF, violations3NF)`.

BCNF violation:

```text
Với FD X -> A:
- X không phải superkey
```

BCNF không có exception cho prime attribute.

Code skip FD đã được report bởi 2NF hoặc 3NF để tránh duplicate trong danh sách violation.

## 9. analyzeTable

Hàm chính: `analyzeTable(input)`.

Pipeline:

```ts
allAttrs = norm(input.columns)
fds = input.functionalDependencies.filter(left/right non-empty)
mc = minimalCover(fds)

if fds.length > 0:
    candidateKeys = findCandidateKeys(allAttrs, mc)
else:
    candidateKeys = input.primaryKey.length > 0
        ? [norm(input.primaryKey)]
        : [allAttrs]

primeAttrs = union of all candidate keys

if mc.length === 0:
    return BCNF with no violations/decomposition

violations2NF = check2NF(...)
violations3NF = check3NF(...)
violationsBCNF = checkBCNF(...)

if violations2NF exists:
    currentNF = "1NF"
else if violations3NF exists:
    currentNF = "2NF"
else if violationsBCNF exists:
    currentNF = "3NF"
else:
    currentNF = "BCNF"

if currentNF is 1NF or 2NF:
    decomposition = decompose3NF(...)
else if currentNF is 3NF:
    decomposition = decomposeBCNF(...)
else:
    decomposition = []
```

### 9.1. No FD case

Nếu không có FD hợp lệ:

- `minimalCover = []`.
- Nếu user có PK, candidate key là PK.
- Nếu không có PK, candidate key là toàn bộ attributes.
- `currentNF = "BCNF"`.
- `violations = []`.
- `decomposition = []`.

Điều này nghĩa là engine xem table không khai báo FD là trivially BCNF.

### 9.2. currentNF interpretation

| Violation tồn tại | currentNF |
|---|---|
| Có 2NF violation | `1NF` |
| Không có 2NF, có 3NF violation | `2NF` |
| Không có 2NF/3NF, có BCNF violation | `3NF` |
| Không có violation | `BCNF` |

## 10. 3NF Decomposition

Hàm: `decompose3NF(tableName, allAttributes, fds, candidateKeys)`.

Implementation theo 3NF synthesis algorithm.

Properties theo comment code:

- Lossless join.
- Dependency preserving.

### 10.1. Step 1: minimal cover

Hàm tự tính lại:

```ts
mc = minimalCover(fds)
```

### 10.2. Step 2: one table per FD group

Với mỗi FD trong minimal cover:

```text
X -> Y
```

tạo table:

```ts
{
    name: `${tableName}_${counter}`,
    attributes: X ∪ Y,
    primaryKey: X,
    fds: projectFDs(mc, X ∪ Y),
}
```

### 10.3. Step 3: key preservation table

Nếu không có decomposed table nào chứa một candidate key:

- Lấy candidate key đầu tiên.
- Tạo table riêng chỉ gồm key đó.
- Set `isKeyPreservation: true`.

### 10.4. Step 4: remove subset tables

Sau khi tạo tables, remove table nếu:

- Attribute set của nó là subset của table khác.
- Và kích thước nhỏ hơn table kia.

Mục đích: tránh các relation dư thừa.

## 11. BCNF Decomposition

Hàm: `decomposeBCNF(tableName, allAttributes, fds)`.

Properties theo comment code:

- Lossless join.
- Có thể không preserve tất cả dependencies.

### 11.1. Initial relation

Khởi tạo:

```ts
relations = [{
    attrs: norm(allAttributes),
    fds: projectFDs(fds, norm(allAttributes)),
}]
```

### 11.2. Loop decomposition

Loop với safety limit:

```ts
maxIter = 50
```

Trong mỗi vòng:

1. Tìm relation có BCNF violation bằng `findBCNFViolation`.
2. Nếu không có violation nào, dừng.
3. Với violation `X -> Y`:
   - `R1 = X ∪ Y`.
   - `R2 = (R - Y) ∪ X`.
4. Project FDs vào R1/R2.
5. Replace relation cũ bằng R1 và R2.
6. Restart loop.

### 11.3. findBCNFViolation

Với mỗi FD:

- `left = norm(fd.left)`.
- `right = difference(norm(fd.right), left)` để bỏ trivial RHS.
- Nếu `right` rỗng, skip.
- Nếu `left` không phải superkey của relation, return FD violation.

Chỉ trả về một violation đầu tiên.

### 11.4. Output tables

Sau loop, mỗi relation thành `DecomposedTable`:

```ts
{
    name: `${tableName}_${i + 1}`,
    attributes: rel.attrs,
    primaryKey: findCandidateKeys(rel.attrs, rel.fds)[0] ?? rel.attrs,
    fds: rel.fds,
}
```

## 12. FD Projection

Hàm: `projectFDs(fds, attrs)`.

Rule:

1. Chỉ giữ FD nếu toàn bộ LHS nằm trong `attrs`.
2. RHS được filter chỉ lấy attributes nằm trong `attrs`.
3. Bỏ RHS trivial đã nằm trong LHS.
4. Nếu RHS còn non-trivial attributes, push FD.

Lưu ý: đây là projection đơn giản theo FD hiện có, không suy ra toàn bộ closure projection đầy đủ.

## 13. NormalizationPanel

Component: `src/components/EditProject/components/NormalizationPanel/index.tsx`.

### 13.1. Target NF

UI cho chọn:

```ts
type TargetNF = "2NF" | "3NF" | "BCNF";
```

Default:

```ts
targetNF = "3NF"
```

Rank:

```text
1NF = 1
2NF = 2
3NF = 3
BCNF = 4
```

`needsDecomposition(result, targetNF)`:

```ts
nfRank(result.currentNF) < nfRank(targetNF)
```

### 13.2. Violation filtering

Panel chỉ hiển thị violations liên quan tới target NF:

```ts
filterViolations(violations, targetNF):
    return violations where nfRank(v.normalForm) <= nfRank(targetNF)
```

Ví dụ:

- Target `2NF`: chỉ quan tâm 2NF violation.
- Target `3NF`: quan tâm 2NF và 3NF violation.
- Target `BCNF`: quan tâm 2NF, 3NF, BCNF violation.

### 13.3. computeDecomposition

Panel không luôn dùng `result.decomposition`; nó compute lại theo target NF.

Rule:

```ts
if table already meets target:
    return []

if targetNF is 2NF or 3NF:
    return decompose3NF(...)

if targetNF is BCNF:
    if currentNF < 3NF:
        return decompose3NF(...)
    else:
        return decomposeBCNF(...)
```

Hệ quả:

- Chọn target `2NF` vẫn dùng 3NF synthesis, không có thuật toán decomposition riêng chỉ tới 2NF.
- Nếu table dưới 3NF mà chọn BCNF, UI vẫn đề xuất 3NF synthesis trước để preserve dependencies.
- Chỉ khi table đang 3NF nhưng chưa BCNF thì mới dùng BCNF decomposition.

### 13.4. Summary

Panel tính:

- `meetsTarget`: số table có `currentNF >= targetNF`.
- `belowTarget`: số table thấp hơn target.
- `totalViolations`: tổng violations sau filter theo target của các table dưới target.

Badge panel:

- Có violations -> đỏ và hiện số.
- Không violations -> xanh và hiện dấu check.

### 13.5. Expand behavior

Mỗi lần `results` hoặc `targetNF` đổi:

- Panel auto-expand các table cần decomposition.
- Table đạt target không auto-expand.

### 13.6. Table focus

Click tên table:

1. Panel tìm table trong `modelData.tables` theo `table.name`.
2. Lấy `table.id`.
3. Gọi `onTableClick(nodeId)`.
4. `EditProject` select node và `fitView`.

Nếu có duplicate table name, focus sẽ lấy table đầu tiên match.

## 14. Apply Decomposition

Implementation nằm trong `handleApplyDecomposition` của `EditProject`.

Mục tiêu:

- Thay table gốc bằng các decomposed tables.
- Giữ lại các table khác.
- Rewire outgoing FK, incoming FK và inter-decomposition FK.
- Hỗ trợ cả logical và physical model.

### 14.1. Input

```ts
onApplyDecomposition(tableName, decomposition)
```

- `tableName`: tên table gốc.
- `decomposition`: danh sách `DecomposedTable`.

Tìm table gốc bằng:

```ts
model.tables.findIndex(t => t.name === tableName)
```

Lưu ý: nếu trùng tên table, table đầu tiên theo name sẽ được apply.

### 14.2. Build new sub-tables

Với mỗi `DecomposedTable dt`:

1. Sinh `tableId`:
   - Logical: prefix `lid`.
   - Physical: prefix `pid`.
2. Với mỗi `dt.attributes`, tạo column.
3. Nếu column nằm trong `dt.primaryKey`:
   - `nullable = false`.
   - `roles.primaryKey = true`.
4. Nếu không là PK:
   - `nullable = true`.
5. Tạo map `_colNameToId` để lookup column id theo lowercase name.
6. Chuyển `dt.fds` thành `functionalDependencies` với id `fd_<uuid>`.

Logical column builder:

```ts
{
    id: `lid_${tableId}_col_${idx}`,
    name: colName,
    nullable: true,
    unique: false,
    roles: {},
}
```

Physical column builder:

- Copy physical metadata từ column gốc cùng tên nếu có:
  - `dataType`.
  - `length`.
  - `autoIncrement`.
  - `defaultValue`.
- `unique` reset false.
- `roles` reset rồi set PK/FK sau.

### 14.3. Move outgoing FKs

Outgoing FK nghĩa là FK nằm trên column của table gốc, trỏ sang table khác.

Rule:

1. Duyệt từng original column của table gốc.
2. Nếu column có `roles.foreignKey`.
3. Tìm sub-table chứa column cùng tên.
4. Gắn lại FK đó vào column tương ứng trong sub-table.

Hệ quả: nếu decomposed table chứa FK column, FK outbound được giữ.

### 14.4. Redirect incoming FKs

Incoming FK nghĩa là table khác trỏ vào table gốc.

Rule:

1. Duyệt mọi table khác.
2. Với mỗi column có FK:
   - Nếu `fk.refTableId !== origTable.id`, giữ nguyên.
   - Nếu trỏ table gốc, tìm original referenced column bằng `fk.refColumnId`.
3. Tìm sub-table mới sở hữu referenced column:
   - Ưu tiên `findPKOwner(refOrigCol.name)`.
   - Fallback `findSubTableByColName(refOrigCol.name)`.
4. Update FK:
   - `refTableId = sub.id`.
   - `refColumnId = id của column tương ứng trong sub`.

### 14.5. findPKOwner

Helper chọn sub-table owner cho một PK column:

1. Tìm các sub-table có column cùng tên và column đó là PK.
2. Nếu 0 hoặc 1 candidate, trả candidate đó hoặc null.
3. Nếu nhiều candidate, chọn table có ít columns nhất.

Ý tưởng: table nhỏ hơn thường là dimension/owner table, không phải join table.

### 14.6. Create inter-decomposition FKs

Sau khi có các sub-tables, code tạo FK giữa chúng:

Với mỗi sub-table, mỗi column:

1. Tìm `owner = findPKOwner(col.name)`.
2. Nếu owner khác chính sub-table:
   - Lấy `refColId` của owner column.
   - Gắn FK từ column hiện tại tới owner column.

Code xử lý cả 2 case:

- Column hiện tại không phải PK.
- Column hiện tại là PK nhưng cũng xuất hiện như PK trong table owner nhỏ hơn.

Hệ quả: decomposed join/sub tables có thể tự động trỏ về table owner của shared PK column.

### 14.7. Assemble final tables

Cuối cùng:

1. Strip helper `_colNameToId`.
2. Return:

```ts
[...updatedOtherTables, ...cleanNewTables]
```

Table gốc bị loại bỏ. Các decomposed tables được append cuối danh sách.

### 14.8. Apply vào logical/physical model

Logical:

```ts
logicalMutateModel(model => ({ ...model, tables }))
```

Physical:

```ts
physicalMutateModel(model => ({ ...model, tables }))
```

Physical giữ lại metadata column gốc nếu tên column match. Logical không có type/default nên chỉ tạo column relational.

## 15. Ví dụ thuật toán

Input table:

```text
student_course(student_id, course_id, student_name, course_name, grade)
PK = {student_id, course_id}
FDs:
student_id -> student_name
course_id -> course_name
student_id, course_id -> grade
```

Candidate key:

```text
{student_id, course_id}
```

2NF violations:

```text
student_id -> student_name
course_id -> course_name
```

Vì determinant là proper subset của composite key và RHS là non-prime.

`currentNF = 1NF`.

3NF decomposition có thể tạo:

```text
student_course_1(student_id, student_name) PK student_id
student_course_2(course_id, course_name) PK course_id
student_course_3(student_id, course_id, grade) PK student_id, course_id
```

Apply decomposition sẽ:

- Xoá table `student_course`.
- Tạo 3 table mới.
- Gắn FK từ table chứa `student_id, course_id, grade` về các table owner `student_id` và `course_id`.
- Redirect FK từ bảng ngoài nếu có trỏ vào column của table cũ.

## 16. Những giới hạn và điểm cần chú ý

1. Engine giả định attributes atomic, không kiểm tra 1NF thực sự.
2. Khi có FDs, `input.candidateKeys` hiện không được dùng; candidate keys được tính từ FDs.
3. Candidate key search giới hạn `maybe.length <= 10` để tránh explosion.
4. `neverInKey` được tính trong `findCandidateKeys` nhưng hiện không dùng trực tiếp.
5. Projection FD là projection đơn giản, không suy ra đầy đủ tất cả implied FDs trên relation con.
6. Target `2NF` vẫn dùng `decompose3NF`, không có decomposition riêng cho 2NF.
7. Nếu chọn BCNF nhưng table dưới 3NF, panel vẫn đề xuất 3NF synthesis trước.
8. BCNF decomposition có safety limit 50 vòng.
9. Apply decomposition tìm table theo name, nên duplicate table names có thể apply nhầm table đầu tiên.
10. Apply decomposition match column theo lowercase name, không theo id.
11. Physical apply chỉ giữ metadata column nếu decomposed column name trùng column gốc.
12. `unique`, `candidateKey`, indexes của physical table gốc không được preserve đầy đủ sau apply.
13. Table gốc bị thay thế hoàn toàn; action có confirm nhưng không có undo riêng ngoài hệ thống undo/version nếu có.
14. Inter-decomposition FK heuristic chọn owner table nhỏ nhất, có thể không đúng với mọi schema phức tạp.
15. Nếu FD được nhập sai hoặc thiếu, kết quả NF/decomposition sẽ phản ánh FD input, không tự suy luận business rule.

## 17. Bảng tóm tắt thuật toán

| Bước | Hàm/code | Kết quả |
|---|---|---|
| Extract model | `extractTablesFromModel` | Convert logical/physical model thành `AnalyzeTableInput[]` |
| Normalize attrs | `norm` | Lowercase, trim, unique, sort |
| Closure | `attributeClosure` | Tính `X+` |
| Superkey | `isSuperkey` | Check closure bao phủ toàn bộ attrs |
| Candidate keys | `findCandidateKeys` | Tìm minimal superkeys bằng base + BFS subsets |
| Minimal cover | `minimalCover` | Split RHS, remove extraneous LHS, remove redundant FD, merge LHS |
| 2NF check | `check2NF` | Partial dependency vào non-prime attr |
| 3NF check | `check3NF` | Non-superkey determinant -> non-prime attr |
| BCNF check | `checkBCNF` | Non-superkey determinant |
| Analyze table | `analyzeTable` | `currentNF`, violations, suggested decomposition |
| 3NF decomposition | `decompose3NF` | Synthesis, dependency preserving |
| BCNF decomposition | `decomposeBCNF` | Lossless, may lose dependencies |
| Panel target | `computeDecomposition` | Chọn 3NF/BCNF decomposition theo target |
| Apply | `handleApplyDecomposition` | Replace table, rewire outgoing/incoming/inter FKs |
