export type TourStep = {
    /** CSS selector or element ID (without #) to highlight */
    targetId: string;
    /** Title of the step */
    title: string;
    /** Description text */
    description: string;
    /** Preferred placement of the tooltip relative to the target */
    placement?: "top" | "bottom" | "left" | "right";
};

export const TOUR_STEPS: TourStep[] = [
    {
        targetId: "tour-sidebar-toggle",
        title: "Sidebar Toggle",
        description:
            "Click here to open/close the notations sidebar where you can add diagram elements and manage pages.",
        placement: "top",
    },
    {
        targetId: "tour-toolbar",
        title: "Toolbar",
        description:
            "Switch between pointer, pan, and comment modes. Use drawing tools to annotate your diagram.",
        placement: "top",
    },
    {
        targetId: "tour-ai-chatbox",
        title: "AI Assistant",
        description:
            "Open the AI chatbox to generate or modify your diagram using natural language prompts.",
        placement: "top",
    },
    {
        targetId: "tour-sidebar",
        title: "Notations Sidebar",
        description:
            "Browse diagram pages, drag-and-drop notations onto the canvas, and view the diagram structure.",
        placement: "right",
    },
    {
        targetId: "tour-search-btn",
        title: "Search",
        description:
            "Quickly find entities, tables, or attributes in your diagram. Shortcut: Ctrl/Cmd + F.",
        placement: "bottom",
    },
    {
        targetId: "tour-download-btn",
        title: "Export",
        description:
            "Export your diagram as PNG, SVG, JSON, or SQL DDL script.",
        placement: "bottom",
    },
    {
        targetId: "tour-share-btn",
        title: "Share Project",
        description:
            "Invite collaborators to view or edit this project in real-time.",
        placement: "bottom",
    },
    {
        targetId: "tour-version-history",
        title: "Version History",
        description:
            "Browse and preview previous versions of your diagram. Restore any snapshot with one click.",
        placement: "bottom",
    },
    {
        targetId: "tour-undo",
        title: "Undo",
        description:
            "Undo (Ctrl+Z) your recent changes. Full history is preserved per diagram.",
        placement: "top",
    },
     {
        targetId: "tour-redo",
        title: "Redo",
        description:
            "Redo (Ctrl+Y) your recent changes. Full history is preserved per diagram.",
        placement: "top",
    },
    {
        targetId: "tour-zoom-controls",
        title: "Zoom Controls",
        description:
            "Zoom in/out, fit the diagram to screen, or toggle the properties panel.",
        placement: "top",
    },
    {
        targetId: "tour-properties-panel",
        title: "Properties Panel",
        description:
            "Select any element on the canvas to view and edit its properties here.",
        placement: "left",
    },
];

/** LocalStorage key used to track whether the user has completed the tour */
export const TOUR_STORAGE_KEY = "dbflow_tour_completed";
