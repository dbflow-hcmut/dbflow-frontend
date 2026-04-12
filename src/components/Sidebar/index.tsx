"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Settings,
  PanelLeftDashed,
  Sparkles,
  History,
} from "lucide-react";
import { Radio, RadioChangeEvent, Popover } from "antd";
import classNames from "classnames";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const navItems: NavItem[] = [
  {
    label: "AI Chat",
    icon: <Sparkles className="w-5 h-5" />,
    path: "/ai-chat",
  },
  {
    label: "History",
    icon: <History className="w-5 h-5" />,
    path: "/history",
  },
  {
    label: "Projects",
    icon: <LayoutGrid className="w-5 h-5" />,
    path: "/projects",
  },
  // {
  //   label: "Usage",
  //   icon: <ChartArea className="w-5 h-5" />,
  //   path: "/usage",
  // },
  {
    label: "Settings",
    icon: <Settings className="w-5 h-5" />,
    path: "/settings",
  },
];

type SidebarState = "expanded" | "collapsed" | "hover";

export default function Sidebar() {
  const pathname = usePathname();
  const [sidebarState, setSidebarState] = useState<SidebarState>("expanded");
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const isMobileOrTablet = window.innerWidth < 1024;
      if (isMobileOrTablet) {
        setSidebarState("collapsed");
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSidebarStateChange = (e: RadioChangeEvent) => {
    setSidebarState(e.target.value);
  };

  const isActive = (path: string) => {
    return pathname === path || pathname.startsWith(path + "/");
  };

  const getSidebarWidth = () => {
    if (sidebarState === "expanded") return "w-56";
    if (sidebarState === "collapsed") return "w-16";
    if (sidebarState === "hover") {
      return isHovered ? "w-56" : "w-16";
    }
    return "w-56";
  };

  const shouldShowText = () => {
    if (sidebarState === "expanded") return true;
    if (sidebarState === "collapsed") return false;
    if (sidebarState === "hover") return isHovered;
    return true;
  };

  return (
    <div className="relative h-full">
      <aside
        onMouseEnter={() => sidebarState === "hover" && setIsHovered(true)}
        onMouseLeave={() => sidebarState === "hover" && setIsHovered(false)}
        className={`h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200 overflow-hidden ${getSidebarWidth()}`}
      >
        <nav className="h-full flex py-4 px-2 flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const showText = shouldShowText();
            return (
              <Link
                key={item.path}
                href={item.path}
                className={classNames("w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors cursor-pointer", {
                  "bg-gray-100 text-primary-500": active,
                  "text-gray-700 hover:bg-gray-50": !active
                })}
              >
                <span className={classNames("flex-shrink-0", active ? "text-primary-500" : "")}>
                  {item.icon}
                </span>
                <div 
                  className="overflow-hidden transition-all duration-200 ease-in-out"
                  style={{
                    maxWidth: showText ? "200px" : "0px",
                    opacity: showText ? 1 : 0,
                    transitionProperty: "max-width, opacity",
                  }}
                >
                  <span className="text-sm font-medium whitespace-nowrap inline-block pl-0">
                    {item.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="relative p-4 border-t border-gray-200">
          <Popover
            content={
              <div>
                <div className="text-xs font-medium text-gray-700 mb-3">
                  Sidebar control
                </div>
                <Radio.Group
                  value={sidebarState}
                  onChange={handleSidebarStateChange}
                  className="w-full"
                >
                  <div className="flex flex-col gap-2">
                    <Radio value="expanded" className="w-full text-xs">
                      <span className="text-xs">Expanded</span>
                    </Radio>
                    <Radio value="collapsed" className="w-full text-xs">
                      <span className="text-xs">Collapsed</span>
                    </Radio>
                    <Radio value="hover" className="w-full text-xs">
                      <span className="text-xs">Expand on hover</span>
                    </Radio>
                  </div>
                </Radio.Group>
              </div>
            }
            placement="topLeft"
            trigger="click"
          >
            <button className="flex items-center justify-center p-2 hover:bg-gray-50 rounded cursor-pointer">
              <PanelLeftDashed className="w-4 h-4 text-gray-500" />
            </button>
          </Popover>
        </div>
      </aside>
    </div>
  );
}

