import { ArrowLeft, CircleCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FCFCFC]">
      <header className="flex h-14 shrink-0 items-center bg-white px-4">
        <Link href="/ai-chat" prefetch className="flex items-center gap-2">
          <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
          <span className="text-lg font-bold text-primary-500">DB Flow</span>
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
        <div
          aria-hidden="true"
          className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl"
        />

        <section className="relative w-full max-w-xl rounded-[20px] bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CircleCheck className="h-6 w-6" strokeWidth={1.8} />
          </div>

          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            Payment received
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            Thank you! Your payment was received successfully. Your subscription will
            update as soon as PayOS confirms the transaction.
          </p>

          <div className="mt-8 flex justify-end">
            <Link
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-600 sm:w-auto"
              href="/projects"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to projects
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
