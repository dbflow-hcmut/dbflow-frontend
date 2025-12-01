"use client";

import React, { useState } from "react";
import { ChevronDown, Search, HelpCircle, Lightbulb, User, LayoutGrid, ChartArea, Settings } from "lucide-react";
import { Input, Dropdown } from "antd";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import classNames from "classnames";

export const getMenuItems = (pathname: string) => {
    const items = [
        {
            key: "projects",
            href: "/projects",
            label: "Projects",
            icon: LayoutGrid,
            isActive:
                pathname === "/projects" ||
                (pathname?.startsWith("/projects/") && pathname !== "/projects/new"),
        },
        {
            key: "usage",
            href: "/usage",
            label: "Usage",
            icon: ChartArea,
            isActive: pathname === "/usage",
        },
        {
            key: "settings",
            href: "/settings",
            label: "Settings",
            icon: Settings,
            isActive: pathname === "/settings",
        },
    ];

    const activeColor = "#42A5F5";

    const makeItem = (item: typeof items[number]) => {
        const Icon = item.icon;

        return {
            key: item.key,
            label: (
                <Link
                    href={item.href}
                    className={classNames(
                        "flex items-center gap-2",
                        item.isActive ? "font-medium" : "text-gray-700",
                    )}
                    style={item.isActive ? { color: activeColor } : undefined}
                >
                    <Icon
                        className="w-4 h-4"
                        style={item.isActive ? { color: activeColor } : undefined}
                    />
                    <span>{item.label}</span>
                </Link>
            ),
        };
    };

    return items.map(makeItem);
};

export default function Header() {
    const [searchValue, setSearchValue] = useState("");
    const pathname = usePathname();
    const menuItems = getMenuItems(pathname || "");

    return (
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
                <Link href="/" className="cursor-pointer flex items-center gap-2">
                    <Image src="/favicon.ico" alt="Logo" width={20} height={20} priority />
                    <span className="text-gray-900 font-bold">DB Flow</span>
                </Link>
                <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        Free
                    </span>
                    <Dropdown
                        menu={{ items: menuItems }}
                        trigger={["click"]}
                        placement="bottomLeft"
                    >
                        <ChevronDown className="w-4 h-4 text-gray-500 cursor-pointer hover:text-gray-700 transition-colors" />
                    </Dropdown>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="relative hidden lg:block">
                    <Input
                        placeholder="Search..."
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="w-64"
                        suffix={
                            <span className="text-xs text-gray-400 font-mono">⌘K</span>
                        }
                    />
                </div>

                <HelpCircle className="w-5 h-5 text-gray-500 cursor-pointer hover:text-gray-700" />
                <Lightbulb className="w-5 h-5 text-gray-500 cursor-pointer hover:text-gray-700" />

                <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-400">
                    <User className="w-5 h-5 text-gray-600" />
                </div>
            </div>
        </header>
    );
}

