"use client";

import { Input, InputRef, Modal } from "antd";
import { Search } from "lucide-react";
import { Ref, useEffect, useRef, useState } from "react";

export interface ISearchModalProps {
    open: boolean;
    onClose: () => void;
}

export default function SearchModal(props: ISearchModalProps) {
    const { open, onClose } = props;
    const [search, setSearch] = useState("");
    const inputRef = useRef<InputRef>(null);

    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.focus();
            }
        }, 0);
        return () => window.clearTimeout(id);
    }, [open]);
    

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            title={null}
            closable={false}
            mask={false}
            maskClosable={true}
            className="search-modal"
        >
            <div>
                <div className="py-2">
                    <Input
                        ref={inputRef as Ref<InputRef>}
                        allowClear
                        placeholder="Search entities, attributes, relationships,..."
                        className="w-full !h-10 !border-none !shadow-none hover:!border-none focus:!border-none focus:!shadow-none focus:!outline-none"
                        prefix={<Search size={18} />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                {search.length > 0 && (
                    <div className="pb-4 px-4">
                        <div className="text-sm text-gray-500">
                            Search results for &quot;{search}&quot;
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}