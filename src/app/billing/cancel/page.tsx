import Link from "next/link";

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-lg bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-gray-900">Payment canceled</h1>
        <Link className="mt-6 inline-block text-blue-600" href="/pricing">Return to pricing</Link>
      </div>
    </div>
  );
}
