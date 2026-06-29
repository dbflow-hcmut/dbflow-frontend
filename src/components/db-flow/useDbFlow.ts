import { useState, useCallback, useEffect } from 'react'
import { useProjectDbConnections } from '@/api/db-connections/client'
import { DB_FLOW_CONFIGS, type DbFlowName, type DbFlowStep, type DbFlowEvent, type DbFlowStepConfig } from './db-flow-config'

export function useDbFlow(
    flowName: DbFlowName,
    isOpen: boolean,
    projectId: string | null,
) {
    const [step, setStep] = useState<DbFlowStep | null>(null)
    const { data: connections, isLoading } = useProjectDbConnections(isOpen ? projectId : null)
    const config = DB_FLOW_CONFIGS[flowName]

    useEffect(() => {
        if (!isOpen) {
            setStep(null)
            return
        }
        // Wait for connections to load before picking the initial step
        if (isLoading || step !== null) return
        const hasConns = (connections?.length ?? 0) > 0
        setStep(config.initialStep(hasConns))
    }, [isOpen, isLoading, connections, step, config])

    /**
     * Fire an event from the current step.
     * Returns true if the flow ended (caller should invoke onClose).
     */
    const dispatch = useCallback((event: DbFlowEvent): boolean => {
        let ended = false
        setStep((current) => {
            if (!current) return null
            const steps = config.steps as Partial<Record<DbFlowStep, DbFlowStepConfig>>
            const stepConfig = steps[current]
            const next = stepConfig?.on[event]
            if (!next || next === 'close') {
                ended = true
                return null
            }
            return next
        })
        return ended
    }, [config])

    const goTo = useCallback((target: DbFlowStep) => {
        setStep(target)
    }, [])

    return { step, dispatch, goTo, isLoading }
}
