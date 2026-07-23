"use client";

import classNames from 'classnames';
import { Button, ButtonProps } from 'antd';

const ButtonAnt = (props: ButtonProps) => {
  const { className, ...rest } = props;

  return (
    <Button
      className={classNames(className, '!py-3 !h-auto !text-base !font-medium')}
      {...rest}
    />
  );
};

export default ButtonAnt;
