import React, { useState } from "react";
import { Modal, Segmented } from "antd";
import { Database } from "lucide-react";
import type { DBMSType } from "../../utils/dbms-config";

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

interface ConvertToPhysicalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (dbms: DBMSType) => void;
    loading?: boolean;
    /** Which schema level is being converted from (for display). */
    sourceLevel?: "conceptual" | "logical";
}

const ConvertToPhysicalModal: React.FC<ConvertToPhysicalModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    loading = false,
    sourceLevel = "logical",
}) => {
    const [dbms, setDbms] = useState<DBMSType>("postgresql");

    return (
        <Modal
            title={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Database size={18} />
                    <span>Convert to Physical Schema</span>
                </div>
            }
            open={isOpen}
            onCancel={onClose}
            onOk={() => onConfirm(dbms)}
            okText={loading ? "Converting..." : "Convert"}
            okButtonProps={{ loading }}
            cancelButtonProps={{ disabled: loading }}
            maskClosable={!loading}
            width={440}
            destroyOnHidden
        >
            <div style={{ marginTop: 12, marginBottom: 8 }}>
                <p style={{ marginBottom: 16, color: "#666", fontSize: 13 }}>
                    Select the target database system. Data types and syntax will be
                    mapped to the chosen DBMS. You can change this later.
                </p>

                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>
                    Target DBMS
                </div>
                <Segmented
                    value={dbms}
                    onChange={(val) => setDbms(val as DBMSType)}
                    options={DBMS_OPTIONS}
                    block
                    disabled={loading}
                />

                <p style={{ marginTop: 16, color: "#999", fontSize: 12 }}>
                    Converting from{" "}
                    <strong style={{ color: "#666" }}>{sourceLevel}</strong> to{" "}
                    <strong style={{ color: "#666" }}>physical</strong> schema.
                </p>
            </div>
        </Modal>
    );
};

export default ConvertToPhysicalModal;
