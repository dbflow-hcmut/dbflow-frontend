"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    BookOpen,
    Braces,
    ChevronRight,
    DatabaseZap,
    FileCode2,
    History,
    ImageDown,
    X,
} from "lucide-react";

type ExportDropdownProps = {
    children: ReactNode;
    onDownload: (format: "png" | "svg" | "pdf") => void;
    onExportJson: () => void;
    onExportDDL?: () => void;
    onExportHTMLDocs?: () => void;
    onApplyToDatabase?: () => void;
    onExportHistory?: () => void;
};

type ExportItemProps = {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
};

const MENU_WIDTH = 340;

const ExportItem: React.FC<ExportItemProps> = ({
    icon,
    title,
    description,
    onClick,
}) => (
    <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50"
    >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700">
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium leading-4 text-gray-900">
                {title}
            </span>
            <span className="block text-xs leading-4 text-gray-500">
                {description}
            </span>
        </span>
        <ChevronRight
            size={16}
            className="shrink-0 text-gray-400"
        />
    </button>
);

const ExportPortalDropdown: React.FC<ExportDropdownProps> = ({
    children,
    onDownload,
    onExportJson,
    onExportDDL,
    onExportHTMLDocs,
    onApplyToDatabase,
    onExportHistory,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: 76, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;

        const buttonRect = trigger.getBoundingClientRect();
        const menuWidth = Math.min(MENU_WIDTH, window.innerWidth - 24);
        const menuHeight = menuRef.current?.offsetHeight ?? 360;
        const left = Math.min(
            Math.max(12, buttonRect.right - menuWidth),
            window.innerWidth - menuWidth - 12,
        );
        const spaceBelow = window.innerHeight - buttonRect.bottom - 12;
        const top = spaceBelow >= menuHeight
            ? buttonRect.bottom + 12
            : Math.max(12, buttonRect.top - menuHeight - 12);

        setPosition({ top, left });
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const animationFrame = window.requestAnimationFrame(updatePosition);
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (
                !triggerRef.current?.contains(target)
                && !menuRef.current?.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
                triggerRef.current?.querySelector<HTMLElement>("button")?.focus();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [isOpen, updatePosition]);

    const runAction = (action: () => void) => {
        setIsOpen(false);
        action();
    };

    return (
        <>
            <div
                ref={triggerRef}
                onClick={() => setIsOpen((open) => !open)}
                className="inline-flex"
            >
                {children}
            </div>

            {isOpen && typeof document !== "undefined" && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label="Export diagram"
                    className="fixed z-[1000] max-h-[calc(100vh-24px)] overflow-y-auto rounded-xl border border-gray-100 bg-white p-2 shadow-[0_16px_50px_rgba(15,23,42,0.18)]"
                    style={{
                        top: position.top,
                        left: position.left,
                        width: `min(${MENU_WIDTH}px, calc(100vw - 24px))`,
                    }}
                >
                    <div className="flex items-start justify-between gap-3 px-2 pb-1.5 pt-1">
                        <div className="text-[12px] font-semibold leading-4 text-gray-900">
                            Export diagram
                        </div>
                        <button
                            type="button"
                            aria-label="Close export menu"
                            onClick={() => setIsOpen(false)}
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                        >
                            <X size={17} />
                        </button>
                    </div>

                    <div className="space-y-0.5">
                        <ExportItem
                            icon={<ImageDown size={17} />}
                            title="PNG"
                            description="Export as a high-quality raster image"
                            onClick={() => runAction(() => onDownload("png"))}
                        />
                        <ExportItem
                            icon={<ImageDown size={17} />}
                            title="SVG"
                            description="Export as a scalable vector image"
                            onClick={() => runAction(() => onDownload("svg"))}
                        />
                        <ExportItem
                            icon={<ImageDown size={17} />}
                            title="PDF"
                            description="Create a print-ready PDF document"
                            onClick={() => runAction(() => onDownload("pdf"))}
                        />
                        <ExportItem
                            icon={<Braces size={17} />}
                            title="JSON"
                            description="Save project data for backup or import"
                            onClick={() => runAction(onExportJson)}
                        />
                        {onExportDDL && (
                            <ExportItem
                                icon={<FileCode2 size={17} />}
                                title="SQL (DDL)"
                                description="Generate SQL from the physical schema"
                                onClick={() => runAction(onExportDDL)}
                            />
                        )}
                        {onExportHTMLDocs && (
                            <ExportItem
                                icon={<BookOpen size={17} />}
                                title="HTML documentation"
                                description="Create a shareable documentation page"
                                onClick={() => runAction(onExportHTMLDocs)}
                            />
                        )}

                        {(onApplyToDatabase || onExportHistory) && (
                            <div className="mx-2 my-1.5 h-px bg-gray-100" />
                        )}

                        {onApplyToDatabase && (
                            <ExportItem
                                icon={<DatabaseZap size={17} />}
                                title="Apply to database"
                                description="Push changes to the connected database"
                                onClick={() => runAction(onApplyToDatabase)}
                            />
                        )}
                        {onExportHistory && (
                            <ExportItem
                                icon={<History size={17} />}
                                title="Export history"
                                description="Review previous export operations"
                                onClick={() => runAction(onExportHistory)}
                            />
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default ExportPortalDropdown;
