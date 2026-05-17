import { Handle, Position } from "reactflow";
import classNames from "classnames";

type LabeledHandleProps = {
    id: string;
    title: string;
    type: "source" | "target";
    position: Position;
    className?: string;
    handleClassName?: string;
    labelClassName?: string;
    isConnectable?: boolean;
    showOnHover?: boolean;
    isHovered?: boolean;
};

export function LabeledHandle({
    id,
    title,
    type,
    position,
    className,
    handleClassName,
    labelClassName,
    isConnectable = true,
    showOnHover = false,
    isHovered = false,
}: LabeledHandleProps) {
    const isLeft = position === Position.Left;
    const isRight = position === Position.Right;
    const shouldShow = !showOnHover || isHovered;

    return (
        <div className={classNames("relative flex items-center", className)}>
            {isLeft && (
                <span className={classNames("text-xs text-gray-700 mr-2", labelClassName)}>
                    {title}
                </span>
            )}
            <Handle
                type={type}
                position={position}
                id={id}
                isConnectable={isConnectable}
                style={isLeft ? { left: -6 } : isRight ? { right: -6 } : undefined}
                className={classNames(
                    "!w-3 !h-3 !bg-primary-500 !rounded-full hover:!bg-primary-600 transition-all !z-50",
                    showOnHover && !shouldShow && "!opacity-0 !pointer-events-none",
                    handleClassName
                )}
            />
            {isRight && (
                <span className={classNames("text-xs text-gray-700 ml-2", labelClassName)}>
                    {title}
                </span>
            )}
        </div>
    );
}

