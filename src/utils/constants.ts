export const PAGE_WIDTH = 800;
export const PAGE_HEIGHT = 1120;

export const API_AVATAR = 'https://ui-avatars.com/api';

export const ROUTES_WITH_LAYOUT = [
    "/ai-chat",
    "/history",
    "/projects",
    "/usage",
    "/settings",
    "/workspaces",
];

// Routes that should only match exactly (no sub-route matching)
export const EXACT_MATCH_ROUTES = [
    "/projects",
];

export enum SchemaType {
    CONCEPTUAL = 'conceptual',
    LOGICAL = 'logical',
    PHYSICAL = 'physical',
}

export enum ProjectPermission {
    OWNER = 'owner',
    EDITOR = 'editor',
    VIEWER = 'viewer',
    INVITED = 'invited',
}

export enum ProjectVisible {
    OWNER_INVITED = 'owner_and_invited',
    ANYONE_VIEW = 'anyone_can_view',
    ANYONE_EDIT = 'anyone_can_edit',
}

export enum ProjectInvitePermission {
    EDITOR = 'editor',
    VIEWER = 'viewer',
    REJECTED = 'rejected',
}

export const RESTRICTED = 'restricted';
