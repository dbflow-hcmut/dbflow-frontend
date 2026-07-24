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

interface SignInFormValues {
    email: string;
    password: string;
}

export default function SignInPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSignIn = async (values: SignInFormValues) => {
        setLoading(true);
        try {
            const callbackUrl = searchParams.get('callbackUrl') || '/';
            // Call proxy login to set access_token on FE domain
            const beRes = await fetch('/api/auth/login', {
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
            if (!beRes.ok) {
                throw new Error('Login failed');
            }
            const result = await signIn("credentials", {
                email: values.email,
                password: values.password,
                redirect: false,
            });

            if (result?.error) {
                notificationProvider.open({
                    type: "error",
                    message: "Login failed. Please check your information.",
                });
            } else if (result?.ok) {
                router.push(callbackUrl);
                router.refresh();
            }
        } catch (error) {
            console.error('Sign in error:', error);
            notificationProvider.open({
                type: "error",
                message: 'Login failed. Please check your information.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        try {
            const callbackUrl = searchParams.get('callbackUrl') || '/';
            await signIn('google', { callbackUrl });
        } catch (error) {
            console.error('Google login error:', error);
            notificationProvider.open({
                type: "error",
                message: 'Google login failed. Please try again.',
            });
            setGoogleLoading(false);
        }
    };

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f4f4f5] px-4 py-8 sm:px-0">
            <div className='w-full sm:w-[545px]'>
                <div className="flex items-center justify-between px-2 pb-7">
                    <LogoHeader size="large" />
                    <button type="button" aria-label="Back to home" className="grid size-10 cursor-pointer place-items-center rounded-full border-0 bg-white text-gray-500 transition hover:-translate-y-0.5 hover:text-gray-900" onClick={() => router.push('/')}><CloseOutlined /></button>
                </div>
                <div className="w-full rounded-[20px] bg-white p-6 sm:p-7">
                    <div className="pb-6 text-2xl font-medium tracking-[-0.025em]">Login to your account</div>
                    <Form
                        form={form}
                        onFinish={handleSignIn}
                        className="flex flex-col gap-1 pt-6"
                        layout="vertical"
                    >
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

                        <div className="flex justify-between items-center mb-1">
                            <span>Password</span>
                            <span className="text-gray-700 text-sm font-medium cursor-pointer">Forgot your password?</span>
                        </div>
                        <Form.Item
                            name="password"
                            rules={[
                                { required: true, message: "Please enter your password!" },
                                { min: 6, message: "Password must be at least 6 characters!" }
                            ]}
                        >
                            <PassAnt type="password" placeholder="password" className="w-full rounded-xl !border-gray-200 bg-gray-50 text-sm hover:!border-gray-300 focus:!bg-white" />
                        </Form.Item>

                        <Form.Item>
                            <ButtonAnt 
                                type="primary" 
                                htmlType="submit" 
                                className="w-full !rounded-xl !border-0"
                                loading={loading}
                            >
                                Sign in with Email
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
                                onClick={handleGoogleLogin}
                                loading={googleLoading}
                            >
                                <Image src="/icon-google.png" alt="Google" width={24} height={24} />
                                <div>Sign in with Google</div>
                            </ButtonAnt>
                        </div>
                    </Form>
                </div>
                <div className="flex justify-center pt-4">
                    <div className="text-center pt-2 flex gap-1 text-sm">
                        <div>New to DB Flow?</div>
                        <div 
                            className="text-primary-500 hover:underline cursor-pointer"
                            onClick={() => router.push('/auth/signup')}
                        >
                            Create an account
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
