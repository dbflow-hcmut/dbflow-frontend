"use client";

import classNames from 'classnames';
import Input, { InputProps } from 'antd/es/input/Input';

const InputAnt = (props: InputProps) => {
  const { className, ...rest } = props; 

  return (
    <Input
      className={classNames('!py-3 !h-12 !font-medium !text-gray-700', className)}
      {...rest}
    />
  );
};

export default InputAnt;
