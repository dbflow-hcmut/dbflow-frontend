"use client";

import classNames from 'classnames';
import { Input, InputProps } from 'antd';
import { useState } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';

const PassAnt = (props: InputProps) => {
  const { className, ...rest } = props;
  const [isHidden, setIsHidden] = useState(true);

  return (
    <div className="relative">
      <Input
        {...rest}
        type={isHidden ? 'password' : 'text'}
        className={classNames(
          '!py-3 !h-12 !font-medium !text-gray-700 !pr-10',
          className
        )}
      />
      <div
        className="absolute inset-y-0 right-3 flex items-center text-gray-500 cursor-pointer"
        onClick={() => setIsHidden(!isHidden)}
      >
        {isHidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
      </div>
    </div>
  );
};

export default PassAnt;