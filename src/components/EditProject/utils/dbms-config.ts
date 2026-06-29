export type FKAction = 'NO ACTION' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT';

export type IndexType = 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'BRIN' | 'CLUSTERED' | 'NONCLUSTERED';

export type ColumnSortOrder = 'ASC' | 'DESC';

export type DBMSType = 'mysql' | 'postgresql' | 'sqlserver';

export type DataTypeOption = {
    value: string;
    label: string;
    hasLength?: boolean;      // e.g. VARCHAR(255)
    hasPrecision?: boolean;   // e.g. DECIMAL(10,2)
    category: 'numeric' | 'string' | 'date' | 'boolean' | 'binary' | 'json' | 'uuid' | 'other';
};

export type DBMSConfig = {
    name: string;
    dataTypes: DataTypeOption[];
    indexTypes: IndexType[];
    fkActions: FKAction[];
    autoIncrementKeyword: string;
    defaultType: string;
    // DDL generation helpers
    quoteChar: [string, string];        // e.g. ['"', '"'] for PG, ['`', '`'] for MySQL, ['[', ']'] for SQL Server
    serialTypes: Record<string, string>; // Maps 'serial' → DBMS-specific DDL type expression
    nowFunction: string;                 // e.g. 'NOW()' | 'GETDATE()' | "datetime('now')"
    supportsIfNotExists: boolean;
    supportsIndexUsing: boolean;         // USING BTREE syntax
};

const COMMON_FK_ACTIONS: FKAction[] = ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT'];

const mysqlConfig: DBMSConfig = {
    name: 'MySQL',
    quoteChar: ['`', '`'],
    serialTypes: { serial: 'INT AUTO_INCREMENT', bigserial: 'BIGINT AUTO_INCREMENT' },
    nowFunction: 'NOW()',
    supportsIfNotExists: true,
    supportsIndexUsing: true,
    dataTypes: [
        // Numeric
        { value: 'tinyint', label: 'TINYINT', category: 'numeric' },
        { value: 'smallint', label: 'SMALLINT', category: 'numeric' },
        { value: 'mediumint', label: 'MEDIUMINT', category: 'numeric' },
        { value: 'int', label: 'INT', category: 'numeric' },
        { value: 'bigint', label: 'BIGINT', category: 'numeric' },
        { value: 'decimal', label: 'DECIMAL', hasPrecision: true, category: 'numeric' },
        { value: 'numeric', label: 'NUMERIC', hasPrecision: true, category: 'numeric' },
        { value: 'float', label: 'FLOAT', category: 'numeric' },
        { value: 'double', label: 'DOUBLE', category: 'numeric' },
        // String
        { value: 'char', label: 'CHAR', hasLength: true, category: 'string' },
        { value: 'varchar', label: 'VARCHAR', hasLength: true, category: 'string' },
        { value: 'tinytext', label: 'TINYTEXT', category: 'string' },
        { value: 'text', label: 'TEXT', category: 'string' },
        { value: 'mediumtext', label: 'MEDIUMTEXT', category: 'string' },
        { value: 'longtext', label: 'LONGTEXT', category: 'string' },
        { value: 'enum', label: 'ENUM', category: 'string' },
        { value: 'set', label: 'SET', category: 'string' },
        // Date
        { value: 'date', label: 'DATE', category: 'date' },
        { value: 'time', label: 'TIME', category: 'date' },
        { value: 'datetime', label: 'DATETIME', category: 'date' },
        { value: 'timestamp', label: 'TIMESTAMP', category: 'date' },
        { value: 'year', label: 'YEAR', category: 'date' },
        // Boolean
        { value: 'boolean', label: 'BOOLEAN', category: 'boolean' },
        // Binary
        { value: 'binary', label: 'BINARY', hasLength: true, category: 'binary' },
        { value: 'varbinary', label: 'VARBINARY', hasLength: true, category: 'binary' },
        { value: 'blob', label: 'BLOB', category: 'binary' },
        { value: 'longblob', label: 'LONGBLOB', category: 'binary' },
        // JSON
        { value: 'json', label: 'JSON', category: 'json' },
    ],
    indexTypes: ['BTREE', 'HASH'],
    fkActions: COMMON_FK_ACTIONS,
    autoIncrementKeyword: 'AUTO_INCREMENT',
    defaultType: 'varchar',
};

const postgresqlConfig: DBMSConfig = {
    name: 'PostgreSQL',
    quoteChar: ['"', '"'],
    serialTypes: { serial: 'SERIAL', bigserial: 'BIGSERIAL' },
    nowFunction: 'NOW()',
    supportsIfNotExists: true,
    supportsIndexUsing: true,
    dataTypes: [
        // Numeric
        { value: 'smallint', label: 'SMALLINT', category: 'numeric' },
        { value: 'integer', label: 'INTEGER', category: 'numeric' },
        { value: 'bigint', label: 'BIGINT', category: 'numeric' },
        { value: 'serial', label: 'SERIAL', category: 'numeric' },
        { value: 'bigserial', label: 'BIGSERIAL', category: 'numeric' },
        { value: 'decimal', label: 'DECIMAL', hasPrecision: true, category: 'numeric' },
        { value: 'numeric', label: 'NUMERIC', hasPrecision: true, category: 'numeric' },
        { value: 'real', label: 'REAL', category: 'numeric' },
        { value: 'double precision', label: 'DOUBLE PRECISION', category: 'numeric' },
        // String
        { value: 'char', label: 'CHAR', hasLength: true, category: 'string' },
        { value: 'varchar', label: 'VARCHAR', hasLength: true, category: 'string' },
        { value: 'text', label: 'TEXT', category: 'string' },
        // Date
        { value: 'date', label: 'DATE', category: 'date' },
        { value: 'time', label: 'TIME', category: 'date' },
        { value: 'timestamp', label: 'TIMESTAMP', category: 'date' },
        { value: 'timestamptz', label: 'TIMESTAMPTZ', category: 'date' },
        { value: 'interval', label: 'INTERVAL', category: 'date' },
        // Boolean
        { value: 'boolean', label: 'BOOLEAN', category: 'boolean' },
        // Binary
        { value: 'bytea', label: 'BYTEA', category: 'binary' },
        // JSON
        { value: 'json', label: 'JSON', category: 'json' },
        { value: 'jsonb', label: 'JSONB', category: 'json' },
        // UUID
        { value: 'uuid', label: 'UUID', category: 'uuid' },
        // Other
        { value: 'cidr', label: 'CIDR', category: 'other' },
        { value: 'inet', label: 'INET', category: 'other' },
        { value: 'macaddr', label: 'MACADDR', category: 'other' },
        { value: 'xml', label: 'XML', category: 'other' },
        { value: 'array', label: 'ARRAY', category: 'other' },
    ],
    indexTypes: ['BTREE', 'HASH', 'GIN', 'GIST', 'BRIN'],
    fkActions: COMMON_FK_ACTIONS,
    autoIncrementKeyword: 'GENERATED ALWAYS AS IDENTITY',
    defaultType: 'varchar',
};

const sqlserverConfig: DBMSConfig = {
    name: 'SQL Server',
    quoteChar: ['[', ']'],
    serialTypes: { serial: 'INT IDENTITY(1,1)', bigserial: 'BIGINT IDENTITY(1,1)' },
    nowFunction: 'GETDATE()',
    supportsIfNotExists: false,
    supportsIndexUsing: false,
    dataTypes: [
        // Numeric
        { value: 'tinyint', label: 'TINYINT', category: 'numeric' },
        { value: 'smallint', label: 'SMALLINT', category: 'numeric' },
        { value: 'int', label: 'INT', category: 'numeric' },
        { value: 'bigint', label: 'BIGINT', category: 'numeric' },
        { value: 'decimal', label: 'DECIMAL', hasPrecision: true, category: 'numeric' },
        { value: 'numeric', label: 'NUMERIC', hasPrecision: true, category: 'numeric' },
        { value: 'float', label: 'FLOAT', category: 'numeric' },
        { value: 'real', label: 'REAL', category: 'numeric' },
        { value: 'money', label: 'MONEY', category: 'numeric' },
        // String
        { value: 'char', label: 'CHAR', hasLength: true, category: 'string' },
        { value: 'varchar', label: 'VARCHAR', hasLength: true, category: 'string' },
        { value: 'nchar', label: 'NCHAR', hasLength: true, category: 'string' },
        { value: 'nvarchar', label: 'NVARCHAR', hasLength: true, category: 'string' },
        { value: 'text', label: 'TEXT', category: 'string' },
        { value: 'ntext', label: 'NTEXT', category: 'string' },
        // Date
        { value: 'date', label: 'DATE', category: 'date' },
        { value: 'time', label: 'TIME', category: 'date' },
        { value: 'datetime', label: 'DATETIME', category: 'date' },
        { value: 'datetime2', label: 'DATETIME2', category: 'date' },
        { value: 'datetimeoffset', label: 'DATETIMEOFFSET', category: 'date' },
        // Boolean
        { value: 'bit', label: 'BIT', category: 'boolean' },
        // Binary
        { value: 'binary', label: 'BINARY', hasLength: true, category: 'binary' },
        { value: 'varbinary', label: 'VARBINARY', hasLength: true, category: 'binary' },
        { value: 'image', label: 'IMAGE', category: 'binary' },
        // UUID
        { value: 'uniqueidentifier', label: 'UNIQUEIDENTIFIER', category: 'uuid' },
        // Other
        { value: 'xml', label: 'XML', category: 'other' },
    ],
    indexTypes: ['CLUSTERED', 'NONCLUSTERED'],
    fkActions: COMMON_FK_ACTIONS,
    autoIncrementKeyword: 'IDENTITY(1,1)',
    defaultType: 'varchar',
};

export const DBMS_CONFIGS: Record<DBMSType, DBMSConfig> = {
    mysql: mysqlConfig,
    postgresql: postgresqlConfig,
    sqlserver: sqlserverConfig,
};

export const getDBMSConfig = (dbms?: DBMSType | string): DBMSConfig => {
    if (dbms && dbms in DBMS_CONFIGS) {
        return DBMS_CONFIGS[dbms as DBMSType];
    }
    return postgresqlConfig; // Default
};

/** Generic (non-DBMS-specific) data type options — used as fallback */
export const GENERIC_DATA_TYPES: DataTypeOption[] = [
    { value: 'varchar', label: 'VARCHAR', hasLength: true, category: 'string' },
    { value: 'char', label: 'CHAR', hasLength: true, category: 'string' },
    { value: 'text', label: 'TEXT', category: 'string' },
    { value: 'int', label: 'INT', category: 'numeric' },
    { value: 'integer', label: 'INTEGER', category: 'numeric' },
    { value: 'bigint', label: 'BIGINT', category: 'numeric' },
    { value: 'smallint', label: 'SMALLINT', category: 'numeric' },
    { value: 'serial', label: 'SERIAL', category: 'numeric' },
    { value: 'decimal', label: 'DECIMAL', hasPrecision: true, category: 'numeric' },
    { value: 'numeric', label: 'NUMERIC', hasPrecision: true, category: 'numeric' },
    { value: 'float', label: 'FLOAT', category: 'numeric' },
    { value: 'double', label: 'DOUBLE', category: 'numeric' },
    { value: 'boolean', label: 'BOOLEAN', category: 'boolean' },
    { value: 'date', label: 'DATE', category: 'date' },
    { value: 'time', label: 'TIME', category: 'date' },
    { value: 'timestamp', label: 'TIMESTAMP', category: 'date' },
    { value: 'datetime', label: 'DATETIME', category: 'date' },
    { value: 'blob', label: 'BLOB', category: 'binary' },
    { value: 'uuid', label: 'UUID', category: 'uuid' },
    { value: 'json', label: 'JSON', category: 'json' },
    { value: 'jsonb', label: 'JSONB', category: 'json' },
];
