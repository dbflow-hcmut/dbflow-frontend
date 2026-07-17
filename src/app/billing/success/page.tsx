import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-lg bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-green-600">Payment received</h1>
        <p className="mt-3 text-gray-600">Your subscription will update after PayOS webhook confirmation.</p>
        <Link className="mt-6 inline-block text-blue-600" href="/projects">Back to DBFlow</Link>
      </div>
    </div>
  );
}
