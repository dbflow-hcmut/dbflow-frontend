import { SchemaType } from "@/utils/constants";

export interface CreateProjectRequest {
    name: string;
    description?: string;
    skipDefaultSchema?: boolean;
}

export interface ProjectResponse {
    id: string;
    name: string;
    owner: {
        id: string;
        name: string;
        email: string;
        avatar: string;
    };
    createdAt: string;
    updatedAt: string;
    visibility?: string;
    status: "active" | "archived";
}

export interface Owner {
    id: string;
    name: string;
    email: string;
    avatar: string;
}

export interface Project {
    id: string;
    name: string;
    owner: Owner;
    createdAt: string;
    updatedAt: string;
    status: "active" | "archived";
}

export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface ProjectsResponse {
    items: ProjectResponse[];
    pagination: PaginationInfo;
}

export interface ProjectsListProps {
    initialProjects?: ProjectResponse[];
    initialPagination?: PaginationInfo;
}

export interface CreateProjectFormValues {
    name: string;
    description?: string;
}

export interface ProjectSchemasResponse {
    id: string;
    projectId: string;
    name: string;
    type: SchemaType;
    dbms?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface DiagramViewport {
    x: number;
    y: number;
    zoom: number;
    gridSize: number;
    snapToGrid: boolean;
}

export interface DiagramResponse {
    diagram: {
        id: string;
        name: string;
        viewport: DiagramViewport;
        nodes: unknown[];
        edges: unknown[];
    };
}

export type CollaborationAwareness = {
    clientID: number;
    getStates(): Map<number, Record<string, unknown>>;
    setLocalState(state: Record<string, unknown> | null): void;
    setLocalStateField(field: string, value: unknown): void;
    on(event: "change", handler: () => void): void;
    off(event: "change", handler: () => void): void;
};

export interface IUserSharedProject {
    userId: string;
    fullName: string;
    email: string;
    avatar: string;
    permission: string;
    isVerified: boolean;
    invitePermission: string | null;
    inviteStatus: string | null;
}

export interface ISharedPermissionResponse {
    project_mode: string;
    list_users: IUserSharedProject[];
}
