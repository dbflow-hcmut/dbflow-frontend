"use client";

import React, { useState, useRef, useEffect } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath, useReactFlow } from "reactflow";
import { Palette } from "lucide-react";

type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
    lineStyle?: 'single' | 'double' | 'bracket';
    bracketDirection?: 'from' | 'to';
};

const ErdEdge: React.FC<EdgeProps<ErdEdgeData>> = (props) => {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        style,
        markerEnd,
        data,
        selected,
    } = props;

    const { setEdges } = useReactFlow();
    const [showButton, setShowButton] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLDivElement>(null);

    const [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
    });

    const nearSourceX = sourceX + (targetX - sourceX) * 0.2;
    const nearSourceY = sourceY + (targetY - sourceY) * 0.2;
    const nearTargetX = sourceX + (targetX - sourceX) * 0.8;
    const nearTargetY = sourceY + (targetY - sourceY) * 0.8;

    const lineStyle = data?.lineStyle || 'single';

    // Calculate angle for bracket
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
    const bracketLength = 12;
    const bracketOffset = 8;

    // Calculate offset for fromMult and toMult (both on the same side of the line)
    const labelPerpAngle = angle - Math.PI / 2;
    const labelOffsetDistance = 15;
    const labelOffsetX = Math.cos(labelPerpAngle) * labelOffsetDistance;
    const labelOffsetY = Math.sin(labelPerpAngle) * labelOffsetDistance;

    const handleStyleChange = (newStyle: 'single' | 'double' | 'bracket') => {
        setEdges((edges) =>
            edges.map((edge) =>
                edge.id === id
                    ? { ...edge, data: { ...edge.data, lineStyle: newStyle } }
                    : edge
            )
        );
        setShowMenu(false);
        // Keep button visible if edge is selected
        if (!selected) {
            setShowButton(false);
        }
    };

    const menuItems = [
        {
            key: 'single',
            label: 'Single line',
            onClick: () => handleStyleChange('single'),
        },
        {
            key: 'double',
            label: 'Double line',
            onClick: () => handleStyleChange('double'),
        },
        {
            key: 'bracket',
            label: 'Identifying',
            onClick: () => handleStyleChange('bracket'),
        },
    ];

    // Calculate offset points for double line (parallel line)
    const offsetDistance = 3;
    const perpAngle = angle + Math.PI / 2;
    const offsetX = Math.cos(perpAngle) * offsetDistance;
    const offsetY = Math.sin(perpAngle) * offsetDistance;

    // Offset path for double line
    const [offsetPath] = getStraightPath({
        sourceX: sourceX + offsetX,
        sourceY: sourceY + offsetY,
        targetX: targetX + offsetX,
        targetY: targetY + offsetY,
    });

    // Close menu and button when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            // Check if click is inside menu or button
            const isInsideMenu = menuRef.current?.contains(target);
            const isInsideButton = buttonRef.current?.contains(target);

            // Close if clicked outside both menu and button
            if (showMenu && !isInsideMenu && !isInsideButton) {
                setShowMenu(false);
            }

            // Only close button if edge is not selected
            if (showButton && !isInsideButton && !isInsideMenu && !selected) {
                setShowButton(false);
            }
        };

        if (showMenu || showButton) {
            // Use capture phase to catch events early
            document.addEventListener('mousedown', handleClickOutside, true);

            return () => {
                document.removeEventListener('mousedown', handleClickOutside, true);
            };
        }
    }, [showMenu, showButton, selected]);

    // Show/hide button based on edge selection
    useEffect(() => {
        if (selected) {
            // Show button when edge is selected
            if (!showButton && !showMenu) {
                setShowButton(true);
            }
        } else {
            // Hide button when edge is deselected (unless menu is open)
            if (!showMenu) {
                setShowButton(false);
            }
        }
    }, [selected, showButton, showMenu]);

    return (
        <>
            <g
                onClick={() => {
                    if (!showButton && !showMenu) {
                        setTimeout(() => {
                            setShowButton(true);
                        }, 50);
                    }
                }}
                style={{ cursor: 'pointer' }}
            >
                {/* Main edge */}
                <BaseEdge
                    id={id}
                    path={edgePath}
                    style={{
                        ...style,
                        stroke: selected ? '#42a5f5' : 'var(--color-gray-700)',
                        strokeWidth: selected ? (lineStyle === 'double' ? 1.5 : 1) : (lineStyle === 'double' ? 1 : 1),
                        strokeDasharray: style?.strokeDasharray,
                    }}
                    markerEnd={markerEnd}
                />

                {/* Second line for double style */}
                {lineStyle === 'double' && (
                    <path
                        d={offsetPath}
                        style={{
                            stroke: selected ? '#42a5f5' : 'var(--color-gray-700)',
                            strokeWidth: selected ? 1.5 : 1,
                            fill: 'none',
                        }}
                        markerEnd={markerEnd}
                    />
                )}

                {/* Bracket notation */}
                {lineStyle === 'bracket' && (() => {
                    const bracketDirection = data?.bracketDirection || 'to';
                    const bracketX = bracketDirection === 'from' ? nearSourceX : nearTargetX;
                    const bracketY = bracketDirection === 'from' ? nearSourceY : nearTargetY;
                    const bracketAngle = bracketDirection === 'from' ? angle + Math.PI : angle;
                    
                    return (
                        <g
                            transform={`translate(${bracketX}, ${bracketY}) rotate(${(bracketAngle * 180) / Math.PI})`}
                        >
                            <path
                                d={`
                                    M ${-bracketLength / 2 - 8},${-bracketOffset - 2}
                                    L ${-bracketLength / 2},${-bracketOffset - 2}
                                    C ${bracketLength / 2},${-bracketOffset - 2} ${bracketLength / 2},${bracketOffset + 2} ${-bracketLength / 2},${bracketOffset + 2}
                                    L ${-bracketLength / 2 - 8},${bracketOffset + 2}
                                `}
                                fill="none"
                                stroke={selected ? '#42a5f5' : 'var(--color-gray-700)'}
                                strokeWidth="1"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </g>
                    );
                })()}



            </g>

            <EdgeLabelRenderer>
                {/* Style button - show when clicked or when edge is selected */}
                {(showButton || selected) && !showMenu && (
                    <div
                        ref={buttonRef}
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            zIndex: 1001,
                            pointerEvents: 'auto',
                        }}
                        className="nodrag nopan"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <button
                            className="w-4 h-4 flex items-center justify-center bg-white border border-primary-500 rounded-md shadow-md hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setShowMenu(true);
                            }}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            <Palette size={8} />
                        </button>
                    </div>
                )}

                {/* Style selection menu */}
                {showMenu && (
                    <div
                        ref={menuRef}
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            zIndex: 1002,
                            pointerEvents: 'auto',
                        }}
                        className="nodrag nopan"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-white rounded-sm shadow-md min-w-20">
                            <div className="h-4 px-2 py-1 font-semibold text-[7px] items-center flex bg-primary-500 text-white rounded-t-sm">
                                Edge Style
                            </div>
                            {menuItems.map((item) => (
                                <div
                                    key={item.key}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        item.onClick();
                                    }}
                                    className="px-2 py-1 text-[7px] leading-tight cursor-pointer hover:bg-gray-100 transition-colors pointer-events-auto whitespace-nowrap"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {item.label}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {data?.label ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        className="nodrag nopan text-xs pointer-events-auto"
                    >
                        {data.label}
                    </div>
                ) : null}
                {data?.fromMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearSourceX + labelOffsetX}px, ${nearSourceY + labelOffsetY}px)`,
                        }}
                        className="nodrag nopan text-[10px] pointer-events-none"
                    >
                        {data.fromMult}
                    </div>
                ) : null}
                {data?.toMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearTargetX + labelOffsetX}px, ${nearTargetY + labelOffsetY}px)`,
                        }}
                        className="nodrag nopan text-[10px] pointer-events-none"
                    >
                        {data.toMult}
                    </div>
                ) : null}
            </EdgeLabelRenderer>
        </>
    );
};

export default ErdEdge;