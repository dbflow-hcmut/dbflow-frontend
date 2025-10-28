import * as React from 'react';
const EmptyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={49}
    height={48}
    viewBox="0 0 49 48"
    fill="none"
    {...props}
  >
    <path
      d="M30.5 2v12h12"
      stroke="#BABCBE"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M42.5 24V14l-12-12h-24v44h23m-15-10h5m-5-10h8m-8-10h8"
      stroke="#BABCBE"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m44.5 44-6.051-6.051M33.5 40a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm-2-9 4 4m0-4-4 4"
      stroke="#455560"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export default EmptyIcon;
