import React, { useState, useCallback } from 'react';
import { Select, Button, Space, Table, Form, Input, Checkbox, message, Tabs } from 'antd';
import { CopyOutlined, DeleteOutlined, PlayCircleOutlined, ClearOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { executeQueryDbConnection, QueryResultDto } from '@/api/db-connections/client';

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
  operator: 'equals' | 'like' | 'greaterThan' | 'lessThan' | 'between';
  value: string | string[];
}

interface GeneratedQuery {
  id: string;
  type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  query: string;
  parameters: QueryParameter[];
  timestamp: number;
}

// SQL Generator Utility Functions
const SQLGeneratorUtils = {
  generateSelectQuery: (table: Table, parameters: QueryParameter[]): string => {
    let query = `SELECT * FROM ${table.name}`;

    if (parameters.length > 0) {
      const conditions = parameters.map(param => {
        switch (param.operator) {
          case 'equals':
            return `${param.column} = '${param.value}'`;
          case 'like':
            return `${param.column} LIKE '%${param.value}%'`;
          case 'greaterThan':
            return `${param.column} > ${param.value}`;
          case 'lessThan':
            return `${param.column} < ${param.value}`;
          case 'between':
            const [start, end] = param.value as string[];
            return `${param.column} BETWEEN ${start} AND ${end}`;
          default:
            return '';
        }
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return query + ';';
  },

  generateInsertQuery: (table: Table, columnValues: Record<string, string>): string => {
    const columns = Object.keys(columnValues);
    const values = Object.values(columnValues);
    return `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values.map(v => `'${v}'`).join(', ')});`;
  },

  generateUpdateQuery: (table: Table, updates: Record<string, string>, whereCondition: QueryParameter): string => {
    const setClause = Object.entries(updates)
      .map(([col, val]) => `${col} = '${val}'`)
      .join(', ');
    const whereClause = `${whereCondition.column} = '${whereCondition.value}'`;
    return `UPDATE ${table.name} SET ${setClause} WHERE ${whereClause};`;
  },

  generateDeleteQuery: (table: Table, whereCondition: QueryParameter): string => {
    const whereClause = `${whereCondition.column} = '${whereCondition.value}'`;
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
  projectId,
  connId,
  onDatabaseConfigRequired,
  isLoading = false,
  hasConnection = false,
}) => {
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [queryType, setQueryType] = useState<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>('SELECT');
  const [parameters, setParameters] = useState<QueryParameter[]>([]);
  const [generatedQueries, setGeneratedQueries] = useState<GeneratedQuery[]>([]);
  const [queryResults, setQueryResults] = useState<QueryResultDto | null>(null);
  const [executing, setExecuting] = useState(false);
  const [form] = Form.useForm();

  const currentTable = tables.find(t => t.id === selectedTable);

  const handleGenerateQuery = useCallback(() => {
    if (!currentTable) {
      message.error('Please select a table');
      return;
    }

    let query = '';

    try {
      switch (queryType) {
        case 'SELECT':
          query = SQLGeneratorUtils.generateSelectQuery(currentTable, parameters);
          break;
        case 'INSERT':
          message.info('INSERT query generation - requires database connection');
          break;
        case 'UPDATE':
          message.info('UPDATE query generation - requires database connection');
          break;
        case 'DELETE':
          message.info('DELETE query generation - requires database connection');
          break;
      }

      if (query) {
        const newQuery: GeneratedQuery = {
          id: `query-${Date.now()}`,
          type: queryType,
          query,
          parameters,
          timestamp: Date.now(),
        };

        setGeneratedQueries([newQuery, ...generatedQueries]);
        message.success('Query generated successfully');
      }
    } catch (error) {
      message.error('Failed to generate query');
    }
  }, [currentTable, queryType, parameters, generatedQueries]);

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
                        onChange={setSelectedTable}
                        options={tables.map(t => ({
                          label: t.name,
                          value: t.id,
                        }))}
                      />
                    </Form.Item>

                    <Form.Item label="Query Type" required>
                      <Select
                        value={queryType}
                        onChange={setQueryType}
                        options={[
                          { label: 'SELECT', value: 'SELECT' },
                          { label: 'INSERT', value: 'INSERT' },
                          { label: 'UPDATE', value: 'UPDATE' },
                          { label: 'DELETE', value: 'DELETE' },
                        ]}
                      />
                    </Form.Item>

                    {queryType === 'SELECT' && currentTable && (
                      <Form.Item label="Filters">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {currentTable.columns.map(col => (
                            <Checkbox key={col.id}>
                              {col.name}
                            </Checkbox>
                          ))}
                        </div>
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
