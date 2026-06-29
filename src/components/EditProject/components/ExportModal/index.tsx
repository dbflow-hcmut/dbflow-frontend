import React, { useEffect, useState } from 'react';
import { Modal, Radio, Form, Checkbox, Slider, ColorPicker } from 'antd';
import { Download } from 'lucide-react';
import { Color } from 'antd/es/color-picker';

export type ExportFormat = 'png' | 'svg' | 'pdf';
export type ExportScope = 'all' | 'selected';

export interface ExportSettings {
    format: ExportFormat;
    scope: ExportScope;
    transparent: boolean;
    backgroundColor: string;
    quality: number; // 1, 2, 3
}

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (settings: ExportSettings) => void;
    initialValues: { format: ExportFormat; scope: ExportScope };
    hasSelection: boolean;
}

const ExportModal: React.FC<ExportModalProps> = ({
    isOpen,
    onClose,
    onExport,
    initialValues,
    hasSelection,
}) => {
    const [form] = Form.useForm();
    const [isTransparent, setIsTransparent] = useState(false);

    useEffect(() => {
        if (isOpen) {
            form.setFieldsValue({
                scope: hasSelection ? initialValues.scope : 'all',
                transparent: false,
                backgroundColor: '#ffffff', // Default white
                quality: 2,
            });
            setIsTransparent(false);
        }
    }, [isOpen, initialValues, hasSelection, form]);

    const handleOk = () => {
        form.validateFields().then((values) => {
            let backgroundColor = '#ffffff';
            
            if (values.backgroundColor) {
                backgroundColor = typeof values.backgroundColor === 'string' 
                    ? values.backgroundColor 
                    : (values.backgroundColor as Color).toHexString();
            }

            onExport({
                ...values,
                format: initialValues.format,
                backgroundColor,
            });
            onClose();
        });
    };

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            onOk={handleOk}
            title={`Export Diagram as ${initialValues.format.toUpperCase()}`}
            okText="Export"
            cancelText="Cancel"
            okButtonProps={{ icon: <Download size={16} /> }}
            width={520}
        >
            <Form
                form={form}
                layout="vertical"
                className="pt-4"
            >
                <Form.Item name="scope" label="Scope">
                    <Radio.Group className="flex flex-col gap-2">
                        <Radio value="all">
                            <span className="font-medium">Export All</span>
                            <div className="text-xs text-gray-500">Export the entire diagram content.</div>
                        </Radio>
                        <Radio value="selected" disabled={!hasSelection}>
                            <span className="font-medium">Export Selected</span>
                            <div className="text-xs text-gray-500">
                                {hasSelection 
                                    ? "Export only the selected nodes and edges." 
                                    : "Select nodes to enable this option."}
                            </div>
                        </Radio>
                    </Radio.Group>
                </Form.Item>

                <Form.Item label="Background" className="mb-2">
                    <div className="flex items-center justify-between mb-2">
                        <Form.Item name="transparent" valuePropName="checked" noStyle>
                            <Checkbox onChange={(e) => setIsTransparent(e.target.checked)}>
                                Transparent Background
                            </Checkbox>
                        </Form.Item>
                    </div>
                    
                    {!isTransparent && (
                        <Form.Item name="backgroundColor" noStyle>
                            <ColorPicker showText />
                        </Form.Item>
                    )}
                </Form.Item>

                {(initialValues.format === 'png' || initialValues.format === 'pdf') && (
                    <Form.Item name="quality" label="Quality (Scale)">
                        <Slider
                            min={1}
                            max={3}
                            marks={{ 1: '1x', 2: '2x', 3: '3x' }}
                            step={1}
                        />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};

export default ExportModal;
