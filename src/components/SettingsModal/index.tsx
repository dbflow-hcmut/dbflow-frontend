"use client";

import { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { Form, Input, Avatar, Button } from 'antd';
import { ShieldCheck, User, Camera, Building2, X, Search } from 'lucide-react';
import { getUserMe, updateUserProfile, changeUserPassword, uploadUserAvatar } from '@/api/users/client';
import { getWorkspaces } from '@/api/workspaces/client';
import { UserResponse } from '@/types/user.type';
import { notificationProvider } from '@/providers/notification';
import WorkspaceSettings from '@/components/WorkspaceSettings';
import LoadingIndicator from '@/components/LoadingIndicator';
import { getActiveWorkspaceId, setActiveWorkspaceId as persistActiveWorkspaceId } from '@/utils/active-workspace';

const { TextArea } = Input;
const { Password } = Input;

type TabType = 'profile' | 'security' | 'workspace';

interface TabItem {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  bio?: string;
}

interface SecurityFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const tabs: TabItem[] = [
  { id: 'profile', label: 'Profile', icon: <User size={18} /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={18} /> },
  { id: 'workspace', label: 'Workspace', icon: <Building2 size={18} /> },
];

export function SettingsModal({
  onClose,
  initialTab = 'profile',
}: {
  onClose: () => void;
  initialTab?: TabType;
}) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserResponse | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  useEffect(() => {
    loadUserData();
    void getWorkspaces()
      .then((workspaces) => {
        const storedWorkspaceId = getActiveWorkspaceId();
        const selectedWorkspace =
          workspaces.find((workspace) => workspace.id === storedWorkspaceId) ??
          workspaces.find((workspace) => workspace.type === 'personal') ??
          workspaces[0];

        if (selectedWorkspace) {
          setActiveWorkspaceId(selectedWorkspace.id);
          persistActiveWorkspaceId(selectedWorkspace.id);
        }
      })
      .catch(() => {
        notificationProvider.open({
          type: 'error',
          message: 'Failed to load workspace settings',
        });
      })
      .finally(() => setWorkspaceLoading(false));
  }, []);

  useEffect(() => {
    const handleWorkspaceChange = (event: Event) => {
      const workspaceId = (event as CustomEvent<{ workspaceId?: string }>).detail
        ?.workspaceId;
      if (workspaceId) setActiveWorkspaceId(workspaceId);
    };

    window.addEventListener('dbflow:workspace-changed', handleWorkspaceChange);
    return () => window.removeEventListener('dbflow:workspace-changed', handleWorkspaceChange);
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const data = await getUserMe();
      setUserData(data);
    } catch {
      notificationProvider.open({
        type: 'error',
        message: 'Failed to load user data'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (values: ProfileFormValues) => {
    try {
      // Remove email field before sending to API
      const updateData = {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        bio: values.bio,
      };
      
      const updatedUser = await updateUserProfile(updateData);
      
      // Update userData directly from response without reloading
      setUserData(updatedUser);
      
      // Update cached user data
      localStorage.setItem('user_data', JSON.stringify(updatedUser));
      
      notificationProvider.open({
        type: 'success',
        message: 'Profile updated successfully'
      });
    } catch (error) {
      notificationProvider.open({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update profile'
      });
    }
  };

  const handleAvatarChange = async (avatarKey: string) => {
    if (!userData) return;
    const updatedUser = await updateUserProfile({
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone,
      bio: userData.bio,
      avatarKey,
    });
    setUserData(updatedUser);
    localStorage.setItem('user_data', JSON.stringify(updatedUser));
    notificationProvider.open({ type: 'success', message: 'Avatar updated successfully' });
  };

  const handleSaveSecurity = async (values: SecurityFormValues) => {
    try {
      await changeUserPassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      notificationProvider.open({
        type: 'success',
        message: 'Password changed successfully'
      });
    } catch (error) {
      notificationProvider.open({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to change password'
      });
      // Re-throw error so SecurityTab knows it failed
      throw error;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-3" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Settings" className="relative flex h-[min(780px,92vh)] w-full max-w-[960px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_18px_48px_rgba(0,0,0,0.2)]" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Close settings" onClick={onClose} className="absolute right-6 top-6 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-gray-700 transition hover:bg-gray-100 hover:text-gray-950">
          <X className="h-5 w-5" />
        </button>

        <div className="flex min-h-0 w-full flex-col md:flex-row">
          <aside className="w-full shrink-0 border-b border-gray-200 bg-[#fbfbfa] p-4 md:w-50 md:border-b-0 md:border-r md:p-4">
            <div className="relative mb-8">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input value={settingsSearch} onChange={(event) => setSettingsSearch(event.target.value)} type="search" aria-label="Search settings" placeholder="Search" className="h-8 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 !text-sm !font-medium text-gray-800 outline-none transition placeholder:text-gray-500 focus:border-primary-500 focus:ring-1 focus:ring-gray-200" />
            </div>
            <div className="mb-3 px-3 text-xs font-medium text-gray-500">Settings</div>
            <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col md:overflow-x-visible">
                {tabs.filter((tab) => tab.label.toLowerCase().includes(settingsSearch.trim().toLowerCase())).map((tab) => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={classNames('flex h-8 w-full cursor-pointer items-center gap-3 whitespace-nowrap rounded-lg px-3 text-left transition-colors hover:bg-gray-200/70', activeTab === tab.id ? 'bg-[#e8e8e6] font-semibold text-gray-950' : 'text-gray-600')}>
                    <span className="text-gray-600">{tab.icon}</span><span className="text-sm">{tab.label}</span>
                  </button>
                ))}
            </nav>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-10 sm:px-5 md:px-6 md:pb-6 md:pt-10">
              {activeTab === 'profile' && <ProfileTab loading={loading} userData={userData} onSave={handleSaveProfile} onAvatarChange={handleAvatarChange} />}
              {activeTab === 'security' && <SecurityTab onSave={handleSaveSecurity} />}
              {activeTab === 'workspace' && (
                workspaceLoading ? (
                  <LoadingIndicator fullArea label="Loading workspace settings" />
                ) : activeWorkspaceId ? (
                  <WorkspaceSettings workspaceId={activeWorkspaceId} embedded />
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
                    No workspace is available for this account.
                  </div>
                )
              )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Profile settings form
function ProfileTab({
  loading,
  userData,
  onSave,
  onAvatarChange,
}: {
  loading: boolean;
  userData: UserResponse | null;
  onSave: (values: ProfileFormValues) => void;
  onAvatarChange: (avatarKey: string) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userData) {
      form.setFieldsValue({
        firstName: userData.firstName || '',
        lastName: userData.lastName || '',
        email: userData.email || '',
        phone: userData.phone || '',
        bio: userData.bio || '',
      });
    }
    setPreviewUrl(null);
  }, [userData, form]);

  const handleAvatarClick = () => {
    if (!loading && !avatarUploading) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setAvatarUploading(true);

    try {
      const key = await uploadUserAvatar(file);
      await onAvatarChange(key);
    } catch (error) {
      setPreviewUrl(null);
      notificationProvider.open({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to upload avatar',
      });
    } finally {
      setAvatarUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  };

  const currentAvatar = previewUrl || userData?.avatar;

  if (loading) {
    return <LoadingIndicator fullArea label="Loading profile settings" />;
  }

  return (
    <div>
      <h2 className="mb-8 !text-[15px] !font-semibold text-gray-950">Profile</h2>

      {/* Avatar upload */}
      <div className="mb-0 flex min-h-[88px] items-center justify-between gap-4 border-b border-gray-100 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Avatar</p>
        </div>
        <div
          className="relative cursor-pointer group"
          onClick={handleAvatarClick}
        >
          <Avatar
            src={currentAvatar}
            size={48}
            icon={<User size={24} />}
            className="border border-gray-200"
          />
          <div className={classNames(
            'absolute inset-0 rounded-full flex items-center justify-center bg-black/40 transition-opacity',
            avatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            {avatarUploading
              ? <span className="text-xs font-medium text-white">Uploading</span>
              : <Camera size={20} className="text-white" />
            }
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <Form
        className="[&_.ant-form-item-explain]:hidden"
        form={form}
        layout="horizontal"
        labelAlign="left"
        colon={false}
        labelCol={{ flex: 'auto' }}
        wrapperCol={{ flex: '0 0 320px' }}
        onFinish={onSave}
        onFinishFailed={({ errorFields }) => notificationProvider.open({
          type: 'error',
          message: errorFields[0]?.errors[0] ?? 'Please check your profile information',
        })}
        initialValues={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          bio: '',
        }}
      >
        <div>
          <Form.Item
            className="!mb-0 font-medium border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
            label={<span className="text-sm font-medium text-gray-900">First name</span>}
            name="firstName"
            rules={[{ required: true, message: 'Please enter your first name' }]}
          >
            <Input style={{ height: 32 }} className="!border-gray-200 !text-sm" placeholder="Enter first name" />
          </Form.Item>

          <Form.Item
            className="!mb-0 font-medium border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
            label={<span className="text-sm font-medium text-gray-900">Last name</span>}
            name="lastName"
            rules={[{ required: true, message: 'Please enter your last name' }]}
          >
            <Input style={{ height: 32 }} className="!border-gray-200 !text-sm" placeholder="Enter last name" />
          </Form.Item>
        </div>

        <Form.Item
          className="font-medium !mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
          label={<span className="text-sm font-medium text-gray-900">Email</span>}
          name="email"
        >
          <Input style={{ height: 32 }} className="!border-gray-200 !text-sm" placeholder="Enter email address" disabled />
        </Form.Item>

        <Form.Item
          className="font-medium !mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
          label={<span className="text-sm font-medium text-gray-900">Phone number</span>}
          name="phone"
        >
          <Input style={{ height: 32 }} className="!border-gray-200 !text-sm" placeholder="Enter phone number" />
        </Form.Item>

        <Form.Item
          className="!mb-0 border-b border-gray-100 !pb-3 !pt-5 [&_.ant-form-item-control]:!max-w-none [&_.ant-form-item-control]:!w-full [&_.ant-form-item-control]:!flex-none [&_.ant-form-item-label]:!flex-none [&_.ant-form-item-row]:!flex-col [&_.ant-form-item-row]:!items-stretch"
          label={(
            <div className="pb-2 text-left">
              <div className="text-sm font-medium text-gray-900">Bio</div>
              <div className="mt-1 text-sm font-medium text-gray-500 pb-6">A short introduction shown on your profile.</div>
            </div>
          )}
          name="bio"
        >
          <TextArea
            placeholder="Tell us about yourself"
            rows={3}
            className="!h-24 !w-full !resize-none !border-gray-200 !text-sm !font-normal !text-gray-700"
          />
        </Form.Item>

        <div className="mt-4 flex justify-end gap-2">
          <Button className="!h-8 !px-4 !text-xs font-medium!" disabled={loading} type="primary" htmlType="submit">
            Save Changes
          </Button>
        </div>
      </Form>
    </div>
  );
}

// Security Tab Component
function SecurityTab({ onSave }: { onSave: (values: SecurityFormValues) => Promise<void> }) {
  const [form] = Form.useForm();

  const handleSubmit = async (values: SecurityFormValues) => {
    try {
      await onSave(values);
      // Only reset form if save was successful (no error thrown)
      form.resetFields();
    } catch {
      // Error is already handled in onSave, form stays unchanged
    }
  };

  return (
    <div>
      <h2 className="mb-8 !text-[15px] !font-semibold text-gray-950">Security</h2>

      <Form
        className="[&_.ant-form-item-explain]:hidden"
        form={form}
        layout="horizontal"
        labelAlign="left"
        colon={false}
        labelCol={{ flex: 'auto' }}
        wrapperCol={{ flex: '0 0 320px' }}
        onFinish={handleSubmit}
        onFinishFailed={({ errorFields }) => notificationProvider.open({
          type: 'error',
          message: errorFields[0]?.errors[0] ?? 'Please check your password information',
        })}
      >        
        <Form.Item
          className="!mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
          label={<span className="text-sm font-medium text-gray-900">Current password</span>}
          name="currentPassword"
          rules={[{ required: true, message: 'Please enter your current password' }]}
        >
          <Password style={{ height: 32 }} placeholder="Enter current password" className="!border-gray-200 !py-1 !text-sm !font-normal !text-gray-700" />
        </Form.Item>

        <Form.Item
          className="!mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
          label={<span className="text-sm font-medium text-gray-900">New password</span>}
          name="newPassword"
          rules={[
            { required: true, message: 'Please enter a new password' },
            { min: 8, message: 'Password must be at least 8 characters' },
          ]}
        >
          <Password style={{ height: 32 }} placeholder="Enter new password" className="!border-gray-200 !py-1 !text-sm !font-normal !text-gray-700" />
        </Form.Item>

        <Form.Item
          className="!mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
          label={<span className="text-sm font-medium text-gray-900">Confirm new password</span>}
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Please confirm your new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Password style={{ height: 32 }} placeholder="Confirm new password" className="!border-gray-200 !py-1 !text-sm !font-normal !text-gray-700" />
        </Form.Item>

        <div className="mt-4 flex justify-end gap-2">
          <Button className="!h-8 !px-4 !text-xs !font-medium" type="primary" htmlType="submit">
            Update Password
          </Button>
        </div>
      </Form>
    </div>
  );
}
