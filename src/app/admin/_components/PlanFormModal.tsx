import { useEffect } from "react";
import { AutoComplete, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import { Plan } from "@/api/subscriptions/client";
import { CreatePlanInput, PlanConfigInput } from "@/api/admin/client";
import { PLAN_FEATURE_FIELDS, PLAN_LIMIT_FIELDS } from "../_lib/planConfig";

type PlanFormValues = {
  code: string;
  name: string;
  description?: string;
  workspaceType: "personal" | "team" | "any";
  currency: string;
  monthlyBasePrice: number;
  yearlyBasePrice: number;
  monthlySeatPrice?: number;
  yearlySeatPrice?: number;
  includedSeats: number;
  isActive: boolean;
  displayOrder: number;
  limits: Record<string, number | null | undefined>;
  features: Record<string, boolean>;
  aiModel?: string;
};

type PlanFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  plan?: Plan;
  confirmLoading: boolean;
  onCancel: () => void;
  onSubmitCreate: (values: CreatePlanInput) => void;
  onSubmitEdit: (values: Partial<PlanConfigInput>) => void;
};

export default function PlanFormModal({ open, mode, plan, confirmLoading, onCancel, onSubmitCreate, onSubmitEdit }: PlanFormModalProps) {
  const [form] = Form.useForm<PlanFormValues>();

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && plan) {
      form.setFieldsValue({
        code: plan.code,
        name: plan.name,
        description: plan.description ?? "",
        workspaceType: plan.workspaceType,
        currency: plan.currency,
        monthlyBasePrice: Number(plan.monthlyBasePrice),
        yearlyBasePrice: Number(plan.yearlyBasePrice),
        monthlySeatPrice: plan.monthlySeatPrice != null ? Number(plan.monthlySeatPrice) : undefined,
        yearlySeatPrice: plan.yearlySeatPrice != null ? Number(plan.yearlySeatPrice) : undefined,
        includedSeats: plan.includedSeats,
        isActive: plan.isActive ?? true,
        displayOrder: plan.displayOrder ?? 0,
        limits: Object.fromEntries(
          PLAN_LIMIT_FIELDS.map((field) => {
            const raw = plan.limits?.[field.key];
            return [field.key, raw == null ? undefined : field.fromStored ? field.fromStored(raw) : raw];
          }),
        ),
        features: Object.fromEntries(PLAN_FEATURE_FIELDS.map((field) => [field.key, Boolean(plan.features?.[field.key])])),
        aiModel: plan.aiModel ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        currency: "USD",
        workspaceType: "personal",
        includedSeats: 1,
        isActive: true,
        displayOrder: 0,
        limits: {},
        features: {},
      });
    }
  }, [open, mode, plan, form]);

  const handleFinish = (values: PlanFormValues) => {
    const shared: PlanConfigInput = {
      name: values.name,
      description: values.description || undefined,
      workspaceType: values.workspaceType,
      currency: values.currency,
      monthlyBasePrice: String(values.monthlyBasePrice),
      yearlyBasePrice: String(values.yearlyBasePrice),
      monthlySeatPrice: values.monthlySeatPrice != null ? String(values.monthlySeatPrice) : undefined,
      yearlySeatPrice: values.yearlySeatPrice != null ? String(values.yearlySeatPrice) : undefined,
      includedSeats: values.includedSeats,
      isActive: values.isActive,
      displayOrder: values.displayOrder,
      limits: Object.fromEntries(
        PLAN_LIMIT_FIELDS.map((field) => {
          const value = values.limits?.[field.key];
          return [field.key, value == null ? null : field.toStored ? field.toStored(value) : value];
        }),
      ),
      features: Object.fromEntries(PLAN_FEATURE_FIELDS.map((field) => [field.key, Boolean(values.features?.[field.key])])),
      aiModel: values.aiModel?.trim() || null,
    };
    if (mode === "create") {
      onSubmitCreate({ ...shared, code: values.code });
    } else {
      onSubmitEdit(shared);
    }
  };

  return (
    <Modal
      title={mode === "create" ? "Add plan" : `Edit ${plan?.name ?? "plan"}`}
      open={open}
      confirmLoading={confirmLoading}
      onCancel={onCancel}
      onOk={() => form.submit()}
      width={640}
      centered
      destroyOnHidden
      styles={{
        body: {
          maxHeight: "calc(100vh - 220px)",
          overflowY: "auto",
          marginRight: -24,
          paddingRight: 24,
        },
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="code" label="Code" rules={[{ required: true, message: "Required" }]}>
            <Input disabled={mode === "edit"} placeholder="pro" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Required" }]}>
            <Input placeholder="Pro" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="workspaceType" label="Workspace type" rules={[{ required: true, message: "Required" }]}>
            <Select
              options={[
                { value: "personal", label: "Personal" },
                { value: "team", label: "Team" },
                { value: "any", label: "Any" },
              ]}
            />
          </Form.Item>
          <Form.Item name="currency" label="Currency" rules={[{ required: true, message: "Required" }]}>
            <Input maxLength={3} placeholder="USD" />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <Form.Item name="monthlyBasePrice" label="Monthly base price" rules={[{ required: true, message: "Required" }]}>
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="yearlyBasePrice" label="Yearly base price" rules={[{ required: true, message: "Required" }]}>
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="monthlySeatPrice" label="Monthly extra seat price">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="yearlySeatPrice" label="Yearly extra seat price">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="includedSeats" label="Included seats" rules={[{ required: true, message: "Required" }]}>
            <InputNumber className="w-full" min={1} />
          </Form.Item>
          <Form.Item name="displayOrder" label="Display order">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
        </div>
        <Form.Item name="isActive" label="Live (visible to customers)" valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item
          name="aiModel"
          label="AI model"
        >
          <AutoComplete
            allowClear
            placeholder="Default from environment"
            options={[
              { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
              { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
              { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
              { value: "gemini-3-flash", label: "Gemini 3 Flash" },
              { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
              { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            ]}
          />
        </Form.Item>

        <p className="mb-1 text-sm font-medium text-gray-200">Limits</p>
        <p className="mb-2 text-xs text-gray-400">Leave a field empty for unlimited.</p>
        <div className="mb-5 grid grid-cols-2 gap-x-4">
          {PLAN_LIMIT_FIELDS.map((field) => (
            <Form.Item key={field.key} name={["limits", field.key]} label={field.label}>
              <InputNumber className="w-full" min={0} placeholder="Unlimited" />
            </Form.Item>
          ))}
        </div>

        <p className="mb-2 text-sm font-medium text-gray-200">Features included in this plan</p>
        <div className="grid grid-cols-2 gap-x-4">
          {PLAN_FEATURE_FIELDS.map((field) => (
            <Form.Item key={field.key} name={["features", field.key]} label={field.label} valuePropName="checked">
              <Switch />
            </Form.Item>
          ))}
        </div>
      </Form>
    </Modal>
  );
}
