import classNames from "classnames";

type LoadingIndicatorProps = {
  className?: string;
  fullArea?: boolean;
  label?: string;
  size?: "small" | "medium";
};

export default function LoadingIndicator({
  className,
  fullArea = false,
  label = "Loading",
  size = "small",
}: LoadingIndicatorProps) {
  return (
    <div
      className={classNames(
        "flex items-center justify-center",
        fullArea && "h-full min-h-[520px] w-full",
        className,
      )}
      role="status"
      aria-label={label}
    >
      <span
        className={classNames(
          "animate-spin rounded-full border-2 border-gray-200 border-t-gray-500",
          size === "small" ? "h-4 w-4" : "h-6 w-6",
        )}
      />
    </div>
  );
}
