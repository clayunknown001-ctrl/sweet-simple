import { Link } from "react-router-dom";
import { Construction, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Placeholder({ title = "Tez orada" }: { title?: string }) {
  return (
    <div className="min-h-screen bg-[#050607] text-[#F4F6F8] flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-12">
        <div className="max-w-lg w-full text-center rounded-2xl border border-[rgba(0,255,170,0.15)] bg-[#0B1015] p-10">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#00E58E]/10 flex items-center justify-center mb-5">
            <Construction className="w-7 h-7 text-[#00E58E]" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-3 text-[#97A2AE]">Ushbu funksiya hozir ishlab chiqilmoqda.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-[#00E58E] hover:underline">
            <ArrowLeft className="w-4 h-4" /> Bosh sahifa
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
