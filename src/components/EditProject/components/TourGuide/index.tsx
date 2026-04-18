"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS, TOUR_STORAGE_KEY, type TourStep } from "./tour-config";

type TooltipPosition = {
    top: number;
    left: number;
};

const PADDING = 8;
const TOOLTIP_GAP = 12;

function getHighlightRect(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    return {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
    };
}

function computeTooltipPosition(
    targetRect: { top: number; left: number; width: number; height: number },
    placement: TourStep["placement"] = "bottom",
    tooltipWidth: number,
    tooltipHeight: number,
): TooltipPosition {
    let top = 0;
    let left = 0;

    switch (placement) {
        case "top":
            top = targetRect.top - tooltipHeight - TOOLTIP_GAP;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
            break;
        case "bottom":
            top = targetRect.top + targetRect.height + TOOLTIP_GAP;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
            break;
        case "left":
            top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
            left = targetRect.left - tooltipWidth - TOOLTIP_GAP;
            break;
        case "right":
            top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
            left = targetRect.left + targetRect.width + TOOLTIP_GAP;
            break;
    }

    // Clamp to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left < 8) left = 8;
    if (left + tooltipWidth > vw - 8) left = vw - tooltipWidth - 8;
    if (top < 8) top = 8;
    if (top + tooltipHeight > vh - 8) top = vh - tooltipHeight - 8;

    return { top, left };
}

type TourGuideProps = {
    /** Override the default steps from tour-config */
    steps?: TourStep[];
    /** Callback when the tour is finished or skipped */
    onFinish?: () => void;
};

const TourGuide: React.FC<TourGuideProps> = ({ steps: customSteps, onFinish }) => {
    const steps = customSteps ?? TOUR_STEPS;
    const [currentStep, setCurrentStep] = useState(0);
    const [visible, setVisible] = useState(false);
    const [highlightRect, setHighlightRect] = useState<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);

    // Check localStorage to decide if tour should show
    useEffect(() => {
        try {
            const done = localStorage.getItem(TOUR_STORAGE_KEY);
            if (!done) {
                setVisible(true);
            }
        } catch {
            setVisible(true);
        }
    }, []);

    const step = steps[currentStep] as TourStep | undefined;

    // Compute highlight rect for the current target
    useEffect(() => {
        if (!visible || !step) {
            setHighlightRect(null);
            return;
        }

        const findTarget = () => {
            const el = document.getElementById(step.targetId);
            if (el) {
                setHighlightRect(getHighlightRect(el));
            } else {
                setHighlightRect(null);
            }
        };

        // Small delay to allow DOM to settle
        const timer = setTimeout(findTarget, 100);

        // Also update on resize / scroll
        const handleUpdate = () => findTarget();
        window.addEventListener("resize", handleUpdate);
        window.addEventListener("scroll", handleUpdate, true);

        return () => {
            clearTimeout(timer);
            window.removeEventListener("resize", handleUpdate);
            window.removeEventListener("scroll", handleUpdate, true);
        };
    }, [visible, step, currentStep]);

    const finish = useCallback(() => {
        setVisible(false);
        try {
            localStorage.setItem(TOUR_STORAGE_KEY, "true");
        } catch {
            // noop
        }
        onFinish?.();
    }, [onFinish]);

    const handleNext = useCallback(() => {
        if (currentStep < steps.length - 1) {
            setCurrentStep((s) => s + 1);
        } else {
            finish();
        }
    }, [currentStep, steps.length, finish]);

    const handlePrev = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep((s) => s - 1);
        }
    }, [currentStep]);

    const handleSkip = useCallback(() => {
        finish();
    }, [finish]);

    // Tooltip size estimate for positioning
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    const tooltipPos = useMemo(() => {
        if (!highlightRect || !step) return { top: 0, left: 0 };
        return computeTooltipPosition(
            highlightRect,
            step.placement,
            tooltipWidth,
            tooltipHeight,
        );
    }, [highlightRect, step]);

    if (!visible || !step) return null;

    const overlay = (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                pointerEvents: "auto",
            }}
        >
            {/* Dark overlay with cutout */}
            <svg
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                }}
            >
                <defs>
                    <mask id="tour-mask">
                        <rect width="100%" height="100%" fill="white" />
                        {highlightRect && (
                            <rect
                                x={highlightRect.left}
                                y={highlightRect.top}
                                width={highlightRect.width}
                                height={highlightRect.height}
                                rx={8}
                                ry={8}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.5)"
                    mask="url(#tour-mask)"
                />
            </svg>

            {/* Highlight border */}
            {highlightRect && (
                <div
                    style={{
                        position: "absolute",
                        top: highlightRect.top,
                        left: highlightRect.left,
                        width: highlightRect.width,
                        height: highlightRect.height,
                        borderRadius: 8,
                        border: "2px solid #42A5F5",
                        boxShadow: "0 0 0 4px rgba(66,165,245,0.25)",
                        pointerEvents: "none",
                        transition: "all 0.3s ease",
                    }}
                />
            )}

            {/* Tooltip card */}
            <div
                style={{
                    position: "absolute",
                    top: tooltipPos.top,
                    left: tooltipPos.left,
                    width: tooltipWidth,
                    background: "white",
                    borderRadius: 8,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                    padding: "12px",
                    zIndex: 100000,
                    transition: "top 0.3s ease, left 0.3s ease",
                }}
            >
                <div
                    style={{
                        fontSize: 13,
                        color: "#6b7280",
                        marginBottom: 4,
                        fontWeight: 500,
                    }}
                >
                    {currentStep + 1} / {steps.length}
                </div>
                <div
                    style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#111827",
                        marginBottom: 8,
                    }}
                >
                    {step.title}
                </div>
                <div
                    style={{
                        fontSize: 14,
                        color: "#4b5563",
                        lineHeight: 1.5,
                        marginBottom: 16,
                    }}
                >
                    {step.description}
                </div>

                {/* Progress dots */}
                <div
                    style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 16,
                        justifyContent: "center",
                    }}
                >
                    {steps.map((_, i) => (
                        <div
                            key={i}
                            style={{
                                width: i === currentStep ? 20 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: i === currentStep ? "#42A5F5" : "#d1d5db",
                                transition: "all 0.3s ease",
                            }}
                        />
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                        onClick={handleSkip}
                        style={{
                            background: "none",
                            border: "none",
                            color: "#9ca3af",
                            fontSize: 13,
                            cursor: "pointer",
                            padding: "4px 8px",
                        }}
                    >
                        Skip tour
                    </button>
                    <div style={{ display: "flex", gap: 8 }}>
                        {currentStep > 0 && (
                            <button
                                onClick={handlePrev}
                                style={{
                                    background: "#f3f4f6",
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "8px 16px",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    color: "#374151",
                                }}
                            >
                                Previous
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            style={{
                                background: "#42A5F5",
                                border: "none",
                                borderRadius: 8,
                                padding: "8px 16px",
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                                color: "white",
                            }}
                        >
                            {currentStep === steps.length - 1 ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
};

export default TourGuide;
