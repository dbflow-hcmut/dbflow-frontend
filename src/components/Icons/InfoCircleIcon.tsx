import * as React from 'react';

const InfoCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 18 18"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M9 1.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 13.5a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z"
      fill="#007BFF"
    />
    <path
      d="M9 6.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm.75 6v-4a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0Z"
      fill="#007BFF"
    />
  </svg>
);

export default InfoCircleIcon;
