"use client";

import React, { useCallback, useState } from "react";
import {
    Modal,
    Form,
    Input,
    Button,
    Segmented,
    Switch,
    Radio,
    Divider,
    InputNumber,
} from "antd";
import {
    PlugZap,
    Network,
    MonitorSmartphone,
    CheckCircle2,
    XCircle,
    Loader2,
    ArrowLeft,
} from "lucide-react";
import { notificationProvider } from "@/providers/notification";
import LocalAgentBanner from "./LocalAgentBanner";
import {
    createDbConnection,
    testDbConnectionUnsaved,
    agentTestConnection,
} from "@/api/db-connections/client";
import { mutate } from "swr";
import type {
    DBConnection,
    DBConnectionDBMS,
    DBConnectionFormValues,
    DBConnectionMethod,
    SSHAuthType,
} from "@/types/db-connection.type";
import { DEFAULT_PORTS as PORTS } from "@/types/db-connection.type";

interface DBConnectionModalProps {
    open: boolean;
    onClose: () => void;
    projectId?: string;
    workspaceId?: string;
    onSaved?: (conn: DBConnection) => void;
    onBack?: () => void;
}

const DBMS_OPTIONS: { label: string; value: DBConnectionDBMS }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

type TestStatus = "idle" | "testing" | "success" | "failed";
type FieldHighlight = "success" | "error";

const ALL_CONN_FIELDS = ["host", "port", "database", "username", "password"];
const ALL_SSH_FIELDS = ["sshHost", "sshPort", "sshUsername", "sshPassword", "sshPrivateKey"];

function parseErrorToFields(msg: string): string[] {
    const m = msg.toLowerCase();
    if (m.includes("enotfound") || m.includes("econnrefused") || m.includes("etimedout") || m.includes("timeout")) {
        return ["host", "port", "sshHost", "sshPort"];
    }
    if (m.includes("password") || m.includes("authenticat") || m.includes("role") || m.includes("credential")) {
        return ["username", "password", "sshUsername", "sshPassword", "sshPrivateKey"];
    }
    if (m.includes("database") || m.includes("does not exist")) {
        return ["database"];
    }
    return [...ALL_CONN_FIELDS];
}

const METHOD_CARDS: {
    value: DBConnectionMethod;
    icon: React.ReactNode;
    title: string;
    description: string;
}[] = [
    {
        value: "direct",
        icon: <PlugZap className="w-4 h-4" />,
        title: "Direct",
        description: "Standard TCP connection",
    },
    {
        value: "ssh",
        icon: <Network className="w-4 h-4" />,
        title: "SSH Tunnel",
        description: "Tunnel through an SSH server",
    },
    {
        value: "local_agent",
        icon: <MonitorSmartphone className="w-4 h-4" />,
        title: "Local Agent",
        description: "Connect via agent on your machine",
    },
];

export default function DBConnectionModal({
    open,
    onClose,
    projectId,
    workspaceId,
    onSaved,
    onBack,
}: DBConnectionModalProps) {
    const [form] = Form.useForm<DBConnectionFormValues>();
    const [method, setMethod] = useState<DBConnectionMethod>("direct");
    const [dbms, setDbms] = useState<DBConnectionDBMS>("postgresql");
    const [sslEnabled, setSslEnabled] = useState(false);
    const [sshAuthType, setSshAuthType] = useState<SSHAuthType>("password");
    const [testStatus, setTestStatus] = useState<TestStatus>("idle");
    const [isSaving, setIsSaving] = useState(false);
    const [fieldHighlights, setFieldHighlights] = useState<Record<string, FieldHighlight>>({});

    const fh = (name: string) => fieldHighlights[name] as FieldHighlight | undefined;

    const handleDbmsChange = useCallback(
        (val: string) => {
            const next = val as DBConnectionDBMS;
            setDbms(next);
            const defaultPort = PORTS[next];
            if (defaultPort > 0) {
                form.setFieldValue("port", defaultPort);
            } else {
                form.setFieldValue("port", null);
            }
            if (method === "local_agent") {
                form.setFieldValue("host", "127.0.0.1");
            }
        },
        [form, method]
    );

    const handleMethodChange = useCallback(
        (val: DBConnectionMethod) => {
            setMethod(val);
            if (val === "local_agent") {
                form.setFieldValue("host", "127.0.0.1");
            } else {
                const current = form.getFieldValue("host");
                if (current === "127.0.0.1") {
                    form.setFieldValue("host", "");
                }
            }
        },
        [form]
    );

    const handleTestConnection = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setTestStatus("testing");
            setFieldHighlights({});
            const { name: _name, ...testPayload } = values;
            void _name;

            let result: { success: boolean; message: string; latencyMs?: number };

            if (method === "local_agent") {
                result = await agentTestConnection({
                    dbms,
                    host: testPayload.host,
                    port: testPayload.port ?? null,
                    database: testPayload.database,
                    username: testPayload.username ?? null,
                    password: testPayload.password ?? null,
                    ssl: sslEnabled,
                }).catch((err: unknown) => ({
                    success: false,
                    message:
                        err instanceof Error
                            ? err.message.includes("Failed to fetch") || err.message.includes("NetworkError")
                                ? "Local Agent is not running. Start it at localhost:27182"
                                : err.message
                            : "Failed to reach local agent",
                }));
            } else {
                result = await testDbConnectionUnsaved({
                    ...testPayload,
                    dbms,
                    method,
                    ssl: sslEnabled,
                });
            }

            if (result.success) {
                const allFields = method === "ssh"
                    ? [...ALL_CONN_FIELDS, ...ALL_SSH_FIELDS]
                    : ALL_CONN_FIELDS;
                setFieldHighlights(Object.fromEntries(allFields.map((f) => [f, "success" as const])));
                setTestStatus("success");
                notificationProvider.open({
                    type: "success",
                    message: `Connection OK${result.latencyMs ? ` (${result.latencyMs}ms)` : ""}`,
                });
            } else {
                const failedFields = parseErrorToFields(result.message || "");
                setFieldHighlights(Object.fromEntries(failedFields.map((f) => [f, "error" as const])));
                setTestStatus("failed");
                notificationProvider.open({
                    type: "error",
                    message: result.message || "Connection failed",
                });
            }
            setTimeout(() => setTestStatus("idle"), 4000);
        } catch (err) {
            setTestStatus("failed");
            notificationProvider.open({
                type: "error",
                message: err instanceof Error ? err.message : "Connection failed",
            });
            setTimeout(() => setTestStatus("idle"), 3000);
        }
    }, [form, dbms, method, sslEnabled]);

    const handleSave = useCallback(
        async (values: DBConnectionFormValues) => {
            setIsSaving(true);
            try {
                const conn = await createDbConnection({
                    ...values,
                    dbms,
                    method,
                    ssl: sslEnabled,
                    projectId,
                    workspaceId,
                });
                await mutate("my-db-connections");
                form.resetFields();
                setMethod("direct");
                setDbms("postgresql");
                setSslEnabled(false);
                setTestStatus("idle");
                onSaved?.(conn);
                onClose();
            } catch (err) {
                notificationProvider.open({
                    type: "error",
                    message: err instanceof Error ? err.message : "Failed to save connection",
                });
            } finally {
                setIsSaving(false);
            }
        },
        [form, onClose, onSaved, dbms, method, sslEnabled, projectId, workspaceId]
    );

    const handleClose = useCallback(() => {
        form.resetFields();
        setMethod("direct");
        setDbms("postgresql");
        setSslEnabled(false);
        setTestStatus("idle");
        setFieldHighlights({});
        onClose();
    }, [form, onClose]);

    const testIcon =
        testStatus === "testing" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : testStatus === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : testStatus === "failed" ? (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
        ) : null;

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={<span className="text-xs font-medium">Connect to Database</span>}
            width={680}
            centered
            styles={{
                content: { padding: 0 },
                header: { padding: "20px 24px 8px" },
                body: { padding: 0, overflow: "hidden" },
                footer: { padding: "12px 24px 16px" },
            }}
            footer={
                <div className="flex items-center justify-between">
                    <Button
                        size="small"
                        onClick={handleTestConnection}
                        loading={testStatus === "testing"}
                        icon={testIcon}
                        disabled={testStatus === "testing"}
                        className="!text-xs"
                    >
                        {testStatus === "success"
                            ? "Connection OK"
                            : testStatus === "failed"
                              ? "Connection Failed"
                              : "Test Connection"}
                    </Button>
                    <div className="flex gap-2">
                        {onBack && (
                            <Button size="small" icon={<ArrowLeft size={12} />} onClick={onBack} className="!text-xs">
                                Back
                            </Button>
                        )}
                        <Button size="small" onClick={handleClose} className="!text-xs">Cancel</Button>
                        <Button
                            size="small"
                            type="primary"
                            loading={isSaving}
                            onClick={() => form.submit()}
                            className="!text-xs"
                        >
                            Connect
                        </Button>
                    </div>
                </div>
            }
            forceRender
        >
            {/* Wrapper overrides Ant Design Form label + explain text sizes */}
            <div
                style={{ maxHeight: "65vh", overflowY: "auto", padding: "4px 24px 8px" }}
                className="[&_.ant-form-item-label_label]:!text-xs [&_.ant-form-item-explain]:!text-xs [&_.ant-radio-wrapper]:!text-xs [&_.ant-radio-wrapper_span]:!text-xs"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                    initialValues={{
                        dbms: "postgresql",
                        method: "direct",
                        port: PORTS["postgresql"],
                        ssl: false,
                        sshPort: 22,
                        sshAuthType: "password",
                    }}
                    className="pt-0 pb-2"
                >
                    <Form.Item
                        name="name"
                        label="Connection Name"
                        rules={[{ required: true, message: "Enter a name for this connection" }]}
                    >
                        <Input placeholder="e.g. Production PostgreSQL" className="!h-8 !text-xs" />
                    </Form.Item>

                    <div className="mb-4">
                        <div className="text-xs font-medium text-gray-700 mb-1.5">Database System</div>
                        <Segmented
                            block
                            value={dbms}
                            onChange={handleDbmsChange}
                            options={DBMS_OPTIONS}
                            className="!text-xs"
                        />
                    </div>

                    <Divider className="!my-4" />

                    <div className="mb-4">
                        <div className="text-xs font-medium text-gray-700 mb-2">Connection Method</div>
                        <div className="grid grid-cols-3 gap-2">
                            {METHOD_CARDS.map((card) => (
                                <button
                                    key={card.value}
                                    type="button"
                                    onClick={() => handleMethodChange(card.value)}
                                    className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                                        method === card.value
                                            ? "border-primary-500 bg-blue-50"
                                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className={method === card.value ? "text-primary-500" : "text-gray-500"}>
                                        {card.icon}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-900">{card.title}</span>
                                    <span className="text-xs text-gray-500">{card.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <Divider className="!my-4" />

                    {method === "local_agent" && (
                        <div className="mb-4"><LocalAgentBanner /></div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <Form.Item
                            name="host"
                            label="Host"
                            className="col-span-2"
                            rules={[{ required: true, message: "Enter host" }]}
                            validateStatus={fh("host")}
                            hasFeedback={!!fh("host")}
                        >
                            <Input
                                placeholder={method === "local_agent" ? "127.0.0.1" : "e.g. db.example.com"}
                                className="!h-8 !text-xs"
                                readOnly={method === "local_agent"}
                            />
                        </Form.Item>
                        <Form.Item
                            name="port"
                            label="Port"
                            rules={[{ required: true, message: "Enter port" }]}
                            validateStatus={fh("port")}
                            hasFeedback={!!fh("port")}
                        >
                            <InputNumber placeholder="5432" className="!h-8 w-full !text-xs" min={1} max={65535} />
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="database"
                        label="Database Name"
                        rules={[{ required: true, message: "Enter database name" }]}
                        validateStatus={fh("database")}
                        hasFeedback={!!fh("database")}
                    >
                        <Input placeholder="e.g. mydb" className="!h-8 !text-xs" />
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item
                            name="username"
                            label="Username"
                            rules={[{ required: true, message: "Enter username" }]}
                            validateStatus={fh("username")}
                            hasFeedback={!!fh("username")}
                        >
                            <Input placeholder="postgres" className="!h-8 !text-xs" />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            label="Password"
                            validateStatus={fh("password")}
                        >
                            <Input.Password placeholder="••••••••" className="!h-8 !text-xs" />
                        </Form.Item>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                        <Switch size="small" checked={sslEnabled} onChange={setSslEnabled} />
                        <span className="text-xs text-gray-700">Use SSL / TLS</span>
                    </div>

                    {method === "ssh" && (
                        <>
                            <Divider orientation="left" className="!my-4 !text-xs !text-gray-400">
                                SSH Tunnel
                            </Divider>

                            <div className="grid grid-cols-3 gap-3">
                                <Form.Item
                                    name="sshHost"
                                    label="SSH Host"
                                    className="col-span-2"
                                    rules={[{ required: true, message: "Enter SSH host" }]}
                                    validateStatus={fh("sshHost")}
                                    hasFeedback={!!fh("sshHost")}
                                >
                                    <Input placeholder="e.g. bastion.example.com" className="!h-8 !text-xs" />
                                </Form.Item>
                                <Form.Item
                                    name="sshPort"
                                    label="SSH Port"
                                    validateStatus={fh("sshPort")}
                                    hasFeedback={!!fh("sshPort")}
                                >
                                    <Input type="number" placeholder="22" className="!h-8 !text-xs" />
                                </Form.Item>
                            </div>

                            <Form.Item
                                name="sshUsername"
                                label="SSH Username"
                                rules={[{ required: true, message: "Enter SSH username" }]}
                                validateStatus={fh("sshUsername")}
                                hasFeedback={!!fh("sshUsername")}
                            >
                                <Input placeholder="ubuntu" className="!h-8 !text-xs" />
                            </Form.Item>

                            <Form.Item label="SSH Authentication">
                                <Radio.Group
                                    value={sshAuthType}
                                    onChange={(e) => setSshAuthType(e.target.value)}
                                    className="flex gap-4"
                                >
                                    <Radio value="password">Password</Radio>
                                    <Radio value="private_key">Private Key</Radio>
                                </Radio.Group>
                            </Form.Item>

                            {sshAuthType === "password" ? (
                                <Form.Item
                                    name="sshPassword"
                                    label="SSH Password"
                                    rules={[{ required: true, message: "Enter SSH password" }]}
                                    validateStatus={fh("sshPassword")}
                                >
                                    <Input.Password placeholder="••••••••" className="!h-8 !text-xs" />
                                </Form.Item>
                            ) : (
                                <Form.Item
                                    name="sshPrivateKey"
                                    label="Private Key (PEM)"
                                    rules={[{ required: true, message: "Paste your PEM private key" }]}
                                    validateStatus={fh("sshPrivateKey")}
                                    extra={
                                        <span className="text-xs text-gray-400">
                                            Paste the contents of your <code>id_rsa</code> or{" "}
                                            <code>id_ed25519</code> file.
                                        </span>
                                    }
                                >
                                    <Input.TextArea
                                        rows={4}
                                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                                        className="!font-mono !text-xs"
                                    />
                                </Form.Item>
                            )}
                        </>
                    )}
                </Form>
            </div>
        </Modal>
    );
}
