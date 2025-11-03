import { Handle, Position } from 'reactflow';

type ErdHandleProps = {
  id: string;
  position: Position;
  style?: React.CSSProperties;
  isConnectable?: boolean;
  isHovered?: boolean;
  isSelected?: boolean;
};

function ErdHandle({ 
  id, 
  position, 
  style, 
  isConnectable = true, 
  isHovered = false, 
  isSelected = false 
}: ErdHandleProps) {
  const getOffsetStyle = () => {
    const baseOffset = 1;
    switch (position) {
      case Position.Top:
        return { top: `${baseOffset}px` };
      case Position.Bottom:
        return { bottom: `${baseOffset}px` };
      case Position.Left:
        return { left: `${baseOffset}px` };
      case Position.Right:
        return { right: `${baseOffset}px` };
      default:
        return {};
    }
  };

  return (
    <div style={{ ...style}}>
      <Handle 
        type="target" 
        position={position} 
        id={`${id}-target`}
        isConnectable={isConnectable}
        style={getOffsetStyle()}
        className="!w-1 !h-1 !border-none !bg-transparent"
      />
      
      <Handle 
        type="source" 
        position={position} 
        id={`${id}-source`}
        isConnectable={isConnectable}
        style={getOffsetStyle()}
        className="!w-1 !h-1 !border-none !bg-transparent"
      />
      
      <div 
        className={`w-1.5 h-1.5 bg-primary-light border border-primary rounded-full absolute transition-opacity duration-200 pointer-events-none ${
          isHovered && !isSelected ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          ...(position === Position.Top && { 
            top: '-2px', 
            left: '50%', 
            transform: 'translateX(-50%)' 
          }),
          ...(position === Position.Bottom && { 
            bottom: '-2px', 
            left: '50%', 
            transform: 'translateX(-50%)' 
          }),
          ...(position === Position.Left && { 
            left: '-2px', 
            top: '50%', 
            transform: 'translateY(-50%)' 
          }),
          ...(position === Position.Right && { 
            right: '-2px', 
            top: '50%', 
            transform: 'translateY(-50%)' 
          }),
        }}
      />
    </div>
  );
}

export default ErdHandle;