"use client";

import React, { useEffect, useRef } from "react";
import { API_AVATAR } from "@/utils/constants";
import { Avatar, Button } from "antd";
import { Download, EllipsisVertical, MessageCircle, History, Search, Send, TvMinimal, Smile, ThumbsUp, PartyPopper } from "lucide-react";
import Image from "next/image";

type HeaderProps = {
    diagramName: string;
    isEditingDiagramName: boolean;
    onSetDiagramName: (name: string) => void;
    onSetIsEditingDiagramName: (isEditing: boolean) => void;
    onOpenSearchModal: () => void;
};

const Header: React.FC<HeaderProps> = ({
    diagramName,
    isEditingDiagramName,
    onSetDiagramName,
    onSetIsEditingDiagramName,
    onOpenSearchModal,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditingDiagramName && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditingDiagramName]);

    return (
        <div className="pt-4 bg-transparent flex items-center justify-between px-4 fixed top-0 z-10 w-full">
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                <div className="cursor-pointer mx-1">
                    <Image width={26} height={26} src="/favicon.ico" alt="Logo" />
                </div>
                {!isEditingDiagramName ? (
                    <div
                        className="text-md leading-none font-semibold px-2 py-1 bg-transparent hover:bg-gray-100 rounded-md cursor-pointer max-w-[300px] truncate"
                        onClick={() => onSetIsEditingDiagramName(true)}
                        title={diagramName}
                    >
                        {diagramName}
                    </div>
                ) : (
                    <input
                        ref={inputRef}
                        className="text-md leading-none font-semibold px-2 py-1 bg-transparent border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[300px]"
                        value={diagramName}
                        onChange={(e) => onSetDiagramName(e.target.value)}
                        onBlur={() => onSetIsEditingDiagramName(false)}
                        style={{
                            width: `${Math.min(diagramName.length * 9 + 16, 300)}px`,
                        }}
                    />
                )}
                <Button
                    type="text"
                    className="!px-2"
                    onClick={onOpenSearchModal}
                >
                    <Search size={18} />
                </Button>
                <Button
                    type="text"
                    className="!px-2"
                >
                    <EllipsisVertical size={18} />
                </Button>
                <Button
                    type="text"
                    className="!px-2"
                >
                    <Download size={18} />
                </Button>
                <Button
                    type="primary"
                    className="!px-3 gap-2 flex items-center"
                >
                    <Send className="text-white" size={18} />
                    <span className="font-semibold">Share</span>
                </Button>
            </div>
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                <Button
                    type="text"
                    className="!px-2"
                >
                    <div className="flex items-center">
                        <Smile size={18} />
                        <ThumbsUp size={18} />
                        <PartyPopper size={18} />
                    </div>
                </Button>
                <Button
                    type="text"
                    className="!px-2"
                >
                    <History size={18} />
                </Button>
                <Button
                    type="text"
                    className="!px-2"
                >
                    <MessageCircle size={18} />
                </Button>
                <div className="rounded-xl py-1 h-10 flex items-center">
                    <Avatar.Group
                        max={{
                            count: 2,
                            style: { color: '#f56a00', backgroundColor: '#fde3cf', width: 24, height: 24 },
                        }}
                    >
                        <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                        <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                        <Avatar size={24} src={`${API_AVATAR}/?name=Thành+Tài&background=random&size=512`} />
                    </Avatar.Group>
                </div>
                <Button
                    type="primary"
                    className="!px-3 gap-2 flex items-center"
                >
                    <TvMinimal className="text-white" size={18} />
                    <span className="font-semibold">Present</span>
                </Button>
            </div>
        </div>
    );
};

export default Header;