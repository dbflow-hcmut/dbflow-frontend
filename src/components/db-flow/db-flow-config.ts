/**
 * Declarative config for all DB-related modal flows.
 *
 * Each flow is a state machine:
 *   - initialStep  → which step to start based on whether the project has connections
 *   - steps[step].on[event] → which step to transition to, or 'close' to end the flow
 *
 * Adding a new flow = add a new key here. No other file needs to change.
 */

export type DbFlowStep =
    | 'connect-db'        // Select an existing connection or go to create
    | 'create-connection' // Form to create a brand-new DB connection
    | 'schema-export'     // Apply physical schema to the connected DB
    | 'db-management'     // View / manage the linked DB for this project
    | 'query-executor'    // SQL query executor feature
    | 'seed-data'         // Seed data feature
    | 'sync-schema'       // Sync schema from live DB feature

export type DbFlowEvent =
    | 'connected'           // User successfully linked a connection to the project
    | 'created'             // User finished creating a new connection
    | 'change-db'           // User wants to swap the linked DB
    | 'back'                // User explicitly goes back
    | 'closed'              // Modal closed (X button or Cancel)
    | 'open-query-executor' // Open the Query Executor feature
    | 'open-seed-data'      // Open the Seed Data feature
    | 'open-sync-schema'    // Open the Sync Schema feature

export type DbFlowTransition = DbFlowStep | 'close'

export interface DbFlowStepConfig {
    on: Partial<Record<DbFlowEvent, DbFlowTransition>>
}

export interface DbFlowConfig {
    /** Starting step based on whether project already has a linked connection */
    initialStep: (hasConnections: boolean) => DbFlowStep
    steps: Partial<Record<DbFlowStep, DbFlowStepConfig>>
}

export const DB_FLOW_CONFIGS = {
    /**
     * "Apply Schema to Database" — launched from the export dropdown.
     * If no connection: guide user through connecting first, then open the export modal.
     * If already connected: jump straight to the export modal.
     */
    'apply-schema': {
        initialStep: (hasConnections: boolean): DbFlowStep =>
            hasConnections ? 'schema-export' : 'connect-db',
        steps: {
            'connect-db': {
                on: {
                    connected: 'schema-export', // linked a DB → proceed to export
                    back: 'close',
                    closed: 'close',            // X → close everything
                },
            },
            'create-connection': {
                on: {
                    created: 'connect-db', // saved → back to select list
                    back: 'connect-db',    // explicit Back button → previous step
                    closed: 'close',       // X → close everything (not back to previous)
                },
            },
            'schema-export': {
                on: {
                    'change-db': 'connect-db', // user wants a different DB
                    closed: 'close',            // X → close everything
                },
            },
        },
    },

    /**
     * "Database Management" — launched from the toolbar DatabaseZap button.
     * If no connection: guide user through connecting, then show management view.
     * If already connected: jump straight to management view.
     */
    'db-management': {
        initialStep: (hasConnections: boolean): DbFlowStep =>
            hasConnections ? 'db-management' : 'connect-db',
        steps: {
            'connect-db': {
                on: {
                    connected: 'db-management', // linked a DB → show management
                    back: 'close',
                    closed: 'close',             // X → close everything
                },
            },
            'create-connection': {
                on: {
                    created: 'connect-db', // saved → back to select list
                    back: 'connect-db',    // explicit Back button → previous step
                    closed: 'close',       // X → close everything (not back to previous)
                },
            },
            'db-management': {
                on: {
                    'change-db': 'connect-db',               // swap DB
                    'open-query-executor': 'query-executor', // open feature → transition to feature step
                    'open-seed-data': 'seed-data',
                    'open-sync-schema': 'sync-schema',
                    closed: 'close',                          // X → close everything
                },
            },
            'query-executor': {
                on: {
                    closed: 'db-management', // X → back to management (not close all)
                    back: 'db-management',
                },
            },
            'seed-data': {
                on: {
                    closed: 'db-management',
                    back: 'db-management',
                },
            },
            'sync-schema': {
                on: {
                    closed: 'db-management',
                    back: 'db-management',
                },
            },
        },
    },
} satisfies Record<string, DbFlowConfig>

export type DbFlowName = keyof typeof DB_FLOW_CONFIGS
