import { memo, ReactNode } from "react";
import classNames from "classnames";

export const DatabaseSchemaNode = memo(({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string;
}) => {
  return (
    <div className={classNames("bg-white border border-gray-300", className)} style={{ overflow: 'visible' }}>
      {children}
    </div>
  );
});

DatabaseSchemaNode.displayName = "DatabaseSchemaNode";

export const DatabaseSchemaNodeHeader = memo(({ 
  children, 
  className,
  style
}: { 
  children: ReactNode; 
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <div className={classNames("border-b border-gray-300 bg-gray-50 px-3 py-2 font-semibold text-sm", className)} style={style}>
      {children}
    </div>
  );
});

DatabaseSchemaNodeHeader.displayName = "DatabaseSchemaNodeHeader";

export const DatabaseSchemaNodeBody = memo(({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string;
}) => {
  return (
    <div className={classNames("divide-y divide-gray-200", className)}>
      {children}
    </div>
  );
});

DatabaseSchemaNodeBody.displayName = "DatabaseSchemaNodeBody";

export const DatabaseSchemaTableRow = memo(({ 
  children, 
  className,
  style
}: { 
  children: ReactNode; 
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <div className={classNames("flex items-center", className)} style={style}>
      {children}
    </div>
  );
});

DatabaseSchemaTableRow.displayName = "DatabaseSchemaTableRow";

export const DatabaseSchemaTableCell = memo(({ 
  children, 
  className,
  style
}: { 
  children: ReactNode; 
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <div className={classNames("px-3 py-2 text-xs", className)} style={style}>
      {children}
    </div>
  );
});

DatabaseSchemaTableCell.displayName = "DatabaseSchemaTableCell";

