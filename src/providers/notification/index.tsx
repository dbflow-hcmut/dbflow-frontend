"use client";

import { notification } from "antd";
import SuccessIcon from "@/components/Icons/SuccessIcon";
import CloseCircleIcon from "@/components/Icons/CloseCircleIcon";
import InfoCircleIcon from "@/components/Icons/InfoCircleIcon";
import React, { useEffect } from "react";

interface NotificationProps {
  key?: string | number;
  type?: "success" | "error" | "progress";
  message?: string;
  description?: string;
  placement?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
  duration?: number;
  icon?: React.ReactNode;
}

export const notificationProvider = {
  open: (params: NotificationProps) => {
    const { key, type = "error", message, description, icon, duration = 3, placement = "topRight" } = params;

    switch (type) {
      case "progress":
        (apiRef ?? notification).info({
          message: message ?? description,
          description,
          icon: icon ?? <InfoCircleIcon />,
          className: "notification-error-custom-dark",
          placement,
          duration,
          key
        });
        break;
      case "success":
        (apiRef ?? notification).success({
          message: message ?? description,
          description,
          icon: icon ?? <SuccessIcon />,
          className: "notification-success-custom",
          placement,
          duration,
          key
        });
        break;
      case "error":
      default:
        (apiRef ?? notification).error({
          message: message ?? description,
          description,
          icon: icon ?? <CloseCircleIcon />,
          className: 'notification-error-custom',
          placement,
          duration,
          key
        });
        break;
    }
  },
  close: (key?: string | number) => {
    if (key) {
      (apiRef ?? notification).destroy(key);
    } else {
      (apiRef ?? notification).destroy();
    }
  },
};

let apiRef: ReturnType<typeof notification.useNotification>[0] | null = null;

export default function NotificationRoot(): React.JSX.Element {
  const [api, contextHolder] = notification.useNotification();

  useEffect(() => {
    apiRef = api;
    return () => {
      apiRef = null;
    };
  }, [api]);

  return contextHolder as unknown as React.JSX.Element;
}

