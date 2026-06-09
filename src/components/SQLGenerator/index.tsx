import React, { useState, useCallback } from 'react';
import { Select, Button, Space, Table, Form, Input, Checkbox, message, Tabs, Divider } from 'antd';
import { CopyOutlined, DeleteOutlined, PlayCircleOutlined, ClearOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { executeQueryDbConnection, QueryResultDto } from '@/api/db-connections/client';

type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
type QueryOperator = 'equals' | 'like' | 'greaterThan' | 'lessThan' | 'between';

// Types for SQL Generation
interface Column {
  id: string;
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

interface Table {
  id: string;
  name: string;
  columns: Column[];
}

interface QueryParameter {
  column: string;
  operator: QueryOperator;
  value: string | string[];
}

interface GeneratedQuery {
  id: string;
  type: QueryType;
  query: string;
  parameters: QueryParameter[];
  timestamp: number;
}

interface FilterFormValue {
  column?: string;
  operator?: QueryOperator;
  value?: string;
  valueEnd?: string;
}

interface QueryFormValues {
  selectedColumns?: string[];
  filters?: FilterFormValue[];
  where?: FilterFormValue[];
  insertValues?: Record<string, string>;
  updateValues?: Record<string, string>;
}

const operatorOptions: { label: string; value: QueryOperator }[] = [
  { label: 'Equals', value: 'equals' },
  { label: 'Contains', value: 'like' },
  { label: 'Greater than', value: 'greaterThan' },
  { label: 'Less than', value: 'lessThan' },
  { label: 'Between', value: 'between' },
];

const isBlank = (value: unknown): boolean => value === undefined || value === null || String(value).trim() === '';

const escapeSqlString = (value: string): string => value.replace(/'/g, "''");

const isNumericColumn = (column?: Column): boolean => {
  const type = column?.type?.toLowerCase() ?? '';
  return /\b(int|integer|bigint|smallint|tinyint|decimal|numeric|number|float|double|real|money)\b/.test(type);
};

const isBooleanColumn = (column?: Column): boolean => {
  const type = column?.type?.toLowerCase() ?? '';
  return /\b(bool|boolean|bit)\b/.test(type);
};

const formatSqlValue = (table: Table, columnName: string, value: string): string => {
  const trimmed = value.trim();
  const column = table.columns.find(col => col.name === columnName);

  if (trimmed.toUpperCase() === 'NULL') {
    return 'NULL';
  }

  if (isBooleanColumn(column)) {
    if (/^(true|1|yes)$/i.test(trimmed)) return 'TRUE';
    if (/^(false|0|no)$/i.test(trimmed)) return 'FALSE';
  }

  if (isNumericColumn(column) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return `'${escapeSqlString(trimmed)}'`;
};

const buildCondition = (table: Table, param: QueryParameter): string => {
  if (param.operator === 'between') {
    const [start, end] = param.value as string[];
    return `${param.column} BETWEEN ${formatSqlValue(table, param.column, start)} AND ${formatSqlValue(table, param.column, end)}`;
  }

  const value = Array.isArray(param.value) ? param.value[0] : param.value;
  const sqlValue = formatSqlValue(table, param.column, value);

  if (sqlValue === 'NULL' && param.operator === 'equals') {
    return `${param.column} IS NULL`;
  }

  switch (param.operator) {
    case 'equals':
      return `${param.column} = ${sqlValue}`;
    case 'like':
      return `${param.column} LIKE '%${escapeSqlString(value.trim())}%'`;
    case 'greaterThan':
      return `${param.column} > ${sqlValue}`;
    case 'lessThan':
      return `${param.column} < ${sqlValue}`;
    default:
      return '';
  }
};

const normalizeFilters = (filters: FilterFormValue[] | undefined): QueryParameter[] => (
  filters ?? []
).reduce<QueryParameter[]>((acc, filter) => {
  if (!filter.column || !filter.operator || isBlank(filter.value)) return acc;

  if (filter.operator === 'between') {
    if (isBlank(filter.valueEnd)) return acc;
    acc.push({
      column: filter.column,
      operator: filter.operator,
      value: [String(filter.value), String(filter.valueEnd)],
    });
    return acc;
  }

  acc.push({
    column: filter.column,
    operator: filter.operator,
    value: String(filter.value),
  });
  return acc;
}, []);

const normalizeColumnValues = (values: Record<string, string> | undefined): Record<string, string> => {
  return Object.entries(values ?? {}).reduce<Record<string, string>>((acc, [column, value]) => {
    if (!isBlank(value)) {
      acc[column] = String(value);
    }
    return acc;
  }, {});
};

// SQL Generator Utility Functions
const SQLGeneratorUtils = {
  generateSelectQuery: (table: Table, selectedColumns: string[], parameters: QueryParameter[]): string => {
    const columns = selectedColumns.length > 0 ? selectedColumns : table.columns.map(col => col.name);
    let query = `SELECT ${columns.join(', ')} FROM ${table.name}`;

    if (parameters.length > 0) {
      const conditions = parameters.map(param => buildCondition(table, param)).filter(Boolean);
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return query + ';';
  },

  generateInsertQuery: (table: Table, columnValues: Record<string, string>): string => {
    const columns = Object.keys(columnValues);
    const values = columns.map(column => formatSqlValue(table, column, columnValues[column]));
    return `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  },

  generateUpdateQuery: (table: Table, updates: Record<string, string>, whereConditions: QueryParameter[]): string => {
    const setClause = Object.entries(updates)
      .map(([col, val]) => `${col} = ${formatSqlValue(table, col, val)}`)
      .join(', ');
    const whereClause = whereConditions.map(param => buildCondition(table, param)).filter(Boolean).join(' AND ');
    return `UPDATE ${table.name} SET ${setClause} WHERE ${whereClause};`;
  },

  generateDeleteQuery: (table: Table, whereConditions: QueryParameter[]): string => {
    const whereClause = whereConditions.map(param => buildCondition(table, param)).filter(Boolean).join(' AND ');
    return `DELETE FROM ${table.name} WHERE ${whereClause};`;
  },
};

// SQL Generator Component
interface SQLGeneratorProps {
  tables: Table[];
  projectId: string;
  connId?: string;
  onDatabaseConfigRequired?: () => void;
  isLoading?: boolean;
  hasConnection?: boolean;
}

const SQLGenerator: React.FC<SQLGeneratorProps> = ({
  tables,
  connId,
  onDatabaseConfigRequired,
  isLoading = false,
}) => {
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [queryType, setQueryType] = useState<QueryType>('SELECT');
  const [generatedQueries, setGeneratedQueries] = useState<GeneratedQuery[]>([]);
  const [queryResults, setQueryResults] = useState<QueryResultDto | null>(null);
  const [executing, setExecuting] = useState(false);
  const [form] = Form.useForm<QueryFormValues>();

  const currentTable = tables.find(t => t.id === selectedTable);

  const handleTableChange = useCallback((tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    setSelectedTable(tableId);
    form.resetFields();
    form.setFieldsValue({
      selectedColumns: table?.columns.map(col => col.name) ?? [],
      filters: [],
      where: [],
      insertValues: {},
      updateValues: {},
    });
  }, [form, tables]);

  const handleQueryTypeChange = useCallback((type: QueryType) => {
    setQueryType(type);
    form.resetFields();
    form.setFieldsValue({
      selectedColumns: currentTable?.columns.map(col => col.name) ?? [],
      filters: [],
      where: [],
      insertValues: {},
      updateValues: {},
    });
  }, [currentTable, form]);

  const handleGenerateQuery = useCallback(async () => {
    if (!currentTable) {
      message.error('Please select a table');
      return;
    }

    let query = '';
    let queryParameters: QueryParameter[] = [];

    try {
      const values = await form.validateFields();

      switch (queryType) {
        case 'SELECT': {
          queryParameters = normalizeFilters(values.filters);
          query = SQLGeneratorUtils.generateSelectQuery(currentTable, values.selectedColumns ?? [], queryParameters);
          break;
        }
        case 'INSERT': {
          const insertValues = normalizeColumnValues(values.insertValues);
          if (Object.keys(insertValues).length === 0) {
            message.error('Enter at least one value to insert');
            return;
          }
          query = SQLGeneratorUtils.generateInsertQuery(currentTable, insertValues);
          break;
        }
        case 'UPDATE': {
          const updateValues = normalizeColumnValues(values.updateValues);
          queryParameters = normalizeFilters(values.where);
          if (Object.keys(updateValues).length === 0) {
            message.error('Enter at least one column value to update');
            return;
          }
          if (queryParameters.length === 0) {
            message.error('Add at least one WHERE condition for UPDATE');
            return;
          }
          query = SQLGeneratorUtils.generateUpdateQuery(currentTable, updateValues, queryParameters);
          break;
        }
        case 'DELETE': {
          queryParameters = normalizeFilters(values.where);
          if (queryParameters.length === 0) {
            message.error('Add at least one WHERE condition for DELETE');
            return;
          }
          query = SQLGeneratorUtils.generateDeleteQuery(currentTable, queryParameters);
          break;
        }
      }

      if (query) {
        const newQuery: GeneratedQuery = {
          id: `query-${Date.now()}`,
          type: queryType,
          query,
          parameters: queryParameters,
          timestamp: Date.now(),
        };

        setGeneratedQueries(prevQueries => [newQuery, ...prevQueries]);
        message.success('Query generated successfully');
      }
    } catch (error) {
      const hasFormErrors = typeof error === 'object' && error !== null && 'errorFields' in error;
      if (!hasFormErrors) {
        message.error('Failed to generate query');
      }
    }
  }, [currentTable, form, queryType]);

  const handleExecuteQuery = useCallback(async (query: string) => {
    if (!connId) {
      message.error('Database connection not configured');
      return;
    }

    setExecuting(true);
    try {
      const result = await executeQueryDbConnection(connId, query);
      setQueryResults(result);
      if (result.success) {
        message.success(`Query executed: ${result.rowCount} rows returned`);
      } else {
        message.error(`Query failed: ${result.message}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      message.error(`Execution error: ${errorMsg}`);
      setQueryResults({
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        executionTimeMs: 0,
        message: errorMsg,
      });
    } finally {
      setExecuting(false);
    }
  }, [connId]);

  const handleCopyQuery = useCallback((query: string) => {
    navigator.clipboard.writeText(query);
    message.success('Query copied to clipboard');
  }, []);

  const handleDeleteQuery = useCallback((queryId: string) => {
    setGeneratedQueries(generatedQueries.filter(q => q.id !== queryId));
  }, [generatedQueries]);

  const handleClearResults = useCallback(() => {
    setQueryResults(null);
  }, []);

  const renderConditionList = (name: 'filters' | 'where', emptyText: string) => (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {fields.length === 0 && (
            <div style={{ color: '#999', fontSize: '12px' }}>{emptyText}</div>
          )}
          {fields.map(field => (
            <div
              key={field.key}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: '6px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item
                  name={[field.name, 'column']}
                  rules={[{ required: true, message: 'Select column' }]}
                  style={{ marginBottom: 0, width: '45%' }}
                >
                  <Select
                    placeholder="Column"
                    options={currentTable?.columns.map(col => ({
                      label: `${col.name} (${col.type})`,
                      value: col.name,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'operator']}
                  rules={[{ required: true, message: 'Select operator' }]}
                  style={{ marginBottom: 0, width: '45%' }}
                  initialValue="equals"
                >
                  <Select placeholder="Operator" options={operatorOptions} />
                </Form.Item>
                <Button
                  danger
                  icon={<MinusCircleOutlined />}
                  onClick={() => remove(field.name)}
                  style={{ width: '10%' }}
                />
              </Space.Compact>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, nextValues) => {
                  const prevOperator = prevValues?.[name]?.[field.name]?.operator;
                  const nextOperator = nextValues?.[name]?.[field.name]?.operator;
                  return prevOperator !== nextOperator;
                }}
              >
                {({ getFieldValue }) => {
                  const operator = getFieldValue([name, field.name, 'operator']);
                  if (operator === 'between') {
                    return (
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item
                          name={[field.name, 'value']}
                          rules={[{ required: true, message: 'Start value' }]}
                          style={{ marginBottom: 0, width: '50%' }}
                        >
                          <Input placeholder="Start value" />
                        </Form.Item>
                        <Form.Item
                          name={[field.name, 'valueEnd']}
                          rules={[{ required: true, message: 'End value' }]}
                          style={{ marginBottom: 0, width: '50%' }}
                        >
                          <Input placeholder="End value" />
                        </Form.Item>
                      </Space.Compact>
                    );
                  }

                  return (
                    <Form.Item
                      name={[field.name, 'value']}
                      rules={[{ required: true, message: 'Enter value' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder={operator === 'like' ? 'Text to contain' : 'Value'} />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </div>
          ))}
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => add({ operator: 'equals' })}
            disabled={!currentTable}
          >
            Add Condition
          </Button>
        </div>
      )}
    </Form.List>
  );

  const queryColumns: ColumnsType<GeneratedQuery> = [
    {
      title: 'Type',
      dataIndex: 'type',
      width: 100,
    },
    {
      title: 'Query',
      dataIndex: 'query',
      render: (text: string) => (
        <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>{text}</code>
      ),
    },
    {
      title: 'Action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={() => handleExecuteQuery(record.query)}
            loading={executing}
            disabled={!connId}
          >
            Execute
          </Button>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopyQuery(record.query)}
          >
            Copy
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteQuery(record.id)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  const resultColumns: ColumnsType<Record<string, unknown>> = queryResults?.columns
    ? queryResults.columns.map((col) => ({
        title: col,
        dataIndex: col,
        render: (text: unknown) => (
          <span style={{ fontSize: '12px' }}>{String(text ?? 'NULL')}</span>
        ),
      }))
    : [];

  return (
    <div style={{ padding: '24px' }}>
      <Tabs
        items={[
          {
            key: 'generator',
            label: 'SQL Generator',
            children: (
              <div style={{ display: 'flex', gap: '24px' }}>
                {/* Left Panel: Query Builder */}
                <div style={{ flex: '0 0 300px' }}>
                  <Form layout="vertical" form={form}>
                    <Form.Item label="Table" required>
                      <Select
                        placeholder="Select a table"
                        value={selectedTable}
                        onChange={handleTableChange}
                        options={tables.map(t => ({
                          label: t.name,
                          value: t.id,
                        }))}
                      />
                    </Form.Item>

                    <Form.Item label="Query Type" required>
                      <Select
                        value={queryType}
                        onChange={handleQueryTypeChange}
                        options={[
                          { label: 'SELECT', value: 'SELECT' },
                          { label: 'INSERT', value: 'INSERT' },
                          { label: 'UPDATE', value: 'UPDATE' },
                          { label: 'DELETE', value: 'DELETE' },
                        ]}
                      />
                    </Form.Item>

                    {queryType === 'SELECT' && currentTable && (
                      <>
                        <Form.Item
                          label="Columns"
                          name="selectedColumns"
                          initialValue={currentTable.columns.map(col => col.name)}
                          rules={[{ required: true, message: 'Select at least one column' }]}
                        >
                          <Checkbox.Group
                            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                            options={currentTable.columns.map(col => ({
                              label: `${col.name} (${col.type})`,
                              value: col.name,
                            }))}
                          />
                        </Form.Item>

                        <Divider style={{ margin: '12px 0' }} />

                        <Form.Item label="Filters">
                          {renderConditionList('filters', 'No filters. The query will return all rows.')}
                        </Form.Item>
                      </>
                    )}

                    {queryType === 'INSERT' && currentTable && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ color: '#666', fontSize: '12px' }}>
                          Leave a field blank to omit that column from the INSERT.
                        </div>
                        {currentTable.columns.map(col => (
                          <Form.Item
                            key={col.id}
                            label={`${col.name} (${col.type})${col.isPrimaryKey ? ' - PK' : ''}`}
                            name={['insertValues', col.name]}
                          >
                            <Input placeholder={col.isNullable ? 'NULL or value' : 'Value'} />
                          </Form.Item>
                        ))}
                      </div>
                    )}

                    {queryType === 'UPDATE' && currentTable && (
                      <>
                        <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>
                          Leave a field blank to keep that column unchanged.
                        </div>
                        {currentTable.columns.map(col => (
                          <Form.Item
                            key={col.id}
                            label={`${col.name} (${col.type})${col.isPrimaryKey ? ' - PK' : ''}`}
                            name={['updateValues', col.name]}
                          >
                            <Input placeholder="New value" />
                          </Form.Item>
                        ))}

                        <Divider style={{ margin: '12px 0' }} />

                        <Form.Item label="WHERE Conditions" required>
                          {renderConditionList('where', 'Add a condition to choose which rows are updated.')}
                        </Form.Item>
                      </>
                    )}

                    {queryType === 'DELETE' && currentTable && (
                      <Form.Item label="WHERE Conditions" required>
                        {renderConditionList('where', 'Add a condition to choose which rows are deleted.')}
                      </Form.Item>
                    )}

                    <Form.Item>
                      <Button
                        type="primary"
                        block
                        onClick={handleGenerateQuery}
                        loading={isLoading}
                      >
                        Generate Query
                      </Button>
                    </Form.Item>
                  </Form>
                </div>

                {/* Right Panel: Generated Queries */}
                <div style={{ flex: 1 }}>
                  <h3>Generated Queries</h3>
                  <Table
                    columns={queryColumns}
                    dataSource={generatedQueries}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    style={{ maxHeight: '500px', overflow: 'auto' }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'results',
            label: `Query Results${queryResults ? ` (${queryResults.rowCount} rows)` : ''}`,
            children: queryResults ? (
              <div>
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>Status:</strong> {queryResults.success ? 'Success' : 'Failed'}
                    {queryResults.message && ` - ${queryResults.message}`}
                  </div>
                  <Button
                    icon={<ClearOutlined />}
                    onClick={handleClearResults}
                  >
                    Clear
                  </Button>
                </div>
                {queryResults.success && queryResults.rows.length > 0 ? (
                  <Table
                    columns={resultColumns}
                    dataSource={queryResults.rows.map((row, idx) => ({ ...row, key: idx }))}
                    rowKey="key"
                    size="small"
                    pagination={{ pageSize: 50 }}
                    style={{ maxHeight: '600px' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
                    {queryResults.success ? 'No rows returned' : 'Query execution failed'}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
                No query results to display. Generate and execute a query to see results here.
              </div>
            ),
          },
          {
            key: 'database-config',
            label: 'Database Configuration',
            children: (
              <div>
                <p>Database connection is required for full SQL query generation capabilities.</p>
                <Button
                  type="primary"
                  onClick={onDatabaseConfigRequired}
                >
                  Configure Database Connection
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default SQLGenerator;
