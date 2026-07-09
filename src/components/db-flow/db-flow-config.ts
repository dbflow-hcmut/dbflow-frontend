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
    | 'ai-tools'          // Hub for Generate Query / Seed Data — no connection required
    | 'query-executor'    // SQL query executor feature
    | 'seed-data'         // Seed data feature
    | 'sync-schema'       // Sync schema from live DB feature — connection required

export type DbFlowEvent =
    | 'connected'           // User successfully linked a connection to the project
    | 'created'             // User finished creating a new connection
    | 'change-db'           // User wants to swap the linked DB
    | 'back'                // User explicitly goes back
    | 'closed'              // Modal closed (X button or Cancel)
    | 'open-query-executor' // Open the Query Executor feature
    | 'open-seed-data'      // Open the Seed Data feature

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
     * "AI Data Tools" — launched from the toolbar Sparkles button.
     * Never gated on a connection — Generate Query / Seed Data both work
     * without one (query generation is grounded in the physical schema
     * model, not a live DB; seed data is generation-only for now).
     */
    'ai-tools': {
        initialStep: (): DbFlowStep => 'ai-tools',
        steps: {
            'ai-tools': {
                on: {
                    'open-query-executor': 'query-executor', // open feature → transition to feature step
                    'open-seed-data': 'seed-data',
                    closed: 'close',                          // X → close everything
                },
            },
            'query-executor': {
                on: {
                    closed: 'ai-tools', // X → back to hub (not close all)
                    back: 'ai-tools',
                },
            },
            'seed-data': {
                on: {
                    closed: 'ai-tools',
                    back: 'ai-tools',
                },
            },
        },
    },

    /**
     * "Sync Schema" — launched from its own toolbar button.
     * If no connection: guide user through connecting first, then show the sync view.
     * If already connected: jump straight to the sync view.
     */
    'sync-schema': {
        initialStep: (hasConnections: boolean): DbFlowStep =>
            hasConnections ? 'sync-schema' : 'connect-db',
        steps: {
            'connect-db': {
                on: {
                    connected: 'sync-schema', // linked a DB → show sync view
                    back: 'close',
                    closed: 'close',           // X → close everything
                },
            },
            'create-connection': {
                on: {
                    created: 'connect-db', // saved → back to select list
                    back: 'connect-db',    // explicit Back button → previous step
                    closed: 'close',       // X → close everything (not back to previous)
                },
            },
            'sync-schema': {
                on: {
                    'change-db': 'connect-db', // swap DB
                    closed: 'close',            // X → close everything
                },
            },
        },
    },
} satisfies Record<string, DbFlowConfig>

export type DbFlowName = keyof typeof DB_FLOW_CONFIGS
