"use client";

import React from "react";
import { Button } from "antd";
import { MousePointer2, Hand, StickyNote, Type, ArrowUpRight, PenTool, MessageCircleMore, Plus, X, PanelTopOpen, PanelBottomOpen, Undo, Redo } from "lucide-react";
import ZoomControls from "../ZoomControls";

type FooterProps = {
    isSidebarModalOpen: boolean;
    isRightPanelOpen: boolean;
    canEdit?: boolean;
    commentMode?: boolean;
    onToggleSidebar: () => void;
    onToggleRightPanel: () => void;
    onToggleChatBox: () => void;
    onToggleCommentMode?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    interactionMode: 'default' | 'panning';
    setInteractionMode: (mode: 'default' | 'panning') => void;
};

const Footer: React.FC<FooterProps> = ({
    isSidebarModalOpen,
    isRightPanelOpen,
    canEdit = true,
    commentMode = false,
    onToggleSidebar,
    onToggleRightPanel,
    onToggleChatBox,
    onToggleCommentMode,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    interactionMode,
    setInteractionMode,
}) => {
    return (
        <div className="pb-4 bg-transparent flex items-center justify-between px-4 fixed bottom-0 z-10 w-full">
            <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                    <div
                        id="tour-sidebar-toggle"
                        onClick={onToggleSidebar}
                        className="bg-primary-700 h-16 w-16 rounded-full absolute left-0 z-20 flex items-center justify-center cursor-pointer transition-transform duration-300"
                        style={{ transform: isSidebarModalOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                    >
                        {isSidebarModalOpen ? (
                            <X size={24} className="text-white" style={{ transform: 'rotate(-45deg)' }} />
                        ) : (
                            <Plus size={24} className="text-white" />
                        )}
                    </div>
                    <div id="tour-toolbar" className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 pl-8 py-2 h-12 ml-10" style={{ pointerEvents: canEdit ? 'auto' : 'none', opacity: canEdit ? 1 : 0.5 }}>                        
                        <Button
                            type={interactionMode === 'default' && !commentMode ? 'primary' : 'text'}
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                            onClick={() => { setInteractionMode('default'); if (onToggleCommentMode && commentMode) onToggleCommentMode(); }}
                        >
                            <MousePointer2 size={18} />
                        </Button>
                        <Button
                            type={interactionMode === 'panning' && !commentMode ? 'primary' : 'text'}
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                            onClick={() => { setInteractionMode('panning'); if (onToggleCommentMode && commentMode) onToggleCommentMode(); }}
                        >
                            <Hand size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                        >
                            <StickyNote size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                        >
                            <Type size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                        >
                            <ArrowUpRight size={18} />
                        </Button>
                        <Button
                            type="text"
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                        >
                            <PenTool size={18} />
                        </Button>
                        <Button
                            type={commentMode ? 'primary' : 'text'}
                            className="!px-2 !text-[14px] !h-8 !w-8 !flex !items-center !justify-center"
                            onClick={() => {
                                if (onToggleCommentMode) onToggleCommentMode();
                                if (!commentMode) setInteractionMode('default');
                            }}
                        >
                            <MessageCircleMore size={18} />
                        </Button>
                    </div>
                </div>

                <div 
                    id="tour-ai-chatbox"
                    onClick={onToggleChatBox}
                    className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                >                        
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="url(#spark-gradient)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-sparkles"
                    >
                        <defs>
                            <linearGradient id="spark-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="var(--color-primary)" />
                                <stop offset="100%" stopColor="var(--color-yellow-500)" />
                            </linearGradient>
                        </defs>

                        <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                        <path d="M20 2v4" />
                        <path d="M22 4h-4" />
                        <circle cx="4" cy="20" r="2" />
                    </svg>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div 
                    id="tour-undo"
                    onClick={canEdit ? onUndo : undefined}
                    className={`flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center transition-opacity ${
                        canEdit && canUndo ? 'hover:bg-gray-50 opacity-100 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                    }`}
                    title={canEdit ? "Undo (Ctrl+Z)" : "Read-only mode"}
                >                        
                    <Undo size={24} />
                </div>
                <div 
                    id="tour-redo"
                    onClick={canEdit ? onRedo : undefined}
                    className={`flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12 w-12 justify-center transition-opacity ${
                        canEdit && canRedo ? 'hover:bg-gray-50 opacity-100 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                    }`}
                    title={canEdit ? "Redo (Ctrl+Y or Ctrl+Shift+Z)" : "Read-only mode"}
                >                        
                    <Redo size={24} />
                </div>
                <div id="tour-zoom-controls" className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                    <ZoomControls />
                    <Button
                        type="text"
                        className="!px-2"
                        onClick={onToggleRightPanel}
                    >
                        {isRightPanelOpen ? (
                            <PanelBottomOpen size={18} />
                        ) : (
                            <PanelTopOpen size={18} />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Footer;

