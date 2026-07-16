"use client";

import { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { Form, Input, Skeleton, Avatar, Spin } from 'antd';
import InputAnt from '@/components/InputAnt';
import ButtonAnt from '@/components/ButtonAnt';
import { ShieldCheck, User, Camera } from 'lucide-react';
import { getUserMe, updateUserProfile, changeUserPassword, uploadUserAvatar } from '@/api/users/client';
import { UserResponse } from '@/types/user.type';
import { notificationProvider } from '@/providers/notification';

const { TextArea } = Input;
const { Password } = Input;

type TabType = 'profile' | 'account' | 'notifications' | 'security';

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
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserResponse | null>(null);

  useEffect(() => {
    loadUserData();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header Skeleton */}
          <div className="mb-6 flex flex-col gap-2">
            <Skeleton.Input active className="!w-32 !h-8 mb-2" />
            <Skeleton.Input active className="!w-64 !h-5" />
          </div>

          {/* Layout Container Skeleton */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Skeleton */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="space-y-2">
                <Skeleton.Button active className="!w-full !h-12" />
                <Skeleton.Button active className="!w-full !h-12" />
              </div>
            </div>

            {/* Content Skeleton */}
            <div className="flex-1">
              <div className="space-y-4">
                <Skeleton.Input active className="!w-48 !h-8 mb-4" />
                <Skeleton.Input active className="!w-full !h-5 mb-6" />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <Skeleton.Input active className="!w-24 !h-5 mb-2" />
                    <Skeleton.Input active className="!w-full !h-12" />
                  </div>
                  <div>
                    <Skeleton.Input active className="!w-24 !h-5 mb-2" />
                    <Skeleton.Input active className="!w-full !h-12" />
                  </div>
                </div>

                <div className="mb-4">
                  <Skeleton.Input active className="!w-24 !h-5 mb-2" />
                  <Skeleton.Input active className="!w-full !h-12" />
                </div>

                <div className="mb-4">
                  <Skeleton.Input active className="!w-32 !h-5 mb-2" />
                  <Skeleton.Input active className="!w-full !h-12" />
                </div>

                <div className="mb-4">
                  <Skeleton.Input active className="!w-16 !h-5 mb-2" />
                  <Skeleton active paragraph={{ rows: 3 }} />
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Skeleton.Button active className="!w-20" />
                  <Skeleton.Button active className="!w-28" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>
          <p className="mt-1 text-gray-600 text-sm">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Layout Container */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Tabs - Desktop: Left Column, Mobile: Top */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <div>
              <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible">
                {tabs.map((tab) => (
                  <div key={tab.id} className='border-b lg:border-b lg:last:border-b-0 border-gray-200'>
                    <button
                        onClick={() => setActiveTab(tab.id)}
                        className={classNames(
                        'w-full flex items-center gap-2 px-4 py-3 text-left transition-colors whitespace-nowrap cursor-pointer',
                        'hover:bg-gray-100',
                        activeTab === tab.id
                            ? 'bg-gray-100 text-primary-600 border-l-4 border-l-primary-500 font-medium'
                            : 'text-gray-700 border-l-4 border-l-transparent'
                        )}
                    >
                        <span className="text-sm">{tab.icon}</span>
                        <span className="text-sm">{tab.label}</span>
                    </button>
                  </div>
                ))}
              </nav>
            </div>
          </div>

          {/* Content Area - Desktop: Right Column, Mobile: Bottom */}
          <div className="flex-1">
            <div>
              {activeTab === 'profile' && <ProfileTab userData={userData} onSave={handleSaveProfile} onAvatarChange={handleAvatarChange} />}
              {activeTab === 'security' && <SecurityTab onSave={handleSaveSecurity} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Profile Tab Component
function ProfileTab({
  userData,
  onSave,
  onAvatarChange,
}: {
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
    if (!avatarUploading) fileInputRef.current?.click();
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Information</h2>
      <p className="text-gray-600 mb-6 text-sm">Update your personal information and profile details</p>

      {/* Avatar upload */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="relative cursor-pointer group"
          onClick={handleAvatarClick}
        >
          <Avatar
            src={currentAvatar}
            size={80}
            icon={<User size={40} />}
            className="border-2 border-gray-200"
          />
          <div className={classNames(
            'absolute inset-0 rounded-full flex items-center justify-center bg-black/40 transition-opacity',
            avatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            {avatarUploading
              ? <Spin size="small" />
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
        <div>
          <p className="text-sm font-medium text-gray-700">Profile Photo</p>
          <p className="text-xs text-gray-500">Click to upload · JPG, PNG, WEBP, GIF · Max 5MB</p>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={onSave}
        initialValues={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          bio: '',
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item
            label={<span className="text-gray-700 font-medium">First Name</span>}
            name="firstName"
            rules={[{ required: true, message: 'Please enter your first name' }]}
          >
            <InputAnt placeholder="Enter first name" />
          </Form.Item>

          <Form.Item
            label={<span className="text-gray-700 font-medium">Last Name</span>}
            name="lastName"
            rules={[{ required: true, message: 'Please enter your last name' }]}
          >
            <InputAnt placeholder="Enter last name" />
          </Form.Item>
        </div>

        <Form.Item
          label={<span className="text-gray-700 font-medium">Email</span>}
          name="email"
        >
          <InputAnt placeholder="Enter email address" disabled />
        </Form.Item>

        <Form.Item
          label={<span className="text-gray-700 font-medium">Phone Number</span>}
          name="phone"
        >
          <InputAnt placeholder="Enter phone number" />
        </Form.Item>

        <Form.Item
          label={<span className="text-gray-700 font-medium">Bio</span>}
          name="bio"
        >
          <TextArea
            placeholder="Tell us about yourself"
            rows={4}
            className="!py-3 !font-medium !text-gray-700"
          />
        </Form.Item>

        <div className="flex justify-end gap-3 mt-6">
          <ButtonAnt onClick={() => form.resetFields()}>
            Cancel
          </ButtonAnt>
          <ButtonAnt type="primary" htmlType="submit">
            Save Changes
          </ButtonAnt>
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
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
      <p className="text-gray-600 mb-6 text-sm">Manage your password and security preferences</p>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >        
        <Form.Item
          label={<span className="text-gray-700 font-medium">Current Password</span>}
          name="currentPassword"
          rules={[{ required: true, message: 'Please enter your current password' }]}
        >
          <Password placeholder="Enter current password" className="!py-3 !h-12 !font-medium !text-gray-700" />
        </Form.Item>

        <Form.Item
          label={<span className="text-gray-700 font-medium">New Password</span>}
          name="newPassword"
          rules={[
            { required: true, message: 'Please enter a new password' },
            { min: 8, message: 'Password must be at least 8 characters' }
          ]}
        >
          <Password placeholder="Enter new password" className="!py-3 !h-12 !font-medium !text-gray-700" />
        </Form.Item>

        <Form.Item
          label={<span className="text-gray-700 font-medium">Confirm New Password</span>}
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Please confirm your new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Passwords do not match'));
              },
            }),
          ]}
        >
          <Password placeholder="Confirm new password" className="!py-3 !h-12 !font-medium !text-gray-700" />
        </Form.Item>

        <div className="flex justify-end gap-3 mt-6">
          <ButtonAnt onClick={() => form.resetFields()}>
            Cancel
          </ButtonAnt>
          <ButtonAnt type="primary" htmlType="submit">
            Update Password
          </ButtonAnt>
        </div>
      </Form>
    </div>
  );
}