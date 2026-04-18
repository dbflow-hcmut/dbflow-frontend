# Feature Requirements: DDL Export & Migration Versioning

## 1. Overview
The system is a database diagram design tool that allows users to create and edit Physical Database Diagrams.

This feature includes:
- DDL Export: Generate SQL scripts from the current diagram state
- Migration Versioning: Track and apply incremental schema changes over time

---

## 2. DDL Export Feature

### 2.1 Objective
Generate valid SQL DDL statements from the current Physical Diagram.

### 2.2 Input
- Diagram JSON structure:
  - Tables
  - Columns
  - Data types
  - Constraints (PK, FK, UNIQUE, NOT NULL)
  - Indexes
- Selected DBMS (e.g., MySQL, PostgreSQL)
- DBMS config mapping (JSON-based)

### 2.3 Output
- SQL script including:
  - CREATE TABLE
  - ALTER TABLE (if needed)
  - CREATE INDEX
  - FOREIGN KEY constraints

### 2.4 Requirements
- Generate SQL in correct order:
  1. Tables without dependencies
  2. Tables with dependencies
  3. Foreign keys
  4. Indexes
- Support DBMS-specific syntax via config
- Ensure:
  - Correct data types
  - Proper quoting (e.g., backticks for MySQL)
  - Optional constraint naming

---

## 3. Migration Versioning Feature

### 3.1 Objective
Enable incremental schema updates instead of regenerating full DDL.

---

## 3.2 Core Concepts
- Schema Version: Integer representing diagram version
- Migration File: SQL script describing changes between versions
- Schema Diff: Comparison between two diagram states

---

## 3.3 Data Sources
- Previous diagram version (vN)
- Current diagram version (vN+1)

---

## 3.4 Diff Engine Requirements

The system must detect the following changes:

### Table-level
- Create table
- Drop table
- Rename table (optional)

### Column-level
- Add column
- Drop column
- Modify column (type, nullable, default)
- Rename column (optional)

### Constraint-level
- Add/remove primary key
- Add/remove foreign key
- Add/remove unique constraint

### Index-level
- Create index
- Drop index

---

## 3.5 Migration Generation

Generate SQL for each detected change:

| Change        | SQL                       |
|--------------|--------------------------|
| Add column   | ALTER TABLE ADD COLUMN   |
| Drop column  | ALTER TABLE DROP COLUMN  |
| Modify column| ALTER TABLE MODIFY COLUMN|
| Create table | CREATE TABLE             |
| Drop table   | DROP TABLE               |

---

## 3.6 Migration File Format

Each migration file must include:
- Version number
- Up script (apply changes)
- Down script (rollback changes)

Example:

```sql
-- version: 002

-- up
ALTER TABLE users ADD COLUMN email VARCHAR(255);

-- down
ALTER TABLE users DROP COLUMN email;
````

---

## 3.7 Version Tracking

### Database Side

Create a tracking table:

```sql
CREATE TABLE schema_migrations (
  version INT PRIMARY KEY,
  applied_at TIMESTAMP
);
```

### Behavior

* Check current DB version before applying migrations
* Apply only unapplied migrations
* Insert new version after execution

---

## 3.8 Storage

* Diagram versions stored in S3:
  /diagram/{projectId}/v{n}.json

* Migration files stored separately:
  /migrations/{projectId}/{version}.sql

---

## 3.9 Execution Flow

1. User updates diagram
2. System saves new diagram version
3. Compare previous version with current version
4. Generate migration SQL
5. Save migration file
6. (Optional) Apply migration to database

---

## 4. Non-functional Requirements

* Deterministic output (same input → same SQL)
* Idempotent migrations (avoid duplication)
* Extensible for multiple DBMS
* Scalable for large schemas

---

## 5. Future Enhancements (Optional)

* Visual schema diff UI
* Auto-apply migrations
* Reverse engineering (DB → diagram)
* Conflict resolution for team collaboration
