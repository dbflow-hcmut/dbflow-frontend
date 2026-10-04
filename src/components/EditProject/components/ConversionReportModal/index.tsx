import React from "react";
import { Button, Modal } from "antd";
import type { ConversionNotice } from "../../utils/schema-conversion";

interface ConversionReportModalProps {
    isOpen: boolean;
    notices: ConversionNotice[];
    targetLabel: string;
    action: "created" | "synced";
    onStay: () => void;
    onOpen: () => void;
}

const ConversionReportModal: React.FC<ConversionReportModalProps> = ({ isOpen, notices, targetLabel, action, onStay, onOpen }) => {
    return (
        <Modal
            title={`${targetLabel} schema ${action}`}
            open={isOpen}
            onCancel={onStay}
            maskClosable={false}
            width={560}
            footer={[
                <Button key="stay" onClick={onStay}>Stay here</Button>,
                <Button key="open" type="primary" onClick={onOpen}>Open {targetLabel.toLowerCase()} schema</Button>,
            ]}
        >
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Needs review</div>
                <ul style={{ margin: "4px 0 12px", paddingLeft: 18, color: "#b45309", fontSize: 13 }}>
                    {notices.map((n, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{n.message}</li>
                    ))}
                </ul>
            </div>
        </Modal>
    );
};

export default ConversionReportModal;
