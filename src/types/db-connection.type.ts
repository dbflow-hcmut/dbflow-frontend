export type DBConnectionDBMS =
    | "postgresql"
    | "mysql"
    | "sqlserver";

export type DBConnectionMethod = "direct" | "ssh" | "local_agent";

export type DBConnectionStatus = "connected" | "failed" | "untested";

export type SSHAuthType = "password" | "private_key";

export interface DBConnection {
    id: string;
    workspaceId: string;
    name: string;
    dbms: DBConnectionDBMS;
    method: DBConnectionMethod;
    status: DBConnectionStatus;
    host: string;
    port: number;
    database: string;
    username: string;
    ssl: boolean;
    sshHost?: string;
    sshPort?: number;
    sshUsername?: string;
    sshAuthType?: SSHAuthType;
    createdAt: string;
    updatedAt: string;
}

export interface DBConnectionFormValues {
    workspaceId?: string;
    name: string;
    dbms: DBConnectionDBMS;
    method: DBConnectionMethod;
    host: string;
    port: number;
    database: string;
    username: string;
    password?: string;
    ssl: boolean;
    sshHost?: string;
    sshPort?: number;
    sshUsername?: string;
    sshAuthType?: SSHAuthType;
    sshPassword?: string;
    sshPrivateKey?: string;
}

export const DEFAULT_PORTS: Record<DBConnectionDBMS, number> = {
    postgresql: 5432,
    mysql: 3306,
    sqlserver: 1433,
};
