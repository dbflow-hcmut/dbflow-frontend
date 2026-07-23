"use client";

import React, { useState, useMemo, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Grid3x3, List, Plus, Calendar, Trash2, Database, FileCode2, PlugZap, ChevronDown, MoreVertical } from "lucide-react";
import { Input, Button, Avatar, Pagination, Skeleton, Modal, Dropdown } from "antd";
import { formatDateTimeVN } from "@/utils/functions";
import { useProjects, deleteProject } from "@/api/projects/client";
import { getUserMe } from "@/api/users/client";
import { Project, ProjectsListProps } from "@/types/projects.type";
import { UserResponse } from "@/types/user.type";
import { notificationProvider } from "@/providers/notification";
import ImportDDLModal from "@/components/ImportDDLModal";
import DBConnectionModal from "../DBConnectionModal";
import IntrospectSchemaModal from "@/components/IntrospectSchemaModal";
import type { DBConnection } from "@/types/db-connection.type";
import { getActiveWorkspaceId } from "@/utils/active-workspace";


export default function ProjectsList({ initialProjects = [], initialPagination }: ProjectsListProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [searchValue, setSearchValue] = useState(searchParams.get("keyword") || "");
    const [debouncedSearch, setDebouncedSearch] = useState(searchValue);
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
    const [isDBConnectionOpen, setIsDBConnectionOpen] = useState(false);
    const [isImportDDLOpen, setIsImportDDLOpen] = useState(false);
    const [isIntrospectOpen, setIsIntrospectOpen] = useState(false);
    const [pendingConnId, setPendingConnId] = useState<string | undefined>(undefined);

    const currentPage = parseInt(searchParams.get("page") || "1", 10);
    const currentLimit = parseInt(searchParams.get("limit") || "9", 10);
    const serverKeyword = searchParams.get("keyword") || "";
    const queryWorkspaceId = searchParams.get("workspaceId") || undefined;
    const [workspaceId, setWorkspaceId] = useState(queryWorkspaceId);

    useEffect(() => {
        if (queryWorkspaceId) {
            setWorkspaceId(queryWorkspaceId);
            return;
        }

        const storedWorkspaceId = getActiveWorkspaceId();
        if (!storedWorkspaceId) return;

        setWorkspaceId(storedWorkspaceId);
        const params = new URLSearchParams(searchParams.toString());
        params.set("workspaceId", storedWorkspaceId);
        params.set("page", "1");
        router.replace(`/projects?${params.toString()}`);
    }, [queryWorkspaceId, router, searchParams]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchValue]);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const user = await getUserMe();
                setCurrentUser(user);
            } catch (error) {
                console.error("Failed to fetch user:", error);
            }
        };
        fetchUser();
    }, []);

    const searchKeyword = useMemo(() => {
        return debouncedSearch.trim() || undefined;
    }, [debouncedSearch]);

    const shouldFetchFromClient = useMemo(() => {
        if (workspaceId && workspaceId !== queryWorkspaceId) return true;
        if (searchKeyword && searchKeyword !== serverKeyword) return true;
        if (initialPagination) {
            if (currentPage !== initialPagination.page || currentLimit !== initialPagination.limit) {
                return true;
            }
        }
        return false;
    }, [workspaceId, queryWorkspaceId, searchKeyword, serverKeyword, currentPage, currentLimit, initialPagination]);

    const { data: projectsData, isLoading } = useProjects(
        currentPage,
        currentLimit,
        searchKeyword,
        shouldFetchFromClient,
        workspaceId,
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
        if (workspaceId) {
            params.set("workspaceId", workspaceId);
        }
        router.push(`/projects?${params.toString()}`);
    };

    const projects: Project[] = useMemo(() => {
        if (!apiProjects || !Array.isArray(apiProjects)) return [];
        return apiProjects.map((apiProject) => ({
            id: apiProject.id,
            workspaceId: apiProject.workspaceId,
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

    const handleDeleteClick = (e: React.MouseEvent, projectId: string, projectName: string) => {
        e.stopPropagation();
        const userIsOwner = isOwner(projects.find(p => p.id === projectId)!);
        
        Modal.confirm({
            title: userIsOwner ? 'Delete Project' : 'Leave Project',
            content: userIsOwner 
                ? `Are you sure you want to delete "${projectName}"? This action cannot be undone and will remove all data, schemas, and collaborators.`
                : `Are you sure you want to leave "${projectName}"? You will lose access to this project.`,
            okText: userIsOwner ? 'Delete' : 'Leave',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    setDeletingProjectId(projectId);
                    await deleteProject(projectId);
                    notificationProvider.open({
                        type: "success",
                        message: userIsOwner ? 'Project deleted successfully' : 'You have left the project successfully',
                    });
                    router.refresh();
                } catch (error) {
                    console.error('Failed to delete/leave project:', error);
                    notificationProvider.open({
                        type: "error",
                        message: userIsOwner ? 'Failed to delete project' : 'Failed to leave project',
                    });
                } finally {
                    setDeletingProjectId(null);
                }
            },
        });
    };

    const isOwner = (project: Project) => {
        return currentUser?.id === project.owner.id;
    };

    return (
        <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10 max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-5 sm:mb-6">Projects</h2>

            <div className="flex flex-col gap-3 mb-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                <div className="min-w-0 flex-1">
                    <Input
                        placeholder="Search for a project"
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        className="w-full !rounded-xl !border-0 !bg-gray-100 !shadow-none lg:max-w-md"
                        allowClear
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex shrink-0 items-center overflow-hidden rounded-xl bg-gray-100 p-1">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`cursor-pointer rounded-lg p-2 ${viewMode === "grid"
                                ? "bg-white text-gray-900"
                                : "text-gray-500 hover:bg-white/70"
                                }`}
                        >
                            <Grid3x3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode("list")}
                            className={`cursor-pointer rounded-lg p-2 ${viewMode === "list"
                                ? "bg-white text-gray-900"
                                : "text-gray-500 hover:bg-white/70"
                                }`}
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Dropdown
                        menu={{
                            items: [
                                {
                                    key: "import-ddl",
                                    icon: <FileCode2 className="w-4 h-4" />,
                                    label: (
                                        <div>
                                            <div className="font-medium">Import from DDL</div>
                                            <div className="text-xs text-gray-400 font-normal">Paste SQL and auto-create a project</div>
                                        </div>
                                    ),
                                    onClick: () => setIsImportDDLOpen(true),
                                },
                                {
                                    key: "connect-directly",
                                    icon: <PlugZap className="w-4 h-4" />,
                                    label: (
                                        <div>
                                            <div className="font-medium">Connect Directly</div>
                                            <div className="text-xs text-gray-400 font-normal">TCP, SSH tunnel or local agent</div>
                                        </div>
                                    ),
                                    onClick: () => setIsDBConnectionOpen(true),
                                },
                                {
                                    key: "use-saved",
                                    icon: <Database className="w-4 h-4" />,
                                    label: (
                                        <div>
                                            <div className="font-medium">Use Saved Connection</div>
                                            <div className="text-xs text-gray-400 font-normal">Import schema from an existing connection</div>
                                        </div>
                                    ),
                                    onClick: () => { setPendingConnId(undefined); setIsIntrospectOpen(true); },
                                },
                            ],
                        }}
                        trigger={["click"]}
                        placement="bottomRight"
                    >
                        <Button
                            icon={<Database className="w-4 h-4" />}
                            className="flex min-w-0 cursor-pointer items-center gap-1 !rounded-xl !border-0 !bg-gray-100 !shadow-none hover:!bg-gray-200"
                        >
                            <span className="hidden sm:inline">Connect to Database</span>
                            <span className="sm:hidden">Connect</span>
                            <ChevronDown className="w-3 h-3" />
                        </Button>
                    </Dropdown>

                    <Button
                        type="primary"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => router.push("/projects/new")}
                        className="cursor-pointer !rounded-xl !border-0 !shadow-none"
                    >
                        <span className="hidden sm:inline">New project</span>
                        <span className="sm:hidden">New</span>
                    </Button>
                </div>
            </div>

            <DBConnectionModal
                open={isDBConnectionOpen}
                onClose={() => setIsDBConnectionOpen(false)}
                onSaved={(conn: DBConnection) => {
                    setIsDBConnectionOpen(false);
                    setPendingConnId(conn.id);
                    setIsIntrospectOpen(true);
                }}
            />
            <IntrospectSchemaModal
                open={isIntrospectOpen}
                onClose={() => { setIsIntrospectOpen(false); setPendingConnId(undefined); }}
                initialConnectionId={pendingConnId}
            />
            <ImportDDLModal
                open={isImportDDLOpen}
                onClose={() => setIsImportDDLOpen(false)}
            />

            {isLoading ? (
                viewMode === "grid" ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="rounded-xl bg-gray-100 p-6">
                                <Skeleton active paragraph={{ rows: 3 }} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-max w-full">
                                <thead className="bg-gray-50">
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
                                <tbody className="divide-y divide-gray-100 bg-white">
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
                                            <td className="px-6 py-4">
                                                <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: 40 }} />
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
                            className="relative flex cursor-pointer flex-col rounded-xl bg-gray-100 p-5 transition-colors hover:bg-gray-200/70"
                        >
                            <div className="flex min-h-[52px] items-start justify-between gap-3">
                                <h3 className="line-clamp-2 min-w-0 flex-1 break-words text-lg font-semibold leading-[26px] text-gray-900">
                                    {project.name}
                                </h3>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Dropdown
                                        trigger={["click"]}
                                        placement="bottomRight"
                                        menu={{
                                            items: [{ key: "delete", danger: true, icon: <Trash2 className="h-4 w-4" />, label: "Delete" }],
                                            onClick: ({ domEvent }) => handleDeleteClick(domEvent as React.MouseEvent, project.id, project.name),
                                        }}
                                    >
                                        <Button
                                            type="text"
                                            size="small"
                                            aria-label="Project actions"
                                            icon={<MoreVertical className="h-5 w-5" />}
                                            loading={deletingProjectId === project.id}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center justify-center text-gray-500"
                                        />
                                    </Dropdown>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center gap-3">
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

                            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl bg-white">
                    <div className="overflow-x-auto">
                        <table className="min-w-max w-full">
                            <thead className="bg-gray-50">
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
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                        ACTIONS
                                    </th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100 bg-white">
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

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <Dropdown
                                                trigger={["click"]}
                                                placement="bottomRight"
                                                menu={{
                                                    items: [{ key: "delete", danger: true, icon: <Trash2 className="h-4 w-4" />, label: "Delete" }],
                                                    onClick: ({ domEvent }) => handleDeleteClick(domEvent as React.MouseEvent, project.id, project.name),
                                                }}
                                            >
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    aria-label="Project actions"
                                                    icon={<MoreVertical className="h-5 w-5" />}
                                                    loading={deletingProjectId === project.id}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center justify-center text-gray-500"
                                                />
                                            </Dropdown>
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
