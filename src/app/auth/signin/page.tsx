"use client";

import ButtonAnt from "@/components/ButtonAnt";
import InputAnt from "@/components/InputAnt";
import { Form } from "antd";
import PassAnt from "@/components/PassAnt";
import LogoHeader from "@/components/LogoHeader";
import { CloseOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
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
    // const [googleLoading, setGoogleLoading] = useState(false);

    useEffect(() => {
        const accessToken = searchParams.get('access_token');
        if (accessToken) {
            if (window.opener) {
                window.opener.postMessage({
                    type: 'GOOGLE_LOGIN_SUCCESS',
                    token: accessToken
                }, window.location.origin);
                window.close();
                return;
            }
        }
    }, [searchParams]);

    const handleSignIn = async (values: SignInFormValues) => {
        setLoading(true);
        try {
            const callbackUrl = searchParams.get('callbackUrl') || '/projects';
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

    // const handleGoogleLoginSuccess = async (token: string) => {
    //     try {
    //         setToken(token);
            
    //         const redirectTo = searchParams.get('redirect') || HOME;
    //         router.push(redirectTo);
    //     } catch (error) {
    //         console.error('Google login error:', error);
    //         notificationProvider.open({
    //             type: "error",
    //             message: 'Google login failed. Please try again.',
    //         });
    //     }
    // };

    // const handleLoginWithGoogle = async () => {
    //     setGoogleLoading(true);
    //     try {
    //         const token = await loginWithGoogle();
    //         await handleGoogleLoginSuccess(token);
    //     } catch {
    //         console.error('Google login error');
    //         notificationProvider.open({
    //             type: "error",
    //             message: 'Google login failed. Please try again.',
    //         });
    //     } finally {
    //         setGoogleLoading(false);
    //     }
    // };

    return (
        <div className="h-screen flex flex-col bg-bg-light justify-center items-center px-4 sm:px-0">
            <div className='w-full sm:w-[545px]'>
                <div className="flex justify-between items-center pb-8">
                    <LogoHeader size="large" />
                    <CloseOutlined className="text-lg !text-gray-600 cursor-pointer" onClick={() => router.back()} />
                </div>
                <div className="bg-white border rounded-lg p-6 w-full border-gray-200">
                    <div className="text-2xl font-medium pb-6">Login to your account</div>
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
                            <InputAnt placeholder="name@work-email.com" className="w-full text-sm" />
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
                            <PassAnt type="password" placeholder="password" className="w-full text-sm" />
                        </Form.Item>

                        <Form.Item>
                            <ButtonAnt 
                                type="primary" 
                                htmlType="submit" 
                                className="w-full"
                                loading={loading}
                            >
                                Sign in with Email
                            </ButtonAnt>
                        </Form.Item>

                        <div className="flex items-center gap-4">
                            <div className="flex-1 h-px bg-gray-300" />
                            <div className="text-gray-500 text-sm font-medium">OR</div>
                            <div className="flex-1 h-px bg-gray-300" />
                        </div>

                        <div className="pt-4">
                            <ButtonAnt 
                                type="default" 
                                className="w-full"
                                // onClick={handleLoginWithGoogle}
                                // loading={googleLoading}
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
                        <div className="text-primary-500 hover:underline cursor-pointer">Create an account</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
