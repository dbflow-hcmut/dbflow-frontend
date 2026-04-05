"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, Search, User, LayoutGrid, ChartArea, Settings, LogOut } from "lucide-react";
import { Input, Dropdown, Avatar } from "antd";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import classNames from "classnames";
import { getUserMe } from "@/api/users/client";
import { UserResponse } from "@/types/user.type";

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
                    prefetch={true}
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
    const [userData, setUserData] = useState<UserResponse | null>(null);
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const pathname = usePathname();
    const menuItems = getMenuItems(pathname || "");

    useEffect(() => {
        // Try to get cached user data first
        const cachedUser = localStorage.getItem('user_data');
        if (cachedUser) {
            try {
                setUserData(JSON.parse(cachedUser));
            } catch {
                // Invalid cache, will fetch
            }
        }
        
        // Fetch user data on mount
        loadUserData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadUserData = async () => {
        if (isLoadingUser) return;
        
        try {
            setIsLoadingUser(true);
            const data = await getUserMe();
            setUserData(data);
            // Cache for faster subsequent loads
            localStorage.setItem('user_data', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to load user data', error);
            // Clear invalid cache
            localStorage.removeItem('user_data');
        } finally {
            setIsLoadingUser(false);
        }
    };

    const dropdownRender = () => (
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 min-w-[280px]">
            {/* User Info Header */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    {userData?.avatar ? (
                        <Avatar 
                            src={userData.avatar} 
                            size={48}
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center">
                            <User className="w-6 h-6 text-gray-600" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                            {userData?.fullName || 'User'}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                            {userData?.email || ''}
                        </div>
                    </div>
                </div>
            </div>

            {/* Menu Items */}
            <div className="py-1 px-1">
                <Link 
                    href="/settings" 
                    prefetch={true}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100! transition-colors text-gray-700! rounded-lg cursor-pointer"
                >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                </Link>
                
                <div className="border-t border-gray-200 my-1"></div>
                
                <div 
                    onClick={() => {
                        // Clear user cache on logout
                        localStorage.removeItem('user_data');
                        window.location.href = '/api/auth/logout';
                    }}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100! transition-colors text-gray-700! rounded-lg cursor-pointer"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                </div>
            </div>
        </div>
    );

    return (
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
                <Link href="/projects" className="cursor-pointer flex items-center gap-2" prefetch={true}>
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
                        className="lg:hidden block"
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

                <Dropdown 
                    popupRender={dropdownRender}
                    trigger={["click"]}
                    placement="bottomRight"
                >
                    <div className="cursor-pointer">
                        {userData?.avatar ? (
                            <Avatar 
                                src={userData.avatar} 
                                size={32}
                                className="hover:opacity-80 transition-opacity"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors">
                                <User className="w-5 h-5 text-gray-600" />
                            </div>
                        )}
                    </div>
                </Dropdown>
            </div>
        </header>
    );
}

