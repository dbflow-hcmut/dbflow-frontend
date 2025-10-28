import * as React from 'react';
const CloseCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 18 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M9 2a7 7 0 1 0 .001 14.001A7 7 0 0 0 9 2Zm2.584 9.66-1.03-.005L9 9.803l-1.552 1.85-1.032.005a.124.124 0 0 1-.125-.125c0-.03.01-.058.03-.081L8.352 9.03 6.32 6.61a.125.125 0 0 1 .095-.206l1.033.004L9 8.259l1.552-1.85 1.03-.004c.07 0 .126.054.126.125a.13.13 0 0 1-.03.08l-2.03 2.421 2.032 2.422a.125.125 0 0 1-.095.206Z"
      fill="#ED1B2E"
    />
  </svg>
);
export default CloseCircleIcon;
