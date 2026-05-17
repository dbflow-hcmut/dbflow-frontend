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
    <div className={classNames("bg-white border border-primary-500 rounded-lg shadow-lg", className)} style={{ overflow: 'visible' }}>
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
    <div className={classNames("border-b border-gray-300 bg-primary-500 rounded-t-lg px-3 py-2 font-bold text-white text-sm", className)} style={style}>
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
    <div className={classNames("rounded-b-lg", className)}>
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

