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
    const selectedScope = Form.useWatch('scope', form);

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
            okButtonProps={{
                icon: <Download size={15} />,
                className: '!h-10 !rounded-xl !border-0 !px-5 !text-sm !font-semibold !shadow-none',
            }}
            cancelButtonProps={{
                className: '!h-10 !rounded-xl !border-0 !bg-gray-100 !px-5 !text-sm !font-semibold !text-gray-700 !shadow-none hover:!bg-gray-200',
            }}
            width={560}
            centered
            className="[&_.ant-modal-content]:!overflow-hidden [&_.ant-modal-content]:!rounded-[20px] [&_.ant-modal-content]:!p-0 [&_.ant-modal-content]:!shadow-[0_24px_80px_rgba(15,23,42,0.16)] [&_.ant-modal-header]:!mb-0 [&_.ant-modal-header]:!px-6 [&_.ant-modal-header]:!pb-4 [&_.ant-modal-header]:!pt-5 [&_.ant-modal-title]:!text-base [&_.ant-modal-title]:!font-semibold [&_.ant-modal-title]:!text-gray-900 [&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:!grid [&_.ant-modal-close]:!size-9 [&_.ant-modal-close]:!place-items-center [&_.ant-modal-close]:!rounded-xl [&_.ant-modal-close]:!text-gray-400 hover:[&_.ant-modal-close]:!bg-gray-100 hover:[&_.ant-modal-close]:!text-gray-700 [&_.ant-modal-body]:!p-0 [&_.ant-modal-footer]:!m-0 [&_.ant-modal-footer]:!border-t [&_.ant-modal-footer]:!border-gray-100 [&_.ant-modal-footer]:!px-6 [&_.ant-modal-footer]:!py-4"
        >
            <div className="px-6 pb-6">
                <Form
                    form={form}
                    layout="vertical"
                    className="flex flex-col gap-4 [&_.ant-form-item]:!mb-0 [&_.ant-form-item-label]:!pb-2 [&_.ant-form-item-label>label]:!text-xs [&_.ant-form-item-label>label]:!font-semibold [&_.ant-form-item-label>label]:!text-gray-700"
                >
                <Form.Item name="scope" label="Scope">
                    <Radio.Group className="!grid w-full grid-cols-2 gap-3">
                        <Radio
                            value="all"
                            className={`!m-0 min-h-[108px] !w-full !items-start rounded-2xl p-3! transition-all [&_.ant-radio]:!mt-0.5 ${
                                selectedScope === 'all'
                                    ? 'bg-primary-50 ring-1 ring-primary-300'
                                    : 'bg-gray-50 ring-1 ring-transparent hover:bg-gray-100'
                            }`}
                        >
                            <span className="font-semibold text-gray-800">Export All</span>
                            <div className="mt-2 pr-1 text-xs leading-relaxed text-gray-500">Export the entire diagram content.</div>
                        </Radio>
                        <Radio
                            value="selected"
                            disabled={!hasSelection}
                            className={`!m-0 min-h-[108px] !w-full !items-start rounded-2xl p-3! transition-all [&_.ant-radio]:!mt-0.5 ${
                                selectedScope === 'selected'
                                    ? 'bg-primary-50 ring-1 ring-primary-300'
                                    : 'bg-gray-50 ring-1 ring-transparent hover:bg-gray-100'
                            } ${!hasSelection ? '!cursor-not-allowed opacity-50 hover:!bg-gray-50' : ''}`}
                        >
                            <span className="font-semibold text-gray-800">Export Selected</span>
                            <div className="mt-2 pr-1 text-xs leading-relaxed text-gray-500">
                                {hasSelection 
                                    ? "Export only the selected nodes and edges." 
                                    : "Select nodes to enable this option."}
                            </div>
                        </Radio>
                    </Radio.Group>
                </Form.Item>

                <Form.Item label="Background">
                    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                        <Form.Item name="transparent" valuePropName="checked" noStyle>
                            <Checkbox
                                className="[&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!font-medium [&_.ant-checkbox+span]:!text-gray-700"
                                onChange={(e) => setIsTransparent(e.target.checked)}
                            >
                                Transparent background
                            </Checkbox>
                        </Form.Item>

                        {!isTransparent && (
                            <Form.Item name="backgroundColor" noStyle>
                                <ColorPicker
                                    showText
                                    className="!h-9 !rounded-xl !border-0 !bg-white !px-2.5 !shadow-none"
                                />
                            </Form.Item>
                        )}
                    </div>
                </Form.Item>

                {(initialValues.format === 'png' || initialValues.format === 'pdf') && (
                    <Form.Item name="quality" label="Quality (Scale)">
                        <div className="rounded-2xl bg-gray-50 px-5 pb-5 pt-3">
                            <Slider
                                min={1}
                                max={3}
                                marks={{ 1: '1x', 2: '2x', 3: '3x' }}
                                step={1}
                                className="!mb-3 [&_.ant-slider-handle::after]:!shadow-[0_0_0_2px_#42a5f5] [&_.ant-slider-rail]:!bg-gray-200 [&_.ant-slider-track]:!bg-primary-400"
                            />
                        </div>
                    </Form.Item>
                )}
                </Form>
            </div>
        </Modal>
    );
};

export default ExportModal;
