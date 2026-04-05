"use client";

import React, { useState, useMemo, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, Grid3x3, List, Plus, Calendar } from "lucide-react";
import { Input, Button, Avatar, Badge, Pagination, Skeleton } from "antd";
import { formatDateTimeVN } from "@/utils/functions";
import { useProjects } from "@/api/projects/client";
import { Project, ProjectsListProps } from "@/types/projects.type";


export default function ProjectsList({ initialProjects = [], initialPagination }: ProjectsListProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchValue, setSearchValue] = useState(searchParams.get("keyword") || "");
    const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

    const currentPage = parseInt(searchParams.get("page") || "1", 10);
    const currentLimit = parseInt(searchParams.get("limit") || "9", 10);
    const serverKeyword = searchParams.get("keyword") || "";

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchValue]);

    const searchKeyword = useMemo(() => {
        return debouncedSearch.trim() || undefined;
    }, [debouncedSearch]);

    const shouldFetchFromClient = useMemo(() => {
        if (searchKeyword && searchKeyword !== serverKeyword) return true;
        if (initialPagination) {
            if (currentPage !== initialPagination.page || currentLimit !== initialPagination.limit) {
                return true;
            }
        }
        return false;
    }, [searchKeyword, serverKeyword, currentPage, currentLimit, initialPagination]);

    const { data: projectsData, isLoading } = useProjects(
        currentPage,
        currentLimit,
        searchKeyword,
        shouldFetchFromClient
    );

    const apiProjects = useMemo(() => {
        if (shouldFetchFromClient && projectsData?.items) {
            return projectsData.items;
        }
        return initialProjects;
    }, [shouldFetchFromClient, projectsData, initialProjects]);

    const pagination = useMemo(() => {
        if (shouldFetchFromClient && projectsData?.pagination) {
            return projectsData.pagination;
        }
        return initialPagination || { page: 1, limit: 9, total: 0, totalPages: 0 };
    }, [shouldFetchFromClient, projectsData, initialPagination]);

    const handlePageChange = (page: number, pageSize: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", page.toString());
        params.set("limit", pageSize.toString());
        if (searchKeyword) {
            params.set("keyword", searchKeyword);
        } else {
            params.delete("keyword");
        }
        router.push(`/projects?${params.toString()}`);
    };

    const projects: Project[] = useMemo(() => {
        if (!apiProjects || !Array.isArray(apiProjects)) return [];
        return apiProjects.map((apiProject) => ({
            id: apiProject.id,
            name: apiProject.name,
            owner: apiProject.owner,
            createdAt: apiProject.createdAt,
            updatedAt: apiProject.updatedAt,
            status: apiProject.status,
        }));
    }, [apiProjects]);

    const handleProjectClick = (projectId: string) => {
        startTransition(() => {
            router.push(`/projects/${projectId}`);
        });
    };

    return (
        <div className="px-10 py-10 max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>

            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Search for a project"
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="flex-1 max-w-md"
                        allowClear
                    />
                    <Button
                        icon={<Filter className="w-4 h-4" />}
                        className="flex items-center"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-2 cursor-pointer ${viewMode === "grid"
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-500 hover:bg-gray-50"
                                }`}
                        >
                            <Grid3x3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`p-2 border-l border-gray-200 cursor-pointer ${viewMode === "list"
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-500 hover:bg-gray-50"
                                }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Button
                        type="primary"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => router.push("/projects/new")}
                    >
                        New project
                    </Button>
                </div>
            </div>

            {isLoading ? (
                viewMode === "grid" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
                                <Skeleton active paragraph={{ rows: 3 }} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-max w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            PROJECT
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            STATUS
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            OWNER
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            UPDATED
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            CREATED
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                        <tr key={i}>
                                            <td className="px-6 py-4">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: 150 }} />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="h-6 bg-gray-200 rounded-full animate-pulse" style={{ width: 80 }} />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 bg-gray-200 rounded-full animate-pulse" />
                                                    <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: 100 }} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: 120 }} />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: 120 }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            onClick={() => handleProjectClick(project.id)}
                            className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all relative"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900 flex-1 pr-2">
                                    {project.name}
                                </h3>
                                <Badge
                                    status={project.status === "active" ? "success" : "default"}
                                    text={project.status === "active" ? "Active" : "Archived"}
                                    className="text-xs"
                                />
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                                <Avatar src={project.owner.avatar} size="small" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                        {project.owner.name}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {project.owner.email}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                                <Calendar className="w-3 h-3" />
                                <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-max w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        PROJECT
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        STATUS
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        OWNER
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        UPDATED
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        CREATED
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="bg-white divide-y divide-gray-200">
                                {projects.map((project) => (
                                    <tr
                                        key={project.id}
                                        onClick={() => handleProjectClick(project.id)}
                                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                            {project.name}
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${project.status === "active"
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-gray-100 text-gray-800"
                                                    }`}
                                            >
                                                {project.status === "active" ? "Active" : "Archived"}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <Avatar src={project.owner.avatar} size="small" />
                                                <span className="text-sm font-medium text-gray-900">
                                                    {project.owner.name}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDateTimeVN(project.updatedAt)}
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {formatDateTimeVN(project.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            )}

            {!isLoading && projects.length === 0 && (
                <div className="text-center py-12 text-gray-500 text-sm">
                    {searchValue ? "No projects found matching your search." : "No projects found. Create your first project to get started."}
                </div>
            )}

            {!isLoading && pagination.total > 0 && (
                <div className="mt-6 flex justify-end">
                    <Pagination
                        current={pagination.page}
                        pageSize={pagination.limit}
                        total={pagination.total}
                        onChange={handlePageChange}
                        onShowSizeChange={handlePageChange}
                        hideOnSinglePage
                    />
                </div>
            )}
        </div>
    );
}

