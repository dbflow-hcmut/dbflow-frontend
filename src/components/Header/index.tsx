"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, User, LayoutGrid, ChartArea, Settings, LogOut, FolderKanban, Sparkles } from "lucide-react";
import { Input, Dropdown, Avatar, InputRef } from "antd";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import classNames from "classnames";
import { getUserMe } from "@/api/users/client";
import { UserResponse } from "@/types/user.type";

interface SearchRoute {
    key: string;
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
}

const searchableRoutes: SearchRoute[] = [
    {
        key: 'ai-chat',
        title: 'AI Chat',
        description: 'AI assistant for databases',
        href: '/ai-chat',
        icon: <Sparkles className="w-4 h-4" />
    },
    {
        key: 'projects',
        title: 'Projects',
        description: 'View all your projects',
        href: '/projects',
        icon: <LayoutGrid className="w-4 h-4" />
    },
    {
        key: 'new-project',
        title: 'Create New Project',
        description: 'Start a new database project',
        href: '/projects/new',
        icon: <FolderKanban className="w-4 h-4" />
    },
    {
        key: 'settings',
        title: 'Settings',
        description: 'Manage your account settings',
        href: '/settings',
        icon: <Settings className="w-4 h-4" />
    },
];


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
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [userData, setUserData] = useState<UserResponse | null>(null);
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const searchInputRef = useRef<InputRef>(null);
    const menuItems = getMenuItems(pathname || "");

    // Filter routes based on search value
    const filteredRoutes = searchValue.trim()
        ? searchableRoutes.filter(route =>
            route.title.toLowerCase().includes(searchValue.toLowerCase()) ||
            route.description.toLowerCase().includes(searchValue.toLowerCase())
        )
        : searchableRoutes;

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

    // Reset selected index when search results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchValue]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K or Ctrl+K to focus search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
                setShowSearchResults(true);
            }
            
            // Escape to close search
            if (e.key === 'Escape') {
                setShowSearchResults(false);
                searchInputRef.current?.blur();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
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

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchValue(e.target.value);
        setShowSearchResults(true);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (!showSearchResults || filteredRoutes.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev < filteredRoutes.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredRoutes[selectedIndex]) {
                    navigateToRoute(filteredRoutes[selectedIndex].href);
                }
                break;
        }
    };

    const navigateToRoute = (href: string) => {
        setShowSearchResults(false);
        setSearchValue('');
        searchInputRef.current?.blur();
        router.push(href);
    };

    const renderSearchResults = () => {
        if (!showSearchResults) return null;

        return (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                {filteredRoutes.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                        No routes found
                    </div>
                ) : (
                    <div className="py-2">
                        {filteredRoutes.map((route, index) => (
                            <div
                                key={route.key}
                                onClick={() => navigateToRoute(route.href)}
                                className={classNames(
                                    "px-4 py-3 cursor-pointer transition-colors",
                                    index === selectedIndex
                                        ? "bg-blue-50"
                                        : "hover:bg-gray-50"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={classNames(
                                        "flex-shrink-0",
                                        index === selectedIndex ? "text-blue-600" : "text-gray-600"
                                    )}>
                                        {route.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={classNames(
                                            "font-medium text-xs truncate",
                                            index === selectedIndex ? "text-blue-900" : "text-gray-900"
                                        )}>
                                            {route.title}
                                        </div>
                                        <div className="text-xs text-gray-500 truncate">
                                            {route.description}
                                        </div>
                                    </div>
                                    {index === selectedIndex && (
                                        <div className="text-xs text-gray-400 font-mono">
                                            ↵
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 text-xs text-gray-500">
                    <div className="flex items-center justify-between">
                        <span>Navigate with ↑↓ keys, select with ↵</span>
                        <span>ESC to close</span>
                    </div>
                </div>
            </div>
        );
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
                <Link href="/ai-chat" className="cursor-pointer flex items-center gap-2" prefetch={true}>
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
                        ref={searchInputRef}
                        placeholder="Search..."
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        value={searchValue}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                        onFocus={() => setShowSearchResults(true)}
                        onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                        className="w-[350px]!"
                        suffix={
                            <span className="text-xs text-gray-400 font-mono">⌘K</span>
                        }
                    />
                    {renderSearchResults()}
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

