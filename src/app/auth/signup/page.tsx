"use client";

import ButtonAnt from "@/components/ButtonAnt";
import InputAnt from "@/components/InputAnt";
import { Form } from "antd";
import PassAnt from "@/components/PassAnt";
import LogoHeader from "@/components/LogoHeader";
import { CloseOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { notificationProvider } from "@/providers/notification";
import { signIn } from "next-auth/react";
import Image from "next/image";

interface SignUpFormValues {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export default function SignUpPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSignUp = async (values: SignUpFormValues) => {
        setLoading(true);
        try {
            // Register through the same-origin Next.js BFF to avoid browser CORS.
            const registerRes = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    fullName: values.fullName,
                    email: values.email,
                    password: values.password,
                }),
            });

            const registerData = await registerRes.json().catch(() => ({}));
            const data = registerData?.data || registerData;

            if (!registerRes.ok || data?.message === 'Email already in use') {
                notificationProvider.open({
                    type: "error",
                    message: data?.message === 'Email already in use'
                        ? 'Email already in use. Please try another email.'
                        : 'Registration failed. Please try again.',
                });
                return;
            }

            // Auto login after registration
            const callbackUrl = searchParams.get('callbackUrl') || '/';
            const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'accept': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    email: values.email,
                    password: values.password,
                }),
            });

            if (!loginRes.ok) {
                notificationProvider.open({
                    type: "success",
                    message: 'Account created! Please sign in.',
                });
                router.push('/auth/signin');
                return;
            }

            const result = await signIn("credentials", {
                email: values.email,
                password: values.password,
                redirect: false,
            });

            if (result?.ok) {
                router.push(callbackUrl);
                router.refresh();
            } else {
                router.push('/auth/signin');
            }
        } catch (error) {
            console.error('Sign up error:', error);
            notificationProvider.open({
                type: "error",
                message: 'Registration failed. Please try again.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setGoogleLoading(true);
        try {
            const callbackUrl = searchParams.get('callbackUrl') || '/';
            await signIn('google', { callbackUrl });
        } catch (error) {
            console.error('Google sign up error:', error);
            notificationProvider.open({
                type: "error",
                message: 'Google sign up failed. Please try again.',
            });
            setGoogleLoading(false);
        }
    };

    return (
        <div className="min-h-dvh w-full overflow-y-auto bg-[#f4f4f5] px-4 py-8 sm:py-10">
            <div className='mx-auto w-full sm:w-[545px]'>
                <div className="flex items-center justify-between px-2 pb-7">
                    <LogoHeader size="large" />
                    <button type="button" aria-label="Back to home" className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white text-gray-500 transition hover:-translate-y-0.5 hover:text-gray-900" onClick={() => router.push('/')}><CloseOutlined /></button>
                </div>
                <div className="w-full rounded-[20px] bg-white p-6 sm:p-7">
                    <div className="pb-6 text-2xl font-medium tracking-[-0.025em]">Create your account</div>
                    <Form
                        form={form}
                        onFinish={handleSignUp}
                        className="flex flex-col gap-1 pt-6"
                        layout="vertical"
                    >
                        <div className="mb-1">Full Name</div>
                        <Form.Item
                            name="fullName"
                            rules={[
                                { required: true, message: "Please enter your name!" },
                            ]}
                        >
                            <InputAnt placeholder="John Doe" className="w-full rounded-xl !border-gray-200 bg-gray-50 text-sm hover:!border-gray-300 focus:!bg-white" />
                        </Form.Item>

                        <div className="mb-1">Email</div>
                        <Form.Item
                            name="email"
                            rules={[
                                { required: true, message: "Please enter your email!" },
                                { type: "email", message: "Please enter a valid email!" }
                            ]}
                        >
                            <InputAnt placeholder="name@work-email.com" className="w-full rounded-xl !border-gray-200 bg-gray-50 text-sm hover:!border-gray-300 focus:!bg-white" />
                        </Form.Item>

                        <div className="mb-1">Password</div>
                        <Form.Item
                            name="password"
                            rules={[
                                { required: true, message: "Please enter your password!" },
                                { min: 6, message: "Password must be at least 6 characters!" }
                            ]}
                        >
                            <PassAnt type="password" placeholder="password" className="w-full rounded-xl !border-gray-200 bg-gray-50 text-sm hover:!border-gray-300 focus:!bg-white" />
                        </Form.Item>

                        <div className="mb-1">Confirm Password</div>
                        <Form.Item
                            name="confirmPassword"
                            dependencies={['password']}
                            rules={[
                                { required: true, message: "Please confirm your password!" },
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        if (!value || getFieldValue('password') === value) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error('Passwords do not match!'));
                                    },
                                }),
                            ]}
                        >
                            <PassAnt type="password" placeholder="confirm password" className="w-full rounded-xl !border-gray-200 bg-gray-50 text-sm hover:!border-gray-300 focus:!bg-white" />
                        </Form.Item>

                        <Form.Item>
                            <ButtonAnt 
                                type="primary" 
                                htmlType="submit" 
                                className="w-full !rounded-xl !border-0"
                                loading={loading}
                            >
                                Sign up with Email
                            </ButtonAnt>
                        </Form.Item>

                        <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-gray-200" />
                            <div className="text-gray-500 text-sm font-medium">OR</div>
                            <div className="h-px flex-1 bg-gray-200" />
                        </div>

                        <div className="pt-4">
                            <ButtonAnt 
                                type="default" 
                                className="w-full !rounded-xl !border-0 !bg-gray-100 !shadow-none hover:!bg-gray-200"
                                onClick={handleGoogleSignUp}
                                loading={googleLoading}
                            >
                                <Image src="/icon-google.png" alt="Google" width={24} height={24} />
                                <div>Sign up with Google</div>
                            </ButtonAnt>
                        </div>
                    </Form>
                </div>
                <div className="flex justify-center pt-4">
                    <div className="text-center pt-2 flex gap-1 text-sm">
                        <div>Already have an account?</div>
                        <div 
                            className="text-primary-500 hover:underline cursor-pointer"
                            onClick={() => router.push('/auth/signin')}
                        >
                            Sign in
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
